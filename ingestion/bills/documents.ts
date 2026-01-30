/**
 * Bill document download and PDF text extraction functions.
 */

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { DocumentInfo } from './types';

/**
 * Download bill document PDFs and extract text in-memory.
 * PDFs are saved locally and text is extracted for embedding generation.
 * No longer uploads to Supabase Storage.
 *
 * @param billNumber - Bill number (e.g., "HB 1366")
 * @param documentsString - Pipe-delimited string of documents (type | url || type | url)
 * @param outputDir - Directory to save PDFs locally
 * @returns Array of document info including extracted text
 */
export async function downloadBillDocuments(
  billNumber: string,
  documentsString: string,
  outputDir: string
): Promise<DocumentInfo[]> {
  if (!documentsString) {
    return [];
  }

  // Parse the documents string
  const documentPairs = documentsString.split(' || ');
  const documentInfo: DocumentInfo[] = [];

  // Create output directory for this bill
  const billDir = path.join(outputDir, billNumber);
  await fs.mkdir(billDir, { recursive: true });

  for (const pair of documentPairs) {
    const parts = pair.split(' | ');
    if (parts.length !== 2) {
      continue;
    }

    const docType = parts[0].trim();
    const docUrl = parts[1].trim();

    // Create safe filename
    const safeDocType = docType.replace(/ /g, '_').replace(/\//g, '_');
    const filename = `${billNumber}_${safeDocType}.pdf`;
    const filepath = path.join(billDir, filename);

    try {
      console.log(`    Downloading ${docType}...`);
      const response = await axios.get(docUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      // Save PDF locally
      const pdfContent = Buffer.from(response.data);
      await fs.writeFile(filepath, pdfContent);
      console.log(`    Saved locally to ${filepath}`);

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
        console.log(`    ✓ Extracted ${extractedText.length} characters of text`);
      } catch (error) {
        console.log(`    Warning: Could not extract text from PDF: ${error}`);
      }

      documentInfo.push({
        type: docType,
        url: docUrl,
        local_path: filepath,
        storage_path: null, // No longer uploading to storage
        extracted_text: extractedText,
      });
    } catch (error) {
      console.log(`    Error downloading ${docType}: ${error}`);
    }
  }

  return documentInfo;
}
