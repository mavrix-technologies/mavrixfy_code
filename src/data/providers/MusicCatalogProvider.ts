import { shuffleArray } from "@/lib/arrayUtils";
import { fetchWithTimeout } from "@/utils/asyncUtils";
import {
  getCategoryCache,
  getCurrentRefreshContext,
  getCatalogSearchBaseUrls,
  setCategoryCache,
} from "./MusicCatalogCategoryService";
import {
  consumeResponseBody,
  dedupeByPlaylistId,
  parsePlaylistSearchResponse,
} from "./MusicCatalogNormalizers";
import type {
  AutoRefreshContext,
  CatalogCategory,
  CatalogCategoryData,
  CatalogPlaylistResult,
} from "./MusicCatalogTypes";
import { DEFAULT_CATALOG_CATEGORIES } from "./MusicCatalogTypes";

export {
  DEFAULT_CATALOG_CATEGORIES,
  HOME_JIOSAAVN_CATEGORIES,
  CATALOG_CATEGORY_CACHE_TTL_MS,
  JIOSAAVN_CATEGORY_CACHE_TTL_MS,
  type AutoRefreshContext,
  type AutoRefreshTimeSlot,
  type CatalogAlbumResult,
  type CatalogCategory,
  type CatalogCategoryData,
  type CatalogPlaylistDetailsData,
  type CatalogPlaylistDetailsResponse,
  type CatalogPlaylistResult,
  type GetCatalogAlbumDetailsOptions,
  type GetCatalogPlaylistDetailsOptions,
  type GetJioSaavnAlbumDetailsOptions,
  type GetJioSaavnPlaylistDetailsOptions,
  type HomeJioSaavnCategory,
  type HomeJioSaavnCategoryData,
  type JioSaavnAlbumResult,
  type JioSaavnPlaylistDetailsData,
  type JioSaavnPlaylistDetailsResponse,
  type JioSaavnPlaylistResult,
} from "./MusicCatalogTypes";

export {
  buildImagesFromSingleUrl,
  consumeResponseBody,
  dedupeByPlaylistId,
  getAlbumArtistLabel,
  getArtistNames,
  getCatalogSearchBaseUrls,
  getJioSaavnSearchBaseUrls,
  mapHomepageItemToPlaylistResult,
  normalizeAlbumList,
  normalizeArtistList,
  normalizeArtists,
  normalizeImageList,
  normalizePlaylistDetailsData,
  normalizePlaylistList,
  normalizePlaylistSong,
  parseAlbumSearchResponse,
  parseBoolean,
  parsePlaylistDetailsResponse,
  parsePlaylistSearchResponse,
  parseSongCountValue,
} from "./MusicCatalogNormalizers";

export {
  CatalogDetailsError,
  getCatalogAlbumDetails,
  getCatalogPlaylistDetails,
  getCatalogSongDetails,
  getCachedAlbumDetails,
  getCachedCatalogAlbumDetails,
  getCachedCatalogPlaylistDetails,
  getCachedPlaylistDetails,
  getJioSaavnAlbumDetails,
  getJioSaavnPlaylistDetails,
  getJioSaavnSongDetails,
  JioSaavnPlaylistDetailsError,
  prefetchCatalogPlaylistDetails,
  prefetchPlaylistDetails,
  prefetchVisibleCatalogPlaylists,
  prefetchVisiblePlaylists,
  setCachedAlbumDetails,
  setCachedCatalogAlbumDetails,
  setCachedCatalogPlaylistDetails,
  setCachedPlaylistDetails,
} from "./MusicCatalogDetailsProvider";

export {
  clearCatalogPlaylistCache,
  clearJioSaavnPlaylistCache,
  fetchMostPlayedPlaylists,
  fetchNewArrivalPlaylists,
  fetchSignalPlaylists,
  fetchTopDhurandharPlaylists,
  fetchTrendingPlaylists,
  fetchViralPlaylists,
  getPlaylistsByCategory,
  searchCatalogAlbums,
  searchJioSaavnAlbums,
  searchPlaylists,
  searchPlaylistsRaw,
} from "./MusicCatalogCategoryService";

