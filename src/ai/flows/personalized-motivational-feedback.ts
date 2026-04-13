'use server';
/**
 * @fileOverview A Genkit flow for generating personalized motivational feedback for students.
 *
 * - generateMotivationalFeedback - A function that generates personalized motivational feedback.
 * - PersonalizedMotivationalFeedbackInput - The input type for the generateMotivationalFeedback function.
 * - PersonalizedMotivationalFeedbackOutput - The return type for the generateMotivationalFeedback function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const PersonalizedMotivationalFeedbackInputSchema = z.object({
  studentName: z.string().describe('The name of the student.'),
  overallPerformance: z.string().describe('A summary of the student\'s overall academic performance and current status, e.g., "The student shows great potential but struggles with time management in math."'),
  strongestSubject: z.string().optional().describe('The student\'s strongest subject, if applicable, e.g., "Reading Comprehension".'),
  weakestSubject: z.string().optional().describe('The student\'s weakest subject or area needing improvement, if applicable, e.g., "Algebra".'),
  recentScore: z.number().optional().describe('The score from the student\'s most recent exam or practice session, e.g., 75.'),
  progressSummary: z.string().optional().describe('A short summary of the student\'s progress over time, e.g., "improved by 10 points in math over last month, showing consistent effort".'),
  currentGoal: z.string().optional().describe('The student\'s current learning goal or focus area, e.g., "mastering geometry" or "improving English vocabulary".'),
});
export type PersonalizedMotivationalFeedbackInput = z.infer<typeof PersonalizedMotivationalFeedbackInputSchema>;

const PersonalizedMotivationalFeedbackOutputSchema = z.object({
  motivationalMessage: z.string().describe('A personalized, inspiring message acknowledging the student\'s effort, celebrating small wins, and encouraging them for the next steps in their Saber 11 preparation. Focus on their strengths and potential.'),
  studyTip: z.string().describe('A practical, actionable, and personalized study tip specifically tailored to the student\'s performance, weakest subjects, or current goals. This should help them improve their learning strategy.'),
  progressNarrative: z.string().describe('A concise narrative summarizing the student\'s recent achievements, highlighting how far they\'ve come, and connecting their past efforts to their current advancement towards their Saber 11 goals. This should reinforce their journey and growth.'),
});
export type PersonalizedMotivationalFeedbackOutput = z.infer<typeof PersonalizedMotivationalFeedbackOutputSchema>;

export async function generateMotivationalFeedback(
  input: PersonalizedMotivationalFeedbackInput
): Promise<PersonalizedMotivationalFeedbackOutput> {
  return personalizedMotivationalFeedbackFlow(input);
}

const motivationalFeedbackPrompt = ai.definePrompt({
  name: 'motivationalFeedbackPrompt',
  input: { schema: PersonalizedMotivationalFeedbackInputSchema },
  output: { schema: PersonalizedMotivationalFeedbackOutputSchema },
  prompt: `You are an AI motivational coach and academic advisor for students preparing for the Saber 11 exam. Your goal is to provide encouraging, personalized feedback, study tips, and a narrative of their progress to keep them motivated.

Here is the student's information:
Name: {{{studentName}}}
Overall Performance: {{{overallPerformance}}}
{{#if strongestSubject}}Strongest Subject: {{{strongestSubject}}}. {{/if}}
{{#if weakestSubject}}Weakest Subject: {{{weakestSubject}}}. {{/if}}
{{#if recentScore}}Recent Score: {{{recentScore}}}. {{/if}}
{{#if progressSummary}}Progress Summary: {{{progressSummary}}}. {{/if}}
{{#if currentGoal}}Current Learning Goal: {{{currentGoal}}}. {{/if}}

Based on the provided student information, generate a personalized motivational message, a tailored study tip, and a narrative summarizing their progress. Ensure the tone is supportive and encouraging.
`,
});

const personalizedMotivationalFeedbackFlow = ai.defineFlow(
  {
    name: 'personalizedMotivationalFeedbackFlow',
    inputSchema: PersonalizedMotivationalFeedbackInputSchema,
    outputSchema: PersonalizedMotivationalFeedbackOutputSchema,
  },
  async (input) => {
    const { output } = await motivationalFeedbackPrompt(input);
    return output!;
  }
);
