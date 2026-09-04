import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/api-config";
import { shuffleArray } from "@/lib/arrayUtils";
import { withTimeout } from "@/utils/asyncUtils";
import {
  dedupeByPlaylistId,
  parsePlaylistSearchResponse,
  consumeResponseBody,
} from "./JioSaavnNormalizers";
import {
  getCurrentRefreshContext,
  fetchScrapedCategoryFromHomepage,
  fetchNewArrivalPlaylists,
  getCategoryCache,
  setCategoryCache,
} from "./JioSaavnCategoryService";
import type {
  JioSaavnPlaylistResult,
  HomeJioSaavnCategory,
  HomeJioSaavnCategoryData,
  AutoRefreshContext,
} from "./JioSaavnTypes";
import { HOME_JIOSAAVN_CATEGORIES } from "./JioSaavnTypes";

export {
  type JioSaavnPlaylistResult,
  type JioSaavnAlbumResult,
  type HomeJioSaavnCategory,
  type HomeJioSaavnCategoryData,
  type JioSaavnPlaylistDetailsData,
  type JioSaavnPlaylistDetailsResponse,
  type GetJioSaavnPlaylistDetailsOptions,
  type GetJioSaavnAlbumDetailsOptions,
  type AutoRefreshTimeSlot,
  type AutoRefreshContext,
  JIOSAAVN_CATEGORY_CACHE_TTL_MS,
  HOME_JIOSAAVN_CATEGORIES,
} from "./JioSaavnTypes";

export {
  dedupeByPlaylistId,
  parseBoolean,
  normalizeImageList,
  parseSongCountValue,
  normalizeArtistList,
  getArtistNames,
  normalizeArtists,
  normalizePlaylistList,
  parsePlaylistSearchResponse,
  getAlbumArtistLabel,
  normalizeAlbumList,
  parseAlbumSearchResponse,
  normalizePlaylistSong,
  normalizePlaylistDetailsData,
  parsePlaylistDetailsResponse,
  buildImagesFromSingleUrl,
  mapHomepageItemToPlaylistResult,
} from "./JioSaavnNormalizers";

export {
  JioSaavnPlaylistDetailsError,
  getJioSaavnPlaylistDetails,
  getJioSaavnAlbumDetails,
  getJioSaavnSongDetails,
  getCachedPlaylistDetails,
  setCachedPlaylistDetails,
  getCachedAlbumDetails,
  setCachedAlbumDetails,
  prefetchPlaylistDetails,
  prefetchVisiblePlaylists,
} from "./JioSaavnDetailsProvider";

export {
  clearJioSaavnPlaylistCache,
  searchJioSaavnAlbums,
  searchPlaylistsRaw,
  searchPlaylists,
  getPlaylistsByCategory,
  fetchTrendingPlaylists,
  fetchSignalPlaylists,
  fetchViralPlaylists,
  fetchMostPlayedPlaylists,
  fetchTopDhurandharPlaylists,
  fetchNewArrivalPlaylists,
} from "./JioSaavnCategoryService";

const CURRENT_YEAR = new Date().getFullYear();
const FAST_TIMEOUT_MS = 6500;
const LAST_SHOWN_KEY = "@mavrixfy_last_shown_playlists_v1";
const LAST_SHOWN_MAX = 40;
const HOME_FETCH_CATEGORY_CONCURRENCY = 3;

const JIOSAAVN_SEARCH_BASE_URLS = [
  `${getApiUrl().replace(/\/+$/, "")}/api`,
];

const FAST_SEARCH_TERMS: Record<string, string> = {
  trending: `trending now hindi`,
  "top-charts": `india superhits hindi`,
  bollywood: `latest bollywood hits ${CURRENT_YEAR}`,
  popular: `popular hindi songs`,
  "new-arrivals": `new hits hindi ${CURRENT_YEAR}`,
  "most-viral": `reels trending hindi`,
  "party-mix": "party songs hindi",
  "chill-vibes": "chill hindi songs",
  romance: "romantic hindi songs",
  workout: "workout songs hindi",
  retro: "old hindi songs",
};


