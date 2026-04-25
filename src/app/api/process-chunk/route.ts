import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { importQuestionsFromContent, importQuestionsFromPdf, importQuestionsFromGeminiFileUri } from '@/ai/flows/import-questions-from-url-flow';

/**
 * POST /api/process-chunk
 *
 * Protected by CRON_SECRET (same as heal-explanations).
 * Picks the oldest "pending" importJob from Firestore, processes it with
 * Gemini AI, saves extracted questions to the "questions" collection, and
 * marks the job as "done" or "failed".
 *
 * Deduplication: before saving each question, the first 100 characters of its
 * text are compared against questions already saved in the same session.  If
 * similarity > 85 % the question is silently discarded.
 *
 * Estimated time per invocation: 20-35 s (within 60 s Hobby limit).
 *
 * Response:
 *   { processed: string, questionsFound: number, status: 'done' | 'failed' | 'nothing_pending' }
 */

/** Returns a rough similarity ratio between two strings (0..1). */
function roughSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length >= b.length ? a : b;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  return matches / longer.length;
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Get Firestore ─────────────────────────────────────────────────────────
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Firebase Admin initialization failed';
    console.error('[process-chunk] Admin init error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Recovery: reset jobs stuck in "processing" for > 5 minutes ───────────
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
  try {
    const stuckSnap = await db
      .collection('importJobs')
      .where('status', '==', 'processing')
      .where('updatedAt', '<', stuckCutoff)
      .get();
    if (!stuckSnap.empty) {
      const resetBatch = db.batch();
      for (const stuckDoc of stuckSnap.docs) {
        resetBatch.update(stuckDoc.ref, {
          status: 'pending',
          updatedAt: new Date().toISOString(),
          errorMessage: 'Reset automático: job atascado en processing por más de 5 minutos',
        });
      }
      await resetBatch.commit();
      console.log(`[process-chunk] reset ${stuckSnap.docs.length} stuck job(s) to pending`);
    }
  } catch (stuckErr) {
    // Non-fatal: log and continue
    console.warn('[process-chunk] could not reset stuck jobs:', stuckErr);
  }

  // ── Find the oldest pending job ───────────────────────────────────────────
  let jobSnap: FirebaseFirestore.QuerySnapshot;
  try {
    jobSnap = await db
      .collection('importJobs')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error querying importJobs';
    console.error('[process-chunk] query error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (jobSnap.empty) {
    return NextResponse.json({ status: 'nothing_pending', processed: '', questionsFound: 0 });
  }

  const jobDoc = jobSnap.docs[0];
  const job = jobDoc.data() as {
    sessionId: string;
    chunkIndex: number;
    totalChunks: number;
    geminiFileUri?: string;      // present for PDFs uploaded via Gemini Files API (new)
    content?: string;            // legacy: base64 PDF for isPdfVision=true jobs
    contentStoragePath?: string; // present for text chunks
    isPdfVision: boolean;
    sourceLabel: string;
    status: string;
    questionsFound: number;
    createdAt: string;
    updatedAt: string;
    errorMessage?: string;
    subjectId?: string;          // subject classification provided at upload time
  };

  // Mark as "processing" to avoid double-processing
  const now = new Date().toISOString();
  await jobDoc.ref.update({ status: 'processing', updatedAt: now });

  // ── Download chunk text from Storage (text-mode chunks only) ─────────────
  let chunkText = '';
  let storageBucket: ReturnType<typeof getAdminStorage> | null = null;
  if (job.contentStoragePath) {
    try {
      storageBucket = getAdminStorage();
      const [contents] = await storageBucket.file(job.contentStoragePath).download();
      chunkText = contents.toString('utf-8');
    } catch (dlErr) {
      const errMsg = dlErr instanceof Error
        ? dlErr.message
        : `Error downloading chunk from Storage at ${job.contentStoragePath}`;
      console.error(`[process-chunk] Storage download error for ${job.contentStoragePath}:`, errMsg);
      await jobDoc.ref.update({
        status: 'failed',
        errorMessage: errMsg,
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ status: 'failed', processed: jobDoc.id, questionsFound: 0 });
    }
  }

  // ── Load already-saved question texts for deduplication ──────────────────
  let existingTexts: string[] = [];
  try {
    const existingSnap = await db
      .collection('questions')
      .where('importSessionId', '==', job.sessionId)
      .select('text')
      .get();
    existingTexts = existingSnap.docs.map((d) => {
      const t = d.data().text as string | undefined;
      return t ? t.slice(0, 100) : '';
    });
  } catch {
    // Non-fatal: deduplication best-effort
  }

  // ── Run AI extraction (up to 2 attempts) ─────────────────────────────────
  // Timeout wrapper — if Gemini doesn't respond in 45s, reject proactively
  // so the job is marked "failed" cleanly before Vercel's 60s hard limit.
  const AI_TIMEOUT_MS = 45_000;

  function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout de ${ms / 1000}s esperando respuesta de Gemini (${label})`)),
          ms,
        )
      ),
    ]);
  }

  let aiResult: Awaited<ReturnType<typeof importQuestionsFromContent>> | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (job.geminiFileUri) {
        // PDF uploaded via Gemini Files API — Gemini reads the full document
        // including embedded images, figures, graphs and tables.
        aiResult = await withTimeout(
          importQuestionsFromGeminiFileUri(job.geminiFileUri, job.sourceLabel),
          AI_TIMEOUT_MS,
          `geminiFileUri chunk ${job.chunkIndex}/${job.totalChunks}`,
        );
      } else if (job.isPdfVision) {
        // Legacy: base64 inline PDF (for jobs created before the Files API migration)
        const pdfBuffer = Buffer.from(job.content!, 'base64');
        aiResult = await withTimeout(
          importQuestionsFromPdf(pdfBuffer, job.sourceLabel),
          AI_TIMEOUT_MS,
          `isPdfVision chunk ${job.chunkIndex}/${job.totalChunks}`,
        );
      } else {
        aiResult = await withTimeout(
          importQuestionsFromContent({
            url: job.sourceLabel,
            content: chunkText,
          }),
          AI_TIMEOUT_MS,
          `text chunk ${job.chunkIndex}/${job.totalChunks}`,
        );
      }
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        console.warn(`[process-chunk] chunk ${job.chunkIndex}/${job.totalChunks} attempt 1 failed, retrying…`);
      }
    }
  }

  /** Deletes the temporary Storage file for this chunk (best-effort). */
  const deleteStorageFile = async () => {
    if (job.contentStoragePath && storageBucket) {
      try {
        await storageBucket.file(job.contentStoragePath).delete();
      } catch (delErr) {
        console.warn(
          `[process-chunk] Failed to delete Storage file ${job.contentStoragePath}:`,
          delErr
        );
      }
    }
  };

  if (!aiResult) {
    const errMsg = lastErr instanceof Error ? lastErr.message : 'Error procesando fragmento con IA';
    console.warn(`[process-chunk] chunk ${job.chunkIndex}/${job.totalChunks} failed after retry: ${errMsg}`);
    await jobDoc.ref.update({
      status: 'failed',
      errorMessage: errMsg,
      updatedAt: new Date().toISOString(),
    });
    await deleteStorageFile();
    return NextResponse.json({
      status: 'failed',
      processed: jobDoc.id,
      questionsFound: 0,
    });
  }

  // ── Save questions with deduplication ─────────────────────────────────────
  const questions = (Array.isArray(aiResult.questions) ? aiResult.questions : []) as Record<string, unknown>[];
  let savedCount = 0;
  const timestamp = new Date().toISOString();

  for (const q of questions) {
    const qText = typeof q.text === 'string' ? q.text.slice(0, 100) : '';

    // Deduplication check: skip if first 100 chars match an existing question in this session
    // at >85% character similarity (roughSimilarity score).  The 85% threshold was chosen
    // empirically to catch overlap-region duplicates while allowing genuinely different
    // questions with similar opening stems to be saved.
    const isDuplicate = existingTexts.some(
      (existing) => roughSimilarity(qText, existing) > 0.85
    );

    if (isDuplicate) {
      console.log(`[process-chunk] duplicate question skipped: "${qText.slice(0, 50)}…"`);
      continue;
    }

    try {
      // If the job has a subjectId (set at upload time), it takes precedence over
      // whatever the AI inferred from the content.
      const subjectId = job.subjectId ?? q.subjectId;
      await db.collection('questions').add({
        ...q,
        ...(subjectId !== undefined ? { subjectId } : {}),
        importSessionId: job.sessionId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      existingTexts.push(qText);
      savedCount++;
    } catch (saveErr) {
      console.warn('[process-chunk] failed to save question:', saveErr);
    }
  }

  // ── Mark job done ─────────────────────────────────────────────────────────
  await jobDoc.ref.update({
    status: 'done',
    questionsFound: savedCount,
    updatedAt: new Date().toISOString(),
  });

  await deleteStorageFile();

  console.log(
    `[process-chunk] session=${job.sessionId} chunk=${job.chunkIndex}/${job.totalChunks} saved=${savedCount}`
  );

  return NextResponse.json({
    status: 'done',
    processed: jobDoc.id,
    questionsFound: savedCount,
  });
}
