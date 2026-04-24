import { NextRequest } from 'next/server';
import { importQuestionsFromContent, importQuestionsFromPdf, importQuestionsFromGeminiFileUri } from '@/ai/flows/import-questions-from-url-flow';
import { PDF_VISION_SIZE_LIMIT } from '@/ai/constants';
import { uploadPdfToGeminiFilesApi } from '@/ai/gemini-files';

/**
 * POST /api/import-questions-stream
 *
 * Server-Sent Events (SSE) version of the import pipeline.
 * No character limit — processes the full document regardless of size.
 * Fragments the content into 10 000-character chunks and emits one SSE
 * event per chunk so the client can save questions to Firestore
 * incrementally and show live progress to the admin.
 *
 * Accepts three input modes:
 *   1. JSON body  { url }
 *   2. FormData   { file }   — file upload (.txt/.csv/.md/.pdf)
 *   3. FormData   { text }
 *
 * Event stream format (each message is `data: <JSON>\n\n`):
 *   { type: 'start',      totalChunks: number, totalChars: number }
 *   { type: 'chunk',      chunkIndex: number, totalChunks: number,
 *                         questions: Question[], questionsInChunk: number,
 *                         totalQuestionsSoFar: number }
 *   { type: 'chunkError', chunkIndex: number, totalChunks: number,
 *                         message: string }
 *   { type: 'done',       totalQuestions: number, sourceNote: string }
 *   { type: 'error',      message: string }   ← fatal, stream ends
 */

const CHUNK_SIZE = 10_000;
/** Last N characters from the previous chunk prepended to the next to avoid splitting questions at boundaries. */
const CHUNK_OVERLAP = 400;

const encoder = new TextEncoder();

function cleanHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Splits text into chunks that respect paragraph boundaries so that questions
 * are never sliced in half. Each chunk is at most CHUNK_SIZE characters; when a
 * paragraph would overflow the current chunk we start a new one and prepend
 * CHUNK_OVERLAP characters from the end of the previous chunk so the AI has
 * enough context to finish any question that was near the boundary.
 */
