import { getYouTubeMusicApiUrlForPlatform } from "./youtube-music-config";

const API_CONFIG = {
  songBaseUrl: "https://mavrixfy-song-api.vercel.app",
  appBaseUrl: "https://mavrixfy-song-api.vercel.app",
} as const;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const SONG_API_BASE_URL = normalizeBaseUrl(API_CONFIG.songBaseUrl);
const APP_API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_APP_API_URL || API_CONFIG.appBaseUrl);

function getYouTubeMusicBaseUrl(): string {
  const url = getYouTubeMusicApiUrlForPlatform();
  return normalizeBaseUrl(url);
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
