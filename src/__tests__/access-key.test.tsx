/**
 * @file Integration tests for the Access Key (Llave de Acceso) flow.
 *
 * Tests verify key validation, successful activation, and error cases.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock Next.js navigation ──────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/profile',
}));

jest.mock('next/link', () => {
  const Link = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'MockLink';
  return Link;
});

jest.mock('next/image', () => {
  const MockImage = ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  );
  MockImage.displayName = 'MockImage';
  return MockImage;
});

// ─── Mock toast ───────────────────────────────────────────────────────────────
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─── Mock Firebase auth ───────────────────────────────────────────────────────
jest.mock('firebase/auth', () => ({
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));

// ─── Mock Firestore operations ────────────────────────────────────────────────
const mockGetDocs = jest.fn();
const mockUpdateDoc = jest.fn();
const mockSetDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_, __, id) => ({ path: `users/${id}` })),
  collection: jest.fn(() => ({ path: 'premiumAccessKeys' })),
  query: jest.fn((...args) => args),
  limit: jest.fn(n => n),
  where: jest.fn((...args) => args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  serverTimestamp: jest.fn(() => new Date()),
  increment: jest.fn(n => n),
  orderBy: jest.fn(),
}));

// ─── Mock Firebase hooks ──────────────────────────────────────────────────────
const mockUser = { uid: 'user-123', displayName: 'Héroe Test', email: 'test@test.com', photoURL: null };
const mockUseDoc = jest.fn();

jest.mock('@/firebase', () => ({
  useFirebase: () => ({
    user: mockUser,
    isUserLoading: false,
    firestore: {},
    auth: {},
  }),
  useDoc: (...args: unknown[]) => mockUseDoc(...args),
  useCollection: () => ({ data: [], isLoading: false }),
  useMemoFirebase: (factory: () => unknown) => factory(),
}));

// ─── Mock branding ────────────────────────────────────────────────────────────
jest.mock('@/components/branding-provider', () => ({
  useBranding: () => ({ institutionName: 'Test School', institutionLogo: null }),
  BrandingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─────────────────────────────────────────────────────────────────────────────

// Mock window.location.reload (jsdom doesn't implement it)
const reloadMock = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (window as any).location;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).location = { reload: reloadMock, href: '/', pathname: '/profile' };

import ProfilePage from '@/app/profile/page';

// ─────────────────────────────────────────────────────────────────────────────

describe('Access Key (Llave de Acceso) – ProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDoc.mockReturnValue({
      data: { displayName: 'Héroe Test', currentPoints: 0, role: 'student', isTrial: true, trialEndDate: new Date(Date.now() + 86400000 * 5).toISOString() },
      isLoading: false,
    });
  });

  it('renders the access key input form for trial users', () => {
    render(<ProfilePage />);
    expect(screen.getByPlaceholderText(/CÓDIGO AQUÍ/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validar Acceso/i })).toBeInTheDocument();
  });

  it('disables the Validar Acceso button when input is empty', () => {
    render(<ProfilePage />);
    const button = screen.getByRole('button', { name: /Validar Acceso/i });
    expect(button).toBeDisabled();
  });

  it('enables the Validar Acceso button when a key is typed', async () => {
    render(<ProfilePage />);
    const input = screen.getByPlaceholderText(/CÓDIGO AQUÍ/i);
    await userEvent.type(input, 'SOME-KEY');
    expect(screen.getByRole('button', { name: /Validar Acceso/i })).not.toBeDisabled();
  });

  it('shows error toast when key is not found in Firestore', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    render(<ProfilePage />);
    const input = screen.getByPlaceholderText(/CÓDIGO AQUÍ/i);
    await userEvent.type(input, 'INVALID-KEY');
    await userEvent.click(screen.getByRole('button', { name: /Validar Acceso/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Llave Inválida' })
      );
    });
  });

  it('shows error toast when all matching keys are already inactive', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'key-1', data: () => ({ keyString: 'USED-KEY', isActive: false, type: 'student_access' }) }],
    });

    render(<ProfilePage />);
    await userEvent.type(screen.getByPlaceholderText(/CÓDIGO AQUÍ/i), 'USED-KEY');
    await userEvent.click(screen.getByRole('button', { name: /Validar Acceso/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Llave Inválida' })
      );
    });
  });

  it('activates premium access when a valid student key is provided', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{
        id: 'key-abc',
        data: () => ({ keyString: 'VALID-STUDENT-KEY', isActive: true, type: 'student_access' }),
      }],
    });
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);

    render(<ProfilePage />);
    await userEvent.type(screen.getByPlaceholderText(/CÓDIGO AQUÍ/i), 'VALID-STUDENT-KEY');
    await userEvent.click(screen.getByRole('button', { name: /Validar Acceso/i }));

    await waitFor(() => {
      // User document is updated via setDoc with merge (works even if doc doesn't exist)
      expect(mockSetDoc).toHaveBeenCalled();
      // Premium key document is marked inactive via updateDoc
      expect(mockUpdateDoc).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '¡Acceso Activado!' })
      );
    });
  });

  it('activates admin access with legacy ADMIN-MASTER-2025 key', async () => {
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);

    render(<ProfilePage />);
    await userEvent.type(screen.getByPlaceholderText(/CÓDIGO AQUÍ/i), 'ADMIN-MASTER-2025');
    await userEvent.click(screen.getByRole('button', { name: /Validar Acceso/i }));

    await waitFor(() => {
      // Should NOT query Firestore for the key (legacy key bypass)
      expect(mockGetDocs).not.toHaveBeenCalled();
      // Should create admin user document
      expect(mockSetDoc).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '¡Acceso Activado!' })
      );
    });
  });

  it('shows error toast when Firestore throws during key validation', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('Firestore index missing'));

    render(<ProfilePage />);
    await userEvent.type(screen.getByPlaceholderText(/CÓDIGO AQUÍ/i), 'SOME-KEY');
    await userEvent.click(screen.getByRole('button', { name: /Validar Acceso/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Error al activar' })
      );
    });
  });
});
