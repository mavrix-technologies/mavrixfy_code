/**
 * Download Queue — concurrency-limited, race-condition-free download engine.
 *
 * Design:
 * - MAX_CONCURRENT downloads run at once (default 2). Others wait in a pending list.
 * - A per-song mutex (startingSet) prevents two concurrent calls for the same song
 *   from both passing the "already running" guard.
 * - Progress callbacks update the in-memory store only (no AsyncStorage read per tick).
 * - When a slot frees up, the next pending song is automatically started.
 */

import {
  createDownloadResumable,
  DownloadResumable,
} from "expo-file-system/legacy";
import { type DownloadItem, type DownloadStatus, type DownloadPreferences } from "@/types/downloads";
import {
  saveDownload,
  loadDownload,
  updateDownloadMemory,
} from "@/lib/downloads/downloadStore";
import {
  ensureDownloadsDirs,
  getTempDownloadUri,
  getTrackFileUri,
  getArtworkFileUri,
  promoteTempToTrack,
  hasSufficientStorage,
} from "@/lib/downloads/filesystem";
import { getAudioUrlByQuality } from "@/lib/downloads/audioQuality";
import { getMusicApiUrl } from "@/lib/api-config";
import { getBestAudioUrlWithQuality } from "@/lib/musicData";
import { logger } from "@/lib/logger";

// ─── Concurrency config ───────────────────────────────────────────────────────

const MAX_CONCURRENT = 2;

// ─── Event emitter ────────────────────────────────────────────────────────────

type QueueEventType = "progress" | "status" | "completed" | "failed";
type QueueListener = (songId: string, item: DownloadItem) => void;

const listeners = new Map<QueueEventType, Set<QueueListener>>();

export function onQueueEvent(event: QueueEventType, fn: QueueListener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

function emit(event: QueueEventType, songId: string, item: DownloadItem) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(songId, item); } catch { /* ignore */ }
  });
}

// ─── Queue state ──────────────────────────────────────────────────────────────

/** Songs actively downloading right now. */
const activeHandles = new Map<string, DownloadResumable>();

/** Songs waiting for a free slot. */
const pendingQueue: string[] = [];

/** Guards against two concurrent startDownload calls for the same songId. */
const startingSet = new Set<string>();
const lastProgressPersistAt = new Map<string, number>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PROGRESS_PERSIST_INTERVAL_MS = 1500;

// ─── Slot management ──────────────────────────────────────────────────────────

function activeCount(): number {
  return activeHandles.size;
}

/** Called when a download finishes (success, fail, or cancel) to free its slot. */
function releaseSlot(songId: string) {
  activeHandles.delete(songId);
  startingSet.delete(songId);
  lastProgressPersistAt.delete(songId);
  drainQueue();
}

function clearRetryTimer(songId: string): void {
  const timer = retryTimers.get(songId);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(songId);
  }
}

/** Start the next pending song if a slot is free. */
function drainQueue() {
  while (activeCount() < MAX_CONCURRENT && pendingQueue.length > 0) {
    const next = pendingQueue.shift()!;
    // Fire and forget — errors are handled inside executeDownload
    executeDownload(next).catch(() => {});
  }
}

// ─── Status helper ────────────────────────────────────────────────────────────

async function updateStatus(
  songId: string,
  status: DownloadStatus,
  extra?: Partial<DownloadItem>
): Promise<DownloadItem | null> {
  const item = await loadDownload(songId);
  if (!item) return null;
  const updated: DownloadItem = { ...item, status, ...extra };
  await saveDownload(updated);
  emit("status", songId, updated);
  return updated;
}

// ─── URL refresh ─────────────────────────────────────────────────────────────

/**
 * Resolve all redirects to get the final download URL.
 * This is critical for Gaana URLs which use multiple redirects.
 */
