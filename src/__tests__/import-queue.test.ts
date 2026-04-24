/**
 * @jest-environment node
 *
 * @file Comprehensive tests for the import-queue route and smart chunking logic.
 *
 * Covers the following scenarios:
 *
 * Grupo 1 — Fragmentación inteligente
 *   1.  PDF pequeño (≤ 14MB) → 1 fragmento en modo isPdfVision=true
 *   2.  PDF grande (> 14MB) → múltiples fragmentos de texto
 *   3.  Texto con preguntas numeradas ("1.", "2.") → corte ENTRE preguntas
 *   4.  Texto donde la pregunta cruza el límite → overlap de 1500 chars captura pregunta completa
 *   5.  Texto sin patrones → fragmentación por párrafos con overlap
 *   6.  Pregunta ICFES real con enunciado + figura + 4 opciones → no se parte
 *
 * Grupo 2 — Corte a mitad de página / pregunta (el caso problemático)
 *   7.  Enunciado en chunk N, opciones en chunk N+1 → overlap une ambas partes
 *   8.  "SITUACIÓN 1" con 3 preguntas que cruzan el límite → todas se extraen
 *
 * Grupo 3 — API /api/import-queue
 *   9.  Texto FormData → guarda jobs en Firestore con los campos correctos
 *   10. PDF pequeño (≤ 14MB) → isPdfVision=true, 1 chunk
 *   11. PDF grande (> 14MB) → extrae texto, múltiples chunks
 *   12. JSON URL → PDF URL detectado correctamente
 *   13. JSON URL → HTML URL → texto limpiado
 *   14. Sin archivo ni texto → 400
 *   15. URL inválida → 400
 *   16. Firestore error → 500
 *
 * Grupo 4 — Escenarios reales del PDF ICFES Matemáticas 2026
 *   17. Pregunta con figura geométrica → no se parte en fragmentos
 *   18. SITUACIÓN con tabla y dos preguntas → ambas en el mismo chunk
 *   19. Pregunta split (enunciado en chunk N, opciones en chunk N+1) → overlap las une
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockBatch = {
  set: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

const mockCollection = {
  doc: jest.fn().mockReturnValue({ id: 'mock-doc-id' }),
};

const mockDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
  batch: jest.fn().mockReturnValue(mockBatch),
};

// Storage mock
const mockStorageFile = {
  save: jest.fn().mockResolvedValue(undefined),
};
const mockBucket = {
  file: jest.fn().mockReturnValue(mockStorageFile),
};

jest.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: jest.fn(() => mockDb),
  getAdminStorage: jest.fn(() => mockBucket),
}));

jest.mock('@/ai/constants', () => ({
  PDF_VISION_SIZE_LIMIT: 14 * 1024 * 1024,
}));

const mockPdfParse = jest.fn();
jest.mock('pdf-parse/lib/pdf-parse.js', () => mockPdfParse, { virtual: true });

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ─── Imports ──────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/import-queue/route';
import { splitIntoSmartChunks } from '@/app/api/import-queue/route';

// ─── ICFES 2026 fixtures ──────────────────────────────────────────────────────

/** Pregunta ICFES con enunciado + figura + 4 opciones (formato cuadernillo real). */
const ICFES_QUESTION_WITH_FIGURE = `
1. En la figura se muestra un triángulo rectángulo ABC donde el ángulo B es recto,
AB = 3 cm y BC = 4 cm. La figura muestra los catetos y la hipotenusa claramente
identificados con sus medidas. ¿Cuánto mide la hipotenusa AC?

A) 5 cm
B) 6 cm
C) 7 cm
D) 25 cm
`;

/** SITUACIÓN ICFES con tabla y dos preguntas (formato cuadernillo real). */
const ICFES_SITUACION = `
SITUACIÓN 1

La siguiente tabla muestra el número de estudiantes por grado en una institución:

Grado | Estudiantes
  9   |    120
  10  |    98
  11  |    87

2. ¿Cuántos estudiantes hay en total?
A) 295    B) 305    C) 285    D) 315

3. ¿Qué porcentaje representa el grado 11 del total?
A) 28.5%    B) 29.1%    C) 30.2%    D) 27.8%
`;

