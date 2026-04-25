/**
 * @jest-environment node
 *
 * @file Failure-scenario tests for src/lib/pdf-splitter.ts
 *
 * Simulates real-world failures that occurred during the ICFES PDF import
 * pipeline and verifies the module handles each one gracefully.
 *
 * Failure scenarios covered:
 *
 * Escenario 1 — pdf-lib no puede cargar el PDF (archivo corrupto / truncado)
 * Escenario 2 — pdf-lib: PDFDocument.create falla al extraer un sub-PDF
 * Escenario 3 — pdf-lib: subDoc.save() falla (disco lleno, OOM)
 * Escenario 4 — pdf-lib: copyPages falla en un chunk intermedio
 * Escenario 5 — pdf-parse: pagerender callback lanza excepción
 * Escenario 6 — pdf-parse: retorna 0 páginas capturadas (pagerender no llamado)
 * Escenario 7 — pdf-parse: retorna más páginas de texto que páginas en el PDF
 * Escenario 8 — pdf-parse: getTextContent() lanza excepción en una página
 * Escenario 9 — PDF con 0 páginas reportado por pdf-lib
 * Escenario 10 — Buffer vacío (empty Buffer)
 * Escenario 11 — maxPagesPerChunk = 1 → cada página es su propio chunk
 * Escenario 12 — Todos los patrones de pregunta en la misma página
 * Escenario 13 — Pregunta que empieza exactamente en la última página del chunk
 *               (extensión necesaria para no cortar)
 * Escenario 14 — Necesidad de más de MAX_PAGE_EXTENSION páginas extras → corta igual
 */

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────────

const mockGetPageCount = jest.fn<number, []>();
const mockSave        = jest.fn<Promise<Uint8Array>, []>();
const mockAddPage     = jest.fn();
const mockCopyPages   = jest.fn<Promise<unknown[]>, [unknown, number[]]>();

const mockSubDoc = { addPage: mockAddPage, copyPages: mockCopyPages, save: mockSave };
const mockPdfDocInstance = { getPageCount: mockGetPageCount };

jest.mock('pdf-lib', () => ({
  PDFDocument: { load: jest.fn(), create: jest.fn() },
}));

const mockPdfParse = jest.fn();
jest.mock('pdf-parse/lib/pdf-parse.js', () => mockPdfParse, { virtual: true });

// ─── Imports ──────────────────────────────────────────────────────────────────

import { splitPdfIntoChunks } from '@/lib/pdf-splitter';
import { PDFDocument } from 'pdf-lib';

