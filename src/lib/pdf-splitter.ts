/**
 * Splits a PDF buffer into multiple sub-PDF buffers, cutting BETWEEN questions.
 *
 * Strategy:
 * 1. Load PDF with pdf-lib to get the real page count.
 * 2. Extract text per page using pdf-parse (pagerender callback) to detect
 *    question-start pages.
 * 3. Group pages into chunks of at most MAX_PAGES_PER_CHUNK.
 * 4. Never cut in the middle of a question — if the next page after a chunk
 *    boundary is NOT a question start, extend the chunk until a question
 *    boundary is found (up to 3 extra pages as a safety limit).
 * 5. Extract each page group as a sub-PDF using pdf-lib.
 *
 * Fast path: if the PDF has ≤ maxPagesPerChunk pages the original buffer is
 * returned as a single chunk — no sub-PDF extraction is needed.
 *
 * @param pdfBuffer       - Raw PDF bytes.
 * @param maxPagesPerChunk - Maximum pages per sub-PDF (default: 8).
 * @returns Array of PdfChunk objects (always at least 1 element).
 */

import { PDFDocument } from 'pdf-lib';

const MAX_PAGES_PER_CHUNK = 8;

/**
 * Maximum number of extra pages that can be appended to a chunk to align
 * the cut with a question boundary when question patterns are detected.
 */
const MAX_PAGE_EXTENSION = 3;

/** Patterns that mark the beginning of an ICFES-style question. */
const QUESTION_START_PATTERNS = [
  /^\s*\d+\.\s/m,          // "1. ", "2. "
  /^\s*\d+\)\s/m,          // "1) ", "2) "
  /^\s*Pregunta\s+\d+/im,  // "Pregunta 1"
  /^\s*SITUACIÓN\s+\d+/im, // "SITUACIÓN 1"
  /^\s*Situación\s+\d+/im, // "Situación 1"
];

function pageHasQuestionStart(pageText: string): boolean {
  return QUESTION_START_PATTERNS.some((re) => re.test(pageText));
}

export interface PdfChunk {
  buffer: Buffer;
  pageStart: number;   // 1-based
  pageEnd: number;     // 1-based, inclusive
  chunkIndex: number;  // 1-based
  totalChunks: number;
}

export async function splitPdfIntoChunks(
  pdfBuffer: Buffer,
  maxPagesPerChunk = MAX_PAGES_PER_CHUNK,
): Promise<PdfChunk[]> {
  // Step 1: Load PDF with pdf-lib to get page count.
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBuffer);
  } catch {
    // If pdf-lib cannot parse the buffer, return it as a single chunk.
    return [{ buffer: pdfBuffer, pageStart: 1, pageEnd: 1, chunkIndex: 1, totalChunks: 1 }];
  }

  const totalPages = pdfDoc.getPageCount();

  // Fast path: the whole PDF fits in one chunk.
  if (totalPages <= maxPagesPerChunk) {
    return [{
      buffer: pdfBuffer,
      pageStart: 1,
      pageEnd: totalPages,
      chunkIndex: 1,
      totalChunks: 1,
    }];
  }

  // Step 2: Extract per-page text with pdf-parse to locate question boundaries.
  const pageTexts: string[] = [];
  try {
    // @ts-ignore — pdf-parse/lib/pdf-parse.js lacks TS declarations (same pattern as other consumers)
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const captured: string[] = [];
    await pdfParse(pdfBuffer, {
      pagerender: (pageData: {
        getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
      }) =>
        pageData.getTextContent().then((tc) => {
          const text = tc.items.map((item) => item.str).join(' ');
          captured.push(text);
          return text;
        }),
    });
    pageTexts.push(...captured);
  } catch {
    // Text extraction failed — fall back to splitting purely by page count.
  }

  // Pad to totalPages so index lookups are safe.
  while (pageTexts.length < totalPages) {
    pageTexts.push('');
  }

  // Step 3: Identify which pages (0-based) begin a new question.
  const questionStartPages = new Set<number>();
  for (let i = 0; i < totalPages; i++) {
    if (pageHasQuestionStart(pageTexts[i])) {
      questionStartPages.add(i);
    }
  }

  // Step 4: Build page groups, never cutting mid-question.
  const pageGroups: Array<{ start: number; end: number }> = [];
  let groupStart = 0;

  while (groupStart < totalPages) {
    let groupEnd = Math.min(groupStart + maxPagesPerChunk - 1, totalPages - 1);

    // If question patterns were detected, try to align the cut with a question
    // boundary so we never split a question across two sub-PDFs.
    // Only extend when we have pattern information — otherwise cut at fixed intervals.
    if (groupEnd < totalPages - 1 && questionStartPages.size > 0) {
      // Extend by at most 3 extra pages until the next page starts a question.
      while (
        groupEnd < totalPages - 1 &&
        !questionStartPages.has(groupEnd + 1) &&
        groupEnd - groupStart < maxPagesPerChunk + MAX_PAGE_EXTENSION
      ) {
        groupEnd++;
      }
    }

    pageGroups.push({ start: groupStart, end: groupEnd });
    groupStart = groupEnd + 1;
  }

  // Step 5: Extract each page group as a sub-PDF.
  const chunks: PdfChunk[] = [];
  for (let gi = 0; gi < pageGroups.length; gi++) {
    const { start, end } = pageGroups[gi];
    const subDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start + 1 }, (_, k) => start + k);
    const copiedPages = await subDoc.copyPages(pdfDoc, pageIndices);
    for (const page of copiedPages) {
      subDoc.addPage(page);
    }
    const subPdfBytes = await subDoc.save();
    chunks.push({
      buffer: Buffer.from(subPdfBytes),
      pageStart: start + 1,
      pageEnd: end + 1,
      chunkIndex: gi + 1,
      totalChunks: pageGroups.length,
    });
  }

  return chunks;
}
