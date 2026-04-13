'use server';
/**
 * @fileOverview This file implements a Genkit flow for the 'AdaptiveLearningPath' story.
 *
 * - adaptLearningPath - A function that analyzes student performance and recommends personalized learning paths.
 * - AdaptiveLearningPathInput - The input type for the adaptLearningPath function.
 * - AdaptiveLearningPathOutput - The return type for the adaptLearningPath function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AdaptiveLearningPathInputSchema = z.object({
  studentPerformanceData: z
    .string()
    .describe(
      "JSON string representing the student's detailed performance data, including strengths, weaknesses, answered questions, and time spent."
    ),
  userGoal: z
    .string()
    .describe(
      'The student\u0027s current learning goal or area of focus (e.g., "improve in math", "prepare for exam").'
    ),
  currentContext: z
    .string()
    .optional()
    .describe(
      'Optional: current subject or topic the student is interacting with.'
    ),
});
export type AdaptiveLearningPathInput = z.infer<
  typeof AdaptiveLearningPathInputSchema
>;

const AdaptiveLearningPathOutputSchema = z.object({
  recommendationType: z
    .enum(['questions', 'study_topics', 'mission'])
    .describe(
      'The type of personalized recommendation provided: "questions", "study_topics", or "mission".'
    ),
  recommendations: z
    .array(
      z.object({
        id: z
          .string()
          .optional()
          .describe('Optional ID for a question or topic.'),
        text: z
          .string()
          .describe('Details of the recommendation, e.g., question ID, topic name, or mission description.'),
      })
    )
    .describe('A list of specific recommendations.'),
  motivationMessage: z.string().describe('A short, encouraging message for the student.'),
  gamificationElement: z
    .string()
    .optional()
    .describe(
      'Optional: A suggestion for a gamified element related to the recommendation (e.g., "earn a badge for completing this mission").'
    ),
});
export type AdaptiveLearningPathOutput = z.infer<
  typeof AdaptiveLearningPathOutputSchema
>;

export async function adaptLearningPath(
  input: AdaptiveLearningPathInput
): Promise<AdaptiveLearningPathOutput> {
  return adaptiveLearningPathFlow(input);
}

const prompt = ai.definePrompt({
  name: 'adaptiveLearningPathPrompt',
  input: { schema: AdaptiveLearningPathInputSchema },
  output: { schema: AdaptiveLearningPathOutputSchema },
  prompt: `You are an intelligent personalized learning assistant for the "Entrenador Saber 11" application, designed to help students optimize their preparation in a gamified way.

Your task is to analyze the student's performance and provide a tailored recommendation: either specific questions, study topics, or a personalized 'mission'. Focus on addressing weaknesses, reinforcing strengths, and keeping the student engaged.

Here is the student's performance data:
\u0060\u0060\u0060json
{{{studentPerformanceData}}}
\u0060\u0060\u0060

The student's current learning goal is: "{{{userGoal}}}"
{{#if currentContext}}
The student is currently focused on: "{{{currentContext}}}"
{{/if}}

Based on this information, provide a recommendation that is adapted to the student's needs, keeping in mind the gamified nature of the application. Include a motivational message.

Example Mission Structure:
- Title: "Misión: Dominio de Álgebra Básica"
- Objective: "Completa 10 preguntas de álgebra en menos de 5 minutos con al menos 8 aciertos para ganar 500 puntos."
- Reward: "Desbloquea la insignia 'Matemático Novato'."

Ensure your output strictly adheres to the provided JSON schema.`,
});

const adaptiveLearningPathFlow = ai.defineFlow(
  {
    name: 'adaptiveLearningPathFlow',
    inputSchema: AdaptiveLearningPathInputSchema,
    outputSchema: AdaptiveLearningPathOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
