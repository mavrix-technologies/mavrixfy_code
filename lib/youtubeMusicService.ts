import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { JioSaavnImage, Song } from "@/lib/musicData";
import { getYouTubeMusicApiUrl, PRODUCTION_YOUTUBE_MUSIC_API_URL } from "@/lib/api-config";
import { compactMap, mapFilter, sortedCopy } from "@/lib/arrayUtils";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface YouTubeMusicTrack {
  videoId: string;
  title: string;
  artists: Array<{ name: string; id?: string }>;
  album?: { name: string; id?: string };
  duration?: number | string; // seconds or mm:ss from the youtubei.js backend
  duration_seconds?: number;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  videoType?: string;
  counterpart?: {
    videoId?: string;
    title?: string;
    length?: string;
    thumbnails?: Array<{ url: string; width: number; height: number }>;
    videoType?: string;
  } | null;
  isExplicit?: boolean;
  year?: string;
}

export interface YouTubeMusicPlaylist {
  browseId: string;
  title: string;
  description?: string;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  trackCount?: number;
  tracks?: YouTubeMusicTrack[];
}

export interface YouTubeMusicArtist {
  browseId: string;
  name: string;
  description?: string;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  subscribers?: string;
  tracks?: YouTubeMusicTrack[];
  albums?: YouTubeMusicAlbum[];
}

export interface YouTubeMusicAlbum {
  browseId: string;
  title: string;
  artists?: Array<{ name: string; id?: string }>;
  year?: string;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  trackCount?: number;
  tracks?: YouTubeMusicTrack[];
}

export interface YouTubeMusicSearchResult {
  category: "song" | "video" | "album" | "artist" | "playlist";
  resultType: string;
  data: YouTubeMusicTrack | YouTubeMusicAlbum | YouTubeMusicArtist | YouTubeMusicPlaylist;
}

export interface YouTubeMusicWatchPlaylist {
  tracks: YouTubeMusicTrack[];
  playlistId?: string | null;
}

export interface YouTubeMusicAudioStream {
  videoId: string;
  url: string;
  expiresAt: number;
  headers: Record<string, string>;
  mimeType?: string;
  formatId?: string;
  audioCodec?: string;
  bitrateKbps?: number | null;
  duration?: number | null;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

const YOUTUBE_MUSIC_CACHE_PREFIX = "@mavrixfy_youtube_music";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT_MS = 45000; // 45 seconds for production cold starts
const PRIVATE_DEVELOPMENT_REQUEST_TIMEOUT_MS = 15000;
const OPTIONAL_HOME_SECTION_TIMEOUT_MS = 4500;
const CURRENT_YEAR = new Date().getFullYear();
const OFFICIAL_VISUAL_SEARCH_CACHE_VERSION = "v1";
const YOUTUBE_VIDEO_SEARCH_CACHE_VERSION = "v2";

// Stream resolution is handled by the backend.

// ─── Cache Helpers ────────────────────────────────────────────────────────────

async function getCached<T>(key: string, ttl: number): Promise<T | null> {
  try {
    const [[, data], [, time]] = await AsyncStorage.multiGet([key, `${key}:time`]);
    if (!data || !time) return null;
    const timestamp = Number(time);
    if (!timestamp || Date.now() - timestamp > ttl) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    logger.warn('[YouTube Music Cache] Failed to get cached data:', error);
    return null;
  }
}

async function setCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [key, JSON.stringify(value)],
      [`${key}:time`, String(Date.now())],
    ]);
  } catch {}
}

// ─── Normalization Functions ──────────────────────────────────────────────────

