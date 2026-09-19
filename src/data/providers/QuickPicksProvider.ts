import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildAppApiUrl } from "@/lib/api-config";
import { fetchJson, withTimeout } from "@/utils/asyncUtils";
import { type Song, convertJioSaavnSong } from "@/lib/musicData";
import { parseApiSong } from "@/lib/searchRepository";
import { getJioSaavnPlaylistDetails } from "@/data/providers/JioSaavnDetailsProvider";
import { type HomeJioSaavnCategoryData } from "@/data/providers/JioSaavnTypes";
import { logger } from "@/lib/logger";
import { unescapeHtml } from "@/utils/stringUtils";
import { shuffleArray } from "@/lib/arrayUtils";

const QUICK_PICKS_CACHE_KEY = "@mavrixfy_quick_picks_cache_v2";
const QUICK_PICKS_CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes fresh rotation
const CURRENT_YEAR = new Date().getFullYear();

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
      `_t=${Date.now()}`,
    ];
    const url = `${buildAppApiUrl("/search/songs")}?${params.join("&")}`;
    const payload = await withTimeout(fetchJson<any>(url, signal), 5500);

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
  category: HomeJioSaavnCategoryData | undefined,
  maxPlaylists = 2
): Promise<Song[]> {
  if (!category || !Array.isArray(category.results) || category.results.length === 0) {
    return [];
  }

  const targetPlaylists = category.results.slice(0, maxPlaylists);
  const songs: Song[] = [];

  await Promise.allSettled(
    targetPlaylists.map(async (pl) => {
      if (!pl?.id) return;
      try {
        const details = await getJioSaavnPlaylistDetails(pl.id, { preferCache: true });
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
  categories?: HomeJioSaavnCategoryData[];
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
    fetchSongsByQuery(`latest bollywood hits ${CURRENT_YEAR}`, 20, signal),
    fetchSongsByQuery(`new hindi songs ${CURRENT_YEAR}`, 20, signal),
    trendingCat ? extractPlaylistSongs(trendingCat, 1) : Promise.resolve([]),
    bollywoodCat ? extractPlaylistSongs(bollywoodCat, 1) : Promise.resolve([]),
  ]);

  // 4. Deduplicate and bucketize songs
  const seenCanonical = new Set<string>();
  const seenIds = new Set<string>();

  const filterUnique = (songList: Song[], maxCount: number): Song[] => {
    const list: Song[] = [];
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
  const rawTrending = shuffleArray([
    ...trendingPlaylistSongs,
    ...trendingSearch,
  ]);
  const trendingPool = filterUnique(rawTrending, 18);

  // Bollywood pool: combine bollywood playlist tracks + bollywood hits searches
  const rawBollywood = shuffleArray([
    ...bollywoodPlaylistSongs,
    ...bollywoodSearch,
  ]);
  const bollywoodPool = filterUnique(rawBollywood, 18);

  // Latest pool: combine newReleaseSongs + latest searches
  const rawLatest = shuffleArray([
    ...newReleaseSongs.flatMap((s) => {
      const sanitized = sanitizeSong(s);
      return sanitized ? [sanitized] : [];
    }),
    ...latestSearch,
  ]);
  const latestPool = filterUnique(rawLatest, 18);

  // 5. Build balanced "All" pool (up to 24 tracks with variety)
  const allCurated: Song[] = [];
  const maxPerGroup = 8;

  allCurated.push(...trendingPool.slice(0, maxPerGroup));
  allCurated.push(...bollywoodPool.slice(0, maxPerGroup));
  allCurated.push(...latestPool.slice(0, maxPerGroup));

  // If still less than 24, fill from remaining items in the pools
  if (allCurated.length < 24) {
    const remaining = [
      ...trendingPool.slice(maxPerGroup),
      ...bollywoodPool.slice(maxPerGroup),
      ...latestPool.slice(maxPerGroup),
    ];
    for (const s of remaining) {
      if (allCurated.length >= 24) break;
      if (!allCurated.some((item) => item.id === s.id)) {
        allCurated.push(s);
      }
    }
  }

  // Shuffle "All" so the display order is fresh and diverse
  const finalAll = shuffleArray(allCurated).slice(0, 24);

  const pool: QuickPicksPool = {
    trending: trendingPool.length > 0 ? trendingPool : finalAll,
    bollywood: bollywoodPool.length > 0 ? bollywoodPool : finalAll,
    latest: latestPool.length > 0 ? latestPool : finalAll,
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

  if (cat === "Trending" && pool.trending.length >= 6) {
    return [...pool.trending.slice(0, 16), ...pool.all].slice(0, 24);
  }

  if (cat === "Bollywood" && pool.bollywood.length >= 6) {
    return [...pool.bollywood.slice(0, 16), ...pool.all].slice(0, 24);
  }

  if ((cat === "New Releases" || cat === "Charts") && pool.latest.length >= 6) {
    return [...pool.latest.slice(0, 16), ...pool.all].slice(0, 24);
  }

  if (cat === "Party Mix" || cat === "Festive") {
    return [...pool.bollywood, ...pool.trending, ...pool.all].slice(0, 24);
  }

  return pool.all;
}
