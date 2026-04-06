import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { getApiUrl } from "@/lib/query-client";
import { JioSaavnImage, JioSaavnSong } from "@/lib/musicData";

export interface JioSaavnPlaylistResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
}

export interface HomeJioSaavnCategory {
  id: string;
  title: string;
  searchTerms: string[];
}

export interface HomeJioSaavnCategoryData {
  id: string;
  title: string;
  results: JioSaavnPlaylistResult[];
}

export interface JioSaavnPlaylistDetailsData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  year?: string;
  playCount?: number;
  language?: string;
  explicitContent?: boolean;
  songCount: number;
  url?: string;
  image: JioSaavnImage[] | string;
  songs: JioSaavnSong[];
}

interface JioSaavnPlaylistDetailsResponse {
  success: boolean;
  data?: JioSaavnPlaylistDetailsData;
}

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

export interface GetJioSaavnPlaylistDetailsOptions {
  loadAllPages?: boolean;
  preferCache?: boolean;
}

export type AutoRefreshTimeSlot = "morning" | "afternoon" | "evening" | "night";

export interface AutoRefreshContext {
  timestamp: number;
  slot: AutoRefreshTimeSlot;
  isWeekend: boolean;
  languageBias: "hindi" | "punjabi" | "english";
  signature: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const CACHE_PREFIX = "@mavrixfy_jiosaavn_home";
const PLAYLIST_DETAILS_CACHE_PREFIX = "@mavrixfy_jiosaavn_playlist_details";
const REQUEST_TIMEOUT_MS = 8500;
const PLAYLIST_FETCH_LIMIT = 50;
const PLAYLIST_MAX_PAGES = 10;
const PLAYLIST_DETAILS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CATEGORY_STALE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const AUTO_REFRESH_POLL_INTERVAL_MS = 30 * 1000;
export const JIOSAAVN_CATEGORY_CACHE_TTL_MS = 30 * 60 * 1000;
const CATEGORY_TTL_MS: Record<string, number> = {
  // Live category TTL buckets
  trending: 30 * 60 * 1000,
  "most-viral": 45 * 60 * 1000,
  "most-played": 60 * 60 * 1000,
  "top-dhurandhar": 60 * 60 * 1000,
  "new-arrivals": 45 * 60 * 1000,
};
const JIOSAAVN_PLAYLIST_BASE_URLS = [
  "https://saavn.sumit.co/api",
  "https://jiosaavn-api-privatecvc2.vercel.app",
  "https://saavn.me",
];
const JIOSAAVN_SEARCH_BASE_URLS = [
  "https://saavn.sumit.co/api",
  "https://saavn.me",
  "https://jiosaavn-api-privatecvc2.vercel.app",
];

export const HOME_JIOSAAVN_CATEGORIES: HomeJioSaavnCategory[] = [
  {
    id: "trending",
    title: "Trending Now",
    searchTerms: [
      `trending now ${CURRENT_YEAR}`,
      `top 50 ${CURRENT_YEAR}`,
      `superhits ${CURRENT_YEAR}`,
      `chartbusters ${CURRENT_YEAR}`,
      `viral hits ${CURRENT_YEAR}`,
      `most played ${CURRENT_YEAR}`,
      `popular songs ${CURRENT_YEAR}`,
      `hit songs ${CURRENT_YEAR}`,
      `latest hits ${CURRENT_YEAR}`,
      `trending songs ${CURRENT_YEAR}`,
      `new hits ${CURRENT_YEAR}`,
      `fresh hits ${CURRENT_YEAR}`,
      "latest trending",
      "trending hindi",
      "trending bollywood",
      `top charts ${CURRENT_YEAR}`,
      "weekly top 50",
      "monthly hits",
      "current hits",
      "now playing",
    ],
  },
  {
    id: "most-viral",
    title: "Most Viral",
    searchTerms: [
      `viral songs ${CURRENT_YEAR}`,
      "viral hits",
      "instagram reels songs",
      "youtube shorts songs",
      "viral bollywood",
      "viral hindi",
      "viral now",
      "reels trending songs",
    ],
  },
  {
    id: "most-played",
    title: "Most Played",
    searchTerms: [
      `most played songs ${CURRENT_YEAR}`,
      "most streamed songs",
      "top played songs",
      "popular this week",
      "most listened songs",
      "top chart songs",
    ],
  },
  {
    id: "top-dhurandhar",
    title: "Top Dhurandhar",
    searchTerms: [
      "hindi superhits",
      "desi chart hits",
      "bollywood power hits",
      "top hindi songs",
      "indian chartbusters",
    ],
  },
  {
    id: "new-arrivals",
    title: "New Arrivals",
    searchTerms: [
      `new movie songs ${CURRENT_YEAR}`,
      `latest songs ${CURRENT_YEAR}`,
      "new arrivals music",
      "social media trending songs",
      "instagram reels new songs",
      "hype songs",
      "upcoming movie hits",
    ],
  },
];

function buildCategoryCacheKey(categoryId: string): string {
  return `${CACHE_PREFIX}:${categoryId}`;
}

function buildCategoryCacheTimeKey(categoryId: string): string {
  return `${CACHE_PREFIX}:${categoryId}:time`;
}

function buildCategoryCacheSignatureKey(categoryId: string): string {
  return `${CACHE_PREFIX}:${categoryId}:signature`;
}

function getCategoryTtlMs(categoryId: string): number {
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

  let locale = "en";
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  } catch {
    // Keep default locale fallback
  }

