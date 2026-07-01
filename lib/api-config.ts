import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { logger } from "@/lib/logger";

const API_CONFIG = {
  songBaseUrl: "https://mavrixfy-song-api.vercel.app",
  appBaseUrl: "https://mavrixfy-song-api.vercel.app",
} as const;

export const PRODUCTION_YOUTUBE_MUSIC_API_URL = "https://mavrixfy-api-drab.vercel.app/api/youtube-music";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const SONG_API_BASE_URL = normalizeBaseUrl(API_CONFIG.songBaseUrl);
const APP_API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_APP_API_URL || API_CONFIG.appBaseUrl);

function isHostOnlyDevelopmentUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "10.0.2.2";
  } catch {
    return false;
  }
}

function getYouTubeMusicBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL?.trim();
  
  // ALWAYS use environment variable if set, no fallbacks
  if (envUrl) {
    // Only warn on physical devices using localhost/127.0.0.1
    if (__DEV__ && Platform.OS !== "web" && Device.isDevice && isHostOnlyDevelopmentUrl(envUrl)) {
      logger.warn(
        "[YouTube Music Config] Using localhost URL on a physical device. This may not work. Consider using your LAN IP or the production proxy."
      );
    }
    return normalizeBaseUrl(envUrl);
  }

  // No environment variable set - use production as last resort
  logger.warn(
    "[YouTube Music Config] No EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL set. Using production YouTube Music proxy."
  );
  return normalizeBaseUrl(PRODUCTION_YOUTUBE_MUSIC_API_URL);
}

export function getMusicApiUrl(): string {
  return `${SONG_API_BASE_URL}/`;
}

export function getYouTubeMusicApiUrl(): string {
  return `${getYouTubeMusicBaseUrl()}/`;
}

export function getApiUrl(): string {
  return getMusicApiUrl();
}

function buildMusicApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SONG_API_BASE_URL}${normalizedPath}`;
}

export function buildAppApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_API_BASE_URL}${normalizedPath.startsWith("/api/") ? normalizedPath : `/api${normalizedPath}`}`;
}
