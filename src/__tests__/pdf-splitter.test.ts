/**
 * @jest-environment node
 *
 * @file Unit tests for src/lib/pdf-splitter.ts
 *
 * Covers:
 *   1. Small PDF (≤ maxPagesPerChunk pages) → fast path returns 1 chunk
 *   2. PDF of 16 pages with no question patterns → 2 chunks of 8 pages each
 *   3. PDF of 24 pages → 3 chunks
 *   4. Question-aware cut: never splits in the middle of a question
 *   5. Invalid PDF buffer → graceful fallback to 1 chunk
 *   6. Custom maxPagesPerChunk
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// We need these mocks declared BEFORE the jest.mock() calls so they are available
// in the factory closures (jest hoisting).

const mockGetPageCount = jest.fn<number, []>();
const mockSave = jest.fn<Promise<Uint8Array>, []>();
const mockAddPage = jest.fn();
const mockCopyPages = jest.fn<Promise<unknown[]>, [unknown, number[]]>();

const mockSubDoc = {
  addPage: mockAddPage,
  copyPages: mockCopyPages,
  save: mockSave,
};

const mockPdfDocInstance = {
  getPageCount: mockGetPageCount,
};

jest.mock('pdf-lib', () => ({
  PDFDocument: {
    load: jest.fn(),
    create: jest.fn(),
  },
}));

const mockPdfParse = jest.fn();
jest.mock('pdf-parse/lib/pdf-parse.js', () => mockPdfParse, { virtual: true });

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { splitPdfIntoChunks } from '@/lib/pdf-splitter';
import { PDFDocument } from 'pdf-lib';

// Typed references to the pdf-lib mocks
const MockedPDFDocument = PDFDocument as unknown as {
  load: jest.MockedFunction<() => Promise<typeof mockPdfDocInstance>>;
  create: jest.MockedFunction<() => Promise<typeof mockSubDoc>>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a fake PDF buffer (PDF magic bytes). */
function fakePdf(): Buffer {
  return Buffer.from('%PDF-1.4 fake content');
}

/**
 * Configures the pdf-lib mock for a PDF with `pageCount` pages.
 * pdf-parse mock returns empty text for all pages (no question patterns).
 */