async function resolveRedirects(url: string): Promise<string> {
  try {
    let currentUrl = url;
    let redirectCount = 0;
    const MAX_REDIRECTS = 10;

    while (redirectCount < MAX_REDIRECTS) {
      const response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual', // Don't follow redirects automatically
      });

      // Check if it's a redirect (301, 302, 307, 308)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        
        // Handle relative URLs
        currentUrl = location.startsWith('http') 
          ? location 
          : new URL(location, currentUrl).href;
        
        redirectCount++;
        logger.debug(`[DownloadQueue] Redirect ${redirectCount}: ${currentUrl.substring(0, 100)}...`);
      } else {
        // No more redirects
        break;
      }
    }

    if (currentUrl !== url) {
      logger.info(`[DownloadQueue] Resolved ${redirectCount} redirects for download`);
    }

    return currentUrl;
  } catch (err) {
    logger.warn('[DownloadQueue] Failed to resolve redirects, using original URL', err);
    return url;
  }
}

/**
 * Fetch a fresh downloadUrl for a JioSaavn song right before starting the
 * actual download. CDN signed URLs expire in ~15–30 minutes, so the URL stored
 * in the queue at the time the user tapped "Download" may already be stale by
 * the time the download slot opens.
 *
 * Falls back to the original URL if the API call fails or times out.
 */
