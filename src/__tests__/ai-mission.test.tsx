/**
 * @file Integration tests for the AI Mission Generation flow.
 *
 * These tests simulate how the dashboard page calls the AI adaptive learning path
 * and verifies that the UI responds correctly to success and failure cases.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock Next.js navigation ──────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
}));

// ─── Mock Next.js Link ────────────────────────────────────────────────────────
jest.mock('next/link', () => {
  const Link = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'MockLink';
  return Link;
});

// ─── Mock Next.js Image ───────────────────────────────────────────────────────
jest.mock('next/image', () => {
  const MockImage = ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  );
  MockImage.displayName = 'MockImage';
  return MockImage;
});

// ─── Mock Firebase auth ───────────────────────────────────────────────────────
jest.mock('firebase/auth', () => ({
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));
const mockAdaptLearningPath = jest.fn();
jest.mock('@/ai/flows/adaptive-learning-path', () => ({
  adaptLearningPath: (...args: unknown[]) => mockAdaptLearningPath(...args),
}));

// ─── Mock Firebase ────────────────────────────────────────────────────────────
const mockUser = { uid: 'user-123', displayName: 'Héroe Test', email: 'test@test.com', photoURL: null };
const mockFirestoreDoc = jest.fn();
const mockUseDoc = jest.fn();
const mockUseCollection = jest.fn();

jest.mock('@/firebase', () => ({
  useFirebase: () => ({
    user: mockUser,
    isUserLoading: false,
    firestore: {},
    auth: {},
  }),
  useDoc: (...args: unknown[]) => mockUseDoc(...args),
  useCollection: (...args: unknown[]) => mockUseCollection(...args),
  useMemoFirebase: (factory: () => unknown) => factory(),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => ({ path: 'users/user-123', ...args }),
  collection: jest.fn(),
  query: jest.fn(),
  limit: jest.fn(),
  orderBy: jest.fn(),
  increment: jest.fn(),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));

// ─── Mock branding provider ───────────────────────────────────────────────────
jest.mock('@/components/branding-provider', () => ({
  useBranding: () => ({ institutionName: 'Test School', institutionLogo: null }),
  BrandingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Mock toast ───────────────────────────────────────────────────────────────
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─── Mock recharts ────────────────────────────────────────────────────────────
jest.mock('recharts', () => ({
  Radar: () => null,
  RadarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="radar-chart">{children}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Import component under test ──────────────────────────────────────────────
// Note: imported AFTER all mocks are set up
import DashboardPage from '@/app/dashboard/page';

// ─────────────────────────────────────────────────────────────────────────────

describe('AI Mission Generation – Dashboard', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseDoc.mockReturnValue({
      data: { displayName: 'Héroe Test', currentPoints: 250, role: 'student', isTrial: true, trialEndDate: new Date(Date.now() + 86400000 * 5).toISOString() },
      isLoading: false,
    });
    mockUseCollection.mockReturnValue({ data: [], isLoading: false });
  });

  it('renders the "Generar Misión Personalizada" button when no mission exists', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Generar Misión Personalizada/i)).toBeInTheDocument();
  });

  it('shows loading state while AI mission is being generated', async () => {
    mockAdaptLearningPath.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 5000))
    );

    render(<DashboardPage />);
    const button = screen.getByText(/Generar Misión Personalizada/i);
    await userEvent.click(button);

    // Button should be disabled/loading while generating
    expect(button.closest('button')).toBeDisabled();
  });

  it('displays the AI mission card when generation succeeds', async () => {
    mockAdaptLearningPath.mockResolvedValueOnce({
      recommendationType: 'mission',
      recommendations: [{ id: '1', text: 'Practica álgebra básica con 10 ejercicios.' }],
      motivationMessage: '¡Tú puedes lograrlo!',
      gamificationElement: 'Gana 500 XP',
    });

    render(<DashboardPage />);
    await userEvent.click(screen.getByText(/Generar Misión Personalizada/i));

    await waitFor(() => {
      expect(screen.getByText('Practica álgebra básica con 10 ejercicios.')).toBeInTheDocument();
      expect(screen.getByText(/"¡Tú puedes lograrlo!"/i)).toBeInTheDocument();
    });
  });

  it('shows a toast error when AI mission generation fails', async () => {
    mockAdaptLearningPath.mockRejectedValueOnce(new Error('API key missing'));

    render(<DashboardPage />);
    await userEvent.click(screen.getByText(/Generar Misión Personalizada/i));

    await waitFor(() => {
      // After failure, button should be re-enabled (generation finished)
      expect(screen.getByText(/Generar Misión Personalizada/i).closest('button')).not.toBeDisabled();
    });
    // Mission card should NOT appear
    expect(screen.queryByText(/Aceptar Desafío/i)).not.toBeInTheDocument();
    // Toast should have been called with error
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Error de IA' })
    );
  });
});
