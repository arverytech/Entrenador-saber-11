import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';

/**
 * GET /api/heal-explanations
 *
 * Scheduled job — runs every 2 hours via .github/workflows/heal-explanations.yml.
 * Finds all questions in the 'questions' Firestore collection that have no
 * aiExplanation, generates one for each, and writes it back to the document.
 *
 * Protected by the CRON_SECRET secret (set as GitHub Actions secret CRON_SECRET
 * and Vercel environment variable CRON_SECRET).
 *
 * Response:
 *   { healed: number, failed: number, skipped: number }
 */

const BATCH_CONCURRENCY = 5;
/** Maximum questions healed per invocation to stay within Vercel function timeout. */
const MAX_PER_RUN = 100;

export async function GET(req: NextRequest) {
  // Validate Vercel cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Firebase Admin initialization failed';
    console.error('[heal-explanations] Admin init error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Query questions without aiExplanation
  let snapshot: FirebaseFirestore.QuerySnapshot;
  try {
    snapshot = await db
      .collection('questions')
      .where('aiExplanation', '==', null)
      .limit(MAX_PER_RUN)
      .get();

    // Firestore "field does not exist" requires a separate query; merge results
    const missingSnapshot = await db
      .collection('questions')
      .orderBy('createdAt')
      .limit(MAX_PER_RUN * 2)
      .get();

    // Combine: docs where aiExplanation is null OR missing
    const allDocs = [
      ...snapshot.docs,
      ...missingSnapshot.docs.filter(
        (d) => d.data().aiExplanation === undefined || d.data().aiExplanation === null
      ),
    ];
    // De-duplicate by id
    const seen = new Set<string>();
    const docs = allDocs.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    }).slice(0, MAX_PER_RUN);

    if (docs.length === 0) {
      return NextResponse.json({ healed: 0, failed: 0, skipped: 0 });
    }

    let healed = 0;
    let failed = 0;

    // Process in batches of BATCH_CONCURRENCY
    for (let i = 0; i < docs.length; i += BATCH_CONCURRENCY) {
      const batch = docs.slice(i, i + BATCH_CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(async (docSnap) => {
          const data = docSnap.data();
          const options = (data.options as string[]) || [];

          // Skip questions that have no options — can't generate a meaningful explanation
          if (options.length === 0) {
            return;
          }

          const correctIdx = (data.correctAnswerIndex as number) ?? 0;
          const correctAnswer = options[correctIdx] ?? options[0];
          const wrongAnswer = options[(correctIdx + 1) % options.length] ?? options[0];

          const aiExplanation = await generateExplanation({
            question: (data.text as string) || '',
            userAnswer: wrongAnswer,
            correctAnswer,
            options,
            subject: (data.subjectId as string) || 'General',
            component: (data.componentId as string) || 'General',
            competency: (data.competencyId as string) || 'Razonamiento',
          });

          await db.collection('questions').doc(docSnap.id).update({
            aiExplanation,
            updatedAt: new Date().toISOString(),
          });
        })
      );

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          healed++;
        } else {
          failed++;
          console.warn('[heal-explanations] failed for a question:', outcome.reason);
        }
      }
    }

    console.log(`[heal-explanations] done — healed: ${healed}, failed: ${failed}`);
    return NextResponse.json({ healed, failed, skipped: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[heal-explanations] fatal error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
