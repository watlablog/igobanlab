import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const rawConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined
};

export const isFirebaseConfigured =
  Boolean(rawConfig.apiKey) &&
  Boolean(rawConfig.authDomain) &&
  Boolean(rawConfig.projectId) &&
  Boolean(rawConfig.appId);

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

const ensureConfigured = (): void => {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase env is not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID."
    );
  }
};

export const getFirebaseApp = (): FirebaseApp => {
  ensureConfigured();

  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(rawConfig);
  }

  return cachedApp;
};

export const getFirebaseAuth = (): Auth => {
  if (!cachedAuth) {
    cachedAuth = getAuth(getFirebaseApp());
  }
  return cachedAuth;
};

export const getFirebaseDb = (): Firestore => {
  if (!cachedDb) {
    cachedDb = getFirestore(getFirebaseApp());
  }
  return cachedDb;
};