export function upscaleYouTubeThumbnail(url: string, size = 500): string {
  if (!url) return "";
  const safeSize = Math.max(120, Math.min(Math.round(size) || 500, 1200));

  // 1. Googleusercontent / ggpht / yt3 images
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com") || url.includes("yt3.ggpht.com") || url.includes("yt3.googleusercontent.com")) {
    // Replace width/height parameters with a square size suitable for app artwork.
    if (/=w\d+-h\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i.test(url)) {
      return url.replace(/=w\d+-h\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i, `=w${safeSize}-h${safeSize}-l90-rj`);
    }
    if (/=s\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i.test(url)) {
      return url.replace(/=s\d+(?:-[a-zA-Z0-9-]+)?(?=$|[?#])/i, `=s${safeSize}-c-k-c0x00ffffff-no-rj`);
    }
  }

  // 2. Standard YouTube video thumbnails
  if (url.includes("i.ytimg.com/vi/") || url.includes("img.youtube.com/vi/")) {
    // Extract video ID from URL
    const match = url.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    if (match && match[1]) {
      const videoId = match[1];
      return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
  }
  return url;
}

function normalizeYouTubeThumbnails(thumbnails?: Array<{ url: string; width: number; height: number }>): JioSaavnImage[] {
  if (!thumbnails || thumbnails.length === 0) return [];

  return thumbnails.map((thumb) => ({
    quality: "500x500",
    url: upscaleYouTubeThumbnail(thumb.url),
  }));
}

function getBestThumbnailUrl(thumbnails?: Array<{ url: string; width: number; height: number }>): string {
  const best = getBestThumbnail(thumbnails);
  return best ? upscaleYouTubeThumbnail(best.url) : "";
}

function getBestThumbnail(thumbnails?: Array<{ url: string; width: number; height: number }>): { url: string; width: number; height: number } | null {
  if (!thumbnails || thumbnails.length === 0) return null;

  // Sort by resolution (largest first)
  const sorted = sortedCopy(thumbnails, (a, b) => {
    const aRes = a.width * a.height;
    const bRes = b.width * b.height;
    return bRes - aRes;
  });

  return sorted[0] || null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractVideoId(track: any): string {
  const candidates = [
    track?.videoId,
    track?.video_id,
    track?.youtubeId,
    track?.youtube_id,
    track?.id,
  ];

  for (const candidate of candidates) {
    const value = readString(candidate);
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
      return value;
    }
  }

  const watchUrl = readString(track?.url || track?.videoUrl || track?.watchUrl);
  const match = watchUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return match?.[1] || match?.[2] || "";
}

function normalizeArtists(raw: unknown): Array<{ name: string; id?: string }> {
  if (!Array.isArray(raw)) return [];

  return compactMap(raw, (artist: any) => {
    if (typeof artist === "string") {
      const name = artist.trim();
      return name ? { name } : null;
    }

    const name = readString(artist?.name || artist?.title);
    if (!name) return null;

    const id = readString(artist?.id || artist?.browseId || artist?.channelId);
    return id ? { name, id } : { name };
  });
}

function normalizeThumbnails(raw: unknown): Array<{ url: string; width: number; height: number }> {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.thumbnails)
      ? (raw as any).thumbnails
      : [];

  return compactMap(source, (thumb: any) => {
    const url = readString(thumb?.url || thumb?.link);
    if (!url) return null;

    return {
      url,
      width: Number(thumb?.width) || 0,
      height: Number(thumb?.height) || 0,
    };
  });
}

function normalizeCounterpart(raw: unknown): YouTubeMusicTrack["counterpart"] {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as any;
  const videoId = extractVideoId(source);
  if (!videoId) return null;

  return {
    videoId,
    title: readString(source?.title || source?.name) || undefined,
    length: readString(source?.length || source?.duration) || undefined,
    thumbnails: normalizeThumbnails(source?.thumbnails || source?.thumbnail || source?.image),
    videoType: readString(source?.videoType) || undefined,
  };
}

function normalizeTrackShape(track: any): YouTubeMusicTrack | null {
  const videoId = extractVideoId(track);
  const title = readString(track?.title || track?.name);
  if (!videoId || !title) return null;

  const album =
    typeof track?.album === "string"
      ? { name: track.album }
      : track?.album && typeof track.album === "object"
        ? {
          name: readString(track.album.name || track.album.title),
          id: readString(track.album.id || track.album.browseId) || undefined,
        }
        : undefined;

  return {
    ...track,
    videoId,
    title,
    artists: normalizeArtists(track?.artists || track?.artist),
    album: album?.name ? album : undefined,
    duration: track?.duration || track?.length,
    duration_seconds: Number(track?.duration_seconds || track?.durationSeconds || track?.lengthSeconds) || undefined,
    thumbnails: normalizeThumbnails(track?.thumbnails || track?.thumbnail || track?.image),
    videoType: readString(track?.videoType) || undefined,
    counterpart: normalizeCounterpart(track?.counterpart),
    isExplicit: Boolean(track?.isExplicit),
    year: readString(track?.year) || undefined,
  };
}

function parseDurationSeconds(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, raw);
  }

  if (typeof raw !== "string") return 0;
  const value = raw.trim();
  if (!value) return 0;

  if (value.includes(":")) {
    const parts = value.split(":").map(Number);
    if (parts.every((part) => Number.isFinite(part) && part >= 0)) {
      return parts.reduce((total, part) => total * 60 + part, 0);
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

const VISUAL_METADATA_WORDS = new Set([
  "4k",
  "album",
  "film",
  "full",
  "hd",
  "movie",
  "music",
  "official",
  "ost",
  "picture",
  "song",
  "soundtrack",
  "title",
  "track",
  "video",
]);

const VISUAL_BLOCKED_VERSION_TERMS = [
  "8d",
  "acoustic",
  "audio",
  "cover",
  "dj",
  "instrumental",
  "karaoke",
  "live",
  "lo fi",
  "lofi",
  "lyric",
  "lyrics",
  "lyrical",
  "mashup",
  "mix",
  "nightcore",
  "reaction",
  "recreate",
  "recreated",
  "recreation",
  "remake",
  "remix",
  "remixed",
  "reverb",
  "rmx",
  "slowed",
  "sped up",
  "status",
  "teaser",
  "trailer",
  "unplugged",
  "version",
  "visualizer",
];

const VISUAL_STOP_WORDS = new Set([
  "and",
  "feat",
  "featuring",
  "from",
  "ft",
  "the",
  "with",
  ...VISUAL_METADATA_WORDS,
]);

function normalizeComparableText(value: unknown): string {
  return readString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/gi, " and ")
    .replace(/&quot;|&#039;|&apos;|&nbsp;/gi, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesWholeTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeComparableText(term);
  if (!normalizedTerm) return false;
  const pattern = escapeRegExp(normalizedTerm).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${pattern}\\b`, "i").test(text);
}

function stripVisualMetadata(value: unknown): string {
  return normalizeComparableText(value)
    .split(" ")
    .filter((word) => word && !VISUAL_METADATA_WORDS.has(word))
    .join(" ")
    .trim();
}

function visualTokenSet(value: unknown): Set<string> {
  return new Set(
    stripVisualMetadata(value)
      .split(" ")
      .filter((word) => word.length > 1 && !VISUAL_STOP_WORDS.has(word))
  );
}

function countSharedVisualTokens(a: Set<string>, b: Set<string>): number {
  let count = 0;
  a.forEach((word) => {
    if (b.has(word)) count += 1;
  });
  return count;
}

function hasBlockedVisualVersion(title: unknown, seedTitle: unknown): boolean {
  const text = normalizeComparableText(title);
  const seedText = normalizeComparableText(seedTitle);
  return VISUAL_BLOCKED_VERSION_TERMS.some((term) => includesWholeTerm(text, term) && !includesWholeTerm(seedText, term));
}

function isOfficialMusicVideoType(value: unknown): boolean {
  const type = normalizeComparableText(value).replace(/\s+/g, "_");
  return type === "music_video_type_omv" || type.includes("official_music_video") || type.endsWith("_omv");
}

function getVisualTitleScore(seedTitle: unknown, candidateTitle: unknown): { score: number; strong: boolean } {
  const seed = stripVisualMetadata(seedTitle);
  const candidate = stripVisualMetadata(candidateTitle);
  if (!seed || !candidate) return { score: 0, strong: false };

  if (seed === candidate) return { score: 160, strong: true };
  if (candidate.includes(seed) || seed.includes(candidate)) return { score: 110, strong: true };

  const seedTokens = visualTokenSet(seed);
  const candidateTokens = visualTokenSet(candidate);
  const shared = countSharedVisualTokens(seedTokens, candidateTokens);
  const ratio = seedTokens.size > 0 ? shared / seedTokens.size : 0;

  if (ratio >= 0.75) {
    return { score: 80 + shared * 12, strong: true };
  }

  if (seedTokens.size === 1 && shared === 1) {
    return { score: 70, strong: true };
  }

  return { score: shared * 10, strong: false };
}

function getVisualArtistScore(seedArtist: unknown, candidateArtist: unknown): number {
  const seed = normalizeComparableText(seedArtist);
  const candidate = normalizeComparableText(candidateArtist);
  if (!seed || !candidate) return 0;
  if (seed === candidate) return 90;
  if (candidate.includes(seed) || seed.includes(candidate)) return 70;

  const seedTokens = visualTokenSet(seed);
  const candidateTokens = visualTokenSet(candidate);
  return countSharedVisualTokens(seedTokens, candidateTokens) * 28;
}

function scoreOfficialVisualCandidate(seed: Song, candidate: Song, index: number): number | null {
  const videoId = extractVideoId(candidate);
  if (!videoId) return null;
  if (!isOfficialMusicVideoType(candidate.youtubeVideoType)) return null;
  if (hasBlockedVisualVersion(candidate.title, seed.title)) return null;

  const titleScore = getVisualTitleScore(seed.title, candidate.title);
  if (!titleScore.strong) return null;

  let score = 140 + titleScore.score + getVisualArtistScore(seed.artist, candidate.artist);
  if (normalizeComparableText(candidate.title).includes("official")) score += 18;
  if (normalizeComparableText(candidate.title).includes("full video")) score += 12;

  const seedDuration = parseDurationSeconds(seed.duration);
  const candidateDuration = parseDurationSeconds(candidate.duration);
  if (seedDuration && candidateDuration) {
    const diff = Math.abs(seedDuration - candidateDuration);
    if (diff <= 35) score += 24;
    else if (diff <= 90) score += 8;
    else if (diff > 240) score -= 45;
  }

  score -= index * 4;
  return score >= 230 ? score : null;
}

function selectOfficialVisualVideoId(seed: Song, candidates: Song[]): string | null {
  let best: { id: string; score: number } | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const score = scoreOfficialVisualCandidate(seed, candidate, index);
    if (score === null) continue;
    const id = extractVideoId(candidate);
    if (!id) continue;
    if (!best || score > best.score) {
      best = { id, score };
    }
  }

  return best ? best.id : null;
}

function compactSongCandidates(candidates: Array<Song | null | undefined>): Song[] {
  return candidates.filter((candidate): candidate is Song => Boolean(candidate));
}

function artistNamesToString(artists: YouTubeMusicTrack["artists"] | undefined): string {
  return Array.isArray(artists) ? compactMap(artists, (artist) => readString(artist?.name) || null).join(", ") : "";
}

function trackToVisualCandidate(track: YouTubeMusicTrack | null | undefined, fallback: Song): Song | null {
  if (!track) return null;
  const videoId = extractVideoId(track);
  if (!videoId) return null;
  return {
    ...fallback,
    id: `youtube_${videoId}`,
    title: track.title || fallback.title,
    artist: artistNamesToString(track.artists) || fallback.artist,
    duration: parseDurationSeconds(track.duration_seconds) || parseDurationSeconds(track.duration) || fallback.duration,
    coverUrl: getBestThumbnailUrl(track.thumbnails) || fallback.coverUrl,
    source: "youtube",
    videoId,
    youtubeVideoId: videoId,
    youtubeVisualVideoId: videoId,
    youtubeVideoType: track.videoType,
  };
}

function counterpartToVisualCandidate(
  track: YouTubeMusicTrack | null | undefined,
  fallback: Song
): Song | null {
  const counterpart = track?.counterpart;
  if (!counterpart?.videoId) return null;
  const videoId = extractVideoId(counterpart);
  if (!videoId) return null;
  return {
    ...fallback,
    id: `youtube_${videoId}`,
    title: counterpart.title || track?.title || fallback.title,
    artist: artistNamesToString(track?.artists) || fallback.artist,
    duration: parseDurationSeconds(counterpart.length) || fallback.duration,
    coverUrl: getBestThumbnailUrl(counterpart.thumbnails) || fallback.coverUrl,
    source: "youtube",
    videoId,
    youtubeVideoId: videoId,
    youtubeVisualVideoId: videoId,
    youtubeVideoType: counterpart.videoType,
  };
}

/**
 * Convert YouTube Music track to app's Song format
 * Handles the normalized response format from the Node youtubei.js backend.
 */
export function convertYouTubeMusicTrack(track: any): Song | null {
  const normalizedTrack = normalizeTrackShape(track);
  if (!normalizedTrack) return null;

  // Handle artists array from the backend.
  const artistsArray = normalizedTrack.artists || [];
  const artistNames = compactMap(artistsArray, (a: any) => a?.name || null);
  const artist = artistNames.join(", ") || "Unknown Artist";

  // Duration: use duration_seconds if available, otherwise parse duration string
  const duration =
    parseDurationSeconds(normalizedTrack.duration_seconds) ||
    parseDurationSeconds(normalizedTrack.duration);

  // Get thumbnail URL from thumbnails array (use largest available)
  const thumbnails = normalizedTrack.thumbnails || [];
  const coverUrl = getBestThumbnailUrl(thumbnails);

  // Album info
  const albumName = normalizedTrack.album?.name || normalizedTrack.title;
  const visualVideoId = normalizedTrack.counterpart?.videoId || normalizedTrack.videoId;

  return {
    id: `youtube_${normalizedTrack.videoId}`,
    title: normalizedTrack.title,
    artist,
    album: albumName,
    duration,
    coverUrl,
    genre: "YouTube Music",
    audioUrl: "", // Backend resolves a fresh native stream URL when playback starts.
    year: normalizedTrack.year?.toString(),
    source: "youtube",
    videoId: normalizedTrack.videoId,
    youtubeVideoId: normalizedTrack.videoId,
    youtubeVisualVideoId: visualVideoId,
    youtubeVideoType: normalizedTrack.videoType,
  };
}

// ─── Timeout Wrapper ──────────────────────────────────────────────────────────

function createTimeoutSignal(ms: number = REQUEST_TIMEOUT_MS, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const abort = () => controller.abort();

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
    },
  };
}

function isAbortLikeError(error: unknown): boolean {
  const err = error as { name?: unknown; message?: unknown } | null | undefined;
  const name = typeof err?.name === "string" ? err.name : "";
  const message = typeof err?.message === "string" ? err.message : "";
  return name === "AbortError" || message === "Aborted" || message === "Request aborted";
}

function resolveWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const timeout = createTimeoutSignal(
    isPrivateDevelopmentApiUrl(url) ? PRIVATE_DEVELOPMENT_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    signal
  );
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    const body = await res.text();
    const trimmed = body.trim();
    if (!trimmed) return null;

    const contentType = res.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("json") && trimmed.startsWith("<")) {
      logger.warn("[YouTube Music] Ignoring non-JSON response", {
        url,
        preview: trimmed.slice(0, 80).replace(/\s+/g, " "),
      });
      return null;
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch (error: any) {
      logger.warn("[YouTube Music] Ignoring invalid JSON response", {
        url,
        error: error?.message || String(error),
        preview: trimmed.slice(0, 80).replace(/\s+/g, " "),
      });
      return null;
    }
  } finally {
    timeout.cleanup();
  }
}

async function fetchFirstJson<T>(urls: string[], signal?: AbortSignal): Promise<T | null> {
  if (signal?.aborted) {
    throw new Error("Request aborted");
  }

  let lastError: unknown = null;

  for (const url of urls) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- endpoint fallbacks must stay sequential to avoid duplicate backend work.
      const result = await fetchJson<T>(url, signal);
      if (result !== null) return result;
      lastError = null;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

function isPrivateDevelopmentApiUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "10.0.2.2" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

function getEndpointCandidates(
  path: string,
  _legacyNodePath?: string,
  query: string | string[] = ""
): string[] {
  const appBase = getYouTubeMusicApiUrl().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Build primary path candidates based on the configured URL
  let primaryPathCandidates: string[];
  if (isPrivateDevelopmentApiUrl(appBase)) {
    // Respect the user's rule: "dont fetch production url use local"
    primaryPathCandidates = [`${appBase}${normalizedPath}`];
  } else {
    const productionBase = PRODUCTION_YOUTUBE_MUSIC_API_URL.replace(/\/+$/, "");
    if (appBase === productionBase) {
      // Using production URL directly — no need to duplicate
      primaryPathCandidates = appBase.includes("/api/youtube-music")
        ? [`${appBase}${normalizedPath}`]
        : [
            `${appBase}${normalizedPath}`,
            `${appBase}/api/youtube-music${normalizedPath}`,
            `${appBase}/api${normalizedPath}`,
          ];
    } else {
      primaryPathCandidates = appBase.includes("/api/youtube-music")
        ? [`${appBase}${normalizedPath}`, `${appBase}/api${normalizedPath}`]
        : [
            `${appBase}${normalizedPath}`,
            `${appBase}/api/youtube-music${normalizedPath}`,
            `${appBase}/api${normalizedPath}`,
          ];
    }
  }

  const queryCandidates = Array.isArray(query) ? query : [query];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const queryCandidate of queryCandidates) {
    const suffix = queryCandidate ? `?${queryCandidate}` : "";
    for (const pathCandidate of primaryPathCandidates) {
      const candidate = `${pathCandidate}${suffix}`;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      candidates.push(candidate);
    }
  }

  return candidates;
}

function getSearchQueryCandidates(query: string, filter: string, limit: number): string[] {
  const encodedQuery = encodeURIComponent(query);
  return [
    `query=${encodedQuery}&filter=${filter}&limit=${limit}`,
    `q=${encodedQuery}&filter=${filter}&limit=${limit}`,
  ];
}

function getSearchResultItems(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

function getSearchSuggestionItems(json: any): string[] {
  if (Array.isArray(json)) return compactMap(json, (item: unknown) => (typeof item === "string" ? item : null));
  if (Array.isArray(json?.suggestions)) return compactMap(json.suggestions, (item: unknown) => (typeof item === "string" ? item : null));
  if (Array.isArray(json?.data?.suggestions)) return compactMap(json.data.suggestions, (item: unknown) => (typeof item === "string" ? item : null));
  if (Array.isArray(json?.data)) return compactMap(json.data, (item: unknown) => (typeof item === "string" ? item : null));
  return [];
}

function normalizeAudioStreamPayload(json: any, videoId: string): YouTubeMusicAudioStream | null {
  const source = getResponsePayload(json, "stream", "audio");
  const url = readString(source?.playbackUrl || source?.proxyUrl || source?.url);
  if (!url.startsWith("https://") && !url.startsWith("http://")) return null;
  const playbackUrl = shouldUseBackendMediaProxy(url)
    ? getBackendMediaStreamUrl(videoId, source) ?? url
    : url;

  const rawExpiry = Number(source?.expiresAt);
  const expiresAt = Number.isFinite(rawExpiry) && rawExpiry > 0
    ? rawExpiry < 1_000_000_000_000
      ? rawExpiry * 1000
      : rawExpiry
    : Date.now() + 10 * 60 * 1000;
  const headers: Record<string, string> = {};
  if (source?.headers && typeof source.headers === "object") {
    for (const [key, value] of Object.entries(source.headers)) {
      if (!key || typeof value !== "string") continue;
      const normalizedValue = value.trim();
      if (normalizedValue) headers[key] = normalizedValue;
    }
  }

  return {
    videoId,
    url: playbackUrl,
    expiresAt,
    headers,
    mimeType: readString(source?.mimeType) || undefined,
    formatId: readString(source?.formatId) || undefined,
    audioCodec: readString(source?.audioCodec) || undefined,
    bitrateKbps: Number.isFinite(Number(source?.bitrateKbps)) ? Number(source.bitrateKbps) : null,
    duration: Number.isFinite(Number(source?.duration)) ? Number(source.duration) : null,
    hasAudio: typeof source?.hasAudio === "boolean" ? source.hasAudio : undefined,
    hasVideo: typeof source?.hasVideo === "boolean" ? source.hasVideo : undefined,
  };
}

function shouldUseBackendMediaProxy(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".googlevideo.com") || host === "googlevideo.com";
  } catch {
    return false;
  }
}

function getBackendMediaStreamUrl(videoId: string, source: any): string | null {
  const mimeType = readString(source?.mimeType).toLowerCase();
  const extension = mimeType.includes("audio/mp4") || mimeType.includes("audio/m4a")
    ? ".m4a"
    : mimeType.includes("video/mp4")
      ? ".mp4"
      : "";
  const params = new URLSearchParams();
  params.set("reason", "app_cdn_proxy");
  params.set("session", String(source?.generatedAt || Date.now()));

  const formatId = readString(source?.formatId);
  if (formatId) params.set("formatId", formatId);
  if (source?.hasVideo === true) {
    params.set("preferMuxed", "true");
    params.set("allowMuxedFallback", "true");
  } else {
    params.set("strictAudioOnly", "true");
    params.set("allowMuxedFallback", "false");
  }

  return getEndpointCandidates(
    `/stream/media/${encodeURIComponent(videoId)}${extension}`,
    undefined,
    params.toString()
  )[0] ?? null;
}

function isBackendProxiedStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return path.includes("/stream/media/") || path.includes("/api/youtube-music/stream/");
  } catch {
    return false;
  }
}

function isNativePlayableStream(stream: YouTubeMusicAudioStream): boolean {
  if (!stream.url || stream.hasAudio === false) {
    return false;
  }

  const mimeType = readString(stream.mimeType).toLowerCase();
  const formatId = readString(stream.formatId);
  const format = formatId.toUpperCase();
  const codec = readString(stream.audioCodec).toLowerCase();
  const isMp4Video =
    mimeType.includes("video/mp4") ||
    formatId === "18" ||
    (stream.hasVideo === true && codec.includes("mp4a"));
  const isMp4Audio =
    mimeType.includes("audio/mp4") ||
    mimeType.includes("audio/m4a") ||
    format === "M4A" ||
    format === "MPEG_4" ||
    formatId === "139" ||
    formatId === "140" ||
    formatId === "141" ||
    codec.includes("mp4a");
  const isMp3Audio =
    mimeType.includes("audio/mpeg") ||
    mimeType.includes("audio/mp3") ||
    format === "MP3";
  const isAacAudio = mimeType.includes("audio/aac") || codec.includes("aac");
  const isWebmOpusAudio =
    mimeType.includes("audio/webm") ||
    mimeType.includes("opus") ||
    format.includes("OPUS") ||
    format.includes("WEBM") ||
    codec.includes("opus");

  if (stream.hasVideo === true) {
    return isBackendProxiedStreamUrl(stream.url) && isMp4Video;
  }

  if (isMp4Audio || isMp3Audio || isAacAudio) return true;

  return Platform.OS === "android" && isWebmOpusAudio;
}

function getDirectStreamExpiresAt(url: string): number | null {
  try {
    const parsed = new URL(url);
    const expireParam = parsed.searchParams.get("expire");
    if (!expireParam) return null;

    const expireSeconds = Number(expireParam);
    if (!Number.isFinite(expireSeconds) || expireSeconds <= 0) return null;

    const expiresAt = expireSeconds * 1000;
    return expiresAt > Date.now() + 30 * 1000 ? expiresAt : null;
  } catch {
    return null;
  }
}

function getConservativeStreamExpiry(url: string): number {
  return getDirectStreamExpiresAt(url) ?? Date.now() + 55 * 60 * 1000;
}

// Stream helper functions.

function toBitrateKbps(bitrate: number): number | null {
  if (!Number.isFinite(bitrate) || bitrate <= 0) return null;
  return bitrate > 1000 ? Math.round(bitrate / 1000) : Math.round(bitrate);
}

function getChartsPayload(json: any): any {
  if (json?.charts && typeof json.charts === "object") return json.charts;
  if (json?.data?.charts && typeof json.data.charts === "object") return json.data.charts;
  if (json?.data && typeof json.data === "object") return json.data;
  return json;
}

function getResponsePayload(json: any, ...keys: string[]): any {
  if (!json || typeof json !== "object") return json;

  for (const key of keys) {
    if (json[key] && typeof json[key] === "object") {
      return json[key];
    }
  }

  if (json.data && typeof json.data === "object") {
    return json.data;
  }

  return json;
}

function normalizePlaylistPayload(playlist: any, fallbackId: string): YouTubeMusicPlaylist {
  return {
    ...playlist,
    browseId: readString(playlist?.browseId || playlist?.id || playlist?.playlistId) || fallbackId,
    tracks: Array.isArray(playlist?.tracks) ? playlist.tracks : [],
  };
}

function normalizeAlbumPayload(album: any, fallbackId: string): YouTubeMusicAlbum {
  return {
    ...album,
    browseId: readString(album?.browseId || album?.id || album?.playlistId) || fallbackId,
    tracks: Array.isArray(album?.tracks) ? album.tracks : [],
  };
}

function normalizeArtistPayload(artist: any, fallbackId: string): YouTubeMusicArtist {
  return {
    ...artist,
    browseId: readString(artist?.browseId || artist?.channelId || artist?.id) || fallbackId,
    tracks: Array.isArray(artist?.tracks)
      ? artist.tracks
      : Array.isArray(artist?.songs)
        ? artist.songs
        : [],
    albums: Array.isArray(artist?.albums) ? artist.albums : [],
  };
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Search YouTube Music for songs, albums, artists, or playlists
 */
export async function searchYouTubeMusic(
  query: string,
  type: "song" | "album" | "artist" | "playlist" = "song",
  limit: number = 20,
  signal?: AbortSignal
): Promise<Song[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:${type}:${limit}:${q.toLowerCase()}`;

  const cached = await getCached<Song[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  try {
    const filterType = type === 'song' ? 'songs' : type === 'album' ? 'albums' : type === 'artist' ? 'artists' : type === 'playlist' ? 'playlists' : 'songs';
    const urls = getEndpointCandidates(
      "/search",
      "/search",
      getSearchQueryCandidates(q, filterType, limit)
    );

    const json = await fetchFirstJson<any>(urls, signal);
    if (!json) {
      logger.warn("[YouTube Music] Search returned no response");
      return [];
    }

    const results = getSearchResultItems(json);

    const songs = mapFilter(
      results,
      (item: any) => {
        if (type === "song") {
          return convertYouTubeMusicTrack(item);
        }
        return null;
      },
      (song): song is Song => song !== null
    );

    // Only cache if we have results
    if (songs.length > 0) {
      await setCache(cacheKey, songs);
    }

    return songs;
  } catch (error: any) {
    // Abort errors are expected when user types quickly - don't log them
    if (error?.message === "Request aborted" || signal?.aborted) {
      return [];
    }
    logger.warn("[YouTube Music] Search failed (continuing without YouTube results):", error?.message || error);
    return [];
  }
}

/**
 * Search YouTube Music for videos (with movement / actual motion)
 */
export async function searchYouTubeMusicVideos(
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<Song[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:video:${YOUTUBE_VIDEO_SEARCH_CACHE_VERSION}:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<Song[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        "/search",
        "/search",
        getSearchQueryCandidates(q, "videos", limit)
      ),
      signal
    );
    const results = getSearchResultItems(json);
    const songs: Song[] = mapFilter(
      results,
      (item: any) => {
        const song = convertYouTubeMusicTrack(item);
        if (song && !song.youtubeVideoType) {
          song.youtubeVideoType = "video";
        }
        return song;
      },
      (song): song is Song => song !== null
    );

    if (songs.length > 0) {
      await setCache(cacheKey, songs);
    }
    return songs;
  } catch (error: any) {
    // Abort errors are expected when user types quickly - don't log them
    if (error?.message === "Request aborted" || signal?.aborted) {
      return [];
    }
    logger.warn("[YouTube Music] Video search failed:", error);
    return [];
  }
}

export async function getYouTubeMusicAudioStream(
  videoId: string,
  signal?: AbortSignal
): Promise<YouTubeMusicAudioStream | null> {
  const cleanVideoId = extractVideoId({ videoId: readString(videoId).replace(/^youtube_/, "") });
  if (!cleanVideoId) return null;

  try {
    const nonce = Date.now();
    
    // Use /stream/ for lightweight stream metadata. The backend can return a
    // direct CDN URL or a media proxy URL, depending on deployment/version.
    const queryAttempts = [
      // Prefer audio-only streams for native playback. The production backend can
      // return muxed video/mp4 for iOS-style requests, which Android release
      // builds may reject before audio starts.
      `platform=m4a&strictAudioOnly=true&allowMuxedFallback=false&reason=playback_start&nonce=${nonce}`,
      `platform=ios&strictAudioOnly=true&allowMuxedFallback=false&reason=playback_start&nonce=${nonce}`,
      // Android can often play audio/webm when M4A is unavailable.
      ...(Platform.OS === "android"
        ? [`platform=best&strictAudioOnly=true&allowMuxedFallback=false&reason=playback_start&nonce=${nonce}`]
        : []),
      // Last resort: allow the backend to return muxed/proxied media.
      `platform=ios&preferMuxed=true&allowMuxedFallback=true&reason=playback_start&nonce=${nonce}`,
    ];
    let lastError: unknown = null;

    for (const query of queryAttempts) {
      let stream: YouTubeMusicAudioStream | null = null;
      try {
        const candidates = getEndpointCandidates(
          `/stream/${encodeURIComponent(cleanVideoId)}`,
          `/stream/${encodeURIComponent(cleanVideoId)}`,
          query
        );
        const json = await fetchFirstJson<any>(candidates, signal);
        stream = json ? normalizeAudioStreamPayload(json, cleanVideoId) : null;
      } catch (error: any) {
        lastError = error;
        if (error?.message === "Request aborted" || signal?.aborted) {
          throw error;
        }
        logger.warn("[YouTube Music] Stream candidate failed", {
          videoId: cleanVideoId,
          query,
          error: error?.message || String(error),
        });
        continue;
      }

      if (!stream) continue;

      // Check if we got a direct YouTube URL (from backend resolution)
      if (stream.url && isNativePlayableStream(stream)) {
        logger.info("[YouTube Music] Got direct playable stream from backend", {
          videoId: cleanVideoId,
          formatId: stream.formatId,
          mimeType: stream.mimeType,
          hasVideo: stream.hasVideo,
          urlPreview: stream.url.substring(0, 100),
        });
        return stream;
      }

      logger.warn("[YouTube Music] Backend stream not immediately playable", {
        videoId: cleanVideoId,
        formatId: stream.formatId,
        mimeType: stream.mimeType,
        hasAudio: stream.hasAudio,
        hasVideo: stream.hasVideo,
        hasUrl: !!stream.url,
      });
    }

    if (lastError) {
      logger.warn("[YouTube Music] All stream candidates failed", {
        videoId: cleanVideoId,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });
    }

    return null;
  } catch (error: any) {
    if (error?.message === "Request aborted" || signal?.aborted) {
      return null;
    }
    logger.error("[YouTube Music] Backend audio resolver failed", { 
      videoId: cleanVideoId,
      error: error?.message || String(error),
    });
    return null;
  }
}

/**
 * Get a backend-proxied YouTube audio stream for native playback.
 * 
 * @param videoId - YouTube video ID
 * @param signal - Abort signal for cancellation
 * @returns Audio stream info with direct playback URL
 */
export async function getYouTubeAudioStreamForPlayback(
  videoId: string,
  signal?: AbortSignal
): Promise<YouTubeMusicAudioStream | null> {
  const cleanVideoId = extractVideoId({ videoId: readString(videoId).replace(/^youtube_/, "") });
  if (!cleanVideoId) return null;

  logger.info(`[YouTube Music] Resolving stream for ${cleanVideoId} via backend`);
  return getYouTubeMusicAudioStream(cleanVideoId, signal);
}

export async function reportYouTubeMusicPlaybackFailure(payload: {
  videoId?: string;
  status?: number;
  code?: string;
  message?: string;
  platform?: string;
}): Promise<void> {
  const cleanVideoId = extractVideoId({ videoId: payload.videoId });
  try {
    const [url] = getEndpointCandidates("/playback/failure", "/playback/failure");
    if (!url) return;
    await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        ...payload,
        videoId: cleanVideoId || payload.videoId,
      }),
    });
  } catch {
    // Best effort.
  }
}

