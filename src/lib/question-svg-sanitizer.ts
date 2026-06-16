type QuestionVisualFields = {
  text?: unknown;
  svgData?: unknown;
};

type SanitizedQuestionVisualFields = {
  text?: string;
  svgData?: string;
};

const DEFAULT_VIEWBOX = '0 0 400 300';
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;
const MIN_VIEWBOX_SIZE = 120;

function normalizeTextWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureSvgAttribute(svg: string, attr: string, value: string): string {
  const attrRegex = new RegExp(`\\b${attr}\\s*=\\s*"[^"]*"`, 'i');
  if (attrRegex.test(svg)) {
    return svg.replace(attrRegex, `${attr}="${value}"`);
  }
  return svg.replace(/<svg\b/i, `<svg ${attr}="${value}"`);
}

function getViewBox(svg: string): { x: number; y: number; width: number; height: number } | null {
  const match = svg.match(/\bviewBox\s*=\s*"([^"]+)"/i);
  if (!match) return null;
  const parts = match[1].trim().split(/[\s,]+/).map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function inferMaxCoordinates(svg: string): { maxX: number; maxY: number } {
  const max = { maxX: 0, maxY: 0 };
  const attrRegex = /\b(x|cx|x1|x2|width|rx)\s*=\s*"(-?\d+(?:\.\d+)?)"|\b(y|cy|y1|y2|height|ry)\s*=\s*"(-?\d+(?:\.\d+)?)"/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(svg)) !== null) {
    if (match[1] && match[2]) {
      max.maxX = Math.max(max.maxX, Number(match[2]));
    }
    if (match[3] && match[4]) {
      max.maxY = Math.max(max.maxY, Number(match[4]));
    }
  }
  return max;
}

function sanitizeSvgData(svgData: string): string | undefined {
  let svg = svgData
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .trim();

  const svgStart = svg.toLowerCase().indexOf('<svg');
  if (svgStart > 0) svg = svg.slice(svgStart).trim();
  if (!svg.toLowerCase().startsWith('<svg') || !/<\/svg>\s*$/i.test(svg)) return undefined;

  const widthMatch = svg.match(/\bwidth\s*=\s*"([^"]+)"/i);
  const heightMatch = svg.match(/\bheight\s*=\s*"([^"]+)"/i);
  const width = toNumber(widthMatch?.[1]?.replace(/[^\d.-]/g, ''));
  const height = toNumber(heightMatch?.[1]?.replace(/[^\d.-]/g, ''));

  let viewBox = getViewBox(svg);
  if (!viewBox || viewBox.width < MIN_VIEWBOX_SIZE || viewBox.height < MIN_VIEWBOX_SIZE) {
    svg = ensureSvgAttribute(svg, 'viewBox', DEFAULT_VIEWBOX);
    viewBox = { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }

  const inferred = inferMaxCoordinates(svg);
  const overflowX = inferred.maxX > viewBox.width - 5;
  const overflowY = inferred.maxY > viewBox.height - 5;
  if (overflowX || overflowY) {
    const repairedWidth = Math.max(DEFAULT_WIDTH, Math.ceil(inferred.maxX + 20));
    const repairedHeight = Math.max(DEFAULT_HEIGHT, Math.ceil(inferred.maxY + 20));
    svg = ensureSvgAttribute(svg, 'viewBox', `0 0 ${repairedWidth} ${repairedHeight}`);
    viewBox = { x: 0, y: 0, width: repairedWidth, height: repairedHeight };
  }

  const repairedWidth = width && width >= MIN_VIEWBOX_SIZE ? Math.round(width) : Math.round(viewBox.width);
  const repairedHeight = height && height >= MIN_VIEWBOX_SIZE ? Math.round(height) : Math.round(viewBox.height);
  svg = ensureSvgAttribute(svg, 'width', String(repairedWidth));
  svg = ensureSvgAttribute(svg, 'height', String(repairedHeight));

  return svg.trim();
}

function extractFirstCompleteSvgBlock(text: string): { svgBlock?: string; textWithoutSvg: string } {
  const firstSvgIndex = text.toLowerCase().indexOf('<svg');
  if (firstSvgIndex === -1) {
    return { textWithoutSvg: normalizeTextWhitespace(text) };
  }

  let depth = 0;
  let start = -1;
  let end = -1;
  // Note: tag matching assumes well-formed SVG tags where '>' only closes tags.
  const svgTags = text.slice(firstSvgIndex).matchAll(/<\/?svg\b[^>]*>/gi);

  for (const match of svgTags) {
    const tag = match[0];
    const tagIndex = firstSvgIndex + (match.index ?? 0);
    const isClosing = /^<\s*\/\s*svg\b/i.test(tag);
    const isSelfClosing = /\/\s*>$/.test(tag);

    if (!isClosing) {
      if (start === -1) start = tagIndex;
      depth += 1;
      if (isSelfClosing) depth -= 1;
    } else if (depth > 0) {
      depth -= 1;
    }

    if (start !== -1 && depth === 0) {
      end = tagIndex + tag.length;
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

export function sanitizeQuestionSvgFields(fields: { text: string; svgData?: unknown }): { text: string; svgData?: string };
export function sanitizeQuestionSvgFields(fields: QuestionVisualFields): SanitizedQuestionVisualFields;
export function sanitizeQuestionSvgFields(fields: QuestionVisualFields): SanitizedQuestionVisualFields {
  const originalText = typeof fields.text === 'string' ? fields.text : undefined;
  const originalSvgData = typeof fields.svgData === 'string' ? fields.svgData : undefined;

  if (originalText === undefined) {
    const sanitizedSvg = originalSvgData ? sanitizeSvgData(originalSvgData) : undefined;
    return sanitizedSvg ? { svgData: sanitizedSvg } : {};
  }

  const { svgBlock, textWithoutSvg } = extractFirstCompleteSvgBlock(originalText);
  const hasSvgData = typeof originalSvgData === 'string' && originalSvgData.trim().length > 0;
  const candidateSvg = hasSvgData ? originalSvgData : svgBlock;
  const sanitizedSvg = candidateSvg ? sanitizeSvgData(candidateSvg) : undefined;

  return {
    text: textWithoutSvg,
    ...(sanitizedSvg ? { svgData: sanitizedSvg } : {}),
  };
}
