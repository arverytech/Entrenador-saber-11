'use server';
/**
 * @fileOverview Generador de explicaciones estructuradas en 3 fases (Diapositivas).
 * 
 * - Planteamiento: Contexto y Competencia.
 * - Solución: Paso a paso pedagógico.
 * - Análisis de Errores: Desglose de distractores.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

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
    title: z.string().describe('Número de pregunta y título.'),
    metadata: z.object({
      component: z.string(),
      competency: z.string(),
      origin: z.enum(['Adaptada del ICFES', 'Original inspirada en el estilo ICFES']),
    }),
    contextSummary: z.string().describe('Resumen del planteamiento técnico.'),
  }),
  slide2: z.object({
    correctAnswerText: z.string(),
    stepByStep: z.array(z.string()).describe('Pasos detallados de la solución.'),
    pedagogicalConclusion: z.string().describe('Resumen de la lección aprendida.'),
  }),
  slide3: z.object({
    title: z.string().default('Análisis de Errores'),
    distractors: z.array(z.object({
      option: z.string().describe('La letra de la opción (A, B, C o D).'),
      errorType: z.string().describe('El error cometido (ej: Error de cálculo, mala lectura).'),
      explanation: z.string().describe('Por qué esta opción es incorrecta.'),
    })).describe('Análisis detallado de cada distractor.'),
  }),
});

export type DynamicAnswerExplanationOutput = z.infer<typeof DynamicAnswerExplanationOutputSchema>;

export async function generateExplanation(
  input: DynamicAnswerExplanationInput
): Promise<DynamicAnswerExplanationOutput> {
  return dynamicAnswerExplanationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'dynamicAnswerExplanationPrompt',
  input: {schema: DynamicAnswerExplanationInputSchema},
  output: {schema: DynamicAnswerExplanationOutputSchema},
  prompt: `Eres un experto pedagogo del ICFES. Tu misión es generar una explicación maestra dividida en 3 fases para la siguiente pregunta:

Pregunta: {{{question}}}
Opciones: {{#each options}}- {{{this}}} {{/each}}
Respuesta Correcta: {{{correctAnswer}}}
Respuesta del Estudiante: {{{userAnswer}}}
Asignatura: {{{subject}}}
Componente: {{{component}}}
Competencia: {{{competency}}}

ESTRUCTURA OBLIGATORIA:

DIAPOSITIVA 1: PLANTEAMIENTO
- Define si es "Adaptada del ICFES" o "Original inspirada en el estilo ICFES".
- Resume el contexto técnico y qué se está evaluando realmente.

DIAPOSITIVA 2: SOLUCIÓN (ESTILO CLASE)
- Explica la respuesta correcta con un desarrollo paso a paso claro y pedagógico.
- Usa un lenguaje que un estudiante de grado 11 entienda perfectamente.

DIAPOSITIVA 3: ANÁLISIS DE ERRORES
- Analiza por qué las otras opciones NO son correctas.
- Identifica el error de razonamiento o proceso que lleva a elegir cada distractor.

Genera la respuesta siguiendo estrictamente el esquema JSON proporcionado.`,
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
