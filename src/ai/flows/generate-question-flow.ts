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
    affirmation: z.string().optional().describe('Afirmación que el ítem pretende demostrar según DCE.'),
    icfes2026Alignment: z.string().optional().describe('Alineación con marcos de referencia ICFES 2026 (ciudadanía global, pensamiento sistémico, etc.).'),
  }),
  // Representación XML del ítem para trazabilidad y auditoría (compatible con formato DCE)
  aiXml: z.string().describe('Representación XML del ítem siguiendo la metodología DCE para auditoría. OBLIGATORIO.'),
});

export type GenerateQuestionOutput = z.infer<typeof GenerateQuestionOutputSchema>;

export async function generateIcfesQuestion(input: GenerateQuestionInput): Promise<GenerateQuestionOutput> {
  return generateQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuestionPrompt',
  input: { schema: GenerateQuestionInputSchema },
  output: { schema: GenerateQuestionOutputSchema },
  prompt: `### ROL: COORDINADOR DE EVALUACIÓN ICFES (SENIOR ASSESSMENT ARCHITECT)
Eres un experto en psicometría y evaluación educativa con dominio total de los marcos de referencia Saber 11° actualizados a 2026.
Tu misión es transformar solicitudes en lenguaje natural en ítems de evaluación técnica de alta calidad.

### METODOLOGÍA DE DISEÑO: DISEÑO CENTRADO EN EVIDENCIAS (DCE)
Para cada ítem generado, debes identificar internamente:
1. Área (Matemáticas, Lectura Crítica, Sociales, Naturales, Inglés).
2. Competencia y Componente según la guía ICFES 2026.
3. Afirmación: el enunciado pedagógico que el ítem intenta demostrar.
4. Evidencia: la acción observable del estudiante que demuestra dominio de la competencia.

### REGLAS DE ORO:
- No utilices lenguaje ambiguo ni enunciados triviales.
- Los distractores deben ser plausibles (nacen de errores comunes de razonamiento, no son descartables a simple vista).
- Alineación 2026: incluye contextos de ciudadanía global, pensamiento sistémico y alfabetización digital cuando el área lo permita.
- El nivel de complejidad debe reflejar el nivel solicitado (Básico / Medio / Avanzado).
- Nunca repitas estructuras de ítem triviales del tipo "¿Cuánto es 2+2?".

---

Genera un ítem de evaluación Saber 11 de alta calidad técnica con los siguientes parámetros:

Asignatura: {{{subject}}}
Componente: {{{component}}}
Competencia: {{{competency}}}
Nivel: {{{level}}}
{{#if studentPerformanceHistory}}Historial del estudiante: {{{studentPerformanceHistory}}}{{/if}}

CAMPOS OBLIGATORIOS Y SUS SIGNIFICADOS:
- text: enunciado completo con contexto situado (igual que en los cuadernillos ICFES). Incluye un texto base, situación o estímulo relevante.
- options: exactamente 4 opciones de respuesta bien redactadas (A, B, C, D).
- correctAnswerIndex: índice 0-3 de la única opción correcta.
- explanation: justificación técnica clara de por qué esa opción es correcta y por qué cada distractor es incorrecto.
- subjectId: usa exactamente uno de: matematicas | lectura | naturales | sociales | ingles | socioemocional
- componentId: componente técnico (p. ej. "Álgebra y funciones", "Comprensión lectora", "Entorno vivo").
- competencyId: competencia específica (p. ej. "Razonamiento y argumentación", "Interpretación y representación").
- level: exactamente uno de: Básico | Medio | Avanzado
- pointsAwarded: siempre 50.
- metadata.competencyDescription: descripción pedagógica de la competencia (mínimo 2 oraciones).
- metadata.evidence: evidencia técnica observable en el estudiante que demuestra dominio.
- metadata.origin: siempre "Original inspirada en el estilo ICFES 2026".
- metadata.affirmation: afirmación pedagógica (p. ej. "El estudiante puede analizar relaciones causales en contextos históricos").
- metadata.icfes2026Alignment: indica si aplican contextos de ciudadanía global, pensamiento sistémico o alfabetización digital.
- aiXml: representación XML DCE del ítem (ver formato más abajo).

REGLAS PARA EL CAMPO svgData (figuras, gráficas, mapas, tablas, diagramas):
- Genera svgData ÚNICAMENTE cuando la pregunta necesite un elemento visual para ser comprendida.
- El SVG debe tener siempre viewBox="0 0 400 300" width="400" height="300".
- Usa SOLO elementos SVG nativos: <rect>, <circle>, <line>, <polyline>, <polygon>, <path>, <text>, <g>, <defs>, <marker>.
- Colores permitidos: #1a1a2e, #16213e, #0f3460, #e94560, #ffffff, #f5f5f5, #4a90d9, #27ae60, #f39c12.
- Todo texto dentro del SVG debe usar font-family="Arial, sans-serif" y font-size mínimo 12.
- No uses etiquetas <?xml?> ni <!DOCTYPE>; el svgData debe comenzar directamente con <svg ...>.

FORMATO XML PARA EL CAMPO aiXml:
<item area="{subjectId}" nivel="{level}">
  <competencia>{competencyId}</competencia>
  <componente>{componentId}</componente>
  <afirmacion>{metadata.affirmation}</afirmacion>
  <evidencia>{metadata.evidence}</evidencia>
  <enunciado>{text}</enunciado>
  <opciones>
    <opcion correcta="true/false">...</opcion>
    <!-- 4 opciones en total -->
  </opciones>
  <justificacion>{explanation}</justificacion>
</item>

Responde estrictamente con el esquema JSON proporcionado. El lenguaje del enunciado debe ser idéntico al utilizado en los cuadernillos oficiales del ICFES.`,
});

