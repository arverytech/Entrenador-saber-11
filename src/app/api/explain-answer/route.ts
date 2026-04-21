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
    return NextResponse.json(
      { error: `No se pudo generar la explicación. Verifica la API Key de IA (GOOGLE_GENAI_API_KEY). Detalle: ${msg}` },
      { status: 500 }
    );
  }
}
