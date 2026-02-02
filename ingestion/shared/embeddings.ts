/**
 * Embedding generation functions for bill documents.
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { Document } from '@langchain/core/documents';
import { DatabaseClient } from '@/database/client';
import { DocumentInfo } from './types';
import {
  cleanLegislativeText,
  chunkDocument,
  countTokens,
  DocumentType,
} from './chunking';

/**
 * Metadata structure for bill embeddings.
 */
interface ChunkMetadata {
  bill_id: string;
  bill_number: string;
  document_id: string;
  content_type: string;
  chunk_index: number;
  doc_type: DocumentType;
  token_count: number;
  session_year: number;
  session_code: string;
  primary_sponsor_id?: string;
  primary_sponsor_name?: string;
  cosponsor_ids?: string[];
  cosponsor_names?: string[];
  committee_ids?: string[];
  committee_names?: string[];
}

/**
 * Filter document info to only include embeddable documents.
 * Returns all Bill Text and Bill Summary documents.
 * Excludes fiscal notes (.ORG files).
 *
 * @param documentInfo - Array of document info from download
 * @returns Filtered array of embeddable documents
 */
export function filterEmbeddableDocuments(documentInfo: DocumentInfo[]): DocumentInfo[] {
  return documentInfo.filter((doc) => {
    const hasText = !!doc.extracted_text;
    const isFiscalNote = doc.url?.includes('.ORG') || doc.doc_id?.includes('.ORG');
    return hasText && !isFiscalNote;
  });
}

/**
 * Process text into embeddings and store them.
 *
 * @param vectorStore - Supabase vector store
 * @param billId - Bill UUID
 * @param documentId - Document ID from Missouri House website
 * @param rawText - Raw extracted text
 * @param contentType - Document title (e.g., "Introduced")
 * @param billMetadata - Bill metadata for embedding context
 * @returns Number of embeddings created
 */
async function processDocumentText(
  vectorStore: SupabaseVectorStore,
  billId: string,
  documentId: string,
  rawText: string,
  contentType: string,
  billMetadata: {
    bill_number: string;
    session_year: number;
    session_code: string;
    primary_sponsor: { id: string; name: string } | null;
    cosponsors: Array<{ id: string; name: string }>;
    committees: Array<{ id: string; name: string }>;
  }
): Promise<number> {
  // Clean text
  const cleanText = cleanLegislativeText(rawText);
  console.log(`      Tokens: ${countTokens(cleanText)}`);

  // Chunk document
  const { chunks, documentType } = chunkDocument(cleanText);
  console.log(`      Document type: ${documentType}`);
  console.log(`      Chunks: ${chunks.length}`);

  // Create LangChain Documents with metadata
  const documents: Document[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Build metadata
    const metadata: ChunkMetadata = {
      bill_id: billId,
      bill_number: billMetadata.bill_number,
      document_id: documentId,
      content_type: contentType,
      chunk_index: i,
      doc_type: documentType,
      token_count: countTokens(chunk),
      session_year: billMetadata.session_year,
      session_code: billMetadata.session_code,
    };

    // Add primary sponsor
    if (billMetadata.primary_sponsor) {
      metadata.primary_sponsor_id = billMetadata.primary_sponsor.id;
      metadata.primary_sponsor_name = billMetadata.primary_sponsor.name;
    }

    // Add co-sponsors
    if (billMetadata.cosponsors.length > 0) {
      metadata.cosponsor_ids = billMetadata.cosponsors.map((cs) => cs.id);
      metadata.cosponsor_names = billMetadata.cosponsors.map((cs) => cs.name);
    }

    // Add committees
    if (billMetadata.committees.length > 0) {
      metadata.committee_ids = billMetadata.committees.map((c) => c.id);
      metadata.committee_names = billMetadata.committees.map((c) => c.name);
    }

    documents.push(new Document({ pageContent: chunk, metadata }));
  }

  // Store embeddings
  console.log(`      Storing ${documents.length} embedding(s)...`);
  await vectorStore.addDocuments(documents);
  console.log(`      ✓ Created ${documents.length} embeddings`);

  return documents.length;
}

/**
 * Generate embeddings for embeddable documents that have extracted text.
 * This is called after the bill is inserted to the database.
 *
 * @param db - Database client
 * @param billId - Bill UUID
 * @param documentInfo - Array of document info with extracted text
 * @returns Total number of embeddings created
 */
export async function generateEmbeddingsForBill(
  db: DatabaseClient,
  billId: string,
  documentInfo: DocumentInfo[]
): Promise<number> {
  // Get bill metadata for embeddings
  const billMetadata = await db.getBillMetadataForEmbeddings(billId);
  if (!billMetadata) {
    console.log(`    Could not fetch metadata for bill ${billId}`);
    return 0;
  }

  // Filter to embeddable documents (Introduced + most recent, excluding fiscal notes)
  const embeddableDocs = filterEmbeddableDocuments(documentInfo);
  if (embeddableDocs.length === 0) {
    console.log(`    No embeddable documents with extracted text`);
    return 0;
  }

  // Initialize embeddings and vector store
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    openAIApiKey: apiKey,
  });

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: db.client,
    tableName: 'bill_embeddings',
    queryName: 'match_bill_embeddings',
  });

  let totalEmbeddings = 0;

  for (const doc of embeddableDocs) {
    if (!doc.extracted_text) {
      continue;
    }

    console.log(`    Generating embeddings for ${doc.title} (${doc.type})...`);
    try {
      const count = await processDocumentText(
        vectorStore,
        billId,
        doc.doc_id,
        doc.extracted_text,
        doc.title,
        billMetadata
      );
      totalEmbeddings += count;

      // Mark document as having embeddings generated
      await db.markDocumentEmbeddingsGenerated(billId, doc.doc_id);
    } catch (error) {
      console.log(`    Warning: Could not generate embeddings for ${doc.title}: ${error}`);
    }
  }

  return totalEmbeddings;
}
