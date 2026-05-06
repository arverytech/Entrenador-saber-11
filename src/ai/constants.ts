/**
 * Shared constants used by the AI flows and the API route layer.
 *
 * Keep this file free of 'use server' or 'use client' directives so it can be
 * imported from both server components/routes and shared utilities.
 */

/**
 * Catalogue of all visual types that can appear in ICFES Saber 11 questions.
 * Used to give Gemini exact SVG-construction instructions per topic instead of
 * vague "generate a diagram" prompts.
 */
export type VisualType =
  | 'plano_cartesiano'       // Matemáticas — ejes X/Y con función o puntos
  | 'figura_geometrica'      // Matemáticas — triángulos, círculos, polígonos
  | 'formula_algebraica'     // Matemáticas — expresión matemática en SVG texto
  | 'diagrama_barras'        // Matemáticas / Sociales — barras verticales u horizontales
  | 'diagrama_sectores'      // Matemáticas / Sociales — gráfico de torta/pie
  | 'esquema_experimental'   // Naturales — vaso precipitado, balanza, instrumentos
  | 'ciclo_biologico'        // Naturales — fotosíntesis, ciclo agua, cadena trófica
  | 'esquema_celula'         // Naturales — célula animal o vegetal con orgánulos
  | 'estructura_quimica'     // Naturales — molécula, átomo, ecuación química
  | 'diagrama_fuerzas'       // Naturales — vectores de fuerza estilo Newton
  | 'circuito_electrico'     // Naturales — circuito simple con batería, resistencias
  | 'cuerpo_humano'          // Naturales — contorno + etiquetas de sistema específico
  | 'mapa_colombia'          // Sociales — regiones o zonas con etiquetas
  | 'linea_tiempo'           // Sociales — eventos cronológicos en eje horizontal
  | 'caricatura_politica'    // Sociales — descripción textual (no viable en SVG)
  | 'tabla_indicadores'      // Sociales — PIB, demografía, indicadores en tabla SVG
  | 'tira_comica'            // Lectura — descripción textual (no viable en SVG)
  | 'aviso_publicitario'     // Lectura — afiche con texto + formas gráficas simples
  | 'cartel_señal'           // Inglés — sign / notice con texto + borde
  | 'tabla_datos'            // General — tabla SVG con filas y columnas de datos
  | 'ninguno';               // Sin visual — pregunta 100 % textual

