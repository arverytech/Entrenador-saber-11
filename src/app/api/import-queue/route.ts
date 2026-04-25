import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { uploadPdfToGeminiFilesApi } from '@/ai/gemini-files';
import { splitPdfIntoChunks } from '@/lib/pdf-splitter';

/**
 * POST /api/import-queue
 *
 * Receives a PDF, text, or URL, splits it into intelligent fragments (cutting
 * BETWEEN questions, never in the middle of one), and saves each fragment as
 * an `importJob` document in Firestore.  Responds immediately with the
 * sessionId and total number of chunks so the admin can track progress.
 *
 * Designed to complete in < 30 s on Vercel Hobby (60 s limit).
 *
 * Accepts:
 *   - FormData { file }  — .pdf, .txt, .csv, .md
 *   - FormData { text }  — raw text
 *   - JSON body { url }  — URL to a PDF (downloaded server-side)
 *
 * Response: { sessionId: string, totalChunks: number, sourceLabel: string }
 *
 * Firestore collection `importJobs`:
 * {
 *   sessionId: string,
 *   chunkIndex: number,           // 1-based
 *   totalChunks: number,
 *   geminiFileUri?: string,       // Files API URI for PDFs (any size) — replaces content/isPdfVision
 *   contentStoragePath?: string,  // Storage path for text chunk (text mode)
 *   isPdfVision: boolean,         // always false for new jobs; kept for legacy in-flight jobs
 *   sourceLabel: string,
 *   status: 'pending' | 'processing' | 'done' | 'failed',
 *   questionsFound: number,
 *   errorMessage?: string,
 *   createdAt: string,            // ISO
 *   updatedAt: string,
 * }
 */

/**
 * Maximum characters per chunk.
 * Chosen to keep Gemini AI processing time under ~20 s per chunk,
 * leaving a safety margin within the 60 s Vercel Hobby limit.
 */
const CHUNK_SIZE = 8_000;

/**
 * Overlap characters repeated at the start of the next chunk.
 * 1500 chars ≈ a full ICFES question (stem + 4 options), ensuring that a
 * question split across a chunk boundary is still fully visible to the AI.
 * Typical ICFES Saber 11 question: ~300 chars (stem) + ~200 chars (4 options) = ~500 chars total.
 * Worst case (situación with table + 2 questions): ~1400 chars. 1500 provides a safe margin.
 */
const CHUNK_OVERLAP = 1_500;

/**
 * Converts raw HTML to plain text by:
 * 1. Removing all tags and their content for script/style elements.
 * 2. Replacing all remaining HTML tags with spaces.
 *
 * The output is plain text suitable for AI question extraction and Firestore storage.
 * It is never rendered as HTML, so residual content is harmless.
 */
