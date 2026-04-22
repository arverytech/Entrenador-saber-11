import { NextRequest, NextResponse } from 'next/server';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';

/**
 * POST /api/generate-explanations-batch
 *
 * Generates AI explanations for a batch of questions.
 * Processes questions in concurrent batches of 5 to avoid saturating the
 * Gemini API while still finishing much faster than sequential processing.
 *
 * Request body:
 *   { questions: Array<{ id, text, options, correctAnswerIndex, subjectId, componentId?, competencyId? }> }
 *
 * Response:
 *   { results: Array<{ id, aiExplanation? }>, failed: number }
 *   — questions that fail silently return only the `id` field (no aiExplanation).
 */

const BATCH_CONCURRENCY = 5;

interface QuestionInput {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  subjectId: string;
  componentId?: string;
  competencyId?: string;
}

export async function POST(req: NextRequest) {
  let questions: QuestionInput[];
  try {
    const body = await req.json();
    if (!Array.isArray(body?.questions)) {
      return NextResponse.json({ error: 'Se requiere un array "questions".' }, { status: 400 });
    }
    questions = body.questions as QuestionInput[];
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  if (questions.length === 0) {
    return NextResponse.json({ results: [], failed: 0 });
  }

  const results: { id: string; aiExplanation?: unknown }[] = [];
  let failed = 0;

  // Process in batches of BATCH_CONCURRENCY
  for (let i = 0; i < questions.length; i += BATCH_CONCURRENCY) {
    const batch = questions.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (q) => {
        const correctAnswer = q.options[q.correctAnswerIndex];
        // Use a wrong option so the explanation covers the error-analysis scenario
        const wrongAnswer = q.options[(q.correctAnswerIndex + 1) % q.options.length];
        const aiExplanation = await generateExplanation({
          question: q.text,
          userAnswer: wrongAnswer,
          correctAnswer,
          options: q.options,
          subject: q.subjectId,
          component: q.componentId || 'General',
          competency: q.competencyId || 'Razonamiento',
        });
        return { id: q.id, aiExplanation };
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j];
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        failed++;
        console.warn(`[generate-explanations-batch] failed for question ${batch[j].id}:`, outcome.reason);
        results.push({ id: batch[j].id });
      }
    }
  }

  return NextResponse.json({ results, failed });
}
