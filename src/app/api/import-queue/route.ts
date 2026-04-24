import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { PDF_VISION_SIZE_LIMIT } from '@/ai/constants';

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
 *   chunkIndex: number,        // 1-based
 *   totalChunks: number,
 *   content: string,           // text of the chunk (text mode)
 *   pdfStoragePath?: string,   // path in Firebase Storage (pdf-vision mode only)
 *   isPdfVision: boolean,      // true = send to Gemini as PDF; false = text
 *   sourceLabel: string,
 *   status: 'pending' | 'processing' | 'done' | 'failed',
 *   questionsFound: number,
 *   errorMessage?: string,
 *   createdAt: string,         // ISO
 *   updatedAt: string,
 * }
 */

const CHUNK_SIZE = 8_000;
const CHUNK_OVERLAP = 1_500;

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
  let isPdfVision = false;
  let pdfBase64: string | null = null;

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
          const arrayBuffer = await file.arrayBuffer();
          const pdfBuffer = Buffer.from(arrayBuffer);

          if (pdfBuffer.length <= PDF_VISION_SIZE_LIMIT) {
            // Small PDF → 1 chunk in pdf-vision mode
            isPdfVision = true;
            pdfBase64 = pdfBuffer.toString('base64');
            chunks = ['__PDF_VISION__'];
          } else {
            // Large PDF → text extraction + smart chunking
            const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
            const pdfData = await pdfParse(pdfBuffer);
            chunks = splitIntoSmartChunks(pdfData.text);
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
        const arrayBuffer = await fetchRes.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);

        if (pdfBuffer.length <= PDF_VISION_SIZE_LIMIT) {
          isPdfVision = true;
          pdfBase64 = pdfBuffer.toString('base64');
          chunks = ['__PDF_VISION__'];
        } else {
          const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
          const pdfData = await pdfParse(pdfBuffer);
          chunks = splitIntoSmartChunks(pdfData.text);
        }
      } else {
        // HTML or plain text URL
        const rawText = fetchRes.text
          ? await fetchRes.text()
          : '';
        const cleaned = rawText
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
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

  const sessionId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
        isPdfVision,
        status: 'pending',
        questionsFound: 0,
        createdAt: now,
        updatedAt: now,
      };

      if (isPdfVision && pdfBase64) {
        // Store the base64 PDF data inline (only for single-chunk vision mode)
        jobData.content = pdfBase64;
      } else {
        jobData.content = chunks[i];
      }

      batch.set(docRef, jobData);
    }
    await batch.commit();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error guardando jobs en Firestore';
    console.error('[import-queue] Firestore batch error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  console.log(`[import-queue] sessionId=${sessionId} totalChunks=${totalChunks} isPdfVision=${isPdfVision}`);

  return NextResponse.json({ sessionId, totalChunks, sourceLabel });
}