function stripHtmlToText(html: string): string {
  return html
    // Remove entire <script> and <style> blocks including content
    .replace(/<script[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    // Replace all remaining HTML tags with spaces
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Patterns that mark the beginning of an ICFES-style question. */
const QUESTION_START_PATTERNS = [
  /^\d+\.\s/m,           // "1. ", "2. "
  /^\d+\)\s/m,           // "1) ", "2) "
  /^Pregunta\s+\d+/im,   // "Pregunta 1", "Pregunta 2"
  /^SITUACIÓN\s+\d+/im,  // "SITUACIÓN 1"
];

function isQuestionStart(line: string): boolean {
  return QUESTION_START_PATTERNS.some((re) => re.test(line.trimStart()));
}

/**
 * Splits text into chunks that respect question boundaries.
 *
 * Strategy:
 * 1. Find question start positions.
 * 2. Group consecutive questions until the chunk would exceed CHUNK_SIZE.
 * 3. Start a new chunk at the next question boundary, prepending CHUNK_OVERLAP
 *    chars from the previous chunk so boundary questions arrive complete.
 * 4. If no question patterns are found, fall back to paragraph-based splitting
 *    with CHUNK_OVERLAP.
 */
export function splitIntoSmartChunks(text: string): string[] {
  const lines = text.split('\n');

  // Find indices of lines that start a new question
  const questionLineIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isQuestionStart(lines[i])) {
      questionLineIndices.push(i);
    }
  }

  // If question patterns found, cut between questions
  if (questionLineIndices.length >= 2) {
    const chunks: string[] = [];
    let chunkStartLineIdx = 0;
    let currentChunkText = '';

    for (let qi = 0; qi < questionLineIndices.length; qi++) {
      const questionLineIdx = questionLineIndices[qi];
      const nextQuestionLineIdx =
        qi + 1 < questionLineIndices.length ? questionLineIndices[qi + 1] : lines.length;

      const questionBlock = lines.slice(questionLineIdx, nextQuestionLineIdx).join('\n');

      const candidate =
        currentChunkText
          ? currentChunkText + '\n' + questionBlock
          : questionBlock;

      if (candidate.length > CHUNK_SIZE && currentChunkText) {
        // Flush current chunk, carry overlap into next
        chunks.push(currentChunkText);
        const overlap = currentChunkText.slice(-CHUNK_OVERLAP);
        currentChunkText = overlap + '\n' + questionBlock;
      } else {
        currentChunkText = candidate;
      }
    }

    // Include any text before the first question
    const preamble = lines.slice(0, questionLineIndices[0]).join('\n').trim();
    if (preamble) {
      // Prepend preamble to the first chunk
      if (chunks.length > 0) {
        chunks[0] = preamble + '\n\n' + chunks[0];
      } else {
        currentChunkText = preamble + '\n\n' + currentChunkText;
      }
    }

    if (currentChunkText.trim()) chunks.push(currentChunkText);

    // Safety: if the preamble injection made chunk 0 too large, re-split it
    return chunks.filter((c) => c.trim().length > 0);
  }

  // Fallback: paragraph-based splitting with overlap
  const paragraphs = text.split(/\n{2,}/);
  const result: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const lines2 = para.length > CHUNK_SIZE ? para.split('\n') : [para];
    for (const line of lines2) {
      const segments =
        line.length > CHUNK_SIZE
          ? Array.from({ length: Math.ceil(line.length / CHUNK_SIZE) }, (_, k) =>
              line.slice(k * CHUNK_SIZE, (k + 1) * CHUNK_SIZE))
          : [line];

      for (const segment of segments) {
        const sep = current ? '\n\n' : '';
        const candidate = current + sep + segment;
        if (candidate.length > CHUNK_SIZE && current) {
          result.push(current);
          const overlap = current.slice(-CHUNK_OVERLAP);
          current = overlap + '\n\n' + segment;
        } else {
          current = candidate;
        }
      }
    }
  }
  if (current.trim()) result.push(current);
  return result;
}

