/**
 * Firebase Remote Config — API URL Manager
 *
 * URL priority at runtime:
 *   1. Firebase Remote Config (musicApiUrl / appApiUrl) — update in console, no rebuild
 *   2. EXPO_PUBLIC_MUSIC_API_URL env var (optional local dev override)
 *   3. Built-in default (app's own Vercel API — always works)
 *
 * To change the API URL without rebuilding:
 *   Firebase Console → Remote Config → musicApiUrl → Publish changes
 */

import {
  getRemoteConfig,
  fetchAndActivate,
  getValue,
  isSupported,
} from "firebase/remote-config";
import app from "./firebase";
import { logger } from "./logger";

// Cache TTL: 30 min in production, 0 in __DEV__ (instant refresh during dev)
const FETCH_INTERVAL_SECONDS = __DEV__ ? 0 : 1800;

// Built-in default — always resolves immediately so home content loads with zero delay.
// Overridden by Firebase Remote Config at runtime (change URL without rebuilding).
const BUILT_IN_DEFAULT_API_URL = "https://mavrixfy-song-api.vercel.app";

// In-memory resolved URLs — initialized synchronously so first API call is instant
let resolvedMusicApiUrl: string =
  process.env.EXPO_PUBLIC_MUSIC_API_URL?.trim() || BUILT_IN_DEFAULT_API_URL;
let resolvedAppApiUrl: string =
  process.env.EXPO_PUBLIC_APP_API_URL?.trim() || resolvedMusicApiUrl;
let initialized = false;

/**
 * Call once at app startup. Fetches Remote Config and updates the resolved URLs.
 * Non-blocking — the default URL above is used immediately while this runs in background.
 */
export async function initRemoteConfig(): Promise<void> {
  if (initialized) return;

  try {
    // isSupported() times out quickly on native (web SDK returns false)
    const supported = await Promise.race([
      isSupported(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);

    if (!supported) {
      logger.info("[RemoteConfig] Not supported on this platform — using default URL.");
      initialized = true;
      return;
    }

    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = FETCH_INTERVAL_SECONDS * 1000;

    // Fetch + activate (5s timeout)
    await Promise.race([
      fetchAndActivate(remoteConfig),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Remote Config fetch timeout")), 5000)
      ),
    ]);

    const musicUrl = getValue(remoteConfig, "musicApiUrl").asString().trim();
    const appUrl = getValue(remoteConfig, "appApiUrl").asString().trim();

    if (musicUrl) {
      resolvedMusicApiUrl = musicUrl;
      logger.info(`[RemoteConfig] musicApiUrl → ${musicUrl}`);
    }
    if (appUrl) {
      resolvedAppApiUrl = appUrl;
      logger.info(`[RemoteConfig] appApiUrl → ${appUrl}`);
    }
  } catch (error) {
    logger.warn("[RemoteConfig] Fetch failed, using default:", error);
  } finally {
    initialized = true;
  }
}

/**
 * Returns the resolved music API base URL.
 * Available immediately (no await needed) — Remote Config overrides on next launch.
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