function calculatePlaylistScore(
  playlist: JioSaavnPlaylistResult,
  context?: AutoRefreshContext
): number {
  if (!playlist) return 0;
  let score = 0;
  const name = String(playlist.name || "").toLowerCase();
  const year = String(CURRENT_YEAR);
  const prevY = String(CURRENT_YEAR - 1);

  if (name.includes(year)) score += 45;
  if (name.includes("latest") || name.includes("new") || name.includes("fresh")) score += 35;
  if (name.includes(prevY)) score -= 15;

  const songCount = Number(playlist.songCount);
  const validSongCount = Number.isFinite(songCount) && songCount > 0 ? songCount : 5;
  score += Math.min(validSongCount * 0.75, 75);

  if (name.includes("trending") || name.includes("viral")) score += 24;
  if (name.includes("popular") || name.includes("most played")) score += 24;
  if (name.includes("top") || name.includes("chart")) score += 18;
  if (name.includes("hit") || name.includes("superhit")) score += 16;

  if (
    name.includes("weekly top") ||
    name.includes("chartbusters") ||
    name.includes("let's play") ||
    name.includes("ultimate") ||
    name.includes("best of") ||
    name.includes("official")
  ) {
    score += 80;
  }

  if (context?.languageBias === "hindi" && (name.includes("hindi") || name.includes("bollywood"))) score += 30;
  if (context?.languageBias === "punjabi" && (name.includes("punjabi") || name.includes("bhangra"))) score += 10;
  if (context?.isWeekend && (name.includes("weekend") || name.includes("party"))) score += 8;

  score += Math.random() * 8;

  return Number.isFinite(score) ? score : 0;
}

function rankPlaylists(
  playlists: JioSaavnPlaylistResult[],
  context?: AutoRefreshContext
): JioSaavnPlaylistResult[] {
  if (!Array.isArray(playlists) || playlists.length === 0) return [];
  return playlists
    .filter((p): p is JioSaavnPlaylistResult => Boolean(p && p.id && p.name))
    .map((p) => ({ p, score: calculatePlaylistScore(p, context) }))
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);
}

function applyFreshnessRotation(playlists: JioSaavnPlaylistResult[]): JioSaavnPlaylistResult[] {
  if (!Array.isArray(playlists) || playlists.length <= 1) return playlists;
  const todaySeed = new Date().getDate();
  const shift = playlists.length > 4 ? todaySeed % 2 : 0;
  if (shift === 0) return playlists;
  return [...playlists.slice(shift), ...playlists.slice(0, shift)];
}

async function getLastShownIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function updateLastShownIds(ids: string[]): Promise<void> {
  try {
    const existing = await getLastShownIds();
    const merged = [...ids, ...existing].slice(0, LAST_SHOWN_MAX);
    await AsyncStorage.setItem(LAST_SHOWN_KEY, JSON.stringify(merged));
  } catch {
    // Ignore error
  }
}

function removeRecentlyShown(
  playlists: JioSaavnPlaylistResult[],
  history?: Set<string> | null
): JioSaavnPlaylistResult[] {
  if (!Array.isArray(playlists)) return [];
  if (!history || typeof history.has !== "function" || history.size === 0) {
    return playlists;
  }
  const filtered = playlists.filter((p) => p?.id && !history.has(p.id));
  return filtered.length >= Math.min(playlists.length, 4) ? filtered : playlists;
}

async function fetchCategoryFast(
  categoryId: string,
  limit: number
): Promise<JioSaavnPlaylistResult[]> {
  const term = FAST_SEARCH_TERMS[categoryId] ?? `${categoryId} songs ${CURRENT_YEAR}`;
  const apiLimit = Math.max(limit, 20);
  const urls = JIOSAAVN_SEARCH_BASE_URLS.map((base) => {
    const trimmed = base.replace(/\/+$/, "");
    return `${trimmed}/search/playlists?query=${encodeURIComponent(term)}&limit=${apiLimit}&page=1`;
  });

  const providerResults = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await withTimeout(
          fetch(url, { headers: { Accept: "application/json" } }),
          FAST_TIMEOUT_MS
        );
        if (!res.ok) {
          await consumeResponseBody(res);
          return [] as JioSaavnPlaylistResult[];
        }

        const json = await res.json();
        return parsePlaylistSearchResponse(json);
      } catch {
        return [] as JioSaavnPlaylistResult[];
      }
    })
  );

  return providerResults.find((parsed) => parsed.length > 0) ?? [];
}

