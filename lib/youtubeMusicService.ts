import AsyncStorage from "@react-native-async-storage/async-storage";

import { JioSaavnImage, Song } from "@/lib/musicData";
import { getYouTubeMusicApiUrl } from "@/lib/api-config";
import { compactMap, mapFilter, sortedCopy } from "@/lib/arrayUtils";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface YouTubeMusicTrack {
  videoId: string;
  title: string;
  artists: Array<{ name: string; id?: string }>;
  album?: { name: string; id?: string };
  duration?: number | string; // seconds or mm:ss from ytmusicapi
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
}

const YOUTUBE_MUSIC_CACHE_PREFIX = "@mavrixfy_youtube_music";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT_MS = 30000;
const CURRENT_YEAR = new Date().getFullYear();
const HOME_YOUTUBE_CATEGORY_CONCURRENCY = 2;
const PREVIOUS_YEAR = CURRENT_YEAR - 1;
const AUDIO_STREAM_EXPIRY_MARGIN_MS = 60 * 1000;
const AUDIO_STREAM_CACHE_MAX_ITEMS = 50;
const audioStreamCache = new Map<string, YouTubeMusicAudioStream>();
const audioStreamRequests = new Map<string, Promise<YouTubeMusicAudioStream | null>>();

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

function upscaleYouTubeThumbnail(url: string): string {
  if (!url) return "";
  
  // 1. Googleusercontent / ggpht / yt3 images
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com") || url.includes("yt3.ggpht.com") || url.includes("yt3.googleusercontent.com")) {
    // Replace width/height parameters with 500x500
    return url.replace(/=w\d+-h\d+(?:-[a-zA-Z0-9-]+)?$/, "=w500-h500-l90-rj");
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
  if (!thumbnails || thumbnails.length === 0) return "";
  
  // Sort by resolution (largest first)
  const sorted = sortedCopy(thumbnails, (a, b) => {
    const aRes = a.width * a.height;
    const bRes = b.width * b.height;
    return bRes - aRes;
  });
  
  return upscaleYouTubeThumbnail(sorted[0]?.url || "");
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
    duration: track?.duration,
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

/**
 * Convert YouTube Music track to app's Song format
 * Handles ytmusicapi response format from Python FastAPI backend
 */
export function convertYouTubeMusicTrack(track: any): Song | null {
  const normalizedTrack = normalizeTrackShape(track);
  if (!normalizedTrack) return null;

  // Handle artists array from ytmusicapi
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
    audioUrl: "", // YouTube songs play through the embedded iframe player.
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

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS, signal);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    return res.json();
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
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function fetchFirstJsonSequential<T>(urls: string[], signal?: AbortSignal): Promise<T | null> {
  return fetchFirstJson<T>(urls, signal);
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
  const pathCandidates = isPrivateDevelopmentApiUrl(appBase)
    ? [`${appBase}${normalizedPath}`]
    : appBase.includes("/api/youtube-music")
      ? [`${appBase}${normalizedPath}`, `${appBase}/api${normalizedPath}`]
      : [
          `${appBase}${normalizedPath}`,
          `${appBase}/api/youtube-music${normalizedPath}`,
          `${appBase}/api${normalizedPath}`,
        ];
  const queryCandidates = Array.isArray(query) ? query : [query];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const queryCandidate of queryCandidates) {
    const suffix = queryCandidate ? `?${queryCandidate}` : "";
    for (const pathCandidate of pathCandidates) {
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
  const appBase = getYouTubeMusicApiUrl();
  // On a private LAN dev server both param forms work; only send one to halve request variants.
  if (isPrivateDevelopmentApiUrl(appBase)) {
    return [`q=${encodedQuery}&filter=${filter}&limit=${limit}`];
  }
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
  const url = readString(source?.url);
  if (!url.startsWith("https://")) return null;

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
    url,
    expiresAt,
    headers,
    mimeType: readString(source?.mimeType) || undefined,
    formatId: readString(source?.formatId) || undefined,
    audioCodec: readString(source?.audioCodec) || undefined,
    bitrateKbps: Number.isFinite(Number(source?.bitrateKbps)) ? Number(source.bitrateKbps) : null,
    duration: Number.isFinite(Number(source?.duration)) ? Number(source.duration) : null,
  };
}

function getChartsPayload(json: any): any {
  if (json?.charts && typeof json.charts === "object") return json.charts;
  if (json?.data?.charts && typeof json.data.charts === "object") return json.data.charts;
  if (json?.data && typeof json.data === "object") return json.data;
  return json;
}

function getChartPlaylistItems(json: any): any[] {
  const charts = getChartsPayload(json);
  const playlists: any[] = [];
  const append = (value: any) => {
    if (Array.isArray(value)) {
      playlists.push(...value);
      return;
    }

    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.playlists)) playlists.push(...value.playlists);
    if (Array.isArray(value.items)) playlists.push(...value.items);
    if (value.playlistId || value.browseId) playlists.push(value);
  };

  append(charts?.daily);
  append(charts?.videos);
  append(charts?.weekly);
  append(charts?.trending);
  append(charts?.playlists);
  append(charts?.songs);

  return playlists;
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
    logger.debug("[YouTube Music] Empty query, returning empty array");
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

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:video:${limit}:${q.toLowerCase()}`;
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
        if (song) {
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

  const cached = audioStreamCache.get(cleanVideoId);
  if (cached && cached.expiresAt - AUDIO_STREAM_EXPIRY_MARGIN_MS > Date.now()) {
    return cached;
  }
  audioStreamCache.delete(cleanVideoId);

  const pending = audioStreamRequests.get(cleanVideoId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const encodedVideoId = encodeURIComponent(cleanVideoId);
      const json = await fetchFirstJson<any>(
        [
          ...getEndpointCandidates(`/audio/${encodedVideoId}`, `/audio/${encodedVideoId}`),
          ...getEndpointCandidates(`/stream-info/${encodedVideoId}`, `/stream-info/${encodedVideoId}`),
        ],
        signal
      );
      const stream = normalizeAudioStreamPayload(json, cleanVideoId);
      if (!stream) {
        logger.warn("[YouTube Music] Audio resolver returned no direct stream URL", { videoId: cleanVideoId });
        return null;
      }

      audioStreamCache.set(cleanVideoId, stream);
      if (audioStreamCache.size > AUDIO_STREAM_CACHE_MAX_ITEMS) {
        const oldestKey = audioStreamCache.keys().next().value;
        if (oldestKey) audioStreamCache.delete(oldestKey);
      }

      return stream;
    } catch (error: any) {
      if (error?.message === "Request aborted" || signal?.aborted) {
        return null;
      }
      logger.warn("[YouTube Music] Audio resolver failed:", error?.message || error);
      return null;
    } finally {
      audioStreamRequests.delete(cleanVideoId);
    }
  })();

  audioStreamRequests.set(cleanVideoId, request);
  return request;
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

  if (!audioVideoId) return existingVisualId || null;

  const watch = await getYouTubeMusicWatchPlaylist(audioVideoId, { limit: 5, radio: false });
  const currentTrack =
    watch?.tracks.find((track) => track.videoId === audioVideoId) ||
    watch?.tracks[0] ||
    null;
  let counterpartId = currentTrack?.counterpart?.videoId || "";

  if (!counterpartId && song.title && song.artist) {
    try {
      const searchResults = await searchYouTubeMusicVideos(`${song.title} ${song.artist}`, 2);
      if (searchResults.length > 0) {
        const firstVideo = searchResults[0];
        if (firstVideo && firstVideo.youtubeVideoId) {
          counterpartId = firstVideo.youtubeVideoId;
        }
      }
    } catch (err) {
      logger.warn("[YouTube Music] Visual fallback search failed:", err);
    }
  }

  return extractVideoId({ videoId: counterpartId, id: counterpartId }) || existingVisualId || audioVideoId;
}

export interface YouTubeMusicPlaylistCard {
  id: string;
  name: string;
  imageUrl: string;
  songCount?: number;
  author?: string;
  category?: string;
  description?: string;
  kind?: YouTubeMusicPlaylistKind;
}

export type YouTubeMusicPlaylistKind = "chart" | "editorial" | "featured" | "community";

export interface YouTubeMusicHomeCategoryData {
  id: string;
  title: string;
  results: YouTubeMusicPlaylistCard[];
}

type HomeYouTubeMusicCategoryConfig = {
  id: string;
  title: string;
  searchTerms: string[];
  requiredAny: string[];
  preferredAny: string[];
  blockedAny?: string[];
  useCharts?: boolean;
  useHome?: boolean;
};

const HINDI_CATEGORY_BLOCKED_TERMS = [
  "kannada",
  "malayalam",
  "tamil",
  "telugu",
  "bhojpuri",
];

const STALE_YEAR_TERMS = Array.from({ length: Math.max(0, CURRENT_YEAR - 2016) }, (_, index) => String(2016 + index))
  .filter((year) => year !== String(PREVIOUS_YEAR) && year !== String(CURRENT_YEAR));

const HOME_YOUTUBE_MUSIC_CATEGORY_VERSION = "v3";
const YOUTUBE_HOME_INDIAN_TERMS = [
  "bollywood",
  "desi",
  "hindi",
  "india",
  "indian",
];
const YOUTUBE_HOME_BLOCKED_TERMS = [
  ...HINDI_CATEGORY_BLOCKED_TERMS,
  ...STALE_YEAR_TERMS,
  "bhajan",
  "couple",
  "devotional",
  "dj",
  "haryanvi",
  "hip hop",
  "instrumental",
  "international",
  "karaoke",
  "kids",
  "lyrics",
  "party",
  "punjabi",
  "rap",
  "remix",
  "lofi",
  "nursery",
  "podcast",
  "sangeet",
  "sleep",
  "study",
  "urban",
  "wedding",
];

const HOME_YOUTUBE_MUSIC_CATEGORIES: HomeYouTubeMusicCategoryConfig[] = [
  {
    id: "trending",
    title: "Trending Now",
    useCharts: true,
    useHome: true,
    searchTerms: [
      `trending songs india ${CURRENT_YEAR}`,
      `trending bollywood hindi songs ${CURRENT_YEAR} playlist`,
      `viral hits india ${CURRENT_YEAR}`,
      `trending music ${CURRENT_YEAR} india`,
    ],
    requiredAny: ["trending", "viral", "top", "chart", "hits", "hindi", "bollywood", "india"],
    preferredAny: ["trending", "viral", "top", "chart", String(CURRENT_YEAR), "hindi", "bollywood", "india", "songs"],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
  {
    id: "top-charts",
    title: "Top Charts",
    useCharts: true,
    useHome: true,
    searchTerms: [
      `top charts india ${CURRENT_YEAR}`,
      `top 50 hindi songs ${CURRENT_YEAR}`,
      `music charts ${CURRENT_YEAR}`,
      `bollywood top charts`,
    ],
    requiredAny: ["chart", "top", "ranked", "best", "#"],
    preferredAny: ["chart", "top", "ranked", String(CURRENT_YEAR), "hindi", "bollywood", "india", "50", "100"],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
  {
    id: "new-releases",
    title: "New Releases",
    useHome: true,
    useCharts: false,
    searchTerms: [
      `new releases ${CURRENT_YEAR} india`,
      `latest songs ${CURRENT_YEAR}`,
      `new hindi music ${CURRENT_YEAR} playlist`,
      `fresh releases bollywood ${CURRENT_YEAR}`,
    ],
    requiredAny: ["new", "latest", String(CURRENT_YEAR), "fresh", "release"],
    preferredAny: ["new", "latest", "release", String(CURRENT_YEAR), "bollywood", "hindi", "songs", "music"],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
  {
    id: "ranked",
    title: "Top Ranked",
    useCharts: true,
    useHome: true,
    searchTerms: [
      `top ranked songs ${CURRENT_YEAR}`,
      `best of ${CURRENT_YEAR} india`,
      `most popular hindi songs ${CURRENT_YEAR}`,
      `top rated bollywood`,
    ],
    requiredAny: ["ranked", "rating", "top", "best", "most", "popular"],
    preferredAny: ["ranked", "rating", "top", "best", String(CURRENT_YEAR), "hindi", "bollywood", "popular"],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
  {
    id: "viral-hits",
    title: "Viral Hits",
    useHome: true,
    searchTerms: [
      `viral songs ${CURRENT_YEAR} india`,
      `viral hits hindi ${CURRENT_YEAR}`,
      `trending reels music ${CURRENT_YEAR}`,
      `viral bollywood songs`,
    ],
    requiredAny: ["viral", "trending", "reels", "shorts"],
    preferredAny: ["viral", "trending", "reels", String(CURRENT_YEAR), "hindi", "india", "songs"],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
  {
    id: "bollywood",
    title: "Bollywood Hits",
    useHome: true,
    searchTerms: [
      `bollywood hits ${CURRENT_YEAR}`,
      `hindi songs playlist ${CURRENT_YEAR}`,
      `bollywood essentials`,
      `best bollywood songs ${CURRENT_YEAR}`,
    ],
    requiredAny: ["bollywood", "hindi", "india"],
    preferredAny: ["bollywood", "hindi", "hits", "top", "songs", "best", String(CURRENT_YEAR)],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
  {
    id: "hot-right-now",
    title: "Hot Right Now",
    useHome: true,
    useCharts: true,
    searchTerms: [
      `hot songs ${CURRENT_YEAR} india`,
      `right now trending hindi`,
      `currently popular bollywood`,
      `hot hits ${CURRENT_YEAR}`,
    ],
    requiredAny: ["hot", "now", "current", "today", "this week"],
    preferredAny: ["hot", "right now", "current", String(CURRENT_YEAR), "hindi", "bollywood", "trending"],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
  {
    id: "popular",
    title: "Most Popular",
    useHome: true,
    searchTerms: [
      `most popular songs ${CURRENT_YEAR}`,
      `most played hindi songs`,
      `popular bollywood playlist`,
      `best hindi songs ${CURRENT_YEAR}`,
    ],
    requiredAny: ["popular", "top", "hits", "best", "most played", "most"],
    preferredAny: ["popular", "most", "top", "hits", "best", "bollywood", "hindi", String(CURRENT_YEAR)],
    blockedAny: YOUTUBE_HOME_BLOCKED_TERMS,
  },
];

function dedupeYouTubePlaylistCards(playlists: YouTubeMusicPlaylistCard[]): YouTubeMusicPlaylistCard[] {
  const seen = new Set<string>();
  const unique: YouTubeMusicPlaylistCard[] = [];

  for (const playlist of playlists) {
    const id = readString(playlist.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...playlist, id });
  }

  return unique;
}

function includesAnyTerm(text: string, terms: string[] | undefined): boolean {
  return Boolean(terms?.some((term) => text.includes(term.toLowerCase())));
}

function countTermMatches(text: string, terms: string[] | undefined): number {
  if (!terms) return 0;
  return terms.reduce((count, term) => count + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function normalizeYouTubePlaylistKind(raw: any, fallbackKind?: YouTubeMusicPlaylistKind): YouTubeMusicPlaylistKind {
  if (fallbackKind) return fallbackKind;

  const category = readString(raw?.category).toLowerCase();
  const author = readString(raw?.author || raw?.owner || raw?.channel?.name).toLowerCase();
  const id = readString(raw?.browseId || raw?.playlistId || raw?.id);

  if (category.includes("chart")) return "chart";
  if (author === "youtube music" || id.startsWith("VLRDCLAK5uy_")) return "editorial";
  if (category.includes("featured")) return "featured";
  return "community";
}

function normalizeYouTubePlaylistCard(raw: any, fallbackKind?: YouTubeMusicPlaylistKind): YouTubeMusicPlaylistCard | null {
  const id = readString(raw?.browseId || raw?.playlistId || raw?.id);
  const name = readString(raw?.title || raw?.name);
  if (!id || !name) return null;

  const thumbnails = normalizeThumbnails(raw?.thumbnails || raw?.thumbnail || raw?.image);
  const imageUrl = getBestThumbnailUrl(thumbnails);

  return {
    id,
    name,
    imageUrl,
    songCount: Number(raw?.trackCount || raw?.itemCount || raw?.count) || undefined,
    author: readString(raw?.author || raw?.owner || raw?.channel?.name) || undefined,
    category: readString(raw?.category) || undefined,
    description: readString(raw?.description) || undefined,
    kind: normalizeYouTubePlaylistKind(raw, fallbackKind),
  };
}

function isPlaylistLikeTitle(text: string): boolean {
  return includesAnyTerm(text, [
    "playlist",
    "songs",
    "hits",
    "mix",
    "essentials",
    "top",
    "best",
    "chart",
    "jukebox",
    "nonstop",
  ]);
}

function isRelevantYouTubeHomePlaylist(
  playlist: YouTubeMusicPlaylistCard,
  category: HomeYouTubeMusicCategoryConfig
): boolean {
  const text = `${playlist.name} ${playlist.author || ""} ${playlist.category || ""} ${playlist.description || ""}`.toLowerCase();

  // Block unwanted content
  if (includesAnyTerm(text, category.blockedAny)) return false;
  
  // For non-Indian content categories, check if it's regionally relevant
  const isIndianContentCategory = category.id === "bollywood" || category.id === "trending" || 
                                   category.id === "popular" || category.id === "new-arrivals";
  if (isIndianContentCategory && !includesAnyTerm(text, YOUTUBE_HOME_INDIAN_TERMS)) {
    // Allow if it's official YouTube Music content
    if (playlist.kind !== "chart" && playlist.kind !== "editorial") {
      return false;
    }
  }
  
  const requiredMatches = countTermMatches(text, category.requiredAny);
  if (requiredMatches === 0) return false;

  const isOfficial = playlist.kind === "chart" || playlist.kind === "editorial" || playlist.kind === "featured";
  const preferredMatches = countTermMatches(text, category.preferredAny);
  const playlistLike = isPlaylistLikeTitle(text);

  // More lenient for official content
  if (isOfficial) {
    return playlistLike || requiredMatches >= 1 || preferredMatches >= 2;
  }

  // Stricter for community playlists
  return playlistLike && (requiredMatches >= 2 || preferredMatches >= 2);
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

function getHomeShelfItems(json: any): any[] {
  const payload = getResponsePayload(json, "home", "shelves", "results");
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(json?.home)) return json.home;
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
  const description = readString(item?.description);
  const author = readString(item?.author || item?.owner || item?.channel?.name) || description.split("•")[0]?.trim();

  return {
    id,
    name,
    imageUrl: getBestThumbnailUrl(thumbnails),
    songCount: Number(item?.trackCount || item?.itemCount || item?.count) || undefined,
    author: author || "YouTube Music",
    category: "YouTube Home",
    description: description || undefined,
    kind: normalizeYouTubePlaylistKind(item, "featured"),
  };
}

async function getYouTubeMusicHomePlaylistCards(limit: number): Promise<YouTubeMusicPlaylistCard[]> {
  const safeLimit = Math.max(1, Math.min(limit, 10));
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_shelves:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${safeLimit}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/home", "/home", `limit=${safeLimit}`)
    );
    if (!json) return [];

    const cards = dedupeYouTubePlaylistCards(getHomeShelfItems(json).flatMap((shelf: any) => {
      const contents = Array.isArray(shelf?.contents)
        ? shelf.contents
        : Array.isArray(shelf?.items)
          ? shelf.items
          : [];

      return mapFilter(
        contents,
        (item: any) => normalizeHomeShelfPlaylistCard(item),
        (playlist): playlist is YouTubeMusicPlaylistCard => Boolean(playlist)
      );
    }));

    if (cards.length > 0) {
      await setCache(cacheKey, cards);
    }
    return cards;
  } catch (error) {
    if (isAbortLikeError(error)) {
      logger.debug("[YouTube Music] Home shelves fetch aborted");
      return [];
    }
    logger.warn("[YouTube Music] Home shelves fetch failed:", error);
    return [];
  }
}

function scoreYouTubeHomePlaylist(
  playlist: YouTubeMusicPlaylistCard,
  category: HomeYouTubeMusicCategoryConfig
): number {
  const text = playlist.name.toLowerCase();
  const author = (playlist.author || "").toLowerCase();
  const description = (playlist.description || "").toLowerCase();
  const fullText = `${text} ${author} ${description}`;
  let score = 0;

  // Strongly prefer official content
  if (playlist.kind === "chart") score += 120;
  if (playlist.kind === "editorial") score += 100;
  if (playlist.kind === "featured") score += 80;
  if (author.includes("music")) score += 50; // Any official music service

  // Category-specific matches (increased weights)
  score += countTermMatches(fullText, category.requiredAny) * 35;
  score += countTermMatches(fullText, category.preferredAny) * 20;

  // Boost for current year content
  if (fullText.includes(String(CURRENT_YEAR))) score += 40;
  
  // Boost for regional/language content
  if (fullText.includes("hindi") || fullText.includes("bollywood") || fullText.includes("india") || fullText.includes("indian")) score += 32;
  
  // Boost for playlist-like titles
  if (text.includes("playlist") || text.includes("mix") || text.includes("essentials") || text.includes("best of")) score += 22;

  // Category-specific bonuses (increased)
  if (category.id === "trending") {
    if (fullText.includes("trending") || fullText.includes("viral")) score += 50;
    if (fullText.includes("top") || fullText.includes("chart")) score += 45;
    if (fullText.includes("now") || fullText.includes("today")) score += 35;
  }
  
  if (category.id === "top-charts") {
    if (fullText.includes("chart") || fullText.includes("top")) score += 55;
    if (fullText.includes("50") || fullText.includes("100")) score += 40;
    if (fullText.includes("ranked") || fullText.includes("#")) score += 35;
  }
  
  if (category.id === "new-releases") {
    if (fullText.includes("new") || fullText.includes("latest") || fullText.includes("fresh")) score += 50;
    if (fullText.includes("release")) score += 45;
    if (fullText.includes(String(CURRENT_YEAR))) score += 35;
  }
  
  if (category.id === "ranked") {
    if (fullText.includes("ranked") || fullText.includes("rating")) score += 50;
    if (fullText.includes("top") || fullText.includes("best")) score += 40;
  }
  
  if (category.id === "viral-hits") {
    if (fullText.includes("viral") || fullText.includes("trending")) score += 50;
    if (fullText.includes("reels") || fullText.includes("shorts")) score += 40;
  }
  
  if (category.id === "hot-right-now") {
    if (fullText.includes("hot") || fullText.includes("right now")) score += 50;
    if (fullText.includes("current") || fullText.includes("today")) score += 40;
  }
  
  if (category.id === "bollywood") {
    if (fullText.includes("bollywood")) score += 45;
    if (fullText.includes("hindi")) score += 35;
  }
  
  if (category.id === "popular") {
    if (fullText.includes("popular") || fullText.includes("most played") || fullText.includes("best")) score += 42;
  }

  // Additional semantic bonuses
  if (text.includes("hits") || text.includes("greatest")) score += 18;
  if (text.includes("party") || text.includes("dance")) score += category.id === "party-mix" ? 30 : 10;
  if (text.includes("lofi") || text.includes("chill") || text.includes("sukoon") || text.includes("calm")) score += category.id === "chill-vibes" ? 30 : 10;
  if (text.includes("romantic") || text.includes("love") || text.includes("romance")) score += category.id === "romance" ? 30 : 10;
  if (text.includes("workout") || text.includes("gym") || text.includes("fitness")) score += category.id === "workout" ? 30 : 10;
  if (text.includes("retro") || text.includes("classic") || text.includes("old") || text.includes("90s") || text.includes("80s")) score += category.id === "retro" ? 30 : -8;

  // Boost for higher song counts (indicates curated playlists)
  const songCount = Number(playlist.songCount || 0);
  if (songCount > 0) {
    score += Math.min(songCount * 0.5, 60); // Up to 60 points for song count
  }
  
  return score;
}

async function runYouTubeHomeCategoryLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    const currentIndex = nextIndex;
    nextIndex += 1;
    if (currentIndex >= items.length) return;

    results[currentIndex] = await worker(items[currentIndex]);
    return runWorker();
  };

  await Promise.all(Array.from({ length: maxWorkers }, () => runWorker()));
  return results;
}

async function getYouTubeHomeCategoryPlaylists(
  category: HomeYouTubeMusicCategoryConfig,
  limit: number
): Promise<YouTubeMusicPlaylistCard[]> {
  const searchLimit = Math.max(limit * 2, 15); // Fetch more to ensure we have enough after filtering
  const chartPlaylistsPromise = category.useCharts
    ? getYouTubeMusicTrendingPlaylists("IN").catch(() => [] as YouTubeMusicPlaylistCard[])
    : Promise.resolve([] as YouTubeMusicPlaylistCard[]);
  const homePlaylistsPromise = category.useHome
    ? getYouTubeMusicHomePlaylistCards(10).catch(() => [] as YouTubeMusicPlaylistCard[])
    : Promise.resolve([] as YouTubeMusicPlaylistCard[]);
  const searchResultsPromise = Promise.all(
    category.searchTerms.slice(0, 3).map(async (term) => {
      try {
        return await searchYouTubeMusicPlaylistCards(term, searchLimit);
      } catch {
        return [];
      }
    })
  );
  const [chartPlaylists, homePlaylists, searchResults] = await Promise.all([
    chartPlaylistsPromise,
    homePlaylistsPromise,
    searchResultsPromise,
  ]);

  const playlists = [...chartPlaylists, ...homePlaylists, ...searchResults.flat()];

  return dedupeYouTubePlaylistCards(playlists)
    .filter((playlist) => isRelevantYouTubeHomePlaylist(playlist, category))
    .sort((a, b) => scoreYouTubeHomePlaylist(b, category) - scoreYouTubeHomePlaylist(a, category))
    .slice(0, limit);
}

function selectRelevantYouTubeTrendingPlaylists(playlists: YouTubeMusicPlaylistCard[]): YouTubeMusicPlaylistCard[] {
  const trendingCategory = HOME_YOUTUBE_MUSIC_CATEGORIES[0];
  return playlists
    .filter((playlist) => isRelevantYouTubeHomePlaylist(playlist, trendingCategory))
    .sort((a, b) => scoreYouTubeHomePlaylist(b, trendingCategory) - scoreYouTubeHomePlaylist(a, trendingCategory));
}

/** Default categories on home — fetch only these 4 when no IDs are specified. */
const HOME_YOUTUBE_DEFAULT_CATEGORY_IDS = new Set(["trending", "top-charts", "new-releases", "bollywood"]);

export async function getHomeYouTubeMusicCategories(options?: {
  limitPerCategory?: number;
  categoryIds?: string[];
}): Promise<YouTubeMusicHomeCategoryData[]> {
  const limit = Math.min(options?.limitPerCategory ?? 8, 12);
  const requestedIds = options?.categoryIds ?? [];
  // When no IDs are specified, use only the 4 default categories to reduce traffic.
  const effectiveIds = requestedIds.length > 0 ? requestedIds : [...HOME_YOUTUBE_DEFAULT_CATEGORY_IDS];
  const categoryIdFilter = new Set(effectiveIds);

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_categories:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${limit}:${[...categoryIdFilter].sort().join(",")}`;
  const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, 60 * 60 * 1000);
  if (cached) return cached;

  const categoriesToFetch = HOME_YOUTUBE_MUSIC_CATEGORIES.filter((c) => categoryIdFilter.has(c.id));
  if (categoriesToFetch.length === 0) return [];

  // ── Fetch shared sources ONCE, reuse across all categories ───────────────────
  // Old pattern fired charts+home once PER category (n×2 requests).
  // New pattern fires them once total and passes the result pool down.
  const [sharedChartPlaylists, sharedHomePlaylists] = await Promise.all([
    getYouTubeMusicTrendingPlaylists("IN").catch(() => [] as YouTubeMusicPlaylistCard[]),
    getYouTubeMusicHomePlaylistCards(10).catch(() => [] as YouTubeMusicPlaylistCard[]),
  ]);
  const sharedPool = dedupeYouTubePlaylistCards([...sharedChartPlaylists, ...sharedHomePlaylists]);

  // ── One search query per category instead of 3, at controlled concurrency ────
  const searchLimit = Math.max(limit * 2, 12);
  const categoryResults = await runYouTubeHomeCategoryLimit(
    categoriesToFetch,
    HOME_YOUTUBE_CATEGORY_CONCURRENCY,
    async (category) => {
      const primaryTerm = category.searchTerms[0];
      let searchResults: YouTubeMusicPlaylistCard[] = [];
      if (primaryTerm) {
        try {
          searchResults = await searchYouTubeMusicPlaylistCards(primaryTerm, searchLimit);
        } catch {
          // non-fatal — sharedPool still covers this category
        }
      }
      const results = dedupeYouTubePlaylistCards([...sharedPool, ...searchResults])
        .filter((p) => isRelevantYouTubeHomePlaylist(p, category))
        .sort((a, b) => scoreYouTubeHomePlaylist(b, category) - scoreYouTubeHomePlaylist(a, category))
        .slice(0, limit);
      return { id: category.id, title: category.title, results };
    }
  );

  const finalResults = categoryResults.filter((c) => c.results.length > 0);
  if (finalResults.length > 0) void setCache(cacheKey, finalResults);
  return finalResults;
}

