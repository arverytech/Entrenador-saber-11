import { NextRequest, NextResponse } from 'next/server';
import { importQuestionsFromContent } from '@/ai/flows/import-questions-from-url-flow';

/**
 * POST /api/import-questions
 * Body: { url: string }
 *
 * Fetches the page at `url` server-side (avoiding CORS), then uses AI to
 * extract or generate Saber-11-style questions from the content.
 */
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

    // Fetch the remote page (server-side — no CORS issues)
    let pageContent: string;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'EntrenadorSaber11/1.0 (content-import)' },
        signal: AbortSignal.timeout(15_000),
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
        .substring(0, 8_000); // keep within token budget
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Error de red desconocido';
      return NextResponse.json(
        { error: `No se pudo descargar el contenido de la URL. Detalle: ${msg}` },
        { status: 502 }
      );
    }

    // Call the AI flow
    const result = await importQuestionsFromContent({ url, content: pageContent });

    return NextResponse.json({ questions: result.questions, sourceNote: result.sourceNote });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json(
      { error: `Error interno al procesar la solicitud. Detalle: ${msg}` },
      { status: 500 }
    );
  }
}
