/**
 * Firebase Remote Config — Official Client API Manager
 *
 * Connects directly to the official Firebase Remote Config client endpoint:
 *   POST https://firebaseremoteconfig.googleapis.com/v1/projects/${projectId}/namespaces/firebase:fetch?key=${apiKey}
 *
 * This allows updating musicApiUrl / appApiUrl dynamically from Firebase Console:
 *   Firebase Console → Remote Config → musicApiUrl / appApiUrl → Publish changes
 *
 * Features:
 *   - Instant synchronous access (no blocking or waiting for network)
 *   - Persistent AsyncStorage caching across app launches
 *   - Automatic background fetch & activation at startup
 *   - Fallback to .env / built-in default if offline
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeApiUrl } from "./apiUrlPolicy";
import { firebaseConfig } from "./firebase";
import { logger } from "./logger";

const STORAGE_KEY_MUSIC_API = "@remote_config_music_api_url";
const STORAGE_KEY_APP_API = "@remote_config_app_api_url";
const STORAGE_KEY_LAST_FETCH = "@remote_config_last_fetch_ts";

// Cache TTL: 0 in __DEV__ (instant fetch during development), 15 min in production
const FETCH_TTL_MS = __DEV__ ? 0 : 15 * 60 * 1000;

// Built-in default — always resolves immediately so home content loads with zero delay.
const BUILT_IN_DEFAULT_API_URL = "https://mavrixfy-song-api.vercel.app";

// In-memory resolved URLs — initialized synchronously so first API call is instant
let resolvedMusicApiUrl: string =
  normalizeApiUrl(process.env.EXPO_PUBLIC_MUSIC_API_URL) || BUILT_IN_DEFAULT_API_URL;
let resolvedAppApiUrl: string =
  normalizeApiUrl(process.env.EXPO_PUBLIC_APP_API_URL) || resolvedMusicApiUrl;

let isHydrated = false;
let isFetching = false;
let initialized = false;

// Listeners for runtime configuration changes
type RemoteConfigListener = (config: {
  musicApiUrl: string;
  appApiUrl: string;
}) => void;
const listeners = new Set<RemoteConfigListener>();

// Hydrate cached values from AsyncStorage as early as possible
void hydrateFromStorage();

async function hydrateFromStorage(): Promise<void> {
  if (isHydrated) return;
  try {
    const [cachedMusic, cachedApp] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_MUSIC_API),
      AsyncStorage.getItem(STORAGE_KEY_APP_API),
    ]);

    if (cachedMusic?.trim()) {
      resolvedMusicApiUrl = normalizeUrl(cachedMusic.trim());
    }
    if (cachedApp?.trim()) {
      resolvedAppApiUrl = normalizeUrl(cachedApp.trim());
    }
    isHydrated = true;
  } catch {
    isHydrated = true;
  }
}

function normalizeUrl(url: string): string {
  return normalizeApiUrl(url) || BUILT_IN_DEFAULT_API_URL;
}

function notifyListeners(): void {
  const payload = {
    musicApiUrl: resolvedMusicApiUrl,
    appApiUrl: resolvedAppApiUrl,
  };
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (e) {
      logger.warn("[RemoteConfig] Listener error:", e);
    }
  });
}

/**
 * Perform the official Firebase Remote Config client fetch.
 */
async function performFetch(): Promise<boolean> {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || firebaseConfig?.projectId || "spotify-8fefc";
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || firebaseConfig?.apiKey;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID || firebaseConfig?.appId || "1:816396705670:web:005e724df7139772521607";

  if (!projectId || !apiKey) {
    logger.warn("[RemoteConfig] Missing Firebase projectId or apiKey, cannot fetch Remote Config.");
    return false;
  }

  const endpoint = `https://firebaseremoteconfig.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/namespaces/firebase:fetch?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId: appId || "1:816396705670:web:005e724df7139772521607",
        appInstanceId: "PROD",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`[RemoteConfig] Fetch returned status ${response.status}`);
      return false;
    }

    const data = (await response.json()) as {
      entries?: Record<string, string>;
      state?: string;
      templateVersion?: string;
    };

    if (data.entries) {
      const musicUrl =
        data.entries.musicApiUrl ||
        data.entries.music_api_url ||
        data.entries.serverUrl ||
        data.entries.server_url ||
        data.entries.apiUrl;

      const appUrl =
        data.entries.appApiUrl ||
        data.entries.app_api_url ||
        musicUrl;

      let changed = false;

      if (musicUrl?.trim()) {
        const normalizedMusic = normalizeUrl(musicUrl);
        if (normalizedMusic !== resolvedMusicApiUrl) {
          resolvedMusicApiUrl = normalizedMusic;
          changed = true;
        }
        void AsyncStorage.setItem(STORAGE_KEY_MUSIC_API, normalizedMusic);
      }

      if (appUrl?.trim()) {
        const normalizedApp = normalizeUrl(appUrl);
        if (normalizedApp !== resolvedAppApiUrl) {
          resolvedAppApiUrl = normalizedApp;
          changed = true;
        }
        void AsyncStorage.setItem(STORAGE_KEY_APP_API, normalizedApp);
      }

      void AsyncStorage.setItem(STORAGE_KEY_LAST_FETCH, Date.now().toString());

      if (changed) {
        notifyListeners();
      }

      return true;
    }

    return false;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      logger.warn("[RemoteConfig] Fetch timed out (6s)");
    } else {
      logger.warn("[RemoteConfig] Fetch error:", err);
    }
    return false;
  }
}

/**
 * Call once at app startup. Non-blocking — default/cached URL is used immediately
 * while Remote Config fetches in background and updates storage & memory.
 */
export async function initRemoteConfig(force = false): Promise<void> {
  if (initialized && !force) return;
  initialized = true;

  await hydrateFromStorage();

  // Check TTL unless forced or in DEV
  if (!force && FETCH_TTL_MS > 0) {
    try {
      const lastFetchStr = await AsyncStorage.getItem(STORAGE_KEY_LAST_FETCH);
      if (lastFetchStr) {
        const elapsed = Date.now() - parseInt(lastFetchStr, 10);
        if (elapsed < FETCH_TTL_MS) {
          return;
        }
      }
    } catch {
      // ignore
    }
  }

  if (isFetching) return;
  isFetching = true;

  try {
    await performFetch();
  } finally {
    isFetching = false;
  }
}

/**
 * Force fetch immediately (bypasses TTL). Useful for settings or admin refresh.
 */
export async function fetchRemoteConfigNow(): Promise<boolean> {
  return await performFetch();
}

/**
 * Returns the resolved music API base URL synchronously.
 */
export function getRemoteConfigMusicApiUrl(): string {
  return resolvedMusicApiUrl;
}

/**
 * Returns the resolved app API base URL synchronously.
 */
export function getRemoteConfigAppApiUrl(): string {
  return resolvedAppApiUrl;
}

/**
 * Subscribe to Remote Config updates.
 */
export function addRemoteConfigListener(listener: RemoteConfigListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
