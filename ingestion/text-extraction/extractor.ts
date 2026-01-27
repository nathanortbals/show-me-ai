/**
 * Text extraction module for bill documents
 *
 * Extracts full text from PDF documents and stores in bill_documents table
 * with line numbers preserved for UI reference.
 */

import pdfParse from 'pdf-parse';
import { DatabaseClient } from '@/database/client';

export interface TextExtractionResult {
  documentsProcessed: number;
  documentsSucceeded: number;
  documentsFailed: number;
}

interface DocumentWithBill {
  id: string;
  storage_path: string | null;
  document_type: string;
  bills: {
    bill_number: string;
    session_id: string;
  } | null;
}

export class TextExtractor {
  private db: DatabaseClient;

  constructor(db?: DatabaseClient) {
    this.db = db || new DatabaseClient();
  }

  /**
   * Extract text from PDF in storage
   */
  async extractTextFromPDF(storagePath: string): Promise<string> {
    try {
      // Download PDF from storage
      const blob = await this.db.downloadFromStorage(storagePath, 'bill-pdfs');

      // Convert Blob to Buffer
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract text using pdf-parse
      const data = await pdfParse(buffer);

      // Return raw text (pdf-parse preserves line breaks)
      return data.text;
    } catch (error) {
      throw new Error(`Failed to extract text from ${storagePath}: ${error}`);
    }
  }

  /**
   * Process a single document: extract text and update database
   */
  async processDocument(documentId: string, storagePath: string): Promise<boolean> {
    try {
      console.log(`  Processing: ${storagePath}`);

      // Extract text
      const extractedText = await this.extractTextFromPDF(storagePath);

      if (!extractedText || extractedText.trim().length === 0) {
        console.log(`    ⚠️  No text extracted`);
        return false;
      }

      console.log(`    ✓ Extracted ${extractedText.length} characters`);
      console.log(`    ✓ ${extractedText.split('\n').length} lines`);

      // Update database with extracted text
      const { error } = await this.db['_client']
        .from('bill_documents')
        .update({
          extracted_text: extractedText,
          text_extracted_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) {
        throw error;
      }

      console.log(`    ✓ Saved to database`);
      return true;
    } catch (error) {
      console.error(`    ❌ Error:`, error);
      return false;
    }
  }

  /**
   * Extract text for all documents in a session
   */
  async processSession(
    sessionId: string,
    skipExtracted: boolean = true
  ): Promise<TextExtractionResult> {
    console.log(`\nFetching documents for session ${sessionId}...`);

    // Build query
    let query = this.db['_client']
      .from('bill_documents')
      .select(`
        id,
        storage_path,
        document_type,
        bills!inner(
          bill_number,
          session_id
        )
      `)
      .eq('bills.session_id', sessionId)
      .not('storage_path', 'is', null);

    // Skip already extracted documents if requested
    if (skipExtracted) {
      query = query.is('text_extracted_at', null);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    // Type assertion for nested query result
    const documents = data as unknown as DocumentWithBill[];

    if (!documents || documents.length === 0) {
      console.log('No documents found for extraction');
      return { documentsProcessed: 0, documentsSucceeded: 0, documentsFailed: 0 };
    }

    console.log(`Found ${documents.length} documents to process\n`);

    const result: TextExtractionResult = {
      documentsProcessed: 0,
      documentsSucceeded: 0,
      documentsFailed: 0,
    };

    for (const doc of documents) {
      const billNumber = doc.bills?.bill_number || 'Unknown';
      console.log(`\nDocument ${result.documentsProcessed + 1}/${documents.length}`);
      console.log(`Bill: ${billNumber} - ${doc.document_type}`);

      result.documentsProcessed++;

      try {
        const success = await this.processDocument(doc.id, doc.storage_path!);
        if (success) {
          result.documentsSucceeded++;
        } else {
          result.documentsFailed++;
        }
      } catch (error) {
        console.error(`  ❌ Fatal error processing document:`, error);
        result.documentsFailed++;
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return result;
  }

  /**
   * Extract text for a specific bill's documents
   */
  async processBill(billId: string): Promise<TextExtractionResult> {
    console.log(`\nFetching documents for bill ${billId}...`);

    const { data: documents, error } = await this.db['_client']
      .from('bill_documents')
      .select('id, storage_path, document_type')
      .eq('bill_id', billId)
      .not('storage_path', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('No documents found for extraction');
      return { documentsProcessed: 0, documentsSucceeded: 0, documentsFailed: 0 };
    }

    console.log(`Found ${documents.length} documents to process\n`);

    const result: TextExtractionResult = {
      documentsProcessed: 0,
      documentsSucceeded: 0,
      documentsFailed: 0,
    };

    for (const doc of documents) {
      console.log(`\nProcessing ${doc.document_type}...`);
      result.documentsProcessed++;

      try {
        const success = await this.processDocument(doc.id, doc.storage_path!);
        if (success) {
          result.documentsSucceeded++;
        } else {
          result.documentsFailed++;
        }
      } catch (error) {
        console.error(`  ❌ Fatal error processing document:`, error);
        result.documentsFailed++;
      }
    }

    return result;
  }
}

/**
 * Export function for CLI
 */
export async function extractTextForSession(
  sessionId: string,
  skipExtracted: boolean = true
): Promise<TextExtractionResult> {
  const extractor = new TextExtractor();
  return await extractor.processSession(sessionId, skipExtracted);
}

/**
 * Export function for CLI
 */
export async function extractTextForBill(
  billId: string
): Promise<TextExtractionResult> {
  const extractor = new TextExtractor();
  return await extractor.processBill(billId);
}
