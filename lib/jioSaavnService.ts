import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { JioSaavnImage, JioSaavnSong } from "@/lib/musicData";
import { getApiUrl } from "@/lib/api-config";

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
const HOME_FETCH_CATEGORY_CONCURRENCY = 3;
export const AUTO_REFRESH_POLL_INTERVAL_MS = 30 * 1000;
export const JIOSAAVN_CATEGORY_CACHE_TTL_MS = 30 * 60 * 1000;
const CATEGORY_TTL_MS: Record<string, number> = {
  trending:      30 * 60 * 1000,
  "new-arrivals": 45 * 60 * 1000,
  "most-viral":  45 * 60 * 1000,
  "party-mix":   60 * 60 * 1000,
  "chill-vibes": 60 * 60 * 1000,
  romance:       60 * 60 * 1000,
  workout:       60 * 60 * 1000,
  retro:         90 * 60 * 1000,
};
const JIOSAAVN_PLAYLIST_BASE_URLS = [
  `${getApiUrl().replace(/\/$/, "")}/api`,
];
const JIOSAAVN_SEARCH_BASE_URLS = [
  `${getApiUrl().replace(/\/$/, "")}/api`,
];

export const HOME_JIOSAAVN_CATEGORIES: HomeJioSaavnCategory[] = [
  {
    id: "trending",
    title: "Trending Now",
    searchTerms: [
      `trending songs ${CURRENT_YEAR}`,
      `top hits ${CURRENT_YEAR}`,
      "trending bollywood",
      "trending hindi songs",
    ],
  },
  {
    id: "new-arrivals",
    title: "New Releases",
    searchTerms: [
      `new movie songs ${CURRENT_YEAR}`,
      `latest bollywood songs ${CURRENT_YEAR}`,
      "new hindi songs",
      "latest releases",
    ],
  },
  {
    id: "most-viral",
    title: "Viral Hits",
    searchTerms: [
      "instagram reels songs",
      "youtube shorts trending songs",
      "reels viral songs",
      "social media hits",
    ],
  },
  {
    id: "party-mix",
    title: "Party Mix",
    searchTerms: [
      "party songs hindi",
      "dance hits bollywood",
      "dj remix songs",
      "party anthems",
    ],
  },
  {
    id: "chill-vibes",
    title: "Chill Vibes",
    searchTerms: [
      "chill hindi songs",
      "lo-fi bollywood",
      "relaxing songs hindi",
      "soft hindi songs",
    ],
  },
  {
    id: "romance",
    title: "Love & Romance",
    searchTerms: [
      "romantic hindi songs",
      "love songs bollywood",
      "best romantic songs",
      "hindi love songs",
    ],
  },
  {
    id: "workout",
    title: "Workout & Energy",
    searchTerms: [
      "workout songs hindi",
      "gym motivation songs",
      "high energy songs",
      "power songs",
    ],
  },
  {
    id: "retro",
    title: "Retro Classics",
    searchTerms: [
      "old hindi songs",
      "classic bollywood hits",
      "retro hindi songs",
      "evergreen songs",
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
    raw?.more_info?.download_url;
  // NOTE: encrypted_media_url is NOT a direct playable URL — intentionally excluded.
  // audioUrl / media_url are preview/low-quality direct URLs used as last resort.
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
  // Pick the first array that actually has items — don't stop on an empty array
  let selectedSongArray: unknown[] = [];
  for (const candidate of songArrays) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      selectedSongArray = candidate;
      break;
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
  const encodedId = encodeURIComponent(playlistId);
  const query = `id=${encodedId}&limit=${limit}&page=${page}`;

  const candidateUrls = JIOSAAVN_PLAYLIST_BASE_URLS.map(
    (base) => `${base.replace(/\/+$/, "")}/playlists?${query}`
  );

  let allNotFound = true;
  for (const url of candidateUrls) {
    try {
      const response = await withTimeout(
        fetch(url, { headers: { Accept: "application/json" } }),
        6000
      );
      if (!response.ok) {
        if (response.status !== 404) {
          allNotFound = false;
        }
        await consumeResponseBody(response);
        continue;
      }
      const json = await response.json();
      const normalized = parsePlaylistDetailsResponse(json);
      if (normalized) {
        return { data: normalized, reason: "network" };
      }
      allNotFound = false;
    } catch {
      allNotFound = false;
    }
  }

  return { data: null, reason: allNotFound ? "not_found" : "network" };
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

// ── Prefetch ──────────────────────────────────────────────────────────────────
// In-flight set prevents duplicate concurrent fetches for the same playlist.
const prefetchInFlight = new Set<string>();

/**
 * Fire-and-forget: fetch + cache a playlist's songs in the background.
 * Safe to call multiple times — deduped by playlist ID.
 * Never throws.
 */
export function prefetchPlaylistDetails(playlistId: string): void {
  const id = String(playlistId || "").trim();
  if (!id || prefetchInFlight.has(id)) return;

  prefetchInFlight.add(id);

  // Skip if already cached
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

/**
 * Prefetch the first N playlists from each category section.
 * Called after the home feed renders — staggered so it doesn't compete
 * with the initial render or image loading.
 */
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

  // Stagger: one prefetch every 400ms so we don't flood the network
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
  if (!normalizedId) {
    throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Playlist not found");
  }

  // 1. Serve cache immediately — instant render for returning users
  const cached = await getCachedPlaylistDetails(normalizedId);
  if (cached?.songs?.length) {
    // Silently refresh cache in background
    void fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT)
      .then((res) => {
        if (res.data?.songs?.length) {
          void setCachedPlaylistDetails(normalizedId, res.data);
        }
      })
      .catch(() => {});
    return cached;
  }

  // 2. Fetch — all URLs raced in parallel (fast)
  const firstPage = await fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT);

  if (firstPage.data?.songs?.length) {
    void setCachedPlaylistDetails(normalizedId, firstPage.data);
    return firstPage.data;
  }

  // 3. Got a response but songs array was empty — the API sometimes returns
  //    playlist metadata without songs on first hit. Retry once.
  if (firstPage.data && !firstPage.data.songs?.length) {
    const retry = await fetchPlaylistDetailsPage(normalizedId, 1, PLAYLIST_FETCH_LIMIT);
    if (retry.data?.songs?.length) {
      void setCachedPlaylistDetails(normalizedId, retry.data);
      return retry.data;
    }
    // Return the metadata-only response so the screen can at least show the header
    if (retry.data) return retry.data;
    if (firstPage.data) return firstPage.data;
  }

  // 4. Complete failure
  if (firstPage.reason === "not_found") {
    throw new JioSaavnPlaylistDetailsError("NOT_FOUND", "Playlist not found");
  }
  throw new JioSaavnPlaylistDetailsError("NETWORK", "Unable to fetch playlist details");
}

// ─────────────────────────────────────────────────────────────────────────────
// NEXT-LEVEL RANKING ENGINE
// Multi-signal scoring: freshness + popularity + trend keywords + context +
// daily rotation + anti-repetition. Replaces the old keyword-sort approach.
// ─────────────────────────────────────────────────────────────────────────────

const FAST_TIMEOUT_MS = 3800;
const LAST_SHOWN_KEY = "@mavrixfy_last_shown_playlists_v1";
const LAST_SHOWN_MAX = 40; // remember last 40 shown playlist IDs

// One primary search term per category — fast, single request
const FAST_SEARCH_TERMS: Record<string, string> = {
  trending:       `trending songs ${CURRENT_YEAR}`,
  "new-arrivals": `new movie songs ${CURRENT_YEAR}`,
  "most-viral":   `viral reels hits ${CURRENT_YEAR}`,
  "party-mix":    "party songs hindi",
  "chill-vibes":  "chill hindi songs",
  romance:        "romantic hindi songs",
  workout:        "workout songs hindi",
  retro:          "old hindi songs",
};

// ── 1. Multi-signal score ─────────────────────────────────────────────────────
function calculatePlaylistScore(
  playlist: JioSaavnPlaylistResult,
  context: AutoRefreshContext
): number {
  let score = 0;
  const name = playlist.name.toLowerCase();
  const year  = String(CURRENT_YEAR);
  const prevY = String(CURRENT_YEAR - 1);

  // Freshness
  if (name.includes(year))   score += 30;
  if (name.includes("latest") || name.includes("new") || name.includes("fresh")) score += 20;
  if (name.includes(prevY))  score -= 10;

  // Popularity proxy (capped)
  score += Math.min(playlist.songCount * 0.5, 50);

  // Generic trend keywords
  if (name.includes("trending") || name.includes("viral"))  score += 15;
  if (name.includes("top") || name.includes("chart"))       score += 8;
  if (name.includes("hit") || name.includes("superhit"))    score += 6;

  // Time-of-day context
  if (context.slot === "morning"   && (name.includes("morning") || name.includes("workout"))) score += 15;
  if (context.slot === "evening"   && (name.includes("party")   || name.includes("evening"))) score += 15;
  if (context.slot === "night"     && (name.includes("night")   || name.includes("chill")))   score += 15;
  if (context.slot === "afternoon" && (name.includes("afternoon")|| name.includes("relax")))  score += 10;

  // Language context
  if (context.languageBias === "hindi"   && (name.includes("hindi")   || name.includes("bollywood"))) score += 10;
  if (context.languageBias === "punjabi" && (name.includes("punjabi")  || name.includes("bhangra")))  score += 10;
  if (context.isWeekend && (name.includes("weekend") || name.includes("party"))) score += 8;

  // Controlled randomness — prevents identical order every session
  score += Math.random() * 8;

  return score;
}

// ── 2. Rank by score ──────────────────────────────────────────────────────────
function rankPlaylists(
  playlists: JioSaavnPlaylistResult[],
  context: AutoRefreshContext
): JioSaavnPlaylistResult[] {
  return playlists
    .map((p) => ({ p, score: calculatePlaylistScore(p, context) }))
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);
}

