'use server';
/**
 * @fileOverview Motor de Generación de Ítems (MGI) basado en estándares ICFES.
 * 
 * - generateIcfesQuestion - Genera una pregunta nueva siguiendo la metodología de Diseño Centrado en Evidencias.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { SUBJECT_GUIDELINES } from '@/ai/constants';

const GenerateQuestionInputSchema = z.object({
  subject: z.string().describe('Asignatura (Matemáticas, Lectura, Naturales, etc.)'),
  component: z.string().describe('Componente técnico de la asignatura'),
  competency: z.string().describe('Competencia específica a evaluar'),
  level: z.enum(['Básico', 'Medio', 'Avanzado', 'I', 'II', 'III']).describe('Nivel de dificultad'),
  studentPerformanceHistory: z.string().optional().describe('Historial de rendimiento para ajustar la complejidad'),
  subjectGuidelines: z.string().optional().describe('Reglas oficiales ICFES para esta materia, inyectadas desde SUBJECT_GUIDELINES'),
  topicName: z.string().optional().describe('Nombre exacto del tema (del catálogo de 92 temas) — restringe el ítem a ese tema específico'),
  visualType: z.string().optional().describe('Tipo visual del catálogo VisualType (ej. plano_cartesiano, esquema_celula, linea_tiempo)'),
  svgInstructions: z.string().optional().describe('Instrucciones SVG exactas y específicas para este tema — sigue estas instrucciones al pie de la letra para construir el svgData'),
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
- El nivel de complejidad debe reflejar el nivel solicitado (Básico / Medio / Avanzado).
- Nunca repitas estructuras de ítem triviales del tipo "¿Cuánto es 2+2?".

{{#if subjectGuidelines}}
### REGLAS ESPECÍFICAS PARA ESTA MATERIA (ICFES OFICIAL):
{{{subjectGuidelines}}}
{{/if}}

{{#if topicName}}
### TEMA ESPECÍFICO OBLIGATORIO:
El ítem DEBE tratar EXCLUSIVAMENTE sobre: {{{topicName}}}
No te desvíes a otros temas. Toda la pregunta, contexto y opciones deben girar alrededor de este tema.
{{/if}}

{{#if svgInstructions}}
### INSTRUCCIONES SVG EXACTAS PARA ESTE ÍTEM:
Construye el campo svgData siguiendo ESTRICTAMENTE estas instrucciones. No improvises ni cambies la estructura:
{{{svgInstructions}}}
{{else}}
### INSTRUCCIONES SVG GENERALES:
Genera svgData únicamente si la pregunta necesita un visual para ser comprendida. Si el tema no requiere visual, omite svgData.
{{/if}}

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
- metadata.icfes2026Alignment: describe qué componente y competencia ICFES 2026 aplican a este ítem.
- aiXml: representación XML DCE del ítem en formato AIXML 2.0 (ver formato más abajo).

REGLAS PARA EL CAMPO svgData (figuras, gráficas, mapas, tablas, diagramas):
- Si se proporcionaron instrucciones SVG específicas arriba, síguelas AL PIE DE LA LETRA.
- Si no se proporcionaron instrucciones SVG, genera svgData ÚNICAMENTE cuando la pregunta necesite un elemento visual para ser comprendida.
- El SVG debe tener siempre viewBox="0 0 400 300" width="400" height="300".
- Usa SOLO elementos SVG nativos: <rect>, <circle>, <line>, <polyline>, <polygon>, <path>, <text>, <g>, <defs>, <marker>.
- Colores permitidos: #1a1a2e, #16213e, #0f3460, #e94560, #ffffff, #f5f5f5, #4a90d9, #27ae60, #f39c12.
- Todo texto dentro del SVG debe usar font-family="Arial, sans-serif" y font-size mínimo 12.
- No uses etiquetas <?xml?> ni <!DOCTYPE>; el svgData debe comenzar directamente con <svg ...>.

FORMATO AIXML 2.0 PARA EL CAMPO aiXml:
<item_icfes>
  <metadatos_psicometricos>
    <area>{subjectId}</area>
    <tema_especifico>[Tema puntual, ej: Teorema de Pitágoras, Fotosíntesis, Independencia de Colombia]</tema_especifico>
    <dificultad_esperada>{level}</dificultad_esperada>
    <discriminacion_esperada>[Alta / Media — el ítem diferencia entre distintos niveles de habilidad]</discriminacion_esperada>
    <nivel_cognitivo_bloom>[Recordar / Comprender / Aplicar / Analizar / Evaluar]</nivel_cognitivo_bloom>
    <origen>Original inspirada en el estilo ICFES 2026</origen>
  </metadatos_psicometricos>
  <diseno_centrado_evidencias>
    <competencia>{competencyId}</competencia>
    <componente>{componentId}</componente>
    <afirmacion>{metadata.affirmation}</afirmacion>
    <evidencia>{metadata.evidence}</evidencia>
  </diseno_centrado_evidencias>
  <cuerpo_pregunta>
    <contexto_situacional>
      <descripcion>[¿De qué trata el escenario? ej: Experimento de física, mapa histórico, balance financiero]</descripcion>
      <texto_evaluacion>[El texto, caso o situación que presenta la pregunta]</texto_evaluacion>
    </contexto_situacional>
    <soporte_visual_prompt>
      <requiere_visual>[true / false]</requiere_visual>
      <tipo_grafico>[Plano Cartesiano / Diagrama / Tabla / Mapa / Gráfica de barras / Figura geométrica / Ninguno]</tipo_grafico>
      <prompt_generacion>[Descripción detallada del visual para reproducción: qué ejes, qué datos, qué elementos geométricos]</prompt_generacion>
    </soporte_visual_prompt>
    <enunciado>{text}</enunciado>
    <opciones_respuesta>
      <opcion id="A" correcta="true/false">[opción A]</opcion>
      <opcion id="B" correcta="true/false">[opción B]</opcion>
      <opcion id="C" correcta="true/false">[opción C]</opcion>
      <opcion id="D" correcta="true/false">[opción D]</opcion>
    </opciones_respuesta>
  </cuerpo_pregunta>
  <analisis_didactico>
    <solucion_paso_a_paso>
      <respuesta_correcta>[Letra correcta]</respuesta_correcta>
      <justificacion_pedagogica>{explanation}</justificacion_pedagogica>
    </solucion_paso_a_paso>
    <analisis_distractores>
      <distractor id="[Letra incorrecta A/B/C]">
        <falsa_plausibilidad>[Por qué parece correcta a simple vista]</falsa_plausibilidad>
        <error_estudiante>[Error cognitivo o conceptual que lleva a elegirla]</error_estudiante>
      </distractor>
      <!-- Un <distractor> por cada opción incorrecta -->
    </analisis_distractores>
  </analisis_didactico>
</item_icfes>

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

  if (!output.aiXml || !output.aiXml.includes('<item_icfes>')) {
    failures.push('aiXml debe seguir el formato AIXML 2.0 con etiqueta <item_icfes>');
  }

  return failures;
}

/** Maps a human-readable subject name to a SUBJECT_GUIDELINES key. */
function resolveSubjectKey(subject: string): string | undefined {
  const s = subject.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('matem')) return 'matematicas';
  if (s.includes('lectura') || s.includes('reading critical')) return 'lectura';
  if (s.includes('natural')) return 'naturales';
  if (s.includes('social') || s.includes('ciudadan')) return 'sociales';
  if (s.includes('ingles') || s.includes('english')) return 'ingles';
  return undefined;
}

