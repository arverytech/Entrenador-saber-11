/**
 * Shared constants used by the AI flows and the API route layer.
 *
 * Keep this file free of 'use server' or 'use client' directives so it can be
 * imported from both server components/routes and shared utilities.
 */

/**
 * Maximum PDF buffer size (bytes) that can be sent as inline base-64 data to
 * the Gemini API.  The total multipart request must stay under ~20 MB; 14 MB
 * leaves adequate headroom for the prompt, schema, and other payload fields.
 *
 * PDFs larger than this limit are processed via the text-extraction fallback
 * (pdf-parse + text chunking pipeline) instead of the vision path.
 */
export const PDF_VISION_SIZE_LIMIT = 14 * 1024 * 1024; // 14 MB

/**
 * URLs de referencia oficial ICFES para cada área del Saber 11.
 * Usadas para enriquecer el prompt del generador de ítems.
 */
export const ICFES_REFERENCE_URLS = {
  general: [
    'https://www.icfes.gov.co/caja-de-herramientas-saber-11/que-se-evalua/',
    'https://www.icfes.gov.co/caja-de-herramientas-saber-11/practica/',
    'https://www.icfes.gov.co/wp-content/uploads/2025/03/2.-Diseno-de-armado-para-pruebas-estandarizadas-1.pdf',
    'https://www.icfes.gov.co/wp-content/uploads/2025/02/07-Noviembre-Guia-de-Orientacion-Saber-11-2025-1.pdf',
    'https://www.icfes.gov.co/wp-content/uploads/2025/11/guia-orientacion-saber-11-2026-26-noviembre.pdf',
  ],
  ingles: [
    'https://www.icfes.gov.co/wp-content/uploads/2024/11/Descargue-AQUI-el-marco-de-referencia-Modulo-Ingles.pdf',
    'https://www.icfes.gov.co/wp-content/uploads/2025/12/16-octubre-cuadernillo-ingles-saber-11-2024.pdf',
  ],
};

/**
 * Reglas técnicas por materia extraídas de los marcos de referencia oficiales ICFES 2025-2026.
 * Incluye: componentes válidos, competencias válidas, contextos recomendados y reglas de visuales.
 */
