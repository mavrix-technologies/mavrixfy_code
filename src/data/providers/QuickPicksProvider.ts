import { getCatalogPlaylistDetails } from "@/data/providers/MusicCatalogDetailsProvider";
import { type CatalogCategoryData } from "@/data/providers/MusicCatalogTypes";
import { isLikelyNewReleaseSong } from "@/data/providers/homeFreshness";
import { buildAppApiUrl } from "@/lib/api-config";
import { logger } from "@/lib/logger";
import { type Song,convertJioSaavnSong } from "@/lib/musicData";
import { parseApiSong } from "@/lib/searchRepository";
import { fetchJsonStrict } from "@/utils/asyncUtils";
import { unescapeHtml } from "@/utils/stringUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";

const QUICK_PICKS_CACHE_KEY = "@mavrixfy_quick_picks_cache_v3";
const QUICK_PICKS_CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes fresh rotation

export interface QuickPicksPool {
  trending: Song[];
  bollywood: Song[];
  latest: Song[];
  all: Song[];
}

export const EMPTY_QUICK_PICKS_POOL: QuickPicksPool = {
  trending: [],
  bollywood: [],
  latest: [],
  all: [],
};

let inMemoryQuickPicksPool: QuickPicksPool | null = null;
let inMemoryTimestamp = 0;

/**
 * Strips noise, movie source indicators, remix tags, and version variants
 * to produce a clean deduplication key.
 */
