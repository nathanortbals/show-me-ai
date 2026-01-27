/**
 * Embeddings pipeline for bill documents using LangChain SDK.
 *
 * Extracts text from PDFs, chunks them, generates embeddings, and stores in Supabase.
 */

import * as fs from "fs";
import { Buffer } from "buffer";
import pdfParse from "pdf-parse";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { Document } from "@langchain/core/documents";
import { DatabaseClient } from '@/database/client';
import {
  cleanLegislativeText,
  chunkDocument,
  countTokens,
  DocumentType,
} from "./chunking";

/**
 * Metadata structure for bill embeddings.
 */
export interface ChunkMetadata {
  bill_id: string;
  bill_number: string;
  document_id?: string;
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
 * Options for configuring the embeddings pipeline.
 */
export interface PipelineOptions {
  openaiApiKey?: string;
  embeddingModel?: string;
  targetTokens?: number;
  overlapTokens?: number;
}

/**
 * Result from processing a single document.
 */
export interface ProcessDocumentResult {
  embeddingsCreated: number;
  error?: string;
}

/**
 * Result from processing a session.
 */
export interface ProcessSessionResult {
  billsProcessed: number;
  totalEmbeddings: number;
}

/**
 * Pipeline for processing bill documents into embeddings using LangChain.
 */
export class EmbeddingsPipeline {
  private db: DatabaseClient;
  private embeddings: OpenAIEmbeddings;
  private vectorStore: SupabaseVectorStore;
  private targetTokens: number;
  private overlapTokens: number;

  /**
   * Initialize the embeddings pipeline.
   *
   * @param db - Database instance (defaults to new instance)
   * @param options - Pipeline configuration options
   */
  constructor(db?: DatabaseClient, options: PipelineOptions = {}) {
    this.db = db || new DatabaseClient();
    this.targetTokens = options.targetTokens || 800;
    this.overlapTokens = options.overlapTokens || 100;

    // Get OpenAI API key
    const apiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI API key not found. Set OPENAI_API_KEY environment variable or pass as argument."
      );
    }

    // Initialize LangChain embeddings
    this.embeddings = new OpenAIEmbeddings({
      model: options.embeddingModel || "text-embedding-3-small",
      openAIApiKey: apiKey,
    });

