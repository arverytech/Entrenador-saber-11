'use server';
/**
 * @fileOverview Flujo de IA para extraer preguntas estilo ICFES desde el contenido de texto de una URL.
 *
 * - importQuestionsFromContent - Analiza un texto y extrae preguntas de opción múltiple.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ImportQuestionsInputSchema = z.object({
  url: z.string().describe('La URL de origen del contenido.'),
  content: z.string().describe('El contenido de texto de la página o documento (máx. 40 000 caracteres).'),
});

export type ImportQuestionsInput = z.infer<typeof ImportQuestionsInputSchema>;

const ExtractedQuestionSchema = z.object({
  text: z.string().describe('Enunciado completo de la pregunta.'),
  options: z.array(z.string()).length(4).describe('Exactamente 4 opciones de respuesta.'),
  correctAnswerIndex: z.number().min(0).max(3).describe('Índice 0-3 de la opción correcta.'),
  explanation: z.string().describe('Justificación breve de la respuesta correcta.'),
  subjectId: z.string().describe('Materia: matematicas | lectura | naturales | sociales | ingles | socioemocional'),
  componentId: z.string().describe('Componente técnico de la asignatura.'),
  competencyId: z.string().describe('Competencia específica evaluada.'),
  level: z.enum(['Básico', 'Medio', 'Avanzado']).describe('Nivel de dificultad.'),
  pointsAwarded: z.number().default(50),
});

const ImportQuestionsOutputSchema = z.object({
  questions: z.array(ExtractedQuestionSchema).min(1).describe('Lista de preguntas extraídas o generadas.'),
  sourceNote: z.string().describe('Nota breve sobre la fuente y calidad del contenido analizado.'),
});

export type ImportQuestionsOutput = z.infer<typeof ImportQuestionsOutputSchema>;

export async function importQuestionsFromContent(input: ImportQuestionsInput): Promise<ImportQuestionsOutput> {
  return importQuestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'importQuestionsFromUrlPrompt',
  input: { schema: ImportQuestionsInputSchema },
  output: { schema: ImportQuestionsOutputSchema },
  prompt: `Eres un experto constructor de ítems para el examen Saber 11 (ICFES).

Se te proporciona el contenido de texto de la siguiente URL: {{{url}}}

Contenido:
\`\`\`
{{{content}}}
\`\`\`

Tu tarea es:
1. Si el texto contiene preguntas de opción múltiple explícitas, extráelas y estructura cada una según el esquema JSON.
2. Si el texto no contiene preguntas pero sí contiene información académica relevante (conceptos, temas, definiciones), GENERA preguntas originales de alta calidad al estilo ICFES basadas en ese contenido.
3. Si el contenido no es académicamente relevante, genera al menos 2 preguntas generales de nivel básico sobre las materias del Saber 11.

REGLAS para las preguntas:
- Cada pregunta debe tener exactamente 4 opciones.
- La opción correcta debe ser única e indiscutible.
- Los distractores deben ser plausibles (errores comunes de razonamiento).
- El enunciado debe ser claro y formal, al estilo de los cuadernillos ICFES.
- Asigna el subjectId correcto: matematicas | lectura | naturales | sociales | ingles | socioemocional

Genera entre 2 y 10 preguntas dependiendo de la riqueza del contenido.
Responde estrictamente con el esquema JSON proporcionado.`,
});

const importQuestionsFlow = ai.defineFlow(
  {
    name: 'importQuestionsFromUrlFlow',
    inputSchema: ImportQuestionsInputSchema,
    outputSchema: ImportQuestionsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) throw new Error('La IA no pudo procesar el contenido de la URL.');
    return output;
  }
);
