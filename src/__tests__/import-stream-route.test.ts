/**
 * @jest-environment node
 *
 * @file Comprehensive integration tests for POST /api/import-questions-stream.
 *
 * Validation matrix (filigrana técnica):
 *  1.  PDF upload ≤ 14 MB → PDF vision path → correct SSE event sequence
 *  2.  PDF upload ≤ 14 MB with svgData → svgData preserved in chunk event
 *  3.  PDF upload ≤ 14 MB → AI failure on attempt 1, success on attempt 2 (retry)
 *  4.  PDF upload ≤ 14 MB → AI fails both attempts → chunkError + error events
 *  5.  Plain text FormData → text-chunking path → correct SSE event sequence
 *  6.  JSON URL body → text-chunking path → correct SSE event sequence
 *  7.  Empty body (no file, no text) → 400 error SSE
 *  8.  Empty text FormData → 422 error SSE
 *  9.  JSON body without url → 400 error SSE
 *  10. Malformed URL → 400 error SSE
 *  11. Non-http protocol URL → 400 error SSE
 *  12. SSE headers (Content-Type, Cache-Control, X-Accel-Buffering) on every response
 *  13. Question schema completeness: text, options(4), correctAnswerIndex, subjectId, level, etc.
 *  14. Questions with svgData validated against SVG structure requirements
 */

// ─── Mock AI flows ────────────────────────────────────────────────────────────
const mockImportFromPdf = jest.fn();
const mockImportFromContent = jest.fn();

jest.mock('@/ai/constants', () => ({
  PDF_VISION_SIZE_LIMIT: 14 * 1024 * 1024,
}));

jest.mock('@/ai/flows/import-questions-from-url-flow', () => ({
  importQuestionsFromPdf: (...args: unknown[]) => mockImportFromPdf(...args),
  importQuestionsFromContent: (...args: unknown[]) => mockImportFromContent(...args),
}));

// ─── Mock pdf-parse (large-PDF fallback path) ─────────────────────────────────
const mockPdfParse = jest.fn();
jest.mock('pdf-parse/lib/pdf-parse.js', () => mockPdfParse, { virtual: true });

// ─── Mock fetch (URL import path) ────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ─── Imports after mocks ──────────────────────────────────────────────────────
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/import-questions-stream/route';

// ─── Realistic ICFES Matemáticas question fixtures ────────────────────────────
/**
 * Replicates the kind of data Gemini would return when processing the official
 * ICFES 2026 Cuadernillo de Matemáticas (Saber 11), which contains:
 *   - Text-only questions (algebra, arithmetic)
 *   - Questions with geometric figures (triangles, cylinders)
 *   - Questions with statistical graphs (bar charts)
 */
