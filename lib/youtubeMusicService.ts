import AsyncStorage from "@react-native-async-storage/async-storage";

import { JioSaavnImage, JioSaavnSong, Song, getBestImageUrl } from "@/lib/musicData";
import { getYouTubeMusicApiUrl } from "@/lib/api-config";
import { compactMap, mapFilter, sortedCopy } from "@/lib/arrayUtils";
import type { JioSaavnAlbumResult, JioSaavnPlaylistResult } from "./jioSaavnService";
import type { ArtistCard } from "./artistService";

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
  lyrics?: string | null;
}

type YouTubeMusicEndpointStyle = "pythonApi" | "pythonRoot";

// ─── Constants ────────────────────────────────────────────────────────────────

const YOUTUBE_MUSIC_CACHE_PREFIX = "@mavrixfy_youtube_music";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT_MS = 30000;

// ─── Cache Helpers ────────────────────────────────────────────────────────────

async function getCached<T>(key: string, ttl: number): Promise<T | null> {
  try {
    const [[, data], [, time]] = await AsyncStorage.multiGet([key, `${key}:time`]);
    if (!data || !time) return null;
    if (Date.now() - Number(time) > ttl) return null;
    return JSON.parse(data) as T;
  } catch {
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
  const artistNames = artistsArray.map((a: any) => a?.name).filter(Boolean);
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
    audioUrl: "", // Played by videoId through the YouTube iframe player
    year: normalizedTrack.year?.toString(),
    source: "youtube",
    hasLyrics: false,
    videoId: normalizedTrack.videoId,
    youtubeVideoId: normalizedTrack.videoId,
    youtubeVisualVideoId: visualVideoId,
    youtubeVideoType: normalizedTrack.videoType,
  };
}

/**
 * Convert YouTube Music track to JioSaavn-compatible format (for UI reuse)
 */
export function convertYouTubeMusicTrackToJioSaavn(track: YouTubeMusicTrack): JioSaavnSong | null {
  if (!track.videoId || !track.title) return null;

  const artistNames = track.artists?.map((a) => a.name).filter(Boolean) || [];
  const images = normalizeYouTubeThumbnails(track.thumbnails);

  return {
    id: track.videoId,
    name: track.title,
    type: "song",
    year: track.year || "",
    duration: parseDurationSeconds(track.duration_seconds) || parseDurationSeconds(track.duration),
    language: "en", // Default, could be enhanced with language detection
    hasLyrics: false,
    album: {
      id: track.album?.id || "",
      name: track.album?.name || "",
      url: "",
    },
    artists: {
      primary: track.artists?.map((a) => ({
        id: a.id || "",
        name: a.name,
        image: [],
        url: "",
      })) || [],
      featured: [],
      all: track.artists?.map((a) => ({
        id: a.id || "",
        name: a.name,
        role: "primary",
        image: [],
        url: "",
      })) || [],
    },
    image: images,
    downloadUrl: undefined,
    audioUrl: undefined,
    url: `https://music.youtube.com/watch?v=${track.videoId}`,
  };
}

// ─── Timeout Wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number = REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), ms)
    ),
  ]);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }));
  if (!res.ok) return null;
  return res.json();
}

