import { getCatalogAlbumDetails, getCatalogPlaylistDetails } from "./MusicCatalogDetailsProvider";
import { getOfficialHomeSongs } from "./MusicCatalogFeedService";
import type { CatalogCategoryData, CatalogPlaylistResult } from "./MusicCatalogTypes";
import { buildQuickPicksPool } from "./quickPicksPolicy";
import { convertJioSaavnSong, type Song } from "@/lib/musicData";
import { unescapeHtml } from "@/utils/stringUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEY = "@mavrixfy_quick_picks_cache_v5";
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface QuickPicksPool {
  trending: Song[];
  bollywood: Song[];
  latest: Song[];
  all: Song[];
}

export const EMPTY_QUICK_PICKS_POOL: QuickPicksPool = {
  trending: [], bollywood: [], latest: [], all: [],
};

let cachedPool: QuickPicksPool | null = null;
let cachedAt = 0;

function cleanMetadata(song: Song): Song {
  return { ...song, title: unescapeHtml(song.title), artist: unescapeHtml(song.artist), album: unescapeHtml(song.album) };
}

async function resolveCatalogItem(item: CatalogPlaylistResult): Promise<Song[]> {
  try {
    if (item.type === "song") {
      return (await getOfficialHomeSongs([{ id: item.id, url: item.url }])).map(cleanMetadata);
    }
    const details = item.type === "album" || item.type === "album_playlist"
      ? await getCatalogAlbumDetails(item.id, { link: item.url, preferCache: true })
      : await getCatalogPlaylistDetails(item.id, { link: item.url, preferCache: true });
    return (details.songs ?? []).slice(0, 20).map(convertJioSaavnSong).map(cleanMetadata);
  } catch {
    return [];
  }
}

async function resolveCategories(categories: CatalogCategoryData[], ids: string[]): Promise<Song[]> {
  const seen = new Set<string>();
  const items = ids.flatMap(id => categories.find(category => category.id === id)?.results.slice(0, 2) ?? [])
    .filter(item => {
      const key = `${item.type}:${item.id}`;
      if (!item.id || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  // Preserve order within each published list and give every source a turn.
  const lists = await Promise.all(items.map(resolveCatalogItem));
  const songs: Song[] = [];
  for (let index = 0; index < Math.max(0, ...lists.map(list => list.length)); index++) {
    for (const list of lists) {
      if (list[index]) songs.push(list[index]);
    }
  }
  return songs;
}

export async function clearQuickPicksCache(): Promise<void> {
  cachedPool = null;
  cachedAt = 0;
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
}

/** Use published catalog modules; a keyword match is not a trend or release signal. */
export async function fetchQuickPicksFeed(options: {
  forceRefresh?: boolean;
  categories: CatalogCategoryData[];
  newReleaseSongs: Song[];
}): Promise<QuickPicksPool> {
  const now = Date.now();
  if (!options.forceRefresh) {
    if (cachedPool && now - cachedAt < CACHE_TTL_MS) return cachedPool;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored && now - Number(stored.timestamp) < CACHE_TTL_MS &&
          ["trending", "bollywood", "latest", "all"].every(key => Array.isArray(stored.pool?.[key]))) {
        cachedPool = buildQuickPicksPool(stored.pool.trending, stored.pool.bollywood, stored.pool.latest);
        cachedAt = Number(stored.timestamp);
        if (cachedPool.all.length) return cachedPool;
      }
    } catch {
      // Rebuild from the published feed when local cache is unavailable.
    }
  }

  const [trending, bollywood, releases] = await Promise.all([
    resolveCategories(options.categories, ["trending", "charts", "most-viral"]),
    resolveCategories(options.categories, ["bollywood", "fresh-hits"]),
    resolveCategories(options.categories, ["new-releases", "new-arrivals"]),
  ]);
  const pool = buildQuickPicksPool(trending, bollywood, [...options.newReleaseSongs.map(cleanMetadata), ...releases]);
  if (!pool.all.length) return cachedPool ?? EMPTY_QUICK_PICKS_POOL;

  cachedPool = pool;
  cachedAt = Date.now();
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ pool, timestamp: cachedAt })).catch(() => undefined);
  return pool;
}

export function getQuickPicksForCategory(pool: QuickPicksPool | null | undefined, category: string): Song[] {
  if (!pool) return [];
  switch (category.trim()) {
    case "Trending":
    case "Charts": return pool.trending;
    case "Bollywood": return pool.bollywood;
    case "New Releases": return pool.latest;
    case "All": return pool.all;
    default: return [];
  }
}
