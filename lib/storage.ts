import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song, Playlist } from "./musicData";
import { logger } from "@/lib/logger";

const KEYS = {
  LIKED_SONGS: "@mavrixfy_liked_songs",
  LIKED_SONGS_DATA: "@mavrixfy_liked_songs_data",
  USER_PLAYLISTS: "@mavrixfy_user_playlists",
  RECENTLY_PLAYED: "@mavrixfy_recently_played",
  SEARCH_HISTORY: "@mavrixfy_search_history",
  SETTINGS: "@mavrixfy_settings",
  PLAYER_STATE: "@mavrixfy_player_state",
} as const;

// Memory cache for frequently accessed data
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export interface RecentlyPlayedItem {
  id: string;
  name: string;
  imageUrl: string;
  type: "playlist" | "jiosaavn-playlist" | "song";
  lastPlayed: number;
  data?: any;
}

export interface SearchHistoryItem {
  id: string;
  label: string;
  type: "query" | "song";
  subtitle?: string;
  imageUrl?: string;
  song?: Song;
  lastSearched: number;
}

export interface UserPlaylist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  songs: Song[];
  createdAt: number;
  updatedAt: number;
}

export type YouTubeVideoQualityPreference = "auto" | "low" | "medium" | "high";

function normalizeYouTubeVideoQuality(value: unknown): YouTubeVideoQualityPreference {
  return value === "low" || value === "medium" || value === "high" || value === "auto"
    ? value
    : "auto";
}

export function getYouTubePlaybackQuality(
  quality: YouTubeVideoQualityPreference
): "default" | "small" | "medium" | "hd720" {
  switch (quality) {
    case "low":
      return "small";
    case "medium":
      return "medium";
    case "high":
      return "hd720";
    case "auto":
    default:
      return "default";
  }
}

export interface AppSettings {
  streamingQuality: "low" | "medium" | "high";
  videoBackgroundQuality: YouTubeVideoQualityPreference;
  downloadQuality: "low" | "medium" | "high";
  equalizer: Record<string, number>;
  equalizerEnabled: boolean;
  hapticsEnabled: boolean;
  crossfade: number;
  gapless: boolean;
  normalizeVolume: boolean;
  ambientBackdropEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  streamingQuality: "high",
  videoBackgroundQuality: "auto",
  downloadQuality: "high",
  equalizer: {
    "60Hz": 0,
    "150Hz": 0,
    "400Hz": 0,
    "1KHz": 0,
    "2.4KHz": 0,
    "15KHz": 0,
  },
  equalizerEnabled: false,
  hapticsEnabled: false,
  crossfade: 0,
  gapless: true,
  normalizeVolume: false,
  ambientBackdropEnabled: true,
};

const EQUALIZER_PRESETS: Record<string, Record<string, number>> = {
  Flat: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 },
  Bass: { "60Hz": 6, "150Hz": 5, "400Hz": 2, "1KHz": 0, "2.4KHz": -1, "15KHz": -2 },
  Treble: { "60Hz": -2, "150Hz": -1, "400Hz": 0, "1KHz": 2, "2.4KHz": 5, "15KHz": 6 },
  Rock: { "60Hz": 5, "150Hz": 3, "400Hz": -1, "1KHz": 2, "2.4KHz": 4, "15KHz": 5 },
  Pop: { "60Hz": -1, "150Hz": 2, "400Hz": 4, "1KHz": 4, "2.4KHz": 2, "15KHz": -1 },
  Jazz: { "60Hz": 3, "150Hz": 1, "400Hz": -1, "1KHz": 1, "2.4KHz": 3, "15KHz": 4 },
  Classical: { "60Hz": 4, "150Hz": 3, "400Hz": 0, "1KHz": 0, "2.4KHz": 2, "15KHz": 4 },
  "Hip-Hop": { "60Hz": 6, "150Hz": 5, "400Hz": 1, "1KHz": -1, "2.4KHz": 2, "15KHz": 0 },
  Electronic: { "60Hz": 5, "150Hz": 4, "400Hz": 0, "1KHz": -1, "2.4KHz": 3, "15KHz": 5 },
  Vocal: { "60Hz": -2, "150Hz": 0, "400Hz": 3, "1KHz": 5, "2.4KHz": 3, "15KHz": 0 },
  "Late Night": { "60Hz": 3, "150Hz": 2, "400Hz": 1, "1KHz": -1, "2.4KHz": -2, "15KHz": -3 },
  Bollywood: { "60Hz": 4, "150Hz": 3, "400Hz": 1, "1KHz": 2, "2.4KHz": 4, "15KHz": 3 },
};

