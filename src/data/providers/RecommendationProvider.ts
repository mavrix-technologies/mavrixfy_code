import AsyncStorage from "@react-native-async-storage/async-storage";

import { auth } from "@/lib/firebase";
import { buildAppApiUrl } from "@/lib/api-config";

export type RecommendationSource =
  | "catalog"
  | "jiosaavn"
  | "liked"
  | "history"
  | "trending"
  | "fresh"
  | "regional";

export type RecommendationSectionId =
  | "continueListening"
  | "recommendedForYou"
  | "freshDiscoveries"
  | "popularNearYou"
  | "basedOnActivity"
  | "newReleases";

export interface RecommendationItem {
  id: string;
  contentId: string;
  kind: "song" | "playlist";
  source: RecommendationSource;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  routePath?: string;
  playlist?: Record<string, unknown>;
}

export interface RecommendationSection {
  id: RecommendationSectionId;
  title: string;
  subtitle?: string;
  items: RecommendationItem[];
}

export interface RecommendationFeed {
  generatedAt: string;
  cacheStatus: "hit" | "miss" | "refresh";
  sectionOrder: RecommendationSectionId[];
  sections: RecommendationSection[];
}

const SESSION_KEY = "@mavrixfy_recommendation_session_id_v1";
const SESSION_STARTED_KEY = "@mavrixfy_recommendation_session_started_v1";
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LOCAL_FEED_LIMIT = 12;
const LOCAL_SECTION_MIN_ITEMS = 4;
const LOCAL_REQUEST_CONCURRENCY = 3;
const LOCAL_BACKUP_QUERY_LIMIT = 6;
const LOCAL_SEARCH_TIMEOUT_MS = 6_000;
const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;

export type RecommendationHomeFeedOptions = {
  forceRefresh?: boolean;
  authUser?: { getIdToken: () => Promise<string> } | null;
  signal?: AbortSignal;
};

const LOCAL_SECTION_QUERIES: {
  id: RecommendationSectionId;
  title: string;
  subtitle: string;
  source: RecommendationSource;
  queries: string[];
}[] = [
  {
    id: "basedOnActivity",
    title: "Based On Your Activity",
    subtitle: "High-scoring Hindi and Bollywood moods",
    source: "trending",
    queries: [
      "hindi romantic hits playlist",
      "bollywood party hits playlist",
      "hindi workout hits playlist",
      "bollywood dance hits playlist",
    ],
  },
  {
    id: "newReleases",
    title: "New Releases",
    subtitle: "Latest Hindi and Bollywood drops",
    source: "fresh",
    queries: [
      `latest hindi songs ${CURRENT_YEAR} playlist`,
      `new bollywood songs ${CURRENT_YEAR} playlist`,
      `trending bollywood songs ${CURRENT_YEAR} playlist`,
      `latest bollywood movie songs ${CURRENT_YEAR}`,
      `t-series new songs ${CURRENT_YEAR} playlist`,
      `zee music new songs ${CURRENT_YEAR} playlist`,
      `yrf new songs ${CURRENT_YEAR} playlist`,
      "new hindi movie songs playlist",
      "latest hindi hits playlist",
    ],
  },
];

const LOCAL_BACKUP_QUERIES = [
  `trending bollywood songs ${CURRENT_YEAR} playlist`,
  `popular hindi songs ${CURRENT_YEAR} playlist`,
  `top bollywood songs ${CURRENT_YEAR} playlist`,
  `new bollywood songs ${CURRENT_YEAR} playlist`,
  `latest hindi songs ${CURRENT_YEAR} playlist`,
  "bollywood most played playlist",
  "hindi top hits playlist",
  "hindi bollywood hits playlist",
  "arijit singh hindi playlist",
  "t-series top hits playlist",
  "zee music top hits playlist",
  "yrf top hits playlist",
  "sony music hindi playlist",
  "bollywood party playlist",
  "hindi romantic playlist",
  "punjabi hits playlist",
  "punjabi party playlist",
  "gujarati hits playlist",
  "gujarati garba playlist",
  "english pop hits playlist",
  "english trending playlist india",
  "devotional hindi playlist",
  "bollywood workout playlist",
];

function recommendationFeedEnabled(): boolean {
  return String(process.env.EXPO_PUBLIC_RECOMMENDATION_FEED_V1 || "").trim().toLowerCase() !== "false";
}

