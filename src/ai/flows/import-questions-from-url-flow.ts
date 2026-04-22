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
  content: z.string().describe('El contenido de texto de la página o documento (máx. 8 000 caracteres).'),
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
  svgData: z.string().optional().describe('Código SVG completo (sin etiqueta XML) si la pregunta requiere una figura, gráfica, mapa, tabla o diagrama. Omitir si no aplica.'),
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

REGLAS PARA EL CAMPO svgData (figuras, gráficas, mapas, tablas, diagramas):
- Genera svgData ÚNICAMENTE cuando la pregunta necesite un elemento visual para ser comprendida (gráfica de barras, recta numérica, figura geométrica, mapa conceptual, tabla de datos, diagrama de flujo, etc.).
- Si la pregunta NO requiere ningún elemento visual, omite el campo svgData por completo.
- El SVG debe tener siempre viewBox="0 0 400 300" width="400" height="300".
- Usa SOLO elementos SVG nativos: <rect>, <circle>, <line>, <polyline>, <polygon>, <path>, <text>, <g>, <defs>, <marker>.
- Colores permitidos: #1a1a2e (fondo oscuro), #16213e (azul oscuro), #0f3460 (azul medio), #e94560 (rojo acento), #ffffff (blanco), #f5f5f5 (gris claro), #4a90d9 (azul claro), #27ae60 (verde), #f39c12 (naranja).
- Todo texto dentro del SVG debe usar font-family="Arial, sans-serif" y un tamaño legible (mínimo font-size="12").
- Las líneas de ejes deben usar stroke-width="2"; las líneas de datos stroke-width="1.5".
- Incluye siempre etiquetas de texto explicativas en los ejes o elementos clave.
- El SVG debe ser autónomo (sin dependencias externas ni JavaScript).
- No uses etiquetas <?xml?> ni <!DOCTYPE>; el svgData debe comenzar directamente con <svg ...>.
- Valida mentalmente que el SVG sea coherente con el enunciado antes de incluirlo.

Tipos de figuras según la materia:
- matematicas: gráficas cartesianas, figuras geométricas, rectas numéricas, tablas de valores.
- naturales: diagramas de ciclos, tablas comparativas, gráficas de experimentos.
- sociales: líneas de tiempo, mapas esquemáticos, diagramas de relaciones.
- lectura/ingles: tablas de datos textuales si el enunciado las requiere.

EXTRACCIÓN DE PREGUNTAS:
- Si el fragmento contiene preguntas de opción múltiple explícitas, extráelas TODAS sin límite artificial (pueden ser hasta 20 o más). No inventes preguntas cuando ya existen en el texto.
- Si el texto no contiene preguntas explícitas pero sí información académica relevante, genera entre 3 y 15 preguntas originales al estilo ICFES basadas en ese contenido.
- Si el contenido no es académicamente relevante, genera al menos 2 preguntas generales de nivel básico sobre las materias del Saber 11.

IMPORTANTE sobre svgData: Genera el SVG SOLO cuando sea absolutamente imprescindible para entender la pregunta (por ejemplo, una figura geométrica sin la cual la pregunta no tiene sentido). En caso de duda, omite el svgData por completo para garantizar respuestas rápidas y fiables.

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
