import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth instance
export const auth = getAuth(app);

// Firestore instance, with offline persistence enabled.
//
// persistentLocalCache caches reads/writes in IndexedDB so the app keeps
// working (viewing already-loaded data, queuing new dispenses/patients/etc.)
// when the connection drops — Firestore automatically syncs any queued
// writes once connectivity returns.
//
// persistentMultipleTabManager lets the cache be shared safely if the user
// has the app open in more than one browser tab at once, instead of only
// the first tab getting offline support.
//
// initializeFirestore must be the FIRST call that touches Firestore for
// this app instance — never call getFirestore(app) elsewhere, or this
// persistent cache configuration will be silently ignored.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export default app;