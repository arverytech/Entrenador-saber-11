import { normalizeSubjectId } from '@/lib/normalize-subject-id';

export type SubjectGenerationConfig = {
  subjectId: string;
  subjectName: string;
  components: string[];
  competencies: string[];
};

export const SUBJECT_GENERATION_CONFIG: Record<string, SubjectGenerationConfig> = {
  matematicas: {
    subjectId: 'matematicas',
    subjectName: 'Matemáticas',
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
  },
  lectura: {
    subjectId: 'lectura',
    subjectName: 'Lectura Crítica',
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
  },
  naturales: {
    subjectId: 'naturales',
    subjectName: 'Ciencias Naturales',
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
  },
  sociales: {
    subjectId: 'sociales',
    subjectName: 'Ciencias Sociales y Ciudadanas',
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
  },
  ingles: {
    subjectId: 'ingles',
    subjectName: 'Inglés',
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
  },
  socioemocional: {
    subjectId: 'socioemocional',
    subjectName: 'Socioemocional',
    components: [
      'Autoconocimiento y autorregulación',
      'Empatía y relación con otros',
      'Toma de decisiones responsables',
      'Proyecto de vida y bienestar',
    ],
    competencies: [
      'Reconocimiento de emociones y autocontrol',
      'Análisis de situaciones de convivencia',
      'Evaluación de consecuencias y decisiones éticas',
      'Construcción de estrategias de bienestar personal y colectivo',
    ],
  },
};

export function resolveSubjectGenerationConfig(subjectInput: string): SubjectGenerationConfig | null {
  if (!subjectInput) return null;
  const normalized = normalizeSubjectId(subjectInput);
  return SUBJECT_GENERATION_CONFIG[normalized] ?? null;
}