function createSessionId(): string {
  return `app-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getImageUrl(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  const last = value[value.length - 1] as { url?: unknown; link?: unknown } | undefined;
  const first = value[0] as { url?: unknown; link?: unknown } | undefined;
  return String(last?.url || last?.link || first?.url || first?.link || "").trim();
}

function getSongCount(raw: any): number {
  return Number(raw?.songCount || raw?.song_count || raw?.listCount || raw?.list_count || raw?.count || 0) || 0;
}

function canonicalPlaylistKey(item: Pick<RecommendationItem, "contentId" | "title" | "source">): string {
  const title = String(item.title || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return title ? `playlist:${title}` : `playlist:${item.source}:${item.contentId}`;
}

function unwrapPlaylistResults(payload: any): any[] {
  const candidates = [
    payload?.data?.results,
    payload?.data?.playlists?.results,
    payload?.data?.playlists,
    payload?.results,
    payload?.playlists?.results,
    payload?.playlists,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizePlaylistCandidate(raw: any, source: RecommendationSource): RecommendationItem | null {
  const contentId = String(raw?.id || raw?.listid || raw?.playlistid || raw?._id || "").trim();
  const title = String(raw?.name || raw?.title || "").trim();
  if (!contentId || !title) return null;

  const songCount = getSongCount(raw);
  return {
    id: `${source}:${contentId}`,
    contentId,
    kind: "playlist",
    source,
    title,
    subtitle: songCount > 0 ? `${songCount} songs` : "Playlist",
    imageUrl: String(raw?.imageUrl || raw?.image_url || getImageUrl(raw?.image || raw?.images) || "").trim(),
    playlist: {
      ...raw,
      id: contentId,
      _id: contentId,
      name: title,
      type: "jiosaavn-playlist",
      songCount,
    },
  };
}

function getTextScore(text: string, terms: [string, number][]): number {
  return terms.reduce((score, [term, value]) => score + (text.includes(term) ? value : 0), 0);
}

function getNumericPlaylistSignal(item: RecommendationItem): number {
  const raw = item.playlist || {};
  const values: unknown[] = [
    raw.songCount,
    raw.song_count,
    raw.listCount,
    raw.list_count,
    raw.playCount,
    raw.play_count,
    raw.followerCount,
    raw.follower_count,
    raw.fanCount,
    raw.fan_count,
    raw.viewCount,
    raw.view_count,
  ];

  return values.reduce<number>((highest, value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(highest, numericValue) : highest;
  }, 0);
}

function scoreRecommendationItem(item: RecommendationItem, sectionId: RecommendationSectionId): number {
  const text = `${item.title} ${item.subtitle || ""}`.toLowerCase();
  const popularitySignal = getNumericPlaylistSignal(item);
  let score = 0;

  score += getTextScore(text, [
    ["hindi", 80],
    ["bollywood", 80],
    ["movie", 28],
    ["arijit", 24],
    ["india", 18],
    ["punjabi", 12],
    ["gujarati", 8],
  ]);

  score += getTextScore(text, [
    [String(CURRENT_YEAR), 70],
    ["latest", 54],
    ["new", 50],
    ["fresh", 42],
    ["trending", 48],
    ["viral", 44],
    ["reels", 34],
    ["popular", 46],
    ["most played", 46],
    ["top", 34],
    ["chart", 30],
    ["hit", 26],
    ["superhit", 28],
  ]);

  score += Math.min(Math.log10(Math.max(popularitySignal, 1)) * 28, 95);

  if (sectionId === "freshDiscoveries" || sectionId === "newReleases") {
    score += getTextScore(text, [
      ["latest", 28],
      ["new", 28],
      ["fresh", 22],
      [String(CURRENT_YEAR), 32],
    ]);
  }

  if (sectionId === "popularNearYou" || sectionId === "recommendedForYou") {
    score += getTextScore(text, [
      ["popular", 24],
      ["most played", 24],
      ["top", 18],
      ["trending", 18],
      ["viral", 18],
    ]);
  }

  if (text.includes(String(PREVIOUS_YEAR))) score -= 12;
  if (text.includes("old") || text.includes("retro") || text.includes("classic") || text.includes("evergreen")) {
    score -= 34;
  }

  return score;
}

function rankRecommendationItems(
  items: RecommendationItem[],
  sectionId: RecommendationSectionId
): RecommendationItem[] {
  return items
    .map((item, index) => ({ item, index, score: scoreRecommendationItem(item, sectionId) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

function createRecommendationHomeUrl(sessionId: string, options?: RecommendationHomeFeedOptions): string {
  const params = [`sessionId=${encodeURIComponent(sessionId)}`];
  if (options?.forceRefresh) {
    params.push("refresh=1", `ts=${Date.now()}`);
  }
  return `${buildAppApiUrl("/recommendations/home")}?${params.join("&")}`;
}

const FEED_CACHE_KEY = "@mavrixfy_recommendation_feed_cache_v1";
let _cachedFeed: RecommendationFeed | null = null;

async function saveFeedToCache(feed: RecommendationFeed): Promise<void> {
  try {
    _cachedFeed = feed;
    await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(feed));
  } catch {}
}

async function getFeedFromCache(): Promise<RecommendationFeed | null> {
  if (_cachedFeed) return _cachedFeed;
  try {
    const raw = await AsyncStorage.getItem(FEED_CACHE_KEY);
    if (raw) {
      _cachedFeed = JSON.parse(raw);
      return _cachedFeed;
    }
  } catch {}
  return null;
}

async function searchMavrixfyPlaylists(
  query: string,
  source: RecommendationSource,
  signal?: AbortSignal
): Promise<RecommendationItem[]> {
  const url = `${buildAppApiUrl("/search/playlists")}?query=${encodeURIComponent(query)}&limit=18&page=1`;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) return [];
    signal.addEventListener("abort", onAbort);
  }

  const timeout = setTimeout(() => controller.abort(), LOCAL_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = await response.json().catch(() => null);
    return unwrapPlaylistResults(payload).flatMap((raw) => {
      const item = normalizePlaylistCandidate(raw, source);
      return item ? [item] : [];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

async function mapWithEarlyExit<T, R>(
  items: readonly T[],
  mapper: (item: T, signal: AbortSignal) => Promise<R>,
  concurrency: number,
  checkExit: (results: R[]) => boolean
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const controller = new AbortController();

  const worker = async () => {
    while (!controller.signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], controller.signal);
        if (checkExit(results)) {
          controller.abort();
          return;
        }
      } catch {
        // Ignore errors
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function takeUniquePlaylists(
  candidates: RecommendationItem[],
  shown: Set<string>,
  limit: number
): RecommendationItem[] {
  const selected: RecommendationItem[] = [];

  for (const item of candidates) {
    const key = canonicalPlaylistKey(item);
    if (shown.has(key)) continue;
    shown.add(key);
    selected.push(item);
    if (selected.length >= limit) break;
  }

  return selected;
}

async function getLocalPlaylistRecommendationFeed(): Promise<RecommendationFeed> {
  const cached = await getFeedFromCache();
  if (cached) {
    return {
      ...cached,
      cacheStatus: "hit",
    };
  }

  const shown = new Set<string>();
  
  // Run all section queries in parallel instead of sequentially
  const sectionPromises = LOCAL_SECTION_QUERIES.map(async (sectionConfig) => {
    const results = await mapWithEarlyExit(
      sectionConfig.queries,
      (query, sig) => searchMavrixfyPlaylists(query, sectionConfig.source, sig),
      LOCAL_REQUEST_CONCURRENCY,
      (allResults) => {
        const flattened = allResults.filter(Boolean).flat();
        const uniqueCount = flattened.filter(item => {
          const key = canonicalPlaylistKey(item);
          return !shown.has(key);
        }).length;
        return uniqueCount >= LOCAL_SECTION_MIN_ITEMS;
      }
    );

    const candidates = results.filter(Boolean).flat();
    return { sectionConfig, candidates };
  });

  const sectionResults = await Promise.all(sectionPromises);
  const drafts = [];

  for (const { sectionConfig, candidates } of sectionResults) {
    const items = takeUniquePlaylists(
      rankRecommendationItems(candidates, sectionConfig.id),
      shown,
      LOCAL_FEED_LIMIT
    );

    drafts.push({ sectionConfig, items });
  }

  const sparseDrafts = drafts.filter((draft) => draft.items.length < LOCAL_SECTION_MIN_ITEMS);
  if (sparseDrafts.length > 0) {
    const backupResults = await mapWithEarlyExit(
      LOCAL_BACKUP_QUERIES.slice(0, LOCAL_BACKUP_QUERY_LIMIT),
      (query, sig) => searchMavrixfyPlaylists(query, "jiosaavn", sig),
      LOCAL_REQUEST_CONCURRENCY,
      (allResults) => {
        const flattened = allResults.filter(Boolean).flat();
        return flattened.length >= LOCAL_SECTION_MIN_ITEMS * sparseDrafts.length;
      }
    );
    const backupCandidates = backupResults.filter(Boolean).flat();

    for (const draft of sparseDrafts) {
      const sectionBackup = rankRecommendationItems(
        backupCandidates.map((item) => ({
          ...item,
          source: draft.sectionConfig.source,
          id: `${draft.sectionConfig.source}:${item.contentId}`,
        })),
        draft.sectionConfig.id
      );
      draft.items.push(...takeUniquePlaylists(sectionBackup, shown, LOCAL_FEED_LIMIT - draft.items.length));
    }
  }

  const sections: RecommendationSection[] = drafts.flatMap(({ sectionConfig, items }) =>
    items.length > 0
      ? [{ id: sectionConfig.id, title: sectionConfig.title, subtitle: sectionConfig.subtitle, items }]
      : []
  );

  if (sections.length === 0) {
    throw new Error("No local recommendation playlists were available.");
  }

  return {
    generatedAt: new Date().toISOString(),
    cacheStatus: "miss",
    sectionOrder: sections.map((section) => section.id),
    sections,
  };
}

async function getRecommendationSessionId(): Promise<string> {
  const [current, startedAtRaw] = await Promise.all([
    AsyncStorage.getItem(SESSION_KEY),
    AsyncStorage.getItem(SESSION_STARTED_KEY),
  ]);
  const startedAt = Number(startedAtRaw || 0);

  if (current && startedAt > 0 && Date.now() - startedAt < SESSION_MAX_AGE_MS) {
    return current;
  }

  const next = createSessionId();
  await Promise.all([
    AsyncStorage.setItem(SESSION_KEY, next),
    AsyncStorage.setItem(SESSION_STARTED_KEY, String(Date.now())),
  ]);
  return next;
}

export async function getRecommendationHomeFeed(options?: RecommendationHomeFeedOptions): Promise<RecommendationFeed> {
  const currentUser = options?.authUser ?? auth.currentUser;

  // Return cached feed immediately on non-forced loads so the home screen
  // never blocks on network. A background refresh will update on next open.
  if (!options?.forceRefresh) {
    const cached = await getFeedFromCache();
    if (cached) {
      // Kick off a background refresh without awaiting it
      getRecommendationHomeFeed({ ...options, forceRefresh: true }).then(saveFeedToCache).catch(() => {});
      return { ...cached, cacheStatus: "hit" };
    }
  }

  if (!currentUser) {
    return getLocalPlaylistRecommendationFeed();
  }

  const [token, sessionId] = await Promise.all([
    currentUser.getIdToken(),
    getRecommendationSessionId(),
  ]);
  const url = createRecommendationHomeUrl(sessionId, options);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: options?.signal,
  }).catch(() => null);

  if (!response?.ok) {
    return getLocalPlaylistRecommendationFeed();
  }

  const payload = await response.json();
  const feed = payload?.feed as RecommendationFeed | undefined;
  if (!feed || !Array.isArray(feed.sections)) {
    return getLocalPlaylistRecommendationFeed();
  }

  const parsedFeed: RecommendationFeed = {
    ...feed,
    sections: feed.sections.reduce<RecommendationSection[]>((sections, section) => {
      if (section.id === "recommendedForYou" || section.id === "freshDiscoveries") {
        return sections;
      }
      const items = Array.isArray(section.items)
        ? section.items.filter((item) => item?.kind === "playlist")
        : [];
      if (items.length > 0) {
        sections.push({ ...section, items: rankRecommendationItems(items, section.id) });
      }
      return sections;
    }, []),
  };

  void saveFeedToCache(parsedFeed);

  return parsedFeed;
}