const FAST_TIMEOUT_MS = 6500;
const HOME_FETCH_CATEGORY_CONCURRENCY = 3;

const FAST_SEARCH_TERMS: Record<string, string> = {
  trending: "trending now hindi",
  "top-charts": "chartbusters hindi",
  bollywood: "latest bollywood hits",
  popular: "top 50 india hindi",
  "new-arrivals": "new hits hindi",
  "most-viral": "reels trending hindi",
  "party-mix": "dance hits hindi",
  "chill-vibes": "chill hindi songs",
  romance: "romantic hits hindi",
  workout: "workout songs hindi",
  retro: "old hindi songs",
};

const CATEGORY_NAME_TERMS: Record<string, string[]> = {
  trending: ["trending", "viral", "now"],
  "top-charts": ["chart", "top 50", "superhit"],
  bollywood: ["bollywood", "hindi"],
  popular: ["top 50", "superhit", "popular"],
  "new-arrivals": ["new", "latest"],
  "party-mix": ["party", "dance", "dj"],
  romance: ["romantic", "love"],
  "chill-vibes": ["chill", "lo-fi", "relax"],
};

function calculatePlaylistScore(
  playlist: CatalogPlaylistResult,
  context?: AutoRefreshContext
): number {
  if (!playlist) return 0;
  let score = 0;
  const name = String(playlist.name || "").toLowerCase();
  const year = String(new Date().getFullYear());
  const prevY = String(new Date().getFullYear() - 1);

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
    score += 18;
  }

  if (context?.slot === "morning" && (name.includes("morning") || name.includes("workout"))) score += 10;
  if (context?.slot === "evening" && (name.includes("evening") || name.includes("party"))) score += 10;
  if (context?.slot === "night" && (name.includes("night") || name.includes("chill"))) score += 10;
  if (context?.languageBias === "punjabi" && (name.includes("punjabi") || name.includes("bhangra"))) score += 10;
  if (context?.isWeekend && (name.includes("weekend") || name.includes("party"))) score += 8;

  return Number.isFinite(score) ? score : 0;
}

