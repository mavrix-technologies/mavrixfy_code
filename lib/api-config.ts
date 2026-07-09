import { logger } from "@/lib/logger";

const API_CONFIG = {
  songBaseUrl: "https://mavrixfy-api-drab.vercel.app",
  appBaseUrl: "https://mavrixfy-api-drab.vercel.app",
} as const;


function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
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
  return `${SONG_API_BASE_URL}/`;
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
