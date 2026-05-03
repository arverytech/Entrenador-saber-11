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
  // Optional aiXml from the question — used to ground the explanation in DCE metadata
  aiXml: z.string().optional().describe('Representación XML DCE del ítem (si está disponible).'),
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
  prompt: `Eres el Maestro IA del entrenador Saber 11. Generas explicaciones pedagógicas profundas, no triviales, con el rigor de un experto evaluador ICFES 2026.
{{#if aiXml}}
Tienes acceso al XML DCE del ítem:
<aiXml>
{{{aiXml}}}
</aiXml>
Usa la <afirmacion>, <evidencia> y <competencia> de ese XML para enriquecer las tres diapositivas.
{{/if}}

Pregunta: {{{question}}}
Opciones: {{#each options}}- {{{this}}}
{{/each}}
Respuesta Correcta: {{{correctAnswer}}}
Respuesta del Estudiante: {{{userAnswer}}}
Asignatura: {{{subject}}} | Componente: {{{component}}} | Competencia: {{{competency}}}

ESTRUCTURA OBLIGATORIA — sé técnico, profundo y conciso (evita frases genéricas):

DIAPOSITIVA 1 — PLANTEAMIENTO (contextSummary):
- Clasifica el ítem: "Adaptada del ICFES" u "Original inspirada en el estilo ICFES".
- Resume en 2–3 oraciones técnicas QUÉ competencia se evalúa y POR QUÉ es relevante en Saber 11.
- Si hay aiXml disponible, cita la afirmación y la evidencia DCE.

DIAPOSITIVA 2 — SOLUCIÓN (stepByStep + pedagogicalConclusion):
- Desarrolla la solución en pasos numerados (mínimo 3 pasos).  Cada paso debe incluir el razonamiento, no solo el resultado.
- El campo pedagogicalConclusion debe resumir el principio o ley que sustenta la respuesta correcta.

DIAPOSITIVA 3 — ANÁLISIS DE ERRORES (distractors):
- Para CADA opción incorrecta indica: el errorType (nombre del error cognitivo o conceptual) y la explanation (mínimo 1 oración que explique por qué un estudiante podría elegirla y por qué está mal).

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