  let languageBias: AutoRefreshContext["languageBias"] = "english";
  if (isWeekend) {
    languageBias = "punjabi";
  } else if (locale.startsWith("hi") || locale.startsWith("pa")) {
    languageBias = "hindi";
  }

  // Keep cache signatures aligned with web home algorithm.
  const signature = `v5|${slot}|${isWeekend ? "weekend" : "weekday"}|${languageBias}`;

  return {
    timestamp: now.getTime(),
    slot,
    isWeekend,
    languageBias,
    signature,
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(input: T[]): T[] {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function dedupeByPlaylistId(playlists: JioSaavnPlaylistResult[]): JioSaavnPlaylistResult[] {
  const seen = new Set<string>();
  return playlists.filter((playlist) => {
    if (!playlist?.id || seen.has(playlist.id)) return false;
    seen.add(playlist.id);
    return true;
  });
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = toTrimmedString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function normalizeImageList(raw: unknown): JioSaavnImage[] {
  if (Array.isArray(raw)) {
    const normalized = raw
      .map((item) => {
        if (typeof item === "string") {
          const url = item.trim();
          return url ? { quality: "", url } : null;
        }

        if (!item || typeof item !== "object") return null;
        const image = item as { quality?: unknown; url?: unknown; link?: unknown };
        const url = toTrimmedString(image.url) || toTrimmedString(image.link);
        if (!url) return null;
        return {
          quality: toTrimmedString(image.quality),
          url,
        };
      })
      .filter((item): item is JioSaavnImage => Boolean(item));

    if (normalized.length > 0) return normalized;
  }

  const direct = toTrimmedString(raw);
  if (!direct) return [];
  return [{ quality: "", url: direct }];
}

function parseSongCountValue(raw: any): number {
  const candidates = [
    raw?.songCount,
    raw?.song_count,
    raw?.listCount,
    raw?.list_count,
    raw?.count,
    raw?.total,
    raw?.totalSongs,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function normalizePlaylistList(raw: unknown): JioSaavnPlaylistResult[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((playlist: any) => {
      const id =
        toTrimmedString(playlist?.id) ||
        toTrimmedString(playlist?.listid) ||
        toTrimmedString(playlist?.playlistid);
      const name = toTrimmedString(playlist?.name) || toTrimmedString(playlist?.title);
      const image = normalizeImageList(
        playlist?.image ?? playlist?.images ?? playlist?.imageUrl ?? playlist?.image_url
      );
      const songCount = parseSongCountValue(playlist);

      return {
        id,
        name,
        image,
        songCount,
      };
    })
    .filter((playlist) => playlist.id && playlist.name && playlist.songCount > 0);
}

function parsePlaylistSearchResponse(json: any): JioSaavnPlaylistResult[] {
  if (!json) return [];

  const candidates = [
    json?.data?.results,
    json?.data?.playlists?.results,
    json?.data?.playlists,
    json?.results,
    json?.playlists?.results,
    json?.playlists,
    json?.data,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePlaylistList(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function normalizeArtistList(
  raw: unknown
): Array<{ id: string; name: string; image: JioSaavnImage[]; url: string; role: string }> {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((artist: any, index) => {
      const name = toTrimmedString(artist?.name);
      if (!name) return null;

      const id = toTrimmedString(artist?.id) || `artist_${index}_${name.replace(/\s+/g, "_").toLowerCase()}`;
      return {
        id,
        name,
        image: normalizeImageList(artist?.image),
        url: toTrimmedString(artist?.url),
        role: toTrimmedString(artist?.role),
      };
    })
    .filter(
      (artist): artist is { id: string; name: string; image: JioSaavnImage[]; url: string; role: string } =>
        Boolean(artist)
    );
}

function normalizeArtists(raw: any): JioSaavnSong["artists"] {
  const primary = normalizeArtistList(raw?.primary).map(({ id, name, image, url }) => ({
    id,
    name,
    image,
    url,
  }));
  const featured = normalizeArtistList(raw?.featured).map(({ id, name, image, url }) => ({
    id,
    name,
    image,
    url,
  }));
  const all = normalizeArtistList(raw?.all).map(({ id, name, image, url, role }) => ({
    id,
    name,
    role: role || "",
    image,
    url,
  }));

  if (primary.length > 0 || featured.length > 0 || all.length > 0) {
    return {
      primary,
      featured,
      all:
        all.length > 0
          ? all
          : [...primary, ...featured].map(({ id, name, image, url }) => ({
              id,
              name,
              role: "",
              image,
              url,
            })),
    };
  }

  const fallbackNames = [
    ...toTrimmedString(raw?.primaryArtists)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    ...toTrimmedString(raw?.primary_artists)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    ...toTrimmedString(raw?.artist)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    ...toTrimmedString(raw?.singers)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  ];

  const fallbackUnique = Array.from(new Set(fallbackNames));
  const fallbackPrimary = fallbackUnique.map((name, index) => ({
    id: `artist_${index}_${name.replace(/\s+/g, "_").toLowerCase()}`,
    name,
    image: [],
    url: "",
  }));

  return {
    primary: fallbackPrimary,
    featured: [],
    all: fallbackPrimary.map(({ id, name, image, url }) => ({
      id,
      name,
      role: "",
      image,
      url,
    })),
  };
}

function normalizePlaylistSong(raw: any): JioSaavnSong | null {
  if (!raw || typeof raw !== "object") return null;

  const id =
    toTrimmedString(raw?.id) ||
    toTrimmedString(raw?.songid) ||
    toTrimmedString(raw?.songId) ||
    toTrimmedString(raw?._id);
  const name = toTrimmedString(raw?.name) || toTrimmedString(raw?.title) || toTrimmedString(raw?.song);
  if (!id || !name) return null;

  const albumRaw = raw?.album;
  const albumName =
    typeof albumRaw === "string"
      ? toTrimmedString(albumRaw)
      : toTrimmedString(albumRaw?.name) || toTrimmedString(raw?.more_info?.album);
  const albumId =
    typeof albumRaw === "string"
      ? ""
      : toTrimmedString(albumRaw?.id) || toTrimmedString(raw?.more_info?.album_id);
  const albumUrl =
    typeof albumRaw === "string"
      ? ""
      : toTrimmedString(albumRaw?.url) || toTrimmedString(raw?.more_info?.album_url);

  const downloadUrlCandidate =
    raw?.downloadUrl ??
    raw?.download_url ??
    raw?.more_info?.downloadUrl ??
    raw?.more_info?.download_url ??
    raw?.more_info?.encrypted_media_url ??
    raw?.encrypted_media_url;
  const audioUrlCandidate =
    raw?.audioUrl ??
    raw?.audio_url ??
    raw?.media_url ??
    raw?.more_info?.media_url ??
    raw?.more_info?.preview_url;

  const durationValue = Number(raw?.duration ?? raw?.more_info?.duration ?? 0);

  return {
    id,
    name,
    type: toTrimmedString(raw?.type) || "song",
    year: toTrimmedString(raw?.year) || toTrimmedString(raw?.release_date),
    duration: Number.isFinite(durationValue) ? Math.max(0, durationValue) : 0,
    language: toTrimmedString(raw?.language) || toTrimmedString(raw?.lang),
    hasLyrics: parseBoolean(raw?.hasLyrics ?? raw?.has_lyrics ?? raw?.more_info?.has_lyrics),
    album: {
      id: albumId,
      name: albumName,
      url: albumUrl,
    },
    artists: normalizeArtists(raw?.artists ?? raw?.artistMap ?? raw),
    image: normalizeImageList(
      raw?.image ??
        raw?.images ??
        raw?.image_url ??
        raw?.imageUrl ??
        raw?.more_info?.image ??
        raw?.more_info?.albumArt
    ),
    downloadUrl: downloadUrlCandidate ?? audioUrlCandidate,
    audioUrl: audioUrlCandidate ?? downloadUrlCandidate,
    url: toTrimmedString(raw?.url) || toTrimmedString(raw?.perma_url),
  };
}

function normalizePlaylistDetailsData(raw: any): JioSaavnPlaylistDetailsData | null {
  if (!raw || typeof raw !== "object") return null;
  const id =
    toTrimmedString(raw?.id) ||
    toTrimmedString(raw?.listid) ||
    toTrimmedString(raw?.playlistid);
  const name = toTrimmedString(raw?.name) || toTrimmedString(raw?.title);
  if (!id || !name) return null;

  const songArrays = [
    raw?.songs,
    raw?.list,
    raw?.results,
    raw?.tracks,
    raw?.data?.songs,
    raw?.data?.results,
  ];
  let selectedSongArray: unknown[] = [];
  for (const candidate of songArrays) {
    if (Array.isArray(candidate)) {
      selectedSongArray = candidate;
      if (candidate.length > 0) {
        break;
      }
    }
  }

  const songs = selectedSongArray
    .map((song) => normalizePlaylistSong(song))
    .filter((song): song is JioSaavnSong => Boolean(song));
  const songCount = parseSongCountValue(raw) || songs.length;
  const imageValue = raw?.image ?? raw?.images ?? raw?.imageUrl ?? raw?.image_url;
  const normalizedImage = normalizeImageList(imageValue);

  return {
    id,
    name,
    description: toTrimmedString(raw?.description) || toTrimmedString(raw?.subtitle) || undefined,
    type: toTrimmedString(raw?.type) || undefined,
    year: toTrimmedString(raw?.year) || undefined,
    playCount: Number(raw?.playCount || raw?.play_count || 0) || undefined,
    language: toTrimmedString(raw?.language) || toTrimmedString(raw?.lang) || undefined,
    explicitContent: parseBoolean(raw?.explicitContent ?? raw?.explicit_content),
    songCount,
    url: toTrimmedString(raw?.url) || toTrimmedString(raw?.perma_url) || undefined,
    image: normalizedImage.length > 0 ? normalizedImage : toTrimmedString(imageValue),
    songs,
  };
}

function parsePlaylistDetailsResponse(json: any): JioSaavnPlaylistDetailsData | null {
  if (!json) return null;

  const candidates: unknown[] = [
    json?.data?.playlist,
    json?.data?.results?.[0],
    json?.data?.results,
    json?.data,
    json?.playlist,
    json?.results?.[0],
    json?.results,
    json?.result,
    json,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePlaylistDetailsData(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("JioSaavn request timeout")), timeoutMs);
    }),
  ]);
}

async function consumeResponseBody(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // Best effort only
  }
}

function buildRefreshQuery(query: string, forceRefresh: boolean): string {
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

function shouldAppendYear(query: string): boolean {
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

async function searchPlaylistsRaw(
  query: string,
  limit: number,
  forceRefresh: boolean
): Promise<JioSaavnPlaylistResult[]> {
  const baseUrl = getApiUrl();
  let enhancedQuery = query.trim();

  if (shouldAppendYear(enhancedQuery)) {
    enhancedQuery = `${enhancedQuery} ${CURRENT_YEAR}`;
  }

  const finalQuery = buildRefreshQuery(enhancedQuery, forceRefresh);
  const page = forceRefresh ? randomInt(1, 3) : 1;
  const requestLimit = forceRefresh ? limit + 4 : limit;

  const primaryUrl =
    `${baseUrl}api/jiosaavn/search/playlists?` +
    `query=${encodeURIComponent(finalQuery)}&limit=${requestLimit}&page=${page}`;
  const fallbackUrls = JIOSAAVN_SEARCH_BASE_URLS.map((endpointBase) => {
    const trimmed = endpointBase.replace(/\/+$/, "");
    return (
      `${trimmed}/search/playlists?` +
      `query=${encodeURIComponent(finalQuery)}&limit=${requestLimit}&page=${page}`
    );
  });
  const requestUrls = [primaryUrl, ...fallbackUrls];

  for (const requestUrl of requestUrls) {
    try {
      const response = await withTimeout(
        fetch(requestUrl, {
          headers: { Accept: "application/json" },
        })
      );

      if (!response.ok) {
        await consumeResponseBody(response);
        continue;
      }

      const json = await response.json();
      const parsed = parsePlaylistSearchResponse(json);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Try the next provider.
    }
  }

  return [];
}

function sortPlaylists(playlists: JioSaavnPlaylistResult[], categoryId: string): JioSaavnPlaylistResult[] {
  const trendingKeywords = ["trending", "top", "hit", "superhit", "chart", "viral"];
  const freshKeywords = ["latest", "new", "fresh", "updated", String(CURRENT_YEAR)];

  return [...playlists].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    const aFreshScore = freshKeywords.some((keyword) => aName.includes(keyword)) ? 100 : 0;
    const bFreshScore = freshKeywords.some((keyword) => bName.includes(keyword)) ? 100 : 0;
    if (aFreshScore !== bFreshScore) return bFreshScore - aFreshScore;

    if (categoryId === "trending") {
      const aTrendScore = trendingKeywords.some((keyword) => aName.includes(keyword)) ? 80 : 0;
      const bTrendScore = trendingKeywords.some((keyword) => bName.includes(keyword)) ? 80 : 0;
      if (aTrendScore !== bTrendScore) return bTrendScore - aTrendScore;
    }

    if (a.songCount !== b.songCount) return b.songCount - a.songCount;
    return aName.localeCompare(bName);
  });
}

async function searchPlaylists(
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

async function fetchTrendingPlaylists(
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
    ? shuffleArray([
        ...contextBoostTerms,
        ...trendingSearchTerms,
        ...chartTerms,
      ])
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

function buildContextBoostTerms(category: HomeJioSaavnCategory, context: AutoRefreshContext): string[] {
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

  // Keep category identity strong: always try category-native terms first.
  const combined = [...category.searchTerms, ...boostedTerms];
  const seen = new Set<string>();
  return combined.filter((term) => {
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function keywordScore(name: string, keywords: string[]): number {
  const lowered = name.toLowerCase();
  return keywords.reduce((score, keyword) => {
    return lowered.includes(keyword) ? score + 40 : score;
  }, 0);
}

function rankByKeywords(
  playlists: JioSaavnPlaylistResult[],
  categoryId: string,
  keywords: string[]
): JioSaavnPlaylistResult[] {
  return [...playlists].sort((a, b) => {
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

async function fetchSignalPlaylists(
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

async function fetchViralPlaylists(
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

async function fetchMostPlayedPlaylists(
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

async function fetchTopDhurandharPlaylists(
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

async function fetchNewArrivalPlaylists(
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<JioSaavnPlaylistResult[]> {
  const primary = await fetchSignalPlaylists(
    "new-arrivals",
    limit,
    forceRefresh,
    context,
    [
      "new",
      "latest",
      "movie",
      "hype",
      "reels",
      "social",
      "trending",
    ]
  );

  if (primary.length >= Math.min(limit, 6)) {
    return primary.slice(0, limit);
  }

  const fallbackTerms = [
    `latest movie songs ${CURRENT_YEAR}`,
    `new bollywood songs ${CURRENT_YEAR}`,
    "new release songs",
    "social media hits",
    "hype tracks",
  ];

  const fallbackResults = await Promise.all(
    fallbackTerms.map(async (term) => {
      try {
        return await searchPlaylists(term, Math.max(limit, 10), "new-arrivals", forceRefresh);
      } catch {
        return [];
      }
    })
  );

  const merged = dedupeByPlaylistId([...primary, ...fallbackResults.flat()]).filter(
    (playlist) => playlist.songCount >= 4
  );
  const ranked = rankByKeywords(
    merged,
    "new-arrivals",
    ["new", "latest", "movie", "hype", "social", "reels", "viral"]
  );

  return forceRefresh ? shuffleArray(ranked).slice(0, limit) : ranked.slice(0, limit);
}

async function getCategoryCache(
  categoryId: string,
  context: AutoRefreshContext,
  options?: { allowSignatureMismatch?: boolean }
): Promise<JioSaavnPlaylistResult[] | null> {
  const allowSignatureMismatch = options?.allowSignatureMismatch ?? false;
  const cacheKey = buildCategoryCacheKey(categoryId);
  const cacheTimeKey = buildCategoryCacheTimeKey(categoryId);
  const cacheSignatureKey = buildCategoryCacheSignatureKey(categoryId);

  try {
    const [[, rawData], [, rawTime], [, rawSignature]] = await AsyncStorage.multiGet([
      cacheKey,
      cacheTimeKey,
      cacheSignatureKey,
    ]);
    if (!rawData || !rawTime || !rawSignature) return null;

    const cachedAt = Number(rawTime);
    if (!Number.isFinite(cachedAt)) return null;

    const age = Date.now() - cachedAt;
    const ttlMs = getCategoryTtlMs(categoryId);
    const maxAgeMs = allowSignatureMismatch ? Math.max(ttlMs, CATEGORY_STALE_MAX_AGE_MS) : ttlMs;
    if (age > maxAgeMs) return null;

    // If context changed (time-slot / weekend / language), prefer fresh content
    // but allow stale fallback when explicitly requested.
    if (!allowSignatureMismatch && rawSignature !== context.signature) return null;

    const parsed = JSON.parse(rawData);
    const normalized = normalizePlaylistList(parsed);
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

async function setCategoryCache(
  categoryId: string,
  playlists: JioSaavnPlaylistResult[],
  contextSignature: string
): Promise<void> {
  if (playlists.length === 0) return;

  const cacheKey = buildCategoryCacheKey(categoryId);
  const cacheTimeKey = buildCategoryCacheTimeKey(categoryId);
  const cacheSignatureKey = buildCategoryCacheSignatureKey(categoryId);

  try {
    await AsyncStorage.multiSet([
      [cacheKey, JSON.stringify(playlists)],
      [cacheTimeKey, String(Date.now())],
      [cacheSignatureKey, contextSignature],
    ]);
  } catch {
    // Silent cache write failure
  }
}

async function getPlaylistsByCategory(
  category: HomeJioSaavnCategory,
  limit: number,
  forceRefresh: boolean,
  context: AutoRefreshContext
): Promise<JioSaavnPlaylistResult[]> {
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

export async function clearJioSaavnPlaylistCache(categoryId?: string): Promise<void> {
  try {
    if (categoryId) {
      await AsyncStorage.multiRemove([
        buildCategoryCacheKey(categoryId),
        buildCategoryCacheTimeKey(categoryId),
        buildCategoryCacheSignatureKey(categoryId),
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

async function fetchPlaylistDetailsPage(
  playlistId: string,
  page: number,
  limit: number
): Promise<PlaylistDetailsPageResult> {
  let saw404 = false;
  let hadTransientFailure = false;
  const appBase = getApiUrl().replace(/\/+$/, "");
  const encodedId = encodeURIComponent(playlistId);
  const query = `id=${encodedId}&limit=${limit}&page=${page}`;
  const candidateUrls = [
    `${appBase}/api/jiosaavn/playlists?${query}`,
    `${appBase}/api/jiosaavn/playlist?${query}`,
    ...JIOSAAVN_PLAYLIST_BASE_URLS.map((baseUrl) => {
      const trimmedBase = baseUrl.replace(/\/+$/, "");
      return `${trimmedBase}/playlists?${query}`;
    }),
  ];

  const requestUrls = Array.from(new Set(candidateUrls));
  for (const requestUrl of requestUrls) {
    try {
      const response = await withTimeout(
        fetch(requestUrl, {
          headers: { Accept: "application/json" },
        })
      );

      if (response.status === 404) {
        await consumeResponseBody(response);
        saw404 = true;
        continue;
      }

      if (!response.ok) {
        await consumeResponseBody(response);
        hadTransientFailure = true;
        continue;
      }

      const json = (await response.json()) as JioSaavnPlaylistDetailsResponse;
      const normalized = parsePlaylistDetailsResponse(json);
      if (!normalized) {
        hadTransientFailure = true;
        continue;
      }

      return {
        data: normalized,
        reason: "network",
      };
    } catch {
      hadTransientFailure = true;
      // Try next endpoint
    }
  }

  return {
    data: null,
    reason: saw404 && !hadTransientFailure ? "not_found" : "network",
  };
}

function buildPlaylistDetailsCacheKey(playlistId: string): string {
  return `${PLAYLIST_DETAILS_CACHE_PREFIX}:${playlistId}`;
}

function buildPlaylistDetailsCacheTimeKey(playlistId: string): string {
  return `${PLAYLIST_DETAILS_CACHE_PREFIX}:${playlistId}:time`;
}

async function getCachedPlaylistDetails(
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

async function setCachedPlaylistDetails(
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

export async function getJioSaavnPlaylistDetails(
  playlistId: string,
  options?: GetJioSaavnPlaylistDetailsOptions
): Promise<JioSaavnPlaylistDetailsData> {
  const loadAllPages = options?.loadAllPages ?? true;
  const preferCache = options?.preferCache ?? false;
  const normalizedPlaylistId = String(playlistId || "").trim();
  if (!normalizedPlaylistId) {
    throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Playlist not found");
  }

  const cached = await getCachedPlaylistDetails(normalizedPlaylistId);
  if (preferCache && cached?.songs?.length) {
    return cached;
  }

  const firstPage = await fetchPlaylistDetailsPage(normalizedPlaylistId, 1, PLAYLIST_FETCH_LIMIT);
  if (!firstPage.data) {
    if (cached) {
      return cached;
    }

    if (firstPage.reason === "not_found") {
      throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Playlist not found");
    }

    throw new JioSaavnPlaylistDetailsError(
      "NETWORK",
      "Unable to fetch playlist details"
    );
  }

  const playlist = firstPage.data;
  let allSongs = Array.isArray(playlist.songs) ? [...playlist.songs] : [];
  const totalSongs = Number(playlist.songCount || allSongs.length || 0);

  if (allSongs.length >= totalSongs || totalSongs === 0) {
    const immediatePlaylist = {
      ...playlist,
      songs: allSongs,
    };
    if (immediatePlaylist.songs.length === 0 && cached?.songs?.length) {
      return cached;
    }
    await setCachedPlaylistDetails(normalizedPlaylistId, immediatePlaylist);
    return immediatePlaylist;
  }

  const immediatePlaylist = {
    ...playlist,
    songs: allSongs,
  };
  await setCachedPlaylistDetails(normalizedPlaylistId, immediatePlaylist);

  if (!loadAllPages) {
    return immediatePlaylist;
  }

  const maxPages = Math.min(
    Math.ceil(totalSongs / PLAYLIST_FETCH_LIMIT),
    PLAYLIST_MAX_PAGES
  );

  for (let page = 2; page <= maxPages; page += 1) {
    const pageResponse = await fetchPlaylistDetailsPage(normalizedPlaylistId, page, PLAYLIST_FETCH_LIMIT);
    if (!pageResponse.data?.songs?.length) {
      break;
    }

    const existingSongIds = new Set(allSongs.map((song: any) => song?.id).filter(Boolean));
    const uniqueNewSongs = pageResponse.data.songs.filter(
      (song: any) => song?.id && !existingSongIds.has(song.id)
    );

    allSongs = [...allSongs, ...uniqueNewSongs];

    if (allSongs.length >= totalSongs) {
      break;
    }
  }

  const finalPlaylist = {
    ...playlist,
    songs: allSongs,
  };

  if (finalPlaylist.songs.length === 0 && cached?.songs?.length) {
    return cached;
  }

  await setCachedPlaylistDetails(normalizedPlaylistId, finalPlaylist);
  return finalPlaylist;
}

export async function getHomeJioSaavnCategories(options?: {
  forceRefresh?: boolean;
  limitPerCategory?: number;
  realtime?: boolean;
}): Promise<HomeJioSaavnCategoryData[]> {
  const forceRefresh = options?.forceRefresh ?? false;
  const limitPerCategory = options?.limitPerCategory ?? 15;
  const realtime = options?.realtime ?? false;
  const context = getCurrentRefreshContext();
  const liveCategoryIds = ["trending", "most-viral", "most-played", "new-arrivals"];

  const categoryResults = await Promise.all(
    HOME_JIOSAAVN_CATEGORIES.map(async (category) => {
      const shouldBypassCache = forceRefresh || (realtime && liveCategoryIds.includes(category.id));
      const shouldForceCategoryRefresh = forceRefresh || (realtime && liveCategoryIds.includes(category.id));
      const staleFallback = shouldBypassCache
        ? null
        : await getCategoryCache(category.id, context, { allowSignatureMismatch: true });

      if (!shouldBypassCache) {
        const cached = await getCategoryCache(category.id, context);
        if (cached && cached.length > 0) {
          return {
            id: category.id,
            title: category.title,
            results: cached.slice(0, limitPerCategory),
          };
        }

        if (staleFallback && staleFallback.length > 0) {
          return {
            id: category.id,
            title: category.title,
            results: staleFallback.slice(0, limitPerCategory),
          };
        }
      }

      let fresh: JioSaavnPlaylistResult[] = [];
      try {
        fresh = await getPlaylistsByCategory(
          category,
          limitPerCategory,
          shouldForceCategoryRefresh,
          context
        );
      } catch {
        fresh = [];
      }

      if (fresh.length > 0) {
        await setCategoryCache(category.id, fresh, context.signature);
      }

      const finalResults =
        fresh.length > 0
          ? fresh
          : staleFallback && staleFallback.length > 0
            ? staleFallback.slice(0, limitPerCategory)
            : [];

      return {
        id: category.id,
        title: category.title,
        results: finalResults,
      };
    })
  );

  // Prefer unique playlists across sections, but don't starve a category.
  // If dedupe drops a section too low, keep its original list for healthy UI density.
  const MIN_RESULTS_AFTER_DEDUPE = Math.min(limitPerCategory, 4);
  const usedPlaylistIds: Record<string, true> = {};
  const uniqueCategoryResults = categoryResults
    .map((category) => {
      const uniqueResults = category.results.filter((playlist) => {
        if (usedPlaylistIds[playlist.id]) return false;
        usedPlaylistIds[playlist.id] = true;
        return true;
      });

      const safeResults =
        uniqueResults.length >= MIN_RESULTS_AFTER_DEDUPE
          ? uniqueResults
          : category.results.slice(0, limitPerCategory);

      return {
        ...category,
        results: safeResults,
      };
    })
    .filter((category) => category.results.length > 0);

  return uniqueCategoryResults;
}
