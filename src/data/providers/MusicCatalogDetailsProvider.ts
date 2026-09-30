import { getApiUrl } from "@/lib/api-config";
import type { JioSaavnSong } from "@/lib/musicData";
import { fetchWithTimeout } from "@/utils/asyncUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  consumeResponseBody,
  normalizePlaylistDetailsData,
  parsePlaylistDetailsResponse,
} from "./MusicCatalogNormalizers";
import type {
  CatalogCategoryData,
  CatalogPlaylistDetailsData,
  GetCatalogAlbumDetailsOptions,
  GetCatalogPlaylistDetailsOptions,
} from "./MusicCatalogTypes";

interface PlaylistDetailsPageResult {
  data: CatalogPlaylistDetailsData | null;
  reason: "not_found" | "network";
}

export class CatalogDetailsError extends Error {
  code: "NOT_FOUND" | "NETWORK";

  constructor(code: "NOT_FOUND" | "NETWORK", message: string) {
    super(message);
    this.name = "CatalogDetailsError";
    this.code = code;
  }
}

export const JioSaavnPlaylistDetailsError = CatalogDetailsError;

const PLAYLIST_DETAILS_CACHE_PREFIX = "@mavrixfy_catalog_playlist_details";
const ALBUM_DETAILS_CACHE_PREFIX = "@mavrixfy_catalog_album_details";
const PLAYLIST_FETCH_LIMIT = 50;
const PLAYLIST_DETAILS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function getCatalogPlaylistBaseUrls(): string[] {
  const configured = getApiUrl().replace(/\/+$/, "");
  const urls: string[] = [];
  if (configured) {
    urls.push(`${configured}/api`);
  }
  if (!configured.includes("mavrixfy-song-api.vercel.app")) {
    urls.push("https://mavrixfy-song-api.vercel.app/api");
  }
  return urls;
}

export const getJioSaavnPlaylistBaseUrls = getCatalogPlaylistBaseUrls;

export async function fetchFromCandidates(
  urls: string[],
  timeoutMs = 4500
): Promise<PlaylistDetailsPageResult> {
  if (!urls.length) {
    return { data: null, reason: "not_found" };
  }

  let lastReason: "not_found" | "network" = "network";

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, timeoutMs);

      if (!response.ok) {
        if (response.status === 404) {
          lastReason = "not_found";
        }
        await consumeResponseBody(response);
        continue;
      }

      const json = await response.json();
      const normalized = parsePlaylistDetailsResponse(json);
      if (normalized) {
        return { data: normalized, reason: "network" };
      }
    } catch {
      lastReason = "network";
    }
  }

  return { data: null, reason: lastReason };
}

export function fetchPlaylistDetailsPage(
  playlistId: string,
  page: number,
  limit: number,
  playlistLink?: string
): Promise<PlaylistDetailsPageResult> {
  const sourceQuery = playlistLink
    ? `link=${encodeURIComponent(playlistLink)}`
    : `id=${encodeURIComponent(playlistId)}`;
  const apiPage = Math.max(0, page - 1);
  const query = `${sourceQuery}&limit=${limit}&page=${apiPage}`;

  const candidateUrls = getCatalogPlaylistBaseUrls().map(
    (base) => `${base.replace(/\/+$/, "")}/playlists?${query}`
  );

  return fetchFromCandidates(candidateUrls);
}

export function buildAlbumDetailsQuery(albumId: string, albumLink?: string): string {
  if (albumLink) {
    return `link=${encodeURIComponent(albumLink)}`;
  }

  const params: string[] = [];
  if (albumId) params.push(`id=${encodeURIComponent(albumId)}`);
  return params.join("&");
}

