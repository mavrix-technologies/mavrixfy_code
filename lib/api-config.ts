const API_CONFIG = {
  backendBaseUrl: "https://spotify-api-drab.vercel.app",
  songBaseUrl: "https://mavrixfy-song-api.vercel.app",
} as const;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export const BACKEND_API_BASE_URL = normalizeBaseUrl(API_CONFIG.backendBaseUrl);
export const SONG_API_BASE_URL = normalizeBaseUrl(API_CONFIG.songBaseUrl);

export function getAuthApiUrl(): string {
  return `${BACKEND_API_BASE_URL}/`;
}

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

export function buildAuthApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_API_BASE_URL}${normalizedPath}`;
}
