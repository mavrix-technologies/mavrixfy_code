import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { logger } from "@/lib/logger";

// Music catalogue is served directly by the dedicated song API.
const API_CONFIG = {
  songBaseUrl: __DEV__ ? "http://localhost:3000" : "https://mavrixfy-song-api.vercel.app",
  appBaseUrl: __DEV__ ? "http://localhost:3000" : "https://mavrixfy-song-api.vercel.app",
} as const;

function getExpoHostIp(): string | undefined {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.developer?.manifest?.debuggerHost;
  if (!hostUri) return undefined;
  const ip = hostUri.split(":")[0];
  return ip && ip !== "localhost" && ip !== "127.0.0.1" ? ip : undefined;
}

function normalizeBaseUrl(value: string): string {
  let url = value.replace(/\/+$/, "");
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    const expoIp = getExpoHostIp();
    if (expoIp) {
      url = url.replace(/localhost|127\.0\.0\.1/, expoIp);
    } else if (Platform.OS === "android") {
      url = url.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
    }
  }
  return url;
}

function toUrlFromDomain(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  let protocol = "https";

  try {
    const host = new URL(`http://${trimmed}`).hostname;
    protocol = isPrivateHost(host) ? "http" : "https";
  } catch {
    protocol = "https";
  }

  return `${protocol}://${trimmed}`;
}

function getConfiguredApiBaseUrl(label: string, configuredUrl: string | undefined, fallbackUrl: string): string {
  const normalizedFallback = normalizeBaseUrl(fallbackUrl);
  const trimmedUrl = configuredUrl?.trim();

  if (!trimmedUrl) {
    return normalizedFallback;
  }

  const normalizedUrl = normalizeBaseUrl(trimmedUrl);

  if (!__DEV__ && isPrivateDevelopmentApiUrl(normalizedUrl)) {
    logger.warn(`[${label} Config] Ignoring private development API URL in release build. Using production API.`);
    return normalizedFallback;
  }

  return normalizedUrl;
}

const SONG_API_BASE_URL = getConfiguredApiBaseUrl(
  "Music API",
  process.env.EXPO_PUBLIC_MUSIC_API_URL ||
    process.env.EXPO_PUBLIC_APP_API_URL ||
    toUrlFromDomain(process.env.EXPO_PUBLIC_MUSIC_API_DOMAIN),
  API_CONFIG.songBaseUrl
);
const APP_API_BASE_URL = getConfiguredApiBaseUrl(
  "App API",
  process.env.EXPO_PUBLIC_APP_API_URL,
  API_CONFIG.appBaseUrl
);



function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "10.0.2.2" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function isPrivateDevelopmentApiUrl(value: string): boolean {
  try {
    return isPrivateHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function getMusicApiUrl(): string {
  return SONG_API_BASE_URL;
}

export function getApiUrl(): string {
  return getMusicApiUrl();
}

export const PRODUCTION_YOUTUBE_MUSIC_API_URL = "https://mavrixfy-api-drab.vercel.app/api/youtube-music";

function getYouTubeMusicBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL?.trim();
  const extraUrl = Constants.expoConfig?.extra?.youtubeMusicApiUrl?.trim();
  const fallbackUrl = extraUrl || PRODUCTION_YOUTUBE_MUSIC_API_URL;

  if (__DEV__ && envUrl && Platform.OS !== "web" && Device.isDevice && isPrivateDevelopmentApiUrl(envUrl)) {
    logger.warn(
      "[YouTube Music Config] Ignoring host-only development URL on a physical device. Use a LAN IP or the production proxy."
    );
    return normalizeBaseUrl(fallbackUrl);
  }

  if (envUrl) return normalizeBaseUrl(envUrl);
  if (extraUrl) return normalizeBaseUrl(extraUrl);

  logger.warn(
    "[YouTube Music Config] Using production YouTube Music proxy. Set EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL for a different backend."
  );
  return normalizeBaseUrl(PRODUCTION_YOUTUBE_MUSIC_API_URL);
}

export function getYouTubeMusicApiUrl(): string {
  return getYouTubeMusicBaseUrl();
}

export function buildMusicApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SONG_API_BASE_URL}${normalizedPath}`;
}

export function buildAppApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_API_BASE_URL}${normalizedPath.startsWith("/api/") ? normalizedPath : `/api${normalizedPath}`}`;
}