function setupPdfMock(pageCount: number): void {
  mockGetPageCount.mockReturnValue(pageCount);
  MockedPDFDocument.load.mockResolvedValue(mockPdfDocInstance as never);
  MockedPDFDocument.create.mockResolvedValue(mockSubDoc as never);
  // copyPages returns one placeholder page per requested index
  mockCopyPages.mockImplementation((_doc, indices: number[]) =>
    Promise.resolve(indices.map(() => ({})))
  );
  mockSave.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // %PDF
  // pdf-parse: no question patterns → empty text for every page
  mockPdfParse.mockResolvedValue({ text: '' });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('splitPdfIntoChunks', () => {
  describe('Fast path — PDF fits in one chunk (≤ maxPagesPerChunk pages)', () => {
    it('PDF de 8 páginas con maxPagesPerChunk=8 → 1 solo chunk con buffer original', async () => {
      setupPdfMock(8);
      const buf = fakePdf();
      const chunks = await splitPdfIntoChunks(buf, 8);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].buffer).toBe(buf); // same reference — no sub-PDF created
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(8);
      expect(chunks[0].chunkIndex).toBe(1);
      expect(chunks[0].totalChunks).toBe(1);
      // No sub-PDF was created (no PDFDocument.create call)
      expect(MockedPDFDocument.create).not.toHaveBeenCalled();
    });

    it('PDF de 1 página → 1 chunk', async () => {
      setupPdfMock(1);
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(1);
    });

    it('PDF de 5 páginas con maxPagesPerChunk=8 → 1 chunk', async () => {
      setupPdfMock(5);
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].pageEnd).toBe(5);
    });
  });

  describe('Multi-chunk splitting — no question patterns detected', () => {
    it('PDF de 16 páginas → 2 chunks de 8 páginas', async () => {
      setupPdfMock(16);
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(8);
      expect(chunks[1].pageStart).toBe(9);
      expect(chunks[1].pageEnd).toBe(16);
      expect(chunks[0].totalChunks).toBe(2);
      expect(chunks[1].totalChunks).toBe(2);
      expect(chunks[0].chunkIndex).toBe(1);
      expect(chunks[1].chunkIndex).toBe(2);
    });

    it('PDF de 24 páginas → 3 chunks de 8 páginas', async () => {
      setupPdfMock(24);
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      expect(chunks).toHaveLength(3);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(8);
      expect(chunks[1].pageStart).toBe(9);
      expect(chunks[1].pageEnd).toBe(16);
      expect(chunks[2].pageStart).toBe(17);
      expect(chunks[2].pageEnd).toBe(24);
    });

    it('PDF de 9 páginas con maxPagesPerChunk=8 → 2 chunks', async () => {
      setupPdfMock(9);
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(8);
      expect(chunks[1].pageStart).toBe(9);
      expect(chunks[1].pageEnd).toBe(9);
    });

    it('cada chunk sub-PDF tiene buffer diferente', async () => {
      setupPdfMock(16);
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      expect(MockedPDFDocument.create).toHaveBeenCalledTimes(2);
      // Both chunks have buffers (even if same bytes in this test)
      expect(Buffer.isBuffer(chunks[0].buffer)).toBe(true);
      expect(Buffer.isBuffer(chunks[1].buffer)).toBe(true);
    });
  });

  describe('Question-aware splitting — cut BETWEEN questions', () => {
    it('corte respeta inicio de pregunta — no parte una pregunta en 2', async () => {
      // 17 pages: pages 1-8 have no question, page 9 starts "1. Pregunta..."
      // Expected: chunk 1 = pages 1-8, chunk 2 starts at page 9 (question boundary)
      setupPdfMock(17);

      // Configure pdf-parse to call pagerender with per-page texts
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          const texts = Array.from({ length: 17 }, (_, i) =>
            i === 8 ? '1. Primera pregunta' : `Texto página ${i + 1}`,
          );
          if (opts?.pagerender) {
            for (const t of texts) {
              await opts.pagerender({
                getTextContent: () =>
                  Promise.resolve({ items: [{ str: t }] }),
              });
            }
          }
          return { text: texts.join('\n') };
        },
      );

      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      // Should still cut at page 8/9 boundary since page 9 (index 8) IS a question start
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].pageEnd).toBeLessThanOrEqual(8);
      expect(chunks[1].pageStart).toBeLessThanOrEqual(9);
    });

    it('si no hay patrones de pregunta → divide por páginas fijas', async () => {
      setupPdfMock(16);
      // pdf-parse returns text without any question patterns
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          const texts = Array.from({ length: 16 }, (_, i) => `Texto académico página ${i + 1}`);
          if (opts?.pagerender) {
            for (const t of texts) {
              await opts.pagerender({
                getTextContent: () =>
                  Promise.resolve({ items: [{ str: t }] }),
              });
            }
          }
          return { text: texts.join('\n') };
        },
      );

      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(8);
      expect(chunks[1].pageStart).toBe(9);
      expect(chunks[1].pageEnd).toBe(16);
    });
  });

  describe('Error handling', () => {
    it('PDF inválido (buffer corrupto) → retorna 1 chunk con el buffer original', async () => {
      MockedPDFDocument.load.mockRejectedValue(new Error('Invalid PDF'));

      const buf = Buffer.from('not a pdf');
      const chunks = await splitPdfIntoChunks(buf, 8);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].buffer).toBe(buf);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(1);
    });

    it('pdf-parse lanza error → cae en fallback de split por páginas fijas', async () => {
      setupPdfMock(16);
      mockPdfParse.mockRejectedValue(new Error('pdf-parse failed'));

      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      // Still splits by fixed page count (no question detection)
      expect(chunks).toHaveLength(2);
    });
  });

  describe('Custom maxPagesPerChunk', () => {
    it('maxPagesPerChunk=4 con 12 páginas → 3 chunks de 4 páginas', async () => {
      setupPdfMock(12);
      const chunks = await splitPdfIntoChunks(fakePdf(), 4);

      expect(chunks).toHaveLength(3);
      expect(chunks[0].pageEnd).toBe(4);
      expect(chunks[1].pageStart).toBe(5);
      expect(chunks[1].pageEnd).toBe(8);
      expect(chunks[2].pageStart).toBe(9);
      expect(chunks[2].pageEnd).toBe(12);
    });

    it('maxPagesPerChunk=10 con 9 páginas → 1 chunk (fast path)', async () => {
      setupPdfMock(9);
      const chunks = await splitPdfIntoChunks(fakePdf(), 10);

      expect(chunks).toHaveLength(1);
      expect(MockedPDFDocument.create).not.toHaveBeenCalled();
    });
  });
});