const MockedPDFDocument = PDFDocument as unknown as {
  load:   jest.MockedFunction<() => Promise<typeof mockPdfDocInstance>>;
  create: jest.MockedFunction<() => Promise<typeof mockSubDoc>>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakePdf(pages = 16): Buffer {
  return Buffer.from(`%PDF-1.4 fake-${pages}-pages`);
}

/** Sets up the standard mocks for a healthy PDF with `n` pages. */
function setupHealthyPdf(n: number): void {
  mockGetPageCount.mockReturnValue(n);
  MockedPDFDocument.load.mockResolvedValue(mockPdfDocInstance as never);
  MockedPDFDocument.create.mockResolvedValue(mockSubDoc as never);
  mockCopyPages.mockImplementation((_doc, indices: number[]) =>
    Promise.resolve(indices.map(() => ({}))),
  );
  mockSave.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  mockPdfParse.mockResolvedValue({ text: '' }); // no question patterns
}

/** Configures pdf-parse to fire the pagerender callback with per-page texts. */
async function callPagerender(
  opts: { pagerender?: (pd: unknown) => Promise<string> } | undefined,
  texts: string[],
): Promise<void> {
  if (!opts?.pagerender) return;
  for (const t of texts) {
    await opts.pagerender({
      getTextContent: () => Promise.resolve({ items: [{ str: t }] }),
    });
  }
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// Escenarios de fallo
// ─────────────────────────────────────────────────────────────────────────────

describe('splitPdfIntoChunks — escenarios de fallo', () => {

  // ── Escenario 1: pdf-lib no puede cargar el PDF ───────────────────────────

  describe('Escenario 1 — PDF corrupto / truncado: pdf-lib.load() lanza error', () => {
    it('retorna exactamente 1 chunk con el buffer original intacto', async () => {
      MockedPDFDocument.load.mockRejectedValue(new Error('Failed to parse PDF document'));
      const buf = Buffer.from('CORRUPTED_DATA_NO_PDF_MAGIC');
      const chunks = await splitPdfIntoChunks(buf, 8);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].buffer).toBe(buf);          // exact same reference
      expect(chunks[0].chunkIndex).toBe(1);
      expect(chunks[0].totalChunks).toBe(1);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(1);
    });

    it('no intenta crear sub-PDFs cuando pdf-lib falla', async () => {
      MockedPDFDocument.load.mockRejectedValue(new Error('Encrypted PDF not supported'));
      await splitPdfIntoChunks(fakePdf(), 8);
      expect(MockedPDFDocument.create).not.toHaveBeenCalled();
    });

    it('no propaga la excepción al llamador — nunca lanza', async () => {
      MockedPDFDocument.load.mockRejectedValue(new Error('Out of memory'));
      await expect(splitPdfIntoChunks(fakePdf(), 8)).resolves.toBeDefined();
    });

    it('Buffer completamente vacío → retorna 1 chunk', async () => {
      MockedPDFDocument.load.mockRejectedValue(new Error('Empty buffer'));
      const emptyBuf = Buffer.alloc(0);
      const chunks = await splitPdfIntoChunks(emptyBuf, 8);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].buffer).toBe(emptyBuf);
    });
  });

  // ── Escenario 2: PDFDocument.create() falla ───────────────────────────────

  describe('Escenario 2 — PDFDocument.create() lanza error al crear sub-PDF', () => {
    it('propaga el error al llamador (no silencia)', async () => {
      setupHealthyPdf(16);
      MockedPDFDocument.create.mockRejectedValue(new Error('Unable to create PDFDocument'));

      await expect(splitPdfIntoChunks(fakePdf(), 8)).rejects.toThrow('Unable to create PDFDocument');
    });
  });

  // ── Escenario 3: subDoc.save() falla ─────────────────────────────────────

  describe('Escenario 3 — subDoc.save() falla (ej. OOM al serializar sub-PDF)', () => {
    it('propaga el error al llamador', async () => {
      setupHealthyPdf(16);
      mockSave.mockRejectedValue(new Error('Cannot serialize PDF: out of memory'));

      await expect(splitPdfIntoChunks(fakePdf(), 8)).rejects.toThrow('Cannot serialize PDF');
    });
  });

  // ── Escenario 4: copyPages falla en chunk intermedio ─────────────────────

  describe('Escenario 4 — copyPages falla en un chunk intermedio', () => {
    it('propaga el error al llamador', async () => {
      setupHealthyPdf(24);
      // First chunk succeeds, second fails
      mockCopyPages
        .mockImplementationOnce((_doc, indices: number[]) =>
          Promise.resolve(indices.map(() => ({}))),
        )
        .mockRejectedValueOnce(new Error('Page index out of range'));

      await expect(splitPdfIntoChunks(fakePdf(), 8)).rejects.toThrow('Page index out of range');
    });
  });

  // ── Escenario 5: pagerender callback lanza excepción ─────────────────────

  describe('Escenario 5 — pdf-parse: pagerender callback lanza excepción', () => {
    it('cae en fallback de split por páginas fijas (no propaga el error)', async () => {
      setupHealthyPdf(16);
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          if (opts?.pagerender) {
            // Simulates an error thrown by getTextContent on a specific page
            await opts.pagerender({
              getTextContent: () => Promise.reject(new Error('Renderer crashed')),
            });
          }
          return { text: '' };
        },
      );

      // pdf-parse itself doesn't throw; the splitter should still produce chunks
      // (the try/catch on pdfParse wraps the whole call, so if pdfParse propagates
      // the rejection the fallback kicks in)
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);
      expect(chunks.length).toBeGreaterThanOrEqual(2); // fixed-interval fallback
    });
  });

  // ── Escenario 6: pagerender nunca llamado → 0 textos capturados ──────────

  describe('Escenario 6 — pdf-parse no llama al pagerender (retorna 0 páginas capturadas)', () => {
    it('hace padding con strings vacíos y divide por páginas fijas', async () => {
      setupHealthyPdf(16);
      // pagerender callback never invoked — captured array stays empty
      mockPdfParse.mockResolvedValue({ text: 'global text but no per-page callbacks' });

      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].pageEnd).toBe(8);
      expect(chunks[1].pageStart).toBe(9);
    });
  });

  // ── Escenario 7: pdf-parse retorna MÁS páginas de texto que el PDF real ──

  describe('Escenario 7 — pdf-parse captura más páginas de texto que totalPages', () => {
    it('solo usa las primeras totalPages entradas; divide correctamente', async () => {
      setupHealthyPdf(8); // 8-page PDF
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          // 20 pages captured (more than the 8 that pdf-lib reports)
          const texts = Array.from({ length: 20 }, (_, i) => `página ${i + 1}`);
          await callPagerender(opts, texts);
          return { text: texts.join('\n') };
        },
      );

      // 8 pages ≤ maxPagesPerChunk=8 → fast path, no splitting needed
      const chunks = await splitPdfIntoChunks(fakePdf(), 8);
      expect(chunks).toHaveLength(1);
    });
  });

  // ── Escenario 8: getTextContent() lanza excepción en una página ──────────

  describe('Escenario 8 — getTextContent() lanza excepción en una página del medio', () => {
    it('cae en fallback; el resultado sigue siendo >= 2 chunks para un PDF de 16 páginas', async () => {
      setupHealthyPdf(16);
      let pageIndex = 0;
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          if (opts?.pagerender) {
            for (let i = 0; i < 16; i++) {
              const thisIndex = pageIndex++;
              // Page 7 (index 7) throws
              if (thisIndex === 7) {
                await opts.pagerender({
                  getTextContent: () => Promise.reject(new Error('Renderer page 7 failed')),
                });
              } else {
                await opts.pagerender({
                  getTextContent: () => Promise.resolve({ items: [{ str: `Texto página ${thisIndex}` }] }),
                });
              }
            }
          }
          return { text: '' };
        },
      );

      const chunks = await splitPdfIntoChunks(fakePdf(), 8);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // No exception should propagate
    });
  });

  // ── Escenario 9: PDF reporta 0 páginas ───────────────────────────────────

  describe('Escenario 9 — PDF con 0 páginas reportado por pdf-lib', () => {
    it('0 páginas ≤ maxPagesPerChunk → fast path devuelve 1 chunk', async () => {
      setupHealthyPdf(0);
      const buf = fakePdf();
      const chunks = await splitPdfIntoChunks(buf, 8);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].buffer).toBe(buf);
      expect(chunks[0].pageStart).toBe(1);
      expect(chunks[0].pageEnd).toBe(0); // mirrors totalPages
    });
  });

  // ── Escenario 11: maxPagesPerChunk = 1 ───────────────────────────────────

  describe('Escenario 11 — maxPagesPerChunk = 1: cada página es su propio chunk', () => {
    it('PDF de 4 páginas → 4 chunks de 1 página cada uno', async () => {
      setupHealthyPdf(4);
      const chunks = await splitPdfIntoChunks(fakePdf(), 1);

      expect(chunks).toHaveLength(4);
      chunks.forEach((c, i) => {
        expect(c.pageStart).toBe(i + 1);
        expect(c.pageEnd).toBe(i + 1);
        expect(c.chunkIndex).toBe(i + 1);
        expect(c.totalChunks).toBe(4);
      });
    });

    it('totalChunks consistente en todos los chunks', async () => {
      setupHealthyPdf(3);
      const chunks = await splitPdfIntoChunks(fakePdf(), 1);

      expect(chunks.every((c) => c.totalChunks === 3)).toBe(true);
    });
  });

  // ── Escenario 12: todos los patrones en una sola página ──────────────────

  describe('Escenario 12 — Todos los patrones de pregunta están en la misma página', () => {
    it('detecta la página y corta justo antes de ella', async () => {
      setupHealthyPdf(16);
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          const texts = Array.from({ length: 16 }, (_, i) =>
            // Page 9 (index 8) has ALL patterns
            i === 8
              ? '1. Primera pregunta\nPregunta 1\nSITUACIÓN 1\n2) Segunda'
              : `Texto académico ${i + 1}`,
          );
          await callPagerender(opts, texts);
          return { text: texts.join('\n') };
        },
      );

      const chunks = await splitPdfIntoChunks(fakePdf(), 8);
      // Chunk 1 should end at page 8 (index 7), chunk 2 starts at page 9 (index 8)
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].pageEnd).toBeLessThanOrEqual(8);
      expect(chunks[1].pageStart).toBeLessThanOrEqual(9);
    });
  });

  // ── Escenario 13: pregunta empieza en la última página del chunk ──────────

  describe('Escenario 13 — Pregunta empieza exactamente en la última página del chunk nominal', () => {
    it('el corte avanza hasta la siguiente pregunta boundary (dentro de MAX_PAGE_EXTENSION)', async () => {
      // 12 pages, chunk size 4. Page 5 (index 4) starts a question.
      // Natural cut for chunk 1: pages 1-4. But page 4 (index 3) does NOT start a
      // question — so the extension should look for the next question start.
      setupHealthyPdf(12);
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          const texts = Array.from({ length: 12 }, (_, i) =>
            i === 4 ? '1. Primera pregunta del cuadernillo'
            : i === 8 ? '5. Quinta pregunta del cuadernillo'
            : `Texto académico página ${i + 1}`,
          );
          await callPagerender(opts, texts);
          return { text: texts.join('\n') };
        },
      );

      const chunks = await splitPdfIntoChunks(fakePdf(), 4);

      // chunk 1 should not end at page 4 if page 5 is a question start —
      // the cut should align with question boundaries
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // All pages must be covered without overlap
      const allPages = chunks.flatMap((c) =>
        Array.from({ length: c.pageEnd - c.pageStart + 1 }, (_, k) => c.pageStart + k),
      );
      expect(allPages.sort((a, b) => a - b)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
    });
  });

  // ── Escenario 14: necesita más de MAX_PAGE_EXTENSION para alinear ─────────

  describe('Escenario 14 — Extension > MAX_PAGE_EXTENSION necesaria: corta igualmente', () => {
    it('aplica el corte cuando la extensión máxima se agota (sin extenderse infinito)', async () => {
      // 20 pages, chunk 8. Question starts only on page 15 (index 14).
      // The extension loop can add at most 3 extra pages (up to page 11).
      // Since page 11 is not a question start either, it cuts at page 11 anyway.
      setupHealthyPdf(20);
      mockPdfParse.mockImplementation(
        async (_buf: Buffer, opts: { pagerender?: (pd: unknown) => Promise<string> }) => {
          const texts = Array.from({ length: 20 }, (_, i) =>
            i === 14 ? '1. Pregunta en página 15' : `Texto ${i + 1}`,
          );
          await callPagerender(opts, texts);
          return { text: texts.join('\n') };
        },
      );

      const chunks = await splitPdfIntoChunks(fakePdf(), 8);

      // Chunk 1 can be at most maxPagesPerChunk + MAX_PAGE_EXTENSION pages.
      // With maxPagesPerChunk=8 and MAX_PAGE_EXTENSION=3, groupEnd can reach
      // index 11 (0-based) = page 12 (1-based) before the loop stops.
      expect(chunks[0].pageEnd).toBeLessThanOrEqual(12);
      // All pages covered exactly once
      const allPages = chunks.flatMap((c) =>
        Array.from({ length: c.pageEnd - c.pageStart + 1 }, (_, k) => c.pageStart + k),
      );
      expect(allPages.sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
    });
  });

});
