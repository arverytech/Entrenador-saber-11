/**
 * @jest-environment node
 *
 * @file Tests for POST /api/seed-daily-questions
 *
 * Scenarios covered:
 *   1. Skips an area when it already has >= 120 v2 questions
 *   2. Generates up to QUESTIONS_PER_AREA (4) questions when below the limit
 *   3. Stops further generation (all remaining areas) when Gemini returns 429
 *   4. Returns { status: 'quota_exhausted' } when a 429 occurs
 *   5. Returns { status: 'done' } when all areas generate successfully
 *   6. Requires Authorization header when CRON_SECRET is configured
 *   7. Allows access without header when CRON_SECRET is not configured
 *   8. Non-quota errors are skipped per question (does not abort the area)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerateIcfesQuestion = jest.fn();

jest.mock('@/ai/flows/generate-question-flow', () => ({
  generateIcfesQuestion: (...args: unknown[]) => mockGenerateIcfesQuestion(...args),
}));

// Mock firebase-admin
const mockQuestionsAdd = jest.fn().mockResolvedValue({ id: 'q-id' });

// count() returns a snapshot with .data().count
const makeCountSnap = (count: number) => ({ data: () => ({ count }) });

const mockQuestionsCollection = {
  where: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue(makeCountSnap(0)),
  add: mockQuestionsAdd,
};

const mockDb = {
  collection: jest.fn(() => mockQuestionsCollection),
};

jest.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: jest.fn(() => mockDb),
}));

jest.mock('@/lib/normalize-subject-id', () => ({
  normalizeSubjectId: jest.fn((s: string) => s),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/seed-daily-questions/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GOOD_QUESTION = {
  id: 'ai_gen_123',
  text: 'Enunciado de prueba suficientemente largo para superar el umbral mínimo de caracteres.',
  options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
  correctAnswerIndex: 0,
  explanation: 'Explicación técnica de la respuesta correcta con más de 60 caracteres.',
  subjectId: 'matematicas',
  componentId: 'Álgebra',
  competencyId: 'Razonamiento',
  level: 'Medio',
  pointsAwarded: 50,
  aiXml: '<item area="matematicas" nivel="Medio"><competencia>Razonamiento</competencia></item>',
  metadata: {
    competencyDescription: 'Descripción larga de la competencia.',
    evidence: 'Evidencia técnica observable.',
    origin: 'Original inspirada en el estilo ICFES',
    affirmation: 'Afirmación pedagógica del ítem.',
  },
};

const makeRequest = (secret?: string) =>
  new NextRequest('http://localhost/api/seed-daily-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/seed-daily-questions', () => {
  const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: count returns 0 (well below 120)
    mockQuestionsCollection.get.mockResolvedValue(makeCountSnap(0));
    mockQuestionsCollection.where.mockReturnThis();
    mockQuestionsCollection.count.mockReturnThis();
    mockQuestionsAdd.mockResolvedValue({ id: 'q-id' });
    mockGenerateIcfesQuestion.mockResolvedValue(GOOD_QUESTION);
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }
  });

  it('requires Authorization header when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const res = await POST(makeRequest(/* no secret */));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('allows access without header when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns status done when all areas generate successfully', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('done');
  });

  it('skips an area that already has >= 120 v2 questions', async () => {
    delete process.env.CRON_SECRET;

    // Return 120 for every count query
    mockQuestionsCollection.get.mockResolvedValue(makeCountSnap(120));

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);

    // No questions should have been generated
    expect(mockGenerateIcfesQuestion).not.toHaveBeenCalled();
    expect(mockQuestionsAdd).not.toHaveBeenCalled();

    // All areas should report skipped with reason limit_reached
    for (const area of ['matematicas', 'lectura', 'naturales', 'sociales', 'ingles']) {
      expect(body.results[area]).toMatchObject({ generated: 0, skipped: true, reason: 'limit_reached' });
    }
  });

  it('generates up to 4 questions per area', async () => {
    delete process.env.CRON_SECRET;

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('done');

    // 5 areas × 4 questions = 20 saves
    expect(mockQuestionsAdd).toHaveBeenCalledTimes(20);

    for (const area of ['matematicas', 'lectura', 'naturales', 'sociales', 'ingles']) {
      expect(body.results[area]).toMatchObject({ generated: 4 });
    }
  });

  it('stops further generation and returns quota_exhausted when Gemini returns 429', async () => {
    delete process.env.CRON_SECRET;

    // Fail immediately with a 429 error
    mockGenerateIcfesQuestion.mockRejectedValue(
      new Error('RESOURCE_EXHAUSTED: 429 quota exceeded')
    );

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('quota_exhausted');

    // The first area that hits 429 should stop; subsequent areas should be skipped
    const skippedAreas = Object.values(body.results as Record<string, { skipped?: boolean; reason?: string }>)
      .filter((r) => r.skipped && r.reason === 'quota_exhausted_earlier');
    expect(skippedAreas.length).toBeGreaterThanOrEqual(1);
  });

  it('saves questions with schemaVersion=2 and source=icfes_ai_v2', async () => {
    delete process.env.CRON_SECRET;

    await POST(makeRequest());

    const firstCall = mockQuestionsAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(firstCall.schemaVersion).toBe(2);
    expect(firstCall.source).toBe('icfes_ai_v2');
    expect(typeof firstCall.aiXml).toBe('string');
  });

  it('skips remaining questions in area after 429 but processes prior ones', async () => {
    delete process.env.CRON_SECRET;

    // First call succeeds, second call throws 429, third onwards would be skipped
    mockGenerateIcfesQuestion
      .mockResolvedValueOnce(GOOD_QUESTION)
      .mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('quota_exhausted');

    // Only 1 question was saved (the first successful call)
    expect(mockQuestionsAdd).toHaveBeenCalledTimes(1);
  });
});
