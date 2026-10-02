import { sortedCopy } from "@/lib/arrayUtils";
import { fetchWithTimeout } from "@/utils/asyncUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  consumeResponseBody,
  dedupeByPlaylistId,
  getCatalogSearchBaseUrls,
  parseAlbumSearchResponse,
  parsePlaylistSearchResponse,
} from "./MusicCatalogNormalizers";
import type {
  AutoRefreshContext,
  AutoRefreshTimeSlot,
  CatalogAlbumResult,
  CatalogCategory,
  CatalogPlaylistResult,
} from "./MusicCatalogTypes";
import {
  CATALOG_CATEGORY_CACHE_TTL_MS,
  DEFAULT_CATALOG_CATEGORIES,
} from "./MusicCatalogTypes";

export { getCatalogSearchBaseUrls };
export const getJioSaavnSearchBaseUrls = getCatalogSearchBaseUrls;

const CACHE_PREFIX = "@mavrixfy_catalog_category_v4";
const CATEGORY_STALE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CATEGORY_TTL_MS: Record<string, number> = {
  trending: 30 * 60 * 1000,
  "top-charts": 45 * 60 * 1000,
  bollywood: 60 * 60 * 1000,
  popular: 45 * 60 * 1000,
  "new-arrivals": 45 * 60 * 1000,
  "most-viral": 45 * 60 * 1000,
  "party-mix": 60 * 60 * 1000,
  "chill-vibes": 60 * 60 * 1000,
  romance: 60 * 60 * 1000,
  workout: 60 * 60 * 1000,
  retro: 90 * 60 * 1000,
};

export function buildCategoryCacheKey(categoryId: string): string {
  return `${CACHE_PREFIX}:${categoryId}`;
}

export function buildCategoryCacheTimeKey(categoryId: string): string {
  return `${CACHE_PREFIX}:${categoryId}:time`;
}

export function buildCategoryCacheFingerprintKey(categoryId: string): string {
  return `${CACHE_PREFIX}:${categoryId}:fingerprint`;
}

export function getCategoryTtlMs(categoryId: string): number {
  return CATEGORY_TTL_MS[categoryId] ?? CATALOG_CATEGORY_CACHE_TTL_MS;
}

export function getCurrentRefreshContext(now: Date = new Date()): AutoRefreshContext {
  const hour = now.getHours();
  let slot: AutoRefreshTimeSlot = "night";

  if (hour >= 5 && hour < 12) slot = "morning";
  else if (hour >= 12 && hour < 17) slot = "afternoon";
  else if (hour >= 17 && hour < 22) slot = "evening";

  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const languageBias: AutoRefreshContext["languageBias"] = "hindi";
  const cacheFingerprint = `v5|${slot}|${isWeekend ? "weekend" : "weekday"}|${languageBias}`;

  return {
    timestamp: now.getTime(),
    slot,
    isWeekend,
    languageBias,
    cacheFingerprint,
  };
}

export function shouldAppendYear(query: string): boolean {
  const lowered = query.toLowerCase();
  const hasYear = /\b20\d{2}\b/.test(lowered);
  const hasTrendingHint =
    lowered.includes("trending") ||
    lowered.includes("latest") ||
    lowered.includes("new") ||
    lowered.includes("top") ||
    lowered.includes("hit");

  return hasTrendingHint && !hasYear;
}

