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
import { POST, getRotationDay, getDayOfYear } from '@/app/api/seed-daily-questions/route';

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
    // Pin to Day A: 2026-05-04 UTC (UTC day = 4, even → Day A: matematicas, lectura, naturales)
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-04T12:00:00Z'));
    // Default: count returns 0 (well below 120)
    mockQuestionsCollection.get.mockResolvedValue(makeCountSnap(0));
    mockQuestionsCollection.where.mockReturnThis();
    mockQuestionsCollection.count.mockReturnThis();
    mockQuestionsAdd.mockResolvedValue({ id: 'q-id' });
    mockGenerateIcfesQuestion.mockResolvedValue(GOOD_QUESTION);
  });

  afterEach(() => {
    jest.useRealTimers();
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

    // Day A areas (pinned date) should report limit_reached
    for (const area of ['matematicas', 'lectura', 'naturales']) {
      expect(body.results[area]).toMatchObject({ generated: 0, skipped: true, reason: 'limit_reached' });
    }
    // Day B areas are not scheduled today
    for (const area of ['sociales', 'ingles']) {
      expect(body.results[area]).toMatchObject({ generated: 0, skipped: true, reason: 'rotated_out_today' });
    }
  });

  it('generates up to 4 questions per area (Day A: matematicas, lectura, naturales)', async () => {
    delete process.env.CRON_SECRET;

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('done');

    // Day A: 3 areas × 4 questions = 12 saves
    expect(mockQuestionsAdd).toHaveBeenCalledTimes(12);

    for (const area of ['matematicas', 'lectura', 'naturales']) {
      expect(body.results[area]).toMatchObject({ generated: 4 });
    }
    // Day B areas are not scheduled today
    for (const area of ['sociales', 'ingles']) {
      expect(body.results[area]).toMatchObject({ generated: 0, skipped: true, reason: 'rotated_out_today' });
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

// ─── Rotation unit tests ──────────────────────────────────────────────────────

describe('getRotationDay', () => {
  it('returns "A" for an even UTC day-of-month', () => {
    expect(getRotationDay(new Date('2026-05-04T00:00:00Z'))).toBe('A'); // day 4
    expect(getRotationDay(new Date('2026-05-06T23:59:59Z'))).toBe('A'); // day 6
  });

  it('returns "B" for an odd UTC day-of-month', () => {
    expect(getRotationDay(new Date('2026-05-05T00:00:00Z'))).toBe('B'); // day 5
    expect(getRotationDay(new Date('2026-05-07T12:00:00Z'))).toBe('B'); // day 7
  });
});

// ─── getDayOfYear unit tests ──────────────────────────────────────────────────

describe('getDayOfYear', () => {
  it('returns 0 for January 1st', () => {
    expect(getDayOfYear(new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });

  it('returns 31 for February 1st (non-leap year)', () => {
    expect(getDayOfYear(new Date('2026-02-01T00:00:00Z'))).toBe(31);
  });

  it('returns 364 for December 31st (non-leap year)', () => {
    expect(getDayOfYear(new Date('2026-12-31T23:59:59Z'))).toBe(364);
  });

  it('returns a consistent positive integer for any date', () => {
    const d = getDayOfYear(new Date('2026-05-04T12:00:00Z'));
    expect(d).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(d)).toBe(true);
  });

  it('returns different values for different days', () => {
    const d1 = getDayOfYear(new Date('2026-03-01T00:00:00Z'));
    const d2 = getDayOfYear(new Date('2026-03-02T00:00:00Z'));
    expect(d2).toBe(d1 + 1);
  });
});

describe('POST /api/seed-daily-questions – rotation', () => {
  const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuestionsCollection.get.mockResolvedValue(makeCountSnap(0));
    mockQuestionsCollection.where.mockReturnThis();
    mockQuestionsCollection.count.mockReturnThis();
    mockQuestionsAdd.mockResolvedValue({ id: 'q-id' });
    mockGenerateIcfesQuestion.mockResolvedValue(GOOD_QUESTION);
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (ORIGINAL_CRON_SECRET === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }
  });

  it('Day A (even UTC day): seeds matematicas, lectura, naturales; skips sociales and ingles', async () => {
    // 2026-05-04: UTC day = 4 (even) → Day A
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-04T06:00:00Z'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('done');

    // Only Day A areas should have been generated
    for (const area of ['matematicas', 'lectura', 'naturales']) {
      expect(body.results[area]).toMatchObject({ generated: 4 });
    }
    // Day B areas must be skipped with the rotation reason
    for (const area of ['sociales', 'ingles']) {
      expect(body.results[area]).toMatchObject({ generated: 0, skipped: true, reason: 'rotated_out_today' });
    }

    // 3 areas × 4 questions = 12 total saves
    expect(mockQuestionsAdd).toHaveBeenCalledTimes(12);
  });

  it('Day B (odd UTC day): seeds sociales and ingles; skips matematicas, lectura, naturales', async () => {
    // 2026-05-05: UTC day = 5 (odd) → Day B
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-05T06:00:00Z'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('done');

    // Only Day B areas should have been generated
    for (const area of ['sociales', 'ingles']) {
      expect(body.results[area]).toMatchObject({ generated: 4 });
    }
    // Day A areas must be skipped with the rotation reason
    for (const area of ['matematicas', 'lectura', 'naturales']) {
      expect(body.results[area]).toMatchObject({ generated: 0, skipped: true, reason: 'rotated_out_today' });
    }

    // 2 areas × 4 questions = 8 total saves
    expect(mockQuestionsAdd).toHaveBeenCalledTimes(8);
  });
});

// ─── Topic rotation tests ─────────────────────────────────────────────────────

/** Returns true when a generateIcfesQuestion call was made with a non-empty topicName. */
function hasTopicName(call: [Record<string, unknown>]): boolean {
  return typeof call[0].topicName === 'string' && (call[0].topicName as string).length > 0;
}

/** Returns true when a generateIcfesQuestion call was made with non-empty svgInstructions. */
function hasSvgInstructions(call: [Record<string, unknown>]): boolean {
  return typeof call[0].svgInstructions === 'string' && (call[0].svgInstructions as string).length > 0;
}

describe('POST /api/seed-daily-questions – topic rotation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuestionsCollection.get.mockResolvedValue(makeCountSnap(0));
    mockQuestionsCollection.where.mockReturnThis();
    mockQuestionsCollection.count.mockReturnThis();
    mockQuestionsAdd.mockResolvedValue({ id: 'q-id' });
    mockGenerateIcfesQuestion.mockResolvedValue(GOOD_QUESTION);
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes topicName and svgInstructions to generateIcfesQuestion when topics exist', async () => {
    // Pin to a Day A date so matematicas, lectura, naturales are seeded
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-04T12:00:00Z'));

    await POST(makeRequest());

    const calls = mockGenerateIcfesQuestion.mock.calls as Array<[Record<string, unknown>]>;
    expect(calls.filter(hasTopicName).length).toBeGreaterThan(0);
    expect(calls.filter(hasSvgInstructions).length).toBeGreaterThan(0);
  });

  it('uses different topics for different question indices on the same day', async () => {
    // Pin to Day A
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-04T12:00:00Z'));

    await POST(makeRequest());

    // Collect all topicNames used for matematicas (first 4 calls)
    const calls = mockGenerateIcfesQuestion.mock.calls as Array<[Record<string, unknown>]>;
    const topicNames = calls.slice(0, 4).map((c) => c[0].topicName as string);

    // All 4 topics on the same day should be distinct
    const uniqueTopics = new Set(topicNames.filter(Boolean));
    expect(uniqueTopics.size).toBe(4);
  });

  it('uses different topics on different days for the same question index', async () => {
    // Day 1: 2026-05-04
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-04T12:00:00Z'));
    await POST(makeRequest());
    const day1Calls = (mockGenerateIcfesQuestion.mock.calls as Array<[Record<string, unknown>]>)
      .slice(0, 4)
      .map((c) => c[0].topicName as string);

    jest.clearAllMocks();
    mockQuestionsCollection.get.mockResolvedValue(makeCountSnap(0));
    mockQuestionsCollection.where.mockReturnThis();
    mockQuestionsCollection.count.mockReturnThis();
    mockQuestionsAdd.mockResolvedValue({ id: 'q-id' });
    mockGenerateIcfesQuestion.mockResolvedValue(GOOD_QUESTION);

    // Day 2: 2026-05-06 (next even day → still Day A)
    jest.setSystemTime(new Date('2026-05-06T12:00:00Z'));
    await POST(makeRequest());
    const day2Calls = (mockGenerateIcfesQuestion.mock.calls as Array<[Record<string, unknown>]>)
      .slice(0, 4)
      .map((c) => c[0].topicName as string);

    // Topics should differ between the two days
    expect(day1Calls).not.toEqual(day2Calls);
  });
});
