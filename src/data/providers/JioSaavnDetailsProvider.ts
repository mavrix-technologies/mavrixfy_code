import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/api-config";
import { withTimeout } from "@/utils/asyncUtils";
import type { JioSaavnSong } from "@/lib/musicData";
import {
  parsePlaylistDetailsResponse,
  normalizePlaylistDetailsData,
  consumeResponseBody,
} from "./JioSaavnNormalizers";
import type {
  JioSaavnPlaylistDetailsData,
  GetJioSaavnPlaylistDetailsOptions,
  GetJioSaavnAlbumDetailsOptions,
  HomeJioSaavnCategoryData,
} from "./JioSaavnTypes";

interface PlaylistDetailsPageResult {
  data: JioSaavnPlaylistDetailsData | null;
  reason: "not_found" | "network";
}

export class JioSaavnPlaylistDetailsError extends Error {
  code: "NOT_FOUND" | "NETWORK";

  constructor(code: "NOT_FOUND" | "NETWORK", message: string) {
    super(message);
    this.name = "JioSaavnPlaylistDetailsError";
    this.code = code;
  }
}

const PLAYLIST_DETAILS_CACHE_PREFIX = "@mavrixfy_jiosaavn_playlist_details";
const ALBUM_DETAILS_CACHE_PREFIX = "@mavrixfy_jiosaavn_album_details";
const PLAYLIST_FETCH_LIMIT = 50;
const PLAYLIST_DETAILS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const JIOSAAVN_PLAYLIST_BASE_URLS = [
  `${getApiUrl().replace(/\/+$/, "")}/api`,
];
const JIOSAAVN_SEARCH_BASE_URLS = [
  `${getApiUrl().replace(/\/+$/, "")}/api`,
];


export async function fetchFromCandidates(
  urls: string[],
  timeoutMs = 6000
): Promise<PlaylistDetailsPageResult> {
  return new Promise<PlaylistDetailsPageResult>((resolve) => {
    let completedCount = 0;
    let resolved = false;
    const results: { data: JioSaavnPlaylistDetailsData | null; notFound: boolean }[] = [];

    void Promise.all(
      urls.map(async (url, idx) => {
        try {
          const response = await withTimeout(
            fetch(url, { headers: { Accept: "application/json" } }),
            timeoutMs
          );
          if (!response.ok) {
            const notFound = response.status === 404;
            await consumeResponseBody(response);
            results[idx] = { data: null, notFound };
          } else {
            const json = await response.json();
            const normalized = parsePlaylistDetailsResponse(json);
            results[idx] = { data: normalized, notFound: false };
            if (normalized && !resolved) {
              resolved = true;
              resolve({ data: normalized, reason: "network" });
              return;
            }
          }
        } catch {
          results[idx] = { data: null, notFound: false };
        } finally {
          completedCount++;
          if (completedCount === urls.length && !resolved) {
            resolved = true;
            const allNotFound = results.every((r) => r && r.notFound);
            resolve({ data: null, reason: allNotFound ? "not_found" : "network" });
          }
        }
      })
    );
  });
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

  const candidateUrls = JIOSAAVN_PLAYLIST_BASE_URLS.map(
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

  const candidateUrls = JIOSAAVN_PLAYLIST_BASE_URLS.map(
    (base) => `${base.replace(/\/+$/, "")}/albums?${query}`
  );

  return fetchFromCandidates(candidateUrls);
}

function buildPlaylistDetailsCacheKey(playlistId: string): string {
  return `${PLAYLIST_DETAILS_CACHE_PREFIX}:${playlistId}`;
}

function buildPlaylistDetailsCacheTimeKey(playlistId: string): string {
  return `${PLAYLIST_DETAILS_CACHE_PREFIX}:${playlistId}:time`;
}

function buildAlbumDetailsCacheKey(albumKey: string): string {
  return `${ALBUM_DETAILS_CACHE_PREFIX}:${albumKey}`;
}

function buildAlbumDetailsCacheTimeKey(albumKey: string): string {
  return `${ALBUM_DETAILS_CACHE_PREFIX}:${albumKey}:time`;
}

export async function getCachedPlaylistDetails(
  playlistId: string
): Promise<JioSaavnPlaylistDetailsData | null> {
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
    return normalized;
  } catch {
    return null;
  }
}

export async function setCachedPlaylistDetails(
  playlistId: string,
  playlist: JioSaavnPlaylistDetailsData
): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [buildPlaylistDetailsCacheKey(playlistId), JSON.stringify(playlist)],
      [buildPlaylistDetailsCacheTimeKey(playlistId), String(Date.now())],
    ]);
  } catch {
    // Silent cache write failure
  }
}

export async function getCachedAlbumDetails(
  albumKey: string
): Promise<JioSaavnPlaylistDetailsData | null> {
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
    return normalized;
  } catch {
    return null;
  }
}

export async function setCachedAlbumDetails(
  albumKey: string,
  album: JioSaavnPlaylistDetailsData
): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [buildAlbumDetailsCacheKey(albumKey), JSON.stringify(album)],
      [buildAlbumDetailsCacheTimeKey(albumKey), String(Date.now())],
    ]);
  } catch {
    // Silent cache write failure
  }
}

const prefetchInFlight = new Set<string>();

