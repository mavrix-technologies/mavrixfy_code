import { Song, type JioSaavnImage } from "@/lib/musicData";
import { searchCatalog } from "@/lib/catalogService";
import { rankSongs, parseStructuredQuery, deduplicateSongs } from "@/lib/searchUtils";

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

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchYouTubeSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&client=firefox&q=${encodeURIComponent(query)}`;
  const data = await fetchJson<[string, string[]]>(url, signal);
  return Array.isArray(data) && Array.isArray(data[1])
    ? data[1].flatMap((s) => {
        const trimmed = String(s || "").trim();
        return trimmed ? [trimmed] : [];
      })
    : [];
}

function parseApiSong(s: any): Song | null {
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
    duration: Number(s.duration) || 0,
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

function normalizeArtists(raw: unknown, limit = 20): ArtistResult[] {
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

  // 1. Fetch Firestore catalog songs (local admin uploads)
  const catalogPromise = searchCatalog(normalizedQuery).catch(() => [] as Song[]);

  // 2. Fetch API endpoints depending on filter
  if (filter === "all") {
    const [globalRes, songsRes, catalogSongs] = await Promise.all([
      fetchJson<any>(`${apiUrl}/api/search?query=${encodeURIComponent(searchTerm)}`, signal),
      fetchJson<any>(`${apiUrl}/api/search/songs?query=${encodeURIComponent(searchTerm)}&limit=50`, signal),
      catalogPromise,
    ]);

    const rawSongs = songsRes?.data?.results || songsRes?.results || globalRes?.data?.songs?.results || [];
    const parsedApiSongs: Song[] = [];
    for (const item of rawSongs) {
      const parsed = parseApiSong(item);
      if (parsed) parsedApiSongs.push(parsed);
    }

    // Extract topQuery song ID — JioSaavn's own "best match" signal
    const topQueryResult = globalRes?.data?.topQuery?.results?.[0];
    const topQueryId: string | null =
      topQueryResult?.type === "song" && topQueryResult?.id ? String(topQueryResult.id) : null;
    const topQueryInResults = topQueryId
      ? parsedApiSongs.some((s) => s.id === topQueryId)
      : false;

    // Fetch topQuery song by ID if it's not already in search results,
    // and fetch its suggestions to expand the candidate pool with songs
    // that are on JioSaavn but not returned by the search API.
    const extraFetches: Promise<Song[]>[] = [];

    if (topQueryId && !topQueryInResults) {
      extraFetches.push(
        fetchJson<any>(`${apiUrl}/api/songs/${topQueryId}`, signal)
          .then((res) => {
            const items: Song[] = [];
            for (const item of res?.data || []) {
              const parsed = parseApiSong(item);
              if (parsed) items.push(parsed);
            }
            return items;
          })
          .catch(() => [])
      );
    }

    if (topQueryId) {
      extraFetches.push(
        fetchJson<any>(`${apiUrl}/api/songs/${topQueryId}/suggestions?limit=20`, signal)
          .then((res) => {
            const items: Song[] = [];
            for (const item of res?.data || []) {
              const parsed = parseApiSong(item);
              if (parsed) items.push(parsed);
            }
            return items;
          })
          .catch(() => [])
      );
    }

    const extraResults = await Promise.all(extraFetches);
    const extraSongs: Song[] = extraResults.flat();

    const mergedSongs = deduplicateSongs([...catalogSongs, ...parsedApiSongs, ...extraSongs]);
    const rankedSongs = rankSongs(mergedSongs, normalizedQuery, {}, topQueryId);

    const albums = normalizeAlbums(globalRes?.data?.albums?.results, 12);
    const artists = normalizeArtists(globalRes?.data?.artists?.results, 12);
    const playlists = normalizePlaylists(globalRes?.data?.playlists?.results, 12);

    return {
      songs: rankedSongs,
      albums,
      artists,
      playlists,
    };
  }

  if (filter === "songs") {
    const [globalRes, songsRes, catalogSongs] = await Promise.all([
      fetchJson<any>(`${apiUrl}/api/search?query=${encodeURIComponent(searchTerm)}`, signal),
      fetchJson<any>(`${apiUrl}/api/search/songs?query=${encodeURIComponent(searchTerm)}&limit=50`, signal),
      catalogPromise,
    ]);

    const rawSongs = songsRes?.data?.results || songsRes?.results || [];
    const parsedApiSongs: Song[] = [];
    for (const item of rawSongs) {
      const parsed = parseApiSong(item);
      if (parsed) parsedApiSongs.push(parsed);
    }

    // Same topQuery + suggestions expansion for dedicated songs filter
    const topQueryId: string | null = (() => {
      const tq = globalRes?.data?.topQuery?.results?.[0];
      return tq?.type === "song" && tq?.id ? String(tq.id) : null;
    })();
    const topQueryInResults = topQueryId
      ? parsedApiSongs.some((s) => s.id === topQueryId)
      : false;

    const extraFetches: Promise<Song[]>[] = [];
    if (topQueryId && !topQueryInResults) {
      extraFetches.push(
        fetchJson<any>(`${apiUrl}/api/songs/${topQueryId}`, signal)
          .then((res) => {
            const items: Song[] = [];
            for (const item of res?.data || []) {
              const parsed = parseApiSong(item);
              if (parsed) items.push(parsed);
            }
            return items;
          })
          .catch(() => [])
      );
    }
    if (topQueryId) {
      extraFetches.push(
        fetchJson<any>(`${apiUrl}/api/songs/${topQueryId}/suggestions?limit=20`, signal)
          .then((res) => {
            const items: Song[] = [];
            for (const item of res?.data || []) {
              const parsed = parseApiSong(item);
              if (parsed) items.push(parsed);
            }
            return items;
          })
          .catch(() => [])
      );
    }
    const extraSongs: Song[] = (await Promise.all(extraFetches)).flat();

    const mergedSongs = deduplicateSongs([...catalogSongs, ...parsedApiSongs, ...extraSongs]);
    const rankedSongs = rankSongs(mergedSongs, normalizedQuery, {}, topQueryId);

    return {
      ...EMPTY_RESULTS,
      songs: rankedSongs,
    };
  }

  if (filter === "albums") {
    const albumsData = await fetchJson<any>(
      `${apiUrl}/api/search/albums?query=${encodeURIComponent(searchTerm)}&limit=20`,
      signal
    );
    const rawAlbums = albumsData?.data?.results || albumsData?.results || [];
    return {
      ...EMPTY_RESULTS,
      albums: normalizeAlbums(rawAlbums, 20),
    };
  }

  if (filter === "artists") {
    const artistsData = await fetchJson<any>(
      `${apiUrl}/api/search/artists?query=${encodeURIComponent(searchTerm)}&limit=20&page=1`,
      signal
    );
    const rawArtists = artistsData?.data?.results || artistsData?.results || [];
    return {
      ...EMPTY_RESULTS,
      artists: normalizeArtists(rawArtists, 20),
    };
  }

  if (filter === "playlists") {
    const playlistsData = await fetchJson<any>(
      `${apiUrl}/api/search/playlists?query=${encodeURIComponent(searchTerm)}&limit=20`,
      signal
    );
    const rawPlaylists = playlistsData?.data?.results || playlistsData?.results || [];
    return {
      ...EMPTY_RESULTS,
      playlists: normalizePlaylists(rawPlaylists, 20),
    };
  }

  return EMPTY_RESULTS;
}