// ── 3. Daily freshness rotation ───────────────────────────────────────────────
// Each day the order shifts deterministically — no backend needed.
function applyFreshnessRotation(playlists: JioSaavnPlaylistResult[]): JioSaavnPlaylistResult[] {
  const todaySeed = new Date().getDate(); // 1–31
  return [...playlists].sort((a, b) => {
    const hashA = (a.id.charCodeAt(0) + todaySeed) % 13;
    const hashB = (b.id.charCodeAt(0) + todaySeed) % 13;
    return hashB - hashA;
  });
}

// ── 4. Anti-repetition — filter recently shown playlists ─────────────────────
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
  } catch {}
}

function removeRecentlyShown(
  playlists: JioSaavnPlaylistResult[],
  history: Set<string>
): JioSaavnPlaylistResult[] {
  const filtered = playlists.filter((p) => !history.has(p.id));
  // If filtering removes too many, fall back to full list to avoid empty sections
  return filtered.length >= Math.min(playlists.length, 4) ? filtered : playlists;
}

// ── 5. Fast single-term fetch ─────────────────────────────────────────────────
async function fetchCategoryFast(
  categoryId: string,
  limit: number
): Promise<JioSaavnPlaylistResult[]> {
  const term = FAST_SEARCH_TERMS[categoryId] ?? `${categoryId} songs ${CURRENT_YEAR}`;
  // Request more than needed so the ranking + global dedupe has a real pool to work with
  const apiLimit = Math.max(limit, 20);
  const urls = JIOSAAVN_SEARCH_BASE_URLS.map((base) => {
    const trimmed = base.replace(/\/+$/, "");
    return `${trimmed}/search/playlists?query=${encodeURIComponent(term)}&limit=${apiLimit}&page=1`;
  });

  for (const url of urls) {
    try {
      const res = await withTimeout(
        fetch(url, { headers: { Accept: "application/json" } }),
        FAST_TIMEOUT_MS
      );
      if (!res.ok) {
        await consumeResponseBody(res);
        continue;
      }
      const json = await res.json();
      const parsed = parsePlaylistSearchResponse(json);
      if (parsed.length > 0) return parsed;
    } catch {
      // Try next provider.
    }
  }
  return [];
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: maxWorkers }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

