import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { generateIcfesQuestion } from '@/ai/flows/generate-question-flow';
import { normalizeSubjectId } from '@/lib/normalize-subject-id';
import { SUBJECT_GUIDELINES } from '@/ai/constants';

/**
 * POST /api/seed-daily-questions
 *
 * Protected by CRON_SECRET.
 * Generates up to QUESTIONS_PER_AREA new ICFES questions per area per day,
 * stopping each area once it reaches MAX_V2_QUESTIONS_PER_SUBJECT v2 questions.
 *
 * Handles Gemini 429 gracefully: if quota is exhausted, stops further
 * generation for this run and returns a status indicating quota exhaustion
 * (does not fail the whole run).
 *
 * Invoked by a daily GitHub Actions workflow.
 */

/** Maximum v2 questions per subject before seeding stops for that subject. */
const MAX_V2_QUESTIONS_PER_SUBJECT = 120;

/** Questions to generate per area per daily run. */
const QUESTIONS_PER_AREA = 4;

/**
 * Returns 'A' for an even UTC day-of-month, 'B' for an odd one.
 * Exported for testability.
 *
 * Day A areas: matematicas, lectura, naturales
 * Day B areas: sociales, ingles
 *
 * Note: at month boundaries (e.g. day 30 → day 1 of next month) the parity can
 * repeat (even → odd or even → even) depending on the month length. This is an
 * acceptable trade-off for a simple quota-reduction rotation; no subject will
 * ever be starved for more than two consecutive days.
 */
export function getRotationDay(now: Date = new Date()): 'A' | 'B' {
  return now.getUTCDate() % 2 === 0 ? 'A' : 'B';
}

/**
 * Returns the 0-based day of the year in UTC (0 = Jan 1, 364/365 = Dec 31).
 * Used to deterministically rotate through the topic catalogue so that the
 * 4 questions generated each day cover 4 different topics, and the same topic
 * is never repeated on the same day of the following year.
 *
 * Exported for testability.
 */
export function getDayOfYear(now: Date = new Date()): number {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  return Math.floor((now.getTime() - startOfYear) / 86400000);
}

const ROTATION: Record<'A' | 'B', string[]> = {
  A: ['matematicas', 'lectura', 'naturales'],
  B: ['sociales', 'ingles'],
};

const AREAS: Array<{
  subjectId: string;
  subject: string;
  /** Fallback component used when the topic catalogue is empty. */
  component: string;
  /** Fallback competency used when the topic catalogue is empty. */
  competency: string;
}> = [
  {
    subjectId: 'matematicas',
    subject: 'Matemáticas',
    component: 'Álgebra y funciones',
    competency: 'Razonamiento y argumentación',
  },
  {
    subjectId: 'lectura',
    subject: 'Lectura Crítica',
    component: 'Comprensión lectora',
    competency: 'Interpretación y evaluación',
  },
  {
    subjectId: 'naturales',
    subject: 'Ciencias Naturales',
    component: 'Entorno vivo',
    competency: 'Uso comprensivo del conocimiento científico',
  },
  {
    subjectId: 'sociales',
    subject: 'Ciencias Sociales y Ciudadanas',
    component: 'Historia y geografía',
    competency: 'Pensamiento sistémico y ciudadanía',
  },
  {
    subjectId: 'ingles',
    subject: 'Inglés',
    component: 'Reading comprehension',
    competency: 'Understanding written texts',
  },
];

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Firestore ─────────────────────────────────────────────────────────────
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Firebase Admin initialization failed';
    console.error('[seed-daily] Admin init error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const results: Record<string, { generated: number; skipped?: boolean; reason?: string }> = {};
  let quotaExhausted = false;

  // Determine today's rotation group and only seed those areas.
  const todayAreas = new Set(ROTATION[getRotationDay()]);

  for (const area of AREAS) {
    // Skip areas not scheduled for today's rotation slot.
    if (!todayAreas.has(area.subjectId)) {
      results[area.subjectId] = { generated: 0, skipped: true, reason: 'rotated_out_today' };
      continue;
    }

    if (quotaExhausted) {
      results[area.subjectId] = { generated: 0, skipped: true, reason: 'quota_exhausted_earlier' };
      continue;
    }

    // Count existing v2 questions for this subject
    let existingCount = 0;
    try {
      const snap = await db
        .collection('questions')
        .where('subjectId', '==', area.subjectId)
        .where('schemaVersion', '==', 2)
        .count()
        .get();
      existingCount = snap.data().count;
    } catch (countErr) {
      console.warn(`[seed-daily] Could not count v2 questions for ${area.subjectId}:`, countErr);
    }

    if (existingCount >= MAX_V2_QUESTIONS_PER_SUBJECT) {
      console.log(`[seed-daily] ${area.subjectId}: already has ${existingCount} v2 questions — skipping`);
      results[area.subjectId] = { generated: 0, skipped: true, reason: 'limit_reached' };
      continue;
    }

    let generatedForArea = 0;
    const toGenerate = Math.min(QUESTIONS_PER_AREA, MAX_V2_QUESTIONS_PER_SUBJECT - existingCount);

    // Resolve today's day-of-year once per area (same day for all questions in this area)
    const dayOfYear = getDayOfYear();
    const topicCatalogue = SUBJECT_GUIDELINES[area.subjectId]?.topics ?? [];

    for (let i = 0; i < toGenerate; i++) {
      if (quotaExhausted) break;

      // Deterministic topic rotation: 4 consecutive topics per day, cycling through
      // the whole catalogue so the same topic never falls on the same day next year.
      let component = area.component;
      let competency = area.competency;
      let topicName: string | undefined;
      let svgInstructions: string | undefined;

      if (topicCatalogue.length > 0) {
        const topicIdx = (dayOfYear * QUESTIONS_PER_AREA + i) % topicCatalogue.length;
        const topic = topicCatalogue[topicIdx];
        component = topic.component;
        competency = topic.competency;
        topicName = topic.name;
        svgInstructions = topic.svgInstructions;
      }

      try {
        const question = await generateIcfesQuestion({
          subject: area.subject,
          component,
          competency,
          level: 'Medio',
          topicName,
          svgInstructions,
        });

        const timestamp = new Date().toISOString();
        const subjectId = normalizeSubjectId(question.subjectId ?? area.subjectId);

        await db.collection('questions').add({
          text: question.text,
          options: question.options,
          correctAnswerIndex: question.correctAnswerIndex,
          explanation: question.explanation,
          subjectId,
          componentId: question.componentId,
          competencyId: question.competencyId,
          level: question.level,
          pointsAwarded: question.pointsAwarded,
          ...(question.svgData ? { svgData: question.svgData } : {}),
          aiXml: question.aiXml,
          metadata: question.metadata,
          schemaVersion: 2,
          source: 'icfes_ai_v2',
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        generatedForArea++;
        console.log(`[seed-daily] ${area.subjectId}: saved question ${generatedForArea}/${toGenerate}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);

        if (is429) {
          console.warn(`[seed-daily] Gemini 429 for ${area.subjectId} — stopping further generation for this run`);
          quotaExhausted = true;
          break;
        }

        // Non-quota error: log and continue to next question
        console.warn(`[seed-daily] ${area.subjectId}: error generating question ${i + 1}:`, msg);
      }
    }

    results[area.subjectId] = { generated: generatedForArea };
  }

  return NextResponse.json({
    status: quotaExhausted ? 'quota_exhausted' : 'done',
    results,
  });
}