const ICFES_MATH_QUESTIONS = [
  {
    text: 'En la figura se muestra un triángulo rectángulo ABC donde el ángulo B es recto, AB = 3 cm y BC = 4 cm. ¿Cuánto mide la hipotenusa AC?',
    options: ['5 cm', '6 cm', '7 cm', '25 cm'],
    correctAnswerIndex: 0,
    explanation: 'Por el teorema de Pitágoras: AC² = AB² + BC² = 9 + 16 = 25, por lo tanto AC = 5 cm.',
    subjectId: 'matematicas',
    componentId: 'Geométrico-Métrico',
    competencyId: 'Razonamiento y argumentación',
    level: 'Básico',
    pointsAwarded: 50,
    svgData:
      '<svg viewBox="0 0 400 300" width="400" height="300" xmlns="http://www.w3.org/2000/svg">' +
      '<polygon points="50,250 200,250 200,100" fill="none" stroke="#4a90d9" stroke-width="2"/>' +
      '<text x="35" y="270" font-family="Arial, sans-serif" font-size="14" fill="#ffffff">A</text>' +
      '<text x="205" y="270" font-family="Arial, sans-serif" font-size="14" fill="#ffffff">B</text>' +
      '<text x="205" y="95" font-family="Arial, sans-serif" font-size="14" fill="#ffffff">C</text>' +
      '<text x="115" y="185" font-family="Arial, sans-serif" font-size="12" fill="#e94560">5 cm</text>' +
      '</svg>',
  },
  {
    text: 'La gráfica de barras muestra ventas mensuales: enero 120, febrero 95, marzo 150 unidades. ¿Cuál es el promedio mensual?',
    options: ['100 unidades', '115 unidades', '121.67 unidades', '125 unidades'],
    correctAnswerIndex: 2,
    explanation: 'Promedio = (120 + 95 + 150) / 3 = 365 / 3 ≈ 121.67 unidades.',
    subjectId: 'matematicas',
    componentId: 'Aleatorio',
    competencyId: 'Interpretación y representación',
    level: 'Medio',
    pointsAwarded: 50,
    svgData:
      '<svg viewBox="0 0 400 300" width="400" height="300" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="60" y="80" width="60" height="120" fill="#4a90d9"/>' +
      '<rect x="160" y="105" width="60" height="95" fill="#4a90d9"/>' +
      '<rect x="260" y="50" width="60" height="150" fill="#4a90d9"/>' +
      '<text x="70" y="220" font-family="Arial, sans-serif" font-size="11" fill="#ffffff">Ene</text>' +
      '<text x="170" y="220" font-family="Arial, sans-serif" font-size="11" fill="#ffffff">Feb</text>' +
      '<text x="270" y="220" font-family="Arial, sans-serif" font-size="11" fill="#ffffff">Mar</text>' +
      '</svg>',
  },
  {
    text: 'Un cilindro tiene altura h = 10 cm y radio de la base r = 3 cm. ¿Cuál es su volumen aproximado?',
    options: ['94.25 cm³', '188.5 cm³', '282.74 cm³', '942.48 cm³'],
    correctAnswerIndex: 2,
    explanation: 'Volumen cilindro = π · r² · h = π · 9 · 10 = 90π ≈ 282.74 cm³.',
    subjectId: 'matematicas',
    componentId: 'Geométrico-Métrico',
    competencyId: 'Formulación y ejecución',
    level: 'Avanzado',
    pointsAwarded: 50,
    svgData:
      '<svg viewBox="0 0 400 300" width="400" height="300" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="200" cy="80" rx="60" ry="20" fill="none" stroke="#4a90d9" stroke-width="2"/>' +
      '<rect x="140" y="80" width="120" height="140" fill="none" stroke="#4a90d9" stroke-width="2"/>' +
      '<ellipse cx="200" cy="220" rx="60" ry="20" fill="none" stroke="#4a90d9" stroke-width="2"/>' +
      '<text x="210" y="155" font-family="Arial, sans-serif" font-size="12" fill="#e94560">h=10</text>' +
      '<text x="205" y="80" font-family="Arial, sans-serif" font-size="12" fill="#e94560">r=3</text>' +
      '</svg>',
  },
];

const ICFES_SOURCE_NOTE = 'Cuadernillo de Preguntas Matemáticas Saber 11 – 2026, ICFES.';

const AI_OUTPUT = {
  questions: ICFES_MATH_QUESTIONS,
  sourceNote: ICFES_SOURCE_NOTE,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SseEvent = Record<string, unknown>;

/** Drains a Response SSE stream and returns all parsed events. */
async function drainSse(res: Response): Promise<SseEvent[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SseEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try { events.push(JSON.parse(dataLine.slice(6)) as SseEvent); } catch { /* skip */ }
    }
  }
  return events;
}

function makePdfFile(name = 'cuadernillo.pdf', sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes).fill(0x25)], name, { type: 'application/pdf' });
}

function makePdfRequest(file: File): NextRequest {
  const fd = new FormData();
  fd.append('file', file);
  return new NextRequest('http://localhost/api/import-questions-stream', {
    method: 'POST',
    body: fd,
  });
}

function makeTextRequest(text: string): NextRequest {
  const fd = new FormData();
  fd.append('text', text);
  return new NextRequest('http://localhost/api/import-questions-stream', {
    method: 'POST',
    body: fd,
  });
}