async function runWithConcurrencyLimit<T, R>(
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

  const workers = Array.from({ length: maxWorkers }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function fetchAndRankCategory(
  cat: HomeJioSaavnCategory,
  limit: number,
  context: AutoRefreshContext,
  history: Set<string>
): Promise<JioSaavnPlaylistResult[]> {
  const scraped = await fetchScrapedCategoryFromHomepage(cat.id, limit * 4, false);
  if (scraped && scraped.length > 0) {
    const deduped = dedupeByPlaylistId(scraped);
    const noRepeat = removeRecentlyShown(deduped, history);
    const ranked = rankPlaylists(noRepeat, context);
    return applyFreshnessRotation(ranked);
  }

  if (cat.id === "new-arrivals") {
    try {
      const arrivals = await fetchNewArrivalPlaylists(limit, false, context);
      if (arrivals && arrivals.length > 0) {
        return arrivals;
      }
    } catch {
      // Fall through to fast category search
    }
  }

  const raw = await fetchCategoryFast(cat.id, limit * 4);
  if (raw.length === 0) return [];

  const deduped = dedupeByPlaylistId(raw);
  const noRepeat = removeRecentlyShown(deduped, history);
  const ranked = rankPlaylists(noRepeat, context);
  return applyFreshnessRotation(ranked);
}

export function mixForFeed(
  byCategory: Record<string, JioSaavnPlaylistResult[]>,
  limit: number
): JioSaavnPlaylistResult[] {
  const trending = byCategory["trending"] ?? [];
  const newArr = byCategory["new-arrivals"] ?? [];
  const viral = byCategory["most-viral"] ?? [];

  const mixed = [
    ...trending.slice(0, 5),
    ...newArr.slice(0, 5),
    ...viral.slice(0, 5),
  ];

  const deduped = dedupeByPlaylistId(mixed);
  return shuffleArray(deduped).slice(0, limit);
}

function buildDayFingerprint(context: AutoRefreshContext): string {
  const day = new Date().getDate();
  return `v7|${context.isWeekend ? "weekend" : "weekday"}|${context.languageBias}|day${day}`;
}

export async function getHomeJioSaavnCategories(options?: {
  forceRefresh?: boolean;
  limitPerCategory?: number;
  realtime?: boolean;
  categoryIds?: string[];
  signal?: AbortSignal;
}): Promise<HomeJioSaavnCategoryData[]> {
  const forceRefresh = options?.forceRefresh ?? false;
  const limit = Math.min(options?.limitPerCategory ?? 10, 12);
  const context = getCurrentRefreshContext();
  const dayFingerprint = buildDayFingerprint(context);
  const categoryIdFilter = new Set(options?.categoryIds ?? []);
  const categoriesToFetch =
    categoryIdFilter.size > 0
      ? HOME_JIOSAAVN_CATEGORIES.filter((cat) => categoryIdFilter.has(cat.id))
      : HOME_JIOSAAVN_CATEGORIES;

  if (categoriesToFetch.length === 0) {
    return [];
  }

  const historyPromise = getLastShownIds();
  const rawResults = await runWithConcurrencyLimit(
    categoriesToFetch,
    HOME_FETCH_CATEGORY_CONCURRENCY,
    async (cat) => {
      const fetchLimit = limit + 8;

      if (!forceRefresh) {
        const cached = await getCategoryCache(cat.id, dayFingerprint, { allowFingerprintMismatch: false });
        if (cached && cached.length > 0) {
          const ranked = rankPlaylists(cached, context);
          const rotated = applyFreshnessRotation(ranked);
          return { cat, pool: rotated };
        }
      }

      let fresh: JioSaavnPlaylistResult[] = [];
      try {
        const history = await historyPromise;
        fresh = await fetchAndRankCategory(cat, fetchLimit, context, history);
      } catch {
        fresh = [];
      }

      if (fresh.length > 0) {
        void setCategoryCache(cat.id, fresh, dayFingerprint);
        return { cat, pool: fresh };
      }

      const stale = await getCategoryCache(cat.id, dayFingerprint, { allowFingerprintMismatch: true });
      if (stale && stale.length > 0) {
        const rotated = applyFreshnessRotation(rankPlaylists(stale, context));
        return { cat, pool: rotated };
      }

      return { cat, pool: [] as JioSaavnPlaylistResult[] };
    }
  );

  const globalUsed = new Set<string>();

  const deduped = rawResults.map(({ cat, pool }) => {
    const unique: JioSaavnPlaylistResult[] = [];

    for (const p of pool) {
      if (!globalUsed.has(p.id)) {
        globalUsed.add(p.id);
        unique.push(p);
        if (unique.length >= limit) break;
      }
    }

    const targetMin = Math.min(pool.length, 4);
    if (unique.length < targetMin) {
      for (const p of pool) {
        if (!unique.some((u) => u.id === p.id)) {
          unique.push(p);
          globalUsed.add(p.id);
          if (unique.length >= targetMin) break;
        }
      }
    }

    return { id: cat.id, title: cat.title, results: unique };
  });

  const nonEmpty = deduped.filter((cat) => cat.results.length > 0);

  const shownIds = nonEmpty.flatMap((cat) => cat.results.map((p) => p.id));
  void updateLastShownIds(shownIds);

  return nonEmpty;
}
