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
  if (categoryId === "spotify") return playlists;
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
  if (categoryId === "spotify") {
    const spotifyUrls = getCatalogSearchBaseUrls().map((base) => `${base.replace(/\/+$/, "")}/spotify/playlists`);
    for (const url of spotifyUrls) {
      try {
        const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, FAST_TIMEOUT_MS);
        if (response.ok) {
          const json = await response.json();
          const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
          if (list.length > 0) {
            return list as CatalogPlaylistResult[];
          }
        }
      } catch {
        // continue to fallback
      }
    }
  }
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
  return rankPlaylists(deduped, context, cat.id);
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

  return deduped.filter((cat) => cat.results.length > 0);
}

export const getHomeJioSaavnCategories = getHomeCatalogCategories;

export const SPOTIFY_FLAGSHIP_PRESETS: CatalogPlaylistResult[] = [
  {
    id: "pl_trending_india",
    name: "Trending Now India",
    description: "Every track making waves across India right now.",
    songCount: 50,
    image: [
      { quality: "50x50", url: "https://i.scdn.co/image/ab67706f00000002b30d7e201b1c0085357deb4a" },
      { quality: "150x150", url: "https://i.scdn.co/image/ab67706f00000002b30d7e201b1c0085357deb4a" },
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f00000002b30d7e201b1c0085357deb4a" },
    ],
  },
  {
    id: "pl_hot_hits_hindi",
    name: "Hot Hits Hindi",
    description: "Hottest Hindi tracks making waves right now. Cover: Arijit Singh",
    songCount: 50,
    image: [
      { quality: "50x50", url: "https://i.scdn.co/image/ab67706f00000002cdb9f3aa5daf93253b072a55" },
      { quality: "150x150", url: "https://i.scdn.co/image/ab67706f00000002cdb9f3aa5daf93253b072a55" },
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f00000002cdb9f3aa5daf93253b072a55" },
    ],
  },
  {
    id: "pl_bollywood_central",
    name: "Bollywood Central",
    description: "Central destination for all your favorite Bollywood music.",
    songCount: 50,
    image: [
      { quality: "50x50", url: "https://i.scdn.co/image/ab67706f00000002fc392f1c1d0f9a1148b9fb8b" },
      { quality: "150x150", url: "https://i.scdn.co/image/ab67706f00000002fc392f1c1d0f9a1148b9fb8b" },
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f00000002fc392f1c1d0f9a1148b9fb8b" },
    ],
  },
  {
    id: "pl_top50_india",
    name: "Top 50 - India",
    description: "Your daily update of the most played tracks in India right now.",
    songCount: 50,
    image: [
      { quality: "50x50", url: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_in_default.jpg" },
      { quality: "150x150", url: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_in_default.jpg" },
      { quality: "500x500", url: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_in_default.jpg" },
    ],
  },
  {
    id: "pl_top50_global",
    name: "Top 50 - Global",
    description: "Your daily update of the most played tracks right now - Global.",
    songCount: 50,
    image: [
      { quality: "50x50", url: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_global_default.jpg" },
      { quality: "150x150", url: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_global_default.jpg" },
      { quality: "500x500", url: "https://charts-images.scdn.co/assets/locale_en/regional/daily/region_global_default.jpg" },
    ],
  },
  {
    id: "pl_viral50_india",
    name: "Viral 50 - India",
    description: "Your daily update of the most viral tracks in India right now.",
    songCount: 50,
    image: [
      { quality: "50x50", url: "https://charts-images.scdn.co/assets/locale_en/viral/daily/region_in_default.jpg" },
      { quality: "150x150", url: "https://charts-images.scdn.co/assets/locale_en/viral/daily/region_in_default.jpg" },
      { quality: "500x500", url: "https://charts-images.scdn.co/assets/locale_en/viral/daily/region_in_default.jpg" },
    ],
  },
  {
    id: "pl_hot_hits_punjabi",
    name: "Hot Hits Punjabi",
    description: "The hottest tracks in Punjabi music right now.",
    songCount: 50,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f000000028585020686db2e3afb0791f8" },
    ],
  },
  {
    id: "pl_mega_punjabi",
    name: "Mega Punjabi Hits",
    description: "Mega Punjabi anthems dominating the charts.",
    songCount: 75,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f000000029ec61175e1fe7acf4e2867f6" },
    ],
  },
];

export const SPOTIFY_MADE_FOR_YOU_PRESETS: CatalogPlaylistResult[] = [
  {
    id: "pl_daily_mix_1",
    name: "Daily Mix 1",
    description: "Arijit Singh, Pritam, Sachin-Jigar and romantic Bollywood favorites.",
    songCount: 50,
    image: [
      { quality: "500x500", url: "https://dailymix-images.scdn.co/v2/img/ab6761610000e5ebcb6926f44f620555ba444fca/1/en/default" },
    ],
  },
  {
    id: "pl_daily_mix_2",
    name: "Daily Mix 2",
    description: "AP Dhillon, Shubh, Karan Aujla and fresh Punjabi powerhouse anthems.",
    songCount: 50,
    image: [
      { quality: "500x500", url: "https://dailymix-images.scdn.co/v2/img/ab6761610000e5eb0261696c5df3be99da6ed3f3/2/en/default" },
    ],
  },
  {
    id: "pl_daily_mix_3",
    name: "Daily Mix 3",
    description: "Darshan Raval, Jasleen Royal, Armaan Malik high energy pop anthems.",
    songCount: 50,
    image: [
      { quality: "500x500", url: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/4b/73/1e/4b731eb5-13ab-825a-d164-fc665b2f02e5/5054197730122.jpg/600x600bb.jpg" },
    ],
  },
  {
    id: "pl_daily_mix_4",
    name: "Daily Mix 4",
    description: "Anuv Jain, Prateek Kuhad, The Local Train acoustic soulful melodies.",
    songCount: 50,
    image: [
      { quality: "500x500", url: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/02/e7/77/02e77709-a5f6-5470-9e5b-70a0d6ff45ed/25UM1IM13936.rgb.jpg/600x600bb.jpg" },
    ],
  },
  {
    id: "pl_discover_weekly",
    name: "Discover Weekly",
    description: "Your weekly mixtape of fresh music. Handpicked for you every Monday.",
    songCount: 30,
    image: [
      { quality: "500x500", url: "https://pickasso.spotifycdn.com/image/ab67c0de0000cafe/dt/v1/img/dw/cover/en" },
    ],
  },
  {
    id: "pl_release_radar",
    name: "Release Radar",
    description: "Catch all the latest music from artists you follow, updated every Friday.",
    songCount: 30,
    image: [
      { quality: "500x500", url: "https://pickasso.spotifycdn.com/image/ab67c0de0000cafe/dt/v1/img/release-radar-v4/7uIbLdzzSEqnX0Pkrb56cR/en" },
    ],
  },
  {
    id: "pl_radar_india",
    name: "RADAR India",
    description: "Discover the most exciting emerging artists from India.",
    songCount: 40,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f000000020bbf9f4165316179e75ec63b" },
    ],
  },
];

export const SPOTIFY_MOODS_PRESETS: CatalogPlaylistResult[] = [
  {
    id: "pl_house_party",
    name: "House Party Hits",
    description: "Turn up the volume with the ultimate Indian party bangers.",
    songCount: 50,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f000000022468362accf60bcfadaf4916" },
    ],
  },
  {
    id: "pl_bollywood_dance",
    name: "Bollywood Dance Music",
    description: "Electrifying Bollywood dance, club remixes, and party anthems.",
    songCount: 75,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f0000000299e454572d0578183d97ecc2" },
    ],
  },
  {
    id: "pl_all_out_00s",
    name: "All Out 00s Hindi",
    description: "The defining Bollywood tracks from 2000 to 2009.",
    songCount: 100,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f00000002c4eeffa35b610f28592c6950" },
    ],
  },
  {
    id: "pl_bollywood_mush",
    name: "Bollywood Mush",
    description: "Heartfelt, romantic and acoustic Bollywood love songs.",
    songCount: 75,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f00000002087eaebce35bd015db2942e0" },
    ],
  },
  {
    id: "pl_indie_india",
    name: "Indie India",
    description: "Best of the Indian independent music scene.",
    songCount: 75,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67706f00000002656f14776fbb39aa2ae900f0" },
    ],
  },
  {
    id: "pl_satvik",
    name: "Satvik's",
    description: "Personal mix • Raabta, Shiddat, Toofan, AP Dhillon",
    songCount: 100,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67616d0000b2731bcc10d3bd1d77d7c3f164c6" },
    ],
  },
  {
    id: "pl_soulful",
    name: "Soulful",
    description: "Darshan Raval, Arijit Singh, AKASH MEHTA, Animal",
    songCount: 93,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67616d0000b27389bfe45fc54eb733eeab9a84" },
    ],
  },
  {
    id: "pl_morning",
    name: "Morning fresh song",
    description: "Start your morning with fresh energy, upbeat vibe and feel good songs",
    songCount: 24,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67616d0000b2731aac2079e5047e1bfd1b59d9" },
    ],
  },
  {
    id: "pl_travel_hindi",
    name: "Travel Songs (Hindi)",
    description: "Bollywood Roadtrip Hindi | Best Indie Travels | Safarnama Vibes",
    songCount: 100,
    image: [
      { quality: "500x500", url: "https://image-cdn-fa.spotifycdn.com/image/ab67706c0000da8404fd89ab8064c32896fd0cdc" },
    ],
  },
  {
    id: "pl_old_is_gold",
    name: "Old is gold 🍷",
    description: "Timeless classic retro Hindi Bollywood melodies and golden era hits.",
    songCount: 100,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67616d0000b2732f4210662c10380e7d836877" },
    ],
  },
  {
    id: "pl_party_songs",
    name: "Party songs",
    description: "High bass and energy dance anthems for parties and celebrations.",
    songCount: 20,
    image: [
      { quality: "500x500", url: "https://i.scdn.co/image/ab67616d0000b27315bdb7a86250e53e8a80163d" },
    ],
  },
];

