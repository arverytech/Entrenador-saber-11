import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { importQuestionsFromContent, importQuestionsFromPdf, importQuestionsFromGeminiFileUri } from '@/ai/flows/import-questions-from-url-flow';

/**
 * POST /api/process-chunk
 *
 * Protected by CRON_SECRET (same as heal-explanations).
 * Picks the oldest eligible "pending" importJob from Firestore, processes it
 * with Gemini AI, saves extracted questions to the "questions" collection, and
 * marks the job as "done", "failed", or back to "pending" (with backoff).
 *
 * Transient errors (Gemini 429 / 503):
 *   - The job is NOT marked "failed" immediately.
 *   - attemptCount is incremented and nextAttemptAt is set using exponential
 *     backoff with ±25 % jitter (base 2 min for 503, base 10 min for 429,
 *     cap 2 hours).  The job stays "pending" and will be retried automatically.
 *   - After MAX_ATTEMPT_COUNT attempts the job is marked "failed" permanently.
 *
 * Deduplication: before saving each question, the first 100 characters of its
 * text are compared against questions already saved in the same session.  If
 * similarity > 85 % the question is silently discarded.
 *
 * Estimated time per invocation: 20-35 s (within 60 s Hobby limit).
 *
 * Response:
 *   { processed: string, questionsFound: number, status: 'done' | 'failed' | 'retrying' | 'nothing_pending' }
 */

// ── Retry / backoff constants ─────────────────────────────────────────────────

/** Maximum automatic retry attempts before marking the job as permanently failed. */
export const MAX_ATTEMPT_COUNT = 10;

/**
 * Returns the transient error code ('429' | '503') when the error is a Gemini
 * quota or availability failure, or null for any other kind of error.
 */
export function getTransientErrorCode(err: unknown): '429' | '503' | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return '429';
  if (/503|UNAVAILABLE/i.test(msg)) return '503';
  return null;
}

/**
 * Calculates exponential backoff (ms) with ±25 % jitter.
 *
 * Base delays:
 *   503 → 2 minutes  (Gemini high demand — usually resolves quickly)
 *   429 → 10 minutes (quota exhaustion — needs a longer cooldown)
 * Maximum cap: 2 hours.
 */
export function calculateBackoffMs(attemptCount: number, errorCode: '429' | '503'): number {
  const BASE_MS = errorCode === '429' ? 10 * 60 * 1000 : 2 * 60 * 1000;
  const MAX_MS  = 2 * 60 * 60 * 1000; // 2 hours
  const exponential = BASE_MS * Math.pow(2, attemptCount);
  const capped  = Math.min(exponential, MAX_MS);
  // ±25 % jitter to avoid thundering-herd on simultaneous retries
  const jitter  = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

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
          // Clear any backoff so the job is immediately eligible
          nextAttemptAt: '',
          updatedAt: new Date().toISOString(),
          errorMessage: 'Reset automático: job atascado en processing por más de 5 minutos',
          // attemptCount is intentionally NOT updated here — preserved from
          // the previous attempt so the threshold check stays accurate.
        });
      }
      await resetBatch.commit();
      console.log(`[process-chunk] reset ${stuckSnap.docs.length} stuck job(s) to pending`);
    }
  } catch (stuckErr) {
    // Non-fatal: log and continue
    console.warn('[process-chunk] could not reset stuck jobs:', stuckErr);
  }

  // ── Find the oldest eligible pending job ─────────────────────────────────
  // We fetch the N oldest pending jobs and apply the nextAttemptAt eligibility
  // check in-memory.  This handles both:
  //   • legacy jobs that have no nextAttemptAt field (immediately eligible)
  //   • new jobs whose nextAttemptAt sentinel is "" or a future ISO string
  let jobSnap: FirebaseFirestore.QuerySnapshot;
  try {
    jobSnap = await db
      .collection('importJobs')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(20)
      .get();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error querying importJobs';
    console.error('[process-chunk] query error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const nowStr = new Date().toISOString();
  const eligibleDoc = jobSnap.docs.find((doc) => {
    const d = doc.data() as { nextAttemptAt?: string };
    return !d.nextAttemptAt || d.nextAttemptAt <= nowStr;
  });

  if (!eligibleDoc) {
    return NextResponse.json({ status: 'nothing_pending', processed: '', questionsFound: 0 });
  }

  const jobDoc = eligibleDoc;
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
    attemptCount?: number;       // total retry attempts so far (default 0)
    nextAttemptAt?: string;      // ISO timestamp; job not eligible before this time
    lastErrorCode?: string;      // '429', '503', 'timeout', etc.
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
    const transientCode = getTransientErrorCode(lastErr);
    const currentAttemptCount = (job.attemptCount ?? 0) + 1;

    console.warn(
      `[process-chunk] chunk ${job.chunkIndex}/${job.totalChunks} failed after retry: ${errMsg}` +
      (transientCode ? ` [transient ${transientCode}, attempt ${currentAttemptCount}/${MAX_ATTEMPT_COUNT}]` : '')
    );

    if (transientCode && currentAttemptCount < MAX_ATTEMPT_COUNT) {
      // Transient Gemini error (429/503) — schedule automatic retry with backoff
      const backoffMs = calculateBackoffMs(currentAttemptCount, transientCode);
      const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();
      await jobDoc.ref.update({
        status: 'pending',
        errorMessage: errMsg,
        attemptCount: currentAttemptCount,
        nextAttemptAt,
        lastErrorCode: transientCode,
        updatedAt: new Date().toISOString(),
      });
      await deleteStorageFile();
      console.log(
        `[process-chunk] scheduled retry for chunk ${job.chunkIndex}/${job.totalChunks}` +
        ` at ${nextAttemptAt} (backoff ${Math.round(backoffMs / 1000)}s)`
      );
      return NextResponse.json({
        status: 'retrying',
        processed: jobDoc.id,
        questionsFound: 0,
        nextAttemptAt,
      });
    }

    // Non-transient error (e.g. auth, bad request, timeout) or max attempts
    // reached → mark as permanently failed.
    await jobDoc.ref.update({
      status: 'failed',
      errorMessage: errMsg,
      updatedAt: new Date().toISOString(),
      ...(transientCode
        ? { lastErrorCode: transientCode, attemptCount: currentAttemptCount }
        : {}),
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
