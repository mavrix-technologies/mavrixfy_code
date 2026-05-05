import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
// @ts-ignore - Firebase v12 typings sometimes miss this export depending on tsconfig resolution
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getExpoExtra } from "./expoExtra";

const expoExtra = getExpoExtra();

// Get config from the resolved Expo manifest, or fall back to env vars in dev.
const firebaseConfig = {
  apiKey: (expoExtra.firebaseApiKey as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: (expoExtra.firebaseAuthDomain as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: (expoExtra.firebaseProjectId as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: (expoExtra.firebaseStorageBucket as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    (expoExtra.firebaseMessagingSenderId as string | undefined) ||
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: (expoExtra.firebaseAppId as string | undefined) || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId:
    (expoExtra.firebaseMeasurementId as string | undefined) ||
    process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate Firebase config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Silent fail - Firebase will handle gracefully
}

const app = initializeApp(firebaseConfig);

export const auth = Platform.OS === "web"
  ? getAuth(app)
  : initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });

export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Analytics (only supported on web)
let analytics: ReturnType<typeof getAnalytics> | null = null;
if (Platform.OS === "web") {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    // Silent fail
  }
}

export { analytics };
export default app;