async function fetchFirstJson<T>(urls: string[]): Promise<T | null> {
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const json = await fetchJson<T>(url);
      if (json !== null) return json;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

function getEndpointCandidates(
  path: string,
  _legacyNodePath?: string,
  query: string = ""
): string[] {
  const appBase = getYouTubeMusicApiUrl().replace(/\/+$/, "");
  const suffix = query ? `?${query}` : "";
  const styles: YouTubeMusicEndpointStyle[] = ["pythonApi", "pythonRoot"];

  return styles.map((style) => {
    if (style === "pythonApi") return `${appBase}/api${path}${suffix}`;
    return `${appBase}${path}${suffix}`;
  });
}

function getSearchResultItems(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Search YouTube Music for songs, albums, artists, or playlists
 */
export async function searchYouTubeMusic(
  query: string,
  type: "song" | "album" | "artist" | "playlist" = "song",
  limit: number = 20
): Promise<Song[]> {
  const q = query.trim();
  if (!q) {
    console.log('[YouTube Music] Empty query, returning empty array');
    return [];
  }

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:${type}:${limit}:${q.toLowerCase()}`;
  
  const cached = await getCached<Song[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  try {
    const encodedQuery = encodeURIComponent(q);
    const filterType = type === 'song' ? 'songs' : type === 'album' ? 'albums' : type === 'artist' ? 'artists' : type === 'playlist' ? 'playlists' : 'songs';
    const urls = getEndpointCandidates(
      "/search",
      "/search",
      `q=${encodedQuery}&filter=${filterType}&limit=${limit}`
    );

    const json = await fetchFirstJson<any>(urls);
    if (!json) {
      console.warn("[YouTube Music] Search returned no response");
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
    console.warn("[YouTube Music] Search failed (continuing without YouTube results):", error?.message || error);
    return [];
  }
}

/**
 * Search YouTube Music for albums
 */
export async function searchYouTubeMusicAlbums(
  query: string,
  limit = 8
): Promise<JioSaavnAlbumResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:album:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<JioSaavnAlbumResult[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        "/search",
        "/search",
        `q=${encodeURIComponent(q)}&filter=albums&limit=${limit}`
      )
    );
    const results = getSearchResultItems(json);
    const albums: JioSaavnAlbumResult[] = mapFilter(
      results,
      (item: any) => {
        const id = readString(item.browseId || item.playlistId);
        const name = readString(item.title || item.name);
        if (!id || !name) return null;

        const result: JioSaavnAlbumResult = {
          id,
          name,
          image: normalizeYouTubeThumbnails(item.thumbnails),
          songCount: Number(item.trackCount) || 0,
          year: readString(item.year) || undefined,
          artist: item.artists ? item.artists.map((a: any) => a.name).join(", ") : "",
          description: item.type || "YouTube Album",
        };
        return result;
      },
      (album): album is JioSaavnAlbumResult => album !== null
    );

    if (albums.length > 0) {
      await setCache(cacheKey, albums);
    }
    return albums;
  } catch (error) {
    console.warn("[YouTube Music] Album search failed:", error);
    return [];
  }
}

/**
 * Search YouTube Music for playlists
 */
export async function searchYouTubeMusicPlaylists(
  query: string,
  limit = 8
): Promise<JioSaavnPlaylistResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:playlist:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<JioSaavnPlaylistResult[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        "/search",
        "/search",
        `q=${encodeURIComponent(q)}&filter=playlists&limit=${limit}`
      )
    );
    const results = getSearchResultItems(json);
    const playlists: JioSaavnPlaylistResult[] = mapFilter(
      results,
      (item: any) => {
        const id = readString(item.browseId || item.playlistId);
        const name = readString(item.title || item.name);
        if (!id || !name) return null;

        return {
          id,
          name,
          image: normalizeYouTubeThumbnails(item.thumbnails),
          songCount: Number(item.trackCount) || 0,
        };
      },
      (playlist): playlist is JioSaavnPlaylistResult => playlist !== null
    );

    if (playlists.length > 0) {
      await setCache(cacheKey, playlists);
    }
    return playlists;
  } catch (error) {
    console.warn("[YouTube Music] Playlist search failed:", error);
    return [];
  }
}

/**
 * Search YouTube Music for artists
 */
export async function searchYouTubeMusicArtists(
  query: string,
  limit = 8
): Promise<ArtistCard[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:artist:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<ArtistCard[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        "/search",
        "/search",
        `q=${encodeURIComponent(q)}&filter=artists&limit=${limit}`
      )
    );
    const results = getSearchResultItems(json);
    const artists: ArtistCard[] = mapFilter(
      results,
      (item: any) => {
        const id = readString(item.browseId);
        const name = readString(item.artist || item.title || item.name);
        if (!id || !name) return null;

        const result: ArtistCard = {
          id,
          name,
          image: normalizeYouTubeThumbnails(item.thumbnails),
          followerCount: null,
          fanCount: null,
          isVerified: false,
          dominantLanguage: null,
        };
        return result;
      },
      (artist): artist is ArtistCard => artist !== null
    );

    if (artists.length > 0) {
      await setCache(cacheKey, artists);
    }
    return artists;
  } catch (error) {
    console.warn("[YouTube Music] Artist search failed:", error);
    return [];
  }
}

/**
 * Search YouTube Music for videos (with movement / actual motion)
 */
export async function searchYouTubeMusicVideos(
  query: string,
  limit = 8
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
        `q=${encodeURIComponent(q)}&filter=videos&limit=${limit}`
      )
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
  } catch (error) {
    console.warn("[YouTube Music] Video search failed:", error);
    return [];
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
    const playlist = json?.data || json;

    await setCache(cacheKey, playlist);
    return playlist;
  } catch (error) {
    console.error("YouTube Music playlist error:", error);
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
    const artist = json?.data || json;

    await setCache(cacheKey, artist);
    return artist;
  } catch (error) {
    console.error("YouTube Music artist error:", error);
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
    const album = json?.data || json;

    await setCache(cacheKey, album);
    return album;
  } catch (error) {
    console.error("YouTube Music album error:", error);
    return null;
  }
}

/**
 * Get YouTube Music watch queue details for one video.
 * A song track often has a counterpart videoId for the actual music video.
 */
export async function getYouTubeMusicWatchPlaylist(
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
      lyrics: readString(source?.lyrics) || null,
    };

    await setCache(cacheKey, watchPlaylist);
    return watchPlaylist;
  } catch (error) {
    console.warn("YouTube Music watch playlist error:", error);
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
      console.warn("[YouTube Music] Visual fallback search failed:", err);
    }
  }

  return extractVideoId({ videoId: counterpartId, id: counterpartId }) || existingVisualId || audioVideoId;
}

/**
 * Get trending/chart songs from YouTube Music
 */
export async function getYouTubeMusicTrending(country: string = "IN"): Promise<Song[]> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:trending:${country}`;
  const cached = await getCached<Song[]>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/charts", "/charts", `country=${encodeURIComponent(country)}`)
    );
    if (!json) return [];
    const candidates: any[] = [];
    if (json.daily && Array.isArray(json.daily)) candidates.push(...json.daily);
    if (json.videos && Array.isArray(json.videos)) candidates.push(...json.videos);
    if (json.weekly && Array.isArray(json.weekly)) candidates.push(...json.weekly);

    let playlistId = "";
    const trendingPlaylist = candidates.find(p => p && p.playlistId && String(p.title || "").toLowerCase().includes("trending"));
    if (trendingPlaylist) {
      playlistId = trendingPlaylist.playlistId;
    } else if (candidates.length > 0 && candidates[0] && candidates[0].playlistId) {
      playlistId = candidates[0].playlistId;
    }

    if (!playlistId) {
      playlistId = country === "IN" ? "OLAK5uy_lSTp1DIuzZBUyee3kDsXwPgP25WdfwB40" : "OLAK5uy_kNWGJvgWVqlt5LsFDL9Sdluly4M8TvGkM";
    }

    const playlistData = await getYouTubeMusicPlaylist(playlistId);
    const tracks = playlistData?.tracks || [];

    const songs = mapFilter(
      tracks,
      (track: any) => convertYouTubeMusicTrack(track),
      (song): song is Song => song !== null
    );

    await setCache(cacheKey, songs);
    return songs;
  } catch (error) {
    console.error("YouTube Music trending error:", error);
    return [];
  }
}

