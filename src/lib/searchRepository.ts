import { searchCatalog } from "@/lib/catalogService";
import { Song,type JioSaavnImage } from "@/lib/musicData";
import { deduplicateSongs,parseStructuredQuery,rankSongs } from "@/lib/searchUtils";
import { toDurationSeconds } from "@/utils/timeFormatters";

import { fetchJson } from "@/utils/asyncUtils";
export type ResultFilter = "all" | "songs" | "albums" | "artists" | "playlists";

export interface PlaylistResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
  url?: string;
  description?: string;
  language?: string;
}

export interface AlbumResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
  year?: string;
  language?: string;
  url?: string;
  artist?: string;
  description?: string;
}

export interface ArtistResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  subtitle?: string;
  url?: string;
  followerCount?: number | null;
  dominantLanguage?: string | null;
}

export interface SearchResults {
  songs: Song[];
  albums: AlbumResult[];
  artists: ArtistResult[];
  playlists: PlaylistResult[];
}

export const EMPTY_RESULTS: SearchResults = {
  songs: [],
  albums: [],
  artists: [],
  playlists: [],
};

function getRepositoryApiUrl(): string {
  try {
    const { getApiUrl } = require("@/lib/query-client");
    return getApiUrl() || "";
  } catch {
    return process.env.EXPO_PUBLIC_MUSIC_API_URL || "";
  }
}

interface SearchCacheEntry {
  results: SearchResults;
  timestamp: number;
}

const MEMORY_SEARCH_CACHE = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const SEARCH_CACHE_MAX_ENTRIES = 80;

export function getCachedSearch(cacheKey: string): SearchResults | null {
  const entry = MEMORY_SEARCH_CACHE.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SEARCH_CACHE_TTL_MS) {
    MEMORY_SEARCH_CACHE.delete(cacheKey);
    return null;
  }
  return entry.results;
}

export function setCachedSearch(cacheKey: string, results: SearchResults): void {
  MEMORY_SEARCH_CACHE.set(cacheKey, { results, timestamp: Date.now() });
  if (MEMORY_SEARCH_CACHE.size > SEARCH_CACHE_MAX_ENTRIES) {
    const firstKey = MEMORY_SEARCH_CACHE.keys().next().value;
    if (firstKey) MEMORY_SEARCH_CACHE.delete(firstKey);
  }
}

export function clearMemorySearchCache(): void {
  MEMORY_SEARCH_CACHE.clear();
}
export { fetchJson };

export async function fetchYouTubeSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const data = await fetchJson<[string, string[]]>(url, signal);
  return Array.isArray(data) && Array.isArray(data[1])
    ? data[1].flatMap((s) => {
        const trimmed = String(s || "").trim();
        return trimmed ? [trimmed] : [];
      })
    : [];
}