export function fetchAlbumDetails(
  albumId: string,
  albumLink?: string
): Promise<PlaylistDetailsPageResult> {
  const query = buildAlbumDetailsQuery(albumId, albumLink);
  if (!query) return Promise.resolve({ data: null, reason: "not_found" });

  const candidateUrls = getCatalogPlaylistBaseUrls().map(
    (base) => `${base.replace(/\/+$/, "")}/albums?${query}`
  );

  return fetchFromCandidates(candidateUrls);
}

interface MemoryCacheRecord<T> {
  data: T;
  timestamp: number;
}

const MEMORY_PLAYLIST_CACHE = new Map<string, MemoryCacheRecord<CatalogPlaylistDetailsData>>();
const MEMORY_ALBUM_CACHE = new Map<string, MemoryCacheRecord<CatalogPlaylistDetailsData>>();
const MAX_MEMORY_DETAILS_CACHE = 60;

function pruneMemoryMap<T>(map: Map<string, MemoryCacheRecord<T>>) {
  if (map.size > MAX_MEMORY_DETAILS_CACHE) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
}

function buildPlaylistDetailsCacheKey(playlistId: string): string {
  return `${PLAYLIST_DETAILS_CACHE_PREFIX}_data_${playlistId}`;
}

function buildPlaylistDetailsCacheTimeKey(playlistId: string): string {
  return `${PLAYLIST_DETAILS_CACHE_PREFIX}_time_${playlistId}`;
}

function buildAlbumDetailsCacheKey(albumKey: string): string {
  return `${ALBUM_DETAILS_CACHE_PREFIX}_data_${albumKey}`;
}

function buildAlbumDetailsCacheTimeKey(albumKey: string): string {
  return `${ALBUM_DETAILS_CACHE_PREFIX}_time_${albumKey}`;
}

export async function getCachedCatalogPlaylistDetails(
  playlistId: string
): Promise<CatalogPlaylistDetailsData | null> {
  const mem = MEMORY_PLAYLIST_CACHE.get(playlistId);
  if (mem) {
    if (Date.now() - mem.timestamp <= PLAYLIST_DETAILS_CACHE_TTL_MS) {
      return mem.data;
    }
    MEMORY_PLAYLIST_CACHE.delete(playlistId);
  }

  try {
    const [[, rawData], [, rawTime]] = await AsyncStorage.multiGet([
      buildPlaylistDetailsCacheKey(playlistId),
      buildPlaylistDetailsCacheTimeKey(playlistId),
    ]);

    if (!rawData || !rawTime) return null;
    const cachedAt = Number(rawTime);
    if (!Number.isFinite(cachedAt)) return null;
    if (Date.now() - cachedAt > PLAYLIST_DETAILS_CACHE_TTL_MS) return null;

    const parsed = JSON.parse(rawData);
    const normalized = normalizePlaylistDetailsData(parsed);
    if (!normalized || !Array.isArray(normalized.songs)) return null;

    MEMORY_PLAYLIST_CACHE.set(playlistId, { data: normalized, timestamp: cachedAt });
    pruneMemoryMap(MEMORY_PLAYLIST_CACHE);

    return normalized;
  } catch {
    return null;
  }
}

export const getCachedPlaylistDetails = getCachedCatalogPlaylistDetails;

export async function setCachedCatalogPlaylistDetails(
  playlistId: string,
  playlist: CatalogPlaylistDetailsData
): Promise<void> {
  MEMORY_PLAYLIST_CACHE.set(playlistId, { data: playlist, timestamp: Date.now() });
  pruneMemoryMap(MEMORY_PLAYLIST_CACHE);

  try {
    await AsyncStorage.multiSet([
      [buildPlaylistDetailsCacheKey(playlistId), JSON.stringify(playlist)],
      [buildPlaylistDetailsCacheTimeKey(playlistId), String(Date.now())],
    ]);
  } catch {
    // Silent cache write failure
  }
}

export const setCachedPlaylistDetails = setCachedCatalogPlaylistDetails;

