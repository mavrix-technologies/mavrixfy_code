import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib/logger";
import { getApiUrl } from "@/lib/api-config";
import { sortedCopy, shuffleArray } from "@/lib/arrayUtils";
import { withTimeout } from "@/utils/asyncUtils";
import { unescapeHtml } from "@/utils/stringUtils";
import {
  dedupeByPlaylistId,
  parsePlaylistSearchResponse,
  parseAlbumSearchResponse,
  mapHomepageItemToPlaylistResult,
  consumeResponseBody,
} from "./JioSaavnNormalizers";
import type {
  JioSaavnPlaylistResult,
  JioSaavnAlbumResult,
  HomeJioSaavnCategory,
  AutoRefreshTimeSlot,
  AutoRefreshContext,
} from "./JioSaavnTypes";
import {
  JIOSAAVN_CATEGORY_CACHE_TTL_MS,
  HOME_JIOSAAVN_CATEGORIES,
} from "./JioSaavnTypes";

const CURRENT_YEAR = new Date().getFullYear();
const CACHE_PREFIX = "@mavrixfy_jiosaavn_home_v2";
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

const JIOSAAVN_SEARCH_BASE_URLS = [
  `${getApiUrl().replace(/\/+$/, "")}/api`,
];

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
  return CATEGORY_TTL_MS[categoryId] ?? JIOSAAVN_CATEGORY_CACHE_TTL_MS;
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

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


export function buildRefreshQuery(query: string, forceRefresh: boolean): string {
  if (!forceRefresh) return query;

  const variations = [
    query,
    `${query} fresh`,
    `${query} latest`,
    `${query} updated`,
    `new ${query}`,
  ];

  return variations[randomInt(0, variations.length - 1)];
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
): Promise<JioSaavnPlaylistResult[]> {
  let enhancedQuery = query.trim();

  if (shouldAppendYear(enhancedQuery)) {
    enhancedQuery = `${enhancedQuery} ${CURRENT_YEAR}`;
  }

  const finalQuery = buildRefreshQuery(enhancedQuery, forceRefresh);
  const page = forceRefresh ? randomInt(1, 3) : 1;
  const requestLimit = forceRefresh ? limit + 4 : limit;

  const requestUrls = JIOSAAVN_SEARCH_BASE_URLS.map((endpointBase) => {
    const trimmed = endpointBase.replace(/\/+$/, "");
    return (
      `${trimmed}/search/playlists?` +
      `query=${encodeURIComponent(finalQuery)}&limit=${requestLimit}&page=${page}`
    );
  });

  const providerResults = await Promise.all(
    requestUrls.map(async (requestUrl) => {
      try {
        const response = await withTimeout(
          fetch(requestUrl, {
            headers: { Accept: "application/json" },
          })
        );

        if (!response.ok) {
          await consumeResponseBody(response);
          return [] as JioSaavnPlaylistResult[];
        }

        const json = await response.json();
        return parsePlaylistSearchResponse(json);
      } catch {
        return [] as JioSaavnPlaylistResult[];
      }
    })
  );

  return providerResults.find((parsed) => parsed.length > 0) ?? [];
}