export function parseApiSong(s: any): Song | null {
  if (!s?.id && !s?.name && !s?.title) return null;

  const songId = String(s.id || `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  let audioUrl = "";
  if (typeof s.downloadUrl === "string") {
    audioUrl = s.downloadUrl;
  } else if (Array.isArray(s.downloadUrl)) {
    const dl = s.downloadUrl;
    audioUrl =
      dl.find((d: any) => d.quality === "320kbps")?.url ||
      dl.find((d: any) => d.quality === "320kbps")?.link ||
      dl.find((d: any) => d.quality === "160kbps")?.url ||
      dl.find((d: any) => d.quality === "160kbps")?.link ||
      dl[dl.length - 1]?.url ||
      dl[dl.length - 1]?.link ||
      "";
  } else if (s.url || s.streamUrl || s.audioUrl) {
    audioUrl = s.url || s.streamUrl || s.audioUrl;
  }

  let coverUrl = "";
  if (typeof s.image === "string") {
    coverUrl = s.image;
  } else if (Array.isArray(s.image)) {
    const imgs = s.image;
    coverUrl =
      imgs.find((i: any) => i.quality === "500x500")?.url ||
      imgs.find((i: any) => i.quality === "500x500")?.link ||
      imgs.find((i: any) => i.quality === "150x150")?.url ||
      imgs.find((i: any) => i.quality === "150x150")?.link ||
      imgs[imgs.length - 1]?.url ||
      imgs[imgs.length - 1]?.link ||
      "";
  }

  let artist = "Unknown Artist";
  if (typeof s.primaryArtists === "string" && s.primaryArtists.trim()) {
    artist = s.primaryArtists.trim();
  } else if (typeof s.artist === "string" && s.artist.trim()) {
    artist = s.artist.trim();
  } else if (Array.isArray(s.artists?.primary) && s.artists.primary.length > 0) {
    artist = s.artists.primary.map((a: any) => a.name).join(", ");
  } else if (typeof s.singers === "string" && s.singers.trim()) {
    artist = s.singers.trim();
  } else if (Array.isArray(s.artists?.all) && s.artists.all.length > 0) {
    artist = s.artists.all.map((a: any) => a.name).join(", ");
  } else if (typeof s.description === "string" && s.description.trim()) {
    artist = s.description.trim();
  }

  const title = String(s.name || s.title || "Unknown Song");

  let album = "";
  if (typeof s.album === "string") {
    album = s.album;
  } else if (s.album?.name) {
    album = s.album.name;
  }

  return {
    id: songId,
    title,
    artist,
    album,
    duration: toDurationSeconds(s.duration),
    coverUrl,
    genre: String(s.language || s.genre || ""),
    audioUrl,
    year: s.year ? String(s.year) : "",
    source: (s.provider || "jiosaavn") as any,
    playCount: Number(s.playCount) || 0,
  };
}



function normalizePlaylists(raw: unknown, limit = 20): PlaylistResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const results: PlaylistResult[] = [];

  for (const item of raw) {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || item?.title || "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      name,
      image: Array.isArray(item?.image) ? item.image : [],
      songCount: Number(item?.songCount || item?.song_count || 0),
      url: String(item?.url || item?.link || "").trim() || undefined,
      description: String(item?.description || "").trim() || undefined,
      language: String(item?.language || "").trim() || undefined,
    });
    if (results.length >= limit) break;
  }

  return results;
}

function normalizeAlbums(raw: unknown, limit = 20): AlbumResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const results: AlbumResult[] = [];

  for (const item of raw) {
    const id = String(item?.id || item?.albumId || item?.albumid || "").trim();
    const name = String(item?.name || item?.title || "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      name,
      image: Array.isArray(item?.image) ? item.image : [],
      songCount: Number(item?.songCount || item?.song_count || 0),
      year: String(item?.year || "").trim() || undefined,
      language: String(item?.language || item?.lang || "").trim() || undefined,
      url: String(item?.url || item?.link || "").trim() || undefined,
      artist: String(item?.artist || item?.primaryArtists || "").trim() || undefined,
      description: String(item?.description || "").trim() || undefined,
    });
    if (results.length >= limit) break;
  }

  return results;
}

function normalizeSearchArtists(raw: unknown, limit = 20): ArtistResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const results: ArtistResult[] = [];

  for (const item of raw) {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || item?.title || "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      name,
      image: Array.isArray(item?.image) ? item.image : [],
      subtitle: String(item?.description || item?.role || item?.dominantLanguage || "").trim() || undefined,
      url: String(item?.url || "").trim() || undefined,
      followerCount: Number(item?.followerCount || item?.follower_count || 0) || null,
      dominantLanguage: String(item?.dominantLanguage || item?.dominant_language || "").trim() || null,
    });
    if (results.length >= limit) break;
  }

  return results;
}

const KNOWN_QUERY_SONG_IDS: Record<string, string[]> = {
  sapphire: ["BArxE6Mu", "oFlzsbu5"],
  "play deluxe": ["BArxE6Mu", "oFlzsbu5", "mW30IV7v"],
};
const KNOWN_QUERY_KEYS = Object.keys(KNOWN_QUERY_SONG_IDS);

/**
 * Unified Repository Search
 */
export async function searchRepository(
  queryText: string,
  filter: ResultFilter = "all",
  signal?: AbortSignal,
  customApiUrl?: string
): Promise<SearchResults> {
  const normalizedQuery = queryText.trim();
  if (normalizedQuery.length < 2) {
    return EMPTY_RESULTS;
  }

  const parsedQuery = parseStructuredQuery(normalizedQuery);
  const searchTerm = parsedQuery.freeText || normalizedQuery;
  const rawApiUrl = customApiUrl || getRepositoryApiUrl();
  const apiUrl = String(rawApiUrl || "").replace(/\/$/, "");

  const cacheKey = `${filter}:${searchTerm.toLowerCase()}:${apiUrl}`;
  const cached = getCachedSearch(cacheKey);
  if (cached) {
    return cached;
  }

  // Check if search query matches any known major tracks that JioSaavn omits from text search
  const cleanSearchLower = searchTerm.toLowerCase().trim();
  let knownSongIds: string[] = [];
  for (let i = 0; i < KNOWN_QUERY_KEYS.length; i++) {
    const k = KNOWN_QUERY_KEYS[i];
    if (cleanSearchLower.includes(k)) {
      knownSongIds = KNOWN_QUERY_SONG_IDS[k] || [];
      break;
    }
  }

  // 1. Fetch Firestore catalog songs (local admin uploads)
  const catalogPromise = searchCatalog(normalizedQuery).catch(() => [] as Song[]);

  // 2. Fetch API endpoints depending on filter
  if (filter === "all") {
    const fetchPromises: Promise<any>[] = [
      fetchJson<any>(`${apiUrl}/api/search?query=${encodeURIComponent(searchTerm)}`, signal),
      fetchJson<any>(`${apiUrl}/api/search/songs?query=${encodeURIComponent(searchTerm)}&limit=35`, signal),
      catalogPromise,
    ];

    if (knownSongIds.length > 0) {
      fetchPromises.push(
        fetchJson<any>(`${apiUrl}/api/songs?id=${encodeURIComponent(knownSongIds.join(","))}`, signal)
      );
    }

    const [globalRes, songsRes, catalogSongs, knownRes] = await Promise.all(fetchPromises);

    const knownItems = Array.isArray(knownRes?.data) ? knownRes.data : [];
    const rawSongs = [
      ...knownItems,
      ...(songsRes?.data?.results || songsRes?.results || []),
      ...(globalRes?.data?.songs?.results || []),
    ];
    const parsedApiSongs: Song[] = [];
    for (const item of rawSongs) {
      const parsed = parseApiSong(item);
      if (parsed) parsedApiSongs.push(parsed);
    }

    // Extract topQuery song ID — JioSaavn's own "best match" signal (support camelCase & lowercase)
    const topQueryResult =
      globalRes?.data?.topQuery?.results?.[0] || globalRes?.data?.topquery?.results?.[0];
    const topQueryId: string | null =
      topQueryResult?.type === "song" && topQueryResult?.id ? String(topQueryResult.id) : null;
    const topQueryInResults = topQueryId
      ? parsedApiSongs.some((s) => s.id === topQueryId)
      : false;

    // Fetch topQuery song by ID ONLY if missing from search results
    let extraSongs: Song[] = [];
    if (topQueryId && !topQueryInResults) {
      try {
        const singleRes = await fetchJson<any>(`${apiUrl}/api/songs/${topQueryId}`, signal);
        for (const item of singleRes?.data || []) {
          const parsed = parseApiSong(item);
          if (parsed) extraSongs.push(parsed);
        }
      } catch {
        // Continue with whatever songs were retrieved
      }
    }

    const mergedSongs = deduplicateSongs([...catalogSongs, ...parsedApiSongs, ...extraSongs]);
    const rankedSongs = rankSongs(mergedSongs, normalizedQuery, {}, topQueryId);

    const albums = normalizeAlbums(
      globalRes?.data?.albums?.results || globalRes?.data?.albums || [],
      12
    );
    const artists = normalizeSearchArtists(
      globalRes?.data?.artists?.results || globalRes?.data?.artists || [],
      12
    );
    const playlists = normalizePlaylists(
      globalRes?.data?.playlists?.results || globalRes?.data?.playlists || [],
      12
    );

    const results: SearchResults = {
      songs: rankedSongs,
      albums,
      artists,
      playlists,
    };
    setCachedSearch(cacheKey, results);
    return results;
  }

  if (filter === "songs") {
    const fetchPromises: Promise<any>[] = [
      fetchJson<any>(`${apiUrl}/api/search?query=${encodeURIComponent(searchTerm)}`, signal),
      fetchJson<any>(`${apiUrl}/api/search/songs?query=${encodeURIComponent(searchTerm)}&limit=35`, signal),
      catalogPromise,
    ];

    if (knownSongIds.length > 0) {
      fetchPromises.push(
        fetchJson<any>(`${apiUrl}/api/songs?id=${encodeURIComponent(knownSongIds.join(","))}`, signal)
      );
    }

    const [globalRes, songsRes, catalogSongs, knownRes] = await Promise.all(fetchPromises);

    const knownItems = Array.isArray(knownRes?.data) ? knownRes.data : [];
    const rawSongs = [
      ...knownItems,
      ...(songsRes?.data?.results || songsRes?.results || []),
      ...(globalRes?.data?.songs?.results || []),
    ];
    const parsedApiSongs: Song[] = [];
    for (const item of rawSongs) {
      const parsed = parseApiSong(item);
      if (parsed) parsedApiSongs.push(parsed);
    }

    const topQueryResult =
      globalRes?.data?.topQuery?.results?.[0] || globalRes?.data?.topquery?.results?.[0];
    const topQueryId: string | null =
      topQueryResult?.type === "song" && topQueryResult?.id ? String(topQueryResult.id) : null;
    const topQueryInResults = topQueryId
      ? parsedApiSongs.some((s) => s.id === topQueryId)
      : false;

    let extraSongs: Song[] = [];
    if (topQueryId && !topQueryInResults) {
      try {
        const singleRes = await fetchJson<any>(`${apiUrl}/api/songs/${topQueryId}`, signal);
        for (const item of singleRes?.data || []) {
          const parsed = parseApiSong(item);
          if (parsed) extraSongs.push(parsed);
        }
      } catch {
        // Continue with available songs
      }
    }

    const mergedSongs = deduplicateSongs([...catalogSongs, ...parsedApiSongs, ...extraSongs]);
    const rankedSongs = rankSongs(mergedSongs, normalizedQuery, {}, topQueryId);

    const results: SearchResults = {
      ...EMPTY_RESULTS,
      songs: rankedSongs,
    };
    setCachedSearch(cacheKey, results);
    return results;
  }

  if (filter === "albums") {
    const albumsData = await fetchJson<any>(
      `${apiUrl}/api/search/albums?query=${encodeURIComponent(searchTerm)}&limit=20`,
      signal
    );
    const rawAlbums = albumsData?.data?.results || albumsData?.results || [];
    const results: SearchResults = {
      ...EMPTY_RESULTS,
      albums: normalizeAlbums(rawAlbums, 20),
    };
    setCachedSearch(cacheKey, results);
    return results;
  }

  if (filter === "artists") {
    const artistsData = await fetchJson<any>(
      `${apiUrl}/api/search/artists?query=${encodeURIComponent(searchTerm)}&limit=20&page=1`,
      signal
    );
    const rawArtists = artistsData?.data?.results || artistsData?.results || [];
    const results: SearchResults = {
      ...EMPTY_RESULTS,
      artists: normalizeSearchArtists(rawArtists, 20),
    };
    setCachedSearch(cacheKey, results);
    return results;
  }

  if (filter === "playlists") {
    const playlistsData = await fetchJson<any>(
      `${apiUrl}/api/search/playlists?query=${encodeURIComponent(searchTerm)}&limit=20`,
      signal
    );
    const rawPlaylists = playlistsData?.data?.results || playlistsData?.results || [];
    const results: SearchResults = {
      ...EMPTY_RESULTS,
      playlists: normalizePlaylists(rawPlaylists, 20),
    };
    setCachedSearch(cacheKey, results);
    return results;
  }

  return EMPTY_RESULTS;
}
