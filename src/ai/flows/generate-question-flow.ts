'use server';
/**
 * @fileOverview Motor de Generación de Ítems (MGI) basado en estándares ICFES.
 * 
 * - generateIcfesQuestion - Genera una pregunta nueva siguiendo la metodología de Diseño Centrado en Evidencias.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateQuestionInputSchema = z.object({
  subject: z.string().describe('Asignatura (Matemáticas, Lectura, Naturales, etc.)'),
  component: z.string().describe('Componente técnico de la asignatura'),
  competency: z.string().describe('Competencia específica a evaluar'),
  level: z.enum(['Básico', 'Medio', 'Avanzado', 'I', 'II', 'III']).describe('Nivel de dificultad'),
  studentPerformanceHistory: z.string().optional().describe('Historial de rendimiento para ajustar la complejidad'),
});

export type GenerateQuestionInput = z.infer<typeof GenerateQuestionInputSchema>;

const GenerateQuestionOutputSchema = z.object({
  id: z.string(),
  title: z.string().describe('El texto completo de la pregunta incluyendo el contexto'),
  options: z.array(z.string()).length(4).describe('Las 4 opciones de respuesta A, B, C, D'),
  correctIndex: z.number().min(0).max(3).describe('Índice de la respuesta correcta'),
  explanation: z.string().describe('Justificación técnica de por qué esa es la respuesta y las otras son distractores'),
  metadata: z.object({
    component: z.string(),
    competency: z.string(),
    competencyDescription: z.string().describe('Descripción detallada de qué evalúa esta competencia.'),
    level: z.string(),
    evidence: z.string().describe('La evidencia técnica que se está evaluando con este ítem'),
    origin: z.string().default('Original inspirada en el estilo ICFES')
  })
});

export type GenerateQuestionOutput = z.infer<typeof GenerateQuestionOutputSchema>;

export async function generateIcfesQuestion(input: GenerateQuestionInput): Promise<GenerateQuestionOutput> {
  return generateQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuestionPrompt',
  input: { schema: GenerateQuestionInputSchema },
  output: { schema: GenerateQuestionOutputSchema },
  prompt: `Eres un experto constructor de ítems para el examen Saber 11 (ICFES).
Tu misión es generar una pregunta de alta calidad técnica basada en los siguientes parámetros:

Asignatura: {{{subject}}}
Componente: {{{component}}}
Competencia: {{{competency}}}
Nivel: {{{level}}}

REGLAS TÉCNICAS (Metodología DCE):
1. La pregunta debe tener un CONTEXTO claro (un gráfico descrito, una situación, o un texto).
2. El enunciado debe ser una tarea evaluativa directa.
3. Los distractores (opciones incorrectas) deben ser plausibles, es decir, deben nacer de errores comunes de razonamiento en este tema.
4. La clave (respuesta correcta) debe ser única e indiscutible.
5. Debes definir la EVIDENCIA técnica: ¿Qué acción específica del estudiante demuestra que domina la competencia?
6. Describe brevemente la COMPETENCIA evaluada para que el estudiante entienda su importancia académica.

Historial del estudiante (opcional): {{{studentPerformanceHistory}}}

Asegúrate de que el lenguaje sea formal y similar al utilizado en los cuadernillos oficiales del ICFES.`,
});

const generateQuestionFlow = ai.defineFlow(
  {
    name: 'generateQuestionFlow',
    inputSchema: GenerateQuestionInputSchema,
    outputSchema: GenerateQuestionOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return {
      ...output!,
      id: `ai_gen_${Date.now()}`
    };
  }
);
