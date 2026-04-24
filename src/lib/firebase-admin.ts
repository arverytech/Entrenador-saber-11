import * as admin from 'firebase-admin';

/**
 * Lazily initializes and returns the Firebase Admin App.
 *
 * Reads credentials from the FIREBASE_SERVICE_ACCOUNT_JSON environment variable,
 * which should contain the full JSON of a Firebase service account key.
 *
 * Usage in Vercel: set FIREBASE_SERVICE_ACCOUNT_JSON to the raw JSON content
 * of the service account file downloaded from the Firebase console.
 */
function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
        'Download a service account key from the Firebase console and set it as a Vercel environment variable.'
    );
  }

  let credential: admin.credential.Credential;
  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    credential = admin.credential.cert(serviceAccount);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON contains invalid JSON.');
  }

  return admin.initializeApp({ credential });
}

/** Returns the Admin Firestore instance. */
export function getAdminFirestore(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

/**
 * Returns the default Admin Storage bucket.
 *
 * Reads the bucket name from FIREBASE_STORAGE_BUCKET env var first,
 * then falls back to NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET (public config).
 * If neither is set, the Admin SDK will use the default bucket derived
 * from the service account project.
 */
export function getAdminStorage() {
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  return getAdminApp().storage().bucket(bucketName);
}
