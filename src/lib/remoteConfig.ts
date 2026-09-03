/**
 * Remote API URL Manager
 *
 * Supports live dynamic remote URL changes WITHOUT pushing app updates:
 *   1. Firestore `appConfig/apiEndpoints` (live onSnapshot & getDoc — 100% Android, iOS, and Web compatible)
 *   2. Cached in AsyncStorage for instant (0ms) app startup
 *   3. Firebase Remote Config (for web platforms where supported)
 *   4. Environment variables (EXPO_PUBLIC_MUSIC_API_URL / EXPO_PUBLIC_APP_API_URL)
 *   5. Built-in default (https://saavn.sumit.co)
 *
 * To change the API URL without rebuilding the app:
 *   Firebase Console → Firestore Database → appConfig → apiEndpoints
 *   Fields:
 *     - musicApiUrl: "https://..."
 *     - appApiUrl:   "https://..."
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  getRemoteConfig,
  fetchAndActivate,
  getValue,
  isSupported,
} from "firebase/remote-config";
import app, { db } from "./firebase";
import { logger } from "./logger";

const ASYNC_STORAGE_KEY = "@mavrixfy_remote_api_urls";
const BUILT_IN_DEFAULT_API_URL = "https://saavn.sumit.co";

let resolvedMusicApiUrl: string =
  process.env.EXPO_PUBLIC_MUSIC_API_URL?.trim() || BUILT_IN_DEFAULT_API_URL;
let resolvedAppApiUrl: string =
  process.env.EXPO_PUBLIC_APP_API_URL?.trim() || resolvedMusicApiUrl;
let initialized = false;

// Hydrate cached URLs immediately from AsyncStorage on module load
void AsyncStorage.getItem(ASYNC_STORAGE_KEY)
  .then((raw) => {
    if (raw) {
      try {
        const cached = JSON.parse(raw);
        if (cached.musicApiUrl && typeof cached.musicApiUrl === "string") {
          resolvedMusicApiUrl = cached.musicApiUrl.trim();
        }
        if (cached.appApiUrl && typeof cached.appApiUrl === "string") {
          resolvedAppApiUrl = cached.appApiUrl.trim();
        }
      } catch {}
    }
  })
  .catch(() => {});

function persistUrls(musicUrl: string, appUrl: string): void {
  AsyncStorage.setItem(
    ASYNC_STORAGE_KEY,
    JSON.stringify({ musicApiUrl: musicUrl, appApiUrl: appUrl })
  ).catch(() => {});
}

/**
 * Call once at app startup.
 * Sets up live real-time sync with Firestore `appConfig/apiEndpoints`
 * and falls back to Web Remote Config if available.
 */
export async function initRemoteConfig(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // 1. Primary remote sync: Firestore `appConfig/apiEndpoints` (works 100% on Native Android, iOS & Web)
  try {
    const configDocRef = doc(db, "appConfig", "apiEndpoints");

    // Real-time live updates: any change in Firebase Console updates the running app immediately
    onSnapshot(
      configDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const musicUrl = String(data.musicApiUrl || data.music_api_url || "").trim();
          const appUrl = String(data.appApiUrl || data.app_api_url || "").trim();

          let changed = false;
          if (musicUrl && musicUrl !== resolvedMusicApiUrl) {
            resolvedMusicApiUrl = musicUrl;
            changed = true;
            logger.info(`[RemoteConfig Live] musicApiUrl → ${musicUrl}`);
          }
          if (appUrl && appUrl !== resolvedAppApiUrl) {
            resolvedAppApiUrl = appUrl;
            changed = true;
            logger.info(`[RemoteConfig Live] appApiUrl → ${appUrl}`);
          }
          if (changed) {
            persistUrls(resolvedMusicApiUrl, resolvedAppApiUrl);
          }
        }
      },
      (error) => {
        logger.warn("[RemoteConfig] Firestore snapshot listener warning:", error.message);
      }
    );

    // Initial fetch for immediate resolution if onSnapshot has any latency
    const initialSnap = await Promise.race([
      getDoc(configDocRef),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (initialSnap && initialSnap.exists()) {
      const data = initialSnap.data();
      const musicUrl = String(data.musicApiUrl || data.music_api_url || "").trim();
      const appUrl = String(data.appApiUrl || data.app_api_url || "").trim();
      if (musicUrl) resolvedMusicApiUrl = musicUrl;
      if (appUrl) resolvedAppApiUrl = appUrl;
      persistUrls(resolvedMusicApiUrl, resolvedAppApiUrl);
    }
  } catch (error) {
    logger.warn("[RemoteConfig] Firestore remote config error:", error);
  }

  // 2. Secondary fallback: Web Firebase Remote Config (if running in web browser)
  try {
    const supported = await Promise.race([
      isSupported(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)),
    ]);

    if (supported) {
      const remoteConfig = getRemoteConfig(app);
      remoteConfig.settings.minimumFetchIntervalMillis = __DEV__ ? 0 : 1800 * 1000;
      await Promise.race([
        fetchAndActivate(remoteConfig),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000)
        ),
      ]);
      const musicUrl = getValue(remoteConfig, "musicApiUrl").asString().trim();
      const appUrl = getValue(remoteConfig, "appApiUrl").asString().trim();
      if (musicUrl) resolvedMusicApiUrl = musicUrl;
      if (appUrl) resolvedAppApiUrl = appUrl;
      persistUrls(resolvedMusicApiUrl, resolvedAppApiUrl);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Returns the resolved music API base URL.
 * Available synchronously with zero delay.
 */
export function getRemoteConfigMusicApiUrl(): string {
  return resolvedMusicApiUrl;
}

/**
 * Returns the resolved app API base URL.
 */
export function getRemoteConfigAppApiUrl(): string {
  return resolvedAppApiUrl;
}