export async function prefetchYouTubeMusicAutoplay(
  videoId: string,
  limit = 20,
  signal?: AbortSignal
): Promise<{
  queue: YouTubeMusicTrack[];
  streams: Array<{ videoId: string; stream: YouTubeMusicAudioStream }>;
} | null> {
  const cleanVideoId = extractVideoId({ videoId: readString(videoId).replace(/^youtube_/, "") });
  if (!cleanVideoId) return null;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/autoplay/${encodeURIComponent(cleanVideoId)}/prefetch`,
        `/autoplay/${encodeURIComponent(cleanVideoId)}/prefetch`,
        `limit=${Math.max(1, Math.min(limit, 20))}&platform=ios&nonce=${Date.now()}`
      ),
      signal
    );
    const payload = json?.prefetch || json?.data?.prefetch || json || {};
    return {
      queue: mapFilter(payload.queue || json?.queue || [], normalizeTrackShape, (track): track is YouTubeMusicTrack => track !== null),
      streams: mapFilter(
        payload.streams || json?.streams || [],
        (entry: any) => {
          const stream = normalizeAudioStreamPayload(entry?.stream || entry, readString(entry?.videoId));
          return stream?.videoId ? { videoId: stream.videoId, stream } : null;
        },
        (entry): entry is { videoId: string; stream: YouTubeMusicAudioStream } => Boolean(entry)
      ),
    };
  } catch (error) {
    logger.warn("[YouTube Music] Autoplay prefetch failed:", error);
    return null;
  }
}


/**
 * Get YouTube Music playlist details
 */
export async function getYouTubeMusicPlaylist(playlistId: string): Promise<YouTubeMusicPlaylist | null> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:playlist:${playlistId}`;
  const cached = await getCached<YouTubeMusicPlaylist>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/playlist/${encodeURIComponent(playlistId)}`,
        `/playlist/${encodeURIComponent(playlistId)}`
      )
    );
    if (!json) return null;
    const playlist = normalizePlaylistPayload(getResponsePayload(json, "playlist"), playlistId);

      await setCache(cacheKey, playlist);
    return playlist;
  } catch (error) {
    logger.error("YouTube Music playlist error:", error);
    return null;
  }
}

/**
 * Get YouTube Music artist details
 */
export async function getYouTubeMusicArtist(artistId: string): Promise<YouTubeMusicArtist | null> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:artist:${artistId}`;
  const cached = await getCached<YouTubeMusicArtist>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/artist/${encodeURIComponent(artistId)}`,
        `/artist/${encodeURIComponent(artistId)}`
      )
    );
    if (!json) return null;
    const artist = normalizeArtistPayload(getResponsePayload(json, "artist"), artistId);

    await setCache(cacheKey, artist);
    return artist;
  } catch (error) {
    logger.error("YouTube Music artist error:", error);
    return null;
  }
}

/**
 * Get YouTube Music album details
 */
export async function getYouTubeMusicAlbum(albumId: string): Promise<YouTubeMusicAlbum | null> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:album:${albumId}`;
  const cached = await getCached<YouTubeMusicAlbum>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/album/${encodeURIComponent(albumId)}`,
        `/album/${encodeURIComponent(albumId)}`
      )
    );
    if (!json) return null;
    const album = normalizeAlbumPayload(getResponsePayload(json, "album"), albumId);

      await setCache(cacheKey, album);
    return album;
  } catch (error) {
    logger.error("YouTube Music album error:", error);
    return null;
  }
}

/**
 * Get YouTube Music watch queue details for one video.
 * A song track often has a counterpart videoId for the actual music video.
 */
async function getYouTubeMusicWatchPlaylist(
  videoId: string,
  options: { limit?: number; radio?: boolean } = {}
): Promise<YouTubeMusicWatchPlaylist | null> {
  const cleanVideoId = extractVideoId({ videoId: readString(videoId).replace(/^youtube_/, "") });
  if (!cleanVideoId) return null;

  const limit = Math.max(1, Math.min(options.limit ?? 5, 25));
  const radio = options.radio ?? false;
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:watch:${cleanVideoId}:${limit}:${radio ? "radio" : "queue"}`;
  const cached = await getCached<YouTubeMusicWatchPlaylist>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/watch/${encodeURIComponent(cleanVideoId)}`,
        `/watch/${encodeURIComponent(cleanVideoId)}`,
        `limit=${limit}&radio=${radio ? "true" : "false"}`
      )
    );
    if (!json) return null;

    const source = json?.data || json;
    const tracks = mapFilter(
      Array.isArray(source?.tracks) ? source.tracks : [],
      (track: any) => normalizeTrackShape(track),
      (track): track is YouTubeMusicTrack => track !== null
    );

    const watchPlaylist: YouTubeMusicWatchPlaylist = {
      tracks,
      playlistId: readString(source?.playlistId) || null,
    };

    await setCache(cacheKey, watchPlaylist);
    return watchPlaylist;
  } catch (error) {
    logger.warn("YouTube Music watch playlist error:", error);
    return null;
  }
}

export async function getYouTubeMusicVisualVideoId(song: Song): Promise<string | null> {
  const source = song as Song & {
    youtubeVideoId?: string;
    youtubeVisualVideoId?: string;
    youtubeVideoType?: string;
    videoId?: string;
  };
  const audioVideoId = extractVideoId({
    videoId: source.youtubeVideoId || source.videoId || source.id,
    id: source.id,
  });
  const existingVisualId = extractVideoId({
    videoId: source.youtubeVisualVideoId,
    id: source.youtubeVisualVideoId,
  });

  if (!audioVideoId) {
    return selectOfficialVisualVideoId(song, compactSongCandidates([
      existingVisualId
        ? {
            ...song,
            id: `youtube_${existingVisualId}`,
            videoId: existingVisualId,
            youtubeVideoId: existingVisualId,
            youtubeVisualVideoId: existingVisualId,
            youtubeVideoType: source.youtubeVideoType,
          }
        : null,
    ]));
  }

  const visualCacheKey = [
    YOUTUBE_MUSIC_CACHE_PREFIX,
    "official_visual",
    OFFICIAL_VISUAL_SEARCH_CACHE_VERSION,
    audioVideoId,
    normalizeComparableText(song.title),
    normalizeComparableText(song.artist),
  ].join(":");
  const cached = await getCached<{ videoId: string | null }>(visualCacheKey, CACHE_TTL_MS);
  if (cached && Object.prototype.hasOwnProperty.call(cached, "videoId")) {
    return cached.videoId;
  }

  const cacheAndReturn = async (videoId: string | null) => {
    await setCache(visualCacheKey, { videoId });
    return videoId;
  };

  const watch = await getYouTubeMusicWatchPlaylist(audioVideoId, { limit: 5, radio: false });
  const currentTrack =
    watch?.tracks.find((track) => track.videoId === audioVideoId) ||
    watch?.tracks[0] ||
    null;
  const watchCandidateId = selectOfficialVisualVideoId(song, compactSongCandidates([
    trackToVisualCandidate(currentTrack, song),
    counterpartToVisualCandidate(currentTrack, song),
  ]));

  if (watchCandidateId) {
    return cacheAndReturn(watchCandidateId);
  }

  const existingCandidateId = selectOfficialVisualVideoId(song, compactSongCandidates([
    existingVisualId
      ? {
          ...song,
          id: `youtube_${existingVisualId}`,
          videoId: existingVisualId,
          youtubeVideoId: existingVisualId,
          youtubeVisualVideoId: existingVisualId,
          youtubeVideoType: source.youtubeVideoType,
        }
      : null,
  ]));

  if (existingCandidateId) {
    return cacheAndReturn(existingCandidateId);
  }

  if (song.title && song.artist) {
    try {
      const searchResults = await searchYouTubeMusicVideos(`${song.title} ${song.artist} official music video`, 10);
      const searchCandidateId = selectOfficialVisualVideoId(song, searchResults);
      if (searchCandidateId) {
        return cacheAndReturn(searchCandidateId);
      }
    } catch (err) {
      logger.warn("[YouTube Music] Visual fallback search failed:", err);
    }
  }

  return cacheAndReturn(null);
}

export interface YouTubeMusicPlaylistCard {
  id: string;
  name: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  songCount?: number;
  author?: string;
  category?: string;
  description?: string;
  kind?: YouTubeMusicPlaylistKind;
  itemType?: "playlist" | "song";
  videoId?: string;
  duration?: number;
}

export type YouTubeMusicPlaylistKind = "chart" | "editorial" | "featured" | "community";

export interface YouTubeMusicHomeCategoryData {
  id: string;
  title: string;
  eyebrow?: string;
  results: YouTubeMusicPlaylistCard[];
}

const HOME_YOUTUBE_MUSIC_CATEGORY_VERSION = "v19";

type YouTubeHomeBrowseSection = {
  id: string;
  title: string;
  eyebrow?: string;
  playlistIds?: readonly string[];
  matchTerms?: readonly string[];
  queries: readonly string[];
  mode: "playlist" | "song";
};

const YOUTUBE_HOME_BROWSE_SECTIONS: readonly YouTubeHomeBrowseSection[] = [
  {
    id: "yt-india-biggest-hits",
    eyebrow: "MUSIC THAT'S HOT AND HAPPENING!",
    title: "India's biggest hits",
    queries: [
      "Bollywood Hitlist",
      "Uncut Bollywood",
      "Bollywood Dance Hitlist",
      "Bollywood Romance Hitlist",
      "Gujarati Hitlist",
      "Ekdum Fresh",
    ],
    playlistIds: [
      "RDCLAK5uy_n9Fbdw7e6ap-98_A-8JYBmPv64v-Uaq1g",
      "RDCLAK5uy_krbBs7P2iEb30IODyVbiOXWyhZtAIX9Uk",
      "RDCLAK5uy_kjNBBWqyQ_Cy14B0P4xrcKgd39CRjXXKk",
      "RDCLAK5uy_mypHeJ-B5f7-OgrxJcXeiHSotjIJ_UDhQ",
      "RDCLAK5uy_n2S5rcCsh7xTdULPMqgPaFdaleM43gKGg",
      "RDCLAK5uy_mDTfR8UPbTurG-Riq7QDI5mjT4a7H5eoI",
    ],
    matchTerms: ["bollywood", "uncut", "dance", "romance", "gujarati", "fresh", "hitlist"],
    mode: "playlist",
  },
  {
    id: "yt-featured-playlists",
    title: "Fresh Indian playlists",
    queries: [`new indian music ${CURRENT_YEAR}`, `latest hindi punjabi tamil telugu songs ${CURRENT_YEAR}`, "new indian indie"],
    playlistIds: [
      "RDCLAK5uy_l8jPcXx__5Dsu2D7vTiXPlO8pZhZsjBFk",
      "RDCLAK5uy_k66J6mE65JgdE4zoeNSzmw_16JB_ueINE",
      "RDCLAK5uy_nNhhgRET3NcJ4SJBvqhAIJ6t7vjsQYowc",
      "RDCLAK5uy_mk3xwsayv9PxawuXS-U6ao9eMeNmSwYAM",
      "RDCLAK5uy_nVQAtE2KBWk-ROQIc5o39Oup3hOLnYV0g",
      "RDCLAK5uy_l8CaYQvBQWVT2st1VsW9JjODWisR_vd3U",
      "RDCLAK5uy_lkfuM4Tjwc_1D3cyzECzM2TjcjWj0AZ5k",
      "RDCLAK5uy_nS8QPuM3petGWZqr2iILgb9dPEQZsjc1Y",
    ],
    matchTerms: ["new", "fresh", "indian", "hindi", "punjabi", "tamil", "telugu", "indie", "pop", "next wave"],
    mode: "playlist",
  },
  {
    id: "yt-top-50-india",
    title: "Top 50 India",
    queries: [`latest top hindi songs ${CURRENT_YEAR}`, `india top chart songs ${CURRENT_YEAR}`, `latest bollywood songs ${CURRENT_YEAR}`],
    mode: "song",
  },
  {
    id: "yt-top-100-songs",
    title: "Top 100 Songs",
    queries: [`top hindi songs ${CURRENT_YEAR} latest`, `new bollywood hits ${CURRENT_YEAR}`, `trending hindi songs ${CURRENT_YEAR} latest`],
    matchTerms: ["top", "chart", "trending", "hits", "hindi", "bollywood", "india"],
    mode: "playlist",
  },
  {
    id: "yt-trending-now",
    title: "Trending Now",
    queries: [`trending hindi songs ${CURRENT_YEAR}`, `viral indian songs ${CURRENT_YEAR}`, `india top chart songs ${CURRENT_YEAR}`],
    mode: "song",
  },
  {
    id: "yt-new-releases",
    title: "New Releases",
    queries: [`latest hindi songs ${CURRENT_YEAR} bollywood`, `new bollywood songs ${CURRENT_YEAR}`, `latest indian songs ${CURRENT_YEAR}`],
    mode: "song",
  },
  {
    id: "yt-bollywood-hits",
    title: "Bollywood Hits",
    queries: [`latest bollywood songs ${CURRENT_YEAR}`, `bollywood new songs ${CURRENT_YEAR}`, `new bollywood hits ${CURRENT_YEAR}`],
    playlistIds: [
      "RDCLAK5uy_n9Fbdw7e6ap-98_A-8JYBmPv64v-Uaq1g",
      "RDCLAK5uy_m1SfwuulEBVcweY5bCV8jJ6ZCn8M2gKGM",
      "RDCLAK5uy_nbTnrBv4CxZys35IAzhO0-fFCiKD58qzo",
      "RDCLAK5uy_mAL8kVq6SS6BUekEyyKLOvq68v44mq6bE",
      "RDCLAK5uy_kMV8D6xyDudzUMstUx1-Ow5anGYJxfnrE",
      "RDCLAK5uy_kjcqi4IupK6Pl1cz_sHCfMGnXaRPyscoc",
    ],
    matchTerms: ["bollywood", "hindi", "hit", "dance", "party", "remix", "recharger"],
    mode: "playlist",
  },
  {
    id: "yt-hip-hop",
    title: "Hip Hop",
    queries: ["Desi Hip Hop X", "Next Wave Desi Hip Hop", `indian hip hop rap ${CURRENT_YEAR}`],
    playlistIds: [
      "RDCLAK5uy_lkfuM4Tjwc_1D3cyzECzM2TjcjWj0AZ5k",
      "RDCLAK5uy_kSBA4QYRS3z-HZyp9P8Kp1_egtDFqzaG4",
      "RDCLAK5uy_lxyYFz9HM1dHqshLRZTm2Vnyh6BMOgn6g",
      "RDCLAK5uy_k5OicslPLzEMgpcyeTgam0J1rvvt0h6Ys",
    ],
    matchTerms: ["hip hop", "rap", "desi", "punjabi rap", "dhh", "gully"],
    mode: "playlist",
  },
  {
    id: "yt-romance",
    title: "Romance",
    queries: [`romantic hindi songs ${CURRENT_YEAR}`, `bollywood love songs ${CURRENT_YEAR}`, "romantic bollywood songs"],
    playlistIds: [
      "RDCLAK5uy_mypHeJ-B5f7-OgrxJcXeiHSotjIJ_UDhQ",
      "RDCLAK5uy_mgEm8q7vw-VJ8DeKUOCZqKgileRj9GnQ4",
      "RDCLAK5uy_kvB-Tek1AZcCVmlbyA8iDfBgD4hPxgec8",
      "RDCLAK5uy_miAacfMxVybbt7ketqqnPPbH9LDn1TavU",
      "RDCLAK5uy_n9S8w04iJGdSirkDSX6svxZ8YtcpbLwFM",
      "RDCLAK5uy_mcMBXir4RT5m0mkGIRtbwFOtD4nbiVSvg",
      "RDCLAK5uy_lbfDqlFOiRJekoTwNgiES65gcham4ZelA",
      "RDCLAK5uy_mrtv7Q8jbt2mDcDC6z7wcWfk26dtOIBmc",
      "RDCLAK5uy_nst6TjuDcm2GKUXPrp9nYkfg5_oeEofE8",
      "RDCLAK5uy_mobUQoWWE7bCp6QlBYKVF3TPITZUhvTM8",
    ],
    matchTerms: ["romance", "romantic", "love", "bollywood", "punjabi", "midnight", "kollywood", "tollywood"],
    mode: "playlist",
  },
  {
    id: "yt-party-hits",
    title: "Party Hits",
    queries: [`bollywood party songs ${CURRENT_YEAR}`, `punjabi party songs ${CURRENT_YEAR}`, "hindi dance songs"],
    playlistIds: [
      "RDCLAK5uy_l_Bj8rMsjkhFMMs-eLrA17_zjr9r6g_Eg",
      "RDCLAK5uy_m1SfwuulEBVcweY5bCV8jJ6ZCn8M2gKGM",
      "RDCLAK5uy_nbTnrBv4CxZys35IAzhO0-fFCiKD58qzo",
      "RDCLAK5uy_ku8t94xLI1tlwohvGukeht34glDJXSt94",
      "RDCLAK5uy_kW5twHnDG2vIwFy0knslnK87jmxg_6uJk",
      "RDCLAK5uy_nlOMew8qv8HGXb9HbshuU1OgH3aL_JMKA",
    ],
    matchTerms: ["party", "dance", "edm", "club", "desi", "punjabi"],
    mode: "playlist",
  },
  {
    id: "yt-punjabi-hits",
    title: "Punjabi Hits",
    queries: [`latest punjabi songs ${CURRENT_YEAR}`, `punjabi hits ${CURRENT_YEAR}`, "punjabi party hits"],
    playlistIds: [
      "RDCLAK5uy_mk3xwsayv9PxawuXS-U6ao9eMeNmSwYAM",
      "RDCLAK5uy_kW5twHnDG2vIwFy0knslnK87jmxg_6uJk",
      "RDCLAK5uy_nlOMew8qv8HGXb9HbshuU1OgH3aL_JMKA",
      "RDCLAK5uy_k5OicslPLzEMgpcyeTgam0J1rvvt0h6Ys",
      "RDCLAK5uy_nS8QPuM3petGWZqr2iILgb9dPEQZsjc1Y",
      "RDCLAK5uy_n9S8w04iJGdSirkDSX6svxZ8YtcpbLwFM",
    ],
    matchTerms: ["punjabi"],
    mode: "playlist",
  },
  {
    id: "yt-south-hits",
    title: "South Hits",
    queries: [`latest telugu songs ${CURRENT_YEAR}`, `latest tamil songs ${CURRENT_YEAR}`, `south indian songs ${CURRENT_YEAR}`],
    playlistIds: [
      "RDCLAK5uy_nVQAtE2KBWk-ROQIc5o39Oup3hOLnYV0g",
      "RDCLAK5uy_l8CaYQvBQWVT2st1VsW9JjODWisR_vd3U",
      "RDCLAK5uy_kxyDfb8adHA-cigfDo_m-thB3GIvSiQSQ",
      "RDCLAK5uy_nGC5IUV3lYF-P_wGb-LzMPFydA-RkPblc",
      "RDCLAK5uy_mXUrV3_kqn3WUflvb3nZr35f3F5Q049H0",
      "RDCLAK5uy_mErBkQfx-R-FQHnM6CsikE72lJlMuFKNs",
    ],
    matchTerms: ["tamil", "telugu", "kollywood", "tollywood", "south"],
    mode: "playlist",
  },
] as const;

const YOUTUBE_HOME_FALLBACK_QUERIES = YOUTUBE_HOME_BROWSE_SECTIONS.flatMap((section) => section.queries);

const YOUTUBE_OFFICIAL_AUTHOR_TERMS = [
  "youtube music",
  "t series",
  "zee music company",
  "zee music",
  "sony music india",
  "yrf",
  "saregama music",
  "tips official",
  "tips music",
  "speed records",
  "desi melodies",
  "white hill music",
  "geet mp3",
  "aditya music",
  "lahari music",
  "think music india",
  "mango music",
  "times music",
  "universal music india",
] as const;

const YOUTUBE_BLOCKED_PLAYLIST_TERMS = [
  "8d",
  "all time",
  "bgm",
  "black and white",
  "carvaan classics",
  "classic",
  "classics",
  "cover",
  "covers",
  "dj",
  "evergreen",
  "lofi",
  "lyrics",
  "lyric",
  "old",
  "old is gold",
  "mashup",
  "nonstop",
  "reaction",
  "remix",
  "remixes",
  "retro",
  "ringtone",
  "ringtones",
  "slowed",
  "sped up",
  "spotify",
  "status",
  "unplugged",
] as const;

const YOUTUBE_OLD_PLAYLIST_TERMS = [
  "60s",
  "70s",
  "80s",
  "90s",
  "00s",
  "2000s",
  "nostalgic",
  "nostalgia",
] as const;

function dedupeYouTubePlaylistCards(playlists: YouTubeMusicPlaylistCard[]): YouTubeMusicPlaylistCard[] {
  const seen = new Set<string>();
  const unique: YouTubeMusicPlaylistCard[] = [];

  for (const playlist of playlists) {
    const id = readString(playlist.id);
    const canonicalId = getCanonicalYouTubePlaylistCardId(playlist);
    if (!id || !canonicalId || seen.has(canonicalId)) continue;
    seen.add(canonicalId);
    unique.push({ ...playlist, id });
  }

  return unique;
}

function getCanonicalYouTubePlaylistCardId(playlist: Pick<YouTubeMusicPlaylistCard, "id">): string {
  const id = readString(playlist.id);
  return id.startsWith("VL") ? id.slice(2) : id;
}

function getYouTubePlaylistText(playlist: YouTubeMusicPlaylistCard): string {
  return normalizeComparableText([
    playlist.name,
    playlist.author,
    playlist.category,
    playlist.description,
  ].filter(Boolean).join(" "));
}

function hasAnyWholeTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => includesWholeTerm(text, term));
}

function hasOldYear(text: string): boolean {
  const years = text.match(/\b(?:19\d{2}|20\d{2})\b/g) || [];
  return years.some((year) => {
    const value = Number(year);
    return Number.isFinite(value) && value < CURRENT_YEAR - 1;
  });
}

function isOfficialYouTubePlaylistCard(playlist: YouTubeMusicPlaylistCard): boolean {
  const id = readString(playlist.id);
  if (id.startsWith("VLRDCLAK5uy_") || id.startsWith("RDCLAK5uy_")) return true;

  const author = normalizeComparableText(playlist.author);
  return YOUTUBE_OFFICIAL_AUTHOR_TERMS.some((term) => includesWholeTerm(author, term));
}

function isCleanCurrentYouTubePlaylistCard(playlist: YouTubeMusicPlaylistCard): boolean {
  const text = getYouTubePlaylistText(playlist);
  if (!text) return false;
  if (hasAnyWholeTerm(text, YOUTUBE_BLOCKED_PLAYLIST_TERMS)) return false;
  if (hasAnyWholeTerm(text, YOUTUBE_OLD_PLAYLIST_TERMS)) return false;
  if (hasOldYear(text)) return false;
  return true;
}

function isWantedYouTubePlaylistCard(playlist: YouTubeMusicPlaylistCard): boolean {
  return isOfficialYouTubePlaylistCard(playlist) && isCleanCurrentYouTubePlaylistCard(playlist);
}

function officialYouTubePlaylistScore(playlist: YouTubeMusicPlaylistCard): number {
  const text = getYouTubePlaylistText(playlist);
  let score = 0;
  const id = readString(playlist.id);
  if (id.startsWith("VLRDCLAK5uy_") || id.startsWith("RDCLAK5uy_")) score += 50;
  if (includesWholeTerm(text, String(CURRENT_YEAR))) score += 30;
  if (includesWholeTerm(text, String(CURRENT_YEAR - 1))) score += 12;
  if (hasAnyWholeTerm(text, ["latest", "new", "fresh", "trending"])) score += 16;
  if (hasAnyWholeTerm(text, ["official", "movie songs", "bollywood", "punjabi", "telugu", "tamil"])) score += 8;
  return score;
}

function filterWantedYouTubePlaylistCards(playlists: YouTubeMusicPlaylistCard[]): YouTubeMusicPlaylistCard[] {
  return dedupeYouTubePlaylistCards(playlists)
    .filter(isWantedYouTubePlaylistCard)
    .sort((left, right) => officialYouTubePlaylistScore(right) - officialYouTubePlaylistScore(left));
}

function filterBalancedYouTubePlaylistCards(playlists: YouTubeMusicPlaylistCard[], limit: number): YouTubeMusicPlaylistCard[] {
  const official = filterWantedYouTubePlaylistCards(playlists);
  const officialIds = new Set(official.map(getCanonicalYouTubePlaylistCardId));
  const cleanFallback = dedupeYouTubePlaylistCards(playlists)
    .filter((playlist) => !officialIds.has(getCanonicalYouTubePlaylistCardId(playlist)) && isCleanCurrentYouTubePlaylistCard(playlist))
    .sort((left, right) => officialYouTubePlaylistScore(right) - officialYouTubePlaylistScore(left));

  return dedupeYouTubePlaylistCards([...official, ...cleanFallback]).slice(0, limit);
}

function normalizeYouTubePlaylistKind(raw: any, fallbackKind?: YouTubeMusicPlaylistKind): YouTubeMusicPlaylistKind {
  if (fallbackKind) return fallbackKind;

  const category = readString(raw?.category).toLowerCase();
  const author = readString(raw?.author || raw?.owner || raw?.channel?.name).toLowerCase();
  const id = readString(raw?.browseId || raw?.playlistId || raw?.id);

  if (category.includes("chart")) return "chart";
  if (author === "youtube music" || id.startsWith("VLRDCLAK5uy_") || id.startsWith("RDCLAK5uy_")) return "editorial";
  if (category.includes("featured")) return "featured";
  return "community";
}

function normalizeYouTubePlaylistCard(raw: any, fallbackKind?: YouTubeMusicPlaylistKind): YouTubeMusicPlaylistCard | null {
  const id = readString(raw?.browseId || raw?.playlistId || raw?.id);
  const name = readString(raw?.title || raw?.name);
  if (!id || !name) return null;

  const thumbnails = normalizeThumbnails(raw?.thumbnails || raw?.thumbnail || raw?.image);
  const bestThumbnail = getBestThumbnail(thumbnails);
  const imageUrl = bestThumbnail ? upscaleYouTubeThumbnail(bestThumbnail.url) : "";

  return {
    id,
    name,
    imageUrl,
    imageWidth: bestThumbnail?.width || undefined,
    imageHeight: bestThumbnail?.height || undefined,
    songCount: Number(raw?.trackCount || raw?.itemCount || raw?.count) || undefined,
    author: readString(raw?.author || raw?.owner || raw?.channel?.name) || undefined,
    category: readString(raw?.category) || undefined,
    description: readString(raw?.description) || undefined,
    kind: normalizeYouTubePlaylistKind(raw, fallbackKind),
    itemType: "playlist",
  };
}

function toYouTubePlaylistCardFromPlaylist(
  playlist: YouTubeMusicPlaylist | null,
  fallbackId: string
): YouTubeMusicPlaylistCard | null {
  if (!playlist) return null;

  return normalizeYouTubePlaylistCard(
    {
      id: readString(playlist.browseId) || fallbackId,
      title: playlist.title,
      description: playlist.description,
      thumbnails: playlist.thumbnails,
      trackCount: playlist.trackCount || playlist.tracks?.length,
      author: "YouTube Music",
      category: "Playlist",
    },
    "editorial"
  );
}

async function getYouTubeMusicPlaylistCardsFromIds(
  playlistIds: readonly string[] = []
): Promise<YouTubeMusicPlaylistCard[]> {
  if (playlistIds.length === 0) return [];

  const cards = await Promise.all(
    playlistIds.map(async (playlistId) => {
      const id = readString(playlistId);
      if (!id) return null;
      const playlist = await getYouTubeMusicPlaylist(id).catch(() => null);
      return toYouTubePlaylistCardFromPlaylist(playlist, id);
    })
  );

  return dedupeYouTubePlaylistCards(mapFilter(
    cards,
    (card) => card,
    (card): card is YouTubeMusicPlaylistCard => Boolean(card)
  ));
}

function filterYouTubeCardsForBrowseSection(
  cards: YouTubeMusicPlaylistCard[],
  section: YouTubeHomeBrowseSection
): YouTubeMusicPlaylistCard[] {
  const terms = section.matchTerms || [];
  if (terms.length === 0) return cards;

  return cards.filter((card) => {
    const text = getYouTubePlaylistText(card);
    return terms.some((term) => includesWholeTerm(text, term));
  });
}

function normalizeYouTubeSongCard(raw: any, category?: string): YouTubeMusicPlaylistCard | null {
  const source = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const track = normalizeTrackShape(source);
  if (!track) return null;

  const bestThumbnail = getBestThumbnail(track.thumbnails);
  const imageUrl = bestThumbnail ? upscaleYouTubeThumbnail(bestThumbnail.url) : "";
  const author = artistNamesToString(track.artists) || readString(source?.artist) || undefined;
  const albumName =
    typeof source?.album === "string"
      ? readString(source.album)
      : readString(track.album?.name || source?.album?.name || source?.album?.title);

  return {
    id: `youtube_${track.videoId}`,
    name: track.title,
    imageUrl,
    imageWidth: bestThumbnail?.width || undefined,
    imageHeight: bestThumbnail?.height || undefined,
    author,
    category: category || "Songs",
    description: albumName || author,
    kind: "featured",
    itemType: "song",
    videoId: track.videoId,
    duration: parseDurationSeconds(track.duration_seconds) || parseDurationSeconds(track.duration),
  };
}

function toYouTubeHomeSection(
  id: string,
  title: string,
  playlists: YouTubeMusicPlaylistCard[],
  limit: number,
  eyebrow?: string
): YouTubeMusicHomeCategoryData | null {
  const results = dedupeYouTubePlaylistCards(playlists)
    .filter((playlist) => playlist.id && playlist.name)
    .slice(0, limit)
    .map((playlist) => ({
      ...playlist,
      author: playlist.author || undefined,
      category: playlist.category || title,
    }));

  return results.length > 0 ? { id, title, eyebrow, results } : null;
}

function dedupeYouTubeHomeSections(sections: YouTubeMusicHomeCategoryData[]): YouTubeMusicHomeCategoryData[] {
  const seenSectionIds = new Set<string>();
  const seenPlaylistIds = new Set<string>();
  const unique: YouTubeMusicHomeCategoryData[] = [];

  for (const section of sections) {
    if (seenSectionIds.has(section.id)) continue;
    seenSectionIds.add(section.id);

    const results = section.results.filter((playlist) => {
      const id = getCanonicalYouTubePlaylistCardId(playlist);
      if (!id || seenPlaylistIds.has(id)) return false;
      seenPlaylistIds.add(id);
      return true;
    });

    if (results.length > 0) {
      unique.push({ ...section, results });
    }
  }

  return unique;
}

async function searchYouTubeMusicPlaylistCards(
  query: string,
  limit: number
): Promise<YouTubeMusicPlaylistCard[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:playlist_cards:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  const json = await fetchFirstJson<any>(
    getEndpointCandidates(
      "/search",
      "/search",
      getSearchQueryCandidates(q, "playlists", limit)
    )
  );
  const results = getSearchResultItems(json);

  const cards = mapFilter(
    results,
    (item: any) => {
      const id = readString(item?.browseId || item?.playlistId);
      const resultType = readString(item?.resultType || item?.type || item?.category).toLowerCase();
      const isPlaylist =
        resultType.includes("playlist") ||
        Boolean(item?.playlistId) ||
        id.startsWith("VL");
      if (!isPlaylist) return null;
      return normalizeYouTubePlaylistCard(item);
    },
    (playlist): playlist is YouTubeMusicPlaylistCard => Boolean(playlist)
  );

  if (cards.length > 0) {
    await setCache(cacheKey, cards);
  }

  return cards;
}

async function searchYouTubeMusicSongCards(
  query: string,
  limit: number,
  category?: string
): Promise<YouTubeMusicPlaylistCard[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:song_cards:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  const json = await fetchFirstJson<any>(
    getEndpointCandidates(
      "/search",
      "/search",
      getSearchQueryCandidates(q, "songs", limit)
    )
  );
  const results = getSearchResultItems(json);

  const cards = mapFilter(
    results,
    (item: any) => normalizeYouTubeSongCard(item, category),
    (song): song is YouTubeMusicPlaylistCard => Boolean(song)
  );

  if (cards.length > 0) {
    await setCache(cacheKey, cards);
  }

  return cards;
}

function getHomeShelfItems(json: any): any[] {
  const payload = getResponsePayload(json, "home", "shelves", "results");
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(json?.home)) return json.home;
  if (Array.isArray(json?.data?.home?.sections)) return json.data.home.sections;
  if (Array.isArray(json?.data?.home)) return json.data.home;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  return [];
}

function normalizeHomeShelfPlaylistCard(item: any): YouTubeMusicPlaylistCard | null {
  const id = readString(item?.playlistId || item?.browseId || item?.audioPlaylistId || item?.id);
  const name = readString(item?.title || item?.name);
  const isPlaylist =
    Boolean(item?.playlistId) ||
    id.startsWith("PL") ||
    id.startsWith("VL") ||
    id.startsWith("RDCLAK") ||
    id.startsWith("RDTMAK") ||
    id.startsWith("OLAK");

  if (!id || !name || !isPlaylist) return null;

  const thumbnails = normalizeThumbnails(item?.thumbnails || item?.thumbnail || item?.image);
  const bestThumbnail = getBestThumbnail(thumbnails);
  const description = readString(item?.description);
  const author = readString(item?.author || item?.owner || item?.channel?.name) || description.split("•")[0]?.trim();

  return {
    id,
    name,
    imageUrl: bestThumbnail ? upscaleYouTubeThumbnail(bestThumbnail.url) : "",
    imageWidth: bestThumbnail?.width || undefined,
    imageHeight: bestThumbnail?.height || undefined,
    songCount: Number(item?.trackCount || item?.itemCount || item?.count) || undefined,
    author: author || undefined,
    category: "YouTube Home",
    description: description || undefined,
    kind: normalizeYouTubePlaylistKind(item, "featured"),
    itemType: "playlist",
  };
}

function getHomeShelfContents(shelf: any): any[] {
  if (Array.isArray(shelf?.results)) return shelf.results;
  if (Array.isArray(shelf?.contents)) return shelf.contents;
  if (Array.isArray(shelf?.items)) return shelf.items;
  return [];
}

function homeShelfTitleToId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "yt-playlists";
}

function getMoodCategoryItems(json: any): Array<{ title: string; params: string }> {
  const source = json?.data || json?.moods || json?.categories || json;
  const rawItems = Array.isArray(source)
    ? source
    : source && typeof source === "object"
      ? Object.values(source).flatMap((value) => (Array.isArray(value) ? value : []))
      : [];

  return mapFilter(
    rawItems,
    (item: any) => ({
      title: readString(item?.title || item?.name),
      params: readString(item?.params || item?.browseParams || item?.id),
    }),
    (item): item is { title: string; params: string } => Boolean(item.title && item.params)
  );
}

async function getYouTubeMusicMoodCategorySections(
  limitPerCategory: number,
  maxCategories: number = 4
): Promise<YouTubeMusicHomeCategoryData[]> {
  const safeItemLimit = Math.max(1, Math.min(limitPerCategory, 12));
  const safeCategoryLimit = Math.max(1, Math.min(maxCategories, 8));
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:mood_category_sections:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${safeItemLimit}:${safeCategoryLimit}`;
  if (!__DEV__) {
    const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;
  }

  try {
    const moodsJson = await fetchFirstJson<any>(getEndpointCandidates("/moods", "/moods"));
    const moodItems = getMoodCategoryItems(moodsJson).slice(0, safeCategoryLimit);
    const sections = await Promise.all(
      moodItems.map(async (mood) => {
        try {
          const json = await fetchFirstJson<any>(
            getEndpointCandidates(
              "/mood-playlists",
              "/mood-playlists",
              `params=${encodeURIComponent(mood.params)}`
            )
          );
          const playlists = dedupeYouTubePlaylistCards(
            mapFilter(
              getSearchResultItems(json),
              (item: any) => normalizeHomeShelfPlaylistCard(item) ?? normalizeYouTubePlaylistCard(item, "featured"),
              (playlist): playlist is YouTubeMusicPlaylistCard => Boolean(playlist)
            )
          );
          return toYouTubeHomeSection(`yt-mood-${homeShelfTitleToId(mood.title)}`, mood.title, playlists, safeItemLimit);
        } catch {
          return null;
        }
      })
    );

    const finalSections = mapFilter(
      sections,
      (section) => section,
      (section): section is YouTubeMusicHomeCategoryData => Boolean(section)
    );
    if (!__DEV__ && finalSections.length > 0) {
      await setCache(cacheKey, finalSections);
    }
    return finalSections;
  } catch (error) {
    if (isAbortLikeError(error)) {
      return [];
    }
    logger.warn("[YouTube Music] Mood sections fetch failed:", error);
    return [];
  }
}