/** Formats a SUBJECT_GUIDELINES entry into a prompt-ready string. */
function formatSubjectGuidelines(key: string): string | undefined {
  const g = SUBJECT_GUIDELINES[key];
  if (!g) return undefined;
  return [
    `Para la materia ${g.officialName}, las reglas oficiales ICFES son:`,
    g.rules.trim(),
    `Componentes válidos: ${g.components.join(' | ')}`,
    `Competencias válidas: ${g.competencies.join(' | ')}`,
    `Contextos recomendados: ${g.contextTypes.join(' | ')}`,
    `Instrucción SVG: ${g.svgFrequency}`,
    `Niveles Bloom aplicables: ${g.bloomLevels.join(', ')}`,
  ].join('\n');
}

const generateQuestionFlow = ai.defineFlow(
  {
    name: 'generateQuestionFlow',
    inputSchema: GenerateQuestionInputSchema,
    outputSchema: GenerateQuestionOutputSchema,
  },
  async (input) => {
    // Auto-inject subject guidelines if not provided by the caller
    const enrichedInput = {
      ...input,
      subjectGuidelines: input.subjectGuidelines ?? (() => {
        const key = resolveSubjectKey(input.subject);
        return key ? formatSubjectGuidelines(key) : undefined;
      })(),
    };

    let lastFailures: string[] = [];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { output } = await prompt(enrichedInput);
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