/** A single topic entry in the ICFES topic catalogue. */
export interface Topic {
  /** Human-readable topic name. */
  name: string;
  /** Component (matches one entry in the subject's `components` array). */
  component: string;
  /** Competency (matches one entry in the subject's `competencies` array). */
  competency: string;
  /** Indicates which visual type this topic typically requires. */
  visualType: VisualType;
  /**
   * Exact SVG-construction instructions for Gemini.
   * For non-viable visual types use the literal string
   * "No generes svgData. Incluye la información como texto en el enunciado."
   */
  svgInstructions: string;
}

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
  /** Ordered catalogue of topics — used for deterministic daily rotation. */
  topics?: Topic[];
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
    topics: [
      {
        name: 'Función lineal — pendiente e intercepto',
        component: 'Componente Numérico-Variacional',
        competency: 'Comunicación, representación y modelación',
        visualType: 'plano_cartesiano',
        svgInstructions: `SVG 400x300px. Plano cartesiano con origen en (200,150). Eje X de -5 a 5 (escala 30px/unidad), eje Y de -4 a 4 (escala 30px/unidad). Dibuja una línea recta usando <line> con pendiente positiva (por ejemplo pasa por (-3,-1) y (3,3)). Marca 3 puntos sobre la recta con <circle r="4" fill="#e94560"/>. Etiqueta los ejes: "x" al final del eje X, "y" en la parte superior del eje Y. Coloca la ecuación "y = mx + b" en la esquina superior izquierda con font-size="14" fill="#0f3460". Ejes en #1a1a2e, línea en #e94560, fondo blanco.`,
      },
      {
        name: 'Función cuadrática — parábola y vértice',
        component: 'Componente Numérico-Variacional',
        competency: 'Comunicación, representación y modelación',
        visualType: 'plano_cartesiano',
        svgInstructions: `SVG 400x300px. Plano cartesiano con origen en (200,150). Eje X de -5 a 5, eje Y de -3 a 5 (escala 28px/unidad). Dibuja una parábola que abre hacia arriba usando <polyline> con al menos 11 puntos calculados (x desde -4 a 4). Marca el vértice con <circle r="5" fill="#e94560"/>. Marca las intersecciones con el eje X con <circle r="4" fill="#27ae60"/>. Etiqueta: "Vértice" junto al vértice, "y=ax²+bx+c" en esquina superior. Ejes #1a1a2e, parábola stroke="#4a90d9" stroke-width="2", fondo blanco.`,
      },
      {
        name: 'Función exponencial — crecimiento y decrecimiento',
        component: 'Componente Numérico-Variacional',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'plano_cartesiano',
        svgInstructions: `SVG 400x300px. Plano cartesiano con origen en (80,220). Eje X de 0 a 8 (escala 35px/unidad), eje Y de 0 a 6 (escala 35px/unidad). Dibuja una curva exponencial creciente (y=2^x aproximado) usando <polyline> con puntos calculados. Dibuja una segunda curva decreciente (y=0.5^x) en otro color. Leyenda pequeña: "Creciente" con swatch azul, "Decreciente" con swatch naranja. Ejes #1a1a2e, curvas stroke-width="2", fondo blanco.`,
      },
      {
        name: 'Sistemas de ecuaciones lineales — punto de intersección',
        component: 'Componente Numérico-Variacional',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'plano_cartesiano',
        svgInstructions: `SVG 400x300px. Plano cartesiano con origen en (200,150). Eje X de -4 a 4 (escala 35px/unidad), eje Y de -3 a 4. Dibuja DOS líneas rectas con pendientes diferentes usando <line>. Marca el punto de intersección con <circle r="6" fill="#f39c12" stroke="#1a1a2e" stroke-width="2"/>. Etiqueta: "Solución (x₀,y₀)" junto al punto. Línea 1 en #e94560, línea 2 en #4a90d9, ejes en #1a1a2e, fondo blanco.`,
      },
      {
        name: 'Inecuaciones lineales — región de solución',
        component: 'Componente Numérico-Variacional',
        competency: 'Razonamiento y argumentación',
        visualType: 'plano_cartesiano',
        svgInstructions: `SVG 400x300px. Plano cartesiano con origen en (200,150). Escala 35px/unidad. Dibuja una línea recta divisoria. Rellena la región de solución con <polygon> semi-transparente usando fill="#4a90d9" fill-opacity="0.25". Coloca el símbolo "≤" o "≥" dentro de la región sombreada. Ejes #1a1a2e, línea de frontera #e94560 stroke-dasharray="5,3", fondo blanco.`,
      },
      {
        name: 'Triángulos y Teorema de Pitágoras',
        component: 'Componente Geométrico-Métrico',
        competency: 'Comunicación, representación y modelación',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Dibuja un triángulo rectángulo en el centro: <polygon points="80,220 280,220 280,80" fill="#f5f5f5" stroke="#0f3460" stroke-width="2"/>. Marca el ángulo recto con un pequeño cuadrado en (280,220). Etiqueta los lados: "a" en el cateto horizontal, "b" en el cateto vertical, "c" en la hipotenusa (diagonal). Escribe "c² = a² + b²" en la parte inferior. Usa fill="#e94560" para el cuadrado del ángulo recto y font-size="14" para etiquetas.`,
      },
      {
        name: 'Circunferencia — elementos y áreas',
        component: 'Componente Geométrico-Métrico',
        competency: 'Comunicación, representación y modelación',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Dibuja una circunferencia centrada en (200,150) con radio 100: <circle cx="200" cy="150" r="100" fill="none" stroke="#0f3460" stroke-width="2"/>. Marca el centro con <circle r="4" fill="#e94560"/>. Dibuja un radio (<line>), un diámetro y una cuerda. Etiquetas: "r" junto al radio, "d" junto al diámetro, "Centro" junto al punto central. Agrega un sector sombreado de 60° con fill="#4a90d9" fill-opacity="0.3". Fondo blanco.`,
      },
      {
        name: 'Polígonos regulares — perímetro y área',
        component: 'Componente Geométrico-Métrico',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Dibuja un hexágono regular centrado en (200,150) usando <polygon> con 6 vértices equidistantes a radio 100px. fill="#f5f5f5" stroke="#0f3460" stroke-width="2". Dibuja las diagonales internas con <line> stroke="#4a90d9" stroke-dasharray="4,3". Etiqueta un lado con "l" y la apotema con "a". Escribe "P = n·l" y "A = P·a/2" en la parte inferior. Fondo blanco.`,
      },
      {
        name: 'Transformaciones geométricas — traslación y reflexión',
        component: 'Componente Geométrico-Métrico',
        competency: 'Comunicación, representación y modelación',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Dibuja un triángulo original en la mitad izquierda (<polygon fill="none" stroke="#0f3460" stroke-width="2">). Dibuja su imagen transformada (traslación o reflexión) en la mitad derecha con stroke="#e94560" stroke-dasharray="5,3". Usa flechas (<marker> con arrowhead) para indicar la transformación. Etiqueta las figuras "Figura original" y "Imagen". Dibuja el eje de reflexión o vector de traslación. Fondo blanco.`,
      },
      {
        name: 'Semejanza y congruencia de triángulos',
        component: 'Componente Geométrico-Métrico',
        competency: 'Razonamiento y argumentación',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Dibuja DOS triángulos: uno pequeño (izquierda) y uno grande similar (derecha). Triángulo pequeño stroke="#0f3460", triángulo grande stroke="#e94560". Marca los ángulos iguales con arcos de colores. Etiqueta los lados con letras a/b/c en el pequeño y a'/b'/c' en el grande. Escribe "a/a' = b/b' = k" en la parte inferior. Fondo blanco.`,
      },
      {
        name: 'Estadística descriptiva — diagrama de barras',
        component: 'Componente Aleatorio',
        competency: 'Comunicación, representación y modelación',
        visualType: 'diagrama_barras',
        svgInstructions: `SVG 400x300px. Diagrama de barras verticales con 5 categorías. Eje X: etiquetas de categoría (ej. "Lunes" a "Viernes"). Eje Y: valores de 0 a 100 con marcas cada 20 unidades. Barras con alturas distintas (ej. 60,80,45,90,70), relleno alterno con #4a90d9 y #0f3460. Etiqueta el valor numérico encima de cada barra con font-size="12". Líneas guía horizontales en #f5f5f5. Título "Frecuencia por categoría" en la parte superior. Fondo blanco.`,
      },
      {
        name: 'Estadística — diagrama de sectores (torta)',
        component: 'Componente Aleatorio',
        competency: 'Comunicación, representación y modelación',
        visualType: 'diagrama_sectores',
        svgInstructions: `SVG 400x300px. Gráfico de torta centrado en (180,150) radio 110px. Dibuja 4 sectores usando <path> con arcos SVG: sector 1=35% (#4a90d9), sector 2=25% (#e94560), sector 3=20% (#27ae60), sector 4=20% (#f39c12). Leyenda a la derecha: cuadrito de color + porcentaje + etiqueta para cada sector. Título "Distribución porcentual" en la parte superior. Fondo blanco.`,
      },
      {
        name: 'Estadística — histograma y distribución de frecuencias',
        component: 'Componente Aleatorio',
        competency: 'Comunicación, representación y modelación',
        visualType: 'diagrama_barras',
        svgInstructions: `SVG 400x300px. Histograma de frecuencias con 6 intervalos contiguos (barras SIN espacio entre ellas). Eje X: intervalos de clase (ej. [0-10), [10-20)…). Eje Y: frecuencia absoluta de 0 a 15. Barras en #4a90d9. Dibuja la curva de distribución por encima usando <polyline> stroke="#e94560" stroke-width="2" fill="none". Marca la media con una línea vertical punteada #f39c12. Etiquetas de eje y título. Fondo blanco.`,
      },
      {
        name: 'Probabilidad — diagrama de árbol',
        component: 'Componente Aleatorio',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Diagrama de árbol con 2 niveles. Raíz en (60,150). Primer nivel: 2 ramas hacia (200,80) y (200,220), etiquetadas "A P=0.6" y "B P=0.4". Segundo nivel: de cada nodo salen 2 ramas más hacia (330,50),(330,110),(330,190),(330,250) con probabilidades condicionales. En el extremo derecho escribe la probabilidad conjunta de cada camino. Usa <line> stroke="#0f3460" y <circle r="5"> en los nodos. Fondo blanco.`,
      },
      {
        name: 'Probabilidad — tabla de distribución y valor esperado',
        component: 'Componente Aleatorio',
        competency: 'Razonamiento y argumentación',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG con 3 columnas: "X" | "P(X)" | "X·P(X)". 5 filas de datos más fila de encabezado. Encabezado con fondo #0f3460 y texto blanco. Filas alternas con fondo #f5f5f5 y blanco. Celda "E(X) = Σ X·P(X)" al final en fondo #4a90d9 texto blanco. Datos numéricos alineados a la derecha. Font-size="13". Fondo blanco.`,
      },
      {
        name: 'Razones, tasas y proporciones en contexto',
        component: 'Componente Numérico-Variacional',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG de 2 columnas: "Variable" | "Valor". 6 filas con datos de razón/proporción (ej. velocidad, precio unitario, tasa de interés). Encabezado #0f3460 texto blanco. Filas alternas #f5f5f5/blanco. Debajo de la tabla, una barra de escala visual mostrando la razón como segmento proporcional comparativo. Font-size="13". Fondo blanco.`,
      },
      {
        name: 'Porcentajes — descuentos, impuestos y variación porcentual',
        component: 'Componente Numérico-Variacional',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG de 3 columnas: "Concepto" | "Valor base" | "Resultado". 4 filas con ejemplos de IVA, descuento, incremento. Encabezado #27ae60 texto blanco. Debajo de la tabla dibuja una barra horizontal doble: la barra de fondo representa el 100% (#e0e0e0), la barra superpuesta representa el porcentaje específico (#4a90d9). Etiqueta "X%" centrado en la barra. Fondo blanco.`,
      },
      {
        name: 'Volúmenes y áreas de sólidos geométricos',
        component: 'Componente Geométrico-Métrico',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Dibuja un prisma rectangular en perspectiva isométrica usando <polygon> y <line>. Cara frontal visible con fill="#f5f5f5" stroke="#0f3460". Cara superior con fill="#e0e0e0". Cara lateral con fill="#c0c0c0". Etiqueta las dimensiones: "l" (largo), "a" (ancho), "h" (altura) con líneas de cota. Escribe "V = l·a·h" y "A_lateral = 2(la+lh+ah)" debajo de la figura. Fondo blanco.`,
      },
      {
        name: 'Vectores en el plano — suma y descomposición',
        component: 'Componente Geométrico-Métrico',
        competency: 'Comunicación, representación y modelación',
        visualType: 'plano_cartesiano',
        svgInstructions: `SVG 400x300px. Plano cartesiano con origen en (200,200). Escala 40px/unidad. Define un <marker id="arrow"> para flechas. Dibuja vector A con <line> + <marker> en #e94560 hacia (120px, -80px desde origen). Dibuja vector B en #4a90d9 hacia (60px, -120px). Dibuja el vector resultante A+B en #27ae60. Etiqueta cada vector con su letra. Usa líneas punteadas para mostrar la regla del paralelogramo. Fondo blanco.`,
      },
      {
        name: 'Sucesiones aritméticas y geométricas',
        component: 'Componente Numérico-Variacional',
        competency: 'Razonamiento y argumentación',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG con 2 secciones: arriba "Sucesión aritmética" (columnas: n | a_n | Diferencia), abajo "Sucesión geométrica" (columnas: n | a_n | Razón). Cada sección con encabezado de color diferente (#4a90d9 arriba, #e94560 abajo). 4 filas de datos en cada sección. Fórmulas "a_n = a_1 + (n-1)d" y "a_n = a_1 · r^(n-1)" al pie. Fondo blanco.`,
      },
      {
        name: 'Optimización — máximos y mínimos en contexto',
        component: 'Componente Numérico-Variacional',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'plano_cartesiano',
        svgInstructions: `SVG 400x300px. Plano cartesiano con origen en (60,250). Eje X de 0 a 8 (escala 40px), eje Y de 0 a 6 (escala 40px). Dibuja una curva cuadrática que tenga un máximo o mínimo claro. Marca el punto óptimo con <circle r="6" fill="#f39c12" stroke="#1a1a2e" stroke-width="2"/>. Traza líneas punteadas verticales y horizontales desde el punto óptimo hasta los ejes. Etiqueta el punto "(x*, f(x*))" con font-size="12". Ejes #1a1a2e, curva #e94560 stroke-width="2". Fondo blanco.`,
      },
      {
        name: 'Trigonometría básica — seno, coseno y tangente',
        component: 'Componente Geométrico-Métrico',
        competency: 'Comunicación, representación y modelación',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Dibuja un triángulo rectángulo grande: vértice recto en (80,240), vértice opuesto en (80,80), vértice hipotenusa en (300,240). Marca el ángulo θ en (300,240) con un arco. Etiqueta: "Opuesto" en el cateto vertical, "Adyacente" en el cateto horizontal, "Hipotenusa" en la diagonal. Escribe debajo: "sen θ = Opuesto/Hipotenusa", "cos θ = Adyacente/Hipotenusa", "tan θ = Opuesto/Adyacente". Font-size="12". Fondo blanco.`,
      },
    ],
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
    topics: [
      {
        name: 'Texto argumentativo — identificar tesis y argumentos',
        component: 'Componente Semántico',
        competency: 'Reflexionar a partir de un texto y evaluar su contenido',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Texto argumentativo — estructura y función de párrafos',
        component: 'Componente Sintáctico',
        competency: 'Comprender cómo se articulan las partes de un texto para darle un sentido global',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Fragmento narrativo — cuento o novela colombiana/latinoamericana',
        component: 'Componente Semántico',
        competency: 'Identificar y entender los contenidos locales que conforman un texto',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Texto poético — figuras literarias y sentido',
        component: 'Componente Semántico',
        competency: 'Reflexionar a partir de un texto y evaluar su contenido',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Texto expositivo científico — organización e ideas clave',
        component: 'Componente Sintáctico',
        competency: 'Comprender cómo se articulan las partes de un texto para darle un sentido global',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Texto informativo — noticia o crónica periodística',
        component: 'Componente Pragmático',
        competency: 'Reflexionar a partir de un texto y evaluar su contenido',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Texto publicitario — afiche y campaña social',
        component: 'Componente Pragmático',
        competency: 'Reflexionar a partir de un texto y evaluar su contenido',
        visualType: 'aviso_publicitario',
        svgInstructions: `SVG 400x300px. Simula un afiche publicitario. Rectángulo de fondo con color llamativo (#e94560 o #0f3460). Bloque de texto principal centrado con font-size="22" fill="white" font-weight="bold": slogan ficticio (ej. "¡Cuida tu planeta!"). Debajo, texto secundario más pequeño font-size="14" fill="#f5f5f5" con mensaje de campaña. En la parte inferior, logo simplificado: círculo con iniciales. Borde del afiche con stroke="#f39c12" stroke-width="3". Sin imágenes fotográficas. Fondo del SVG en #f5f5f5.`,
      },
      {
        name: 'Infografía multimodal — texto con datos visuales',
        component: 'Componente Sintáctico',
        competency: 'Comprender cómo se articulan las partes de un texto para darle un sentido global',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Infografía simple con dos zonas: zona de texto (izquierda 55%) y zona de datos (derecha 45%). Zona de texto: título en #0f3460 font-size="16" font-weight="bold", párrafo de descripción font-size="12". Zona de datos: 3 íconos circulares (<circle r="25">) con cifras clave en el centro y etiqueta debajo. Línea divisoria vertical punteada al centro. Fondo #f5f5f5 con borde redondeado #e0e0e0.`,
      },
    ],
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
    topics: [
      {
        name: 'Célula animal — estructura y función de orgánulos',
        component: 'Entorno vivo',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'esquema_celula',
        svgInstructions: `SVG 400x300px. Célula animal: elipse grande (280x200px) centrada en (200,150), fill="none" stroke="#4a90d9" stroke-width="2". Núcleo: elipse (80x60px) en (190,140), fill="#FFE0B2" stroke="#f39c12". Mitocondria: 2 elipses pequeñas (50x25px) en posiciones (120,100) y (280,200), fill="#C8E6C9" stroke="#27ae60". Ribosomas: 6 círculos r="5" en posiciones dispersas fill="#9C27B0". Vacuola: elipse (40x30px) fill="#BBDEFB". Etiquetas con <line> guía hacia cada orgánulo: "Membrana plasmática", "Núcleo", "Mitocondria", "Ribosomas". Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Célula vegetal — cloroplastos y pared celular',
        component: 'Entorno vivo',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'esquema_celula',
        svgInstructions: `SVG 400x300px. Célula vegetal: rectángulo con esquinas redondeadas (320x220px) centrado en (200,150), fill="none" stroke="#27ae60" stroke-width="3" (pared celular). Membrana interior: rectángulo ligeramente más pequeño stroke="#4a90d9" stroke-dasharray="4,2". Cloroplastos: 3 elipses (55x30px) fill="#81C784" stroke="#2E7D32". Vacuola central grande: elipse (160x100px) fill="#BBDEFB" stroke="#42A5F5". Núcleo: círculo r="35" fill="#FFE0B2" stroke="#f39c12". Etiquetas: "Pared celular", "Cloroplasto", "Vacuola central", "Núcleo". Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Fotosíntesis — proceso y ecuación química',
        component: 'Entorno vivo',
        competency: 'Explicación de fenómenos',
        visualType: 'ciclo_biologico',
        svgInstructions: `SVG 400x300px. Diagrama de fotosíntesis: dibuja una hoja simplificada (elipse verde #81C784) en el centro. Flechas de entrada (izquierda): "CO₂" (flecha →) y "H₂O + luz solar" (flecha ↓) apuntando a la hoja. Flechas de salida (derecha): "O₂" (flecha →) y "Glucosa C₆H₁₂O₆" (flecha ↑) saliendo de la hoja. Ecuación al pie: "6CO₂ + 6H₂O + luz → C₆H₁₂O₆ + 6O₂" en font-size="13" fill="#0f3460". Usa <marker> para las cabezas de flecha en #e94560. Fondo blanco.`,
      },
      {
        name: 'Respiración celular aeróbica — ATP y mitocondria',
        component: 'Entorno vivo',
        competency: 'Explicación de fenómenos',
        visualType: 'ciclo_biologico',
        svgInstructions: `SVG 400x300px. Diagrama de flujo de respiración celular. Rectángulo inicial "Glucosa" (#f39c12) → flecha → rectángulo "Glucólisis" (#4a90d9) → flecha → rectángulo "Ciclo de Krebs" (#27ae60) → flecha → rectángulo "Cadena de transporte" (#e94560). Flechas laterales mostrando: "2 ATP" saliendo de glucólisis, "2 ATP" de ciclo Krebs, "32-34 ATP" de cadena de transporte. Flecha final "CO₂ + H₂O" saliendo del proceso. Font-size="12". Todos los rectángulos con texto centrado en blanco. Fondo blanco.`,
      },
      {
        name: 'Ciclo del agua — evaporación, condensación y precipitación',
        component: 'Entorno físico',
        competency: 'Explicación de fenómenos',
        visualType: 'ciclo_biologico',
        svgInstructions: `SVG 400x300px. Ciclo del agua: dibuja montaña (triángulo #8D6E63) a la derecha, nubes (3 círculos superpuestos #B0BEC5) arriba al centro, cuerpo de agua (rectángulo curvo #42A5F5) abajo izquierda. Flechas curvas de proceso: "Evaporación" del agua hacia las nubes, "Condensación" en las nubes, "Precipitación" (lluvia, líneas verticales cortas) de las nubes hacia la montaña/tierra, "Escorrentía" de montaña al agua, "Infiltración" hacia abajo. Etiqueta cada flecha con el nombre del proceso. Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Ciclo del carbono — biosfera y atmósfera',
        component: 'Entorno físico',
        competency: 'Explicación de fenómenos',
        visualType: 'ciclo_biologico',
        svgInstructions: `SVG 400x300px. Ciclo del carbono simplificado: zona superior (atmósfera, fondo #E3F2FD) con etiqueta "CO₂ atmosférico"; zona inferior (biosfera, fondo #E8F5E9). Dibuja: planta verde (rectángulo #81C784) que absorbe CO₂ (flecha con "Fotosíntesis"), animal (círculo #FF8A65) que libera CO₂ (flecha con "Respiración"), fábrica (rectángulo #90A4AE) con flecha "Combustión". Flecha de "Descomposición" desde restos orgánicos al suelo y al aire. Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Cadena trófica y red alimentaria — ecosistema colombiano',
        component: 'Entorno vivo',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'ciclo_biologico',
        svgInstructions: `SVG 400x300px. Cadena alimentaria de 4 eslabones en disposición horizontal. Nodo 1 (productores): rectángulo verde #81C784 "Plantas/Algas". Nodo 2 (herbívoros): rectángulo #FFB74D "Insectos/Conejos". Nodo 3 (carnívoros primarios): rectángulo #EF9A9A "Rana/Serpiente". Nodo 4 (carnívoros tope): rectángulo #EF5350 "Águila/Puma". Flechas gruesas entre nodos con <marker> indicando flujo de energía. Etiqueta sobre cada flecha "Energía 10%". Texto al pie: "Pirámide de energía" con triángulo #f5f5f5. Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Ecosistemas colombianos — biomas y biodiversidad',
        component: 'Ciencia, tecnología y sociedad',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG de 3 columnas: "Bioma" | "Características" | "Ejemplo Colombia". 6 filas: Páramo, Selva amazónica, Bosque seco, Manglar, Sabana, Zona costera. Encabezado #27ae60 texto blanco. Filas alternas #f5f5f5/blanco. Font-size="12". Al pie, nota: "Colombia: 2.° país con mayor biodiversidad". Fondo blanco.`,
      },
      {
        name: 'Mitosis — fases de división celular',
        component: 'Entorno vivo',
        competency: 'Explicación de fenómenos',
        visualType: 'ciclo_biologico',
        svgInstructions: `SVG 400x300px. Diagrama lineal de 5 fases de mitosis. Dibuja 5 círculos (r=35px) equiespaciados horizontalmente, cada uno representando una fase: "Profase" (cromosomas condensándose, líneas curvas), "Metafase" (cromosomas en línea), "Anafase" (cromosomas separándose), "Telofase" (2 núcleos formándose), "Citocinesis" (2 células). Flechas entre círculos. Etiqueta cada fase debajo. Colores: degradado de #4a90d9 a #e94560. Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Meiosis — variación genética y gametos',
        component: 'Entorno vivo',
        competency: 'Explicación de fenómenos',
        visualType: 'ciclo_biologico',
        svgInstructions: `SVG 400x300px. Diagrama de meiosis en dos filas. Fila superior (Meiosis I): célula madre (2n) → 2 células (n) con crossing-over indicado. Fila inferior (Meiosis II): cada célula n → 2 células n (4 gametos totales). Marca el crossing-over con un "X" en #f39c12. Muestra los cromosomas como barras de colores (#e94560 materno, #4a90d9 paterno). Etiquetas: "2n=4" y "n=2". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Herencia mendeliana — cuadro de Punnett',
        component: 'Entorno vivo',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Cuadro de Punnett 2x2 centrado. Encabezados de fila y columna con alelos parentales (ej. "A", "a"). Las 4 celdas internas muestran los genotipos descendientes (AA, Aa, Aa, aa). Colorea las celdas por fenotipo: dominante en #81C784, recesivo en #FFCC80. A la derecha: tabla de proporciones "Genotípica: 1AA:2Aa:1aa" y "Fenotípica: 3 dom : 1 rec". Font-size="14". Bordes de tabla #0f3460. Fondo blanco.`,
      },
      {
        name: 'Sistema digestivo humano — órganos y funciones',
        component: 'Entorno vivo',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'cuerpo_humano',
        svgInstructions: `SVG 400x300px. Contorno torso humano simplificado (rectángulo redondeado). Dibuja órganos del sistema digestivo como formas simples: boca (rectángulo superior), esófago (tubo vertical), estómago (saco J #FFCC80), intestino delgado (tubo enrollado #FFB74D), intestino grueso (tubo curvo más ancho #FF8A65), recto (tubo inferior). Líneas de etiqueta hacia cada órgano: "Boca", "Esófago", "Estómago", "Int. Delgado", "Int. Grueso", "Recto". Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Sistema circulatorio — corazón y circulación sanguínea',
        component: 'Entorno vivo',
        competency: 'Explicación de fenómenos',
        visualType: 'cuerpo_humano',
        svgInstructions: `SVG 400x300px. Diagrama del corazón: 4 cámaras (2 aurículas arriba, 2 ventrículos abajo) como rectángulos redondeados. Aurícula izquierda (#EF9A9A), aurícula derecha (#90CAF9), ventrículo izquierdo (#E57373), ventrículo derecho (#42A5F5). Flechas indicando flujo: "Sangre oxigenada" en rojo, "Sangre desoxigenada" en azul. Etiquetas de cámaras y vasos principales (Aorta, Vena cava, Arteria pulmonar). Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Sistema nervioso central — cerebro y médula espinal',
        component: 'Entorno vivo',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'cuerpo_humano',
        svgInstructions: `SVG 400x300px. Silueta de cabeza y columna vertebral. Cerebro: forma ovalada superior (#FFCC80) con surcos (líneas curvas). Cerebelo: forma pequeña posterior (#FFB74D). Tronco encefálico: rectángulo inferior del cerebro (#FF8A65). Médula espinal: tubo largo bajando por la columna (#F48FB1). Etiquetas con líneas guía: "Cerebro", "Cerebelo", "Tronco encefálico", "Médula espinal". Flechas bidireccionales mostrando "Señales sensoriales" (↑) y "Señales motoras" (↓). Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Sistema respiratorio — intercambio gaseoso en los pulmones',
        component: 'Entorno vivo',
        competency: 'Explicación de fenómenos',
        visualType: 'cuerpo_humano',
        svgInstructions: `SVG 400x300px. Dibuja: tráquea (tubo superior vertical, #B0BEC5), dos bronquios (tubos ramificados, #90A4AE), pulmón izquierdo y pulmón derecho (siluetas lobuladas, fill="#FFCCBC" stroke="#E64A19"). Alvéolo ampliado en un recuadro: círculo pequeño con capilares circulantes. Flechas: "O₂" entrando al alvéolo, "CO₂" saliendo. Etiquetas: "Tráquea", "Bronquio", "Pulmón", "Alvéolo". Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Segunda Ley de Newton — fuerza, masa y aceleración',
        component: 'Entorno físico',
        competency: 'Explicación de fenómenos',
        visualType: 'diagrama_fuerzas',
        svgInstructions: `SVG 400x300px. Dibuja un bloque (rectángulo 80x50px) en el centro del diagrama sobre una superficie horizontal (línea). Define <marker id="arrow"> para flechas. Dibuja: Fuerza aplicada F (flecha larga →, #e94560) hacia la derecha. Peso W (flecha ↓, #0f3460) hacia abajo. Normal N (flecha ↑, #27ae60) hacia arriba. Fricción f (flecha ←, #f39c12) hacia la izquierda (si aplica). Etiqueta cada vector con su nombre y símbolo. Ecuación "F = m·a" en la esquina superior. Fondo blanco.`,
      },
      {
        name: 'Vectores de fuerza — descomposición y equilibrio',
        component: 'Entorno físico',
        competency: 'Comunicación, representación y modelación',
        visualType: 'diagrama_fuerzas',
        svgInstructions: `SVG 400x300px. Plano con origen en (200,200). Define <marker id="arrow">. Dibuja un vector resultante F en #e94560 en dirección diagonal (ángulo 40°). Descompón en componente Fx horizontal (#4a90d9, flecha →) y Fy vertical (#27ae60, flecha ↑). Líneas punteadas para completar el rectángulo de descomposición. Marca el ángulo θ en el origen. Etiquetas: "F", "Fx = F·cosθ", "Fy = F·senθ". Fondo blanco.`,
      },
      {
        name: 'Energía cinética y potencial — conservación de la energía',
        component: 'Entorno físico',
        competency: 'Explicación de fenómenos',
        visualType: 'diagrama_barras',
        svgInstructions: `SVG 400x300px. Diagrama de barras apiladas para 3 posiciones de un objeto en movimiento (ej. péndulo): posición alta izquierda, posición central (abajo), posición alta derecha. Cada barra apilada muestra Ec (energía cinética, #e94560) + Ep (energía potencial, #4a90d9) = E total constante (#27ae60 línea horizontal). Eje Y: "Energía (J)". Eje X: "Posición". Leyenda. Etiqueta la barra central con "Ec máxima, Ep mínima" y las laterales con "Ep máxima, Ec mínima". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Ondas mecánicas — longitud de onda, amplitud y frecuencia',
        component: 'Entorno físico',
        competency: 'Comunicación, representación y modelación',
        visualType: 'figura_geometrica',
        svgInstructions: `SVG 400x300px. Eje horizontal de 0 a 400px en y=150. Dibuja una onda sinusoidal usando <polyline> con al menos 20 puntos calculados, stroke="#4a90d9" stroke-width="2.5" fill="none". Eje X en #1a1a2e. Marca: amplitud A con flecha bidireccional vertical (#e94560) desde el eje hasta el pico. Longitud de onda λ con flecha bidireccional horizontal (#27ae60) entre dos crestas. Etiquetas: "A" (amplitud), "λ" (longitud de onda), "Cresta", "Valle". Fórmula "v = f·λ" en esquina superior. Fondo blanco.`,
      },
      {
        name: 'Circuito eléctrico simple — resistencias en serie',
        component: 'Entorno físico',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'circuito_electrico',
        svgInstructions: `SVG 400x300px. Circuito eléctrico en serie: rectángulo de circuito con 4 lados. Lado izquierdo: batería (símbolo de líneas paralelas largas/cortas, #f39c12). Lado superior: 2 resistencias en serie (símbolos zigzag, #e94560). Lado derecho: interruptor (línea con gap, #0f3460). Lado inferior: alambre conductor (#1a1a2e). Etiquetas: "V" (voltaje), "R₁", "R₂", "I" con flecha de dirección de corriente. Ecuación "Rtotal = R₁ + R₂" debajo del circuito. Fondo blanco.`,
      },
      {
        name: 'Circuito eléctrico — ley de Ohm y resistencias en paralelo',
        component: 'Entorno físico',
        competency: 'Planteamiento y resolución de problemas',
        visualType: 'circuito_electrico',
        svgInstructions: `SVG 400x300px. Circuito en paralelo: batería a la izquierda, 2 ramas paralelas a la derecha, cada rama con una resistencia (zigzag). Conectadas arriba y abajo. Etiquetas: "V", "R₁", "R₂", "I₁", "I₂", "I total". Ecuación "1/Rtotal = 1/R₁ + 1/R₂" y "V = I·R" debajo. Usa colores: batería #f39c12, resistencias #e94560, conductores #1a1a2e. Fondo blanco.`,
      },
      {
        name: 'Reacción química — balanceo y conservación de la masa',
        component: 'Entorno físico',
        competency: 'Explicación de fenómenos',
        visualType: 'estructura_quimica',
        svgInstructions: `SVG 400x300px. Representa una reacción química balanceada visualmente. Lado izquierdo (reactivos): dibuja moléculas como círculos de colores unidos (ej. H₂O: 1 círculo grande azul #42A5F5 + 2 círculos pequeños blancos con borde). Flecha central de reacción → con "calor" o "luz" encima. Lado derecho (productos): moléculas de producto. Ecuación balanceada en texto debajo: "2H₂ + O₂ → 2H₂O". Etiqueta "Reactivos" izquierda, "Productos" derecha. Colores: O=#EF5350, H=blanco con borde, C=#424242. Fondo blanco.`,
      },
      {
        name: 'Estructura atómica — modelo de Bohr',
        component: 'Entorno físico',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'estructura_quimica',
        svgInstructions: `SVG 400x300px. Modelo de Bohr centrado en (200,150). Núcleo: círculo r=30 fill="#EF5350" con texto "p⁺ n" en blanco. 3 órbitas elípticas concéntricas stroke="#4a90d9" stroke-dasharray="4,2". Electrones en las órbitas: círculos pequeños r=6 fill="#42A5F5". Primera órbita: 2 electrones, segunda: 8 electrones, tercera: 3 electrones (ejemplo: Aluminio Z=13). Etiquetas: "Núcleo", "Electrón", "Órbita 1 (n=1)", "Órbita 2 (n=2)", "Órbita 3 (n=3)". Fondo blanco.`,
      },
      {
        name: 'Tabla periódica — tendencias y grupos principales',
        component: 'Entorno físico',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla simplificada de la tabla periódica: muestra los 18 grupos y 7 periodos como una cuadrícula reducida. Colorea grupos: metales alcalinos (#EF5350), metales alcalinotérreos (#FF8A65), halógenos (#AB47BC), gases nobles (#42A5F5), metales de transición (#78909C). Etiqueta los grupos 1, 2, 17, 18 explícitamente. Dibuja flechas que muestren tendencia de electronegatividad (↗) y radio atómico (↙). Font-size="10". Leyenda de colores. Fondo blanco.`,
      },
      {
        name: 'Soluciones — escala de pH y acidez/basicidad',
        component: 'Entorno físico',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Escala de pH horizontal de 0 a 14. Barra de gradiente de color: rojo (#EF5350) en 0-6 (ácido), verde (#66BB6A) en 7 (neutro), azul (#42A5F5) en 8-14 (básico). Marcas en 0,1,2,...,14. Debajo de la barra, etiquetas de ejemplo: "HCl (0)", "Jugo gástrico (2)", "Leche (6.5)", "Agua pura (7)", "Sangre (7.4)", "NaOH (14)". Título "Escala de pH". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Experimento de laboratorio — variables y diseño experimental',
        component: 'Ciencia, tecnología y sociedad',
        competency: 'Indagación',
        visualType: 'esquema_experimental',
        svgInstructions: `SVG 400x300px. Dibuja 2 grupos de experimento lado a lado. Grupo control (izquierda): vaso precipitado (trapecio con agua azul) etiquetado "Grupo control — sin tratamiento". Grupo experimental (derecha): vaso precipitado con sustancia diferente (agua naranja) etiquetado "Grupo experimental — con tratamiento X". Flechas indicando "Variable independiente (X)" y "Variable dependiente (Y medida)". Tabla pequeña debajo: "Variable" | "Tipo" | "Valor". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Cambio climático — impacto en Colombia y biodiversidad',
        component: 'Ciencia, tecnología y sociedad',
        competency: 'Indagación',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG de 3 columnas: "Efecto del cambio climático" | "Región colombiana afectada" | "Evidencia". 6 filas con datos reales (ej. deshielo glaciar en Sierra Nevada, blanqueamiento coral en Islas del Rosario, sequías en La Guajira). Encabezado #0f3460 texto blanco. Filas alternas #f5f5f5/blanco. Pequeño gráfico de barras debajo mostrando temperatura promedio vs año (tendencia creciente). Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Biotecnología — ADN recombinante y aplicaciones',
        component: 'Ciencia, tecnología y sociedad',
        competency: 'Uso comprensivo del conocimiento científico',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto detallado en el enunciado.',
      },
    ],
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
    topics: [
      {
        name: 'Independencia de Colombia 1810-1819 — causas y consecuencias',
        component: 'Historia y cultura',
        competency: 'Interpretación y análisis de perspectivas',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo horizontal de 1808 a 1821. Eje horizontal en y=150 de x=40 a x=360. Marca 6 hitos: 1808 (crisis española), 1810 (20 de julio), 1811 (primera república), 1814 (reconquista), 1819 (batalla de Boyacá), 1821 (Cúcuta). Cada hito: línea vertical corta + círculo r=6 fill="#e94560" + etiqueta de texto en 45° para que no se solapen. Título "Independencia de Colombia" en la parte superior. Font-size="11". Fondo blanco.`,
      },
      {
        name: 'El Bogotazo 1948 y La Violencia — causas y efectos',
        component: 'Historia y cultura',
        competency: 'Interpretación y análisis de perspectivas',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo de 1945 a 1958. Hitos: 1946 (elección Ospina), 9 de abril 1948 (asesinato de Gaitán / Bogotazo), 1949 (cierre del Congreso), 1953 (golpe Rojas Pinilla), 1957 (plebiscito), 1958 (inicio Frente Nacional). Círculos alternos en #e94560 y #0f3460. Etiquetas con eventos concretos. Título "El Bogotazo y La Violencia". Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Constitución Política de Colombia 1991 — principios y derechos',
        component: 'Poder, gobierno y organización social',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Regiones naturales de Colombia — características geográficas',
        component: 'Espacio, territorio y ambiente',
        competency: 'Pensamiento sistémico',
        visualType: 'mapa_colombia',
        svgInstructions: `SVG 400x300px. Mapa esquemático de Colombia: contorno simplificado del país (polígono irregular). Divide el mapa en 6 zonas coloreadas: Caribe (#FFCC80), Pacífico (#81C784), Andina (#EF9A9A), Orinoquía (#90CAF9), Amazonía (#A5D6A7), Insular (punto en mar). Etiqueta cada región con su nombre y una característica: "Caribe — Caluroso", "Andina — Cordilleras". Leyenda de colores en esquina inferior. Font-size="11". Fondo blanco.`,
      },
      {
        name: 'División político-administrativa de Colombia — departamentos',
        component: 'Espacio, territorio y ambiente',
        competency: 'Pensamiento sistémico',
        visualType: 'mapa_colombia',
        svgInstructions: `SVG 400x300px. Mapa esquemático de Colombia dividido en grandes zonas departamentales. Colorea por grupos de departamentos según región: nororiente en #FFCC80, eje cafetero en #81C784, sur en #90CAF9, oriente en #A5D6A7. Marca con estrella y punto "Bogotá D.C." (capital). Marca otras capitales: "Medellín", "Cali", "Barranquilla", "Cartagena" con círculos pequeños. Título "Colombia — División administrativa". Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Conquista española de América — 1492 a 1550',
        component: 'Historia y cultura',
        competency: 'Interpretación y análisis de perspectivas',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo de 1492 a 1550. Hitos: 1492 (llegada de Colón), 1499 (Alonso de Ojeda en Colombia), 1519 (Cortés en México), 1532 (Pizarro en Perú), 1536 (fundación de Bogotá), 1542 (Leyes Nuevas). Font-size="11". Colores alternos #4a90d9 y #e94560. Fondo blanco.`,
      },
      {
        name: 'Revolución Industrial — efectos sociales y económicos',
        component: 'Historia y cultura',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo de 1760 a 1900. Hitos clave: 1769 (máquina de vapor), 1790 (inicio textil masivo), 1830 (ferrocarriles), 1848 (Manifiesto Comunista), 1870 (2ª Revolución Industrial), 1900 (electricidad masiva). Etiquetas inclinadas. Título "Revolución Industrial". Font-size="11". Fondo blanco.`,
      },
      {
        name: 'El Frente Nacional 1958-1974 — pacto bipartidista',
        component: 'Historia y cultura',
        competency: 'Interpretación y análisis de perspectivas',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo de 1957 a 1978. Hitos: 1957 (plebiscito), 1958-62 (Alberto Lleras — Liberal), 1962-66 (Guillermo León Valencia — Conservador), 1966-70 (Carlos Lleras — Liberal), 1970-74 (Misael Pastrana — Conservador), 1974 (fin del Frente Nacional). Bloques de color alternos azul (#4a90d9) y rojo (#e94560) para bipartidismo. Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Conflicto armado colombiano — actores y procesos de paz',
        component: 'Historia y cultura',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo de 1960 a 2020. Hitos: 1964 (fundación FARC), 1970 (M-19), 1980 (paramilitares AUC), 1990 (desmovilización M-19), 2002 (política de seguridad democrática), 2016 (Acuerdo de paz FARC). Font-size="11". Colores por actor. Fondo blanco.`,
      },
      {
        name: 'PIB y sectores económicos de Colombia',
        component: 'Economía y desarrollo',
        competency: 'Pensamiento sistémico',
        visualType: 'diagrama_barras',
        svgInstructions: `SVG 400x300px. Diagrama de barras horizontales mostrando participación de sectores en el PIB colombiano. Sectores: Servicios (55%), Industria (26%), Agricultura (7%), Minería (5%), Construcción (7%). Barras horizontales de longitud proporcional, colores distintos. Eje X: porcentaje de 0 a 60%. Etiqueta de porcentaje al final de cada barra. Título "PIB Colombia por sectores". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Demografía colombiana — población y migración',
        component: 'Espacio, territorio y ambiente',
        competency: 'Pensamiento sistémico',
        visualType: 'tabla_indicadores',
        svgInstructions: `SVG 400x300px. Tabla de indicadores demográficos: 3 columnas "Indicador" | "2005" | "2023". Filas: Población total, Tasa de natalidad, Tasa de mortalidad, Esperanza de vida, Densidad poblacional, % urbano. Encabezado #0f3460 texto blanco. Filas alternas. Al lado derecho, pirámide poblacional simplificada: barras horizontales simétricas para grupos de edad, azul (hombres) y rosa (mujeres). Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Comercio exterior colombiano — exportaciones e importaciones',
        component: 'Economía y desarrollo',
        competency: 'Pensamiento sistémico',
        visualType: 'diagrama_barras',
        svgInstructions: `SVG 400x300px. Diagrama de barras agrupadas: barras de exportaciones (#4a90d9) e importaciones (#e94560) para 5 años (2018-2022). Eje Y: valor en millones USD. Eje X: años. Leyenda. Principales exportaciones en lista de texto: "Petróleo 40%, Carbón 12%, Café 7%…". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Recursos naturales de Colombia — distribución y uso',
        component: 'Espacio, territorio y ambiente',
        competency: 'Pensamiento sistémico',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG de 4 columnas: "Recurso" | "Región" | "Uso principal" | "% del PIB aprox.". 6 filas: Petróleo/Gas, Carbón, Oro, Café, Esmeraldas, Agua. Encabezado #27ae60 texto blanco. Filas alternas. Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Derechos fundamentales — Constitución de 1991',
        component: 'Poder, gobierno y organización social',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Mecanismos de participación ciudadana en Colombia',
        component: 'Poder, gobierno y organización social',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'ninguno',
        svgInstructions: 'No generes svgData. Incluye la información como texto en el enunciado.',
      },
      {
        name: 'Ramas del poder público en Colombia',
        component: 'Poder, gobierno y organización social',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Organigrama de las 3 ramas del poder público. Nodo central "Estado colombiano" en rectángulo #0f3460 texto blanco. Tres ramas: "Poder Legislativo" (#4a90d9) con sub-nodos "Senado" y "Cámara de Representantes"; "Poder Ejecutivo" (#e94560) con "Presidencia" y "Ministerios"; "Poder Judicial" (#27ae60) con "Corte Suprema" y "Consejo de Estado". Conectores con líneas. Font-size="12". Fondo blanco.`,
      },
      {
        name: 'América Latina en el siglo XX — revoluciones y dictaduras',
        component: 'Historia y cultura',
        competency: 'Interpretación y análisis de perspectivas',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo de 1900 a 1990. Hitos: 1910 (Revolución Mexicana), 1929 (crisis económica), 1959 (Revolución Cubana), 1973 (golpe Pinochet Chile), 1979 (Revolución Nicaragüense), 1989 (fin dictaduras militares). Font-size="11". Hitos marcados con círculos de tamaño proporcional a importancia. Fondo blanco.`,
      },
      {
        name: 'Primera y Segunda Guerra Mundial — causas y consecuencias',
        component: 'Historia y cultura',
        competency: 'Interpretación y análisis de perspectivas',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Doble línea de tiempo: fila superior WWI (1914-1918), fila inferior WWII (1939-1945). WWI: 1914 (inicio), 1917 (EEUU entra), 1918 (Armisticio). WWII: 1939 (invasión Polonia), 1941 (Pearl Harbor), 1944 (D-Day), 1945 (fin). Encima del intervalo, número de víctimas aproximado. Colores: WWI en #4a90d9, WWII en #e94560. Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Guerra Fría — bloques y conflictos',
        component: 'Historia y cultura',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'linea_tiempo',
        svgInstructions: `SVG 400x300px. Línea de tiempo de 1947 a 1991. Hitos: 1947 (Doctrina Truman), 1950 (Guerra de Corea), 1961 (Muro de Berlín), 1962 (Crisis de los misiles), 1969 (llegada a la Luna), 1975 (fin Vietnam), 1989 (caída del Muro), 1991 (disolución URSS). Fondo dividido en dos colores: mitad superior azul (#E3F2FD) para EEUU, mitad inferior rojo (#FFEBEE) para URSS. Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Globalización — tratados comerciales y Colombia',
        component: 'Economía y desarrollo',
        competency: 'Pensamiento sistémico',
        visualType: 'tabla_indicadores',
        svgInstructions: `SVG 400x300px. Tabla SVG de 3 columnas: "TLC/Acuerdo" | "País/Bloque" | "Año entrada en vigor". 7 filas con los principales TLC de Colombia (EEUU, UE, Mercosur, etc.). Encabezado #0f3460 texto blanco. Filas alternas. Al lado, mini gráfico de barras comparando exportaciones antes y después de un TLC. Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Desarrollo sostenible y problemáticas ambientales',
        component: 'Espacio, territorio y ambiente',
        competency: 'Pensamiento reflexivo y sistémico',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla de 3 columnas: "Problema ambiental" | "Causa principal" | "Acción sostenible". 6 filas: deforestación, contaminación hídrica, erosión, pérdida de biodiversidad, emisiones CO₂, minería ilegal. Encabezado #27ae60 texto blanco. Filas alternas. Al pie, diagrama de los 3 pilares del desarrollo sostenible: 3 círculos solapados (Ambiental/Social/Económico). Font-size="11". Fondo blanco.`,
      },
      {
        name: 'Urbanización y migración interna en Colombia',
        component: 'Espacio, territorio y ambiente',
        competency: 'Pensamiento sistémico',
        visualType: 'diagrama_barras',
        svgInstructions: `SVG 400x300px. Diagrama de barras verticales mostrando el % de población urbana por ciudad en Colombia: Bogotá, Medellín, Cali, Barranquilla, Cartagena, Bucaramanga. Barras en gradiente de #4a90d9 a #0f3460. Eje Y: porcentaje de 0 a 100. Línea horizontal de referencia al 50% (color #f39c12 punteada). Etiqueta el valor encima de cada barra. Título "Principales ciudades de Colombia". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Desigualdad social en Colombia — índice Gini',
        component: 'Economía y desarrollo',
        competency: 'Pensamiento sistémico',
        visualType: 'tabla_indicadores',
        svgInstructions: `SVG 400x300px. Tabla de indicadores de desigualdad: "Año" | "Gini Colombia" | "Gini América Latina" | "Gini OCDE". 5 filas (2000, 2005, 2010, 2015, 2022). Encabezado #0f3460. Debajo, línea de tiempo mini con los valores del Gini colombiano (valores 0.50 a 0.55 en escala). Nota al pie: "0 = perfecta igualdad; 1 = perfecta desigualdad". Font-size="12". Fondo blanco.`,
      },
      {
        name: 'Diversidad étnica y cultural en Colombia',
        component: 'Historia y cultura',
        competency: 'Interpretación y análisis de perspectivas',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Tabla SVG de 3 columnas: "Grupo étnico" | "% población" | "Región principal". 6 filas: Mestizo 49%, Blanco 37%, Afrocolombiano 10%, Indígena 3.4%, ROM 0.01%, otros. Encabezado #4a90d9 texto blanco. Filas alternas. A la derecha, gráfico de sectores simplificado (4 sectores) con los grupos principales. Colores de sectores distintos. Font-size="12". Fondo blanco.`,
      },
    ],
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
    topics: [
      {
        name: 'Advertisement reading — products and services',
        component: 'Reading',
        competency: 'Identifying specific information',
        visualType: 'cartel_señal',
        svgInstructions: `SVG 400x300px. Simulate an advertisement sign. Outer rectangle with thick border stroke="#0f3460" stroke-width="4". Top banner: fill="#0f3460" with product/service name in white text font-size="20" font-weight="bold". Middle area fill="#f5f5f5": main advertising message in 2-3 lines font-size="14" fill="#1a1a2e". Bottom strip: price or call-to-action in #e94560 font-size="16" font-weight="bold". Keep text in English. Rounded corners. Fondo blanco.`,
      },
      {
        name: 'Informal letter / email — personal communication',
        component: 'Reading',
        competency: 'Understanding written texts',
        visualType: 'ninguno',
        svgInstructions: 'Do not generate svgData. Include the email/letter as plain text in the question stem.',
      },
      {
        name: 'News article — main idea and supporting details',
        component: 'Reading',
        competency: 'Understanding written texts',
        visualType: 'ninguno',
        svgInstructions: 'Do not generate svgData. Include the news article as plain text in the question stem.',
      },
      {
        name: 'Dialogue — social and everyday situations',
        component: 'Reading',
        competency: 'Making inferences',
        visualType: 'ninguno',
        svgInstructions: 'Do not generate svgData. Present the dialogue as formatted conversation text in the question stem.',
      },
      {
        name: 'Instructions and how-to guides — steps and directions',
        component: 'Reading',
        competency: 'Identifying specific information',
        visualType: 'cartel_señal',
        svgInstructions: `SVG 400x300px. Instruction sign/notice layout. Title bar: fill="#27ae60" text white font-size="18" bold "How to..." or "Steps to...". Body: 4 numbered steps in bordered rectangles with step number circle (#0f3460 background, white text) and instruction text font-size="13". Light separator lines between steps. Optional small icon shapes (triangle, circle) as visual cues per step. Bottom note in italics font-size="11". Fondo blanco.`,
      },
      {
        name: 'Travel and tourism text — places and activities',
        component: 'Reading',
        competency: 'Understanding written texts',
        visualType: 'ninguno',
        svgInstructions: 'Do not generate svgData. Include the travel text as plain text in the question stem.',
      },
      {
        name: 'Science and technology text — environment and innovation',
        component: 'Reading',
        competency: 'Making inferences',
        visualType: 'tabla_datos',
        svgInstructions: `SVG 400x300px. Simple data table in English. 3 columns: "Factor" | "Current value" | "Trend". 5 rows with environmental or technology data (e.g., CO₂ levels, renewable energy share, smartphone users). Header fill="#0f3460" text white. Alternating row colors #f5f5f5/white. Last column shows trend with ↑ (#e94560) or ↓ (#27ae60) arrows. Font-size="13". White background.`,
      },
      {
        name: 'Social and health issues text — opinions and arguments',
        component: 'Reading',
        competency: 'Making inferences',
        visualType: 'ninguno',
        svgInstructions: 'Do not generate svgData. Include the text as plain text in the question stem.',
      },
      {
        name: 'Academic and school text — education and learning',
        component: 'Reading',
        competency: 'Understanding written texts',
        visualType: 'ninguno',
        svgInstructions: 'Do not generate svgData. Include the text as plain text in the question stem.',
      },
      {
        name: 'Cultural text — Colombian and Latin American context',
        component: 'Reading',
        competency: 'Understanding vocabulary in context',
        visualType: 'ninguno',
        svgInstructions: 'Do not generate svgData. Include the cultural text as plain text in the question stem.',
      },
    ],
  },
};
