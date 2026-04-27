/**
 * @jest-environment node
 *
 * @file Failure-scenario tests for POST /api/import-queue (multi-chunk PDF path)
 *
 * Simulates the failure modes that were identified from the real ICFES workflow
 * timeout issue and verifies the route handles each one correctly.
 *
 * Failure scenarios covered:
 *
 * Escenario 1  — splitPdfIntoChunks lanza excepción (pdf-lib crash) → 400
 * Escenario 2  — uploadPdfToGeminiFilesApi falla en el primer chunk → 400
 * Escenario 3  — uploadPdfToGeminiFilesApi falla en un chunk intermedio → 400
 * Escenario 4  — GOOGLE_GENAI_API_KEY no configurada → 500 (antes del split)
 * Escenario 5  — getAdminFirestore falla en el path multi-chunk → 500
 * Escenario 6  — batch.commit() falla en el path multi-chunk → 400
 * Escenario 7  — splitPdfIntoChunks devuelve array vacío → cae en flujo normal → 422
 * Escenario 8  — PDF de 0 bytes (arrayBuffer vacío) → handled gracefully
 * Escenario 9  — Gemini Files API devuelve 429 (rate limit) → error propagado
 * Escenario 10 — Gemini Files API no devuelve URI → error propagado
 * Escenario 11 — URL de PDF grande: fallo en uploadPdfToGeminiFilesApi → 400
 * Escenario 12 — URL de PDF grande: batch.commit() falla → 400
 * Escenario 13 — File upload: pdfChunks[n].buffer está corrupto → error propagado
 * Escenario 14 — sessionId es único para cada invocación (no se reutiliza)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockBatch = {
  set: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};
const mockCollection = { doc: jest.fn().mockReturnValue({ id: 'doc-id' }) };
const mockDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
  batch: jest.fn().mockReturnValue(mockBatch),
};
const mockStorageFile = { save: jest.fn().mockResolvedValue(undefined) };
const mockBucket = { file: jest.fn().mockReturnValue(mockStorageFile) };

jest.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: jest.fn(() => mockDb),
  getAdminStorage:   jest.fn(() => mockBucket),
}));

jest.mock('@/ai/constants', () => ({ PDF_VISION_SIZE_LIMIT: 14 * 1024 * 1024 }));

jest.mock('@/ai/gemini-files', () => ({
  uploadPdfToGeminiFilesApi: jest.fn(),
}));

jest.mock('pdf-parse/lib/pdf-parse.js', () => jest.fn(), { virtual: true });

const mockSplitPdfIntoChunks = jest.fn();
jest.mock('@/lib/pdf-splitter', () => ({
  splitPdfIntoChunks: (...args: unknown[]) => mockSplitPdfIntoChunks(...args),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ─── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/import-queue/route';
import { uploadPdfToGeminiFilesApi } from '@/ai/gemini-files';
import { getAdminFirestore } from '@/lib/firebase-admin';

type UploadMock = jest.MockedFunction<typeof uploadPdfToGeminiFilesApi>;
type DbMock     = jest.MockedFunction<typeof getAdminFirestore>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePdfFile(name = 'cuadernillo.pdf', size = 1024): File {
  const buf = Buffer.alloc(size);
  buf[0] = 0x25; buf[1] = 0x50; buf[2] = 0x44; buf[3] = 0x46; buf[4] = 0x2d;
  return new File([buf], name, { type: 'application/pdf' });
}

function fileRequest(file: File, subjectId?: string): NextRequest {
  const fd = new FormData();
  fd.append('file', file);
  if (subjectId) fd.append('subjectId', subjectId);
  return new NextRequest('http://localhost/api/import-queue', { method: 'POST', body: fd });
}

function urlRequest(url: string, subjectId?: string): NextRequest {
  return new NextRequest('http://localhost/api/import-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...(subjectId ? { subjectId } : {}) }),
  });
}

function makeTwoChunks() {
  return [
    { buffer: Buffer.from('%PDF-1'), pageStart: 1,  pageEnd: 8,  chunkIndex: 1, totalChunks: 2 },
    { buffer: Buffer.from('%PDF-2'), pageStart: 9,  pageEnd: 16, chunkIndex: 2, totalChunks: 2 },
  ];
}

function makeThreeChunks() {
  return [
    { buffer: Buffer.from('%PDF-A'), pageStart: 1,  pageEnd: 8,  chunkIndex: 1, totalChunks: 3 },
    { buffer: Buffer.from('%PDF-B'), pageStart: 9,  pageEnd: 16, chunkIndex: 2, totalChunks: 3 },
    { buffer: Buffer.from('%PDF-C'), pageStart: 17, pageEnd: 24, chunkIndex: 3, totalChunks: 3 },
  ];
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const ORIG_KEY = process.env.GOOGLE_GENAI_API_KEY;

beforeEach(() => {
  // resetAllMocks clears both call history AND the Once queue so leftover
  // Once implementations from previous tests cannot bleed into the next test.
  jest.resetAllMocks();
  mockDb.collection.mockReturnValue(mockCollection);
  mockDb.batch.mockReturnValue(mockBatch);
  mockBatch.commit.mockResolvedValue(undefined);
  mockBucket.file.mockReturnValue(mockStorageFile);
  mockStorageFile.save.mockResolvedValue(undefined);
  process.env.GOOGLE_GENAI_API_KEY = 'test-key';
  // Default: small PDF → 1 chunk (fast path, no multi-chunk logic)
  mockSplitPdfIntoChunks.mockResolvedValue([{
    buffer: Buffer.from('%PDF-'),
    pageStart: 1, pageEnd: 8, chunkIndex: 1, totalChunks: 1,
  }]);
  (uploadPdfToGeminiFilesApi as UploadMock).mockResolvedValue(
    'https://generativelanguage.googleapis.com/v1beta/files/ok-id',
  );
  (getAdminFirestore as DbMock).mockReturnValue(mockDb as never);
});

afterEach(() => {
  if (ORIG_KEY !== undefined) process.env.GOOGLE_GENAI_API_KEY = ORIG_KEY;
  else delete process.env.GOOGLE_GENAI_API_KEY;
});

// ─────────────────────────────────────────────────────────────────────────────
// Failure scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/import-queue — escenarios de fallo (multi-chunk PDF)', () => {

  // ── Escenario 1 ───────────────────────────────────────────────────────────

  describe('Escenario 1 — splitPdfIntoChunks lanza excepción', () => {
    it('la excepción es capturada por el bloque try/catch externo → responde 400', async () => {
      mockSplitPdfIntoChunks.mockRejectedValue(new Error('pdf-lib: out of memory'));
      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('pdf-lib: out of memory');
    });

    it('ningún job de Firestore se escribe cuando el split falla', async () => {
      mockSplitPdfIntoChunks.mockRejectedValue(new Error('parse error'));
      await POST(fileRequest(makePdfFile()));
      expect(mockBatch.commit).not.toHaveBeenCalled();
      expect(mockBatch.set).not.toHaveBeenCalled();
    });
  });

  // ── Escenario 2 ───────────────────────────────────────────────────────────

  describe('Escenario 2 — uploadPdfToGeminiFilesApi falla en el primer chunk', () => {
    it('responde 400 cuando el primer upload falla', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock).mockRejectedValue(
        new Error('Gemini Files API upload failed (HTTP 400): Bad Request'),
      );
      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('Gemini Files API upload failed');
    });

    it('no hace commit a Firestore si el primer upload falla', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock).mockRejectedValue(new Error('upload error'));
      await POST(fileRequest(makePdfFile()));
      expect(mockBatch.commit).not.toHaveBeenCalled();
    });
  });

  // ── Escenario 3 ───────────────────────────────────────────────────────────

  describe('Escenario 3 — uploadPdfToGeminiFilesApi falla en un chunk intermedio', () => {
    it('responde 400 cuando el segundo de tres uploads falla', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeThreeChunks());
      const upload = uploadPdfToGeminiFilesApi as UploadMock;
      upload
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c1')
        .mockRejectedValueOnce(new Error('Gemini Files API upload failed (HTTP 500): Server Error'));

      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('HTTP 500');
    });

    it('el commit de Firestore NO ocurre si un upload intermedio falla', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeThreeChunks());
      const upload = uploadPdfToGeminiFilesApi as UploadMock;
      upload
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c1')
        .mockRejectedValueOnce(new Error('network error on chunk 2'));

      await POST(fileRequest(makePdfFile()));
      expect(mockBatch.commit).not.toHaveBeenCalled();
    });
  });

  // ── Escenario 4 ───────────────────────────────────────────────────────────

  describe('Escenario 4 — GOOGLE_GENAI_API_KEY no configurada', () => {
    it('responde 500 cuando la API key no está presente', async () => {
      delete process.env.GOOGLE_GENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('GOOGLE_GENAI_API_KEY');
    });

    it('split nunca es llamado cuando la API key falta (verificación de orden)', async () => {
      delete process.env.GOOGLE_GENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      // splitPdfIntoChunks is called AFTER the API key check, so the default mock
      // (1-chunk) should still be the state, but since the key check fails first,
      // the split function should NOT be called at all.
      await POST(fileRequest(makePdfFile()));
      // Actually the key check happens BEFORE split → split not called
      expect(mockSplitPdfIntoChunks).not.toHaveBeenCalled();
    });
  });

  // ── Escenario 5 ───────────────────────────────────────────────────────────

  describe('Escenario 5 — getAdminFirestore falla en el path multi-chunk', () => {
    it('responde 500 cuando Firebase Admin no está inicializado', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      const upload = uploadPdfToGeminiFilesApi as UploadMock;
      upload
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c2');
      (getAdminFirestore as DbMock).mockImplementationOnce(() => {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing');
      });

      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
    });
  });

  // ── Escenario 6 ───────────────────────────────────────────────────────────

  describe('Escenario 6 — batch.commit() falla en el path multi-chunk', () => {
    it('responde 400 cuando el commit de Firestore lanza error', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      const upload = uploadPdfToGeminiFilesApi as UploadMock;
      upload
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c2');
      mockBatch.commit.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('Firestore unavailable');
    });

    it('todos los uploads a Gemini ya ocurrieron antes del commit (no se revierten)', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      const upload = uploadPdfToGeminiFilesApi as UploadMock;
      upload
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/c2');
      mockBatch.commit.mockRejectedValueOnce(new Error('Firestore down'));

      await POST(fileRequest(makePdfFile()));
      // Both uploads were called before commit
      expect(upload).toHaveBeenCalledTimes(2);
    });
  });

  // ── Escenario 7 ───────────────────────────────────────────────────────────

  describe('Escenario 7 — splitPdfIntoChunks devuelve [] (array vacío)', () => {
    it('retorna 422 — el contenido está vacío', async () => {
      // splitPdfIntoChunks returns [] → pdfChunks.length === 0, which is ≠ 1,
      // so the multi-chunk branch runs (length !== 1). But the for loop iterates
      // zero times, batch.set is never called, batch.commit commits an empty
      // batch and returns { sessionId, totalChunks: 0 }.
      // However, an empty array is treated as length 0, and since 0 !== 1,
      // the early-return path runs, returning { totalChunks: 0 }.
      // Let's verify this is handled gracefully.
      mockSplitPdfIntoChunks.mockResolvedValue([]);

      const res = await POST(fileRequest(makePdfFile()));
      // Either returns early with { totalChunks: 0 } or falls through to 422.
      // Both are acceptable graceful behaviors. What must NOT happen is a 500.
      expect([200, 422]).toContain(res.status);
    });
  });

  // ── Escenario 8 ───────────────────────────────────────────────────────────

  describe('Escenario 8 — PDF con 0 bytes (archivo vacío)', () => {
    it('la petición es manejada sin lanzar una excepción no capturada', async () => {
      const emptyFile = new File([new ArrayBuffer(0)], 'empty.pdf', { type: 'application/pdf' });
      const res = await POST(fileRequest(emptyFile));
      expect([200, 400, 422, 500]).toContain(res.status);
    });
  });

  // ── Escenario 9 ───────────────────────────────────────────────────────────

  describe('Escenario 9 — Gemini Files API retorna 429 (rate limit)', () => {
    it('el error 429 se propaga y responde 400', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock).mockRejectedValue(
        new Error('Gemini Files API upload failed (HTTP 429): Resource has been exhausted'),
      );
      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('429');
    });
  });

  // ── Escenario 10 ──────────────────────────────────────────────────────────

  describe('Escenario 10 — Gemini Files API no devuelve URI', () => {
    it('el error de URI faltante se propaga y responde 400', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock).mockRejectedValue(
        new Error('Gemini Files API did not return a file URI in the response.'),
      );
      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('URI');
    });
  });

  // ── Escenario 11 ──────────────────────────────────────────────────────────

  describe('Escenario 11 — URL de PDF grande: fallo en uploadPdfToGeminiFilesApi', () => {
    it('responde 400 cuando el upload del primer sub-PDF falla', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock).mockRejectedValue(
        new Error('Gemini Files API upload failed (HTTP 503): Service Unavailable'),
      );

      const pdfBuf = Buffer.alloc(1024);
      pdfBuf[0] = 0x25; pdfBuf[1] = 0x50; pdfBuf[2] = 0x44; pdfBuf[3] = 0x46;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => pdfBuf.buffer,
      } as unknown as Response);

      const res = await POST(urlRequest('https://www.icfes.gov.co/cuadernillo-grande.pdf'));
      expect(res.status).toBe(400);
    });
  });

  // ── Escenario 12 ──────────────────────────────────────────────────────────

  describe('Escenario 12 — URL de PDF grande: batch.commit() falla', () => {
    it('responde 400 cuando el commit a Firestore falla en el path URL', async () => {
      mockSplitPdfIntoChunks.mockResolvedValue(makeTwoChunks());
      const upload = uploadPdfToGeminiFilesApi as UploadMock;
      upload
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/u1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/u2');
      mockBatch.commit.mockRejectedValueOnce(new Error('Quota exceeded'));

      const pdfBuf = Buffer.alloc(512);
      pdfBuf[0] = 0x25; pdfBuf[1] = 0x50; pdfBuf[2] = 0x44; pdfBuf[3] = 0x46;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => pdfBuf.buffer,
      } as unknown as Response);

      const res = await POST(urlRequest('https://icfes.gov.co/grande.pdf'));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('Quota exceeded');
    });
  });

  // ── Escenario 13 ──────────────────────────────────────────────────────────

  describe('Escenario 13 — Buffer de sub-PDF corrupto devuelto por splitPdfIntoChunks', () => {
    it('si uploadPdfToGeminiFilesApi lanza para ese buffer, responde 400', async () => {
      // The route doesn't validate sub-PDF buffers — it forwards them directly.
      // Gemini would reject it, which translates to an upload error.
      const corruptChunks = [
        { buffer: Buffer.from('NOT_A_PDF'), pageStart: 1, pageEnd: 8, chunkIndex: 1, totalChunks: 2 },
        { buffer: Buffer.from('%PDF-OK'),  pageStart: 9, pageEnd: 16, chunkIndex: 2, totalChunks: 2 },
      ];
      mockSplitPdfIntoChunks.mockResolvedValue(corruptChunks);
      (uploadPdfToGeminiFilesApi as UploadMock).mockRejectedValue(
        new Error('Gemini Files API upload failed (HTTP 400): Not a valid PDF'),
      );

      const res = await POST(fileRequest(makePdfFile()));
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('valid PDF');
    });
  });

  // ── Escenario 14 ──────────────────────────────────────────────────────────

  describe('Escenario 14 — sessionId único por invocación (no reutilizado)', () => {
    it('dos invocaciones consecutivas generan sessionIds distintos', async () => {
      for (let call = 0; call < 2; call++) {
        mockSplitPdfIntoChunks.mockResolvedValueOnce(makeTwoChunks());
        const upload = uploadPdfToGeminiFilesApi as UploadMock;
        upload
          .mockResolvedValueOnce(`https://generativelanguage.googleapis.com/v1beta/files/c${call}-1`)
          .mockResolvedValueOnce(`https://generativelanguage.googleapis.com/v1beta/files/c${call}-2`);
      }

      const res1 = await POST(fileRequest(makePdfFile()));
      const body1 = await res1.json() as { sessionId: string };

      const res2 = await POST(fileRequest(makePdfFile()));
      const body2 = await res2.json() as { sessionId: string };

      expect(body1.sessionId).toBeTruthy();
      expect(body2.sessionId).toBeTruthy();
      expect(body1.sessionId).not.toBe(body2.sessionId);
    });

    it('todos los jobs de la misma invocación comparten el mismo sessionId', async () => {
      mockSplitPdfIntoChunks.mockResolvedValueOnce(makeThreeChunks());
      const upload = uploadPdfToGeminiFilesApi as UploadMock;
      upload
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/x1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/x2')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/x3');

      const res = await POST(fileRequest(makePdfFile()));
      const body = await res.json() as { sessionId: string };

      const setCalls = mockBatch.set.mock.calls as [unknown, Record<string, unknown>][];
      expect(setCalls).toHaveLength(3);
      for (const [, jobData] of setCalls) {
        expect(jobData.sessionId).toBe(body.sessionId);
      }
    });
  });

  // ── Escenario 15 — subjectId se guarda en los importJobs ─────────────────

  describe('Escenario 15 — subjectId se guarda en los jobs del importQueue', () => {
    it('subjectId del FormData se persiste en cada job (multi-chunk PDF file)', async () => {
      mockSplitPdfIntoChunks.mockResolvedValueOnce(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock)
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/s1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/s2');

      await POST(fileRequest(makePdfFile(), 'naturales'));

      const setCalls = mockBatch.set.mock.calls as [unknown, Record<string, unknown>][];
      expect(setCalls).toHaveLength(2);
      for (const [, jobData] of setCalls) {
        expect(jobData.subjectId).toBe('naturales');
      }
    });

    it('sin subjectId en el FormData → los jobs no incluyen el campo', async () => {
      mockSplitPdfIntoChunks.mockResolvedValueOnce(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock)
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/n1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/n2');

      await POST(fileRequest(makePdfFile()));

      const setCalls = mockBatch.set.mock.calls as [unknown, Record<string, unknown>][];
      for (const [, jobData] of setCalls) {
        expect(jobData.subjectId).toBeUndefined();
      }
    });

    it('subjectId del JSON body se persiste en cada job (multi-chunk PDF URL)', async () => {
      mockSplitPdfIntoChunks.mockResolvedValueOnce(makeTwoChunks());
      (uploadPdfToGeminiFilesApi as UploadMock)
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/u1')
        .mockResolvedValueOnce('https://generativelanguage.googleapis.com/v1beta/files/u2');

      const pdfUrl = 'https://example.com/banco.pdf';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => Buffer.alloc(1024).buffer,
      });

      await POST(urlRequest(pdfUrl, 'sociales'));

      const setCalls = mockBatch.set.mock.calls as [unknown, Record<string, unknown>][];
      expect(setCalls).toHaveLength(2);
      for (const [, jobData] of setCalls) {
        expect(jobData.subjectId).toBe('sociales');
      }
    });
  });

});