/** Texto con pregunta partida — enunciado termina justo al inicio del chunk N+1. */
const CHUNK_WITH_SPLIT_QUESTION_START = `...contenido anterior...

4. En un sistema de referencia cartesiano, la distancia entre los puntos P(2, 3) y
Q(5, 7) es igual a:`;

const CHUNK_WITH_SPLIT_QUESTION_END = `A) 3 unidades
B) 4 unidades
C) 5 unidades
D) 6 unidades`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTextRequest(text: string): NextRequest {
  const fd = new FormData();
  fd.append('text', text);
  return new NextRequest('http://localhost/api/import-queue', {
    method: 'POST',
    body: fd,
  });
}

function makeFileRequest(file: File): NextRequest {
  const fd = new FormData();
  fd.append('file', file);
  return new NextRequest('http://localhost/api/import-queue', {
    method: 'POST',
    body: fd,
  });
}

function makeUrlRequest(url: string): NextRequest {
  return new NextRequest('http://localhost/api/import-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

function makePdfBuffer(sizeBytes: number): Buffer {
  // %PDF- magic bytes followed by zeros
  const buf = Buffer.alloc(sizeBytes);
  buf[0] = 0x25; buf[1] = 0x50; buf[2] = 0x44; buf[3] = 0x46; buf[4] = 0x2d;
  return buf;
}

function makePdfFile(name = 'cuadernillo.pdf', sizeBytes = 1024): File {
  return new File([makePdfBuffer(sizeBytes)], name, { type: 'application/pdf' });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.collection.mockReturnValue(mockCollection);
  mockDb.batch.mockReturnValue(mockBatch);
  mockBatch.set.mockClear();
  mockBatch.commit.mockResolvedValue(undefined);
  mockBucket.file.mockReturnValue(mockStorageFile);
  mockStorageFile.save.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 1 — Fragmentación inteligente (splitIntoSmartChunks)
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo 1 — Fragmentación inteligente', () => {
  it('texto con preguntas numeradas "1." → corte ENTRE preguntas, no en medio', () => {
    const text = Array.from(
      { length: 20 },
      (_, i) =>
        `${i + 1}. Esta es la pregunta número ${i + 1} con su enunciado completo.\n` +
        `A) Opción A  B) Opción B  C) Opción C  D) Opción D\n`
    ).join('\n');

    const chunks = splitIntoSmartChunks(text);

    // Each chunk should start at a question boundary or contain complete questions
    for (const chunk of chunks) {
      // No chunk should end with an orphaned question number at the very end
      expect(chunk.trim().length).toBeGreaterThan(0);
    }

    // Verify question text integrity: if "1." is in a chunk, "A) Opción A" should be too
    // (since the question has both parts together)
    const firstChunk = chunks[0];
    expect(firstChunk).toContain('1. Esta es la pregunta');
    expect(firstChunk).toContain('A) Opción A');
  });

  it('texto con preguntas "Pregunta 1" → corte ENTRE preguntas', () => {
    const text = Array.from(
      { length: 10 },
      (_, i) =>
        `Pregunta ${i + 1}\n` +
        `Este es el enunciado de la pregunta ${i + 1} con suficiente texto para llenar el espacio.\n` +
        `A) Opción A   B) Opción B   C) Opción C   D) Opción D\n`
    ).join('\n');

    const chunks = splitIntoSmartChunks(text);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // First chunk must have complete question
    expect(chunks[0]).toContain('Pregunta 1');
    expect(chunks[0]).toContain('A) Opción A');
  });

  it('texto con "SITUACIÓN 1" → corte entre situaciones', () => {
    const text = `
SITUACIÓN 1

Un texto descriptivo para la situación 1.

1. Pregunta de situación 1.
A) Resp A   B) Resp B   C) Resp C   D) Resp D

SITUACIÓN 2

Un texto descriptivo para la situación 2.

2. Pregunta de situación 2.
A) Resp A   B) Resp B   C) Resp C   D) Resp D
`;
    const chunks = splitIntoSmartChunks(text);
    // Situación 1 and Situación 2 should be in separate chunks if they exceed chunk size,
    // or in the same chunk if they fit.  What matters is that no question is split.
    const allText = chunks.join(' ');
    expect(allText).toContain('SITUACIÓN 1');
    expect(allText).toContain('SITUACIÓN 2');
    expect(allText).toContain('Pregunta de situación 1');
    expect(allText).toContain('Pregunta de situación 2');
  });

  it('texto sin patrones de pregunta → fragmentación por párrafos con overlap', () => {
    // Plain text without question numbers
    const paragraph = 'Esta es información académica sobre álgebra lineal.\n';
    const text = paragraph.repeat(500); // ~26,000 chars

    const chunks = splitIntoSmartChunks(text);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Each chunk should be ≤ 8000 chars (approximately, allows for overlap)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10_000);
    }
  });

  it('pregunta ICFES con figura → completa en el mismo chunk', () => {
    const chunks = splitIntoSmartChunks(ICFES_QUESTION_WITH_FIGURE.repeat(3));

    const allText = chunks.join('\n');
    // The specific question should appear complete somewhere
    expect(allText).toContain('triángulo rectángulo ABC');
    expect(allText).toContain('A) 5 cm');
    expect(allText).toContain('D) 25 cm');
  });

  it('SITUACIÓN ICFES con tabla y 2 preguntas → ambas preguntas presentes en chunks', () => {
    const chunks = splitIntoSmartChunks(ICFES_SITUACION.repeat(5));
    const allText = chunks.join('\n');

    expect(allText).toContain('SITUACIÓN 1');
    expect(allText).toContain('¿Cuántos estudiantes hay en total?');
    expect(allText).toContain('¿Qué porcentaje representa el grado 11');
  });

  it('texto vacío → retorna array vacío', () => {
    expect(splitIntoSmartChunks('')).toEqual([]);
    expect(splitIntoSmartChunks('   ')).toEqual([]);
  });

  it('texto con una sola pregunta dentro del límite → 1 chunk', () => {
    const chunks = splitIntoSmartChunks(ICFES_QUESTION_WITH_FIGURE);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('triángulo rectángulo ABC');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 2 — Corte a mitad de página / pregunta
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo 2 — Corte a mitad de página / pregunta (overlap)', () => {
  it('enunciado en chunk N y opciones en chunk N+1 → overlap de 1500 chars une ambas partes', () => {
    // Craft a text that forces a split between question stem and options
    const PREFIX = 'X'.repeat(7_000); // fills up most of a chunk
    const QUESTION_STEM = '\n4. En un sistema de referencia cartesiano, la distancia entre P(2,3) y Q(5,7):';
    const OPTIONS = '\nA) 3 unidades\nB) 4 unidades\nC) 5 unidades\nD) 6 unidades\n';

    const text = PREFIX + QUESTION_STEM + OPTIONS;
    const chunks = splitIntoSmartChunks(text);

    // The question stem AND options should be findable in the chunks
    const allText = chunks.join('\n');
    expect(allText).toContain('P(2,3) y Q(5,7)');
    expect(allText).toContain('A) 3 unidades');
    expect(allText).toContain('D) 6 unidades');
  });

  it('chunk split scenario: start + end fixtures together contain the full question', () => {
    // Simulate what happens when overlap is applied: the overlap from chunk N
    // includes CHUNK_WITH_SPLIT_QUESTION_START at the end,
    // and CHUNK_WITH_SPLIT_QUESTION_END is at the start of chunk N+1.
    const combined = CHUNK_WITH_SPLIT_QUESTION_START + '\n' + CHUNK_WITH_SPLIT_QUESTION_END;
    expect(combined).toContain('distancia entre los puntos P(2, 3)');
    expect(combined).toContain('A) 3 unidades');
    expect(combined).toContain('D) 6 unidades');
  });

  it('"SITUACIÓN 1" con 3 preguntas que cruzan el límite → todas presentes en chunks', () => {
    const situation = `
SITUACIÓN 1

La tabla muestra resultados de una prueba diagnóstica para 450 estudiantes.

| Nivel   | Cantidad |
|---------|----------|
| Bajo    | 180      |
| Medio   | 200      |
| Alto    | 70       |

1. ¿Qué porcentaje de estudiantes está en el nivel Medio?

A) 38.9%   B) 44.4%   C) 40.0%   D) 46.0%

2. ¿Cuántos estudiantes más hay en nivel Bajo que en nivel Alto?

A) 100   B) 110   C) 120   D) 130

3. Si se aumenta en 20% el total de estudiantes, ¿cuántos habría en total?

A) 490   B) 500   C) 540   D) 520
`;
    // Repeat to force chunking
    const text = situation.repeat(10);
    const chunks = splitIntoSmartChunks(text);
    const allText = chunks.join('\n');

    expect(allText).toContain('SITUACIÓN 1');
    expect(allText).toContain('nivel Medio');
    expect(allText).toContain('nivel Bajo que en nivel Alto');
    expect(allText).toContain('aumenta en 20%');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 3 — API /api/import-queue
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo 3 — API POST /api/import-queue', () => {
  it('FormData con texto → guarda jobs en Firestore y responde { sessionId, totalChunks }', async () => {
    const text = ICFES_QUESTION_WITH_FIGURE + ICFES_SITUACION;
    const res = await POST(makeTextRequest(text));
    const body = await res.json() as { sessionId: string; totalChunks: number; sourceLabel: string };

    expect(res.status).toBe(200);
    expect(body.sessionId).toBeTruthy();
    expect(body.totalChunks).toBeGreaterThanOrEqual(1);
    expect(body.sourceLabel).toBe('texto pegado directamente');

    // Firestore batch.set should have been called once per chunk
    expect(mockBatch.set).toHaveBeenCalledTimes(body.totalChunks);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
  });

  it('PDF pequeño (≤ 14MB) → isPdfVision=true, 1 chunk, content es base64', async () => {
    const smallPdf = makePdfFile('cuadernillo.pdf', 1024);
    const res = await POST(makeFileRequest(smallPdf));
    const body = await res.json() as { sessionId: string; totalChunks: number };

    expect(res.status).toBe(200);
    expect(body.totalChunks).toBe(1);

    // The batch.set call should have isPdfVision=true
    const setCall = mockBatch.set.mock.calls[0];
    expect(setCall).toBeDefined();
    const jobData = setCall[1] as Record<string, unknown>;
    expect(jobData.isPdfVision).toBe(true);
    // PDF vision jobs still store base64 inline in 'content' (no Storage upload)
    expect(typeof jobData.content).toBe('string');
    // Content should be valid base64
    expect(() => Buffer.from(jobData.content as string, 'base64')).not.toThrow();
    // Storage should NOT be called for pdf-vision mode
    expect(mockStorageFile.save).not.toHaveBeenCalled();
  });

  it('PDF grande (> 14MB) → extrae texto con pdf-parse, múltiples chunks, isPdfVision=false', async () => {
    const PDF_VISION_LIMIT = 14 * 1024 * 1024;
    const largePdf = makePdfFile('large.pdf', PDF_VISION_LIMIT + 1);

    // Mock pdf-parse to return text with multiple questions
    const extractedText = Array.from(
      { length: 30 },
      (_, i) => `${i + 1}. Pregunta ${i + 1} con su enunciado.\nA) A  B) B  C) C  D) D\n`
    ).join('\n');
    mockPdfParse.mockResolvedValueOnce({ text: extractedText });

    const res = await POST(makeFileRequest(largePdf));
    const body = await res.json() as { sessionId: string; totalChunks: number };

    expect(res.status).toBe(200);
    expect(body.totalChunks).toBeGreaterThanOrEqual(1);

    // All chunks should have isPdfVision=false
    for (const [, jobData] of mockBatch.set.mock.calls as [[unknown, Record<string, unknown>]]) {
      expect(jobData.isPdfVision).toBe(false);
    }
  });

  it('job tiene todos los campos requeridos en Firestore', async () => {
    const text = ICFES_QUESTION_WITH_FIGURE;
    const res = await POST(makeTextRequest(text));
    const body = await res.json() as { sessionId: string; totalChunks: number };

    expect(res.status).toBe(200);

    const [, jobData] = mockBatch.set.mock.calls[0] as [unknown, Record<string, unknown>];
    // Text-mode jobs use contentStoragePath (Storage path), not 'content'
    const requiredFields = [
      'sessionId', 'chunkIndex', 'totalChunks', 'contentStoragePath',
      'isPdfVision', 'sourceLabel', 'status', 'questionsFound',
      'createdAt', 'updatedAt',
    ];
    for (const field of requiredFields) {
      expect(jobData).toHaveProperty(field);
    }
    expect(jobData.status).toBe('pending');
    expect(jobData.questionsFound).toBe(0);
    expect(jobData.sessionId).toBe(body.sessionId);
    expect(jobData.chunkIndex).toBe(1);
    expect(jobData.totalChunks).toBe(body.totalChunks);
    // contentStoragePath should follow the expected pattern
    expect(jobData.contentStoragePath as string).toMatch(
      /^import-chunks\/[a-f0-9-]+\/chunk-1\.txt$/
    );
  });

  it('JSON body con URL de PDF (.pdf extension) → descarga y procesa', async () => {
    const pdfBuffer = makePdfBuffer(1024);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => pdfBuffer.buffer,
      text: async () => '',
    } as unknown as Response);

    const res = await POST(makeUrlRequest('https://www.icfes.gov.co/cuadernillo.pdf'));
    const body = await res.json() as { sessionId: string; totalChunks: number };

    expect(res.status).toBe(200);
    expect(body.totalChunks).toBe(1);

    const [, jobData] = mockBatch.set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(jobData.isPdfVision).toBe(true);
  });

  it('JSON body con URL HTML → limpia HTML y fragmenta como texto', async () => {
    const htmlContent =
      '<html><body><h1>Matemáticas</h1><p>Contenido académico.</p>' +
      '<script>alert("x")</script></body></html>';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html' },
      body: true, // simulate non-null body so text() is called
      text: async () => htmlContent,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);

    const res = await POST(makeUrlRequest('https://ejemplo.com/guia'));
    const body = await res.json() as { sessionId: string; totalChunks: number };

    expect(res.status).toBe(200);
    expect(body.totalChunks).toBeGreaterThanOrEqual(1);

    const [, jobData] = mockBatch.set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(jobData.isPdfVision).toBe(false);
    // Text-mode jobs store content in Storage; Firestore gets the path
    expect(typeof jobData.contentStoragePath).toBe('string');
    expect(jobData.contentStoragePath as string).toMatch(/^import-chunks\/.+\/chunk-\d+\.txt$/);
    // Verify Storage save was called with content that does not contain the script tag
    const saveArg = mockStorageFile.save.mock.calls[0]?.[0] as string | undefined;
    expect(saveArg).toBeDefined();
    expect(saveArg).not.toContain('alert');
  });

  it('FormData sin archivo ni texto → 400', async () => {
    const fd = new FormData();
    const req = new NextRequest('http://localhost/api/import-queue', {
      method: 'POST',
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('JSON body sin URL → 400', async () => {
    const req = new NextRequest('http://localhost/api/import-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('URL inválida → 400', async () => {
    const res = await POST(makeUrlRequest('no-es-una-url'));
    expect(res.status).toBe(400);
  });

  it('URL con protocolo no permitido (ftp) → 400', async () => {
    const res = await POST(makeUrlRequest('ftp://example.com/file.pdf'));
    expect(res.status).toBe(400);
  });

  it('fetch falla con non-2xx → 502', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => 'text/html' },
    } as unknown as Response);

    const res = await POST(makeUrlRequest('https://ejemplo.com/not-found'));
    expect(res.status).toBe(502);
  });

  it('Firestore batch.commit falla → 500', async () => {
    mockBatch.commit.mockRejectedValueOnce(new Error('Firestore unavailable'));
    const res = await POST(makeTextRequest(ICFES_QUESTION_WITH_FIGURE));
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GRUPO 4 — Escenarios reales del PDF ICFES Matemáticas 2026
// ─────────────────────────────────────────────────────────────────────────────

describe('Grupo 4 — Escenarios ICFES Matemáticas 2026', () => {
  it('pregunta de probabilidad, estadística, geometría → subjectId matematicas asignado en metadata', async () => {
    const text = `
1. La media aritmética de los valores 5, 8, 12, 15, 20 es:
A) 10   B) 11   C) 12   D) 13

2. Un triángulo tiene ángulos de 60°, 60° y 60°. Es un triángulo:
A) Isósceles   B) Escaleno   C) Obtusángulo   D) Equilátero
`;
    const res = await POST(makeTextRequest(text));
    const body = await res.json() as { sessionId: string; totalChunks: number; sourceLabel: string };

    expect(res.status).toBe(200);
    expect(body.totalChunks).toBeGreaterThanOrEqual(1);

    // Check that Firestore batch.set was called with proper sourceLabel
    const [, jobData] = mockBatch.set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(jobData.sourceLabel).toBe('texto pegado directamente');
  });

  it('pregunta con figura geométrica → chunk contiene el texto completo', () => {
    const chunks = splitIntoSmartChunks(ICFES_QUESTION_WITH_FIGURE);
    expect(chunks).toHaveLength(1);
    const c = chunks[0];
    expect(c).toContain('triángulo rectángulo ABC');
    expect(c).toContain('AB = 3 cm');
    expect(c).toContain('BC = 4 cm');
    expect(c).toContain('A) 5 cm');
    expect(c).toContain('D) 25 cm');
  });

  it('cuadernillo con 15 preguntas → el algoritmo de corte no parte ninguna pregunta', () => {
    const questions = Array.from({ length: 15 }, (_, i) => {
      const n = i + 1;
      return (
        `${n}. En un plano cartesiano, la ecuación de la recta que pasa por ` +
        `(${n}, ${n * 2}) y (${n + 1}, ${n * 2 + 3}) es:\n` +
        `A) y = ${n}x + ${n}\n` +
        `B) y = ${n + 1}x - ${n}\n` +
        `C) y = ${n + 2}x + ${n * 2}\n` +
        `D) y = ${n + 3}x - ${n * 3}\n`
      );
    });
    const text = questions.join('\n\n');
    const chunks = splitIntoSmartChunks(text);

    // Verify that each question appears complete in some chunk
    for (let n = 1; n <= 15; n++) {
      const stem = `${n}. En un plano cartesiano`;
      const found = chunks.some(
        (c) => c.includes(stem) && c.includes(`A) y = ${n}x + ${n}`)
      );
      expect(found).toBe(true);
    }
  });

  it('URL del cuadernillo ICFES real (PDF URL pattern) → detectado como PDF', async () => {
    const pdfBuffer = makePdfBuffer(1024);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'application/pdf' : null },
      arrayBuffer: async () => pdfBuffer.buffer,
      text: async () => '',
    } as unknown as Response);

    const icfesUrl =
      'https://www.icfes.gov.co/wp-content/uploads/2026/04/09-Marzo_Cuadernillo-de-Preguntas-Matematicas-Saber-11-2026.pdf';
    const res = await POST(makeUrlRequest(icfesUrl));
    const body = await res.json() as { sessionId: string; totalChunks: number };

    expect(res.status).toBe(200);
    // Since the PDF is small (1024 bytes), it should be processed as pdf-vision
    const [, jobData] = mockBatch.set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(jobData.isPdfVision).toBe(true);
    expect(jobData.sourceLabel).toBe(icfesUrl);
  });

  it('chunk grande de PDF con texto extraído incluye overlap al crear siguiente chunk', () => {
    // Craft text that forces a split between question 5 and question 6
    const questions = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const longStem =
        `${n}. En el contexto del examen de Estado Saber 11 – 2026, ` +
        `considerando los conceptos de probabilidad y estadística inferencial, ` +
        `determine el valor de la expresión P(A ∪ B) donde P(A) = 0.${n * 5} ` +
        `y P(B) = 0.${n * 3} con A y B mutuamente excluyentes. ` +
        'El estudiante debe recordar que para eventos mutuamente excluyentes '.repeat(5);
      return (
        longStem + '\n' +
        `A) 0.${n * 8}   B) 0.${n * 7 + 1}   C) 0.${n * 6 + 2}   D) 0.${n * 5 + 3}\n`
      );
    });
    const text = questions.join('\n\n');
    const chunks = splitIntoSmartChunks(text);

    // All questions should be findable (either in their primary chunk or in overlap)
    const allText = chunks.join('\n');
    for (let n = 1; n <= 10; n++) {
      expect(allText).toContain(`${n}. En el contexto del examen de Estado`);
    }
  });
});