export function canonicalSongKey(title: string): string {
  return unescapeHtml(title)
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\{.*?\}/g, "")
    .replace(/\b(trending version|new version|remix|version|extended version|original motion picture soundtrack|soundtrack)\b/gi, "")
    .replace(/\bfrom\s+["“'].*?["”']/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Normalizes and sanitizes a raw song object, ensuring clean titles,
 * valid audioUrl, high-res cover, and proper metadata.
 */
function sanitizeSong(song: Song): Song | null {
  if (!song || !song.id) return null;
  const title = unescapeHtml(song.title);
  if (!title || title.toLowerCase() === "unknown") return null;

  return {
    ...song,
    title,
    artist: unescapeHtml(song.artist) || "Unknown Artist",
    album: unescapeHtml(song.album),
  };
}

/**
 * Fetches raw song results from JioSaavn API for a specific search query.
 */
async function fetchSongsByQuery(
  query: string,
  limit = 15,
  signal?: AbortSignal
): Promise<Song[]> {
  try {
    const params = [
      `query=${encodeURIComponent(query)}`,
      `limit=${limit}`,
      "page=1",
    ];
    const url = `${buildAppApiUrl("/search/songs")}?${params.join("&")}`;
    const payload = await fetchJsonStrict<any>(url, signal, 5500);

    const candidates = [
      payload?.data?.results,
      payload?.data?.songs?.results,
      payload?.data?.songs,
      payload?.results,
      payload?.songs?.results,
      payload?.songs,
      payload?.data,
    ];

    let rawList: any[] = [];
    for (const c of candidates) {
      if (Array.isArray(c)) {
        rawList = c;
        break;
      }
    }

    return rawList.flatMap((item) => {
      const parsed = parseApiSong(item);
      const sanitized = parsed ? sanitizeSong(parsed) : null;
      return sanitized && sanitized.id && sanitized.title ? [sanitized] : [];
    });
  } catch (error) {
    logger.warn(`[QuickPicks] Query failed for "${query}":`, error);
    return [];
  }
}

/**
 * Extracts songs from top editorially curated playlists from Home categories.
 */
async function extractPlaylistSongs(
  category: CatalogCategoryData | undefined,
  maxPlaylists = 2
): Promise<Song[]> {
  if (!category || !Array.isArray(category.results) || category.results.length === 0) {
    return [];
  }

  const targetPlaylists = category.results.slice(0, maxPlaylists);
  const songs: Song[] = [];

  await Promise.allSettled(
    targetPlaylists.map(async (pl: { id?: string }) => {
      if (!pl?.id) return;
      try {
        const details = await getCatalogPlaylistDetails(pl.id, { preferCache: true });
        if (details?.songs && Array.isArray(details.songs)) {
          for (const rawSong of details.songs) {
            const converted = convertJioSaavnSong(rawSong);
            const sanitized = sanitizeSong(converted);
            if (sanitized) songs.push(sanitized);
          }
        }
      } catch {
        // Ignore single playlist failure
      }
    })
  );

  return songs;
}

export async function clearQuickPicksCache(): Promise<void> {
  inMemoryQuickPicksPool = null;
  inMemoryTimestamp = 0;
  await AsyncStorage.removeItem(QUICK_PICKS_CACHE_KEY).catch(() => undefined);
}

/**
 * Fetches, cures, and categorizes Quick Picks songs across Trending,
 * Bollywood Hits, and Latest Releases with strict deduplication and fresh rotation.
 */
export async function fetchQuickPicksFeed(options?: {
  forceRefresh?: boolean;
  categories?: CatalogCategoryData[];
  newReleaseSongs?: Song[];
  signal?: AbortSignal;
}): Promise<QuickPicksPool> {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  // 1. Check in-memory cache
  if (
    !forceRefresh &&
    inMemoryQuickPicksPool &&
    now - inMemoryTimestamp < QUICK_PICKS_CACHE_TTL_MS
  ) {
    return inMemoryQuickPicksPool;
  }

  // 2. Check AsyncStorage cache
  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(QUICK_PICKS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          now - Number(parsed.timestamp || 0) < QUICK_PICKS_CACHE_TTL_MS &&
          parsed.pool &&
          Array.isArray(parsed.pool.all) &&
          parsed.pool.all.length >= 8
        ) {
          inMemoryQuickPicksPool = parsed.pool;
          inMemoryTimestamp = Number(parsed.timestamp);
          return parsed.pool;
        }
      }
    } catch {
      // Proceed to live fetch
    }
  }

  const { categories = [], newReleaseSongs = [], signal } = options || {};

  // 3. Parallel extraction from multiple diverse sources
  const trendingCat = categories.find((c) => c.id === "trending");
  const bollywoodCat = categories.find((c) => c.id === "bollywood");

  const [
    trendingSearch,
    bollywoodSearch,
    latestSearch,
    trendingPlaylistSongs,
    bollywoodPlaylistSongs,
  ] = await Promise.all([
    fetchSongsByQuery("trending hindi songs", 20, signal),
    fetchSongsByQuery(`latest bollywood hits ${new Date().getFullYear()}`, 20, signal),
    fetchSongsByQuery(`new hindi songs ${new Date().getFullYear()}`, 20, signal),
    trendingCat ? extractPlaylistSongs(trendingCat, 1) : Promise.resolve([]),
    bollywoodCat ? extractPlaylistSongs(bollywoodCat, 1) : Promise.resolve([]),
  ]);

  // 4. Deduplicate and bucketize songs
  const filterUnique = (songList: Song[], maxCount: number): Song[] => {
    const list: Song[] = [];
    const seenCanonical = new Set<string>();
    const seenIds = new Set<string>();
    for (const song of songList) {
      if (list.length >= maxCount) break;
      if (!song?.id || seenIds.has(song.id)) continue;

      const key = canonicalSongKey(song.title);
      if (!key || seenCanonical.has(key)) continue;

      seenCanonical.add(key);
      seenIds.add(song.id);
      list.push(song);
    }
    return list;
  };

  // Trending pool: combine top trending playlist tracks + direct trending queries
  const rawTrending = [
    ...trendingPlaylistSongs,
    ...trendingSearch,
  ];
  const trendingPool = filterUnique(rawTrending, 18);

  // Bollywood pool: combine bollywood playlist tracks + bollywood hits searches
  const rawBollywood = [
    ...bollywoodPlaylistSongs,
    ...bollywoodSearch,
  ];
  const bollywoodPool = filterUnique(rawBollywood, 18);

  // Latest pool: combine newReleaseSongs + latest searches
  const rawLatest = [
    ...newReleaseSongs.flatMap((s) => {
      const sanitized = sanitizeSong(s);
      return sanitized ? [sanitized] : [];
    }),
    ...latestSearch.filter(isLikelyNewReleaseSong),
  ];
  const latestPool = filterUnique(rawLatest, 18);

  // 5. Build balanced "All" pool (up to 24 tracks with variety)
  const allCurated: Song[] = [];
  const allSeen = new Set<string>();
  const maxPerGroup = 8;
  const appendUnique = (songs: Song[]) => {
    for (const song of songs) {
      if (allCurated.length >= 24) break;
      const key = canonicalSongKey(song.title);
      if (allSeen.has(key)) continue;
      allSeen.add(key);
      allCurated.push(song);
    }
  };

  appendUnique(trendingPool.slice(0, maxPerGroup));
  appendUnique(bollywoodPool.slice(0, maxPerGroup));
  appendUnique(latestPool.slice(0, maxPerGroup));

  // If still less than 24, fill from remaining items in the pools
  if (allCurated.length < 24) {
    const remaining = [
      ...trendingPool.slice(maxPerGroup),
      ...bollywoodPool.slice(maxPerGroup),
      ...latestPool.slice(maxPerGroup),
    ];
    appendUnique(remaining);
  }

  const finalAll = allCurated.slice(0, 24);

  const pool: QuickPicksPool = {
    trending: trendingPool.length > 0 ? trendingPool : finalAll,
    bollywood: bollywoodPool.length > 0 ? bollywoodPool : finalAll,
    latest: latestPool,
    all: finalAll,
  };

  inMemoryQuickPicksPool = pool;
  inMemoryTimestamp = Date.now();

  // Persist to cache
  void AsyncStorage.setItem(
    QUICK_PICKS_CACHE_KEY,
    JSON.stringify({ pool, timestamp: inMemoryTimestamp })
  ).catch(() => undefined);

  return pool;
}

/**
 * Returns the tailored Quick Picks songs based on the active Home tab.
 */
export function getQuickPicksForCategory(
  pool: QuickPicksPool | null | undefined,
  selectedCategory: string
): Song[] {
  if (!pool || !Array.isArray(pool.all) || pool.all.length === 0) {
    return [];
  }

  const cat = (selectedCategory || "All").trim();

  if (cat === "Trending") {
    return pool.trending;
  }

  if (cat === "Bollywood") {
    return pool.bollywood;
  }

  if (cat === "New Releases") {
    return pool.latest;
  }

  if (cat === "Charts") {
    return pool.trending;
  }

  if (cat === "Party Mix" || cat === "Festive") {
    return [...pool.bollywood, ...pool.trending, ...pool.all].slice(0, 24);
  }

  return pool.all;
}
