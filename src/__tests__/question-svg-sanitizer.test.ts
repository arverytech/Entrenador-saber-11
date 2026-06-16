import { sanitizeQuestionSvgFields } from '@/lib/question-svg-sanitizer';

describe('sanitizeQuestionSvgFields', () => {
  it('extracts first complete svg from text and moves it to svgData when svgData is missing', () => {
    const input = {
      text: 'Contexto inicial <svg viewBox="0 0 400 300"><rect width="10" height="10"/></svg> ¿Cuál opción es correcta?',
      options: ['A', 'B', 'C', 'D'],
    };

    const result = sanitizeQuestionSvgFields(input);

    expect(result.text).toBe('Contexto inicial ¿Cuál opción es correcta?');
    expect(result.svgData).toContain('viewBox="0 0 400 300"');
    expect(result.svgData).toContain('<rect');
  });

  it('keeps existing svgData and still strips svg from text', () => {
    const result = sanitizeQuestionSvgFields({
      text: 'Enunciado <svg viewBox="0 0 1 1"></svg> final',
      svgData: '<svg viewBox="0 0 2 2"></svg>',
    });

    expect(result.text).toBe('Enunciado final');
    expect(result.svgData).toContain('viewBox=');
    expect(result.svgData).toContain('<svg');
  });

  it('normalizes whitespace after stripping svg', () => {
    const result = sanitizeQuestionSvgFields({
      text: '  Línea 1 \n\n<svg viewBox="0 0 1 1"></svg>\t Línea   2  ',
    });

    expect(result.text).toBe('Línea 1 Línea 2');
  });

  it('does not modify text when svg block is incomplete', () => {
    const originalText = 'Texto con svg incompleto <svg viewBox="0 0 10 10">';
    const result = sanitizeQuestionSvgFields({ text: originalText });

    expect(result.text).toBe('Texto con svg incompleto <svg viewBox="0 0 10 10">');
    expect(result.svgData).toBeUndefined();
  });

  it('handles nested svg tags and extracts the full outer block', () => {
    const result = sanitizeQuestionSvgFields({
      text: 'Inicio <svg viewBox="0 0 400 300"><g><svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg></g></svg> Fin',
    });

    expect(result.text).toBe('Inicio Fin');
    expect(result.svgData).toContain('<g><svg');
    expect(result.svgData).toContain('</svg></g></svg>');
  });

  it('repairs svg missing viewBox and tiny dimensions', () => {
    const result = sanitizeQuestionSvgFields({
      text: 'Contexto',
      svgData: '<svg width="20" height="30"><rect x="10" y="10" width="5" height="5"/></svg>',
    });

    expect(result.svgData).toContain('viewBox="0 0 400 300"');
    expect(result.svgData).toContain('width="400"');
    expect(result.svgData).toContain('height="300"');
  });

  it('omits broken svgData when svg is incomplete', () => {
    const result = sanitizeQuestionSvgFields({
      text: 'Enunciado',
      svgData: '<svg viewBox="0 0 400 300"><rect x="10" y="10"',
    });

    expect(result.text).toBe('Enunciado');
    expect(result.svgData).toBeUndefined();
  });
});