const SEARCH_HISTORY_LIMIT = 12;

function normalizeSearchLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function getSearchHistoryId(label: string): string {
  return `q_${encodeURIComponent(label.toLowerCase()).slice(0, 100)}`;
}

function getSongSearchHistoryId(song: Pick<Song, "id">): string {
  return `song_${encodeURIComponent(song.id).slice(0, 120)}`;
}

function getSearchHistoryKey(item: Pick<SearchHistoryItem, "label" | "type" | "song">): string {
  if (item.type === "song" && item.song?.id) {
    return `song:${item.song.id}`;
  }

  return `query:${item.label.toLowerCase()}`;
}

function normalizeSearchHistoryItems(items: Array<Partial<SearchHistoryItem>>): SearchHistoryItem[] {
  const seen = new Set<string>();
  const normalized: SearchHistoryItem[] = [];

  for (const item of items) {
    const song = item.type === "song" && item.song?.id && item.song?.title ? item.song : undefined;
    const type = song ? "song" : "query";
    const label = normalizeSearchLabel(type === "song" ? song?.title || item.label : item.label);
    if (label.length < 2) continue;

    const key = getSearchHistoryKey({ label, type, song });
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      id: typeof item.id === "string" && item.id
        ? item.id
        : song
          ? getSongSearchHistoryId(song)
          : getSearchHistoryId(label),
      label,
      type,
      subtitle: type === "song"
        ? normalizeSearchLabel(item.subtitle || (song?.artist ? `Song • ${song.artist}` : "Song"))
        : undefined,
      imageUrl: type === "song" ? item.imageUrl || song?.coverUrl || "" : undefined,
      song,
      lastSearched: typeof item.lastSearched === "number" ? item.lastSearched : Date.now(),
    });

    if (normalized.length >= SEARCH_HISTORY_LIMIT) break;
  }

  return normalized;
}

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    // Check memory cache first
    const cached = memoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const data = await AsyncStorage.getItem(key);
    const parsed = data ? JSON.parse(data) : fallback;
    
    // Store in memory cache
    memoryCache.set(key, { data: parsed, timestamp: Date.now() });
    
    return parsed;
  } catch {
    return fallback;
  }
}

export async function pruneNonEssentialStorageCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter(key => {
      if (!key.startsWith("@mavrixfy_")) return false;

      const isCritical =
        key === "@mavrixfy_downloads" ||
        key === "@mavrixfy_downloads_index" ||
        key === "@mavrixfy_download_prefs" ||
        key.startsWith("@mavrixfy_download_") ||
        key === "@mavrixfy_liked_songs" ||
        key === "@mavrixfy_liked_songs_data" ||
        key === "@mavrixfy_user_playlists" ||
        key === "@mavrixfy_recently_played" ||
        key === "@mavrixfy_search_history" ||
        key === "@mavrixfy_settings" ||
        key === "@mavrixfy_player_state" ||
        key === "@mavrixfy_followed_artists_v1" ||
        key === "@mavrixfy_device_id" ||
        key.startsWith("@mavrixfy_promotion_modal_dismissed") ||
        key === "@mavrixfy_last_shown_playlists_v1";

      return !isCritical;
    });

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (err) {
    logger.error("[Storage] Failed to prune storage caches:", err);
  }
}

async function safeAsyncStorageSetItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err: any) {
    const errMsg = String(err?.message || "").toLowerCase();
    if (errMsg.includes("full") || err?.code === 13 || err?.code === "SQLITE_FULL") {
      await pruneNonEssentialStorageCaches();
      try {
        await AsyncStorage.setItem(key, value);
      } catch (retryErr) {
        logger.error(`[Storage] Failed to set key ${key} even after pruning:`, retryErr);
      }
    } else {
      logger.error(`[Storage] Failed to set key ${key}:`, err);
    }
  }
}