function splitIntoChunks(text: string): string[] {
  // Split on blank lines (common paragraph/question separator in PDF output)
  const paragraphs = text.split(/\n{2,}/);
  const result: string[] = [];

  let current = '';
  for (const para of paragraphs) {
    // A single paragraph larger than CHUNK_SIZE is split on newlines instead;
    // if an individual line is still larger than CHUNK_SIZE it is character-split below.
    const lines = para.length > CHUNK_SIZE ? para.split('\n') : [para];

    for (const line of lines) {
      // Character-split lines that are still too large on their own
      const segments = line.length > CHUNK_SIZE
        ? Array.from({ length: Math.ceil(line.length / CHUNK_SIZE) }, (_, k) =>
            line.slice(k * CHUNK_SIZE, (k + 1) * CHUNK_SIZE))
        : [line];

      for (const segment of segments) {
        const separator = current ? '\n\n' : '';
        const candidate = current + separator + segment;

        if (candidate.length > CHUNK_SIZE && current) {
          result.push(current);
          // Begin next chunk with a small overlap so boundary questions are intact
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

function sseEvent(data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // disable proxy buffering so events arrive immediately
};

/**
 * Two processing modes:
 *  'pdf-vision' — PDF ≤ PDF_VISION_SIZE_LIMIT: sent directly to Gemini multimodal.
 *                 Gemini reads the actual images/figures and produces accurate SVGs.
 *  'text'       — URL / plain text / large PDF: chunked text pipeline.
 */
type ProcessingMode =
  | { kind: 'pdf-vision'; buffer: Buffer }
  | { kind: 'pdf-files-api'; fileUri: string }
  | { kind: 'text'; rawText: string };

export async function POST(req: NextRequest) {
  let processing: ProcessingMode | null = null;
  let sourceLabel = 'contenido';

  const contentType = req.headers.get('content-type') ?? '';

  // ── Parse input ────────────────────────────────────────────────────────────
  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const text = formData.get('text') as string | null;

      if (file && file.size > 0) {
        const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
        sourceLabel = file.name;

        if (isPdf) {
          const arrayBuffer = await file.arrayBuffer();
          const pdfBuffer = Buffer.from(arrayBuffer);

          if (pdfBuffer.length <= PDF_VISION_SIZE_LIMIT) {
            // Small PDF: use Gemini vision (sees text + embedded images/figures)
            processing = { kind: 'pdf-vision', buffer: pdfBuffer };
          } else {
            // Large PDF: upload to Gemini Files API for full vision (text + figures).
            const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
            if (!apiKey) {
              return new Response(
                sseEvent({ type: 'error', message: 'GOOGLE_GENAI_API_KEY no está configurado. Es necesario para procesar PDFs grandes.' }),
                { status: 500, headers: SSE_HEADERS },
              );
            }
            const fileUri = await uploadPdfToGeminiFilesApi(pdfBuffer, file.name, apiKey);
            processing = { kind: 'pdf-files-api', fileUri };
          }
        } else {
          processing = { kind: 'text', rawText: await file.text() };
        }
      } else if (text && text.trim()) {
        processing = { kind: 'text', rawText: text.trim() };
        sourceLabel = 'texto pegado directamente';
      } else {
        return new Response(sseEvent({ type: 'error', message: 'Se requiere un archivo o texto.' }), {
          status: 400,
          headers: SSE_HEADERS,
        });
      }
    } else {
      const body = await req.json();
      const { url } = body as { url?: string };

      if (!url || typeof url !== 'string') {
        return new Response(
          sseEvent({ type: 'error', message: 'Debes proporcionar una URL válida, un archivo o texto.' }),
          { status: 400, headers: SSE_HEADERS }
        );
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return new Response(
          sseEvent({ type: 'error', message: 'La URL proporcionada no tiene un formato válido.' }),
          { status: 400, headers: SSE_HEADERS }
        );
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return new Response(
          sseEvent({ type: 'error', message: 'Solo se permiten URLs con protocolo http o https.' }),
          { status: 400, headers: SSE_HEADERS }
        );
      }

      try {
        const fetchRes = await fetch(url, {
          headers: { 'User-Agent': 'EntrenadorSaber11/1.0 (content-import)' },
          signal: AbortSignal.timeout(15_000),
        });

        if (!fetchRes.ok) {
          return new Response(
            sseEvent({
              type: 'error',
              message: `No se pudo acceder a la URL. El servidor respondió con: ${fetchRes.status} ${fetchRes.statusText}`,
            }),
            { status: 502, headers: SSE_HEADERS }
          );
        }

        processing = { kind: 'text', rawText: cleanHtml(await fetchRes.text()) };
        sourceLabel = url;
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : 'Error de red desconocido';
        return new Response(
          sseEvent({ type: 'error', message: `No se pudo descargar el contenido de la URL. Detalle: ${msg}` }),
          { status: 502, headers: SSE_HEADERS }
        );
      }
    }
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : 'Error desconocido';
    return new Response(sseEvent({ type: 'error', message: `Error al leer la solicitud: ${msg}` }), {
      status: 400,
      headers: SSE_HEADERS,
    });
  }

  if (!processing) {
    return new Response(sseEvent({ type: 'error', message: 'El contenido proporcionado está vacío.' }), {
      status: 422,
      headers: SSE_HEADERS,
    });
  }

  if (processing.kind === 'text' && !processing.rawText.trim()) {
    return new Response(sseEvent({ type: 'error', message: 'El contenido proporcionado está vacío.' }), {
      status: 422,
      headers: SSE_HEADERS,
    });
  }

  // Capture in closure for the ReadableStream callback
  const capturedProcessing = processing;
  const capturedSourceLabel = sourceLabel;

  // ── SSE stream ─────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      // ── PDF vision branch (no text chunking) ──────────────────────────────
      if (capturedProcessing.kind === 'pdf-vision') {
        controller.enqueue(
          sseEvent({ type: 'start', totalChunks: 1, totalChars: capturedProcessing.buffer.length })
        );

        let result: Awaited<ReturnType<typeof importQuestionsFromPdf>> | null = null;
        let lastErr: unknown = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await importQuestionsFromPdf(capturedProcessing.buffer, capturedSourceLabel);
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 0) {
              console.warn('[import-stream] PDF vision attempt 1 failed, retrying…');
            }
          }
        }

        if (!result) {
          const msg = lastErr instanceof Error ? lastErr.message : 'Error procesando el PDF';
          console.warn('[import-stream] PDF vision failed after retry:', msg);
          controller.enqueue(sseEvent({ type: 'chunkError', chunkIndex: 1, totalChunks: 1, message: msg }));
          controller.enqueue(
            sseEvent({ type: 'error', message: 'No se pudo procesar el PDF. Intenta con un PDF más pequeño o convierte el contenido a texto.' })
          );
          controller.close();
          return;
        }

        const questions = result.questions as Record<string, unknown>[];

        controller.enqueue(
          sseEvent({
            type: 'chunk',
            chunkIndex: 1,
            totalChunks: 1,
            questions,
            questionsInChunk: questions.length,
            totalQuestionsSoFar: questions.length,
          })
        );

        controller.enqueue(
          sseEvent({
            type: 'done',
            totalQuestions: questions.length,
            sourceNote:
              `${result.sourceNote} ` +
              `(visión PDF multimodal — ${questions.length} pregunta(s))`,
          })
        );

        controller.close();
        return;
      }

      // ── PDF Files API branch (large PDFs — full vision via uploaded file) ──
      if (capturedProcessing.kind === 'pdf-files-api') {
        controller.enqueue(sseEvent({ type: 'start', totalChunks: 1, totalChars: 0 }));

        let result: Awaited<ReturnType<typeof importQuestionsFromGeminiFileUri>> | null = null;
        let lastErr: unknown = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await importQuestionsFromGeminiFileUri(capturedProcessing.fileUri, capturedSourceLabel);
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 0) {
              console.warn('[import-stream] Files API attempt 1 failed, retrying…');
            }
          }
        }

        if (!result) {
          const msg = lastErr instanceof Error ? lastErr.message : 'Error procesando el PDF';
          console.warn('[import-stream] Files API failed after retry:', msg);
          controller.enqueue(sseEvent({ type: 'chunkError', chunkIndex: 1, totalChunks: 1, message: msg }));
          controller.enqueue(
            sseEvent({ type: 'error', message: 'No se pudo procesar el PDF. Intenta de nuevo.' })
          );
          controller.close();
          return;
        }

        const filesApiQuestions = result.questions as Record<string, unknown>[];

        controller.enqueue(
          sseEvent({
            type: 'chunk',
            chunkIndex: 1,
            totalChunks: 1,
            questions: filesApiQuestions,
            questionsInChunk: filesApiQuestions.length,
            totalQuestionsSoFar: filesApiQuestions.length,
          })
        );

        controller.enqueue(
          sseEvent({
            type: 'done',
            totalQuestions: filesApiQuestions.length,
            sourceNote:
              `${result.sourceNote} ` +
              `(visión PDF completa via Files API — ${filesApiQuestions.length} pregunta(s))`,
          })
        );

        controller.close();
        return;
      }

      // ── Text chunking branch ───────────────────────────────────────────────
      const chunks = splitIntoChunks(capturedProcessing.rawText);
      const totalChunks = chunks.length;

      controller.enqueue(sseEvent({ type: 'start', totalChunks, totalChars: capturedProcessing.rawText.length }));

      let totalQuestionsFound = 0;
      let combinedNote = '';
      let failedChunks = 0;

      for (let i = 0; i < chunks.length; i++) {
        if (req.signal.aborted) break;

        let result: Awaited<ReturnType<typeof importQuestionsFromContent>> | null = null;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await importQuestionsFromContent({
              url: capturedSourceLabel,
              content: chunks[i],
            });
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 0) {
              console.warn(`[import-stream] chunk ${i + 1}/${totalChunks} failed on attempt 1, retrying…`);
            }
          }
        }

        if (!result) {
          failedChunks++;
          const msg = lastErr instanceof Error ? lastErr.message : 'Error procesando fragmento';
          console.warn(`[import-stream] chunk ${i + 1}/${totalChunks} failed after retry:`, msg);
          controller.enqueue(
            sseEvent({ type: 'chunkError', chunkIndex: i + 1, totalChunks, message: msg })
          );
          continue;
        }

        if (!combinedNote) combinedNote = result.sourceNote;

        const questions = result.questions as Record<string, unknown>[];
        totalQuestionsFound += questions.length;

        controller.enqueue(
          sseEvent({
            type: 'chunk',
            chunkIndex: i + 1,
            totalChunks,
            questions,
            questionsInChunk: questions.length,
            totalQuestionsSoFar: totalQuestionsFound,
          })
        );
      }

      if (totalQuestionsFound === 0) {
        controller.enqueue(
          sseEvent({ type: 'error', message: 'No se pudieron extraer preguntas del contenido proporcionado.' })
        );
      } else {
        const chunkNote = failedChunks > 0 ? `, ${failedChunks} fragmento(s) fallido(s)` : '';
        controller.enqueue(
          sseEvent({
            type: 'done',
            totalQuestions: totalQuestionsFound,
            sourceNote:
              `${combinedNote} ` +
              `(${totalChunks} fragmento(s) — ${totalQuestionsFound} pregunta(s)${chunkNote})`,
          })
        );
      }

      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