export const SUBJECT_GUIDELINES: Record<string, {
  officialName: string;
  components: string[];
  competencies: string[];
  contextTypes: string[];
  svgRequired: boolean;
  svgFrequency: string;
  bloomLevels: string[];
  rules: string;
}> = {
  matematicas: {
    officialName: 'Matemáticas',
    components: [
      'Componente Numérico-Variacional',
      'Componente Geométrico-Métrico',
      'Componente Aleatorio',
    ],
    competencies: [
      'Razonamiento y argumentación',
      'Comunicación, representación y modelación',
      'Planteamiento y resolución de problemas',
    ],
    contextTypes: [
      'situación cotidiana con datos reales colombianos',
      'problema de geometría con figura',
      'gráfica estadística (barras, sectores, dispersión)',
      'plano cartesiano con función o curva',
      'tabla de datos numéricos',
      'diagrama de probabilidad',
      'problema de optimización en contexto empresarial o ambiental',
    ],
    svgRequired: true,
    svgFrequency: 'OBLIGATORIO en al menos 6 de cada 10 preguntas. Generar planos cartesianos, figuras geométricas, gráficas estadísticas, tablas de datos o diagramas según el componente.',
    bloomLevels: ['Aplicar', 'Analizar', 'Evaluar'],
    rules: `
REGLAS OBLIGATORIAS PARA MATEMÁTICAS (ICFES 2025-2026):
- El enunciado DEBE incluir un contexto situacional real (empresa, experimento, construcción, economía colombiana).
- Nunca preguntar de forma directa "¿Cuánto es X?". Siempre presentar una situación-problema.
- Para el componente Geométrico-Métrico: SIEMPRE generar svgData con la figura geométrica real.
- Para el componente Aleatorio: generar tabla de datos o diagrama de árbol en svgData.
- Para el componente Numérico-Variacional: generar plano cartesiano o tabla cuando aplique.
- Los distractores deben nacer de errores matemáticos comunes: error de signo, confusión de fórmula, operación incorrecta.
- Nivel de complejidad: mínimo "Aplicar" en taxonomía de Bloom. Evitar "Recordar" o "Comprender" solos.
`,
  },
  lectura: {
    officialName: 'Lectura Crítica',
    components: [
      'Componente Semántico',
      'Componente Sintáctico',
      'Componente Pragmático',
    ],
    competencies: [
      'Identificar y entender los contenidos locales que conforman un texto',
      'Comprender cómo se articulan las partes de un texto para darle un sentido global',
      'Reflexionar a partir de un texto y evaluar su contenido',
    ],
    contextTypes: [
      'texto argumentativo de opinión',
      'texto literario (fragmento de novela, cuento o poesía)',
      'texto expositivo científico o académico',
      'texto informativo (noticia, reportaje, crónica)',
      'caricatura o imagen con texto',
      'texto publicitario o de campaña social',
      'infografía con texto complementario',
    ],
    svgRequired: false,
    svgFrequency: 'Generar svgData SOLO cuando la pregunta incluya una caricatura, infografía o imagen que sea parte esencial del texto. En la mayoría de casos NO se necesita SVG.',
    bloomLevels: ['Comprender', 'Analizar', 'Evaluar'],
    rules: `
REGLAS OBLIGATORIAS PARA LECTURA CRÍTICA (ICFES 2025-2026):
- SIEMPRE incluir un texto base de mínimo 100 palabras en el enunciado (fragmento literario, noticia, ensayo).
- La pregunta debe exigir interpretación, análisis o evaluación crítica del texto — nunca simple localización de datos.
- Los 4 tipos de pregunta más comunes en ICFES Lectura:
  1. ¿Cuál es la tesis/idea principal?
  2. ¿Qué función cumple X párrafo/oración?
  3. ¿Qué se puede concluir/inferir del texto?
  4. ¿Qué recurso argumentativo/literario usa el autor?
- Los distractores deben ser interpretaciones parciales o incorrectas del texto, no inventadas.
- Contextos colombianos y latinoamericanos son preferidos.
`,
  },
  naturales: {
    officialName: 'Ciencias Naturales',
    components: [
      'Entorno vivo',
      'Entorno físico',
      'Ciencia, tecnología y sociedad',
    ],
    competencies: [
      'Uso comprensivo del conocimiento científico',
      'Explicación de fenómenos',
      'Indagación',
    ],
    contextTypes: [
      'experimento de laboratorio con resultados',
      'fenómeno natural (clima, ecosistema, reacción química)',
      'tabla de datos experimentales',
      'diagrama de ciclo biológico o proceso químico',
      'gráfica de resultados de investigación',
      'situación ambiental colombiana (biodiversidad, contaminación)',
      'esquema de aparato o sistema (célula, circuito, cadena alimentaria)',
    ],
    svgRequired: true,
    svgFrequency: 'OBLIGATORIO en al menos 5 de cada 10 preguntas. Generar diagramas de experimentos, esquemas de ciclos biológicos, tablas de datos, gráficas de resultados, esquemas de aparatos.',
    bloomLevels: ['Aplicar', 'Analizar', 'Evaluar'],
    rules: `
REGLAS OBLIGATORIAS PARA CIENCIAS NATURALES (ICFES 2025-2026):
- El enunciado DEBE describir un experimento, fenómeno natural o situación científica concreta.
- Para "Indagación": presentar datos de un experimento y pedir al estudiante que formule hipótesis, identifique variables o analice resultados.
- Para "Entorno vivo": incluir diagrama o descripción de proceso biológico (fotosíntesis, digestión, reproducción celular).
- Para "Entorno físico": incluir gráfica o tabla con datos de física o química.
- Generar svgData para: diagramas de experimentos, cadenas alimentarias, circuitos eléctricos, tablas de resultados, ciclos biogeoquímicos.
- Contextos colombianos preferidos: páramos, ríos, biodiversidad, problemáticas ambientales locales.
`,
  },
  sociales: {
    officialName: 'Ciencias Sociales y Ciudadanas',
    components: [
      'Historia y cultura',
      'Espacio, territorio y ambiente',
      'Poder, gobierno y organización social',
      'Economía y desarrollo',
    ],
    competencies: [
      'Pensamiento sistémico',
      'Interpretación y análisis de perspectivas',
      'Pensamiento reflexivo y sistémico',
    ],
    contextTypes: [
      'mapa geográfico o político',
      'línea de tiempo histórica',
      'tabla de indicadores económicos o sociales',
      'fragmento de fuente histórica primaria (discurso, documento)',
      'caricatura política',
      'gráfica de tendencias sociales o económicas',
      'situación de conflicto social o político colombiano',
    ],
    svgRequired: true,
    svgFrequency: 'OBLIGATORIO en al menos 5 de cada 10 preguntas. Generar mapas, líneas de tiempo, tablas de indicadores, gráficas de tendencias o caricaturas políticas simplificadas.',
    bloomLevels: ['Analizar', 'Evaluar', 'Comprender'],
    rules: `
REGLAS OBLIGATORIAS PARA CIENCIAS SOCIALES (ICFES 2025-2026):
- El enunciado DEBE situar al estudiante en un contexto histórico, geográfico o social concreto.
- Para "Historia y cultura": usar eventos históricos colombianos o latinoamericanos reales con fechas y actores concretos.
- Para "Espacio, territorio y ambiente": incluir descripción o mapa de región geográfica colombiana.
- Para "Poder y gobierno": presentar situación de participación ciudadana, instituciones o normas colombianas.
- Para "Economía y desarrollo": incluir datos reales de indicadores colombianos (PIB, desempleo, exportaciones).
- Generar svgData para: mapas político-geográficos simplificados, líneas de tiempo, tablas de indicadores, gráficas de barras con datos reales.
- Los distractores deben representar interpretaciones históricas o geográficas incorrectas pero plausibles.
`,
  },
  ingles: {
    officialName: 'Inglés',
    components: [
      'Listening',
      'Reading',
    ],
    competencies: [
      'Understanding written texts',
      'Identifying specific information',
      'Making inferences',
      'Understanding vocabulary in context',
    ],
    contextTypes: [
      'short informative text (news, article, blog post)',
      'advertisement or notice',
      'informal letter or email',
      'dialogue or conversation transcript',
      'instructions or how-to guide',
    ],
    svgRequired: false,
    svgFrequency: 'Generate svgData ONLY if the question includes a visual element like a chart, map or diagram that is part of the reading passage. Most English questions do NOT need SVG.',
    bloomLevels: ['Comprender', 'Aplicar', 'Analizar'],
    rules: `
MANDATORY RULES FOR ENGLISH (ICFES 2025-2026):
- ALL question text (stem, options, explanation) must be in ENGLISH. Only the aiXml metadata may be in Spanish.
- ALWAYS include a reading passage of at least 80 words in the question text.
- Questions must align with B1-B2 CEFR levels as used in Saber 11.
- Question types: vocabulary in context, main idea, inference, author's purpose, specific detail.
- Distractors must be plausible: wrong answers should use words from the text or related concepts.
- Keep language natural and use contexts relevant to Colombian young adults (school, technology, environment, culture).
`,
  },
};