// ── 6. Full pipeline for one category ────────────────────────────────────────
async function fetchAndRankCategory(
  cat: HomeJioSaavnCategory,
  limit: number,
  context: AutoRefreshContext,
  history: Set<string>
): Promise<JioSaavnPlaylistResult[]> {
  // Fetch a larger pool — 4× limit gives the global dedupe enough unique candidates
  const raw = await fetchCategoryFast(cat.id, limit * 4);
  if (raw.length === 0) return [];

  const deduped  = dedupeByPlaylistId(raw);
  const noRepeat = removeRecentlyShown(deduped, history);
  const ranked   = rankPlaylists(noRepeat, context);
  const rotated  = applyFreshnessRotation(ranked);
  // Return the full pool — caller slices after global dedupe
  return rotated;
}

// ── 7. Mix strategy — interleave trending + new + viral for the feed ──────────
function mixForFeed(
  byCategory: Record<string, JioSaavnPlaylistResult[]>,
  limit: number
): JioSaavnPlaylistResult[] {
  const trending   = byCategory["trending"]      ?? [];
  const newArr     = byCategory["new-arrivals"]  ?? [];
  const viral      = byCategory["most-viral"]    ?? [];

  const mixed = [
    ...trending.slice(0, 5),
    ...newArr.slice(0, 5),
    ...viral.slice(0, 5),
  ];

  // Dedupe then light shuffle so the mix feels alive
  const deduped = dedupeByPlaylistId(mixed);
  return shuffleArray(deduped).slice(0, limit);
}