async function safeAsyncStorageMultiSet(pairs: [string, string][]): Promise<void> {
  try {
    await AsyncStorage.multiSet(pairs);
  } catch (err: any) {
    const errMsg = String(err?.message || "").toLowerCase();
    if (errMsg.includes("full") || err?.code === 13 || err?.code === "SQLITE_FULL") {
      await pruneNonEssentialStorageCaches();
      try {
        await AsyncStorage.multiSet(pairs);
      } catch (retryErr) {
        logger.error("[Storage] Failed to multiSet even after pruning:", retryErr);
      }
    } else {
      logger.error("[Storage] Failed to multiSet:", err);
    }
  }
}

async function setJSON(key: string, value: unknown): Promise<void> {
  try {
    // Update memory cache immediately
    memoryCache.set(key, { data: value, timestamp: Date.now() });
    
    // Persist to AsyncStorage
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err: any) {
    const errMsg = String(err?.message || "").toLowerCase();
    if (errMsg.includes("full") || err?.code === 13 || err?.code === "SQLITE_FULL") {
      await pruneNonEssentialStorageCaches();
      try {
        await AsyncStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }
  }
}

export { setJSON };

async function getLikedSongIds(): Promise<string[]> {
  return getJSON<string[]>(KEYS.LIKED_SONGS, []);
}

async function getLikedSongsData(): Promise<Song[]> {
  return getJSON<Song[]>(KEYS.LIKED_SONGS_DATA, []);
}

async function addLikedSong(song: Song): Promise<void> {
  const [ids, data] = await Promise.all([
    getLikedSongIds(),
    getLikedSongsData(),
  ]);
  if (!ids.includes(song.id)) {
    ids.unshift(song.id);
    data.unshift(song);
    await Promise.all([
      setJSON(KEYS.LIKED_SONGS, ids),
      setJSON(KEYS.LIKED_SONGS_DATA, data),
    ]);
  }
}

async function removeLikedSong(songId: string): Promise<void> {
  const [ids, data] = await Promise.all([
    getLikedSongIds(),
    getLikedSongsData(),
  ]);
  await Promise.all([
    setJSON(KEYS.LIKED_SONGS, ids.filter(id => id !== songId)),
    setJSON(KEYS.LIKED_SONGS_DATA, data.filter(s => s.id !== songId)),
  ]);
}

async function isLikedSong(songId: string): Promise<boolean> {
  const ids = await getLikedSongIds();
  return ids.includes(songId);
}

export async function getUserPlaylists(): Promise<UserPlaylist[]> {
  return getJSON<UserPlaylist[]>(KEYS.USER_PLAYLISTS, []);
}

async function saveUserPlaylists(playlists: UserPlaylist[]): Promise<void> {
  await setJSON(KEYS.USER_PLAYLISTS, playlists);
}

export async function createUserPlaylist(name: string, description?: string): Promise<UserPlaylist> {
  const playlists = await getUserPlaylists();
  const newPlaylist: UserPlaylist = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    description: description || "",
    coverUrl: "",
    songs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  playlists.unshift(newPlaylist);
  await saveUserPlaylists(playlists);
  return newPlaylist;
}

export async function deleteUserPlaylist(playlistId: string): Promise<void> {
  const playlists = await getUserPlaylists();
  await saveUserPlaylists(playlists.filter(p => p.id !== playlistId));
}

export async function addSongToPlaylist(playlistId: string, song: Song): Promise<boolean> {
  const playlists = await getUserPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return false;
  if (playlists[idx].songs.some(s => s.id === song.id)) return false; // Duplicate
  playlists[idx].songs.push(song);
  playlists[idx].updatedAt = Date.now();
  if (!playlists[idx].coverUrl && song.coverUrl) {
    playlists[idx].coverUrl = song.coverUrl;
  }
  await saveUserPlaylists(playlists);
  return true;
}

export async function updateUserPlaylist(
  playlistId: string,
  updates: Partial<{ name: string; description: string; coverUrl: string }>
): Promise<void> {
  const playlists = await getUserPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return;
  
  playlists[idx] = {
    ...playlists[idx],
    ...updates,
    updatedAt: Date.now(),
  };
  
  await saveUserPlaylists(playlists);
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  const playlists = await getUserPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return;
  playlists[idx].songs = playlists[idx].songs.filter(s => s.id !== songId);
  playlists[idx].updatedAt = Date.now();
  await saveUserPlaylists(playlists);
}

export async function getRecentlyPlayed(): Promise<RecentlyPlayedItem[]> {
  return getJSON<RecentlyPlayedItem[]>(KEYS.RECENTLY_PLAYED, []);
}

export async function addRecentlyPlayed(item: Omit<RecentlyPlayedItem, "lastPlayed">): Promise<void> {
  const items = await getRecentlyPlayed();
  const filtered = items.filter(i => i.id !== item.id);
  filtered.unshift({ ...item, lastPlayed: Date.now() });
  await setJSON(KEYS.RECENTLY_PLAYED, filtered.slice(0, 30));
}

export async function getSearchHistory(): Promise<SearchHistoryItem[]> {
  const items = await getJSON<Array<Partial<SearchHistoryItem>>>(KEYS.SEARCH_HISTORY, []);
  return normalizeSearchHistoryItems(items);
}

export async function addSearchHistoryItem(labelValue: string): Promise<SearchHistoryItem[]> {
  const label = normalizeSearchLabel(labelValue);
  if (label.length < 2) {
    return getSearchHistory();
  }

  const items = await getSearchHistory();
  const nextItem: SearchHistoryItem = {
    id: getSearchHistoryId(label),
    label,
    type: "query",
    lastSearched: Date.now(),
  };
  const nextKey = getSearchHistoryKey(nextItem);
  const filtered = items.filter((item) => getSearchHistoryKey(item) !== nextKey);
  const nextItems = [nextItem, ...filtered].slice(0, SEARCH_HISTORY_LIMIT);
  await setJSON(KEYS.SEARCH_HISTORY, nextItems);
  return nextItems;
}

export async function addSongSearchHistoryItem(song: Song): Promise<SearchHistoryItem[]> {
  const label = normalizeSearchLabel(song.title);
  if (!song.id || label.length < 2) {
    return getSearchHistory();
  }

  const items = await getSearchHistory();
  const nextItem: SearchHistoryItem = {
    id: getSongSearchHistoryId(song),
    label,
    type: "song",
    subtitle: normalizeSearchLabel(song.artist) ? `Song • ${normalizeSearchLabel(song.artist)}` : "Song",
    imageUrl: song.coverUrl || "",
    song,
    lastSearched: Date.now(),
  };
  const nextKey = getSearchHistoryKey(nextItem);
  const filtered = items.filter((item) => getSearchHistoryKey(item) !== nextKey);
  const nextItems = [nextItem, ...filtered].slice(0, SEARCH_HISTORY_LIMIT);
  await setJSON(KEYS.SEARCH_HISTORY, nextItems);
  return nextItems;
}

export async function removeSearchHistoryItem(id: string): Promise<SearchHistoryItem[]> {
  const items = await getSearchHistory();
  const nextItems = items.filter((item) => item.id !== id);
  await setJSON(KEYS.SEARCH_HISTORY, nextItems);
  return nextItems;
}

export async function getSettings(): Promise<AppSettings> {
  const saved = await getJSON<Partial<AppSettings>>(KEYS.SETTINGS, DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    equalizer: {
      ...DEFAULT_SETTINGS.equalizer,
      ...(saved.equalizer || {}),
    },
    hapticsEnabled: Boolean(saved.hapticsEnabled),
    videoBackgroundQuality: normalizeYouTubeVideoQuality(saved.videoBackgroundQuality),
    ambientBackdropEnabled: saved.ambientBackdropEnabled !== undefined ? Boolean(saved.ambientBackdropEnabled) : DEFAULT_SETTINGS.ambientBackdropEnabled,
  };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await setJSON(KEYS.SETTINGS, { ...current, ...settings });
}

export async function clearAppStorage(options?: { preserveSettings?: boolean }): Promise<void> {
  const preserveSettings = options?.preserveSettings ?? false;

  try {
    memoryCache.clear();

    const keys = await AsyncStorage.getAllKeys();
    const appKeys = keys.filter((key) => key.startsWith("@mavrixfy_"));
    const keysToRemove = preserveSettings
      ? appKeys.filter((key) => key !== KEYS.SETTINGS)
      : appKeys;

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch {}
}

// ─── Player state persistence ─────────────────────────────────────────────────

export interface PersistedPlayerState {
  currentSong: Song | null;
  queue: Song[];
  queueIndex: number;
  positionSeconds?: number;
  updatedAt?: number;
}

export async function savePlayerState(state: PersistedPlayerState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.PLAYER_STATE, JSON.stringify(state));
  } catch {}
}

export async function loadPlayerState(): Promise<PersistedPlayerState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PLAYER_STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPlayerState;
    if (!parsed?.currentSong?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}
