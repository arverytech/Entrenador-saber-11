import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { generateIcfesQuestion } from '@/ai/flows/generate-question-flow';
import { normalizeSubjectId } from '@/lib/normalize-subject-id';

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

const AREAS: Array<{
  subjectId: string;
  subject: string;
  component: string;
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

  for (const area of AREAS) {
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

    for (let i = 0; i < toGenerate; i++) {
      if (quotaExhausted) break;

      try {
        const question = await generateIcfesQuestion({
          subject: area.subject,
          component: area.component,
          competency: area.competency,
          level: 'Medio',
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
