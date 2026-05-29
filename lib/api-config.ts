const API_CONFIG = {
  songBaseUrl: "https://mavrixfy-song-api.vercel.app",
  appBaseUrl: "https://mavrixfy-song-api.vercel.app",
} as const;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export const SONG_API_BASE_URL = normalizeBaseUrl(API_CONFIG.songBaseUrl);
export const APP_API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_APP_API_URL || API_CONFIG.appBaseUrl);

export function getMusicApiUrl(): string {
  return `${SONG_API_BASE_URL}/`;
}

export function getApiUrl(): string {
  return getMusicApiUrl();
}

export function buildMusicApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SONG_API_BASE_URL}${normalizedPath}`;
}

export function buildAppApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_API_BASE_URL}${normalizedPath.startsWith("/api/") ? normalizedPath : `/api${normalizedPath}`}`;
}