export async function getCachedCatalogAlbumDetails(
  albumKey: string
): Promise<CatalogPlaylistDetailsData | null> {
  const mem = MEMORY_ALBUM_CACHE.get(albumKey);
  if (mem) {
    if (Date.now() - mem.timestamp <= PLAYLIST_DETAILS_CACHE_TTL_MS) {
      return mem.data;
    }
    MEMORY_ALBUM_CACHE.delete(albumKey);
  }

  try {
    const [[, rawData], [, rawTime]] = await AsyncStorage.multiGet([
      buildAlbumDetailsCacheKey(albumKey),
      buildAlbumDetailsCacheTimeKey(albumKey),
    ]);

    if (!rawData || !rawTime) return null;
    const cachedAt = Number(rawTime);
    if (!Number.isFinite(cachedAt)) return null;
    if (Date.now() - cachedAt > PLAYLIST_DETAILS_CACHE_TTL_MS) return null;

    const parsed = JSON.parse(rawData);
    const normalized = normalizePlaylistDetailsData(parsed);
    if (!normalized || !Array.isArray(normalized.songs)) return null;

    MEMORY_ALBUM_CACHE.set(albumKey, { data: normalized, timestamp: cachedAt });
    pruneMemoryMap(MEMORY_ALBUM_CACHE);

    return normalized;
  } catch {
    return null;
  }
}

export const getCachedAlbumDetails = getCachedCatalogAlbumDetails;

export async function setCachedCatalogAlbumDetails(
  albumKey: string,
  album: CatalogPlaylistDetailsData
): Promise<void> {
  MEMORY_ALBUM_CACHE.set(albumKey, { data: album, timestamp: Date.now() });
  pruneMemoryMap(MEMORY_ALBUM_CACHE);

  try {
    await AsyncStorage.multiSet([
      [buildAlbumDetailsCacheKey(albumKey), JSON.stringify(album)],
      [buildAlbumDetailsCacheTimeKey(albumKey), String(Date.now())],
    ]);
  } catch {
    // Silent cache write failure
  }
}

export const setCachedAlbumDetails = setCachedCatalogAlbumDetails;

export async function prefetchCatalogPlaylistDetails(playlistId: string): Promise<void> {
  const cached = await getCachedCatalogPlaylistDetails(playlistId);
  if (cached) return;

  try {
    const result = await fetchPlaylistDetailsPage(playlistId, 1, 15);
    if (result.data) {
      await setCachedCatalogPlaylistDetails(playlistId, result.data);
    }
  } catch {
    // Background prefetch fail silently
  }
}

export const prefetchPlaylistDetails = prefetchCatalogPlaylistDetails;

export function prefetchVisibleCatalogPlaylists(
  categories: CatalogCategoryData[],
  perSection = 3
): () => void {
  const ids: string[] = [];
  for (const cat of categories) {
    for (const p of cat.results.slice(0, perSection)) {
      if (p.id) ids.push(p.id);
    }
  }

  const timers = ids.map((id, i) => {
    return setTimeout(() => prefetchCatalogPlaylistDetails(id), i * 400);
  });

  return () => {
    timers.forEach(clearTimeout);
  };
}

export const prefetchVisiblePlaylists = prefetchVisibleCatalogPlaylists;

export async function getCatalogPlaylistDetails(
  playlistId: string,
  options?: GetCatalogPlaylistDetailsOptions
): Promise<CatalogPlaylistDetailsData> {
  const normalizedId = String(playlistId || "").trim();
  const playlistLink = String(options?.link || "").trim();
  const cacheKey = normalizedId || playlistLink;
  if (!cacheKey) {
    throw new CatalogDetailsError("NOT_FOUND", "Playlist not found");
  }

  const cached = await getCachedCatalogPlaylistDetails(cacheKey);
  if (cached?.songs?.length) {
    void fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT, playlistLink)
      .then((res) => {
        if (res.data?.songs?.length) {
          void setCachedCatalogPlaylistDetails(cacheKey, res.data);
          if (res.data.id && res.data.id !== cacheKey) {
            void setCachedCatalogPlaylistDetails(res.data.id, res.data);
          }
        }
      })
      .catch(() => {});
    return cached;
  }

  return fetchFreshPlaylistDetails(normalizedId, playlistLink, cacheKey);
}