    // Initialize Supabase vector store
    this.vectorStore = new SupabaseVectorStore(this.embeddings, {
      client: this.db.client,
      tableName: "bill_embeddings",
      queryName: "match_bill_embeddings",
    });
  }

  /**
   * Extract all text from a PDF file.
   *
   * @param pdfPath - Path to the PDF file
   * @returns Extracted text
   */
  async extractTextFromPdf(pdfPath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  /**
   * Extract text from a PDF in Supabase Storage.
   *
   * @param storagePath - Path within the storage bucket
   * @param bucket - Storage bucket name
   * @returns Extracted text
   */
  async extractTextFromStorage(
    storagePath: string,
    bucket: string = "bill-pdfs"
  ): Promise<string> {
    try {
      // Download PDF from storage
      const blob = await this.db.downloadFromStorage(storagePath, bucket);

      // Convert Blob to Buffer
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract text using pdf-parse
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Failed to extract text from ${storagePath}: ${error}`);
    }
  }

  /**
   * Process a single document: extract, chunk, embed, and store.
   *
   * @param billId - Bill UUID
   * @param documentId - Document UUID (if this is from bill_documents table)
   * @param storagePath - Path to PDF in Supabase Storage
   * @param contentType - Type of content (e.g., "Introduced", "Committee", "Summary")
   * @param billMetadata - Dictionary with bill metadata (session, sponsors, committees)
   * @returns Number of embeddings created
   */
  async processDocument(
    billId: string,
    documentId: string | undefined,
    storagePath: string,
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
    console.log(`  Processing: ${storagePath}`);

    try {
      // Extract text from storage
      let rawText: string;
      try {
        rawText = await this.extractTextFromStorage(storagePath);
      } catch (error) {
        console.log(`    Error extracting text: ${error}`);
        return 0;
      }

      // Clean text
      const cleanText = cleanLegislativeText(rawText);
      console.log(`    Tokens: ${countTokens(cleanText)}`);

      // Chunk document
      const { chunks, documentType } = chunkDocument(cleanText, {
        targetTokens: this.targetTokens,
        overlapTokens: this.overlapTokens,
      });
      console.log(`    Document type: ${documentType}`);
      console.log(`    Chunks: ${chunks.length}`);

      // Create LangChain Documents with metadata
      const documents: Document[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Build metadata dictionary
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

        // Add co-sponsors (as lists)
        if (billMetadata.cosponsors.length > 0) {
          metadata.cosponsor_ids = billMetadata.cosponsors.map((cs) => cs.id);
          metadata.cosponsor_names = billMetadata.cosponsors.map((cs) => cs.name);
        }

        // Add committees (as lists)
        if (billMetadata.committees.length > 0) {
          metadata.committee_ids = billMetadata.committees.map((c) => c.id);
          metadata.committee_names = billMetadata.committees.map((c) => c.name);
        }

        const doc = new Document({
          pageContent: chunk,
          metadata: metadata,
        });
        documents.push(doc);
      }

      // Store embeddings using LangChain vector store
      console.log(`    Storing ${documents.length} embedding(s) to database...`);
      try {
        await this.vectorStore.addDocuments(documents);
        console.log(`    ✓ Created ${documents.length} embeddings`);
        return documents.length;
      } catch (error) {
        console.error(`    Error storing embeddings:`, error);
        return 0;
      }
    } catch (error) {
      console.error(`    Unexpected error processing document: ${error}`);
      return 0;
    }
  }

  /**
   * Process embeddable documents for a bill.
   *
   * Only processes "Introduced" and the most recent version (if different).
   * Automatically excludes fiscal notes.
   *
   * @param billId - Bill UUID
   * @returns Total number of embeddings created
   */
  async processBill(billId: string): Promise<number> {
    // Get bill metadata (session, sponsors, committees)
    const billMetadata = await this.db.getBillMetadataForEmbeddings(billId);
    if (!billMetadata) {
      console.log(`  Could not fetch metadata for bill ${billId}`);
      return 0;
    }

    // Get embeddable documents for this bill (Introduced + most recent, excluding fiscal notes)
    const documents = await this.db.getEmbeddableBillDocuments(billId);

    if (!documents || documents.length === 0) {
      console.log(`  No embeddable documents found for bill ${billId}`);
      return 0;
    }

    let totalEmbeddings = 0;

    for (const doc of documents) {
      if (!doc.storage_path) {
        console.log(`  Skipping document ${doc.id} - no storage path`);
        continue;
      }

      try {
        const embeddings = await this.processDocument(
          billId,
          doc.id,
          doc.storage_path,
          doc.document_type,
          billMetadata
        );
        totalEmbeddings += embeddings;
      } catch (error) {
        console.error(`  ❌ Error processing document ${doc.storage_path}:`, error);
        console.log('  Continuing with next document...');
        // Continue with next document
      }
    }

    // Mark bill as having embeddings generated if successful
    if (totalEmbeddings > 0) {
      await this.db.markBillEmbeddingsGenerated(billId);
    }

    return totalEmbeddings;
  }

  /**
   * Process all bills in a session.
   *
   * @param sessionId - Session UUID
   * @param limit - Optional limit on number of bills to process
   * @param skipEmbedded - If true, skip bills that already have embeddings
   * @returns Object with bills_processed and total_embeddings_created
   */
  async processSession(
    sessionId: string,
    limit?: number,
    skipEmbedded: boolean = false
  ): Promise<ProcessSessionResult> {
    // Get all bills for session
    const bills = await this.db.getBillsForSession(
      sessionId,
      limit,
      skipEmbedded
    );

    if (!bills || bills.length === 0) {
      console.log("No bills found for session");
      return { billsProcessed: 0, totalEmbeddings: 0 };
    }

    let billsProcessed = 0;
    let totalEmbeddings = 0;

    for (const bill of bills) {
      console.log(`\nProcessing bill ${bill.bill_number} (${bill.id})...`);
      try {
        const embeddings = await this.processBill(bill.id);
        if (embeddings > 0) {
          billsProcessed += 1;
          totalEmbeddings += embeddings;
        }
      } catch (error) {
        console.error(`  ❌ Error processing bill ${bill.bill_number}:`, error);
        console.log('  Continuing with next bill...');
        // Continue to next bill instead of crashing
      }
    }

    return { billsProcessed, totalEmbeddings };
  }
}

/**
 * Create a new embeddings pipeline instance.
 *
 * @param db - Optional database instance
 * @param options - Optional pipeline configuration
 * @returns New EmbeddingsPipeline instance
 */
export function createPipeline(
  db?: DatabaseClient,
  options?: PipelineOptions
): EmbeddingsPipeline {
  return new EmbeddingsPipeline(db, options);
}

/**
 * Process a single bill by ID.
 *
 * @param billId - Bill UUID
 * @param options - Optional pipeline configuration
 * @returns Number of embeddings created
 */
export async function processBill(
  billId: string,
  options?: PipelineOptions
): Promise<number> {
  const pipeline = createPipeline(undefined, options);
  return pipeline.processBill(billId);
}

/**
 * Process all bills in a session.
 *
 * @param sessionId - Session UUID
 * @param limit - Optional limit on number of bills
 * @param skipEmbedded - Skip bills that already have embeddings
 * @param options - Optional pipeline configuration
 * @returns Processing results
 */
export async function processSession(
  sessionId: string,
  limit?: number,
  skipEmbedded?: boolean,
  options?: PipelineOptions
): Promise<ProcessSessionResult> {
  const pipeline = createPipeline(undefined, options);
  return pipeline.processSession(sessionId, limit, skipEmbedded);
}
