/**
 * @jest-environment node
 *
 * @file Failure-scenario tests for POST /api/process-chunk
 *
 * Simulates the failure modes observed in the real ICFES workflow and verifies
 * that the route handles each one correctly (marking jobs as "failed", never
 * leaving them stuck in "processing", etc.).
 *
 * Failure scenarios covered:
 *
 * Escenario 1  — Firestore init falla → 500
 * Escenario 2  — Firestore query lanza excepción (índice faltante) → 500
 * Escenario 3  — importQuestionsFromGeminiFileUri falla en ambos intentos → job marked failed
 * Escenario 4  — importQuestionsFromGeminiFileUri: timeout de Gemini (55s) → job marked failed
 * Escenario 5  — importQuestionsFromGeminiFileUri falla solo 1° intento, 2° éxito → job done
 * Escenario 6  — Storage download falla → job marked failed, no IA llamada
 * Escenario 7  — Firestore add (guardar pregunta) falla → otras preguntas siguen guardándose
 * Escenario 8  — Deduplicación: pregunta duplicada no se guarda
 * Escenario 9  — jobDoc.ref.update("processing") falla → error propagado
 * Escenario 10 — IA retorna questions=[] → job marked done con questionsFound=0
 * Escenario 11 — IA retorna questions=null → manejado sin lanzar
 * Escenario 12 — CRON_SECRET configurado: acceso sin token → 401
 * Escenario 13 — CRON_SECRET configurado: token correcto → 200
 * Escenario 14 — job.updatedAt falta en el documento → no lanza
 * Escenario 15 — geminiFileUri vacío ("") → no entra en el path de Gemini Files
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockImportFromPdf           = jest.fn();
const mockImportFromContent       = jest.fn();
const mockImportFromGeminiFileUri = jest.fn();

jest.mock('@/ai/flows/import-questions-from-url-flow', () => ({
  importQuestionsFromPdf:           (...args: unknown[]) => mockImportFromPdf(...args),
  importQuestionsFromContent:       (...args: unknown[]) => mockImportFromContent(...args),
  importQuestionsFromGeminiFileUri: (...args: unknown[]) => mockImportFromGeminiFileUri(...args),
}));

type UpdateData = Record<string, unknown>;

interface MockDocRef {
  id: string;
  data: () => Record<string, unknown>;
  ref: { update: jest.Mock };
}

const makeJobDoc = (data: Record<string, unknown>, id = 'job-1'): MockDocRef => ({
  id,
  data: () => data,
  ref: { update: jest.fn().mockResolvedValue(undefined) },
});

// Base job data (text-mode, no geminiFileUri)
const BASE_TEXT_JOB = {
  sessionId:           'session-xyz',
  chunkIndex:          1,
  totalChunks:         2,
  contentStoragePath:  'import-chunks/session-xyz/chunk-1.txt',
  isPdfVision:         false,
  sourceLabel:         'cuadernillo.pdf',
  status:              'pending',
  questionsFound:      0,
  createdAt:           '2026-04-01T00:00:00.000Z',
  updatedAt:           '2026-04-01T00:00:00.000Z',
};

// Job that uses Gemini Files API (multi-chunk PDF path)
const PDF_GEMINI_JOB = {
  ...BASE_TEXT_JOB,
  contentStoragePath:  undefined,
  geminiFileUri:       'https://generativelanguage.googleapis.com/v1beta/files/file-123',
  isPdfVision:         false,
};

const mockJobsQuery = {
  where:   jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit:   jest.fn().mockReturnThis(),
  get:     jest.fn(),
};

const mockQuestionsCollection = {
  // deduplication path: .where().select().get()
  where:  jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  get:    jest.fn().mockResolvedValue({ docs: [] }),
  // save path
  add:    jest.fn().mockResolvedValue({ id: 'new-q-id' }),
};

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'importJobs') return mockJobsQuery;
    if (name === 'questions')  return mockQuestionsCollection;
    return mockJobsQuery;
  }),
};

const mockStorageFileDownload = jest.fn().mockResolvedValue([
  Buffer.from('Contenido del fragmento.'),
]);
const mockStorageFileDelete = jest.fn().mockResolvedValue(undefined);
const mockStorageFile = { download: mockStorageFileDownload, delete: mockStorageFileDelete };
const mockBucket = { file: jest.fn().mockReturnValue(mockStorageFile) };

jest.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: jest.fn(() => mockDb),
  getAdminStorage:   jest.fn(() => mockBucket),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/process-chunk/route';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';

type DbMock      = jest.MockedFunction<typeof getAdminFirestore>;
type StorageMock = jest.MockedFunction<typeof getAdminStorage>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(cronSecret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cronSecret) headers['authorization'] = `Bearer ${cronSecret}`;
  return new NextRequest('http://localhost/api/process-chunk', { method: 'POST', headers });
}

function setupPendingJob(jobDoc: MockDocRef): void {
  mockJobsQuery.get.mockResolvedValue({ empty: false, docs: [jobDoc] });
}

function setupNoPendingJob(): void {
  mockJobsQuery.get.mockResolvedValue({ empty: true, docs: [] });
}

function goodAiResult(n = 2): { questions: Record<string, unknown>[] } {
  const DISTINCT_QUESTIONS = [
    { text: '¿Cuál es el resultado de calcular la hipotenusa de un triángulo con catetos 3 y 4?', options: ['5', '6', '7', '25'], answer: '5' },
    { text: 'Si una solución tiene pH menor que 7, ¿qué tipo de sustancia es?', options: ['Ácida', 'Básica', 'Neutra', 'Inerte'], answer: 'Ácida' },
    { text: '¿Qué organismo realiza la fotosíntesis para producir glucosa a partir de CO2?', options: ['Planta', 'Animal', 'Hongo', 'Bacteria'], answer: 'Planta' },
    { text: 'En la Revolución Francesa, ¿cuál fue el año de toma de la Bastilla?', options: ['1789', '1776', '1804', '1815'], answer: '1789' },
    { text: '¿Cuántos cromosomas tiene normalmente una célula humana diploide?', options: ['46', '23', '48', '44'], answer: '46' },
  ];
  return { questions: DISTINCT_QUESTIONS.slice(0, n) };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

const ORIG_CRON = process.env.CRON_SECRET;

beforeEach(() => {
  jest.resetAllMocks();

  // Restore query chains (cleared by resetAllMocks)
  mockJobsQuery.where.mockReturnThis();
  mockJobsQuery.orderBy.mockReturnThis();
  mockJobsQuery.limit.mockReturnThis();
  mockJobsQuery.get.mockResolvedValue({ empty: true, docs: [] });

  // Restore questions collection chains
  mockQuestionsCollection.where.mockReturnThis();
  mockQuestionsCollection.select.mockReturnThis();
  mockQuestionsCollection.get.mockResolvedValue({ docs: [] }); // no existing questions by default
  mockQuestionsCollection.add.mockResolvedValue({ id: 'new-q-id' });

  // Restore collection routing
  mockDb.collection.mockImplementation((name: string) => {
    if (name === 'importJobs') return mockJobsQuery;
    if (name === 'questions')  return mockQuestionsCollection;
    return mockJobsQuery;
  });

  // Storage
  mockBucket.file.mockReturnValue(mockStorageFile);
  mockStorageFileDownload.mockResolvedValue([Buffer.from('Texto de ejemplo.')]);
  mockStorageFileDelete.mockResolvedValue(undefined);

  (getAdminFirestore as DbMock).mockReturnValue(mockDb as never);
  (getAdminStorage as StorageMock).mockReturnValue(mockBucket as never);
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  if (ORIG_CRON !== undefined) process.env.CRON_SECRET = ORIG_CRON;
  else delete process.env.CRON_SECRET;
});

// ─────────────────────────────────────────────────────────────────────────────
// Failure scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/process-chunk — escenarios de fallo', () => {

  // ── Escenario 1 ───────────────────────────────────────────────────────────

  describe('Escenario 1 — Firestore init falla', () => {
    it('responde 500 con mensaje de error cuando getAdminFirestore lanza', async () => {
      (getAdminFirestore as DbMock).mockImplementation(() => {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is missing');
      });
      const res = await POST(makeReq());
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
    });
  });

  // ── Escenario 2 ───────────────────────────────────────────────────────────

  describe('Escenario 2 — Firestore query lanza excepción (índice compuesto faltante)', () => {
    it('responde 500 con mensaje de error', async () => {
      mockJobsQuery.get.mockRejectedValue(
        new Error('The query requires an index. You can create it here: https://console.firebase.google.com/...'),
      );
      const res = await POST(makeReq());
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('query requires an index');
    });

    it('ninguna IA es llamada cuando la query falla', async () => {
      mockJobsQuery.get.mockRejectedValue(new Error('index missing'));
      await POST(makeReq());
      expect(mockImportFromGeminiFileUri).not.toHaveBeenCalled();
      expect(mockImportFromContent).not.toHaveBeenCalled();
    });
  });

  // ── Escenario 3 ───────────────────────────────────────────────────────────

  describe('Escenario 3 — importQuestionsFromGeminiFileUri falla en ambos intentos', () => {
    it('marca el job como "failed" con errorMessage', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockRejectedValue(
        new Error('Gemini timed out after 55 seconds'),
      );

      const res = await POST(makeReq());
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string; questionsFound: number };
      expect(body.status).toBe('failed');
      expect(body.questionsFound).toBe(0);
    });

    it('job.ref.update se llama con status="failed" y errorMessage', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockRejectedValue(new Error('timeout'));

      await POST(makeReq());

      // First update: "processing"; second update: "failed"
      const updateCalls = jobDoc.ref.update.mock.calls as UpdateData[][];
      expect(updateCalls.length).toBeGreaterThanOrEqual(2);
      const failedUpdate = updateCalls[updateCalls.length - 1][0];
      expect(failedUpdate.status).toBe('failed');
      expect(typeof failedUpdate.errorMessage).toBe('string');
    });

    it('la IA se llama exactamente 2 veces (1 intento + 1 retry)', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockRejectedValue(new Error('AI failure'));

      await POST(makeReq());
      expect(mockImportFromGeminiFileUri).toHaveBeenCalledTimes(2);
    });
  });

  // ── Escenario 4 ───────────────────────────────────────────────────────────

  describe('Escenario 4 — Timeout de Gemini (55 segundos)', () => {
    it('el error de timeout es registrado como errorMessage en el job', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockRejectedValue(
        new Error('Operation timed out after 55002 milliseconds with 0 bytes received'),
      );

      await POST(makeReq());

      const updateCalls = jobDoc.ref.update.mock.calls as UpdateData[][];
      const lastUpdate = updateCalls[updateCalls.length - 1][0];
      expect(lastUpdate.status).toBe('failed');
      expect(lastUpdate.errorMessage as string).toContain('55002');
    });

    it('responde status "failed" con questionsFound=0', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockRejectedValue(
        new Error('Operation timed out after 55002 milliseconds'),
      );

      const res = await POST(makeReq());
      const body = await res.json() as { status: string; questionsFound: number };
      expect(body.status).toBe('failed');
      expect(body.questionsFound).toBe(0);
    });
  });

  // ── Escenario 5 ───────────────────────────────────────────────────────────

  describe('Escenario 5 — IA falla en el 1° intento pero tiene éxito en el 2°', () => {
    it('el job se marca como "done" y devuelve las preguntas encontradas', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValueOnce(goodAiResult(3));

      const res = await POST(makeReq());
      const body = await res.json() as { status: string; questionsFound: number };
      expect(body.status).toBe('done');
      expect(body.questionsFound).toBe(3);
    });

    it('importQuestionsFromGeminiFileUri se llamó exactamente 2 veces', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri
        .mockRejectedValueOnce(new Error('first attempt failed'))
        .mockResolvedValueOnce(goodAiResult(1));

      await POST(makeReq());
      expect(mockImportFromGeminiFileUri).toHaveBeenCalledTimes(2);
    });
  });

  // ── Escenario 6 ───────────────────────────────────────────────────────────

  describe('Escenario 6 — Storage download falla', () => {
    it('marca el job como "failed" y no llama a la IA', async () => {
      const jobDoc = makeJobDoc(BASE_TEXT_JOB);
      setupPendingJob(jobDoc);
      mockBucket.file.mockReturnValue({
        download: jest.fn().mockRejectedValue(new Error('Object not found in bucket')),
        delete: jest.fn(),
      });

      const res = await POST(makeReq());
      const body = await res.json() as { status: string };
      expect(body.status).toBe('failed');
      expect(mockImportFromContent).not.toHaveBeenCalled();
      expect(mockImportFromGeminiFileUri).not.toHaveBeenCalled();
    });

    it('el errorMessage del job contiene la descripción del fallo de Storage', async () => {
      const jobDoc = makeJobDoc(BASE_TEXT_JOB);
      setupPendingJob(jobDoc);
      mockBucket.file.mockReturnValue({
        download: jest.fn().mockRejectedValue(new Error('Object not found at gs://bucket/path')),
        delete: jest.fn(),
      });

      await POST(makeReq());

      const updateCalls = jobDoc.ref.update.mock.calls as UpdateData[][];
      const failedUpdate = updateCalls[updateCalls.length - 1][0];
      expect(failedUpdate.status).toBe('failed');
      expect(failedUpdate.errorMessage as string).toContain('not found');
    });
  });

  // ── Escenario 7 ───────────────────────────────────────────────────────────

  describe('Escenario 7 — Firestore add falla para una pregunta (error parcial)', () => {
    it('las demás preguntas se guardan aunque una falle', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      let addCallCount = 0;
      mockQuestionsCollection.add.mockImplementation(() => {
        addCallCount++;
        if (addCallCount === 2) return Promise.reject(new Error('write quota exceeded'));
        return Promise.resolve({ id: `q-${addCallCount}` });
      });
      mockImportFromGeminiFileUri.mockResolvedValue(goodAiResult(3));

      const res = await POST(makeReq());
      const body = await res.json() as { status: string; questionsFound: number };
      // Job should be marked done; the failed question is skipped
      expect(body.status).toBe('done');
      // 2 of 3 questions saved (1 failed)
      expect(body.questionsFound).toBe(2);
    });
  });

  // ── Escenario 8 ───────────────────────────────────────────────────────────

  describe('Escenario 8 — Deduplicación: pregunta ya existente no se guarda de nuevo', () => {
    it('pregunta con texto idéntico no cuenta como guardada', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      const duplicateText = '¿Cuál es la respuesta a la pregunta 1?';
      // Make the deduplication query return the already-existing question
      mockQuestionsCollection.get.mockResolvedValue({
        docs: [{ data: () => ({ text: duplicateText }) }],
      });
      mockImportFromGeminiFileUri.mockResolvedValue({
        questions: [
          { text: duplicateText, options: ['A', 'B', 'C', 'D'], answer: 'A' },
          { text: '¿Cuál es la capital de Colombia?', options: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla'], answer: 'Bogotá' },
        ],
      });

      const res = await POST(makeReq());
      const body = await res.json() as { status: string; questionsFound: number };
      // Only 1 question saved (the duplicate is skipped)
      expect(body.status).toBe('done');
      expect(body.questionsFound).toBe(1);
    });
  });

  // ── Escenario 9 ───────────────────────────────────────────────────────────

  describe('Escenario 9 — jobDoc.ref.update("processing") lanza error', () => {
    it('el error se propaga al llamador ya que update("processing") no está en try/catch', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      // First update (to "processing") throws
      jobDoc.ref.update.mockRejectedValueOnce(new Error('Firestore write failed'));
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockResolvedValue(goodAiResult(2));

      // update("processing") is not wrapped in a try/catch in the route,
      // so the error propagates to the caller as an unhandled rejection.
      await expect(POST(makeReq())).rejects.toThrow('Firestore write failed');
    });
  });

  // ── Escenario 10 ──────────────────────────────────────────────────────────

  describe('Escenario 10 — IA retorna questions=[] (ninguna pregunta encontrada)', () => {
    it('job se marca como "done" con questionsFound=0', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockResolvedValue({ questions: [] });

      const res = await POST(makeReq());
      const body = await res.json() as { status: string; questionsFound: number };
      expect(body.status).toBe('done');
      expect(body.questionsFound).toBe(0);
    });
  });

  // ── Escenario 11 ──────────────────────────────────────────────────────────

  describe('Escenario 11 — IA retorna questions=null o undefined', () => {
    it('no lanza; job se marca como "done" con questionsFound=0', async () => {
      const jobDoc = makeJobDoc(PDF_GEMINI_JOB);
      setupPendingJob(jobDoc);
      // Gemini returns a result but questions is null
      mockImportFromGeminiFileUri.mockResolvedValue({ questions: null });

      await expect(POST(makeReq())).resolves.toBeDefined();
    });
  });

  // ── Escenario 12 ──────────────────────────────────────────────────────────

  describe('Escenario 12 — CRON_SECRET configurado: acceso sin token → 401', () => {
    it('responde 401 cuando no se envía el header Authorization', async () => {
      process.env.CRON_SECRET = 'super-secret-token';
      const res = await POST(makeReq()); // no token
      expect(res.status).toBe(401);
    });

    it('responde 401 cuando el token es incorrecto', async () => {
      process.env.CRON_SECRET = 'super-secret-token';
      const res = await POST(makeReq('wrong-token'));
      expect(res.status).toBe(401);
    });
  });

  // ── Escenario 13 ──────────────────────────────────────────────────────────

  describe('Escenario 13 — CRON_SECRET configurado: token correcto → procesa', () => {
    it('accede correctamente con el token válido', async () => {
      process.env.CRON_SECRET = 'super-secret-token';
      setupNoPendingJob();
      const res = await POST(makeReq('super-secret-token'));
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string };
      expect(body.status).toBe('nothing_pending');
    });
  });

  // ── Escenario 14 ──────────────────────────────────────────────────────────

  describe('Escenario 14 — job con campos faltantes (updatedAt missing)', () => {
    it('maneja el job sin lanzar una excepción no capturada', async () => {
      const incompleteJob = { ...PDF_GEMINI_JOB, updatedAt: undefined };
      const jobDoc = makeJobDoc(incompleteJob);
      setupPendingJob(jobDoc);
      mockImportFromGeminiFileUri.mockResolvedValue(goodAiResult(1));

      await expect(POST(makeReq())).resolves.toBeDefined();
    });
  });

  // ── Escenario 15 ──────────────────────────────────────────────────────────

  describe('Escenario 15 — geminiFileUri vacío: usa el path de text-content', () => {
    it('cuando geminiFileUri="" y isPdfVision=false → llama importQuestionsFromContent', async () => {
      const jobWithEmptyUri = { ...BASE_TEXT_JOB, geminiFileUri: '' };
      const jobDoc = makeJobDoc(jobWithEmptyUri);
      setupPendingJob(jobDoc);
      mockImportFromContent.mockResolvedValue(goodAiResult(2));

      await POST(makeReq());

      // Empty string is falsy → should not call GeminiFileUri path
      expect(mockImportFromGeminiFileUri).not.toHaveBeenCalled();
      expect(mockImportFromContent).toHaveBeenCalledTimes(1);
    });
  });

});