export interface YouTubeMusicPlaylistCard {
  id: string;
  name: string;
  imageUrl: string;
  songCount?: number;
}

export async function getYouTubeMusicTrendingPlaylists(country: string = "IN"): Promise<YouTubeMusicPlaylistCard[]> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:trending_playlists:${country}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/charts", "/charts", `country=${encodeURIComponent(country)}`)
    );
    if (!json) return [];

    const rawPlaylists: any[] = [];
    if (json.daily && Array.isArray(json.daily)) rawPlaylists.push(...json.daily);
    if (json.videos && Array.isArray(json.videos)) rawPlaylists.push(...json.videos);
    if (json.weekly && Array.isArray(json.weekly)) rawPlaylists.push(...json.weekly);

    const playlists = mapFilter(
      rawPlaylists,
      (item: any) => {
        const id = item.playlistId || item.browseId;
        const name = item.title || item.name;
        if (!id || !name) return null;

        const bestImage = item.thumbnails && item.thumbnails.length > 0
          ? item.thumbnails[item.thumbnails.length - 1].url
          : "";

        const result: YouTubeMusicPlaylistCard = {
          id,
          name,
          imageUrl: bestImage,
          songCount: Number(item.trackCount) || 20,
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

    await setCache(cacheKey, uniquePlaylists);
    return uniquePlaylists;
  } catch (error) {
    console.error("YouTube Music trending playlists error:", error);
    return [];
  }
}

/**
 * Get search suggestions from YouTube Music
 */
export async function getYouTubeMusicSearchSuggestions(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/search/suggestions", "/search/suggestions", `q=${encodeURIComponent(q)}`)
        .slice(0, 2)
    );
    if (!json) return [];
    return Array.isArray(json) ? json : [];
  } catch (error) {
    console.error("YouTube Music suggestions error:", error);
    return [];
  }
}

export async function clearYouTubeMusicCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ytMusicKeys = keys.filter((key) => key.startsWith(YOUTUBE_MUSIC_CACHE_PREFIX));
    await AsyncStorage.multiRemove(ytMusicKeys);
  } catch (error) {
    console.error("Failed to clear YouTube Music cache:", error);
  }
}
