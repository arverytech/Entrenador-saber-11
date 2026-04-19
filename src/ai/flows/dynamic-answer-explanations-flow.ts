'use server';
/**
 * @fileOverview Generador de explicaciones estructuradas en 3 fases (Diapositivas).
 * 
 * - Planteamiento: Contexto y Competencia.
 * - Solución: Paso a paso pedagógico.
 * - Análisis de Errores: Desglose de distractores.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DynamicAnswerExplanationInputSchema = z.object({
  question: z.string().describe('El texto completo de la pregunta.'),
  userAnswer: z.string().describe('La respuesta elegida por el estudiante.'),
  correctAnswer: z.string().describe('La respuesta correcta.'),
  options: z.array(z.string()).describe('Todas las opciones de respuesta disponibles.'),
  subject: z.string().describe('Asignatura.'),
  component: z.string().describe('Componente evaluado.'),
  competency: z.string().describe('Competencia evaluada.'),
});

export type DynamicAnswerExplanationInput = z.infer<typeof DynamicAnswerExplanationInputSchema>;

const DynamicAnswerExplanationOutputSchema = z.object({
  slide1: z.object({
    title: z.string(),
    metadata: z.object({
      component: z.string(),
      competency: z.string(),
      origin: z.enum(['Adaptada del ICFES', 'Original inspirada en el estilo ICFES']),
    }),
    contextSummary: z.string(),
  }),
  slide2: z.object({
    correctAnswerText: z.string(),
    stepByStep: z.array(z.string()),
    pedagogicalConclusion: z.string(),
  }),
  slide3: z.object({
    title: z.string().default('Análisis de Errores'),
    distractors: z.array(z.object({
      option: z.string(),
      errorType: z.string(),
      explanation: z.string(),
    })),
  }),
});

export type DynamicAnswerExplanationOutput = z.infer<typeof DynamicAnswerExplanationOutputSchema>;

const prompt = ai.definePrompt({
  name: 'dynamicAnswerExplanationPrompt',
  input: { schema: DynamicAnswerExplanationInputSchema },
  output: { schema: DynamicAnswerExplanationOutputSchema },
  prompt: `Eres un experto pedagogo del ICFES. Tu misión es generar una explicación maestra dividida en 3 fases para la siguiente pregunta:

Pregunta: {{{question}}}
Opciones: {{#each options}}- {{{this}}} {{/each}}
Respuesta Correcta: {{{correctAnswer}}}
Respuesta del Estudiante: {{{userAnswer}}}
Asignatura: {{{subject}}}
Componente: {{{component}}}
Competencia: {{{competency}}}

ESTRUCTURA OBLIGATORIA (Sé conciso para evitar timeouts):

DIAPOSITIVA 1: PLANTEAMIENTO
- Define si es "Adaptada del ICFES" o "Original".
- Resume qué se está evaluando técnicamente.

DIAPOSITIVA 2: SOLUCIÓN
- Explica la respuesta correcta con desarrollo paso a paso.

DIAPOSITIVA 3: ANÁLISIS DE ERRORES
- Analiza por qué las otras opciones NO son correctas basándote en errores comunes.

Genera la respuesta siguiendo estrictamente el esquema JSON proporcionado.`,
});

export async function generateExplanation(
  input: DynamicAnswerExplanationInput
): Promise<DynamicAnswerExplanationOutput> {
  const { output } = await prompt(input);
  if (!output) throw new Error("No se pudo generar la explicación");
  return output;
}

export const dynamicAnswerExplanationFlow = ai.defineFlow(
  {
    name: 'dynamicAnswerExplanationFlow',
    inputSchema: DynamicAnswerExplanationInputSchema,
    outputSchema: DynamicAnswerExplanationOutputSchema,
  },
  async input => {
    return generateExplanation(input);
  }
);
