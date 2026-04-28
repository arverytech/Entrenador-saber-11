/**
 * @jest-environment node
 *
 * @file Tests for automatic retry with exponential backoff in POST /api/process-chunk.
 *
 * Scenarios covered:
 *
 * Grupo A — Clasificación de errores transitorios
 *   A1.  Error 429 RESOURCE_EXHAUSTED → clasificado como transitorio '429'
 *   A2.  Error 503 UNAVAILABLE → clasificado como transitorio '503'
 *   A3.  Error genérico (timeout, etc.) → clasificado como no-transitorio (null)
 *   A4.  Error con texto "quota" → clasificado como transitorio '429'
 *
 * Grupo B — Cálculo de backoff exponencial
 *   B1.  calculateBackoffMs: 503, intentos 0 → ~2 min base
 *   B2.  calculateBackoffMs: 429, intentos 0 → ~10 min base
 *   B3.  calculateBackoffMs: backoff crece con intentos (exponencial)
 *   B4.  calculateBackoffMs: tope 2 horas
 *
 * Grupo C — Job no elegible antes de nextAttemptAt
 *   C1.  Job con nextAttemptAt en el futuro → devuelve nothing_pending
 *   C2.  Job con nextAttemptAt en el pasado → procesado normalmente
 *   C3.  Job sin nextAttemptAt (legacy) → procesado normalmente
 *   C4.  Mix: primer job en backoff, segundo elegible → procesa el segundo
 *
 * Grupo D — Error 429 / 503 → backoff + status pending
 *   D1.  Error 429 → status queda 'pending', se guarda attemptCount/nextAttemptAt/lastErrorCode
 *   D2.  Error 503 → status queda 'pending', se guarda attemptCount/nextAttemptAt/lastErrorCode
 *   D3.  respuesta con status 'retrying' y nextAttemptAt para 429/503
 *   D4.  nextAttemptAt de 503 es menor que nextAttemptAt de 429 (base más corta)
 *
 * Grupo E — Umbral de intentos → fallo definitivo
 *   E1.  attemptCount ≥ MAX_ATTEMPT_COUNT → marcado 'failed' aunque el error sea 429
 *   E2.  attemptCount < MAX_ATTEMPT_COUNT → todavía se reintenta con backoff
 *
 * Grupo F — Recovery de stuck jobs preserva attemptCount y limpia nextAttemptAt
 *   F1.  Al resetear un stuck job, nextAttemptAt se limpia a ''
 *   F2.  Al resetear un stuck job, attemptCount NO es sobreescrito
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

// Shared reset-batch mock
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

const mockStorageFileDownload = jest.fn().mockResolvedValue([Buffer.from('texto')]);
const mockStorageFileDelete   = jest.fn().mockResolvedValue(undefined);
const mockStorageFile = { download: mockStorageFileDownload, delete: mockStorageFileDelete };
const mockBucket = { file: jest.fn().mockReturnValue(mockStorageFile) };

jest.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: jest.fn(() => mockDb),
  getAdminStorage:   jest.fn(() => mockBucket),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import {
  POST,
  getTransientErrorCode,
  calculateBackoffMs,
  MAX_ATTEMPT_COUNT,
} from '@/app/api/process-chunk/route';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';

type DbMock      = jest.MockedFunction<typeof getAdminFirestore>;
type StorageMock = jest.MockedFunction<typeof getAdminStorage>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/process-chunk', { method: 'POST' });
}

/** Sequence: first get() → stuckSnap, second get() → pendingSnap */
function setupGetSequence(stuckDocs: MockDocRef[], pendingDocs: MockDocRef[]): void {
  mockJobsQuery.get
    .mockResolvedValueOnce({ empty: stuckDocs.length === 0, docs: stuckDocs })
    .mockResolvedValueOnce({ empty: pendingDocs.length === 0, docs: pendingDocs });
}

function geminiJob(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId:      'sess-1',
    chunkIndex:     1,
    totalChunks:    2,
    geminiFileUri:  'https://generativelanguage.googleapis.com/v1beta/files/f-1',
    isPdfVision:    false,
    sourceLabel:    'test.pdf',
    status:         'pending',
    questionsFound: 0,
    createdAt:      '2026-04-01T00:00:00.000Z',
    updatedAt:      '2026-04-01T00:00:00.000Z',
    ...extra,
  };
}

