import { NextRequest, NextResponse } from 'next/server';
import { importQuestionsFromContent } from '@/ai/flows/import-questions-from-url-flow';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';

/**
 * POST /api/import-questions
 * Body: { url: string }
 *
 * Fetches the page at `url` server-side (avoiding CORS), then uses AI to
 * extract or generate Saber-11-style questions from the content.
 * Supports Google Drive / Docs / Sheets share links automatically.
 * Pre-generates the full 3-phase explanation for each question in parallel.
 */

/**
 * Converts a Google Drive / Docs / Sheets share URL into a directly-readable
 * plain-text export URL so that no Drive API key is required.
 * Non-Drive URLs are returned unchanged.
 */
function transformDriveUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname; // e.g. docs.google.com, drive.google.com

    if (!host.endsWith('google.com')) return raw;

    // Google Docs → export as plain text
    const docMatch = u.pathname.match(/\/document\/d\/([^/]+)/);
    if (docMatch) {
      return `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
    }

    // Google Sheets → export as CSV
    const sheetMatch = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (sheetMatch) {
      return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv`;
    }

    // Google Slides → export as plain text
    const slidesMatch = u.pathname.match(/\/presentation\/d\/([^/]+)/);
    if (slidesMatch) {
      return `https://docs.google.com/presentation/d/${slidesMatch[1]}/export?format=txt`;
    }

    // Generic Drive file (e.g. PDF, DOCX) → direct download
    const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
    }
  } catch {
    // Not a valid URL — leave as-is (caller will handle the invalid URL gracefully)
  }
  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body as { url?: string };

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Debes proporcionar una URL válida.' }, { status: 400 });
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'La URL proporcionada no tiene un formato válido.' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Solo se permiten URLs con protocolo http o https.' }, { status: 400 });
    }

    // Convert Drive share links to direct-download / export URLs
    const fetchUrl = transformDriveUrl(url);

    // Fetch the remote page (server-side — no CORS issues)
    let pageContent: string;
    try {
      const response = await fetch(fetchUrl, {
        headers: { 'User-Agent': 'EntrenadorSaber11/1.0 (content-import)' },
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `No se pudo acceder a la URL. El servidor respondió con: ${response.status} ${response.statusText}` },
          { status: 502 }
        );
      }

      const raw = await response.text();
      // Strip HTML tags and collapse whitespace to get plain text for the AI
      pageContent = raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .substring(0, 40_000); // expanded budget for richer academic content
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Error de red desconocido';
      return NextResponse.json(
        { error: `No se pudo descargar el contenido de la URL. Detalle: ${msg}` },
        { status: 502 }
      );
    }

    // Call the AI flow to classify and extract / generate structured questions
    const result = await importQuestionsFromContent({ url, content: pageContent });

    // Pre-generate the full 3-phase AI explanation for every question in parallel.
    // Uses the correct answer as the "user answer" so the explanation is always valid
    // regardless of what the student will later choose.
    // If an individual explanation call fails the question is still saved without it.
    const questionsWithExplanations = await Promise.all(
      result.questions.map(async (q) => {
        try {
          const correctAnswer = q.options[q.correctAnswerIndex];
          const aiExplanation = await generateExplanation({
            question: q.text,
            userAnswer: correctAnswer,
            correctAnswer,
            options: q.options,
            subject: q.subjectId,
            component: q.componentId || 'General',
            competency: q.competencyId || 'Razonamiento',
          });
          return { ...q, aiExplanation };
        } catch (explainErr) {
          // Log the failure so it's visible in server logs; the question is still saved without aiExplanation
          console.warn(`[import-questions] Failed to pre-generate explanation for question "${String(q.text ?? '').substring(0, 60)}…":`, explainErr);
          return q;
        }
      })
    );

    const explanationsGenerated = questionsWithExplanations.filter(q => 'aiExplanation' in q).length;

    return NextResponse.json({
      questions: questionsWithExplanations,
      sourceNote: result.sourceNote,
      explanationsGenerated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json(
      { error: `Error interno al procesar la solicitud. Detalle: ${msg}` },
      { status: 500 }
    );
  }
}
