/**
 * @jest-environment node
 *
 * @file Unit tests for initializeFirebase()
 *
 * Scenarios:
 * 1. On a Vercel / non-App-Hosting environment (no __FIREBASE_DEFAULTS__):
 *    - calls initializeApp(firebaseConfig), never the no-args variant
 *    - does not throw app/no-options
 *    - returns non-null firestore, auth, and firebaseApp
 * 2. When Firebase App Hosting defaults ARE present:
 *    - calls no-args initializeApp()
 * 3. Already-initialized app (getApps() non-empty):
 *    - calls getApp() and does not call initializeApp() again
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInitializeApp = jest.fn();
const mockGetApps = jest.fn();
const mockGetApp = jest.fn();

jest.mock('firebase/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
  getApp: () => mockGetApp(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ name: 'mock-auth' })),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({ name: 'mock-firestore' })),
}));

const TEST_CONFIG = {
  apiKey: 'test-api-key',
  authDomain: 'test.firebaseapp.com',
  projectId: 'test-project',
  storageBucket: 'test.appspot.com',
  appId: 'test-app-id',
  messagingSenderId: '123456',
};

jest.mock('@/firebase/config', () => ({
  firebaseConfig: TEST_CONFIG,
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { initializeFirebase } from '@/firebase/index';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('initializeFirebase – Vercel (no App Hosting defaults)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
    const mockApp = { name: '[DEFAULT]' };
    mockInitializeApp.mockReturnValue(mockApp);
    mockGetApp.mockReturnValue(mockApp);
    // Ensure __FIREBASE_DEFAULTS__ is NOT present (simulates Vercel)
    delete (globalThis as Record<string, unknown>)['__FIREBASE_DEFAULTS__'];
  });

  it('initializes with explicit firebaseConfig – never with no-arg variant', () => {
    initializeFirebase();

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockInitializeApp).toHaveBeenCalledWith(TEST_CONFIG);
  });

  it('does not throw app/no-options', () => {
    expect(() => initializeFirebase()).not.toThrow();
  });

  it('never calls the no-args initializeApp()', () => {
    initializeFirebase();

    const noArgCalls = mockInitializeApp.mock.calls.filter((c) => c.length === 0);
    expect(noArgCalls).toHaveLength(0);
  });

  it('returns non-null firestore, auth, and firebaseApp', () => {
    const result = initializeFirebase();

    expect(result.firebaseApp).toBeTruthy();
    expect(result.auth).toBeTruthy();
    expect(result.firestore).toBeTruthy();
  });
});

describe('initializeFirebase – Firebase App Hosting (__FIREBASE_DEFAULTS__ present)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
    const mockApp = { name: '[DEFAULT]' };
    mockInitializeApp.mockReturnValue(mockApp);
    // Inject the App Hosting signal
    (globalThis as Record<string, unknown>)['__FIREBASE_DEFAULTS__'] = { config: {} };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__FIREBASE_DEFAULTS__'];
  });

  it('calls no-args initializeApp() on App Hosting', () => {
    initializeFirebase();

    const noArgCalls = mockInitializeApp.mock.calls.filter((c) => c.length === 0);
    expect(noArgCalls).toHaveLength(1);
  });
});

describe('initializeFirebase – already initialized app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const mockApp = { name: '[DEFAULT]' };
    // Simulate an already-initialized app
    mockGetApps.mockReturnValue([mockApp]);
    mockGetApp.mockReturnValue(mockApp);
    delete (globalThis as Record<string, unknown>)['__FIREBASE_DEFAULTS__'];
  });

  it('does not call initializeApp() again', () => {
    initializeFirebase();

    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('returns SDKs from the existing app via getApp()', () => {
    const result = initializeFirebase();

    expect(mockGetApp).toHaveBeenCalledTimes(1);
    expect(result.firebaseApp).toBeTruthy();
  });
});