const FLAGSHIP_PLAYLIST_IDS = new Set([
  "pl_trending_india", "pl_hot_hits_hindi", "pl_bollywood_central",
  "pl_top50_india", "pl_top50_global", "pl_viral50_india",
  "pl_hot_hits_punjabi", "pl_mega_punjabi"
]);

const MIXES_PLAYLIST_IDS = new Set([
  "pl_daily_mix_1", "pl_daily_mix_2", "pl_daily_mix_3", "pl_daily_mix_4",
  "pl_discover_weekly", "pl_release_radar", "pl_radar_india"
]);

const MOODS_PLAYLIST_IDS = new Set([
  "pl_house_party", "pl_bollywood_dance", "pl_all_out_00s",
  "pl_bollywood_mush", "pl_indie_india", "pl_satvik", "pl_soulful",
  "pl_morning", "pl_travel_hindi", "pl_old_is_gold", "pl_party_songs"
]);

function shuffleCatalogItems<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function getSpotifyCatalogCategory(forceRefresh = false): Promise<CatalogCategoryData> {
  try {
    const fresh = await fetchCategoryFast("spotify", 25, forceRefresh);
    if (fresh && fresh.length > 0) {
      const filtered = fresh.filter((p) => FLAGSHIP_PLAYLIST_IDS.has(p.id));
      const combined = dedupeByPlaylistId([...filtered, ...SPOTIFY_FLAGSHIP_PRESETS])
        .filter((p) => FLAGSHIP_PLAYLIST_IDS.has(p.id));
      return {
        id: "spotify",
        title: "Top Hits & Trending",
        results: forceRefresh ? shuffleCatalogItems(combined) : combined,
        isFresh: true,
      };
    }
  } catch {}
  return {
    id: "spotify",
    title: "Top Hits & Trending",
    results: forceRefresh ? shuffleCatalogItems(SPOTIFY_FLAGSHIP_PRESETS) : SPOTIFY_FLAGSHIP_PRESETS,
    isFresh: false,
  };
}

