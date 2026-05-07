import { initializeApp, getApps } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getExpoExtra } from "./expoExtra";

const { getReactNativePersistence } = require("firebase/auth") as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
};

const expoExtra = getExpoExtra();

const firebaseConfig = {
  apiKey:            (expoExtra.firebaseApiKey            as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        (expoExtra.firebaseAuthDomain        as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         (expoExtra.firebaseProjectId         as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     (expoExtra.firebaseStorageBucket     as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: (expoExtra.firebaseMessagingSenderId as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             (expoExtra.firebaseAppId             as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId:     (expoExtra.firebaseMeasurementId     as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Reuse existing app instance if already initialized (handles fast-refresh / module reloads)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// initializeAuth throws if called a second time on the same app instance.
// getAuth() returns the existing instance safely.
export const auth = (() => {
  if (Platform.OS === "web") return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage) as never,
    });
  } catch {
    // Already initialized — return the existing instance
    return getAuth(app);
  }
})();

export const db      = getFirestore(app);
export const storage = getStorage(app);

export default app;