export async function getYouTubeMusicTrendingPlaylists(country: string = "IN"): Promise<YouTubeMusicPlaylistCard[]> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:trending_playlists:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${country}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, CACHE_TTL_MS);
  if (cached) {
    return selectRelevantYouTubeTrendingPlaylists(cached.map((playlist) => ({
      ...playlist,
      author: playlist.author || "YouTube Music",
      category: playlist.category || "Charts",
      kind: playlist.kind || "chart",
    })));
  }

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/charts", "/charts", `country=${encodeURIComponent(country)}`)
    );
    if (!json) return [];

    const rawPlaylists = getChartPlaylistItems(json);

    const playlists = mapFilter(
      rawPlaylists,
      (item: any) => {
        const id = item.playlistId || item.browseId;
        const name = item.title || item.name;
        if (!id || !name) return null;

        // Get best quality thumbnail
        const thumbnails = item.thumbnails || [];
        const bestImage = thumbnails.length > 0
          ? thumbnails[thumbnails.length - 1].url
          : "";

        const result: YouTubeMusicPlaylistCard = {
          id,
          name,
          imageUrl: upscaleYouTubeThumbnail(bestImage),
          songCount: Number(item.trackCount || item.itemCount) || 50,
          author: item.author || "YouTube Music",
          category: item.category || "Charts",
          description: item.description || undefined,
          kind: "chart",
        };
        return result;
      },
      (p): p is YouTubeMusicPlaylistCard => p !== null
    );

    const seen = new Set<string>();
    const uniquePlaylists = playlists.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    const finalPlaylists = selectRelevantYouTubeTrendingPlaylists(uniquePlaylists);

    await setCache(cacheKey, finalPlaylists);
    return finalPlaylists;
  } catch (error) {
    if (isAbortLikeError(error)) {
      logger.debug("[YouTube Music] Trending playlists fetch aborted");
      return [];
    }
    logger.warn("YouTube Music trending playlists error:", error);
    return [];
  }
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
