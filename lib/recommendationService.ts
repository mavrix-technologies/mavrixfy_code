import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
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

const LOCAL_SECTION_QUERIES: Array<{
  id: RecommendationSectionId;
  title: string;
  subtitle: string;
  source: RecommendationSource;
  queries: string[];
}> = [
  {
    id: "recommendedForYou",
    title: "Recommended For You",
    subtitle: "Hindi, Punjabi, Gujarati, and English audience picks",
    source: "jiosaavn",
    queries: ["hindi bollywood top playlists", "punjabi hits playlist", "english pop india playlist", "gujarati hits playlist"],
  },
  {
    id: "freshDiscoveries",
    title: "Fresh Discoveries",
    subtitle: "Fresh high-audience language playlists",
    source: "fresh",
    queries: ["new hindi songs playlist", "new punjabi songs playlist", "latest english songs playlist", "new gujarati songs playlist"],
  },
  {
    id: "popularNearYou",
    title: "Popular Near You",
    subtitle: "Popular Hindi, Punjabi, Gujarati, and English playlists",
    source: "regional",
    queries: ["hindi reels playlist", "punjabi trending playlist", "gujarati trending playlist", "english trending playlist india"],
  },
  {
    id: "basedOnActivity",
    title: "Based On Your Activity",
    subtitle: "Familiar moods in your main languages",
    source: "trending",
    queries: ["hindi romance playlist", "punjabi party playlist", "gujarati garba playlist", "english workout playlist"],
  },
  {
    id: "newReleases",
    title: "New Releases",
    subtitle: "Latest Hindi, Punjabi, Gujarati, and English drops",
    source: "fresh",
    queries: ["latest hindi songs playlist", "latest punjabi songs playlist", "gujarati hits playlist", "latest english songs playlist"],
  },
];

const LOCAL_BACKUP_QUERIES = [
  "hindi bollywood evergreen playlist",
  "arijit singh hindi playlist",
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

export function recommendationFeedEnabled(): boolean {
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

async function searchMavrixfyPlaylists(query: string, source: RecommendationSource): Promise<RecommendationItem[]> {
  const url = `${buildAppApiUrl("/search/playlists")}?query=${encodeURIComponent(query)}&limit=18&page=1`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return [];

  const payload = await response.json().catch(() => null);
  return unwrapPlaylistResults(payload)
    .map((raw) => normalizePlaylistCandidate(raw, source))
    .filter((item): item is RecommendationItem => Boolean(item));
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
  const shown = new Set<string>();
  const sections: RecommendationSection[] = [];
  const backupResultsPromise = Promise.all(
    LOCAL_BACKUP_QUERIES.map((query) => searchMavrixfyPlaylists(query, "jiosaavn"))
  );
  const sectionResults = await Promise.all(
    LOCAL_SECTION_QUERIES.map(async (sectionConfig) => {
      const results = await Promise.all(
        sectionConfig.queries.map((query) => searchMavrixfyPlaylists(query, sectionConfig.source))
      );
      return { sectionConfig, candidates: results.flat() };
    })
  );
  const backupCandidates = (await backupResultsPromise).flat();

  for (const { sectionConfig, candidates } of sectionResults) {
    const items = takeUniquePlaylists(candidates, shown, LOCAL_FEED_LIMIT);

    if (items.length < LOCAL_SECTION_MIN_ITEMS) {
      const sectionBackup = backupCandidates.map((item) => ({
        ...item,
        source: sectionConfig.source,
        id: `${sectionConfig.source}:${item.contentId}`,
      }));
      items.push(...takeUniquePlaylists(sectionBackup, shown, LOCAL_FEED_LIMIT - items.length));
    }

    if (items.length > 0) {
      sections.push({
        id: sectionConfig.id,
        title: sectionConfig.title,
        subtitle: sectionConfig.subtitle,
        items,
      });
    }
  }

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

export async function getRecommendationSessionId(): Promise<string> {
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

export async function getRecommendationHomeFeed(): Promise<RecommendationFeed> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Recommendation feed requires an authenticated user.");
  }

  const [token, sessionId] = await Promise.all([
    currentUser.getIdToken(),
    getRecommendationSessionId(),
  ]);
  const url = `${buildAppApiUrl("/recommendations/home")}?sessionId=${encodeURIComponent(sessionId)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => null);

  if (!response?.ok) {
    return getLocalPlaylistRecommendationFeed();
  }

  const payload = await response.json();
  const feed = payload?.feed as RecommendationFeed | undefined;
  if (!feed || !Array.isArray(feed.sections)) {
    return getLocalPlaylistRecommendationFeed();
  }

  return {
    ...feed,
    sections: feed.sections
      .map((section) => ({
        ...section,
        items: Array.isArray(section.items)
          ? section.items.filter((item) => item?.kind === "playlist")
          : [],
      }))
      .filter((section) => section.items.length > 0),
  };
}