const ONE_QUESTION = {
  questions: [{ text: '¿Cuál es 1+1?', options: ['1', '2', '3', '4'], correctAnswerIndex: 1, subjectId: 'mat' }],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

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
  mockStorageFileDownload.mockResolvedValue([Buffer.from('texto')]);
  mockStorageFileDelete.mockResolvedValue(undefined);

  mockImportFromGeminiFileUri.mockResolvedValue(ONE_QUESTION);

  (getAdminFirestore as DbMock).mockReturnValue(mockDb as never);
  (getAdminStorage as StorageMock).mockReturnValue(mockBucket as never);
  delete process.env.CRON_SECRET;
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo A — Clasificación de errores transitorios
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo A — Clasificación de errores transitorios', () => {
  it('A1 — 429 RESOURCE_EXHAUSTED → transitorio "429"', () => {
    const err = new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED: You exceed your current quota');
    expect(getTransientErrorCode(err)).toBe('429');
  });

  it('A2 — 503 UNAVAILABLE → transitorio "503"', () => {
    const err = new Error('[503 Service Unavailable] UNAVAILABLE: This model is currently experiencing high demand');
    expect(getTransientErrorCode(err)).toBe('503');
  });

  it('A3 — error genérico → null (no transitorio)', () => {
    const err = new Error('Timeout de 45s esperando respuesta de Gemini');
    expect(getTransientErrorCode(err)).toBeNull();
  });

  it('A4 — texto "quota" → transitorio "429"', () => {
    const err = new Error('generate_content_free_tier_requests_limit quota exceeded');
    expect(getTransientErrorCode(err)).toBe('429');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo B — Cálculo de backoff exponencial
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo B — Cálculo de backoff exponencial', () => {
  it('B1 — 503 con 0 intentos previos → cerca de 2 min (dentro de margen ±25%)', () => {
    const BASE_MS = 2 * 60 * 1000;
    const result  = calculateBackoffMs(0, '503');
    expect(result).toBeGreaterThanOrEqual(BASE_MS * 0.75);
    expect(result).toBeLessThanOrEqual(BASE_MS * 1.25);
  });

  it('B2 — 429 con 0 intentos previos → cerca de 10 min (dentro de margen ±25%)', () => {
    const BASE_MS = 10 * 60 * 1000;
    const result  = calculateBackoffMs(0, '429');
    expect(result).toBeGreaterThanOrEqual(BASE_MS * 0.75);
    expect(result).toBeLessThanOrEqual(BASE_MS * 1.25);
  });

  it('B3 — el backoff crece con cada intento (esperanza es exponencial)', () => {
    // Compare median estimates ignoring jitter by running multiple samples
    const avg = (code: '429' | '503', n: number) =>
      Array.from({ length: 30 }, () => calculateBackoffMs(n, code)).reduce((a, b) => a + b, 0) / 30;

    expect(avg('503', 1)).toBeGreaterThan(avg('503', 0));
    expect(avg('503', 2)).toBeGreaterThan(avg('503', 1));
    expect(avg('429', 1)).toBeGreaterThan(avg('429', 0));
  });

  it('B4 — el backoff nunca supera las 2 horas', () => {
    const MAX_MS = 2 * 60 * 60 * 1000;
    for (let i = 0; i <= 20; i++) {
      expect(calculateBackoffMs(i, '503')).toBeLessThanOrEqual(MAX_MS * 1.25);
      expect(calculateBackoffMs(i, '429')).toBeLessThanOrEqual(MAX_MS * 1.25);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo C — Job no elegible antes de nextAttemptAt
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo C — Elegibilidad de jobs según nextAttemptAt', () => {
  it('C1 — nextAttemptAt en el futuro → nothing_pending', async () => {
    const futureTs = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const job = makeJobDoc(geminiJob({ nextAttemptAt: futureTs }), 'future-job');
    setupGetSequence([], [job]);

    const res  = await POST(makeReq());
    const body = await res.json() as { status: string };
    expect(body.status).toBe('nothing_pending');
  });

  it('C2 — nextAttemptAt en el pasado → procesado normalmente', async () => {
    const pastTs = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const job = makeJobDoc(geminiJob({ nextAttemptAt: pastTs }), 'past-job');
    setupGetSequence([], [job]);

    const res  = await POST(makeReq());
    const body = await res.json() as { status: string };
    expect(body.status).toBe('done');
  });

  it('C3 — sin campo nextAttemptAt (legacy) → procesado normalmente', async () => {
    const job = makeJobDoc(geminiJob(), 'legacy-job');
    setupGetSequence([], [job]);

    const res  = await POST(makeReq());
    const body = await res.json() as { status: string };
    expect(body.status).toBe('done');
  });

  it('C4 — primer job en backoff, segundo elegible → procesa el segundo', async () => {
    const futureTs = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const backoffJob  = makeJobDoc(
      geminiJob({ nextAttemptAt: futureTs, createdAt: '2026-04-01T00:00:00.000Z' }),
      'backoff-job',
    );
    const readyJob = makeJobDoc(
      geminiJob({ createdAt: '2026-04-01T01:00:00.000Z' }),
      'ready-job',
    );

    // Pending query returns both docs ordered by createdAt
    mockJobsQuery.get
      .mockResolvedValueOnce({ empty: true, docs: [] })                        // stuck query
      .mockResolvedValueOnce({ empty: false, docs: [backoffJob, readyJob] });  // pending query

    const res  = await POST(makeReq());
    const body = await res.json() as { status: string; processed: string };
    expect(body.status).toBe('done');
    expect(body.processed).toBe('ready-job');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo D — Error 429 / 503 → backoff + status pending
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo D — Error 429/503 → backoff automático', () => {
  it('D1 — error 429 → job queda "pending" con attemptCount, nextAttemptAt, lastErrorCode', async () => {
    const job = makeJobDoc(geminiJob(), 'job-429');
    setupGetSequence([], [job]);

    mockImportFromGeminiFileUri.mockRejectedValue(
      new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED: quota exceeded'),
    );

    await POST(makeReq());

    const updateCalls = job.ref.update.mock.calls as UpdateData[][];
    const backoffUpdate = updateCalls.find(([d]) => d.status === 'pending');
    expect(backoffUpdate).toBeDefined();
    const data = backoffUpdate![0] as UpdateData;
    expect(data.status).toBe('pending');
    expect(data.attemptCount).toBe(1);
    expect(typeof data.nextAttemptAt).toBe('string');
    expect(data.lastErrorCode).toBe('429');
  });

  it('D2 — error 503 → job queda "pending" con attemptCount, nextAttemptAt, lastErrorCode', async () => {
    const job = makeJobDoc(geminiJob(), 'job-503');
    setupGetSequence([], [job]);

    mockImportFromGeminiFileUri.mockRejectedValue(
      new Error('[503 Service Unavailable] UNAVAILABLE: high demand'),
    );

    await POST(makeReq());

    const updateCalls = job.ref.update.mock.calls as UpdateData[][];
    const backoffUpdate = updateCalls.find(([d]) => d.status === 'pending');
    expect(backoffUpdate).toBeDefined();
    const data = backoffUpdate![0] as UpdateData;
    expect(data.status).toBe('pending');
    expect(data.attemptCount).toBe(1);
    expect(typeof data.nextAttemptAt).toBe('string');
    expect(data.lastErrorCode).toBe('503');
  });

  it('D3 — respuesta devuelve status "retrying" y nextAttemptAt', async () => {
    const job = makeJobDoc(geminiJob(), 'job-retrying');
    setupGetSequence([], [job]);

    mockImportFromGeminiFileUri.mockRejectedValue(
      new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED: quota'),
    );

    const res  = await POST(makeReq());
    const body = await res.json() as { status: string; nextAttemptAt: string };
    expect(body.status).toBe('retrying');
    expect(typeof body.nextAttemptAt).toBe('string');
    expect(new Date(body.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('D4 — nextAttemptAt de 503 es menor que nextAttemptAt de 429 (base más corta)', async () => {
    const get503At = () => {
      const job = makeJobDoc(geminiJob(), 'j-503');
      mockJobsQuery.get
        .mockResolvedValueOnce({ empty: true, docs: [] })
        .mockResolvedValueOnce({ empty: false, docs: [job] });
      mockImportFromGeminiFileUri.mockRejectedValue(new Error('[503] UNAVAILABLE'));
      return POST(makeReq()).then((r) => r.json() as Promise<{ nextAttemptAt: string }>);
    };

    const get429At = () => {
      const job = makeJobDoc(geminiJob(), 'j-429');
      mockJobsQuery.get
        .mockResolvedValueOnce({ empty: true, docs: [] })
        .mockResolvedValueOnce({ empty: false, docs: [job] });
      mockImportFromGeminiFileUri.mockRejectedValue(new Error('[429] RESOURCE_EXHAUSTED'));
      return POST(makeReq()).then((r) => r.json() as Promise<{ nextAttemptAt: string }>);
    };

    const r503 = await get503At();
    const r429 = await get429At();

    expect(new Date(r503.nextAttemptAt).getTime())
      .toBeLessThan(new Date(r429.nextAttemptAt).getTime());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo E — Umbral de intentos → fallo definitivo
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo E — Umbral de intentos MAX_ATTEMPT_COUNT', () => {
  it('E1 — attemptCount ≥ MAX_ATTEMPT_COUNT → failed definitivo aunque sea error 429', async () => {
    const job = makeJobDoc(geminiJob({ attemptCount: MAX_ATTEMPT_COUNT }), 'max-job');
    setupGetSequence([], [job]);

    mockImportFromGeminiFileUri.mockRejectedValue(
      new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED: quota'),
    );

    const res  = await POST(makeReq());
    const body = await res.json() as { status: string };
    expect(body.status).toBe('failed');

    // Must update to failed, not pending
    const updateCalls = job.ref.update.mock.calls as UpdateData[][];
    const lastUpdate = updateCalls[updateCalls.length - 1][0] as UpdateData;
    expect(lastUpdate.status).toBe('failed');
  });

  it('E2 — attemptCount < MAX_ATTEMPT_COUNT → sigue reintentando con backoff', async () => {
    const job = makeJobDoc(geminiJob({ attemptCount: MAX_ATTEMPT_COUNT - 2 }), 'below-max-job');
    setupGetSequence([], [job]);

    mockImportFromGeminiFileUri.mockRejectedValue(
      new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED: quota'),
    );

    const res  = await POST(makeReq());
    const body = await res.json() as { status: string };
    expect(body.status).toBe('retrying');

    const updateCalls = job.ref.update.mock.calls as UpdateData[][];
    const pendingUpdate = updateCalls.find(([d]) => d.status === 'pending');
    expect(pendingUpdate).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo F — Recovery de stuck jobs: nextAttemptAt se limpia
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo F — Recovery de stuck jobs preserva attemptCount y limpia nextAttemptAt', () => {
  it('F1 — al resetear un stuck job, nextAttemptAt se pone a ""', async () => {
    const stuckDoc = makeJobDoc(
      {
        status: 'processing',
        // A very old updatedAt ensures this job exceeds the 5-minute stuck threshold
        updatedAt: '2026-01-01T00:00:00.000Z',
        attemptCount: 3,
        nextAttemptAt: '2026-05-01T00:00:00.000Z',
      },
      'stuck-with-backoff',
    );
    setupGetSequence([stuckDoc], []);

    await POST(makeReq());

    expect(mockResetBatch.update).toHaveBeenCalledTimes(1);
    const [, updateData] = mockResetBatch.update.mock.calls[0] as [unknown, UpdateData];
    expect(updateData.status).toBe('pending');
    expect(updateData.nextAttemptAt).toBe('');
  });

  it('F2 — al resetear un stuck job, attemptCount NO es sobreescrito por el batch update', async () => {
    const stuckDoc = makeJobDoc(
      {
        status: 'processing',
        // A very old updatedAt ensures this job exceeds the 5-minute stuck threshold
        updatedAt: '2026-01-01T00:00:00.000Z',
        attemptCount: 5,
      },
      'stuck-with-count',
    );
    setupGetSequence([stuckDoc], []);

    await POST(makeReq());

    const [, updateData] = mockResetBatch.update.mock.calls[0] as [unknown, UpdateData];
    // The batch update should NOT include attemptCount (Firestore won't overwrite it)
    expect(updateData.attemptCount).toBeUndefined();
  });
});
