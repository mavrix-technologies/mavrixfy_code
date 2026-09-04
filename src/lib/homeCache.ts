import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { type FirestorePlaylist } from "@/lib/firestore";
import { mapFilter } from "@/lib/arrayUtils";
import type { Song } from "@/lib/musicData";
import type { HomeJioSaavnCategoryData } from "@/data/providers/JioSaavnProvider";
import type { ArtistCard } from "@/data/providers/ArtistProvider";
import type { RecommendationSection } from "@/data/providers/RecommendationProvider";

const HOME_PUBLIC_PLAYLISTS_CACHE_KEY = "@mavrixfy_home_public_playlists_v1";
const HOME_PUBLIC_PLAYLISTS_CACHE_TIME_KEY = "@mavrixfy_home_public_playlists_time_v1";
const HOME_FEED_CACHE_KEY = "@mavrixfy_home_feed_snapshot_v1";
const HOME_FEED_CACHE_TIME_KEY = "@mavrixfy_home_feed_snapshot_time_v1";
const HOME_PUBLIC_PLAYLISTS_TTL_MS = 20 * 60 * 1000;
const HOME_PUBLIC_PLAYLISTS_MAX_STALE_MS = 12 * 60 * 60 * 1000;
const HOME_FEED_CACHE_TTL_MS = 30 * 60 * 1000;
const HOME_FEED_MAX_STALE_MS = 24 * 60 * 60 * 1000;

/** Emitted after Settings clears Home data so mounted Home screens can fetch a fresh feed. */
export const HOME_CACHE_INVALIDATED_EVENT = "mavrixfy:home-cache-invalidated";

export interface CachedHomeFeedSnapshot {
  categories: HomeJioSaavnCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  featuredArtists: ArtistCard[];
  newReleaseSongs: Song[];
  recommendations: RecommendationSection[];
}

function normalizePublicPlaylist(raw: any): FirestorePlaylist | null {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !name) return null;

  const createdByRaw = raw.createdBy && typeof raw.createdBy === "object" ? raw.createdBy : {};
  const createdById = String((createdByRaw as any).id ?? "").trim();
  const createdByName = String((createdByRaw as any).name ?? "Community").trim() || "Community";

  return {
    id,
    name,
    description: typeof raw.description === "string" ? raw.description : "",
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : "",
    songs: Array.isArray(raw.songs) ? raw.songs : [],
    createdBy: {
      id: createdById,
      name: createdByName,
    },
    isPublic: raw.isPublic !== false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizePublicPlaylistList(raw: unknown): FirestorePlaylist[] {
  if (!Array.isArray(raw)) return [];

  return mapFilter(raw, (item) => normalizePublicPlaylist(item), (item): item is FirestorePlaylist => Boolean(item));
}

export async function getCachedHomePublicPlaylists(options?: {
  allowStale?: boolean;
}): Promise<FirestorePlaylist[]> {
  const allowStale = options?.allowStale ?? false;

  try {
    const [[, rawData], [, rawTime]] = await AsyncStorage.multiGet([
      HOME_PUBLIC_PLAYLISTS_CACHE_KEY,
      HOME_PUBLIC_PLAYLISTS_CACHE_TIME_KEY,
    ]);

    if (!rawData || !rawTime) return [];

    const cachedAt = Number(rawTime);
    if (!Number.isFinite(cachedAt)) return [];

    const age = Date.now() - cachedAt;
    if (age > HOME_PUBLIC_PLAYLISTS_MAX_STALE_MS) return [];
    if (!allowStale && age > HOME_PUBLIC_PLAYLISTS_TTL_MS) return [];

    const parsed = JSON.parse(rawData);
    return normalizePublicPlaylistList(parsed);
  } catch {
    return [];
  }
}

export async function setCachedHomePublicPlaylists(playlists: FirestorePlaylist[]): Promise<void> {
  if (!Array.isArray(playlists)) return;

  const normalized = normalizePublicPlaylistList(playlists);
  if (normalized.length === 0) return;

  try {
    await AsyncStorage.multiSet([
      [HOME_PUBLIC_PLAYLISTS_CACHE_KEY, JSON.stringify(normalized)],
      [HOME_PUBLIC_PLAYLISTS_CACHE_TIME_KEY, String(Date.now())],
    ]);
  } catch {
    // Silent cache failure
  }
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeHomeFeedSnapshot(raw: unknown): CachedHomeFeedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<CachedHomeFeedSnapshot>;

  const snapshot: CachedHomeFeedSnapshot = {
    categories: normalizeArray<HomeJioSaavnCategoryData>(value.categories),
    publicPlaylists: normalizePublicPlaylistList(value.publicPlaylists),
    featuredArtists: normalizeArray<ArtistCard>(value.featuredArtists),
    newReleaseSongs: normalizeArray<Song>(value.newReleaseSongs),
    recommendations: normalizeArray<RecommendationSection>(value.recommendations),
  };

  const hasAnyContent =
    snapshot.categories.length > 0 ||
    snapshot.publicPlaylists.length > 0 ||
    snapshot.featuredArtists.length > 0 ||
    snapshot.newReleaseSongs.length > 0 ||
    snapshot.recommendations.length > 0;

  return hasAnyContent ? snapshot : null;
}

export async function getCachedHomeFeedSnapshot(options?: {
  allowStale?: boolean;
}): Promise<CachedHomeFeedSnapshot | null> {
  const allowStale = options?.allowStale ?? false;

  try {
    const [[, rawData], [, rawTime]] = await AsyncStorage.multiGet([
      HOME_FEED_CACHE_KEY,
      HOME_FEED_CACHE_TIME_KEY,
    ]);

    if (!rawData || !rawTime) return null;

    const cachedAt = Number(rawTime);
    if (!Number.isFinite(cachedAt)) return null;

    const age = Date.now() - cachedAt;
    if (age > HOME_FEED_MAX_STALE_MS) return null;
    if (!allowStale && age > HOME_FEED_CACHE_TTL_MS) return null;

    return normalizeHomeFeedSnapshot(JSON.parse(rawData));
  } catch {
    return null;
  }
}

export async function setCachedHomeFeedSnapshot(snapshot: CachedHomeFeedSnapshot): Promise<void> {
  const normalized = normalizeHomeFeedSnapshot(snapshot);
  if (!normalized) return;

  try {
    await AsyncStorage.multiSet([
      [HOME_FEED_CACHE_KEY, JSON.stringify(normalized)],
      [HOME_FEED_CACHE_TIME_KEY, String(Date.now())],
    ]);
  } catch {
    // Silent cache failure
  }
}

export async function clearCachedHomePublicPlaylists(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      HOME_PUBLIC_PLAYLISTS_CACHE_KEY,
      HOME_PUBLIC_PLAYLISTS_CACHE_TIME_KEY,
      HOME_FEED_CACHE_KEY,
      HOME_FEED_CACHE_TIME_KEY,
    ]);
  } catch {
    // The in-memory Home feed is still invalidated below even if storage is unavailable.
  }
}

export function notifyHomeCacheInvalidated(): void {
  DeviceEventEmitter.emit(HOME_CACHE_INVALIDATED_EVENT);
}
