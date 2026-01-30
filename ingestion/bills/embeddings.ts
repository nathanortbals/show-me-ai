/**
 * Embedding generation functions for bill documents.
 */

import { DatabaseClient } from '@/database/client';
import { EmbeddingsPipeline } from '@/ingestion/embeddings/pipeline';
import { DocumentInfo } from './types';

/**
 * Filter document info to only include embeddable documents.
 * Returns "Introduced" version and the most recent version (if different).
 * Excludes fiscal notes (.ORG files).
 *
 * @param documentInfo - Array of document info from download
 * @returns Filtered array of embeddable documents
 */
export function filterEmbeddableDocuments(documentInfo: DocumentInfo[]): DocumentInfo[] {
  // Filter out fiscal notes and documents without extracted text
  const legislativeDocs = documentInfo.filter((doc) => {
    const hasText = !!doc.extracted_text;
    const isFiscalNote = doc.url?.includes('.ORG') || doc.type?.toLowerCase().includes('fiscal');
    return hasText && !isFiscalNote;
  });

  if (legislativeDocs.length === 0) {
    return [];
  }

  // Document type hierarchy for determining most recent
  const hierarchy = [
    'truly agreed',
    'truly_agreed',
    'senate_comm_sub',
    'senate comm sub',
    'senate committee substitute',
    'perfected',
    'committee',
    'introduced',
  ];

  // Find introduced version
  let introduced: DocumentInfo | null = null;
  for (const doc of legislativeDocs) {
    const docTypeLower = (doc.type || '').toLowerCase();
    if (docTypeLower.includes('introduced')) {
      introduced = doc;
      break;
    }
  }

  // Find most recent version based on hierarchy
  let mostRecent: DocumentInfo | null = null;
  for (const priorityType of hierarchy) {
    for (const doc of legislativeDocs) {
      const docTypeLower = (doc.type || '').toLowerCase().replace(/ /g, '_');
      if (docTypeLower.includes(priorityType)) {
        mostRecent = doc;
        break;
      }
    }
    if (mostRecent) {
      break;
    }
  }

  // Return introduced + most recent (deduplicated)
  const result: DocumentInfo[] = [];
  if (introduced) {
    result.push(introduced);
  }
  if (mostRecent && mostRecent !== introduced) {
    result.push(mostRecent);
  }

  // If we didn't find either, return the first legislative doc
  if (result.length === 0 && legislativeDocs.length > 0) {
    result.push(legislativeDocs[0]);
  }

  return result;
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

  // Create embeddings pipeline
  const pipeline = new EmbeddingsPipeline(db);

  let totalEmbeddings = 0;

  for (const doc of embeddableDocs) {
    if (!doc.extracted_text) {
      continue;
    }

    console.log(`    Generating embeddings for ${doc.type}...`);
    try {
      const embeddings = await pipeline.processDocumentFromText(
        billId,
        undefined, // documentId not available until after insert
        doc.extracted_text,
        doc.type,
        billMetadata
      );
      totalEmbeddings += embeddings;
    } catch (error) {
      console.log(`    Warning: Could not generate embeddings for ${doc.type}: ${error}`);
    }
  }

  // Mark bill as having embeddings generated
  if (totalEmbeddings > 0) {
    await db.markBillEmbeddingsGenerated(billId);
  }

  return totalEmbeddings;
}