// ── 8. Day-keyed cache signature ──────────────────────────────────────────────
// Bumping to v6 + day ensures daily auto-refresh without manual invalidation.
function buildDaySignature(context: AutoRefreshContext): string {
  const day = new Date().getDate();
  return `v6|${context.slot}|${context.isWeekend ? "weekend" : "weekday"}|${context.languageBias}|day${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function getHomeJioSaavnCategories(options?: {
  forceRefresh?: boolean;
  limitPerCategory?: number;
  realtime?: boolean;
  categoryIds?: string[];
}): Promise<HomeJioSaavnCategoryData[]> {
  const forceRefresh = options?.forceRefresh ?? false;
  const limit        = Math.min(options?.limitPerCategory ?? 10, 12);
  const context      = getCurrentRefreshContext();
  const daySig       = buildDaySignature(context);
  const categoryIdFilter = new Set(options?.categoryIds ?? []);
  const categoriesToFetch =
    categoryIdFilter.size > 0
      ? HOME_JIOSAAVN_CATEGORIES.filter((cat) => categoryIdFilter.has(cat.id))
      : HOME_JIOSAAVN_CATEGORIES;

  if (categoriesToFetch.length === 0) {
    return [];
  }

  // Load anti-repetition history once (cross-session)
  const history = await getLastShownIds();

  // ── Step 1: Fetch all categories in parallel (fast) ───────────────────────
  // Each category gets a larger pool (limit + 10) so the global dedupe below
  // has enough candidates to fill every section after removing cross-section dupes.
  const rawResults = await runWithConcurrencyLimit(
    categoriesToFetch,
    HOME_FETCH_CATEGORY_CONCURRENCY,
    async (cat) => {
      const fetchLimit = limit + 8;

      if (!forceRefresh) {
        const cached = await getCategoryCache(cat.id, context, { allowSignatureMismatch: false });
        if (cached && cached.length > 0) {
          const ranked = rankPlaylists(cached, context);
          const rotated = applyFreshnessRotation(ranked);
          return { cat, pool: rotated };
        }
      }

      let fresh: JioSaavnPlaylistResult[] = [];
      try {
        fresh = await fetchAndRankCategory(cat, fetchLimit, context, history);
      } catch {
        fresh = [];
      }

      if (fresh.length > 0) {
        void setCategoryCache(cat.id, fresh, daySig);
        return { cat, pool: fresh };
      }

      // Stale fallback
      const stale = await getCategoryCache(cat.id, context, { allowSignatureMismatch: true });
      if (stale && stale.length > 0) {
        const rotated = applyFreshnessRotation(rankPlaylists(stale, context));
        return { cat, pool: rotated };
      }

      return { cat, pool: [] as JioSaavnPlaylistResult[] };
    }
  );

  // ── Step 2: Global cross-section dedupe ───────────────────────────────────
  // Walk categories in priority order. Once a playlist ID is claimed by a
  // section, it cannot appear in any later section.
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
    return { id: cat.id, title: cat.title, results: unique };
  });

  const nonEmpty = deduped.filter((cat) => cat.results.length > 0);

  // ── Step 3: Update cross-session anti-repetition history ─────────────────
  const shownIds = nonEmpty.flatMap((cat) => cat.results.map((p) => p.id));
  void updateLastShownIds(shownIds);

  return nonEmpty;
}

// Exported so the home screen can use the mixed feed as a "For You" section
export function buildMixedFeed(
  categories: HomeJioSaavnCategoryData[],
  limit = 15
): JioSaavnPlaylistResult[] {
  const byId: Record<string, JioSaavnPlaylistResult[]> = {};
  categories.forEach((c) => { byId[c.id] = c.results; });
  return mixForFeed(byId, limit);
}