export function prefetchPlaylistDetails(playlistId: string): void {
  const id = String(playlistId || "").trim();
  if (!id || prefetchInFlight.has(id)) return;

  prefetchInFlight.add(id);

  getCachedPlaylistDetails(id)
    .then((cached) => {
      if (cached?.songs?.length) {
        prefetchInFlight.delete(id);
        return;
      }
      return fetchPlaylistDetailsPage(id, 1, PLAYLIST_FETCH_LIMIT)
        .then((res) => {
          if (res.data?.songs?.length) {
            return setCachedPlaylistDetails(id, res.data);
          }
        })
        .finally(() => prefetchInFlight.delete(id));
    })
    .catch(() => prefetchInFlight.delete(id));
}

export function prefetchVisiblePlaylists(
  categories: HomeJioSaavnCategoryData[],
  perSection = 3
): () => void {
  const ids: string[] = [];
  for (const cat of categories) {
    for (const p of cat.results.slice(0, perSection)) {
      if (p.id) ids.push(p.id);
    }
  }

  const timers = ids.map((id, i) => {
    return setTimeout(() => prefetchPlaylistDetails(id), i * 400);
  });

  return () => {
    timers.forEach(clearTimeout);
  };
}

export async function getJioSaavnPlaylistDetails(
  playlistId: string,
  options?: GetJioSaavnPlaylistDetailsOptions
): Promise<JioSaavnPlaylistDetailsData> {
  const normalizedId = String(playlistId || "").trim();
  const playlistLink = String(options?.link || "").trim();
  const cacheKey = normalizedId || playlistLink;
  if (!cacheKey) {
    throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Playlist not found");
  }

  const cached = await getCachedPlaylistDetails(cacheKey);
  if (cached?.songs?.length) {
    void fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT, playlistLink)
      .then((res) => {
        if (res.data?.songs?.length) {
          void setCachedPlaylistDetails(cacheKey, res.data);
          if (res.data.id && res.data.id !== cacheKey) {
            void setCachedPlaylistDetails(res.data.id, res.data);
          }
        }
      })
      .catch(() => {});
    return cached;
  }

  return fetchFreshPlaylistDetails(normalizedId, playlistLink, cacheKey);
}

async function fetchFreshPlaylistDetails(
  normalizedId: string,
  playlistLink: string,
  cacheKey: string
): Promise<JioSaavnPlaylistDetailsData> {
  const firstPage = await fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT, playlistLink);

  if (firstPage.data?.songs?.length) {
    void setCachedPlaylistDetails(cacheKey, firstPage.data);
    if (firstPage.data.id && firstPage.data.id !== cacheKey) {
      void setCachedPlaylistDetails(firstPage.data.id, firstPage.data);
    }
    return firstPage.data;
  }

  if (firstPage.data && !firstPage.data.songs?.length) {
    const retry = await fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT, playlistLink);
    if (retry.data?.songs?.length) {
      void setCachedPlaylistDetails(cacheKey, retry.data);
      if (retry.data.id && retry.data.id !== cacheKey) {
        void setCachedPlaylistDetails(retry.data.id, retry.data);
      }
      return retry.data;
    }
    if (retry.data) return retry.data;
    if (firstPage.data) return firstPage.data;
  }

  if (firstPage.reason === "not_found") {
    throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Playlist not found");
  }
  throw new JioSaavnPlaylistDetailsError("NETWORK", "Unable to fetch playlist details");
}

export async function getJioSaavnAlbumDetails(
  albumId: string,
  options?: GetJioSaavnAlbumDetailsOptions
): Promise<JioSaavnPlaylistDetailsData> {
  const normalizedId = String(albumId || "").trim();
  const albumLink = String(options?.link || "").trim();
  const cacheKey = normalizedId || albumLink;
  if (!cacheKey) {
    throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Album not found");
  }

  const cached = await getCachedAlbumDetails(cacheKey);
  if (cached?.songs?.length) {
    void fetchAlbumDetails(normalizedId, albumLink)
      .then((res) => {
        if (res.data?.songs?.length) {
          void setCachedAlbumDetails(cacheKey, res.data);
          if (res.data.id && res.data.id !== cacheKey) {
            void setCachedAlbumDetails(res.data.id, res.data);
          }
        }
      })
      .catch(() => {});
    return cached;
  }

  return fetchFreshAlbumDetails(normalizedId, albumLink, cacheKey);
}

async function fetchFreshAlbumDetails(
  normalizedId: string,
  albumLink: string,
  cacheKey: string
): Promise<JioSaavnPlaylistDetailsData> {
  const first = await fetchAlbumDetails(normalizedId, albumLink);

  if (first.data?.songs?.length) {
    void setCachedAlbumDetails(cacheKey, first.data);
    if (first.data.id && first.data.id !== cacheKey) {
      void setCachedAlbumDetails(first.data.id, first.data);
    }
    return first.data;
  }

  if (first.data && !first.data.songs?.length) {
    const retry = await fetchAlbumDetails(normalizedId, albumLink);
    if (retry.data?.songs?.length) {
      void setCachedAlbumDetails(cacheKey, retry.data);
      if (retry.data.id && retry.data.id !== cacheKey) {
        void setCachedAlbumDetails(retry.data.id, retry.data);
      }
      return retry.data;
    }
    if (retry.data) return retry.data;
    return first.data;
  }

  if (first.reason === "not_found") {
    throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Album not found");
  }
  throw new JioSaavnPlaylistDetailsError("NETWORK", "Unable to fetch album details");
}

export async function getJioSaavnSongDetails(
  songId: string,
  link?: string
): Promise<JioSaavnSong | null> {
  const queryParam = link ? `link=${encodeURIComponent(link)}` : `id=${encodeURIComponent(songId)}`;
  for (const endpointBase of JIOSAAVN_SEARCH_BASE_URLS) {
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