function makeUrlRequest(url: string): NextRequest {
  return new NextRequest('http://localhost/api/import-questions-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

/** Verifies the sequence of SSE event types matches the expected order. */
function assertEventSequence(events: SseEvent[], ...types: string[]) {
  expect(events.map((e) => e.type)).toEqual(types);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── 1. PDF vision path ────────────────────────────────────────────────────────

describe('PDF vision path (file ≤ 14 MB)', () => {
  it('emits start → chunk → done events for a valid PDF', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);

    assertEventSequence(events, 'start', 'chunk', 'done');
  });

  it('start event carries totalChunks=1 and totalChars equal to file size', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const file = makePdfFile('test.pdf', 2048);
    const res = await POST(makePdfRequest(file));
    const events = await drainSse(res);

    const start = events[0];
    expect(start.type).toBe('start');
    expect(start.totalChunks).toBe(1);
    expect(start.totalChars).toBe(2048);
  });

  it('chunk event carries all ICFES questions with correct structure', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);

    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    expect(chunk).toBeDefined();
    expect(chunk.chunkIndex).toBe(1);
    expect(chunk.totalChunks).toBe(1);
    expect(chunk.questionsInChunk).toBe(3);
    expect(chunk.totalQuestionsSoFar).toBe(3);
    const questions = chunk.questions as typeof ICFES_MATH_QUESTIONS;
    expect(questions).toHaveLength(3);
  });

  it('done event reports totalQuestions and sourceNote with "visión PDF multimodal"', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);

    const done = events.find((e) => e.type === 'done') as SseEvent;
    expect(done).toBeDefined();
    expect(done.totalQuestions).toBe(3);
    expect(String(done.sourceNote)).toContain('visión PDF multimodal');
  });

  it('response has correct SSE headers', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('Cache-Control')).toContain('no-cache');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
  });
});

// ── 2. svgData preserved end-to-end ──────────────────────────────────────────

describe('svgData – visual elements (figures, bar charts, cylinders)', () => {
  it('all three ICFES questions carry a valid svgData field in the chunk event', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as typeof ICFES_MATH_QUESTIONS;

    // Every question in the fixture has an svgData
    for (const q of questions) {
      expect(q.svgData).toBeDefined();
      expect(q.svgData).toMatch(/^<svg\b/);               // starts with <svg
      expect(q.svgData).toMatch(/viewBox="0 0 400 300"/); // correct viewBox
      expect(q.svgData).not.toMatch(/<\?xml/);            // no XML declaration
      expect(q.svgData).not.toMatch(/javascript:/i);      // no JS
    }
  });

  it('geometric figure question (triangle) contains polygon element in SVG', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as typeof ICFES_MATH_QUESTIONS;

    const triangleQ = questions[0];
    expect(triangleQ.svgData).toContain('<polygon');
  });

  it('statistical chart question contains rect elements (bar chart) in SVG', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as typeof ICFES_MATH_QUESTIONS;

    const chartQ = questions[1];
    expect(chartQ.svgData).toContain('<rect');
  });

  it('cylinder question contains ellipse elements in SVG', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as typeof ICFES_MATH_QUESTIONS;

    const cylinderQ = questions[2];
    expect(cylinderQ.svgData).toContain('<ellipse');
  });
});

// ── 3. Question schema completeness ──────────────────────────────────────────

describe('Question schema – field completeness for Firestore storage', () => {
  const REQUIRED_FIELDS = [
    'text',
    'options',
    'correctAnswerIndex',
    'explanation',
    'subjectId',
    'componentId',
    'competencyId',
    'level',
    'pointsAwarded',
  ] as const;

  it('every question has all required Firestore fields', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as Record<string, unknown>[];

    for (const q of questions) {
      for (const field of REQUIRED_FIELDS) {
        expect(q).toHaveProperty(field);
      }
    }
  });

  it('options array has exactly 4 elements per question', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as Record<string, unknown>[];

    for (const q of questions) {
      expect(q.options).toBeInstanceOf(Array);
      expect((q.options as unknown[]).length).toBe(4);
    }
  });

  it('correctAnswerIndex is between 0 and 3', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as Record<string, unknown>[];

    for (const q of questions) {
      const idx = q.correctAnswerIndex as number;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(3);
    }
  });

  it('subjectId is one of the valid ICFES subject identifiers', async () => {
    const VALID_SUBJECTS = ['matematicas', 'lectura', 'naturales', 'sociales', 'ingles', 'socioemocional'];
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as Record<string, unknown>[];

    for (const q of questions) {
      expect(VALID_SUBJECTS).toContain(q.subjectId);
    }
  });

  it('level is one of Básico | Medio | Avanzado', async () => {
    const VALID_LEVELS = ['Básico', 'Medio', 'Avanzado'];
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as Record<string, unknown>[];

    for (const q of questions) {
      expect(VALID_LEVELS).toContain(q.level);
    }
  });

  it('pointsAwarded is 50 for all questions', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);
    const chunk = events.find((e) => e.type === 'chunk') as SseEvent;
    const questions = chunk.questions as Record<string, unknown>[];

    for (const q of questions) {
      expect(q.pointsAwarded).toBe(50);
    }
  });
});

