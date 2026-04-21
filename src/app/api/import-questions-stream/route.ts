import { NextRequest } from 'next/server';
import { importQuestionsFromContent } from '@/ai/flows/import-questions-from-url-flow';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';

/**
 * POST /api/import-questions-stream
 *
 * Server-Sent Events (SSE) version of the import pipeline.
 * No character limit — processes the full document regardless of size.
 * Fragments the content into 10 000-character chunks and emits one SSE
 * event per chunk so the client can save questions to Firestore
 * incrementally and show live progress to the admin.
 *
 * Accepts the same three input modes as /api/import-questions:
 *   1. JSON body  { url, generateExplanations? }
 *   2. FormData   { file, generateExplanations? }        — file upload (.txt/.csv/.md/.pdf)
 *   3. FormData   { text, generateExplanations? }
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

const encoder = new TextEncoder();

function cleanHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
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

async function extractPdfText(file: File): Promise<string> {
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const pdfData = await pdf(buffer);
  return pdfData.text;
}

export async function POST(req: NextRequest) {
  let rawText = '';
  let sourceLabel = 'contenido';
  let preGenerateExplanations = false;

  const contentType = req.headers.get('content-type') ?? '';

  // ── Parse input ────────────────────────────────────────────────────────────
  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const text = formData.get('text') as string | null;
      preGenerateExplanations = formData.get('generateExplanations') === 'true';

      if (file && file.size > 0) {
        const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
        if (isPdf) {
          rawText = await extractPdfText(file);
        } else {
          rawText = await file.text();
        }
        sourceLabel = file.name;
      } else if (text && text.trim()) {
        rawText = text.trim();
        sourceLabel = 'texto pegado directamente';
      } else {
        return new Response(sseEvent({ type: 'error', message: 'Se requiere un archivo o texto.' }), {
          status: 400,
          headers: SSE_HEADERS,
        });
      }
    } else {
      const body = await req.json();
      const { url, generateExplanations } = body as {
        url?: string;
        generateExplanations?: boolean;
      };
      preGenerateExplanations = generateExplanations === true;

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

        rawText = cleanHtml(await fetchRes.text());
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

  if (!rawText.trim()) {
    return new Response(sseEvent({ type: 'error', message: 'El contenido proporcionado está vacío.' }), {
      status: 422,
      headers: SSE_HEADERS,
    });
  }

  const chunks = splitIntoChunks(rawText);
  const totalChunks = chunks.length;

  // ── SSE stream ─────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sseEvent({ type: 'start', totalChunks, totalChars: rawText.length }));

      let totalQuestionsFound = 0;
      let combinedNote = '';
      let failedChunks = 0;
      let totalExplanationFailures = 0;

      for (let i = 0; i < chunks.length; i++) {
        // Respect client disconnect — abort signal propagated by Next.js
        if (req.signal.aborted) break;

        try {
          const result = await importQuestionsFromContent({
            url: sourceLabel,
            content: chunks[i],
          });

          let questions = result.questions as Record<string, unknown>[];
          if (!combinedNote) combinedNote = result.sourceNote;

          // Optionally pre-generate 3-slide AI explanations for this chunk
          if (preGenerateExplanations) {
            const settled = await Promise.allSettled(
              questions.map(async (q) => {
                const options = q.options as string[];
                const correctIdx = q.correctAnswerIndex as number;
                const correctAnswer = options[correctIdx];
                // Use a wrong option so the explanation covers both sides
                const wrongAnswer = options.find((_, idx) => idx !== correctIdx) ?? correctAnswer;

                const aiExplanation = await generateExplanation({
                  question: q.text as string,
                  userAnswer: wrongAnswer,
                  correctAnswer,
                  options,
                  subject: q.subjectId as string,
                  component: (q.componentId as string) || 'General',
                  competency: (q.competencyId as string) || 'Razonamiento',
                });

                return { ...q, aiExplanation };
              })
            );
            // Keep original question (without explanation) if pre-generation failed
            const explanationFailures = settled.filter((r) => r.status === 'rejected').length;
            totalExplanationFailures += explanationFailures;
            if (explanationFailures > 0) {
              console.warn(
                `[import-stream] chunk ${i + 1}/${totalChunks}: ${explanationFailures} explanation(s) failed`
              );
            }
            questions = settled.map((r, idx) => (r.status === 'fulfilled' ? r.value : questions[idx]));
          }

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
        } catch (chunkErr) {
          failedChunks++;
          const msg = chunkErr instanceof Error ? chunkErr.message : 'Error procesando fragmento';
          console.warn(`[import-stream] chunk ${i + 1}/${totalChunks} failed:`, msg);
          controller.enqueue(
            sseEvent({
              type: 'chunkError',
              chunkIndex: i + 1,
              totalChunks,
              message: msg,
            })
          );
        }
      }

      if (totalQuestionsFound === 0) {
        controller.enqueue(
          sseEvent({ type: 'error', message: 'No se pudieron extraer preguntas del contenido proporcionado.' })
        );
      } else {
        const chunkNote = failedChunks > 0 ? `, ${failedChunks} fragmento(s) fallido(s)` : '';
        const explNote = preGenerateExplanations
          ? `, con explicaciones IA pre-generadas${totalExplanationFailures > 0 ? ` (${totalExplanationFailures} fallida(s))` : ''}`
          : '';
        controller.enqueue(
          sseEvent({
            type: 'done',
            totalQuestions: totalQuestionsFound,
            sourceNote:
              `${combinedNote} ` +
              `(${totalChunks} fragmento(s) — ${totalQuestionsFound} pregunta(s)${chunkNote}${explNote})`,
          })
        );
      }

      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