async function getYouTubeMusicHomeCategorySections(
  limitPerCategory: number,
  maxShelves: number = 10
): Promise<YouTubeMusicHomeCategoryData[]> {
  const safeShelfLimit = Math.max(1, Math.min(maxShelves, 12));
  const safeItemLimit = Math.max(1, Math.min(limitPerCategory, 12));
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_shelf_sections:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${safeItemLimit}:${safeShelfLimit}`;
  if (!__DEV__) {
    const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;
  }

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/home", "/home", [`limit=${safeShelfLimit}`])
    );
    if (!json) return [];

    const shelves = getHomeShelfItems(json);
    const usedIds = new Set<string>();
    const sections: YouTubeMusicHomeCategoryData[] = [];

    for (const shelf of shelves) {
      const title = readString(shelf?.title || shelf?.name) || "YouTube Music";

      const playlists = dedupeYouTubePlaylistCards(
        mapFilter(
          getHomeShelfContents(shelf),
          (item: any) => normalizeHomeShelfPlaylistCard(item) ?? normalizeYouTubePlaylistCard(item, "featured"),
          (playlist): playlist is YouTubeMusicPlaylistCard => Boolean(playlist)
        )
      ).slice(0, safeItemLimit);

      if (playlists.length === 0) continue;

      let id = `yt-${homeShelfTitleToId(title)}`;
      if (usedIds.has(id)) {
        let suffix = 2;
        while (usedIds.has(`${id}-${suffix}`)) suffix += 1;
        id = `${id}-${suffix}`;
      }
      usedIds.add(id);

      sections.push({
        id,
        title,
        results: playlists.map((playlist) => ({
          ...playlist,
          category: title,
        })),
      });
    }

    if (!__DEV__ && sections.length > 0) {
      await setCache(cacheKey, sections);
    }
    return sections;
  } catch (error) {
    if (isAbortLikeError(error)) {
      return [];
    }
    logger.warn("[YouTube Music] Home shelf sections fetch failed:", error);
    return [];
  }
}

async function searchYouTubeMusicPlaylistCardsFromQueries(
  queries: readonly string[],
  limitPerQuery: number
): Promise<YouTubeMusicPlaylistCard[]> {
  const results = await Promise.all(
    queries.map((query) => searchYouTubeMusicPlaylistCards(query, limitPerQuery).catch(
      () => [] as YouTubeMusicPlaylistCard[]
    ))
  );
  return dedupeYouTubePlaylistCards(results.flat());
}

async function searchYouTubeMusicSongCardsFromQueries(
  queries: readonly string[],
  limitPerQuery: number,
  category?: string
): Promise<YouTubeMusicPlaylistCard[]> {
  const results = await Promise.all(
    queries.map((query) => searchYouTubeMusicSongCards(query, limitPerQuery, category).catch(
      () => [] as YouTubeMusicPlaylistCard[]
    ))
  );
  return dedupeYouTubePlaylistCards(results.flat());
}

function getChartSongItems(json: any): any[] {
  const charts = getChartsPayload(json);
  const songs: any[] = [];
  const append = (value: any) => {
    if (Array.isArray(value)) {
      songs.push(...value);
      return;
    }

    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.songs)) songs.push(...value.songs);
    if (Array.isArray(value.tracks)) songs.push(...value.tracks);
    if (Array.isArray(value.results)) songs.push(...value.results);
    if (Array.isArray(value.items)) songs.push(...value.items);
    if (extractVideoId(value)) songs.push(value);
  };

  append(charts?.songs);
  append(charts?.daily?.songs);
  append(charts?.videos?.songs);
  append(charts?.trending?.songs);

  return songs;
}

async function getYouTubeMusicChartSongCards(country: string = "IN"): Promise<YouTubeMusicPlaylistCard[]> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:chart_song_cards:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${country}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/charts", "/charts", `country=${encodeURIComponent(country)}`)
    );
    if (!json) return [];

    const songs = dedupeYouTubePlaylistCards(
      mapFilter(
        getChartSongItems(json),
        (item: any) => normalizeYouTubeSongCard(item, "Charts"),
        (song): song is YouTubeMusicPlaylistCard => Boolean(song)
      )
    );

    if (songs.length > 0) {
      await setCache(cacheKey, songs);
    }
    return songs;
  } catch (error) {
    if (isAbortLikeError(error)) {
      return [];
    }
    logger.warn("[YouTube Music] Chart songs fetch failed:", error);
    return [];
  }
}

function getYouTubeBrowseSectionSeedPlaylists(
  section: (typeof YOUTUBE_HOME_BROWSE_SECTIONS)[number],
  seedPlaylists: YouTubeMusicPlaylistCard[]
): YouTubeMusicPlaylistCard[] {
  const seedTermsBySectionId: Record<string, string[]> = {
    "yt-featured-playlists-for-you": [],
    "yt-trending-community-playlists": ["trending", "viral", "hot", "chart", "top"],
    "yt-featured-playlists": ["new", "latest", "fresh", "release", "hit"],
    "yt-india-biggest-hits": [],
    "yt-top-50-india": [],
    "yt-top-100-songs": [],
    "yt-trending-now": [],
    "yt-new-releases": ["new", "latest", "fresh", "release", "releases"],
    "yt-bollywood-hits": ["bollywood", "hindi"],
    "yt-hip-hop": ["hip hop", "rap", "desi"],
    "yt-romance": ["romance", "romantic", "love", "ishq"],
    "yt-party-hits": ["party", "dance", "club"],
    "yt-punjabi-hits": ["punjabi"],
    "yt-south-hits": ["south", "telugu", "tamil", "tollywood"],
  };
  const terms = section.matchTerms || seedTermsBySectionId[section.id] || [];
  if (terms.length === 0) return seedPlaylists;

  return seedPlaylists.filter((playlist) => {
    const text = getYouTubePlaylistText(playlist);
    return terms.some((term) => includesWholeTerm(text, term));
  });
}

async function getYouTubeMusicBrowseCategorySections(
  limitPerCategory: number,
  homeSeedPlaylists: YouTubeMusicPlaylistCard[] = [],
  chartSeedPlaylists: YouTubeMusicPlaylistCard[] = []
): Promise<YouTubeMusicHomeCategoryData[]> {
  const safeItemLimit = Math.max(1, Math.min(limitPerCategory, 12));
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:browse_category_sections:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${safeItemLimit}`;
  if (!__DEV__) {
    const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;
  }

  try {
    const searchLimit = Math.max(safeItemLimit, 8);
    const fallbackLimit = Math.max(safeItemLimit, 10);
    const emptyCards: YouTubeMusicPlaylistCard[] = [];
    const cleanSeed = filterBalancedYouTubePlaylistCards([
      ...homeSeedPlaylists,
      ...chartSeedPlaylists,
    ], safeItemLimit * YOUTUBE_HOME_BROWSE_SECTIONS.length);
    const sections = await Promise.all(
      YOUTUBE_HOME_BROWSE_SECTIONS.map(async (section) => {
        const seedPlaylists = getYouTubeBrowseSectionSeedPlaylists(section, cleanSeed);

        if (section.mode === "playlist") {
          const curatedPlaylists = await resolveWithTimeout(
            getYouTubeMusicPlaylistCardsFromIds(section.playlistIds),
            OPTIONAL_HOME_SECTION_TIMEOUT_MS,
            emptyCards
          );
          const searchPlaylists = await resolveWithTimeout(
            searchYouTubeMusicPlaylistCardsFromQueries(section.queries, fallbackLimit),
            OPTIONAL_HOME_SECTION_TIMEOUT_MS,
            emptyCards
          );
          let cards = filterWantedYouTubePlaylistCards(
            filterYouTubeCardsForBrowseSection(
              [
                ...curatedPlaylists,
                ...searchPlaylists,
                ...seedPlaylists.filter((item) => item.itemType !== "song"),
              ],
              section
            )
          ).slice(0, safeItemLimit);

          if (cards.length < Math.min(3, safeItemLimit) && !section.playlistIds?.length) {
            cards = filterBalancedYouTubePlaylistCards(
              filterYouTubeCardsForBrowseSection(
                [...searchPlaylists, ...seedPlaylists.filter((item) => item.itemType !== "song")],
                section
              ),
              safeItemLimit
            );
          }

          if (cards.length < Math.min(3, safeItemLimit) && !section.playlistIds?.length) {
            const fallbackSongs = await resolveWithTimeout(
              searchYouTubeMusicSongCardsFromQueries(section.queries, searchLimit, section.title),
              OPTIONAL_HOME_SECTION_TIMEOUT_MS,
              emptyCards
            );
            cards = dedupeYouTubePlaylistCards([
              ...cards,
              ...filterBalancedYouTubePlaylistCards(
                filterYouTubeCardsForBrowseSection(fallbackSongs, section),
                safeItemLimit
              ),
              ...seedPlaylists.filter((item) => item.itemType === "song"),
            ]).slice(0, safeItemLimit);
          }

          return toYouTubeHomeSection(section.id, section.title, cards, safeItemLimit, section.eyebrow);
        }

        const searchSongs = await resolveWithTimeout(
          searchYouTubeMusicSongCardsFromQueries(section.queries, searchLimit, section.title),
          OPTIONAL_HOME_SECTION_TIMEOUT_MS,
          emptyCards
        );
        const seedSongs = seedPlaylists.filter((item) => item.itemType === "song");
        let cards = dedupeYouTubePlaylistCards([
          ...filterBalancedYouTubePlaylistCards(
            filterYouTubeCardsForBrowseSection(searchSongs, section),
            safeItemLimit
          ),
          ...seedSongs,
        ]).slice(0, safeItemLimit);

        if (cards.length < Math.min(4, safeItemLimit)) {
          const searchPlaylists = await resolveWithTimeout(
            searchYouTubeMusicPlaylistCardsFromQueries(section.queries, fallbackLimit),
            OPTIONAL_HOME_SECTION_TIMEOUT_MS,
            emptyCards
          );
          const fallbackPlaylists = filterBalancedYouTubePlaylistCards(
            filterYouTubeCardsForBrowseSection(
              [...searchPlaylists, ...seedPlaylists.filter((item) => item.itemType !== "song")],
              section
            ),
            safeItemLimit
          );
          cards = dedupeYouTubePlaylistCards([...cards, ...fallbackPlaylists]).slice(0, safeItemLimit);
        }

        return toYouTubeHomeSection(section.id, section.title, cards, safeItemLimit, section.eyebrow);
      })
    );

    const finalSections = mapFilter(
      sections,
      (section) => section,
      (section): section is YouTubeMusicHomeCategoryData => Boolean(section)
    );
    if (!__DEV__ && finalSections.length > 0) {
      await setCache(cacheKey, finalSections);
    }
    return finalSections;
  } catch (error) {
    if (isAbortLikeError(error)) {
      return [];
    }
    logger.warn("[YouTube Music] Browse category sections fetch failed:", error);
    return [];
  }
}