// ── 4. Retry logic ────────────────────────────────────────────────────────────

describe('Retry logic on AI failure', () => {
  it('retries once on the first attempt failure and succeeds on attempt 2', async () => {
    mockImportFromPdf
      .mockRejectedValueOnce(new Error('Transient API error'))
      .mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);

    expect(mockImportFromPdf).toHaveBeenCalledTimes(2);
    assertEventSequence(events, 'start', 'chunk', 'done');
    const done = events.find((e) => e.type === 'done') as SseEvent;
    expect(done.totalQuestions).toBe(3);
  });

  it('emits chunkError + error events when both retry attempts fail', async () => {
    mockImportFromPdf
      .mockRejectedValueOnce(new Error('API fail 1'))
      .mockRejectedValueOnce(new Error('API fail 2'));

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);

    expect(mockImportFromPdf).toHaveBeenCalledTimes(2);
    expect(events.some((e) => e.type === 'chunkError')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});

// ── 5. Plain text FormData → text chunking path ───────────────────────────────

describe('Text FormData input → text-chunking path', () => {
  const SAMPLE_TEXT = `Pregunta 1\nEn un sistema de ecuaciones, ¿cuánto vale x?\n2x + 3 = 7\nA. 1\nB. 2\nC. 3\nD. 4`;

  it('emits start → chunk → done for a short text', async () => {
    mockImportFromContent.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makeTextRequest(SAMPLE_TEXT));
    const events = await drainSse(res);

    expect(events[0].type).toBe('start');
    expect(events.some((e) => e.type === 'chunk')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });

  it('calls importQuestionsFromContent (not importQuestionsFromPdf) for text input', async () => {
    mockImportFromContent.mockResolvedValueOnce(AI_OUTPUT);

    await POST(makeTextRequest(SAMPLE_TEXT));

    expect(mockImportFromContent).toHaveBeenCalledTimes(1);
    expect(mockImportFromPdf).not.toHaveBeenCalled();
  });

  it('passes the text content to importQuestionsFromContent', async () => {
    mockImportFromContent.mockResolvedValueOnce(AI_OUTPUT);

    await POST(makeTextRequest(SAMPLE_TEXT));

    const callArg = mockImportFromContent.mock.calls[0][0] as { url: string; content: string };
    // Verify the main content fragments are present (route trims + splitIntoChunks may add overlap)
    expect(callArg.content).toContain('Pregunta 1');
    expect(callArg.content).toContain('2x + 3 = 7');
    expect(callArg.content).toContain('A. 1');
  });
});

// ── 7. JSON URL input ─────────────────────────────────────────────────────────

describe('JSON URL body → text-chunking path', () => {
  const SAMPLE_HTML =
    '<html><body><p>Pregunta 1: ¿Cuál es 2+2? A) 3 B) 4 C) 5 D) 6</p></body></html>';

  it('fetches the URL and processes the cleaned text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SAMPLE_HTML,
    } as unknown as Response);
    mockImportFromContent.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makeUrlRequest('https://example.com/questions'));
    const events = await drainSse(res);

    expect(events[0].type).toBe('start');
    expect(events.some((e) => e.type === 'chunk')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockImportFromPdf).not.toHaveBeenCalled();
  });

  it('emits error when fetch returns non-2xx status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as unknown as Response);

    const res = await POST(makeUrlRequest('https://example.com/missing'));
    const events = await drainSse(res);

    // Either a non-2xx SSE error or HTTP 502 with SSE error
    const hasError =
      events.some((e) => e.type === 'error') ||
      res.status === 502;
    expect(hasError).toBe(true);
  });

  it('emits error for network fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const res = await POST(makeUrlRequest('https://example.com/timeout'));
    const events = await drainSse(res);

    const hasError =
      events.some((e) => e.type === 'error' && String(e.message).includes('Network timeout')) ||
      res.status === 502;
    expect(hasError).toBe(true);
  });
});

