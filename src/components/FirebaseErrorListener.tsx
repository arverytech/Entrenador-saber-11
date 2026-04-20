'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * Logs errors to the console without crashing the app tree (avoids white-screen on logout).
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      // Log for observability without crashing the component tree.
      // Throwing here caused a white screen on logout because Firestore snapshot
      // listeners briefly fire permission-denied errors during the auth-to-guest transition.
      console.error('[Firestore permission error]', error.message);
    };

    errorEmitter.on('permission-error', handleError);
    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  return null;
}
