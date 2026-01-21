/**
 * Text chunking strategies for legislative documents and bill summaries.
 */

import { encodingForModel, TiktokenModel } from "js-tiktoken";

/**
 * Options for chunking text.
 */
export interface ChunkingOptions {
  targetTokens?: number;
  overlapTokens?: number;
  model?: TiktokenModel;
}

/**
 * Default chunking options.
 */
export const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  targetTokens: 800,
  overlapTokens: 100,
  model: "text-embedding-3-small",
};

/**
 * Document type returned by chunk_document.
 */
export type DocumentType = "legislative_text" | "summary";

/**
 * Result from chunk_document function.
 */
export interface ChunkDocumentResult {
  chunks: string[];
  documentType: DocumentType;
}

/**
 * Count tokens using tiktoken.
 * Note: Unlike Python's tiktoken, js-tiktoken uses automatic garbage collection
 * so there's no need to manually free encodings.
 *
 * @param text Text to count tokens for
 * @param model Model name for encoding
 * @returns Number of tokens
 */
export function countTokens(
  text: string,
  model: TiktokenModel = "text-embedding-3-small"
): number {
  const encoding = encodingForModel(model);
  return encoding.encode(text).length;
}

/**
 * Clean legislative document formatting artifacts.
 *
 * Removes:
 * - Null bytes (Unicode \u0000 characters that break PostgreSQL)
 * - Line numbers at the start of lines (e.g., "2 ", "3 ", "10 ")
 * - Page headers (e.g., "SCS HCS HBs 1366 & 1878 2")
 * - Hyphenated line breaks (e.g., "pharma-\ncist" → "pharmacist")
 * - Excessive whitespace
 *
 * @param text Text to clean
 * @returns Cleaned text
 */
export function cleanLegislativeText(text: string): string {
  // Remove null bytes (causes PostgreSQL errors)
  text = text.replace(/\x00/g, "");

  // Fix hyphenated words split across lines
  text = text.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2");

  // Remove page headers
  // Pattern: bill type codes followed by bill numbers and page number
  text = text.replace(
    /^[A-Z]{2,}\s+(?:[A-Z]{2,}\s+)*(?:HBs?|SBs?)\s+[\d\s&]+\s+\d+\s*$/gm,
    ""
  );

  // Remove line numbers at start of lines
  text = text.replace(/^\s*\d+\s+/gm, "");

  // Normalize whitespace (multiple spaces to single space)
  text = text.replace(/ +/g, " ");

  // Remove excessive newlines (more than 2 consecutive)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Chunk by sentences, respecting semantic boundaries.
 *
 * @param text Text to chunk
 * @param options Chunking options
 * @returns Array of text chunks
 */
export function chunkBySentences(
  text: string,
  options: ChunkingOptions = {}
): string[] {
  const { targetTokens, overlapTokens, model } = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options,
  };

  // Split into sentences
  const sentences = text.split(/(?<=[.!?])\s+/);

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence, model);

    // If adding this sentence would exceed target, start new chunk
    if (currentTokens + sentenceTokens > targetTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));

      // Keep last few sentences for overlap
      const overlapSentences: string[] = [];
      let overlapCount = 0;

      // Work backwards to get overlap
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const s = currentChunk[i];
        const sTokens = countTokens(s, model);
        if (overlapCount + sTokens <= overlapTokens) {
          overlapSentences.unshift(s);
          overlapCount += sTokens;
        } else {
          break;
        }
      }

      currentChunk = overlapSentences;
      currentTokens = overlapCount;
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

/**
 * Chunk by major legislative sections, keeping subsections together.
 *
 * Splits on patterns like:
 * - "Section A."
 * - "338.056. 1." (statute numbers)
 *
 * Does NOT split on subsections like "1.", "2.", "8." within sections.
 *
 * @param text Text to chunk
 * @param options Chunking options
 * @returns Array of text chunks
 */
export function chunkBySections(
  text: string,
  options: ChunkingOptions = {}
): string[] {
  const { targetTokens, model } = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options,
  };

  // Match major section boundaries
  const sectionPattern = /(?:Section\s+[A-Z\d]+\.|(?:^|\n)(?:\d{3}\.\d{3}\.\s+1\.))/gm;

  // Find all section boundaries
  const matches = Array.from(text.matchAll(sectionPattern));

  if (matches.length === 0) {
    // No sections found, return whole text
    return [text];
  }

  const sections: string[] = [];

  // Extract text from start to first section
  if (matches[0].index !== undefined && matches[0].index > 0) {
    sections.push(text.slice(0, matches[0].index));
  }

  // Extract each section (from section marker to next section marker)
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    sections.push(text.slice(start, end));
  }

  // Combine sections into chunks respecting target size
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const section of sections) {
    if (!section.trim()) {
      continue;
    }

    const sectionTokens = countTokens(section, model);

    // If section is too large, return it as its own chunk (allow 20% overage)
    if (sectionTokens > targetTokens * 1.2) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
        currentTokens = 0;
      }
      chunks.push(section);
    }
    // If adding this section would exceed target, start new chunk
    else if (currentTokens + sectionTokens > targetTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [section];
      currentTokens = sectionTokens;
    } else {
      currentChunk.push(section);
      currentTokens += sectionTokens;
    }
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

/**
 * Auto-detect document type and apply appropriate chunking strategy.
 *
 * @param text Cleaned text to chunk
 * @param options Chunking options
 * @returns Object with chunks and document type
 */
export function chunkDocument(
  text: string,
  options: ChunkingOptions = {}
): ChunkDocumentResult {
  const { targetTokens, overlapTokens, model } = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options,
  };

  // Detect if it's legislative text (has Section markers or statute sections)
  const hasSections = /(?:Section\s+[A-Z\d]+\.|(?:\d{3}\.\d{3}\.\s+1\.))/m.test(text);

  if (hasSections) {
    // Legislative text - use section-based chunking
    return {
      chunks: chunkBySections(text, { targetTokens, model }),
      documentType: "legislative_text",
    };
  } else {
    // Bill summary - check size
    const tokenCount = countTokens(text, model);
    if (tokenCount <= targetTokens) {
      // Keep short summaries as single chunk
      return {
        chunks: [text],
        documentType: "summary",
      };
    } else {
      // Long summary - use sentence-based chunking
      return {
        chunks: chunkBySentences(text, { targetTokens, overlapTokens, model }),
        documentType: "summary",
      };
    }
  }
}
