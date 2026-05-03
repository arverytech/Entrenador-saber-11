/**
 * @file Unit tests for PracticeRoomPage – auto-generation disabled.
 *
 * Validates:
 * 1. AI generation is NOT called automatically on load when the bank is empty.
 * 2. The empty-state UI is shown with a manual "Generar con IA" button.
 * 3. Clicking the button is the only way to trigger AI generation.
 * 4. A Gemini 429 / quota error is presented as a non-fatal toast (no crash).
 * 5. Questions from the DB bank are shown directly without any AI call.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock Next.js navigation ──────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/practice/sociales',
}));

jest.mock('next/link', () => {
  const Link = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'MockLink';
  return Link;
});

jest.mock('next/image', () => {
  const Img = ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />;
  Img.displayName = 'MockImage';
  return Img;
});

// ─── Mock Firebase auth ───────────────────────────────────────────────────────
jest.mock('firebase/auth', () => ({
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));

// ─── Mock AI flow ─────────────────────────────────────────────────────────────
const mockGenerateIcfesQuestion = jest.fn();
jest.mock('@/ai/flows/generate-question-flow', () => ({
  generateIcfesQuestion: (...args: unknown[]) => mockGenerateIcfesQuestion(...args),
}));

// ─── Mock Firebase ────────────────────────────────────────────────────────────
const mockUser = { uid: 'user-test-abc123', displayName: 'Test User', email: 'test@test.com', photoURL: null };
const mockUseCollection = jest.fn();

jest.mock('@/firebase', () => ({
  useFirebase: () => ({
    user: mockUser,
    isUserLoading: false,
    firestore: { type: 'firestore' },
    auth: {},
  }),
  useCollection: (...args: unknown[]) => mockUseCollection(...args),
  useMemoFirebase: (factory: () => unknown) => factory(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  increment: jest.fn(),
  addDoc: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
  serverTimestamp: jest.fn(),
}));

jest.mock('@/firebase/non-blocking-updates', () => ({
  updateDocumentNonBlocking: jest.fn(),
}));

// ─── Mock toast ───────────────────────────────────────────────────────────────
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─── Mock DOMPurify ───────────────────────────────────────────────────────────
jest.mock('dompurify', () => ({
  sanitize: (html: string) => html,
}));

// ─── Mock GameNavbar ──────────────────────────────────────────────────────────
jest.mock('@/components/game-navbar', () => ({
  GameNavbar: () => <nav data-testid="game-navbar" />,
}));

// ─── Import component AFTER mocks ────────────────────────────────────────────
import PracticeRoomPage from '@/app/practice/[subject]/page';

// ─── Reusable mock data ───────────────────────────────────────────────────────
const AI_QUESTION = {
  id: 'ai_gen_1',
  text: 'Pregunta generada por IA para test',
  options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
  correctAnswerIndex: 0,
  explanation: 'Explicación técnica',
  subjectId: 'sociales',
  componentId: 'Pensamiento ciudadano',
  competencyId: 'Interpretación',
  level: 'Medio' as const,
  pointsAwarded: 50,
  metadata: {
    competencyDescription: 'Descripción de la competencia',
    evidence: 'Evidencia observable',
    origin: 'Original inspirada en el estilo ICFES 2026',
  },
};

const DB_QUESTION = {
  id: 'db_q1',
  text: 'Pregunta del banco de datos',
  options: ['A', 'B', 'C', 'D'],
  correctAnswerIndex: 1,
  explanation: 'Exp',
  subjectId: 'sociales',
  componentId: 'Comp',
  competencyId: 'Comp',
  level: 'Básico' as const,
  pointsAwarded: 50,
};

const renderPage = (subject = 'sociales') =>
  render(<PracticeRoomPage params={{ subject }} />);

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('PracticeRoomPage – auto-generation disabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateIcfesQuestion.mockResolvedValue(AI_QUESTION);
  });

  // ── 1. No auto-call ─────────────────────────────────────────────────────────
  it('does NOT call generateIcfesQuestion automatically on load when bank is empty', async () => {
    mockUseCollection.mockReturnValue({ data: [], isLoading: false, error: null });
    renderPage();

    // Give React time to settle effects
    await waitFor(() => {
      expect(mockGenerateIcfesQuestion).not.toHaveBeenCalled();
    });
  });

  // ── 2. Empty state UI ───────────────────────────────────────────────────────
  it('shows the empty-state message and "Generar con IA" button when bank is empty', () => {
    mockUseCollection.mockReturnValue({ data: [], isLoading: false, error: null });
    renderPage();

    expect(screen.getByText(/banco vacío/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generar con ia/i })).toBeInTheDocument();
  });

  // ── 3. Manual trigger only ──────────────────────────────────────────────────
  it('calls generateIcfesQuestion only when the "Generar con IA" button is clicked', async () => {
    mockUseCollection.mockReturnValue({ data: [], isLoading: false, error: null });
    renderPage();

    expect(mockGenerateIcfesQuestion).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /generar con ia/i }));

    await waitFor(() => {
      expect(mockGenerateIcfesQuestion).toHaveBeenCalledTimes(1);
    });
  });

  // ── 4. Successful AI generation shows question ──────────────────────────────
  it('shows the AI-generated question after the manual button is clicked successfully', async () => {
    mockUseCollection.mockReturnValue({ data: [], isLoading: false, error: null });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /generar con ia/i }));

    await waitFor(() => {
      expect(screen.getByText(AI_QUESTION.text)).toBeInTheDocument();
    });
  });

  // ── 5. 429 quota error → non-fatal toast ────────────────────────────────────
  it('shows a non-fatal toast (variant: destructive) containing "429" when Gemini quota is exhausted', async () => {
    mockUseCollection.mockReturnValue({ data: [], isLoading: false, error: null });
    mockGenerateIcfesQuestion.mockRejectedValueOnce(
      new Error('GenkitError: RESOURCE_EXHAUSTED: 429 Too Many Requests – quota exceeded'),
    );
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /generar con ia/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          title: expect.stringContaining('429'),
        }),
      );
    });

    // Page must not crash – the "Generar con IA" button should still be visible
    expect(screen.getByRole('button', { name: /generar con ia/i })).toBeInTheDocument();
  });

  // ── 6. Generic AI error → non-fatal toast ───────────────────────────────────
  it('shows a destructive toast for generic AI errors without crashing the page', async () => {
    mockUseCollection.mockReturnValue({ data: [], isLoading: false, error: null });
    mockGenerateIcfesQuestion.mockRejectedValueOnce(new Error('API Key not configured'));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /generar con ia/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    // Button should remain enabled for retry
    expect(screen.getByRole('button', { name: /generar con ia/i })).toBeInTheDocument();
  });

  // ── 7. DB bank questions shown without any AI call ──────────────────────────
  it('shows questions from the DB bank without calling generateIcfesQuestion', () => {
    mockUseCollection.mockReturnValue({ data: [DB_QUESTION], isLoading: false, error: null });
    renderPage();

    expect(screen.getByText(DB_QUESTION.text)).toBeInTheDocument();
    expect(mockGenerateIcfesQuestion).not.toHaveBeenCalled();
  });

  // ── 8. Firestore error shows diagnostic message ─────────────────────────────
  it('shows a Firestore error message in the empty state when useCollection returns an error', () => {
    mockUseCollection.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('PERMISSION_DENIED: Missing or insufficient permissions'),
    });
    renderPage();

    expect(screen.getByText(/no se pudo leer firestore/i)).toBeInTheDocument();
    expect(mockGenerateIcfesQuestion).not.toHaveBeenCalled();
  });
});
