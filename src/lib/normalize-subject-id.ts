/**
 * Maps legacy or AI-inferred subjectId aliases to the canonical values used by
 * the practice page routes (e.g. /practice/sociales).
 *
 * Extend this map whenever a new alias is detected in imported data.
 */
const SUBJECT_ID_ALIASES: Record<string, string> = {
  social: 'sociales',
};

/**
 * Returns the canonical subjectId for a given input, applying any known alias
 * mappings.  Unrecognised values are returned unchanged.
 *
 * Examples:
 *   normalizeSubjectId('social')      → 'sociales'
 *   normalizeSubjectId('matematicas') → 'matematicas'
 *   normalizeSubjectId('fisica')      → 'fisica'   (no alias defined)
 */
export function normalizeSubjectId(id: string): string {
  const lower = id.toLowerCase();
  return SUBJECT_ID_ALIASES[lower] ?? lower;
}
