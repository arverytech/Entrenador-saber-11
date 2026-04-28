/**
 * @jest-environment node
 *
 * @file Tests for POST /api/process-chunk
 *
 * Scenarios covered:
 *
 * Grupo 3 — Cola de procesamiento (process-chunk)
 *   1.  Toma el job "pending" más antiguo
 *   2.  Marca el job como "processing" antes de llamar a la IA
 *   3.  Marca como "done" y guarda questionsFound al terminar
 *   4.  Marca como "failed" con errorMessage si la IA falla ambos intentos
 *   5.  Responde { status: 'nothing_pending' } si no hay jobs pendientes
 *   6.  Deduplicación: pregunta con texto idéntico no se guarda dos veces
 *   7.  Requiere Authorization header cuando CRON_SECRET está configurado
 *   8.  Permite acceso sin cabecera si CRON_SECRET no está configurado
 *   9.  Modo isPdfVision=true: decodifica base64 y llama importQuestionsFromPdf
 *   10. Modo isPdfVision=false: llama importQuestionsFromContent con el texto
 *   11. Error de inicialización de Firebase Admin → 500
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockImportFromPdf = jest.fn();
const mockImportFromContent = jest.fn();
const mockImportFromGeminiFileUri = jest.fn();

jest.mock('@/ai/flows/import-questions-from-url-flow', () => ({
  importQuestionsFromPdf: (...args: unknown[]) => mockImportFromPdf(...args),
  importQuestionsFromContent: (...args: unknown[]) => mockImportFromContent(...args),
  importQuestionsFromGeminiFileUri: (...args: unknown[]) => mockImportFromGeminiFileUri(...args),
}));

// ── Firestore mock ────────────────────────────────────────────────────────────

type UpdateData = Record<string, unknown>;
type DocData = Record<string, unknown>;

interface MockDocRef {
  id: string;
  data: () => DocData;
  ref: { update: jest.Mock };
}

const makeJobDocRef = (data: DocData, id = 'job-doc-1'): MockDocRef => ({
  id,
  data: () => data,
  ref: { update: jest.fn().mockResolvedValue(undefined) },
});

const mockJobRef1 = makeJobDocRef({
  sessionId: 'session-abc',
  chunkIndex: 1,
  totalChunks: 3,
  contentStoragePath: 'import-chunks/session-abc/chunk-1.txt',
  isPdfVision: false,
  sourceLabel: 'cuadernillo.pdf',
  status: 'pending',
  questionsFound: 0,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
});

const mockExistingQuestionsSnap = { docs: [] as MockDocRef[] };

const mockJobsQuery = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn(),
};

const mockExistingQuestionsQuery = {
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue(mockExistingQuestionsSnap),
};

const mockQuestionsCollection = {
  add: jest.fn().mockResolvedValue({ id: 'new-question-id' }),
};

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'importJobs') return mockJobsQuery;
    if (name === 'questions') return mockQuestionsCollection;
    return mockJobsQuery;
  }),
};

// ── Storage mock ──────────────────────────────────────────────────────────────

const mockStorageFileDownload = jest.fn().mockResolvedValue([
  Buffer.from('Contenido del fragmento 1 con preguntas.'),
]);
const mockStorageFileDelete = jest.fn().mockResolvedValue(undefined);
const mockStorageFile = {
  download: mockStorageFileDownload,
  delete: mockStorageFileDelete,
};
const mockBucket = {
  file: jest.fn().mockReturnValue(mockStorageFile),
};

jest.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: jest.fn(() => mockDb),
  getAdminStorage: jest.fn(() => mockBucket),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/process-chunk/route';

// ─── ICFES fixtures ───────────────────────────────────────────────────────────

const ICFES_AI_OUTPUT = {
  questions: [
    {
      text: 'En la figura se muestra un triángulo rectángulo ABC. ¿Cuánto mide la hipotenusa AC?',
      options: ['5 cm', '6 cm', '7 cm', '25 cm'],
      correctAnswerIndex: 0,
      explanation: 'Por Pitágoras: AC = √(9 + 16) = 5 cm.',
      subjectId: 'matematicas',
      componentId: 'Geométrico-Métrico',
      competencyId: 'Razonamiento y argumentación',
      level: 'Básico',
      pointsAwarded: 50,
    },
    {
      text: 'La media de 5, 8, 12, 15, 20 es:',
      options: ['10', '11', '12', '13'],
      correctAnswerIndex: 2,
      explanation: 'Media = (5 + 8 + 12 + 15 + 20) / 5 = 60 / 5 = 12.',
      subjectId: 'matematicas',
      componentId: 'Aleatorio',
      competencyId: 'Interpretación y representación',
      level: 'Básico',
      pointsAwarded: 50,
    },
  ],
  sourceNote: 'Cuadernillo ICFES Matemáticas 2026',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(cronSecret?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`;
  return new NextRequest('http://localhost/api/process-chunk', { method: 'POST', headers });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  // Ensure CRON_SECRET is not set so tests that don't set it don't require auth
  delete process.env.CRON_SECRET;

  // Reset the query mock chain
  mockJobsQuery.where.mockReturnThis();
  mockJobsQuery.orderBy.mockReturnThis();
  mockJobsQuery.limit.mockReturnThis();
  // Reset get() implementation to clear any leftover Once queue from previous tests,
  // then set up the two-call sequence: first get() = stuck-job recovery (empty),
  // subsequent get() = pending-job query (returns mockJobRef1 by default).
  mockJobsQuery.get.mockReset();
  mockJobsQuery.get
    .mockResolvedValueOnce({ empty: true, docs: [] })
    .mockResolvedValue({ empty: false, docs: [mockJobRef1] });

  mockExistingQuestionsQuery.where.mockReturnThis();
  mockExistingQuestionsQuery.select.mockReturnThis();
  mockExistingQuestionsQuery.get.mockResolvedValue(mockExistingQuestionsSnap);

  mockQuestionsCollection.add.mockResolvedValue({ id: 'new-question-id' });
  mockJobRef1.ref.update.mockResolvedValue(undefined);

  mockDb.collection.mockImplementation((name: string) => {
    if (name === 'importJobs') return mockJobsQuery;
    if (name === 'questions') {
      // Mimic chaining: the second call to collection('questions') is for add
      return {
        ...mockQuestionsCollection,
        where: jest.fn().mockReturnValue(mockExistingQuestionsQuery),
      };
    }
    return mockJobsQuery;
  });

  // Reset Storage mocks
  mockBucket.file.mockReturnValue(mockStorageFile);
  mockStorageFileDownload.mockResolvedValue([
    Buffer.from('Contenido del fragmento 1 con preguntas.'),
  ]);
  mockStorageFileDelete.mockResolvedValue(undefined);

  mockImportFromContent.mockResolvedValue(ICFES_AI_OUTPUT);
  mockImportFromPdf.mockResolvedValue(ICFES_AI_OUTPUT);
  mockImportFromGeminiFileUri.mockResolvedValue(ICFES_AI_OUTPUT);
});

afterEach(() => {
  if (ORIGINAL_CRON_SECRET !== undefined) {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  } else {
    delete process.env.CRON_SECRET;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/process-chunk', () => {
  describe('Authorization', () => {
    it('retorna 401 cuando CRON_SECRET está configurado y la cabecera es incorrecta', async () => {
      process.env.CRON_SECRET = 'mi-secreto-seguro';
      const res = await POST(makeRequest('clave-incorrecta'));
      expect(res.status).toBe(401);
    });

    it('permite acceso con la clave correcta', async () => {
      process.env.CRON_SECRET = 'mi-secreto-seguro';
      const res = await POST(makeRequest('mi-secreto-seguro'));
      const body = await res.json() as { status: string };
      expect(res.status).toBe(200);
      expect(['done', 'nothing_pending']).toContain(body.status);
    });

    it('permite acceso sin CRON_SECRET configurado', async () => {
      delete process.env.CRON_SECRET;
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
    });
  });

  describe('nothing_pending', () => {
    it('responde { status: nothing_pending } cuando no hay jobs pendientes', async () => {
      // Override: both stuck-job query AND pending-job query return empty
      mockJobsQuery.get.mockReset();
      mockJobsQuery.get
        .mockResolvedValueOnce({ empty: true, docs: [] })
        .mockResolvedValueOnce({ empty: true, docs: [] });

      const res = await POST(makeRequest());
      const body = await res.json() as { status: string };
      expect(res.status).toBe(200);
      expect(body.status).toBe('nothing_pending');
    });
  });

  describe('procesamiento de chunks (modo texto)', () => {
    it('toma el job "pending" más antiguo (orderBy createdAt asc)', async () => {
      await POST(makeRequest());
      expect(mockJobsQuery.where).toHaveBeenCalledWith('status', '==', 'pending');
      expect(mockJobsQuery.orderBy).toHaveBeenCalledWith('createdAt', 'asc');
      expect(mockJobsQuery.limit).toHaveBeenCalledWith(20);
    });

    it('marca el job como "processing" ANTES de llamar a la IA', async () => {
      let markedProcessingBeforeAI = false;

      mockImportFromContent.mockImplementation(async () => {
        // Check if the job was already marked as processing
        const updateCalls = mockJobRef1.ref.update.mock.calls as UpdateData[][];
        const hasProcessingUpdate = updateCalls.some(
          ([data]) => data.status === 'processing'
        );
        markedProcessingBeforeAI = hasProcessingUpdate;
        return ICFES_AI_OUTPUT;
      });

      await POST(makeRequest());
      expect(markedProcessingBeforeAI).toBe(true);
    });

    it('marca el job como "done" y guarda questionsFound al terminar', async () => {
      const res = await POST(makeRequest());
      const body = await res.json() as { status: string; questionsFound: number };

      expect(body.status).toBe('done');
      expect(body.questionsFound).toBeGreaterThan(0);

      // The last update call should have status: 'done'
      const updateCalls = mockJobRef1.ref.update.mock.calls as UpdateData[][];
      const doneUpdate = updateCalls.find(([data]) => data.status === 'done');
      expect(doneUpdate).toBeDefined();
      expect((doneUpdate![0] as UpdateData).questionsFound).toBeGreaterThan(0);
    });

    it('guarda cada pregunta en Firestore con importSessionId', async () => {
      await POST(makeRequest());

      const addCalls = mockQuestionsCollection.add.mock.calls as [DocData][];
      expect(addCalls.length).toBeGreaterThan(0);

      for (const [questionData] of addCalls) {
        expect(questionData.importSessionId).toBe('session-abc');
        expect(questionData.createdAt).toBeTruthy();
        expect(questionData.updatedAt).toBeTruthy();
      }
    });

    it('marca como "failed" con errorMessage si la IA falla ambos intentos', async () => {
      mockImportFromContent.mockRejectedValue(new Error('Gemini timeout'));

      const res = await POST(makeRequest());
      const body = await res.json() as { status: string };
      expect(body.status).toBe('failed');

      const updateCalls = mockJobRef1.ref.update.mock.calls as UpdateData[][];
      const failedUpdate = updateCalls.find(([data]) => data.status === 'failed');
      expect(failedUpdate).toBeDefined();
      expect((failedUpdate![0] as UpdateData).errorMessage).toContain('Gemini timeout');
    });

    it('NO guarda preguntas cuando la IA falla', async () => {
      mockImportFromContent.mockRejectedValue(new Error('IA error'));

      await POST(makeRequest());
      expect(mockQuestionsCollection.add).not.toHaveBeenCalled();
    });
  });

  describe('deduplicación', () => {
    it('pregunta con texto idéntico (>85% similar) no se guarda dos veces', async () => {
      const duplicateText = ICFES_AI_OUTPUT.questions[0].text;

      // Simulate an existing question in the session with the same text
      const existingSnapWithDuplicate = {
        docs: [
          {
            data: () => ({ text: duplicateText }),
          },
        ],
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'importJobs') return mockJobsQuery;
        if (name === 'questions') {
          return {
            add: mockQuestionsCollection.add,
            where: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(existingSnapWithDuplicate),
              }),
            }),
          };
        }
        return mockJobsQuery;
      });

      // AI returns 2 questions, but question 1 is duplicate
      await POST(makeRequest());

      // Only the non-duplicate question should be saved (question 2)
      // questionsFound should be 1 (not 2)
      const updateCalls = mockJobRef1.ref.update.mock.calls as UpdateData[][];
      const doneUpdate = updateCalls.find(([data]) => data.status === 'done');
      expect(doneUpdate).toBeDefined();
      expect((doneUpdate![0] as UpdateData).questionsFound).toBe(1);
    });
  });

  describe('modo isPdfVision', () => {
    it('geminiFileUri → llama importQuestionsFromGeminiFileUri (sin acceso a Storage)', async () => {
      const geminiFilesJob = makeJobDocRef({
        sessionId: 'session-abc',
        chunkIndex: 1,
        totalChunks: 1,
        geminiFileUri: 'https://generativelanguage.googleapis.com/v1beta/files/test123',
        isPdfVision: false,
        sourceLabel: 'cuadernillo.pdf',
        status: 'pending',
        questionsFound: 0,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      }, 'gemini-files-job');

      // Override: stuck-job query → empty; pending-job query → geminiFilesJob
      mockJobsQuery.get.mockReset();
      mockJobsQuery.get
        .mockResolvedValueOnce({ empty: true, docs: [] })
        .mockResolvedValueOnce({ empty: false, docs: [geminiFilesJob] });

      await POST(makeRequest());

      expect(mockImportFromGeminiFileUri).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/files/test123',
        'cuadernillo.pdf',
      );
      expect(mockImportFromPdf).not.toHaveBeenCalled();
      expect(mockImportFromContent).not.toHaveBeenCalled();
      // Storage should NOT be accessed for geminiFileUri mode
      expect(mockBucket.file).not.toHaveBeenCalled();
    });

    it('isPdfVision=true (legacy) → decodifica base64 y llama importQuestionsFromPdf (sin descargar de Storage)', async () => {
      const pdfBuffer = Buffer.alloc(100).fill(0x25);
      const pdfBase64 = pdfBuffer.toString('base64');

      // PDF vision jobs have 'content' (base64), NOT 'contentStoragePath'
      const pdfVisionJob = makeJobDocRef({
        sessionId: 'session-abc',
        chunkIndex: 1,
        totalChunks: 1,
        isPdfVision: true,
        content: pdfBase64,
        sourceLabel: 'cuadernillo.pdf',
        status: 'pending',
        questionsFound: 0,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      }, 'pdf-vision-job');

      // Override: stuck-job query → empty; pending-job query → pdfVisionJob
      mockJobsQuery.get.mockReset();
      mockJobsQuery.get
        .mockResolvedValueOnce({ empty: true, docs: [] })
        .mockResolvedValueOnce({ empty: false, docs: [pdfVisionJob] });

      await POST(makeRequest());

      expect(mockImportFromPdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        'cuadernillo.pdf'
      );
      expect(mockImportFromContent).not.toHaveBeenCalled();
      // Storage should NOT be accessed for pdf-vision mode
      expect(mockBucket.file).not.toHaveBeenCalled();
    });

    it('isPdfVision=false → descarga de Storage y llama importQuestionsFromContent con el texto', async () => {
      await POST(makeRequest());

      // Storage should have been accessed to download the chunk text
      expect(mockBucket.file).toHaveBeenCalledWith('import-chunks/session-abc/chunk-1.txt');
      expect(mockStorageFileDownload).toHaveBeenCalled();
      expect(mockImportFromContent).toHaveBeenCalledWith({
        url: 'cuadernillo.pdf',
        content: 'Contenido del fragmento 1 con preguntas.',
      });
      expect(mockImportFromPdf).not.toHaveBeenCalled();
    });
  });

  describe('limpieza de Storage', () => {
    it('borra el archivo de Storage al marcar el job como "done"', async () => {
      await POST(makeRequest());

      const updateCalls = mockJobRef1.ref.update.mock.calls as UpdateData[][];
      const doneUpdate = updateCalls.find(([data]) => data.status === 'done');
      expect(doneUpdate).toBeDefined();
      // The Storage file should have been deleted
      expect(mockStorageFileDelete).toHaveBeenCalled();
    });

    it('borra el archivo de Storage al marcar el job como "failed"', async () => {
      mockImportFromContent.mockRejectedValue(new Error('IA error'));

      const res = await POST(makeRequest());
      const body = await res.json() as { status: string };
      expect(body.status).toBe('failed');

      // The Storage file should have been deleted even on failure
      expect(mockStorageFileDelete).toHaveBeenCalled();
    });
  });

  describe('respuesta correcta', () => {
    it('responde con processed (docId), questionsFound y status done', async () => {
      const res = await POST(makeRequest());
      const body = await res.json() as {
        status: string;
        processed: string;
        questionsFound: number;
      };

      expect(res.status).toBe(200);
      expect(body.status).toBe('done');
      expect(body.processed).toBe('job-doc-1');
      expect(typeof body.questionsFound).toBe('number');
    });
  });

  describe('escenarios reales ICFES Matemáticas 2026', () => {
    it('questions of tipo matematicas → guardadas con subjectId=matematicas', async () => {
      await POST(makeRequest());

      const addCalls = mockQuestionsCollection.add.mock.calls as [DocData][];
      for (const [q] of addCalls) {
        expect(q.subjectId).toBe('matematicas');
      }
    });

    it('reintenta la IA una vez cuando el primer intento falla', async () => {
      mockImportFromContent
        .mockRejectedValueOnce(new Error('Timeout del primer intento'))
        .mockResolvedValueOnce({ questions: [ICFES_AI_OUTPUT.questions[0]], sourceNote: '' });

      const res = await POST(makeRequest());
      const body = await res.json() as { status: string; questionsFound: number };

      expect(body.status).toBe('done');
      expect(body.questionsFound).toBe(1);
      expect(mockImportFromContent).toHaveBeenCalledTimes(2);
    });

    it('IA falla ambos intentos → status failed', async () => {
      mockImportFromContent
        .mockRejectedValueOnce(new Error('Intento 1 falló'))
        .mockRejectedValueOnce(new Error('Intento 2 falló'));

      const res = await POST(makeRequest());
      const body = await res.json() as { status: string };

      expect(body.status).toBe('failed');
      expect(mockImportFromContent).toHaveBeenCalledTimes(2);
    });
  });
});
