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
  // Campos idénticos al schema de preguntas importadas para garantizar compatibilidad total
  text: z.string().describe('Enunciado completo de la pregunta incluyendo el contexto.'),
  options: z.array(z.string()).length(4).describe('Las 4 opciones de respuesta A, B, C, D.'),
  correctAnswerIndex: z.number().min(0).max(3).describe('Índice 0-3 de la opción correcta.'),
  explanation: z.string().describe('Justificación técnica de por qué esa es la respuesta y las otras son distractores.'),
  subjectId: z.string().describe('Materia: matematicas | lectura | naturales | sociales | ingles | socioemocional'),
  componentId: z.string().describe('Componente técnico de la asignatura.'),
  competencyId: z.string().describe('Competencia específica evaluada.'),
  level: z.enum(['Básico', 'Medio', 'Avanzado']).describe('Nivel de dificultad.'),
  pointsAwarded: z.number().default(50),
  svgData: z.string().optional().describe('Código SVG completo (sin etiqueta XML) si la pregunta requiere una figura, gráfica, mapa, tabla o diagrama. Omitir si no aplica.'),
  // Campos extra exclusivos de las preguntas generadas (no afectan la práctica)
  metadata: z.object({
    competencyDescription: z.string().describe('Descripción detallada de qué evalúa esta competencia.'),
    evidence: z.string().describe('La evidencia técnica que se está evaluando con este ítem.'),
    origin: z.string().default('Original inspirada en el estilo ICFES'),
  }),
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
1. La pregunta debe tener un CONTEXTO claro (un gráfico descrito, una situación, o un texto de lectura).
2. El enunciado (campo "text") debe ser una tarea evaluativa directa, formal, igual al estilo de los cuadernillos oficiales ICFES.
3. Los distractores (opciones incorrectas) deben ser plausibles: deben nacer de errores comunes de razonamiento.
4. La clave (correctAnswerIndex) debe ser única e indiscutible.
5. Define la EVIDENCIA técnica: ¿Qué acción específica del estudiante demuestra que domina la competencia?
6. Describe la COMPETENCIA evaluada en "metadata.competencyDescription".

CAMPOS OBLIGATORIOS Y SUS SIGNIFICADOS:
- text: enunciado completo con contexto (igual que en los cuadernillos ICFES).
- options: exactamente 4 opciones de respuesta, bien redactadas.
- correctAnswerIndex: índice 0-3 de la opción correcta.
- explanation: justificación técnica clara de por qué esa opción es correcta y por qué las demás son incorrectas.
- subjectId: usa exactamente uno de: matematicas | lectura | naturales | sociales | ingles | socioemocional
- componentId: componente técnico de la asignatura (p. ej. "Álgebra", "Comprensión lectora", "Entorno vivo").
- competencyId: competencia específica evaluada (p. ej. "Razonamiento y argumentación", "Interpretación y representación").
- level: exactamente uno de: Básico | Medio | Avanzado
- pointsAwarded: siempre 50.
- metadata.competencyDescription: descripción pedagógica de la competencia.
- metadata.evidence: evidencia técnica observable en el estudiante.
- metadata.origin: siempre "Original inspirada en el estilo ICFES".

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

Historial del estudiante (opcional): {{{studentPerformanceHistory}}}

Responde estrictamente con el esquema JSON proporcionado. El lenguaje del enunciado debe ser idéntico al utilizado en los cuadernillos oficiales del ICFES.`,
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