export async function searchPlaylistsRaw(
  query: string,
  limit: number,
  forceRefresh: boolean
): Promise<CatalogPlaylistResult[]> {
  let enhancedQuery = query.trim();

  if (shouldAppendYear(enhancedQuery)) {
    enhancedQuery = `${enhancedQuery} ${new Date().getFullYear()}`;
  }

  const requestLimit = limit;

  const requestUrls = getCatalogSearchBaseUrls().map((endpointBase) => {
    const trimmed = endpointBase.replace(/\/+$/, "");
    return (
      `${trimmed}/search/playlists?` +
      `query=${encodeURIComponent(enhancedQuery)}&limit=${requestLimit}&page=1` +
      (forceRefresh ? `&refresh=1&ts=${Date.now()}` : "")
    );
  });

  const providerResults = await Promise.all(
    requestUrls.map(async (requestUrl) => {
      try {
        const response = await fetchWithTimeout(requestUrl, { headers: { Accept: "application/json" } });

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

export async function searchCatalogAlbums(
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<CatalogAlbumResult[]> {
  const searchQuery = query.trim();
  if (!searchQuery) return [];

  const requestUrls = getCatalogSearchBaseUrls().map((endpointBase) => {
    const trimmed = endpointBase.replace(/\/+$/, "");
    return (
      `${trimmed}/search/albums?` +
      `query=${encodeURIComponent(searchQuery)}&limit=${Math.max(1, limit)}&page=1`
    );
  });

  const providerResults = await Promise.all(
    requestUrls.map(async (requestUrl) => {
      try {
        const response = await fetchWithTimeout(requestUrl, { headers: { Accept: "application/json" }, signal });

        if (!response.ok) {
          await consumeResponseBody(response);
          return [] as CatalogAlbumResult[];
        }

        const json = await response.json();
        return parseAlbumSearchResponse(json);
      } catch {
        return [] as CatalogAlbumResult[];
      }
    })
  );

  const seen = new Set<string>();
  const albums: CatalogAlbumResult[] = [];
  for (const album of providerResults.flat()) {
    if (!album.id || seen.has(album.id)) continue;
    seen.add(album.id);
    albums.push(album);
    if (albums.length >= limit) break;
  }

  return albums;
}

export const searchJioSaavnAlbums = searchCatalogAlbums;

export function sortPlaylists(playlists: CatalogPlaylistResult[], categoryId: string): CatalogPlaylistResult[] {
  const trendingKeywords = ["trending", "top", "hit", "superhit", "chart", "viral"];
  const freshKeywords = ["latest", "new", "fresh", "updated", String(new Date().getFullYear())];
  const isTrending = categoryId === "trending";

  const scoreMap = new Map<string, number>();
  for (const p of playlists) {
    const name = p.name.toLowerCase();
    let score = 0;
    if (freshKeywords.some((kw) => name.includes(kw))) score += 100;
    if (isTrending && trendingKeywords.some((kw) => name.includes(kw))) score += 80;
    scoreMap.set(p.id, score);
  }

  return sortedCopy(playlists, (a, b) => {
    const aScore = scoreMap.get(a.id) ?? 0;
    const bScore = scoreMap.get(b.id) ?? 0;
    if (aScore !== bScore) return bScore - aScore;

    if (a.songCount !== b.songCount) return b.songCount - a.songCount;
    return a.name.localeCompare(b.name);
  });
}

export async function searchPlaylists(
  query: string,
  limit: number,
  categoryId: string,
  forceRefresh: boolean
): Promise<CatalogPlaylistResult[]> {
  let primary = await searchPlaylistsRaw(query, limit, forceRefresh);

  if (primary.length < Math.min(limit, 5) && forceRefresh) {
    const fallback = await searchPlaylistsRaw(query, limit, false);
    primary = dedupeByPlaylistId([...primary, ...fallback]);
  }

  const sorted = sortPlaylists(primary, categoryId);
  return sorted.slice(0, limit);
}

export function buildContextBoostTerms(category: CatalogCategory, context: AutoRefreshContext): string[] {
  const boostedTerms: string[] = [];

  if (category.id === "trending") {
    if (context.slot === "morning") {
      boostedTerms.push("morning trending songs", "workout trending");
    } else if (context.slot === "evening") {
      boostedTerms.push("evening trending hits", "party trending");
    }

    if (context.isWeekend) {
      boostedTerms.push("weekend trending", "viral weekend songs");
    }

    if (context.languageBias === "hindi") {
      boostedTerms.push("hindi trending");
    } else if (context.languageBias === "punjabi" || context.isWeekend) {
      boostedTerms.push("punjabi trending");
    } else {
      boostedTerms.push("english trending");
    }
  }

  if (category.id === "most-viral") {
    if (context.slot === "morning") {
      boostedTerms.push("viral morning songs", "reels viral songs");
    } else if (context.slot === "evening") {
      boostedTerms.push("viral evening hits", "party viral songs");
    }

    if (context.languageBias === "hindi" || context.languageBias === "punjabi") {
      boostedTerms.push("hindi viral songs", "indian viral songs");
    } else {
      boostedTerms.push("english viral songs");
    }
  }

  if (category.id === "most-played") {
    if (context.slot === "morning") {
      boostedTerms.push("most played morning songs");
    } else if (context.slot === "evening") {
      boostedTerms.push("most played evening songs");
    }

    if (context.languageBias === "hindi" || context.languageBias === "punjabi") {
      boostedTerms.push("hindi most played", "bollywood most played");
    } else {
      boostedTerms.push("english most played");
    }
  }

  if (category.id === "top-dhurandhar") {
    if (context.slot === "evening" || context.slot === "night") {
      boostedTerms.push("dhurandhar evening hits");
    }

    if (context.languageBias === "hindi" || context.isWeekend) {
      boostedTerms.push("hindi top dhurandhar");
    }
  }

  if (category.id === "new-arrivals") {
    if (context.slot === "morning") {
      boostedTerms.push("new morning songs", "fresh release songs");
    } else if (context.slot === "evening" || context.slot === "night") {
      boostedTerms.push("new movie party songs", "night hype songs");
    }

    if (context.languageBias === "hindi" || context.languageBias === "punjabi") {
      boostedTerms.push("new bollywood songs", "latest hindi movie songs");
    } else {
      boostedTerms.push("new english pop songs", "latest global hits");
    }
  }

  const combined = [...category.searchTerms, ...boostedTerms];
  const seen = new Set<string>();
  return combined.filter((term) => {
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function keywordScore(name: string, keywords: string[]): number {
  const lowered = name.toLowerCase();
  return keywords.reduce((score, keyword) => {
    return lowered.includes(keyword) ? score + 40 : score;
  }, 0);
}

export function rankByKeywords(
  playlists: CatalogPlaylistResult[],
  categoryId: string,
  keywords: string[]
): CatalogPlaylistResult[] {
  return sortedCopy(playlists, (a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    const aKeyword = keywordScore(aName, keywords);
    const bKeyword = keywordScore(bName, keywords);
    if (aKeyword !== bKeyword) return bKeyword - aKeyword;

    const aYearBoost = aName.includes(String(new Date().getFullYear())) ? 20 : 0;
    const bYearBoost = bName.includes(String(new Date().getFullYear())) ? 20 : 0;
    if (aYearBoost !== bYearBoost) return bYearBoost - aYearBoost;

    if (a.songCount !== b.songCount) return b.songCount - a.songCount;

    return sortPlaylists([a, b], categoryId)[0].id === a.id ? -1 : 1;
  });
}

export async function fetchSignalPlaylists(
  categoryId: string,
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext,
  keywords: string[]
): Promise<CatalogPlaylistResult[]> {
  const category = DEFAULT_CATALOG_CATEGORIES.find((cat) => cat.id === categoryId);
  const searchTerms = category?.searchTerms ?? [];
  const boostTerms = category ? buildContextBoostTerms(category, context) : [];

  const terms = [...searchTerms, ...boostTerms];

  const results = await Promise.all(
    terms.slice(0, 4).map(async (term) => {
      try {
        return await searchPlaylists(term, Math.max(limit, 10), categoryId, forceRefresh);
      } catch {
        return [];
      }
    })
  );

  const merged = dedupeByPlaylistId(results.flat()).filter((playlist) => playlist.songCount >= 4);
  const ranked = rankByKeywords(merged, categoryId, keywords);
  return ranked.slice(0, limit);
}

export function fetchViralPlaylists(
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<CatalogPlaylistResult[]> {
  return fetchSignalPlaylists(
    "most-viral",
    limit,
    forceRefresh,
    context,
    ["viral", "reels", "shorts", "hot", "trending"]
  );
}

export function fetchMostPlayedPlaylists(
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<CatalogPlaylistResult[]> {
  return fetchSignalPlaylists(
    "most-played",
    limit,
    forceRefresh,
    context,
    ["most played", "played", "streamed", "popular", "top"]
  );
}

export function fetchTopDhurandharPlaylists(
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<CatalogPlaylistResult[]> {
  return fetchSignalPlaylists(
    "top-dhurandhar",
    limit,
    forceRefresh,
    context,
    ["dhurandhar", "superhit", "top", "hit", "chart"]
  );
}

export async function fetchTrendingPlaylists(
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<CatalogPlaylistResult[]> {
  const trendingCategory = DEFAULT_CATALOG_CATEGORIES.find((cat) => cat.id === "trending");
  const trendingSearchTerms = trendingCategory?.searchTerms ?? ["trending now", "top 50"];
  const contextBoostTerms = buildContextBoostTerms(
    trendingCategory ?? DEFAULT_CATALOG_CATEGORIES[0],
    context
  );

  const chartTerms = [
    `top 50 this week ${new Date().getFullYear()}`,
    "trending this week",
    "weekly top songs",
    "most popular this week",
  ];

  const terms = [...contextBoostTerms, ...trendingSearchTerms, ...chartTerms];

  const results = await Promise.all(
    terms.slice(0, 4).map(async (term) => {
      try {
        return await searchPlaylists(term, Math.max(limit, 9), "trending", forceRefresh);
      } catch {
        return [];
      }
    })
  );

  const merged = dedupeByPlaylistId(results.flat()).filter((playlist) => playlist.songCount >= 5);
  const sorted = sortPlaylists(merged, "trending");
  return sorted.slice(0, limit);
}

export function fetchNewArrivalPlaylists(limit = 10): Promise<CatalogPlaylistResult[]> {
  return searchPlaylists(`new hits hindi ${new Date().getFullYear()}`, limit, "new-arrivals", false);
}

export async function getCategoryCache(
  categoryId: string,
  expectedFingerprint: string,
  options?: { allowFingerprintMismatch?: boolean }
): Promise<CatalogPlaylistResult[] | null> {
  const allowFingerprintMismatch = options?.allowFingerprintMismatch ?? false;
  const cacheKey = buildCategoryCacheKey(categoryId);
  const cacheTimeKey = buildCategoryCacheTimeKey(categoryId);
  const cacheFingerprintKey = buildCategoryCacheFingerprintKey(categoryId);

  try {
    const [[, rawData], [, rawTime], [, rawFingerprint]] = await AsyncStorage.multiGet([
      cacheKey,
      cacheTimeKey,
      cacheFingerprintKey,
    ]);
    if (!rawData || !rawTime || !rawFingerprint) return null;

    const cachedAt = Number(rawTime);
    if (!Number.isFinite(cachedAt)) return null;

    const age = Date.now() - cachedAt;
    const ttlMs = getCategoryTtlMs(categoryId);
    const maxAgeMs = allowFingerprintMismatch ? Math.max(ttlMs, CATEGORY_STALE_MAX_AGE_MS) : ttlMs;
    if (age > maxAgeMs) return null;

    if (!allowFingerprintMismatch && rawFingerprint !== expectedFingerprint) return null;

    const parsed = JSON.parse(rawData);
    const normalized = dedupeByPlaylistId(parsed);
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

export async function setCategoryCache(
  categoryId: string,
  playlists: CatalogPlaylistResult[],
  contextFingerprint: string
): Promise<void> {
  if (playlists.length === 0) return;

  const cacheKey = buildCategoryCacheKey(categoryId);
  const cacheTimeKey = buildCategoryCacheTimeKey(categoryId);
  const cacheFingerprintKey = buildCategoryCacheFingerprintKey(categoryId);

  try {
    await AsyncStorage.multiSet([
      [cacheKey, JSON.stringify(playlists)],
      [cacheTimeKey, String(Date.now())],
      [cacheFingerprintKey, contextFingerprint],
    ]);
  } catch {
    // Silent cache write failure
  }
}

export async function clearCatalogPlaylistCache(categoryId?: string): Promise<void> {
  try {
    if (categoryId) {
      await AsyncStorage.multiRemove([
        buildCategoryCacheKey(categoryId),
        buildCategoryCacheTimeKey(categoryId),
        buildCategoryCacheFingerprintKey(categoryId),
      ]);
      return;
    }

    const allKeys = await AsyncStorage.getAllKeys();
    const catalogKeys = allKeys.filter((key) => key.startsWith(CACHE_PREFIX));
    if (catalogKeys.length > 0) {
      await AsyncStorage.multiRemove(catalogKeys);
    }
  } catch {
    // Silent cache clear failure
  }
}

export const clearJioSaavnPlaylistCache = clearCatalogPlaylistCache;

export async function getPlaylistsByCategory(
  category: CatalogCategory,
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<CatalogPlaylistResult[]> {
  if (category.id === "trending") return fetchTrendingPlaylists(limit, forceRefresh, context);
  if (category.id === "most-viral") return fetchViralPlaylists(limit, forceRefresh, context);
  if (category.id === "most-played") return fetchMostPlayedPlaylists(limit, forceRefresh, context);
  if (category.id === "top-dhurandhar") return fetchTopDhurandharPlaylists(limit, forceRefresh, context);

  const searchTerms = buildContextBoostTerms(category, context);

  const results = await Promise.all(
    searchTerms.slice(0, 4).map(async (term) => {
      try {
        return await searchPlaylists(term, Math.max(limit, 10), category.id, forceRefresh);
      } catch {
        return [];
      }
    })
  );

  const merged = dedupeByPlaylistId(results.flat()).filter((playlist) => playlist.songCount >= 3);
  const sorted = sortPlaylists(merged, category.id);
  return sorted.slice(0, limit);
}
