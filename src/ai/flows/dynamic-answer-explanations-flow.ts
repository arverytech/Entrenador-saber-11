'use server';
/**
 * @fileOverview This file implements a Genkit flow to generate detailed explanations for student answers.
 *
 * - generateExplanation - A function that generates a detailed explanation for a given question and answer.
 * - DynamicAnswerExplanationInput - The input type for the generateExplanation function.
 * - DynamicAnswerExplanationOutput - The return type for the generateExplanation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DynamicAnswerExplanationInputSchema = z.object({
  question: z.string().describe('The full text of the question.'),
  userAnswer: z.string().describe('The answer provided by the student.'),
  correctAnswer: z.string().describe('The correct answer to the question.'),
  context: z
    .string()
    .optional()
    .describe(
      'Optional: Additional context related to the question, such as the subject, topic, or source material.'
    ),
});
export type DynamicAnswerExplanationInput = z.infer<
  typeof DynamicAnswerExplanationInputSchema
>;

const DynamicAnswerExplanationOutputSchema = z.object({
  explanation: z
    .string()
    .describe(
      'A detailed explanation clarifying why the user\'s answer was correct or incorrect, and elaborating on the correct concept.'
    ),
});
export type DynamicAnswerExplanationOutput = z.infer<
  typeof DynamicAnswerExplanationOutputSchema
>;

export async function generateExplanation(
  input: DynamicAnswerExplanationInput
): Promise<DynamicAnswerExplanationOutput> {
  return dynamicAnswerExplanationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'dynamicAnswerExplanationPrompt',
  input: {schema: DynamicAnswerExplanationInputSchema},
  output: {schema: DynamicAnswerExplanationOutputSchema},
  prompt: `Eres un tutor experto en el área de estudio del Saber 11. Tu tarea es proporcionar una explicación detallada y contextualizada sobre la respuesta a una pregunta, indicando si la respuesta del estudiante fue correcta o incorrecta y por qué. Siempre debes explicar el concepto correcto.\n\nPregunta: {{{question}}}\nRespuesta del estudiante: {{{userAnswer}}}\nRespuesta correcta: {{{correctAnswer}}}\n{{#if context}}Contexto adicional: {{{context}}}\n{{/if}}\nBasado en esto, por favor, genera una explicación detallada.`,
});

const dynamicAnswerExplanationFlow = ai.defineFlow(
  {
    name: 'dynamicAnswerExplanationFlow',
    inputSchema: DynamicAnswerExplanationInputSchema,
    outputSchema: DynamicAnswerExplanationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
