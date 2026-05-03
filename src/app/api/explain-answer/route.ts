import { NextRequest, NextResponse } from 'next/server';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';
import type { DynamicAnswerExplanationInput } from '@/ai/flows/dynamic-answer-explanations-flow';

/**
 * POST /api/explain-answer
 * Body: DynamicAnswerExplanationInput JSON
 *
 * Generates a 3-slide AI explanation for a given question and answer.
 * Using an API route instead of calling the server action directly ensures
 * that real error messages surface in production (server actions suppress
 * error details for security, resulting in generic "Server Components render"
 * messages on the client).
 *
 * 429 / RESOURCE_EXHAUSTED errors are returned with HTTP 429 (not 500) so
 * the client can surface a helpful "quota exhausted" message rather than a
 * generic server error.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DynamicAnswerExplanationInput;

    if (!body.question || !Array.isArray(body.options) || !body.correctAnswer) {
      return NextResponse.json(
        { error: 'Datos incompletos: se requiere question, options y correctAnswer.' },
        { status: 400 }
      );
    }

    const result = await generateExplanation(body);
    return NextResponse.json({ explanation: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    const is429 = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
    if (is429) {
      return NextResponse.json(
        { error: 'La cuota de la API de IA está agotada. Intenta de nuevo más tarde.' },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: `No se pudo generar la explicación. Verifica la API Key de IA (GOOGLE_GENAI_API_KEY). Detalle: ${msg}` },
      { status: 500 }
    );
  }
}
