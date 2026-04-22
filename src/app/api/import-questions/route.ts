import { NextRequest, NextResponse } from 'next/server';
import { importQuestionsFromContent } from '@/ai/flows/import-questions-from-url-flow';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';

/**
 * POST /api/import-questions
 *
 * Accepts three input modes:
 *   1. JSON body  { url, generateExplanations? }         — fetches a web page server-side
 *   2. FormData   { file, generateExplanations? }        — file upload (.txt/.csv/.md/.pdf)
 *   3. FormData   { text, generateExplanations? }        — raw text pasted by the admin
 *
 * Large content is split into 10 000-character chunks so the AI can handle
 * documents of any size. After extraction, if `generateExplanations` is true,
 * a structured 3-slide explanation is pre-generated for every question and
 * stored in the `aiExplanation` field so students see them instantly.
 */

const CHUNK_SIZE = 10_000;
const CHUNK_OVERLAP = 400; // chars of overlap to avoid splitting questions at boundaries
/**
 * Hard cap kept intentionally for this non-streaming endpoint so that
 * one-shot JSON responses remain predictable and within Cloud Run's
 * response-size limits. For unlimited document sizes use the SSE route
 * at /api/import-questions-stream instead.
 */
const MAX_CONTENT = 100_000;

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
  const limited = text.slice(0, MAX_CONTENT);
  const paragraphs = limited.split(/\n{2,}/);
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

async function extractPdfText(file: File): Promise<string> {
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const pdfData = await pdf(buffer);
  return pdfData.text;
}

export async function POST(req: NextRequest) {
  try {
    let rawText = '';
    let sourceLabel = 'contenido';
    let preGenerateExplanations = false;

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      // ── File upload or pasted text ──────────────────────────────────────
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
        return NextResponse.json(
          { error: 'Se requiere un archivo o texto.' },
          { status: 400 }
        );
      }
    } else {
      // ── URL (JSON body) ─────────────────────────────────────────────────
      const body = await req.json();
      const { url, generateExplanations } = body as {
        url?: string;
        generateExplanations?: boolean;
      };
      preGenerateExplanations = generateExplanations === true;

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

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'EntrenadorSaber11/1.0 (content-import)' },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          return NextResponse.json(
            {
              error: `No se pudo acceder a la URL. El servidor respondió con: ${response.status} ${response.statusText}`,
            },
            { status: 502 }
          );
        }

        rawText = cleanHtml(await response.text());
        sourceLabel = url;
      } catch (fetchErr: unknown) {
        const msg =
          fetchErr instanceof Error ? fetchErr.message : 'Error de red desconocido';
        return NextResponse.json(
          { error: `No se pudo descargar el contenido de la URL. Detalle: ${msg}` },
          { status: 502 }
        );
      }
    }

    // ── Split into chunks and process each with the AI ────────────────────
    const chunks = splitIntoChunks(rawText);
    const allQuestions: Record<string, unknown>[] = [];
    let combinedNote = '';
    let failedChunks = 0;

    for (const chunk of chunks) {
      try {
        const result = await importQuestionsFromContent({
          url: sourceLabel,
          content: chunk,
        });
        allQuestions.push(...(result.questions as Record<string, unknown>[]));
        if (!combinedNote) combinedNote = result.sourceNote;
      } catch (chunkErr) {
        failedChunks++;
        console.warn(`[import-questions] chunk ${failedChunks} failed:`, chunkErr instanceof Error ? chunkErr.message : chunkErr);
      }
    }

    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No se pudieron extraer preguntas del contenido proporcionado.' },
        { status: 422 }
      );
    }

    // ── Optionally pre-generate 3-slide AI explanations ───────────────────
    let finalQuestions: Record<string, unknown>[] = allQuestions;
    let explanationFailures = 0;

    if (preGenerateExplanations) {
      finalQuestions = await Promise.all(
        allQuestions.map(async (q) => {
          try {
            const options = q.options as string[];
            const correctIdx = q.correctAnswerIndex as number;
            const correctAnswer = options[correctIdx];
            // Use the first wrong option as the simulated student answer so
            // the explanation covers both why the correct answer is right and
            // why the distractor is wrong.
            const wrongAnswer =
              options.find((_, i) => i !== correctIdx) ?? correctAnswer;

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
          } catch (explErr) {
            explanationFailures++;
            console.warn(`[import-questions] explanation pre-generation failed for question "${q.text}":`, explErr instanceof Error ? explErr.message : explErr);
            // Save the question without a pre-generated explanation; the student
            // can still request it on-demand from the practice page.
            return q;
          }
        })
      );
    }

    const chunkNote = failedChunks > 0 ? `, ${failedChunks} fragmento(s) fallido(s)` : '';
    const explNote = preGenerateExplanations
      ? `, explicaciones IA pre-generadas${explanationFailures > 0 ? ` (${explanationFailures} fallida(s))` : ''}`
      : '';

    const note =
      `${combinedNote} ` +
      `(${chunks.length} fragmento(s) procesado(s) — ${finalQuestions.length} pregunta(s) extraída(s)` +
      `${chunkNote}${explNote})`;

    return NextResponse.json({ questions: finalQuestions, sourceNote: note });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json(
      { error: `Error interno al procesar la solicitud. Detalle: ${msg}` },
      { status: 500 }
    );
  }
}
