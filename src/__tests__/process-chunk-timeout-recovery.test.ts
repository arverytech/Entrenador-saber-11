/**
 * @jest-environment node
 *
 * @file Tests for POST /api/process-chunk — MEDIDA 2 (stuck-job recovery) and
 *       MEDIDA 3 (45-second Gemini timeout) and subjectId override.
 *
 * Scenarios covered:
 *
 * Recovery (MEDIDA 2):
 *   1.  Un job atascado en "processing" > 5 min → se resetea a "pending"
 *   2.  Varios jobs atascados → todos se resetean a "pending"
 *   3.  Recovery query lanza excepción → error no fatal, la ejecución continúa
 *   4.  Sin jobs atascados → ningún batch.update es llamado
 *
 * Timeout (MEDIDA 3):
 *   5.  La IA no responde en 45 s → timeout activo → job marcado "failed"
 *   6.  El mensaje de error contiene la duración del timeout
 *   7.  1° intento hace timeout, 2° tiene éxito → job marcado "done"
 *
 * subjectId (MEDIDA 5):
 *   8.  job.subjectId está definido → sobreescribe el subjectId inferido por la IA
 *   9.  job.subjectId ausente → el subjectId de la IA se guarda tal cual
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

// Shared reset-batch mock (for stuck-job recovery)
const mockResetBatch = {
  update: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

const mockJobsQuery = {
  where:   jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit:   jest.fn().mockReturnThis(),
  get:     jest.fn(),
};

const mockQuestionsCollection = {
  where:  jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  get:    jest.fn().mockResolvedValue({ docs: [] }),
  add:    jest.fn().mockResolvedValue({ id: 'new-q-id' }),
};

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'importJobs') return mockJobsQuery;
    if (name === 'questions')  return mockQuestionsCollection;
    return mockJobsQuery;
  }),
  batch: jest.fn(() => mockResetBatch),
};

const mockStorageFileDownload = jest.fn().mockResolvedValue([Buffer.from('Texto de ejemplo.')]);
const mockStorageFileDelete   = jest.fn().mockResolvedValue(undefined);
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

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/process-chunk', { method: 'POST' });
}

/** Sequence: first get() → stuckSnap, second get() → pendingSnap */
function setupGetSequence(
  stuckDocs: MockDocRef[],
  pendingDocs: MockDocRef[],
): void {
  mockJobsQuery.get
    .mockResolvedValueOnce({ empty: stuckDocs.length === 0, docs: stuckDocs })
    .mockResolvedValueOnce({ empty: pendingDocs.length === 0, docs: pendingDocs });
}

function pdfGeminiJob(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId:      'session-xyz',
    chunkIndex:     1,
    totalChunks:    2,
    geminiFileUri:  'https://generativelanguage.googleapis.com/v1beta/files/file-abc',
    isPdfVision:    false,
    sourceLabel:    'cuadernillo.pdf',
    status:         'pending',
    questionsFound: 0,
    createdAt:      '2026-04-01T00:00:00.000Z',
    updatedAt:      '2026-04-01T00:00:00.000Z',
    ...extra,
  };
}

