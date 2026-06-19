/**
 * Download Store — Durable local persistence for the download queue.
 *
 * Design:
 * - In-memory write-through cache: reads are instant, writes go to AsyncStorage
 *   in the background. This eliminates the AsyncStorage read storm that occurs
 *   when many downloads fire progress callbacks simultaneously.
 * - Serialized index writes: a mutex prevents concurrent index corruption when
 *   multiple songs are queued at the same time.
 * - The cache is seeded on first load and stays in sync via saveDownload/removeDownload.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DownloadItem,
  DownloadPreferences,
  DEFAULT_DOWNLOAD_PREFERENCES,
} from "@/types/downloads";
import { logger } from "@/lib/logger";

const KEY_INDEX = "@mavrixfy_downloads_index";
const KEY_PREFS = "@mavrixfy_download_prefs";
const itemKey = (songId: string) => `@mavrixfy_download_${songId}`;

// ─── In-memory cache ──────────────────────────────────────────────────────────

const memCache = new Map<string, DownloadItem>();
let cacheSeeded = false;

// ─── Index mutex ──────────────────────────────────────────────────────────────
// Prevents concurrent index reads/writes from corrupting the list.

let indexMutexPromise: Promise<void> = Promise.resolve();

function withIndexMutex(fn: () => Promise<void>): Promise<void> {
  indexMutexPromise = indexMutexPromise.then(fn).catch(() => {});
  return indexMutexPromise;
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_INDEX);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function addToIndex(songId: string): Promise<void> {
  return withIndexMutex(async () => {
    const ids = await readIndex();
    if (!ids.includes(songId)) {
      ids.unshift(songId);
      await AsyncStorage.setItem(KEY_INDEX, JSON.stringify(ids));
    }
  });
}

async function removeFromIndex(songId: string): Promise<void> {
  return withIndexMutex(async () => {
    const ids = await readIndex();
    const next = ids.filter((id) => id !== songId);
    await AsyncStorage.setItem(KEY_INDEX, JSON.stringify(next));
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Seed the in-memory cache from AsyncStorage. Called once on init. */
export async function loadAllDownloads(): Promise<DownloadItem[]> {
  try {
    const ids = await readIndex();
    if (ids.length === 0) {
      cacheSeeded = true;
      return [];
    }

    const keys = ids.map(itemKey);
    const pairs = await AsyncStorage.multiGet(keys);
    const items: DownloadItem[] = [];

    for (const [, value] of pairs) {
      if (!value) continue;
      try {
        const item = JSON.parse(value) as DownloadItem;
        memCache.set(item.songId, item);
        items.push(item);
      } catch {
        // skip corrupt entries
      }
    }

    cacheSeeded = true;
    return items;
  } catch (err) {
    logger.error("[DownloadStore] loadAllDownloads failed", err);
    cacheSeeded = true;
    return [];
  }
}

/** Read from cache (instant, no I/O). Falls back to AsyncStorage if cache not seeded. */
export async function loadDownload(songId: string): Promise<DownloadItem | null> {
  if (cacheSeeded) {
    return memCache.get(songId) ?? null;
  }
  // Cache not ready yet — read from storage directly
  try {
    const raw = await AsyncStorage.getItem(itemKey(songId));
    if (!raw) return null;
    const item = JSON.parse(raw) as DownloadItem;
    memCache.set(songId, item);
    // Register in the durable index so a subsequent loadAllDownloads()
    // (which iterates the index) does not miss this entry. Without this,
    // an item read here before seeding completes would be invisible to
    // getAllDownloads()/getStorageSummary(), creating a cache/index desync.
    addToIndex(songId).catch(() => {});
    return item;
  } catch {
    return null;
  }
}

/** Write to cache immediately, persist to AsyncStorage in background. */
export async function saveDownload(item: DownloadItem): Promise<void> {
  const isNew = !memCache.has(item.songId);

  // Update cache synchronously — callers see the new value instantly
  memCache.set(item.songId, item);

  // Persist to AsyncStorage in background (non-blocking for progress updates)
  AsyncStorage.setItem(itemKey(item.songId), JSON.stringify(item)).catch((err) => {
    logger.error("[DownloadStore] saveDownload persist failed", err);
  });

  // Only update the index if this is a new entry
  if (isNew) {
    addToIndex(item.songId).catch(() => {});
  }
}

/** Update the in-memory cache only. Use for high-frequency progress ticks. */
export function updateDownloadMemory(item: DownloadItem): void {
  memCache.set(item.songId, item);
}

/** Remove from cache and storage. */
export async function removeDownload(songId: string): Promise<void> {
  memCache.delete(songId);
  try {
    await AsyncStorage.removeItem(itemKey(songId));
    await removeFromIndex(songId);
  } catch (err) {
    logger.error("[DownloadStore] removeDownload failed", err);
  }
}

/** Update specific fields on a stored item. Uses cache — no extra I/O. */
export async function patchDownload(
  songId: string,
  patch: Partial<DownloadItem>
): Promise<void> {
  const existing = await loadDownload(songId);
  if (!existing) return;
  await saveDownload({ ...existing, ...patch });
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export async function loadDownloadPreferences(): Promise<DownloadPreferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFS);
    if (!raw) return { ...DEFAULT_DOWNLOAD_PREFERENCES };
    return { ...DEFAULT_DOWNLOAD_PREFERENCES, ...(JSON.parse(raw) as Partial<DownloadPreferences>) };
  } catch {
    return { ...DEFAULT_DOWNLOAD_PREFERENCES };
  }
}

export async function saveDownloadPreferences(prefs: DownloadPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFS, JSON.stringify(prefs));
  } catch (err) {
    logger.error("[DownloadStore] saveDownloadPreferences failed", err);
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function clearAllDownloads(): Promise<void> {
  try {
    const ids = await readIndex();
    const keys = ids.map(itemKey);
    memCache.clear();
    await AsyncStorage.multiRemove([...keys, KEY_INDEX]);
  } catch (err) {
    logger.error("[DownloadStore] clearAllDownloads failed", err);
  }
}