export async function searchJioSaavnAlbums(
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<JioSaavnAlbumResult[]> {
  const searchQuery = query.trim();
  if (!searchQuery) return [];

  const requestUrls = JIOSAAVN_SEARCH_BASE_URLS.map((endpointBase) => {
    const trimmed = endpointBase.replace(/\/+$/, "");
    return (
      `${trimmed}/search/albums?` +
      `query=${encodeURIComponent(searchQuery)}&limit=${Math.max(1, limit)}&page=1`
    );
  });

  const providerResults = await Promise.all(
    requestUrls.map(async (requestUrl) => {
      try {
        const response = await withTimeout(
          fetch(requestUrl, {
            headers: { Accept: "application/json" },
            signal,
          })
        );

        if (!response.ok) {
          await consumeResponseBody(response);
          return [] as JioSaavnAlbumResult[];
        }

        const json = await response.json();
        return parseAlbumSearchResponse(json);
      } catch {
        return [] as JioSaavnAlbumResult[];
      }
    })
  );

  const seen = new Set<string>();
  const albums: JioSaavnAlbumResult[] = [];
  for (const album of providerResults.flat()) {
    if (!album.id || seen.has(album.id)) continue;
    seen.add(album.id);
    albums.push(album);
    if (albums.length >= limit) break;
  }

  return albums;
}

export function sortPlaylists(playlists: JioSaavnPlaylistResult[], categoryId: string): JioSaavnPlaylistResult[] {
  const trendingKeywords = ["trending", "top", "hit", "superhit", "chart", "viral"];
  const freshKeywords = ["latest", "new", "fresh", "updated", String(CURRENT_YEAR)];
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
): Promise<JioSaavnPlaylistResult[]> {
  let primary = await searchPlaylistsRaw(query, limit, forceRefresh);

  if (primary.length < Math.min(limit, 5) && forceRefresh) {
    const fallback = await searchPlaylistsRaw(query, limit, false);
    primary = dedupeByPlaylistId([...primary, ...fallback]);
  }

  const sorted = sortPlaylists(primary, categoryId);
  return forceRefresh ? shuffleArray(sorted).slice(0, limit) : sorted.slice(0, limit);
}

export function buildContextBoostTerms(category: HomeJioSaavnCategory, context: AutoRefreshContext): string[] {
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
  playlists: JioSaavnPlaylistResult[],
  categoryId: string,
  keywords: string[]
): JioSaavnPlaylistResult[] {
  return sortedCopy(playlists, (a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    const aKeyword = keywordScore(aName, keywords);
    const bKeyword = keywordScore(bName, keywords);
    if (aKeyword !== bKeyword) return bKeyword - aKeyword;

    const aYearBoost = aName.includes(String(CURRENT_YEAR)) ? 20 : 0;
    const bYearBoost = bName.includes(String(CURRENT_YEAR)) ? 20 : 0;
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
): Promise<JioSaavnPlaylistResult[]> {
  const category = HOME_JIOSAAVN_CATEGORIES.find((cat) => cat.id === categoryId);
  const searchTerms = category?.searchTerms ?? [];
  const boostTerms = category ? buildContextBoostTerms(category, context) : [];

  let terms = [...searchTerms, ...boostTerms];
  if (forceRefresh) {
    terms = shuffleArray(terms);
  }

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
  return forceRefresh ? shuffleArray(ranked).slice(0, limit) : ranked.slice(0, limit);
}

export function fetchViralPlaylists(
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<JioSaavnPlaylistResult[]> {
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
): Promise<JioSaavnPlaylistResult[]> {
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
): Promise<JioSaavnPlaylistResult[]> {
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
): Promise<JioSaavnPlaylistResult[]> {
  const trendingCategory = HOME_JIOSAAVN_CATEGORIES.find((cat) => cat.id === "trending");
  const trendingSearchTerms = trendingCategory?.searchTerms ?? ["trending now", "top 50"];
  const contextBoostTerms = buildContextBoostTerms(
    trendingCategory ?? HOME_JIOSAAVN_CATEGORIES[0],
    context
  );

  const chartTerms = [
    `top 50 this week ${CURRENT_YEAR}`,
    "trending this week",
    "weekly top songs",
    "most popular this week",
  ];

  const terms = forceRefresh
    ? shuffleArray([...contextBoostTerms, ...trendingSearchTerms, ...chartTerms])
    : [...contextBoostTerms, ...trendingSearchTerms, ...chartTerms];

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
  return forceRefresh ? shuffleArray(sorted).slice(0, limit) : sorted.slice(0, limit);
}

import {
  fetchJioSaavnDetailsByLink,
  fetchNewArrivalPlaylists,
} from "./JioSaavnScraperService";

export {
  fetchJioSaavnDetailsByLink,
  fetchNewArrivalPlaylists,
};

export async function getCategoryCache(
  categoryId: string,
  expectedFingerprint: string,
  options?: { allowFingerprintMismatch?: boolean }
): Promise<JioSaavnPlaylistResult[] | null> {
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
  playlists: JioSaavnPlaylistResult[],
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

export async function clearJioSaavnPlaylistCache(categoryId?: string): Promise<void> {
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
    const jioSaavnKeys = allKeys.filter((key) => key.startsWith(CACHE_PREFIX));
    if (jioSaavnKeys.length > 0) {
      await AsyncStorage.multiRemove(jioSaavnKeys);
    }
  } catch {
    // Silent cache clear failure
  }
}
import {
  getScrapedJioSaavnHomeModules,
  fetchScrapedCategoryFromHomepage,
} from "./JioSaavnScraperService";

export {
  getScrapedJioSaavnHomeModules,
  fetchScrapedCategoryFromHomepage,
};

export async function getPlaylistsByCategory(
  category: HomeJioSaavnCategory,
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<JioSaavnPlaylistResult[]> {
  const scraped = await fetchScrapedCategoryFromHomepage(category.id, limit, forceRefresh);
  if (scraped && scraped.length > 0) {
    return scraped;
  }

  if (category.id === "trending") return fetchTrendingPlaylists(limit, forceRefresh, context);
  if (category.id === "most-viral") return fetchViralPlaylists(limit, forceRefresh, context);
  if (category.id === "most-played") return fetchMostPlayedPlaylists(limit, forceRefresh, context);
  if (category.id === "top-dhurandhar") return fetchTopDhurandharPlaylists(limit, forceRefresh, context);
  if (category.id === "new-arrivals") return fetchNewArrivalPlaylists(limit, forceRefresh, context);

  let searchTerms = buildContextBoostTerms(category, context);
  if (forceRefresh) {
    searchTerms = shuffleArray(searchTerms);
  }

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
  return forceRefresh ? shuffleArray(sorted).slice(0, limit) : sorted.slice(0, limit);
}
