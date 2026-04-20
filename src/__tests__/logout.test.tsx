/**
 * @file Integration tests for the Logout flow.
 *
 * Tests cover both "Finalizar Misión" (navbar) and "Salir" (profile page).
 * Verifies that the user is redirected to /auth/login even when signOut throws.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock Next.js navigation ──────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
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

// ─── Mock Firebase auth signOut ───────────────────────────────────────────────
const mockSignOut = jest.fn();
jest.mock('firebase/auth', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  onAuthStateChanged: jest.fn(),
}));

// ─── Mock Firebase hooks ──────────────────────────────────────────────────────
const mockUser = { uid: 'user-123', displayName: 'Héroe Test', email: 'test@test.com', photoURL: null };

jest.mock('@/firebase', () => ({
  useFirebase: () => ({
    user: mockUser,
    isUserLoading: false,
    firestore: {},
    auth: { /* mock auth instance */ },
  }),
  useDoc: () => ({
    data: { displayName: 'Héroe Test', currentPoints: 100, role: 'student', isTrial: false },
    isLoading: false,
  }),
  useCollection: () => ({ data: [], isLoading: false }),
  useMemoFirebase: (factory: () => unknown) => factory(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'users/user-123' })),
  collection: jest.fn(),
  query: jest.fn(),
  limit: jest.fn(),
  orderBy: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));

// ─── Mock branding ────────────────────────────────────────────────────────────
jest.mock('@/components/branding-provider', () => ({
  useBranding: () => ({ institutionName: 'Test School', institutionLogo: null }),
  BrandingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Mock toast ───────────────────────────────────────────────────────────────
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─────────────────────────────────────────────────────────────────────────────

import { GameNavbar } from '@/components/game-navbar';
import ProfilePage from '@/app/profile/page';

// ─────────────────────────────────────────────────────────────────────────────

describe('Logout – Finalizar Misión (GameNavbar)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls signOut and redirects to /auth/login on success', async () => {
    mockSignOut.mockResolvedValueOnce(undefined);

    render(<GameNavbar />);

    // Open the dropdown by clicking the avatar button
    const avatarButton = screen.getByRole('button', { name: /H/i });
    await userEvent.click(avatarButton);

    const finalizarBtn = await screen.findByText(/Finalizar Misión/i);
    await userEvent.click(finalizarBtn);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });

  it('still redirects to /auth/login even when signOut throws an error', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('Network error'));

    render(<GameNavbar />);

    const avatarButton = screen.getByRole('button', { name: /H/i });
    await userEvent.click(avatarButton);

    const finalizarBtn = await screen.findByText(/Finalizar Misión/i);
    await userEvent.click(finalizarBtn);

    await waitFor(() => {
      // signOut was attempted
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      // navigation still happens despite the error
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });
});

describe('Logout – Salir (ProfilePage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls signOut and redirects to /auth/login on success', async () => {
    mockSignOut.mockResolvedValueOnce(undefined);

    render(<ProfilePage />);

    const salirButton = screen.getByRole('button', { name: /Salir/i });
    await userEvent.click(salirButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });

  it('still redirects even when signOut throws an error', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('Network error'));

    render(<ProfilePage />);

    const salirButton = screen.getByRole('button', { name: /Salir/i });
    await userEvent.click(salirButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });
});
