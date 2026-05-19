type QuestionVisualFields = {
  text?: unknown;
  svgData?: unknown;
};

type SanitizedQuestionVisualFields = {
  text?: string;
  svgData?: string;
};

function normalizeTextWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractFirstCompleteSvgBlock(text: string): { svgBlock?: string; textWithoutSvg: string } {
  const firstSvgIndex = text.toLowerCase().indexOf('<svg');
  if (firstSvgIndex === -1) {
    return { textWithoutSvg: normalizeTextWhitespace(text) };
  }

  const svgTagRegex = /<\/?svg\b[^>]*>/gi;
  svgTagRegex.lastIndex = firstSvgIndex;
  let depth = 0;
  let start = -1;
  let end = -1;
  let match: RegExpExecArray | null;

  while ((match = svgTagRegex.exec(text)) !== null) {
    const tag = match[0];
    const isClosing = /^<\s*\/\s*svg\b/i.test(tag);
    const isSelfClosing = /\/\s*>$/.test(tag);

    if (!isClosing) {
      if (start === -1) start = match.index;
      depth += 1;
      if (isSelfClosing) depth -= 1;
    } else if (depth > 0) {
      depth -= 1;
    }

    if (start !== -1 && depth === 0) {
      end = svgTagRegex.lastIndex;
      break;
    }
  }

  if (start === -1 || end === -1 || end <= start) {
    return { textWithoutSvg: normalizeTextWhitespace(text) };
  }

  const svgBlock = text.slice(start, end).trim();
  const textWithoutSvg = normalizeTextWhitespace(`${text.slice(0, start)} ${text.slice(end)}`);
  return { svgBlock, textWithoutSvg };
}

export function sanitizeQuestionSvgFields(fields: QuestionVisualFields): SanitizedQuestionVisualFields {
  const originalText = typeof fields.text === 'string' ? fields.text : undefined;
  const originalSvgData = typeof fields.svgData === 'string' ? fields.svgData : undefined;

  if (originalText === undefined) {
    return originalSvgData ? { svgData: originalSvgData } : {};
  }

  const { svgBlock, textWithoutSvg } = extractFirstCompleteSvgBlock(originalText);
  const hasSvgData = typeof originalSvgData === 'string' && originalSvgData.trim().length > 0;

  return {
    text: textWithoutSvg,
    ...(hasSvgData
      ? { svgData: originalSvgData }
      : svgBlock
        ? { svgData: svgBlock }
        : {}),
  };
}