function rankPlaylists(
  playlists: CatalogPlaylistResult[],
  context?: AutoRefreshContext,
  categoryId?: string
): CatalogPlaylistResult[] {
  if (!Array.isArray(playlists) || playlists.length === 0) return [];
  return playlists
    .filter((p): p is CatalogPlaylistResult => Boolean(p && p.id && p.name))
    .map((p) => {
      const name = p.name.toLowerCase();
      const terms = CATEGORY_NAME_TERMS[categoryId || ""] || [];
      const match =
        terms.some((term) => name.includes(term)) ||
        (categoryId === "new-arrivals" && name.includes(String(new Date().getFullYear())));
      return { p, score: calculatePlaylistScore(p, context) + (match ? 150 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);
}

async function fetchCategoryFast(
  categoryId: string,
  limit: number,
  forceRefresh: boolean
): Promise<CatalogPlaylistResult[]> {
  const baseTerm = FAST_SEARCH_TERMS[categoryId] ?? `${categoryId} songs`;
  const term = ["bollywood", "new-arrivals", "top-charts", "party-mix", "romance"].includes(categoryId)
    ? `${baseTerm} ${new Date().getFullYear()}`
    : baseTerm;
  const apiLimit = Math.max(limit, 20);
  const urls = getCatalogSearchBaseUrls().map((base) => {
    const trimmed = base.replace(/\/+$/, "");
    const refresh = forceRefresh ? `&refresh=1&ts=${Date.now()}` : "";
    return `${trimmed}/search/playlists?query=${encodeURIComponent(term)}&limit=${apiLimit}&page=1${refresh}`;
  });

  const providerResults = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, FAST_TIMEOUT_MS);
        if (!response.ok) {
          await consumeResponseBody(response);
          return [] as CatalogPlaylistResult[];
        }
        const json = await response.json();
        return parsePlaylistSearchResponse(json);
      } catch {
        return [] as CatalogPlaylistResult[];
      }
    })
  );

  return providerResults.find((parsed) => parsed.length > 0) ?? [];
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = fn(item).then((result) => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      for (let i = executing.length - 1; i >= 0; i--) {
        const p = executing[i];
        if (p === promise) {
          executing.splice(i, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

async function fetchAndRankCategory(
  cat: CatalogCategory,
  limit: number,
  context: AutoRefreshContext,
  forceRefresh: boolean
): Promise<CatalogPlaylistResult[]> {
  const raw = await fetchCategoryFast(cat.id, limit * 4, forceRefresh);
  if (raw.length === 0) return [];

  const deduped = dedupeByPlaylistId(raw);
  const ranked = rankPlaylists(deduped, context, cat.id);
  return ranked;
}

export function mixForFeed(
  playlists: CatalogPlaylistResult[],
  limit = 10,
  shouldShuffle = true
): CatalogPlaylistResult[] {
  if (!Array.isArray(playlists) || playlists.length === 0) return [];
  const valid = playlists.filter((p): p is CatalogPlaylistResult => Boolean(p && p.id && p.name));
  const deduped = dedupeByPlaylistId(valid);

  if (shouldShuffle && deduped.length > 1) {
    const topAnchorCount = Math.min(2, deduped.length);
    const topAnchors = deduped.slice(0, topAnchorCount);
    const rest = shuffleArray(deduped.slice(topAnchorCount));
    return [...topAnchors, ...rest].slice(0, limit);
  }

  return deduped.slice(0, limit);
}

function buildDayFingerprint(context: AutoRefreshContext): string {
  const day = new Date(context.timestamp).toDateString();
  return `v8|${context.isWeekend ? "weekend" : "weekday"}|${context.languageBias}|${day}`;
}

export async function getHomeCatalogCategories(options?: {
  limit?: number;
  categoryIds?: string[];
  forceRefresh?: boolean;
}): Promise<CatalogCategoryData[]> {
  const limit = Math.max(1, options?.limit ?? 10);
  const forceRefresh = options?.forceRefresh ?? false;
  const context = getCurrentRefreshContext();
  const dayFingerprint = buildDayFingerprint(context);

  const categoryIdFilter = new Set(options?.categoryIds ?? []);
  const categoriesToFetch =
    categoryIdFilter.size > 0
      ? DEFAULT_CATALOG_CATEGORIES.filter((cat) => categoryIdFilter.has(cat.id))
      : DEFAULT_CATALOG_CATEGORIES;

  if (categoriesToFetch.length === 0) {
    return [];
  }

  const rawResults = await runWithConcurrencyLimit(
    categoriesToFetch,
    HOME_FETCH_CATEGORY_CONCURRENCY,
    async (cat) => {
      const fetchLimit = limit + 8;

      if (!forceRefresh) {
        const cached = await getCategoryCache(cat.id, dayFingerprint, { allowFingerprintMismatch: false });
        if (cached && cached.length > 0) {
          const ranked = rankPlaylists(cached, context, cat.id);
          return { cat, pool: ranked, isFresh: false };
        }
      }

      let fresh: CatalogPlaylistResult[] = [];
      try {
        fresh = await fetchAndRankCategory(cat, fetchLimit, context, forceRefresh);
      } catch {
        fresh = [];
      }

      if (fresh.length > 0) {
        void setCategoryCache(cat.id, fresh, dayFingerprint);
        return { cat, pool: fresh, isFresh: true };
      }

      const stale = await getCategoryCache(cat.id, dayFingerprint, { allowFingerprintMismatch: true });
      if (stale && stale.length > 0) {
        return { cat, pool: rankPlaylists(stale, context, cat.id), isFresh: false };
      }

      return { cat, pool: [] as CatalogPlaylistResult[], isFresh: false };
    }
  );

  const globalUsed = new Set<string>();

  const deduped = rawResults.map(({ cat, pool, isFresh }) => {
    const unique: CatalogPlaylistResult[] = [];

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

    return { id: cat.id, title: cat.title, results: unique, isFresh };
  });

  const nonEmpty = deduped.filter((cat) => cat.results.length > 0);
  return nonEmpty;
}

export const getHomeJioSaavnCategories = getHomeCatalogCategories;
