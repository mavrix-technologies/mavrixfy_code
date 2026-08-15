import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { logger } from "@/lib/logger";

// All API URLs are configured via .env (EXPO_PUBLIC_MUSIC_API_URL / EXPO_PUBLIC_APP_API_URL).
// Do NOT hardcode URLs here — change them in .env only.

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
  toUrlFromDomain(Constants.expoConfig?.extra?.musicApiDomain as string | undefined) || ""
);
const APP_API_BASE_URL = getConfiguredApiBaseUrl(
  "App API",
  process.env.EXPO_PUBLIC_APP_API_URL ||
    process.env.EXPO_PUBLIC_MUSIC_API_URL,
  toUrlFromDomain(Constants.expoConfig?.extra?.musicApiDomain as string | undefined) || ""
);

if (__DEV__) {
  logger.info(`[Music API Config] Active local API URL: ${SONG_API_BASE_URL}`);
}

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
  // Dynamic priority: Firebase Remote Config > EXPO_PUBLIC_MUSIC_API_URL > empty
  try {
    // Lazy import to avoid circular dep at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRemoteConfigMusicApiUrl } = require("./remoteConfig") as {
      getRemoteConfigMusicApiUrl: () => string;
    };
    const remoteUrl = getRemoteConfigMusicApiUrl().trim();
    if (remoteUrl) return remoteUrl;
  } catch {
    // remoteConfig not yet initialized — fall through to env
  }
  return SONG_API_BASE_URL;
}

export function getApiUrl(): string {
  return getMusicApiUrl();
}

export function buildAppApiUrl(path: string): string {
  let baseUrl = APP_API_BASE_URL;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRemoteConfigAppApiUrl } = require("./remoteConfig") as {
      getRemoteConfigAppApiUrl: () => string;
    };
    const remoteUrl = getRemoteConfigAppApiUrl().trim();
    if (remoteUrl) baseUrl = remoteUrl;
  } catch {
    // Fall back to env
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath.startsWith("/api/") ? normalizedPath : `/api${normalizedPath}`}`;
}
