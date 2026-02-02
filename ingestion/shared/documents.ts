/**
 * Bill document download and PDF text extraction functions.
 */

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { DocumentInfo, ScrapedDocument } from './types';

/**
 * Download bill document PDFs and extract text in-memory.
 * PDFs are saved locally and text is extracted for embedding generation.
 * No longer uploads to Supabase Storage.
 *
 * @param billNumber - Bill number (e.g., "HB 1366")
 * @param documents - Array of scraped document references
 * @param outputDir - Directory to save PDFs locally
 * @returns Array of document info including extracted text
 */
export async function downloadBillDocuments(
  billNumber: string,
  documents: ScrapedDocument[],
  outputDir: string
): Promise<DocumentInfo[]> {
  if (!documents || documents.length === 0) {
    console.log(`  [${billNumber}] No documents to download`);
    return [];
  }

  console.log(`  [${billNumber}] Downloading ${documents.length} document(s)...`);
  const documentInfo: DocumentInfo[] = [];

  // Create output directory for this bill
  const billDir = path.join(outputDir, billNumber);
  await fs.mkdir(billDir, { recursive: true });

  for (const doc of documents) {
    const { doc_id, type, title, url } = doc;

    // Use doc_id for filename (it's already unique per document)
    const filename = `${doc_id}.pdf`;
    const filepath = path.join(billDir, filename);

    try {
      console.log(`  [${billNumber}] Downloading ${doc_id} (${type} - ${title})...`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      // Save PDF locally
      const pdfContent = Buffer.from(response.data);
      await fs.writeFile(filepath, pdfContent);

      // Extract text from PDF in-memory
      let extractedText: string | null = null;
      try {
        // Suppress pdf.js font warnings (TT: undefined function, etc.)
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
          const pdfData = await pdfParse(pdfContent);
          extractedText = pdfData.text;
        } finally {
          console.warn = originalWarn;
        }
        console.log(`  [${billNumber}] ✓ ${doc_id}: Extracted ${extractedText.length} chars`);
      } catch (error) {
        console.log(`  [${billNumber}] Warning: Could not extract text from ${doc_id}: ${error}`);
      }

      documentInfo.push({
        doc_id,
        type,
        title,
        url,
        local_path: filepath,
        extracted_text: extractedText,
      });
    } catch (error) {
      console.log(`  [${billNumber}] Error downloading ${doc_id}: ${error}`);
    }
  }

  return documentInfo;
}
