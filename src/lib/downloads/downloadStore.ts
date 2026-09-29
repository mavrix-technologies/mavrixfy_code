import { accountStorageKey,getAccountScope } from "@/lib/accountScope";
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

import { logger } from "@/lib/logger";
import {
DEFAULT_DOWNLOAD_PREFERENCES,
DownloadItem,
DownloadPreferences,
} from "@/types/downloads";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_INDEX = "@mavrixfy_downloads_index";
const KEY_PREFS = "@mavrixfy_download_prefs";
const itemKey = (songId: string, uid = getAccountScope().accountId) => accountStorageKey(`@mavrixfy_download_${songId}`, uid);

// ─── In-memory cache ──────────────────────────────────────────────────────────

const memCache = new Map<string, DownloadItem>();
const seededAccounts = new Set<string | null>();

// ─── Index mutex ──────────────────────────────────────────────────────────────
// Prevents concurrent index reads/writes from corrupting the list.

let indexMutexPromise: Promise<void> = Promise.resolve();

function withIndexMutex(fn: () => Promise<void>): Promise<void> {
  const operation = indexMutexPromise.then(fn);
  indexMutexPromise = operation.catch(() => {});
  return operation;
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function readIndex(uid = getAccountScope().accountId): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(accountStorageKey(KEY_INDEX, uid));
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function addToIndex(songId: string, uid = getAccountScope().accountId): Promise<void> {
  return withIndexMutex(async () => {
    const ids = await readIndex(uid);
    if (!ids.includes(songId)) {
      ids.unshift(songId);
      return AsyncStorage.setItem(accountStorageKey(KEY_INDEX, uid), JSON.stringify(ids));
    }
  });
}

async function removeFromIndex(songId: string, uid = getAccountScope().accountId): Promise<void> {
  return withIndexMutex(async () => {
    const ids = await readIndex(uid);
    const next = ids.filter((id) => id !== songId);
    return AsyncStorage.setItem(accountStorageKey(KEY_INDEX, uid), JSON.stringify(next));
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Seed the in-memory cache from AsyncStorage. Called once on init. */
export async function loadAllDownloads(): Promise<DownloadItem[]> {
  const uid = getAccountScope().accountId;
  try {
    const ids = await readIndex(uid);
    if (ids.length === 0) {
      seededAccounts.add(uid);
      return [];
    }

    const keys = ids.map(id => itemKey(id, uid));
    const pairs = await AsyncStorage.multiGet(keys);
    const items: DownloadItem[] = [];

    for (const [, value] of pairs) {
      if (!value) continue;
      try {
        const item = JSON.parse(value) as DownloadItem;
        memCache.set(itemKey(item.songId, item.accountId ?? uid), item);
        items.push(item);
      } catch {
        // skip corrupt entries
      }
    }

    seededAccounts.add(uid);
    return items;
  } catch (err) {
    logger.error("[DownloadStore] loadAllDownloads failed", err);
    seededAccounts.add(uid);
    return [];
  }
}

export function getDownloadSync(songId: string): DownloadItem | null {
  return memCache.get(itemKey(songId)) ?? null;
}

/** Read from cache (instant, no I/O). Falls back to AsyncStorage if cache not seeded. */
export async function loadDownload(songId: string): Promise<DownloadItem | null> {
  const uid = getAccountScope().accountId;
  if (seededAccounts.has(uid)) {
    return memCache.get(itemKey(songId, uid)) ?? null;
  }
  // Cache not ready yet — read from storage directly
  try {
    const raw = await AsyncStorage.getItem(itemKey(songId, uid));
    if (!raw) return null;
    const item = JSON.parse(raw) as DownloadItem;
    memCache.set(itemKey(songId, uid), item);
    // Register in the durable index so a subsequent loadAllDownloads()
    // (which iterates the index) does not miss this entry. Without this,
    // an item read here before seeding completes would be invisible to
    // getAllDownloads()/getStorageSummary(), creating a cache/index desync.
    addToIndex(songId, uid).catch(() => {});
    return item;
  } catch {
    return null;
  }
}

/** Write to cache immediately, persist to AsyncStorage in background. */
export async function saveDownload(item: DownloadItem): Promise<void> {
  const uid = item.accountId ?? getAccountScope().accountId;
  const key = itemKey(item.songId, uid);
  memCache.set(key, item);
  await AsyncStorage.setItem(key, JSON.stringify(item));
  await addToIndex(item.songId, uid);
}

export function updateDownloadMemory(item: DownloadItem): void {
  memCache.set(itemKey(item.songId, item.accountId ?? getAccountScope().accountId), item);
}

/** Remove from cache and storage. */
export async function removeDownload(songId: string): Promise<void> {
  const uid = getAccountScope().accountId;
  memCache.delete(itemKey(songId, uid));
  try {
    await Promise.all([
      AsyncStorage.removeItem(itemKey(songId, uid)),
      removeFromIndex(songId, uid),
    ]);
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
  return saveDownload({ ...existing, ...patch });
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
    throw err;
  }
}