async function refreshAudioUrl(songId: string, originalUrl: string, quality: DownloadItem["quality"]): Promise<string> {
  // Only attempt refresh for JioSaavn songs (numeric IDs or short alphanumeric)
  // YouTube and Cloudinary URLs have their own expiry handling
  if (!songId || songId.startsWith("youtube_") || originalUrl.includes("cloudinary")) {
    return getAudioUrlByQuality(originalUrl, quality);
  }

  try {
    const apiBase = getMusicApiUrl().replace(/\/$/, "");
    const url = `${apiBase}/songs?id=${encodeURIComponent(songId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();

    // Response shape: { success: true, data: { songs: [...] } } or { success: true, data: [...] }
    const songs: any[] =
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.data?.songs) ? json.data.songs :
      Array.isArray(json?.data?.results) ? json.data.results :
      [];

    const song = songs[0];
    const freshDownloadUrl = song?.downloadUrl ?? song?.download_url ?? song?.audioUrl;

    if (freshDownloadUrl) {
      const qualityMap = { low: "low" as const, medium: "medium" as const, high: "high" as const };
      const resolved = getBestAudioUrlWithQuality(freshDownloadUrl, qualityMap[quality] ?? "high");
      if (resolved && resolved.startsWith("http")) {
        logger.debug("[DownloadQueue] Refreshed audio URL for", songId);
        return resolved;
      }
    }
  } catch (err: any) {
    logger.warn("[DownloadQueue] URL refresh failed, using original", { songId, error: err?.message });
  }

  return getAudioUrlByQuality(originalUrl, quality);
}

// ─── Core download execution ──────────────────────────────────────────────────

async function executeDownload(songId: string): Promise<void> {
  // Double-check guard — prevents re-entry if somehow called twice
  if (activeHandles.has(songId)) return;

  const item = await loadDownload(songId);
  if (!item) return;

  // If it was cancelled while waiting in the pending queue, skip it
  if (item.status === "deleted" || item.status === "completed") return;

  await ensureDownloadsDirs();
  const tempUri = getTempDownloadUri(songId);
  const finalUri = getTrackFileUri(songId);

  await updateStatus(songId, "downloading");

  // Fetch a fresh audio URL — JioSaavn CDN URLs expire in ~15-30 min,
  // and the URL stored at queue time is often already stale when the slot opens.
  let audioUrl = await refreshAudioUrl(songId, item.audioUrl, item.quality);
  
  // Resolve all redirects to get the final download URL
  audioUrl = await resolveRedirects(audioUrl);

  const handle = createDownloadResumable(
    audioUrl,
    tempUri,
    {},
    (progress) => {
      // Progress callback: update cache only — no AsyncStorage read per tick
      const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
      const pct =
        totalBytesExpectedToWrite > 0
          ? Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
          : 0;

      // Read from cache synchronously (no await needed — cache is always current)
      loadDownload(songId).then((current) => {
        if (!current || current.status !== "downloading") return;
        const patched: DownloadItem = {
          ...current,
          progress: pct,
          bytesDownloaded: totalBytesWritten,
          totalBytes: totalBytesExpectedToWrite,
        };
        updateDownloadMemory(patched);
        emit("progress", songId, patched);

        const now = Date.now();
        const lastPersistedAt = lastProgressPersistAt.get(songId) ?? 0;
        if (now - lastPersistedAt >= PROGRESS_PERSIST_INTERVAL_MS || pct >= 100) {
          lastProgressPersistAt.set(songId, now);
          void saveDownload(patched);
        }
      });
    }
  );

  activeHandles.set(songId, handle);

  try {
    const result = await handle.downloadAsync();

    if (!result) {
      // Paused / cancelled by user
      await updateStatus(songId, "paused");
      releaseSlot(songId);
      return;
    }

    // Atomically promote verified temp file to final permanent track location
    const promoted = await promoteTempToTrack(songId);
    if (!promoted) {
      logger.warn("[DownloadQueue] Downloaded temp file verification failed", { songId });
      const { deleteAsync } = await import("expo-file-system/legacy");
      await deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      await updateStatus(songId, "failed", {
        failureReason: "Downloaded file was empty or missing — stream URL may have expired",
        failedAt: new Date().toISOString(),
      });
      releaseSlot(songId);
      return;
    }

    // Optional background artwork download (non-blocking)
    if (item.coverUrl && item.coverUrl.startsWith("http")) {
      const artworkUri = getArtworkFileUri(songId);
      const { downloadAsync } = await import("expo-file-system/legacy");
      downloadAsync(item.coverUrl, artworkUri).catch(() => {});
    }

    const completedItem = await updateStatus(songId, "completed", {
      progress: 100,
      localPath: finalUri,
      totalBytes: result.headers?.["Content-Length"]
        ? parseInt(result.headers["Content-Length"], 10)
        : (result as any).totalBytesExpectedToWrite ?? 0,
      bytesDownloaded: (result as any).totalBytesWritten ?? 0,
      completedAt: new Date().toISOString(),
      failureReason: null,
      failedAt: null,
    });

    if (completedItem) emit("completed", songId, completedItem);
    releaseSlot(songId);

  } catch (err: any) {
    const wasCancelled =
      err?.code === "ERR_TASK_CANCELLED" ||
      err?.message?.includes("cancel") ||
      err?.message?.includes("cancelled");

    if (wasCancelled) {
      await updateStatus(songId, "paused");
      releaseSlot(songId);
      return;
    }

    logger.error("[DownloadQueue] download failed", { songId, error: err?.message });

    const current = await loadDownload(songId);
    const retryCount = (current?.retryCount ?? 0) + 1;
    const MAX_RETRIES = 3;

    releaseSlot(songId); // free the slot before retry delay

    if (retryCount <= MAX_RETRIES) {
      await updateStatus(songId, "queued", {
        retryCount,
        failureReason: err?.message ?? "Unknown error",
        failedAt: new Date().toISOString(),
      });
      // Delays for attempts 1, 2, 3 → 2s, 5s, 10s (exponential backoff).
      const delays = [2000, 5000, 10000];
      clearRetryTimer(songId);
      const retryTimer = setTimeout(async () => {
        retryTimers.delete(songId);
        const latest = await loadDownload(songId);
        if (!latest || latest.status !== "queued") return;
        // Re-add to pending queue for the next available slot
        if (!pendingQueue.includes(songId) && !activeHandles.has(songId)) {
          pendingQueue.push(songId);
          drainQueue();
        }
      }, delays[retryCount - 1] ?? 10000);
      retryTimers.set(songId, retryTimer);
    } else {
      const failedItem = await updateStatus(songId, "failed", {
        retryCount,
        failureReason: err?.message ?? "Download failed after retries",
        failedAt: new Date().toISOString(),
      });
      if (failedItem) emit("failed", songId, failedItem);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueDownload(
  item: DownloadItem,
  _prefs: DownloadPreferences
): Promise<void> {
  const songId = item.songId;
  clearRetryTimer(songId);

  // Idempotency: skip if already active or pending
  if (activeHandles.has(songId) || pendingQueue.includes(songId) || startingSet.has(songId)) {
    return;
  }

  await saveDownload({ ...item, status: "queued" });
  emit("status", songId, { ...item, status: "queued" });

  const hasSpace = await hasSufficientStorage();
  if (!hasSpace) {
    await updateStatus(songId, "paused", { failureReason: "Insufficient storage" });
    return;
  }

  if (activeCount() < MAX_CONCURRENT) {
    startingSet.add(songId);
    executeDownload(songId).catch(() => {}).finally(() => startingSet.delete(songId));
  } else {
    // Queue it — will start when a slot opens
    pendingQueue.push(songId);
    await updateStatus(songId, "queued");
  }
}

async function startDownload(songId: string): Promise<void> {
  clearRetryTimer(songId);
  if (activeHandles.has(songId) || startingSet.has(songId)) return;

  if (activeCount() < MAX_CONCURRENT) {
    startingSet.add(songId);
    executeDownload(songId).catch(() => {}).finally(() => startingSet.delete(songId));
  } else {
    if (!pendingQueue.includes(songId)) {
      pendingQueue.push(songId);
    }
    await updateStatus(songId, "queued");
  }
}

export async function pauseDownload(songId: string): Promise<void> {
  clearRetryTimer(songId);
  // Remove from pending queue if waiting
  const pendingIdx = pendingQueue.indexOf(songId);
  if (pendingIdx !== -1) pendingQueue.splice(pendingIdx, 1);

  const handle = activeHandles.get(songId);
  if (handle) {
    try { await handle.pauseAsync(); } catch { /* ignore */ }
    // releaseSlot called inside executeDownload catch block
  }
  await updateStatus(songId, "paused");
}

export async function resumeDownload(
  songId: string,
  _prefs: DownloadPreferences
): Promise<void> {
  const item = await loadDownload(songId);
  if (!item) return;
  clearRetryTimer(songId);
  if (item.status !== "paused" && item.status !== "queued" && item.status !== "failed") return;
  if (activeHandles.has(songId) || startingSet.has(songId)) return;

  const hasSpace = await hasSufficientStorage();
  if (!hasSpace) {
    await updateStatus(songId, "paused", { failureReason: "Insufficient storage" });
    return;
  }

  await startDownload(songId);
}

export async function cancelDownload(songId: string): Promise<void> {
  clearRetryTimer(songId);
  // Remove from pending queue
  const pendingIdx = pendingQueue.indexOf(songId);
  if (pendingIdx !== -1) pendingQueue.splice(pendingIdx, 1);

  const handle = activeHandles.get(songId);
  if (handle) {
    try { await handle.cancelAsync(); } catch { /* ignore */ }
    releaseSlot(songId);
  }
  await updateStatus(songId, "deleted");
}

export async function retryDownload(
  songId: string,
  prefs: DownloadPreferences
): Promise<void> {
  clearRetryTimer(songId);
  await updateStatus(songId, "queued", {
    retryCount: 0,
    failureReason: null,
    failedAt: null,
  });
  await resumeDownload(songId, prefs);
}

/** How many downloads are currently active (for debug/UI). */
function getActiveDownloadCount(): number {
  return activeHandles.size;
}

/** How many downloads are waiting for a slot (for debug/UI). */
function getPendingQueueLength(): number {
  return pendingQueue.length;
}