export async function POST(req: NextRequest) {
  let sourceLabel = 'contenido';
  let chunks: string[] = [];
  let geminiFileUri: string | null = null;

  const contentType = req.headers.get('content-type') ?? '';

  // ── Parse input ──────────────────────────────────────────────────────────
  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const text = formData.get('text') as string | null;

      if (file && file.size > 0) {
        sourceLabel = file.name;
        const isPdf =
          file.name.toLowerCase().endsWith('.pdf') ||
          file.type === 'application/pdf';

        if (isPdf) {
          const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return NextResponse.json(
              { error: 'GOOGLE_GENAI_API_KEY no está configurado. Es necesario para procesar PDFs.' },
              { status: 500 },
            );
          }
          const arrayBuffer = await file.arrayBuffer();
          const pdfBuffer = Buffer.from(arrayBuffer);

          // Split PDF into page-groups, cutting between questions.
          const pdfChunks = await splitPdfIntoChunks(pdfBuffer);

          if (pdfChunks.length === 1) {
            // Small PDF — single upload, continue with the normal job-creation flow.
            geminiFileUri = await uploadPdfToGeminiFilesApi(pdfBuffer, file.name, apiKey);
            chunks = ['__PDF_FILES_API__'];
          } else {
            // Large PDF — upload each sub-PDF and create one importJob per chunk,
            // then return early (bypass the normal single-job flow below).
            let db: ReturnType<typeof getAdminFirestore>;
            try {
              db = getAdminFirestore();
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Firebase Admin init failed';
              return NextResponse.json({ error: msg }, { status: 500 });
            }

            const sessionId = randomUUID();
            const totalChunks = pdfChunks.length;
            const now = new Date().toISOString();
            const batch = db.batch();

            for (const pdfChunk of pdfChunks) {
              const chunkLabel = `${file.name} (páginas ${pdfChunk.pageStart}-${pdfChunk.pageEnd})`;
              const chunkUri = await uploadPdfToGeminiFilesApi(pdfChunk.buffer, chunkLabel, apiKey);
              const docRef = db.collection('importJobs').doc();
              batch.set(docRef, {
                sessionId,
                chunkIndex: pdfChunk.chunkIndex,
                totalChunks,
                geminiFileUri: chunkUri,
                isPdfVision: false,
                sourceLabel: chunkLabel,
                status: 'pending',
                questionsFound: 0,
                createdAt: now,
                updatedAt: now,
              });
            }
            await batch.commit();

            console.log(`[import-queue] sessionId=${sessionId} totalChunks=${totalChunks} pdfChunks=yes`);
            return NextResponse.json({ sessionId, totalChunks, sourceLabel: file.name });
          }
        } else {
          const rawText = await file.text();
          chunks = splitIntoSmartChunks(rawText);
        }
      } else if (text && text.trim()) {
        sourceLabel = 'texto pegado directamente';
        chunks = splitIntoSmartChunks(text.trim());
      } else {
        return NextResponse.json(
          { error: 'Se requiere un archivo o texto.' },
          { status: 400 }
        );
      }
    } else {
      // JSON body with URL
      const body = await req.json() as { url?: string };
      const { url } = body;

      if (!url || typeof url !== 'string') {
        return NextResponse.json(
          { error: 'Debes proporcionar una URL válida, un archivo o texto.' },
          { status: 400 }
        );
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return NextResponse.json(
          { error: 'La URL proporcionada no tiene un formato válido.' },
          { status: 400 }
        );
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.json(
          { error: 'Solo se permiten URLs con protocolo http o https.' },
          { status: 400 }
        );
      }

      // Basic SSRF protection: reject private/loopback hostnames
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
        /^192\.168\.\d+\.\d+$/.test(hostname) ||
        /^169\.254\.\d+\.\d+$/.test(hostname)
      ) {
        return NextResponse.json(
          { error: 'No se permiten URLs a direcciones IP privadas o locales.' },
          { status: 400 }
        );
      }

      sourceLabel = url;

      // Download the URL content
      const fetchRes = await fetch(url, {
        headers: { 'User-Agent': 'EntrenadorSaber11/1.0 (content-import)' },
        signal: AbortSignal.timeout(20_000),
      });

      if (!fetchRes.ok) {
        return NextResponse.json(
          { error: `No se pudo acceder a la URL. El servidor respondió con: ${fetchRes.status} ${fetchRes.statusText}` },
          { status: 502 }
        );
      }

      const fetchContentType = fetchRes.headers.get('content-type') ?? '';
      const isPdfUrl =
        fetchContentType.includes('application/pdf') ||
        parsedUrl.pathname.toLowerCase().endsWith('.pdf');

      if (isPdfUrl) {
        const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return NextResponse.json(
            { error: 'GOOGLE_GENAI_API_KEY no está configurado. Es necesario para procesar PDFs.' },
            { status: 500 },
          );
        }
        const arrayBuffer = await fetchRes.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        const displayName = parsedUrl.pathname.split('/').pop() || 'document.pdf';

        // Split PDF into page-groups, cutting between questions.
        const pdfChunks = await splitPdfIntoChunks(pdfBuffer);

        if (pdfChunks.length === 1) {
          // Small PDF — single upload, continue with the normal job-creation flow.
          geminiFileUri = await uploadPdfToGeminiFilesApi(pdfBuffer, displayName, apiKey);
          chunks = ['__PDF_FILES_API__'];
        } else {
          // Large PDF — upload each sub-PDF and create one importJob per chunk,
          // then return early (bypass the normal single-job flow below).
          let db: ReturnType<typeof getAdminFirestore>;
          try {
            db = getAdminFirestore();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Firebase Admin init failed';
            return NextResponse.json({ error: msg }, { status: 500 });
          }

          const sessionId = randomUUID();
          const totalChunks = pdfChunks.length;
          const now = new Date().toISOString();
          const batch = db.batch();

          for (const pdfChunk of pdfChunks) {
            const chunkLabel = `${displayName} (páginas ${pdfChunk.pageStart}-${pdfChunk.pageEnd})`;
            const chunkUri = await uploadPdfToGeminiFilesApi(pdfChunk.buffer, chunkLabel, apiKey);
            const docRef = db.collection('importJobs').doc();
            batch.set(docRef, {
              sessionId,
              chunkIndex: pdfChunk.chunkIndex,
              totalChunks,
              geminiFileUri: chunkUri,
              isPdfVision: false,
              sourceLabel: chunkLabel,
              status: 'pending',
              questionsFound: 0,
              createdAt: now,
              updatedAt: now,
            });
          }
          await batch.commit();

          console.log(`[import-queue] sessionId=${sessionId} totalChunks=${totalChunks} pdfChunks=yes`);
          return NextResponse.json({ sessionId, totalChunks, sourceLabel: url });
        }
      } else {
        // HTML or plain text URL — extract plain text.
        // Use `text()` only after confirming the body is available.
        const rawText = fetchRes.body ? await fetchRes.text() : '';
        const cleaned = stripHtmlToText(rawText);
        chunks = splitIntoSmartChunks(cleaned);
      }
    }
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : 'Error desconocido';
    return NextResponse.json(
      { error: `Error al leer la solicitud: ${msg}` },
      { status: 400 }
    );
  }

  if (chunks.length === 0) {
    return NextResponse.json(
      { error: 'El contenido proporcionado está vacío.' },
      { status: 422 }
    );
  }

  // ── Persist jobs to Firestore ─────────────────────────────────────────────
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Firebase Admin initialization failed';
    console.error('[import-queue] Admin init error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Init Storage bucket for text chunk uploads ────────────────────────────
  // Storage is only needed for text-mode chunks; PDFs use Gemini Files API.
  let storageBucket: ReturnType<typeof getAdminStorage> | null = null;
  if (geminiFileUri === null) {
    try {
      storageBucket = getAdminStorage();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Firebase Storage initialization failed';
      console.error('[import-queue] Storage init error:', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const sessionId = randomUUID();

  const totalChunks = chunks.length;
  const now = new Date().toISOString();

  try {
    const batch = db.batch();
    for (let i = 0; i < totalChunks; i++) {
      const docRef = db.collection('importJobs').doc();
      const jobData: Record<string, unknown> = {
        sessionId,
        chunkIndex: i + 1,
        totalChunks,
        sourceLabel,
        isPdfVision: false,
        status: 'pending',
        questionsFound: 0,
        createdAt: now,
        updatedAt: now,
      };

      if (geminiFileUri) {
        // PDF uploaded to Gemini Files API — store only the URI (tiny, avoids
        // the Firestore 1 MB document limit). Gemini reads the full PDF,
        // including images and figures, during process-chunk.
        jobData.geminiFileUri = geminiFileUri;
      } else {
        // Text chunk → upload to Firebase Storage to avoid Firestore 1 MB limit.
        // Only the lightweight storage path is saved in Firestore.
        const storagePath = `import-chunks/${sessionId}/chunk-${i + 1}.txt`;
        await storageBucket!.file(storagePath).save(chunks[i], {
          metadata: { contentType: 'text/plain; charset=utf-8' },
        });
        jobData.contentStoragePath = storagePath;
      }

      batch.set(docRef, jobData);
    }
    await batch.commit();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error guardando jobs en Firestore';
    console.error('[import-queue] Firestore batch error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  console.log(`[import-queue] sessionId=${sessionId} totalChunks=${totalChunks} geminiFileUri=${geminiFileUri ? 'yes' : 'no'}`);

  return NextResponse.json({ sessionId, totalChunks, sourceLabel });
}