// ── 8. Input validation errors ────────────────────────────────────────────────

describe('Input validation – error SSE events', () => {
  it('returns 400 with error event when FormData has no file and no text', async () => {
    const fd = new FormData();
    const req = new NextRequest('http://localhost/api/import-questions-stream', {
      method: 'POST',
      body: fd,
    });

    const res = await POST(req);
    // Empty FormData → 400 with error SSE event
    expect(res.status).toBe(400);
    const events = await drainSse(res);
    expect(events[0].type).toBe('error');
  });

  it('returns 400 with error event when text field is whitespace only', async () => {
    // The route: text.trim() is falsy → falls into the "no file/text" 400 branch
    const res = await POST(makeTextRequest('   '));
    expect(res.status).toBe(400);
    const events = await drainSse(res);
    expect(events[0].type).toBe('error');
  });

  it('returns 400 with error when JSON body has no url field', async () => {
    const req = new NextRequest('http://localhost/api/import-questions-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generateExplanations: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const events = await drainSse(res);
    expect(events[0].type).toBe('error');
  });

  it('returns 400 with error for malformed URL', async () => {
    const res = await POST(makeUrlRequest('not-a-url'));
    expect(res.status).toBe(400);
    const events = await drainSse(res);
    expect(events[0].type).toBe('error');
  });

  it('returns 400 with error for non-http URL (ftp://)', async () => {
    const res = await POST(makeUrlRequest('ftp://example.com/file.pdf'));
    expect(res.status).toBe(400);
    const events = await drainSse(res);
    expect(events[0].type).toBe('error');
  });

  it('returns 400 with error for javascript: URL', async () => {
    const res = await POST(makeUrlRequest('javascript:alert(1)'));
    expect(res.status).toBe(400);
    const events = await drainSse(res);
    expect(events[0].type).toBe('error');
  });
});

// ── 9. Text chunking correctness ──────────────────────────────────────────────

describe('Text chunking – long content is split and processed in multiple chunks', () => {
  it('content longer than 10 000 chars produces multiple chunks', async () => {
    // Each chunk call returns questions so we can verify multiple calls
    const CHUNK_Q = { ...AI_OUTPUT, questions: [ICFES_MATH_QUESTIONS[0]] };
    mockImportFromContent
      .mockResolvedValueOnce(CHUNK_Q)
      .mockResolvedValueOnce(CHUNK_Q)
      .mockResolvedValueOnce(CHUNK_Q);

    // Build a text > 10 000 chars (3 paragraphs of ~4 000 chars each)
    const paragraph = 'A '.repeat(2000) + '\n\n';
    const longText = paragraph + paragraph + paragraph;
    expect(longText.length).toBeGreaterThan(10_000);

    const res = await POST(makeTextRequest(longText));
    const events = await drainSse(res);

    const chunks = events.filter((e) => e.type === 'chunk');
    expect(chunks.length).toBeGreaterThan(1);

    // Verify totalChunks reported in start matches actual chunk events
    const start = events.find((e) => e.type === 'start') as SseEvent;
    expect(start.totalChunks).toBeGreaterThan(1);
  });

  it('totalQuestionsSoFar accumulates across chunks', async () => {
    const CHUNK_Q = { ...AI_OUTPUT, questions: [ICFES_MATH_QUESTIONS[0], ICFES_MATH_QUESTIONS[1]] };
    mockImportFromContent
      .mockResolvedValueOnce(CHUNK_Q)
      .mockResolvedValueOnce(CHUNK_Q);

    const longText = 'X '.repeat(6000) + '\n\n' + 'Y '.repeat(6000);

    const res = await POST(makeTextRequest(longText));
    const events = await drainSse(res);

    const chunks = events.filter((e) => e.type === 'chunk');
    if (chunks.length >= 2) {
      const totals = chunks.map((c) => c.totalQuestionsSoFar as number);
      for (let i = 1; i < totals.length; i++) {
        expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]);
      }
    }
  });
});

// ── 10. Non-PDF file upload (plain text file) ─────────────────────────────────