/** Minimum thresholds for a non-trivial ICFES question. */
const MIN_TEXT_LENGTH = 80;       // characters — must have a real stimulus/context
const MIN_EXPLANATION_LENGTH = 60; // characters — must justify the answer meaningfully
const MAX_ATTEMPTS = 2;

/**
 * Validates that a generated question meets the minimum quality criteria
 * for a Saber 11 ICFES item.  Returns an array of failure reasons (empty
 * means the question passes).
 */
function qualityFailures(output: GenerateQuestionOutput): string[] {
  const failures: string[] = [];

  if (!output.text || output.text.trim().length < MIN_TEXT_LENGTH) {
    failures.push(`Enunciado demasiado corto (< ${MIN_TEXT_LENGTH} caracteres)`);
  }

  const uniqueOptions = new Set((output.options ?? []).map((o) => o.trim().toLowerCase()));
  if (uniqueOptions.size < 4) {
    failures.push('Las 4 opciones deben ser únicas y distintas');
  }

  if (!output.explanation || output.explanation.trim().length < MIN_EXPLANATION_LENGTH) {
    failures.push(`Justificación demasiado corta (< ${MIN_EXPLANATION_LENGTH} caracteres)`);
  }

  const evidencePresent = output.metadata?.evidence && output.metadata.evidence.trim().length > 0;
  const affirmationPresent = output.metadata?.affirmation && output.metadata.affirmation.trim().length > 0;
  if (!evidencePresent && !affirmationPresent) {
    failures.push('Falta evidencia y/o afirmación DCE en los metadatos');
  }

  if (!output.aiXml || output.aiXml.trim().length === 0) {
    failures.push('Falta aiXml obligatorio');
  }

  return failures;
}

const generateQuestionFlow = ai.defineFlow(
  {
    name: 'generateQuestionFlow',
    inputSchema: GenerateQuestionInputSchema,
    outputSchema: GenerateQuestionOutputSchema,
  },
  async (input) => {
    let lastFailures: string[] = [];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { output } = await prompt(input);
      const candidate = { ...output!, id: `ai_gen_${Date.now()}` };

      lastFailures = qualityFailures(candidate);
      if (lastFailures.length === 0) {
        return candidate;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        console.warn(
          `[generate-question] intento ${attempt + 1} no pasó el quality gate: ${lastFailures.join('; ')} — reintentando…`
        );
      }
    }

    // All attempts exhausted — throw a user-facing error
    throw new Error(
      `La IA no pudo generar una pregunta de alta calidad después de ${MAX_ATTEMPTS} intentos. ` +
      `Criterios no cumplidos: ${lastFailures.join('; ')}.`
    );
  }
);