export async function getHomeYouTubeMusicCategories(options?: {
  limitPerCategory?: number;
}): Promise<YouTubeMusicHomeCategoryData[]> {
  const limit = Math.min(options?.limitPerCategory ?? 8, 12);
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_categories:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${limit}:raw`;
  if (!__DEV__) {
    const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, 60 * 60 * 1000);
    if (cached) return cached;
  }

  const [shelfSections, chartSongs] = await Promise.all([
    getYouTubeMusicHomeCategorySections(limit, 6),
    getYouTubeMusicChartSongCards("IN").catch(() => [] as YouTubeMusicPlaylistCard[]),
  ]);

  const chartSection = toYouTubeHomeSection(
    "yt-top-songs-india",
    "Top songs India",
    chartSongs,
    limit,
    "CHARTS"
  );
  const fastSections = dedupeYouTubeHomeSections(mapFilter(
    [...shelfSections, chartSection],
    (section) => section,
    (section): section is YouTubeMusicHomeCategoryData => Boolean(section)
  )).slice(0, 6);

  if (fastSections.length > 0) {
    if (!__DEV__) void setCache(cacheKey, fastSections);
    return fastSections;
  }

  const browseSections = await getYouTubeMusicBrowseCategorySections(limit, [], chartSongs);
  const fallbackSection = browseSections.length === 0
    ? toYouTubeHomeSection(
        "yt-search-suggestions",
        "More to Explore",
        filterBalancedYouTubePlaylistCards(
          await searchYouTubeMusicSongCardsFromQueries(
            YOUTUBE_HOME_FALLBACK_QUERIES,
            Math.max(limit, 8),
            "More to Explore"
          ).catch(() => [] as YouTubeMusicPlaylistCard[]),
          limit
        ),
        limit
      )
    : null;

  const finalResults = dedupeYouTubeHomeSections(mapFilter(
    [...browseSections, fallbackSection],
    (section) => section,
    (section): section is YouTubeMusicHomeCategoryData => Boolean(section)
  ));
  if (!__DEV__ && finalResults.length > 0) void setCache(cacheKey, finalResults);
  return finalResults;
}

/**
 * Get search suggestions from YouTube Music
 */
export async function getYouTubeMusicSearchSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/search/suggestions", "/search/suggestions", [
        `q=${encodeURIComponent(q)}`,
        `query=${encodeURIComponent(q)}`,
      ]),
      signal
    );
    if (!json) return [];
    return getSearchSuggestionItems(json);
  } catch (error: any) {
    // Abort errors are expected when user types quickly - don't log them as errors
    if (isAbortLikeError(error) || signal?.aborted) {
      return [];
    }
    logger.error("YouTube Music suggestions error:", error);
    return [];
  }
}

export async function clearYouTubeMusicCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ytMusicKeys = keys.filter((key) => key.startsWith(YOUTUBE_MUSIC_CACHE_PREFIX));
    await AsyncStorage.multiRemove(ytMusicKeys);
  } catch (error) {
    logger.error("Failed to clear YouTube Music cache:", error);
  }
}
