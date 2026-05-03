'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Returns true when Firebase App Hosting has injected its runtime defaults
 * into the global scope (`__FIREBASE_DEFAULTS__`).  This only happens when
 * the app is actually served by Firebase App Hosting, *not* on Vercel.
 */
function isFirebaseAppHosting(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    '__FIREBASE_DEFAULTS__' in globalThis
  );
}

/**
 * Warns in the console when required NEXT_PUBLIC_FIREBASE_* environment
 * variables are absent.  Does NOT log any secret values.
 */
function warnIfEnvVarsMissing(): void {
  const required = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
  ] as const;

  // Next.js statically inlines NEXT_PUBLIC_* vars at build time; dynamic bracket
  // access (e.g. process.env[key]) is NOT substituted.  Each key must be referenced
  // literally so the bundler can replace it with the actual value.
  const missing = required.filter((key) => {
    switch (key) {
      case 'NEXT_PUBLIC_FIREBASE_API_KEY':      return !process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      case 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN':  return !process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
      case 'NEXT_PUBLIC_FIREBASE_PROJECT_ID':   return !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      case 'NEXT_PUBLIC_FIREBASE_APP_ID':       return !process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
    }
  });
  if (missing.length > 0) {
    console.warn(
      '[Firebase] Some NEXT_PUBLIC_FIREBASE_* env vars are not set. ' +
        'The app will use built-in fallback values (may point to a dev project). ' +
        'Add these variables in your Vercel project settings: ' +
        missing.join(', ')
    );
  }
}

export function initializeFirebase() {
  if (!getApps().length) {
    let firebaseApp: FirebaseApp;

    if (isFirebaseAppHosting()) {
      // Firebase App Hosting injects __FIREBASE_DEFAULTS__ — use no-args init.
      try {
        firebaseApp = initializeApp();
      } catch (e) {
        console.warn(
          '[Firebase] App Hosting initialization failed. Falling back to firebaseConfig.',
          e
        );
        warnIfEnvVarsMissing();
        firebaseApp = initializeApp(firebaseConfig);
      }
    } else {
      // Not on Firebase App Hosting (e.g. Vercel, local dev).
      // Always initialize with the explicit firebaseConfig to avoid app/no-options.
      warnIfEnvVarsMissing();
      firebaseApp = initializeApp(firebaseConfig);
    }

    return getSdks(firebaseApp);
  }

  // Already initialized — return SDKs for the existing app.
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp)
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