export function getSpotifyMixesCategory(shuffle = true, freshList: CatalogPlaylistResult[] = []): CatalogCategoryData {
  const filtered = freshList.filter((p) => MIXES_PLAYLIST_IDS.has(p.id));
  const combined = dedupeByPlaylistId([...filtered, ...SPOTIFY_MADE_FOR_YOU_PRESETS])
    .filter((p) => MIXES_PLAYLIST_IDS.has(p.id));
  return {
    id: "spotify-mixes",
    title: "Made For You & Daily Mixes",
    results: shuffle ? shuffleCatalogItems(combined) : combined,
    isFresh: filtered.length > 0,
  };
}

export function getSpotifyMoodsCategory(shuffle = true, freshList: CatalogPlaylistResult[] = []): CatalogCategoryData {
  const filtered = freshList.filter((p) => MOODS_PLAYLIST_IDS.has(p.id));
  const combined = dedupeByPlaylistId([...filtered, ...SPOTIFY_MOODS_PRESETS])
    .filter((p) => MOODS_PLAYLIST_IDS.has(p.id));
  return {
    id: "spotify-moods",
    title: "Moods & Party Anthems",
    results: shuffle ? shuffleCatalogItems(combined) : combined,
    isFresh: filtered.length > 0,
  };
}

export async function getAllSpotifyCategories(forceRefresh = false): Promise<CatalogCategoryData[]> {
  let freshList: CatalogPlaylistResult[] = [];
  try {
    const fetched = await fetchCategoryFast("spotify", 30, forceRefresh);
    if (fetched && fetched.length > 0) {
      freshList = fetched;
    }
  } catch {}

  const freshFlagship = freshList.filter((p) => FLAGSHIP_PLAYLIST_IDS.has(p.id));
  const combinedFlagship = dedupeByPlaylistId([...freshFlagship, ...SPOTIFY_FLAGSHIP_PRESETS])
    .filter((p) => FLAGSHIP_PLAYLIST_IDS.has(p.id));

  const flagshipCategory: CatalogCategoryData = {
    id: "spotify",
    title: "Top Hits & Trending",
    results: forceRefresh ? shuffleCatalogItems(combinedFlagship) : combinedFlagship,
    isFresh: freshFlagship.length > 0,
  };

  const mixesCategory = getSpotifyMixesCategory(forceRefresh, freshList);
  const moodsCategory = getSpotifyMoodsCategory(forceRefresh, freshList);

  return [flagshipCategory, mixesCategory, moodsCategory];
}
