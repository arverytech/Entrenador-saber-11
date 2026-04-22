'use server';
/**
 * @fileOverview Flujo de IA para extraer preguntas estilo ICFES desde texto o PDF.
 *
 * - importQuestionsFromContent - Analiza un fragmento de texto y extrae preguntas.
 * - importQuestionsFromPdf     - Procesa un PDF completo usando visión multimodal de Gemini
 *                                (lee texto e imágenes reales; ≤ 14 MB inline; PDFs mayores
 *                                usan extracción de texto como fallback).
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

// ── PDF vision ──────────────────────────────────────────────────────────────

/**
 * Maximum PDF size (bytes) that can be sent as inline base-64 data to the
 * Gemini API.  The total request must stay under ~20 MB; 14 MB leaves enough
 * headroom for the rest of the payload.
 */
const PDF_VISION_SIZE_LIMIT = 14 * 1024 * 1024; // 14 MB

const PDF_VISION_PROMPT = `Eres un experto constructor de ítems para el examen Saber 11 (ICFES).

Analiza TODAS las páginas de este PDF y extrae TODAS las preguntas de opción múltiple que encuentres.

EXTRACCIÓN DE PREGUNTAS:
- Extrae TODAS las preguntas presentes en el documento sin límite artificial.
- No inventes preguntas si ya existen explícitamente en el PDF.
- Si el documento es material académico sin preguntas, genera preguntas originales de alta calidad al estilo ICFES basadas en el contenido.

REGLAS para las preguntas:
- Cada pregunta debe tener exactamente 4 opciones.
- La opción correcta debe ser única e indiscutible.
- Los distractores deben ser plausibles (errores comunes de razonamiento).
- El enunciado debe ser claro y formal, al estilo de los cuadernillos ICFES.
- Asigna el subjectId correcto: matematicas | lectura | naturales | sociales | ingles | socioemocional
- componentId: componente técnico de la asignatura (p. ej. "Álgebra", "Comprensión lectora").
- competencyId: competencia específica evaluada (p. ej. "Razonamiento", "Interpretación").
- level: exactamente uno de Básico | Medio | Avanzado.

REGLAS PARA EL CAMPO svgData (figuras, gráficas, imágenes, tablas, diagramas):
- Genera svgData para TODA figura geométrica, gráfica cartesiana, mapa, diagrama, imagen o tabla de datos que veas en el PDF junto a una pregunta.
- El SVG debe reproducir fielmente el elemento visual real que aparece en el PDF (no lo inventes).
- Si la pregunta NO tiene ningún elemento visual asociado, omite svgData por completo.
- El SVG debe tener viewBox="0 0 400 300" width="400" height="300".
- Usa SOLO elementos SVG nativos: <rect>, <circle>, <line>, <polyline>, <polygon>, <path>, <text>, <g>, <defs>, <marker>.
- Todo texto dentro del SVG: font-family="Arial, sans-serif", mínimo font-size="12".
- El svgData debe comenzar directamente con <svg (sin <?xml?> ni <!DOCTYPE>).
- No incluyas JavaScript ni dependencias externas.

Responde estrictamente con el esquema JSON proporcionado.`;

/**
 * Processes a PDF buffer using Gemini's multimodal vision.
 * Gemini reads both text content and embedded images/figures from the PDF,
 * producing accurate SVG representations of visual elements (figures, graphs,
 * maps, tables) instead of guessing them from text alone.
 *
 * For PDFs larger than PDF_VISION_SIZE_LIMIT the function falls back to
 * text-only extraction via pdf-parse + importQuestionsFromContent.
 */
export async function importQuestionsFromPdf(
  pdfBuffer: Buffer,
  sourceLabel: string,
): Promise<ImportQuestionsOutput> {
  if (pdfBuffer.length > PDF_VISION_SIZE_LIMIT) {
    // PDF too large for inline data – fall back to text extraction
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const pdfData = await pdfParse(pdfBuffer);
    return importQuestionsFromContent({ url: sourceLabel, content: pdfData.text });
  }

  const base64Data = pdfBuffer.toString('base64');
  const { output } = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    prompt: [
      {
        media: {
          url: `data:application/pdf;base64,${base64Data}`,
          contentType: 'application/pdf',
        },
      },
      { text: PDF_VISION_PROMPT },
    ],
    output: { schema: ImportQuestionsOutputSchema },
  });

  if (!output) throw new Error('La IA no pudo procesar el PDF con visión multimodal.');
  return output;
}

// ── Text-based prompt ───────────────────────────────────────────────────────

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

EXTRACCIÓN DE PREGUNTAS:
- Si el fragmento contiene preguntas de opción múltiple explícitas, extráelas TODAS sin límite artificial (pueden ser hasta 20 o más). No inventes preguntas cuando ya existen en el texto.
- Si el texto no contiene preguntas explícitas pero sí información académica relevante, genera entre 3 y 15 preguntas originales al estilo ICFES basadas en ese contenido.
- Si el contenido no es académicamente relevante, genera al menos 2 preguntas generales de nivel básico sobre las materias del Saber 11.

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