function goodAiResult(subjectId = 'matematicas') {
  return {
    questions: [
      {
        text: '¿Cuál es el resultado de 2 + 2?',
        options: ['3', '4', '5', '6'],
        correctAnswerIndex: 1,
        subjectId,
      },
    ],
  };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

const ORIG_CRON = process.env.CRON_SECRET;

beforeEach(() => {
  jest.resetAllMocks();

  mockJobsQuery.where.mockReturnThis();
  mockJobsQuery.orderBy.mockReturnThis();
  mockJobsQuery.limit.mockReturnThis();

  mockQuestionsCollection.where.mockReturnThis();
  mockQuestionsCollection.select.mockReturnThis();
  mockQuestionsCollection.get.mockResolvedValue({ docs: [] });
  mockQuestionsCollection.add.mockResolvedValue({ id: 'new-q-id' });

  mockDb.collection.mockImplementation((name: string) => {
    if (name === 'importJobs') return mockJobsQuery;
    if (name === 'questions')  return mockQuestionsCollection;
    return mockJobsQuery;
  });
  mockDb.batch.mockReturnValue(mockResetBatch);
  mockResetBatch.update.mockClear();
  mockResetBatch.commit.mockResolvedValue(undefined);

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
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// MEDIDA 2 — Recovery de jobs atascados
// ─────────────────────────────────────────────────────────────────────────────

describe('MEDIDA 2 — Recovery de jobs atascados', () => {

  describe('Escenario 1 — Un job atascado en "processing" > 5 min', () => {
    it('llama a batch.update para resetear el job a "pending"', async () => {
      const stuckDoc = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:00:00.000Z' }, 'stuck-1');
      stuckDoc.ref = { update: jest.fn().mockResolvedValue(undefined) };

      setupGetSequence([stuckDoc], []);

      await POST(makeReq());

      expect(mockResetBatch.update).toHaveBeenCalledTimes(1);
      const updateArgs = mockResetBatch.update.mock.calls[0] as [unknown, UpdateData];
      expect(updateArgs[1].status).toBe('pending');
      expect(typeof updateArgs[1].updatedAt).toBe('string');
      expect(typeof updateArgs[1].errorMessage).toBe('string');
    });

    it('llama a batch.commit para persistir el reset', async () => {
      const stuckDoc = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:00:00.000Z' }, 'stuck-2');
      setupGetSequence([stuckDoc], []);

      await POST(makeReq());

      expect(mockResetBatch.commit).toHaveBeenCalledTimes(1);
    });

    it('después del reset continúa buscando un job "pending"', async () => {
      const stuckDoc  = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:00:00.000Z' }, 'stuck-3');
      const pendingJob = makeJobDoc(pdfGeminiJob(), 'pending-1');
      setupGetSequence([stuckDoc], [pendingJob]);
      mockImportFromGeminiFileUri.mockResolvedValue(goodAiResult());

      const res = await POST(makeReq());
      const body = await res.json() as { status: string };
      expect(body.status).toBe('done');
    });
  });

  describe('Escenario 2 — Varios jobs atascados', () => {
    it('llama a batch.update una vez por cada job atascado', async () => {
      const stuck1 = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:00:00.000Z' }, 's-1');
      const stuck2 = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:01:00.000Z' }, 's-2');
      const stuck3 = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:02:00.000Z' }, 's-3');
      setupGetSequence([stuck1, stuck2, stuck3], []);

      await POST(makeReq());

      expect(mockResetBatch.update).toHaveBeenCalledTimes(3);
    });

    it('todos los updates incluyen status="pending"', async () => {
      const stuck1 = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:00:00.000Z' }, 'sm-1');
      const stuck2 = makeJobDoc({ status: 'processing', updatedAt: '2026-04-01T00:01:00.000Z' }, 'sm-2');
      setupGetSequence([stuck1, stuck2], []);

      await POST(makeReq());

      for (const call of mockResetBatch.update.mock.calls as [unknown, UpdateData][]) {
        expect(call[1].status).toBe('pending');
      }
    });
  });

  describe('Escenario 3 — Recovery query lanza excepción', () => {
    it('el error es no-fatal: la ejecución continúa y procesa el job pendiente', async () => {
      // First get() (stuck query) → throws
      const pendingDoc = makeJobDoc(pdfGeminiJob(), 'p-job-1');
      mockJobsQuery.get
        .mockRejectedValueOnce(new Error('Firestore index missing for stuck recovery'))
        .mockResolvedValueOnce({ empty: false, docs: [pendingDoc] });
      mockImportFromGeminiFileUri.mockResolvedValue(goodAiResult());

      const res = await POST(makeReq());
      const body = await res.json() as { status: string };
      // Should still process the pending job
      expect(body.status).toBe('done');
    });

    it('no lanza excepción al caller cuando la recovery query falla', async () => {
      mockJobsQuery.get
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ empty: true, docs: [] });

      await expect(POST(makeReq())).resolves.toBeDefined();
    });
  });

  describe('Escenario 4 — Sin jobs atascados', () => {
    it('batch.update NO es llamado cuando no hay jobs atascados', async () => {
      setupGetSequence([], []);

      await POST(makeReq());

      expect(mockResetBatch.update).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEDIDA 3 — Timeout de 45 segundos para llamadas a Gemini
// ─────────────────────────────────────────────────────────────────────────────

describe('MEDIDA 3 — Timeout de 45 segundos para Gemini', () => {

  describe('Escenario 5 — La IA no responde en 45 s → timeout activo', () => {
    it('el job se marca como "failed" con mensaje de timeout', async () => {
      jest.useFakeTimers();
      const pendingDoc = makeJobDoc(pdfGeminiJob(), 'timeout-job-1');
      setupGetSequence([], [pendingDoc]);

      // AI hangs forever
      mockImportFromGeminiFileUri.mockImplementation(
        () => new Promise(() => { /* never resolves */ }),
      );

      const resultPromise = POST(makeReq());
      // Advance past the 45 s timeout (fire both attempts)
      await jest.advanceTimersByTimeAsync(46_000);
      await jest.advanceTimersByTimeAsync(46_000);
      const res = await resultPromise;
      const body = await res.json() as { status: string; questionsFound: number };

      expect(body.status).toBe('failed');
      expect(body.questionsFound).toBe(0);
    });
  });

  describe('Escenario 6 — Mensaje de error contiene la duración del timeout', () => {
    it('errorMessage incluye "45" para indicar los 45 segundos', async () => {
      jest.useFakeTimers();
      const pendingDoc = makeJobDoc(pdfGeminiJob(), 'timeout-job-2');
      setupGetSequence([], [pendingDoc]);

      mockImportFromGeminiFileUri.mockImplementation(
        () => new Promise(() => { /* never resolves */ }),
      );

      const resultPromise = POST(makeReq());
      await jest.advanceTimersByTimeAsync(46_000);
      await jest.advanceTimersByTimeAsync(46_000);
      await resultPromise;

      const updateCalls = pendingDoc.ref.update.mock.calls as UpdateData[][];
      const failedUpdate = updateCalls[updateCalls.length - 1][0];
      expect(failedUpdate.status).toBe('failed');
      expect(failedUpdate.errorMessage as string).toContain('45');
    });
  });

  describe('Escenario 7 — 1° intento hace timeout, 2° tiene éxito', () => {
    it('el job se marca como "done" y devuelve las preguntas', async () => {
      jest.useFakeTimers();
      const pendingDoc = makeJobDoc(pdfGeminiJob(), 'timeout-job-3');
      setupGetSequence([], [pendingDoc]);

      mockImportFromGeminiFileUri
        .mockImplementationOnce(() => new Promise(() => { /* hang */ }))
        .mockResolvedValueOnce(goodAiResult());

      const resultPromise = POST(makeReq());
      // Advance past first timeout
      await jest.advanceTimersByTimeAsync(46_000);
      const res = await resultPromise;
      const body = await res.json() as { status: string; questionsFound: number };

      expect(body.status).toBe('done');
      expect(body.questionsFound).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEDIDA 5 — subjectId desde el job sobreescribe el de la IA
// ─────────────────────────────────────────────────────────────────────────────

describe('MEDIDA 5 — subjectId del job sobreescribe el inferido por la IA', () => {

  describe('Escenario 8 — job.subjectId definido', () => {
    it('el subjectId del job se usa al guardar la pregunta', async () => {
      const pendingDoc = makeJobDoc(pdfGeminiJob({ subjectId: 'naturales' }), 'subj-job-1');
      setupGetSequence([], [pendingDoc]);

      // AI returns a question with a different subjectId
      mockImportFromGeminiFileUri.mockResolvedValue(goodAiResult('matematicas'));

      await POST(makeReq());

      expect(mockQuestionsCollection.add).toHaveBeenCalledTimes(1);
      const savedData = mockQuestionsCollection.add.mock.calls[0][0] as Record<string, unknown>;
      expect(savedData.subjectId).toBe('naturales');
    });
  });

  describe('Escenario 9 — job.subjectId ausente', () => {
    it('el subjectId inferido por la IA se usa al guardar la pregunta', async () => {
      const pendingDoc = makeJobDoc(pdfGeminiJob(), 'subj-job-2'); // no subjectId
      setupGetSequence([], [pendingDoc]);

      mockImportFromGeminiFileUri.mockResolvedValue(goodAiResult('sociales'));

      await POST(makeReq());

      expect(mockQuestionsCollection.add).toHaveBeenCalledTimes(1);
      const savedData = mockQuestionsCollection.add.mock.calls[0][0] as Record<string, unknown>;
      expect(savedData.subjectId).toBe('sociales');
    });
  });
});
