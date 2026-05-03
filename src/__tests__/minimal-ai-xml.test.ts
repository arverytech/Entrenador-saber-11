/**
 * @jest-environment node
 *
 * Unit tests for the generateMinimalAiXml helper.
 */

import { generateMinimalAiXml, type MinimalQuestionFields } from '@/lib/minimal-ai-xml';

const baseQuestion: MinimalQuestionFields = {
  subjectId: 'matematicas',
  componentId: 'Álgebra',
  competencyId: 'Razonamiento',
  level: 'Medio',
  text: 'Si f(x) = 2x + 3, ¿cuál es el valor de f(4)?',
  options: ['8', '10', '11', '14'],
  correctAnswerIndex: 2,
  explanation: 'f(4) = 2(4) + 3 = 8 + 3 = 11',
};

describe('generateMinimalAiXml', () => {
  it('produces a non-empty XML string', () => {
    const xml = generateMinimalAiXml(baseQuestion);
    expect(typeof xml).toBe('string');
    expect(xml.trim().length).toBeGreaterThan(0);
  });

  it('starts with <item and ends with </item>', () => {
    const xml = generateMinimalAiXml(baseQuestion);
    expect(xml.trim().startsWith('<item')).toBe(true);
    expect(xml.trim().endsWith('</item>')).toBe(true);
  });

  it('includes area and nivel attributes', () => {
    const xml = generateMinimalAiXml(baseQuestion);
    expect(xml).toContain('area="matematicas"');
    expect(xml).toContain('nivel="Medio"');
  });

  it('marks only the correct option with correcta="true"', () => {
    const xml = generateMinimalAiXml(baseQuestion);
    const trueMatches = (xml.match(/correcta="true"/g) ?? []).length;
    const falseMatches = (xml.match(/correcta="false"/g) ?? []).length;
    expect(trueMatches).toBe(1);
    expect(falseMatches).toBe(3);
    // The correct option text appears with correcta="true"
    expect(xml).toContain('<opcion correcta="true">11</opcion>');
  });

  it('includes all 4 option texts', () => {
    const xml = generateMinimalAiXml(baseQuestion);
    for (const opt of baseQuestion.options!) {
      expect(xml).toContain(opt);
    }
  });

  it('includes enunciado, justificacion, competencia, componente elements', () => {
    const xml = generateMinimalAiXml(baseQuestion);
    expect(xml).toContain('<enunciado>');
    expect(xml).toContain('</enunciado>');
    expect(xml).toContain('<justificacion>');
    expect(xml).toContain('</justificacion>');
    expect(xml).toContain('<competencia>Razonamiento</competencia>');
    expect(xml).toContain('<componente>Álgebra</componente>');
  });

  it('includes empty afirmacion and evidencia tags', () => {
    const xml = generateMinimalAiXml(baseQuestion);
    expect(xml).toContain('<afirmacion></afirmacion>');
    expect(xml).toContain('<evidencia></evidencia>');
  });

  it('is deterministic — same input produces same output', () => {
    const xml1 = generateMinimalAiXml(baseQuestion);
    const xml2 = generateMinimalAiXml(baseQuestion);
    expect(xml1).toBe(xml2);
  });

  it('escapes XML special characters in text', () => {
    const q: MinimalQuestionFields = {
      ...baseQuestion,
      text: 'Si x < 3 & y > 2, ¿qué sucede con "f(x)"?',
      explanation: 'x < 3 & y > 2',
    };
    const xml = generateMinimalAiXml(q);
    expect(xml).not.toContain('<3');
    expect(xml).not.toContain('&y');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&gt;');
  });

  it('handles missing optional fields gracefully', () => {
    const xml = generateMinimalAiXml({});
    expect(xml.trim().startsWith('<item')).toBe(true);
    expect(xml.trim().endsWith('</item>')).toBe(true);
    // No options → no <opcion correcta> elements
    expect(xml).not.toContain('correcta=');
  });

  it('handles undefined correctAnswerIndex', () => {
    const q: MinimalQuestionFields = {
      ...baseQuestion,
      correctAnswerIndex: undefined,
    };
    const xml = generateMinimalAiXml(q);
    // All options should be marked false when index is undefined
    const trueMatches = (xml.match(/correcta="true"/g) ?? []).length;
    expect(trueMatches).toBe(0);
  });
});