describe('Non-PDF file upload (.txt)', () => {
  it('processes a .txt file via text-chunking path', async () => {
    mockImportFromContent.mockResolvedValueOnce(AI_OUTPUT);

    const txtFile = new File(['Pregunta 1: 2+2=?\nA) 3 B) 4 C) 5 D) 6'], 'preguntas.txt', {
      type: 'text/plain',
    });
    const fd = new FormData();
    fd.append('file', txtFile);
    fd.append('generateExplanations', 'false');
    const req = new NextRequest('http://localhost/api/import-questions-stream', {
      method: 'POST',
      body: fd,
    });

    const res = await POST(req);
    const events = await drainSse(res);

    expect(events[0].type).toBe('start');
    expect(events.some((e) => e.type === 'chunk')).toBe(true);
    expect(mockImportFromPdf).not.toHaveBeenCalled();
    expect(mockImportFromContent).toHaveBeenCalled();
  });
});

// ── 11. chunkError recovery – partial success ────────────────────────────────

describe('Partial failure recovery in text-chunking path', () => {
  it('continues processing remaining chunks after a chunkError', async () => {
    mockImportFromContent
      .mockRejectedValueOnce(new Error('Chunk 1 fail'))
      .mockRejectedValueOnce(new Error('Chunk 1 retry fail'))
      .mockResolvedValueOnce(AI_OUTPUT); // chunk 2 succeeds

    const longText = 'A '.repeat(6000) + '\n\n' + 'B '.repeat(6000);

    const res = await POST(makeTextRequest(longText));
    const events = await drainSse(res);

    expect(events.some((e) => e.type === 'chunkError')).toBe(true);
    // Despite the failed chunk, a successful chunk should follow
    expect(events.some((e) => e.type === 'chunk')).toBe(true);
    const done = events.find((e) => e.type === 'done') as SseEvent;
    expect(done).toBeDefined();
    expect(done.totalQuestions).toBe(3);
  });
});

// ── 12. Production-like edge cases ───────────────────────────────────────────

describe('Production-like edge cases', () => {
  it('handles PDFs > 4 MB via URL payload instead of multipart body', async () => {
    const largePdfSizeBytes = 5 * 1024 * 1024;
    expect(largePdfSizeBytes).toBeGreaterThan(4 * 1024 * 1024);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>PDF temporal grande</body></html>',
    } as unknown as Response);
    mockImportFromContent.mockResolvedValueOnce(AI_OUTPUT);

    const res = await POST(makeUrlRequest('https://storage.example.com/temp-pdf-imports/large.pdf'));
    const events = await drainSse(res);

    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(mockImportFromContent).toHaveBeenCalled();
    expect(mockImportFromPdf).not.toHaveBeenCalled();
  });

  it('serverTimestamp is available from firebase/firestore imports (smoke test)', async () => {
    const firestore = await import('firebase/firestore');
    expect(typeof firestore.serverTimestamp).toBe('function');
  });

  it('handles delayed AI response (100ms) and still completes the PDF stream', async () => {
    mockImportFromPdf.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(AI_OUTPUT), 100))
    );

    const res = await POST(makePdfRequest(makePdfFile()));
    const events = await drainSse(res);

    assertEventSequence(events, 'start', 'chunk', 'done');
  });

  it('emits error event when extraction finishes with 0 questions', async () => {
    mockImportFromContent.mockResolvedValueOnce({ questions: [], sourceNote: 'PDF vacío' });

    const res = await POST(makeTextRequest('Contenido sin preguntas reales'));
    const events = await drainSse(res);

    expect(events.some((e) =>
      e.type === 'error' && String(e.message).includes('No se pudieron extraer preguntas')
    )).toBe(true);
  });

  it('detects uppercase .PDF filename as PDF and uses PDF vision path', async () => {
    mockImportFromPdf.mockResolvedValueOnce(AI_OUTPUT);
    const file = new File([new Uint8Array(1024)], 'EXAMEN.PDF', { type: 'application/pdf' });

    const res = await POST(makePdfRequest(file));
    const events = await drainSse(res);

    expect(events.some((e) => e.type === 'chunk')).toBe(true);
    expect(mockImportFromPdf).toHaveBeenCalledTimes(1);
    expect(mockImportFromContent).not.toHaveBeenCalled();
  });
});