export const getJioSaavnPlaylistDetails = getCatalogPlaylistDetails;

async function fetchFreshPlaylistDetails(
  normalizedId: string,
  playlistLink: string,
  cacheKey: string
): Promise<CatalogPlaylistDetailsData> {
  const firstPage = await fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT, playlistLink);

  if (firstPage.data) {
    if (firstPage.data.songs?.length) {
      void setCachedCatalogPlaylistDetails(cacheKey, firstPage.data);
      if (firstPage.data.id && firstPage.data.id !== cacheKey) {
        void setCachedCatalogPlaylistDetails(firstPage.data.id, firstPage.data);
      }
    }
    return firstPage.data;
  }

  if (firstPage.reason === "not_found") {
    throw new CatalogDetailsError("NOT_FOUND", "Playlist not found");
  }
  throw new CatalogDetailsError("NETWORK", "Unable to fetch playlist details");
}

export async function getCatalogAlbumDetails(
  albumId: string,
  options?: GetCatalogAlbumDetailsOptions
): Promise<CatalogPlaylistDetailsData> {
  const normalizedId = String(albumId || "").trim();
  const albumLink = String(options?.link || "").trim();
  const cacheKey = normalizedId || albumLink;
  if (!cacheKey) {
    throw new CatalogDetailsError("NOT_FOUND", "Album not found");
  }

  const cached = await getCachedCatalogAlbumDetails(cacheKey);
  if (cached?.songs?.length) {
    void fetchAlbumDetails(normalizedId, albumLink)
      .then((res) => {
        if (res.data?.songs?.length) {
          void setCachedCatalogAlbumDetails(cacheKey, res.data);
          if (res.data.id && res.data.id !== cacheKey) {
            void setCachedCatalogAlbumDetails(res.data.id, res.data);
          }
        }
      })
      .catch(() => {});
    return cached;
  }

  return fetchFreshAlbumDetails(normalizedId, albumLink, cacheKey);
}

export const getJioSaavnAlbumDetails = getCatalogAlbumDetails;

async function fetchFreshAlbumDetails(
  normalizedId: string,
  albumLink: string,
  cacheKey: string
): Promise<CatalogPlaylistDetailsData> {
  const first = await fetchAlbumDetails(normalizedId, albumLink);

  if (first.data) {
    if (first.data.songs?.length) {
      void setCachedCatalogAlbumDetails(cacheKey, first.data);
      if (first.data.id && first.data.id !== cacheKey) {
        void setCachedCatalogAlbumDetails(first.data.id, first.data);
      }
    }
    return first.data;
  }

  if (first.reason === "not_found") {
    throw new CatalogDetailsError("NOT_FOUND", "Album not found");
  }
  throw new CatalogDetailsError("NETWORK", "Unable to fetch album details");
}

export async function getCatalogSongDetails(
  songId: string,
  link?: string
): Promise<JioSaavnSong | null> {
  const queryParam = link ? `link=${encodeURIComponent(link)}` : `id=${encodeURIComponent(songId)}`;
  for (const endpointBase of getCatalogPlaylistBaseUrls()) {
    const trimmed = endpointBase.replace(/\/+$/, "");
    const requestUrl = `${trimmed}/songs?${queryParam}`;
    try {
      const response = await fetch(requestUrl, { headers: { Accept: "application/json" } });
      if (response.ok) {
        const json = await response.json();
        const data = json.data?.[0] || json?.[0] || json.data || json;
        if (data && data.id) {
          return data as JioSaavnSong;
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

export const getJioSaavnSongDetails = getCatalogSongDetails;
