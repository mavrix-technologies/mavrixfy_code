const API_CONFIG = {
  songBaseUrl: "https://mavrixfy-song-api.vercel.app",
} as const;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export const SONG_API_BASE_URL = normalizeBaseUrl(API_CONFIG.songBaseUrl);

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
