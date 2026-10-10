import { getAccountScope,isCurrentAccount } from "@/lib/accountScope";
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

import { getMusicApiUrl } from "@/lib/api-config";
import { getAudioUrlByQuality } from "@/lib/downloads/audioQuality";
import {
loadAllDownloads,
loadDownload,
saveDownload,
updateDownloadMemory,
} from "@/lib/downloads/downloadStore";
import {
ensureDownloadsDirs,
getArtworkFileUri,
getTempDownloadUri,
hasSufficientStorage,
promoteTempToTrack,
} from "@/lib/downloads/filesystem";
import { logger } from "@/lib/logger";
import { getBestAudioUrlWithQuality } from "@/lib/musicData";
import { invalidateYouTubeStream, resolveYouTubeStream } from "@/services/youtube/YouTubeMusic";
import type { Song } from "@/lib/musicData";
import { type DownloadItem,type DownloadPreferences,type DownloadStatus } from "@/types/downloads";
import {
createDownloadResumable,
DownloadResumable,
} from "expo-file-system/legacy";
import * as Network from "expo-network";

// ─── Concurrency config ───────────────────────────────────────────────────────

const MAX_CONCURRENT = 2;
let suspended = false;
const runningTasks = new Set<Promise<void>>();

// ─── Event emitter ────────────────────────────────────────────────────────────

type QueueEventType = "progress" | "status" | "completed" | "failed";
type QueueListener = (songId: string, item: DownloadItem) => void;

const listeners = new Map<QueueEventType, Set<QueueListener>>();

export function onQueueEvent(event: QueueEventType, fn: QueueListener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

function emitQueueEvent(event: QueueEventType, songId: string, item: DownloadItem) {
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
const wifiOnlySongs = new Set<string>();
let networkListener: { remove: () => void } | null = null;
const PROGRESS_PERSIST_INTERVAL_MS = 1500;

// ─── Slot management ──────────────────────────────────────────────────────────

function activeCount(): number {
  return new Set([...activeHandles.keys(), ...startingSet]).size;
}

function launchDownload(songId: string): void {
  startingSet.add(songId);
  const task = executeDownload(songId).catch((error) => {
    logger.error("[DownloadQueue] Could not start download", { songId, error });
  }).finally(() => {
    runningTasks.delete(task);
    releaseSlot(songId);
  });
  runningTasks.add(task);
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

function hasWifi(type?: Network.NetworkStateType): boolean {
  return type === Network.NetworkStateType.WIFI || type === Network.NetworkStateType.ETHERNET;
}

function watchWifi(): void {
  if (networkListener) return;
  networkListener = Network.addNetworkStateListener(({ type }) => {
    for (const songId of wifiOnlySongs) {
      void loadDownload(songId).then(async (item) => {
        if (!item || item.status === "completed" || item.status === "deleted") {
          wifiOnlySongs.delete(songId);
          return;
        }
        if (hasWifi(type)) {
          if (item.status === "waiting_for_wifi") void startDownload(songId);
        } else if (item.status === "downloading" || item.status === "queued") {
          await pauseDownload(songId);
          await updateStatus(songId, "waiting_for_wifi");
        }
      });
    }
  });
}

/** Start the next pending song if a slot is free. */
function drainQueue() {
  if (suspended) return;
  while (activeCount() < MAX_CONCURRENT && pendingQueue.length > 0) {
    const next = pendingQueue.shift()!;
    // Fire and forget — errors are handled inside executeDownload
    launchDownload(next);
  }
}

// ─── Status helper ────────────────────────────────────────────────────────────

async function updateStatus(
  songId: string,
  status: DownloadStatus,
  extra?: Partial<DownloadItem>,
  expectedStatus?: DownloadStatus
): Promise<DownloadItem | null> {
  const item = await loadDownload(songId);
  if (!item || (expectedStatus && (suspended || item.status !== expectedStatus))) return null;
  const updated: DownloadItem = { ...item, status, ...extra };
  await saveDownload(updated);
  emitQueueEvent("status", songId, updated);
  return updated;
}

// ─── URL refresh ─────────────────────────────────────────────────────────────

/**
 * Resolve short-lived source URLs only when a queue slot is ready. YouTube
 * uses its durable video ID; JioSaavn refreshes through its catalog API.
 */
async function resolveDownloadSource(item: DownloadItem): Promise<{ url: string; headers?: Record<string, string>; audioBitrate?: number; audioCodec?: string }> {
  const { songId, audioUrl: originalUrl, quality } = item;
  if (songId.startsWith("youtube_") || item.youtubeVideoId) {
    const videoId = item.youtubeVideoId || songId.replace(/^youtube_/, "");
    if (!/^[\w-]{11}$/.test(videoId)) throw new Error("This Mavrixfy Music download has an invalid track ID.");
    const song: Song = {
      id: `youtube_${videoId}`, youtubeVideoId: videoId, videoId, source: "youtube",
      title: item.title, artist: item.artist, album: item.album, duration: item.duration,
      coverUrl: item.coverUrl, genre: "", audioUrl: "",
    };
    const stream = await resolveYouTubeStream(song, quality);
    if (!stream.url.startsWith("https://") || stream.expiresAt <= Date.now() + 30_000) {
      throw new Error("The Mavrixfy Music download link expired. Please retry the download.");
    }
    return { url: stream.url, headers: stream.headers, audioBitrate: stream.bitrate, audioCodec: stream.codec };
  }

  // JioSaavn and other direct audio sources retain their own URL handling.
  if (!songId || originalUrl.includes("cloudinary")) {
    return { url: getAudioUrlByQuality(originalUrl, quality) };
  }

  try {
    const apiBase = getMusicApiUrl().replace(/\/$/, "");
    const url = `${apiBase}/api/songs?id=${encodeURIComponent(songId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
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
          return { url: resolved };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    logger.warn("[DownloadQueue] URL refresh failed, using original", { songId, error: err?.message });
  }

  return { url: getAudioUrlByQuality(originalUrl, quality) };
}

// ─── Core download execution ──────────────────────────────────────────────────

async function executeDownload(songId: string): Promise<void> {
  // Double-check guard — prevents re-entry if somehow called twice
  if (suspended || activeHandles.has(songId)) return;

  const item = await loadDownload(songId);
  if (!item) return;

  if (wifiOnlySongs.has(songId) && !hasWifi((await Network.getNetworkStateAsync()).type)) {
    await updateStatus(songId, "waiting_for_wifi");
    return;
  }

  // If it was cancelled while waiting in the pending queue, skip it
  if (item.status === "deleted" || item.status === "completed") return;

  const tempUri = getTempDownloadUri(songId, item.accountId);

  try {
    // Preparation must be inside the failure handler. An API or filesystem
    // error here previously left the item stuck in "downloading" forever.
    const [, , source] = await Promise.all([
      ensureDownloadsDirs(item.accountId),
      updateStatus(songId, "downloading"),
      resolveDownloadSource(item),
    ]);
    const { url: audioUrl, headers } = source;
    if (suspended || (await loadDownload(songId))?.status !== "downloading") return;
    if (!/^https?:\/\//i.test(audioUrl)) throw new Error("No playable audio URL is available for this song.");

    // The native downloader follows GET redirects. A separate HEAD request can
    // be rejected by CDNs and can consume a short-lived signed URL.
    const handle = createDownloadResumable(
      audioUrl,
      tempUri,
      { headers },
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
        emitQueueEvent("progress", songId, patched);

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
    const result = await handle.downloadAsync();

    if (!result) {
      // Paused / cancelled by user
      if ((await loadDownload(songId))?.status === "downloading") {
        await updateStatus(songId, "paused");
      }
      return;
    }

    if ((await loadDownload(songId))?.status !== "downloading") {
      const { deleteAsync } = await import("expo-file-system/legacy");
      await deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      return;
    }

    const contentType = result.headers?.["Content-Type"] || result.headers?.["content-type"] || "";
    if (result.status < 200 || result.status >= 300 || /^(text\/|application\/(json|xml))/i.test(contentType)) {
      throw new Error(`Audio download returned HTTP ${result.status}${contentType ? ` (${contentType})` : ""}`);
    }

    // Determine canonical extension: JioSaavn CDN & MP4 containers must be .m4a so
    // react-native-audio-api correctly selects the FFmpeg decoder instead of failing MiniAudio.
    let ext = "m4a";
    const cleanUrl = audioUrl.split("?")[0].toLowerCase();
    if (cleanUrl.endsWith(".mp3") || contentType.includes("audio/mpeg") || contentType.includes("audio/mp3")) {
      ext = "mp3";
    } else if (cleanUrl.endsWith(".aac") || contentType.includes("audio/aac")) {
      ext = "aac";
    } else if (cleanUrl.endsWith(".flac")) {
      ext = "flac";
    } else if (cleanUrl.endsWith(".wav")) {
      ext = "wav";
    } else {
      ext = "m4a";
    }

    // Atomically promote verified temp file to final permanent track location
    const finalUri = await promoteTempToTrack(songId, ext, item.accountId);
    // Promotion performs filesystem I/O. Pause/delete may have won while it was
    // pending, and the promoted file must not revive that abandoned transfer.
    if (suspended || (await loadDownload(songId))?.status !== "downloading") {
      if (finalUri) {
        const { deleteAsync } = await import("expo-file-system/legacy");
        await deleteAsync(finalUri, { idempotent: true }).catch(() => {});
      }
      return;
    }
    if (!finalUri) {
      logger.warn("[DownloadQueue] Downloaded temp file verification failed", { songId });
      const { deleteAsync } = await import("expo-file-system/legacy");
      await deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      await updateStatus(songId, "failed", {
        failureReason: "Downloaded file was empty or missing — stream URL may have expired",
        failedAt: new Date().toISOString(),
      }, "downloading");
      return;
    }

    const completedItem = await updateStatus(songId, "completed", {
      audioBitrate: source.audioBitrate,
      audioCodec: source.audioCodec,
      progress: 100,
      localPath: finalUri,
      totalBytes: result.headers?.["Content-Length"]
        ? parseInt(result.headers["Content-Length"], 10)
        : (result as any).totalBytesExpectedToWrite ?? 0,
      bytesDownloaded: (result as any).totalBytesWritten ?? 0,
      completedAt: new Date().toISOString(),
      failureReason: null,
      failedAt: null,
    }, "downloading");

    if (completedItem) emitQueueEvent("completed", songId, completedItem);
    else {
      const { deleteAsync } = await import("expo-file-system/legacy");
      await deleteAsync(finalUri, { idempotent: true }).catch(() => {});
    }

    // Optional artwork starts after the guarded commit and cannot delay it.
    if (completedItem && item.coverUrl?.startsWith("http")) {
      const artworkUri = getArtworkFileUri(songId, item.accountId);
      void import("expo-file-system/legacy")
        .then(({ downloadAsync }) => downloadAsync(item.coverUrl, artworkUri))
        .catch(() => {});
    }

  } catch (err: any) {
    const { deleteAsync } = await import("expo-file-system/legacy");
    await deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    const wasCancelled =
      err?.code === "ERR_TASK_CANCELLED" ||
      err?.message?.includes("cancel") ||
      err?.message?.includes("cancelled");

    if (wasCancelled) {
      if ((await loadDownload(songId))?.status === "downloading") {
        await updateStatus(songId, "paused");
      }
      return;
    }

    const current = await loadDownload(songId);
    // A late transport failure cannot undo a user pause/delete or account teardown.
    if (suspended || !current || current.status !== "downloading") return;

    logger.error("[DownloadQueue] download failed", { songId, error: err?.message });

    if (songId.startsWith("youtube_") || item.youtubeVideoId) {
      const videoId = item.youtubeVideoId || songId.replace(/^youtube_/, "");
      if (/^[\w-]{11}$/.test(videoId)) {
        invalidateYouTubeStream({ id: `youtube_${videoId}` });
      }
    }

    const retryCount = (current?.retryCount ?? 0) + 1;
    const MAX_RETRIES = 3;

    if (!suspended && retryCount <= MAX_RETRIES) {
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
      if (failedItem) emitQueueEvent("failed", songId, failedItem);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueDownload(
  item: DownloadItem,
  prefs: DownloadPreferences
): Promise<void> {
  const scope = getAccountScope();
  if (suspended || (item.accountId && item.accountId !== scope.accountId)) return;
  const songId = item.songId;
  clearRetryTimer(songId);

  // Idempotency: skip if already active or pending
  if (activeHandles.has(songId) || pendingQueue.includes(songId) || startingSet.has(songId)) {
    return;
  }

  startingSet.add(songId);
  if (prefs.wifiOnly) {
    wifiOnlySongs.add(songId);
    watchWifi();
  } else {
    wifiOnlySongs.delete(songId);
  }
  const [, hasSpace] = await Promise.all([
    saveDownload({ ...item, status: "queued" }),
    hasSufficientStorage(),
  ]);
  emitQueueEvent("status", songId, { ...item, status: "queued" });
  if (!hasSpace) {
    await updateStatus(songId, "paused", { failureReason: "Insufficient storage" });
    startingSet.delete(songId);
    return;
  }

  if (prefs.wifiOnly && !hasWifi((await Network.getNetworkStateAsync()).type)) {
    await updateStatus(songId, "waiting_for_wifi");
    startingSet.delete(songId);
    return;
  }

  if (suspended || !isCurrentAccount(scope)) { startingSet.delete(songId); return; }
  if (activeCount() <= MAX_CONCURRENT) {
    launchDownload(songId);
  } else {
    // Queue it — will start when a slot opens
    startingSet.delete(songId);
    pendingQueue.push(songId);
    await updateStatus(songId, "queued");
  }
}

async function startDownload(songId: string): Promise<void> {
  clearRetryTimer(songId);
  if (suspended || activeHandles.has(songId) || startingSet.has(songId)) return;

  if (activeCount() < MAX_CONCURRENT) {
    launchDownload(songId);
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
  await updateStatus(songId, "paused");
  if (handle) {
    try { await handle.pauseAsync(); } catch { /* ignore */ }
  }
}

export async function resumeDownload(
  songId: string,
  prefs: DownloadPreferences
): Promise<void> {
  const item = await loadDownload(songId);
  if (!item) return;
  clearRetryTimer(songId);
  if (item.status !== "paused" && item.status !== "queued" && item.status !== "failed" && item.status !== "waiting_for_wifi") return;
  if (activeHandles.has(songId) || startingSet.has(songId)) return;

  const hasSpace = await hasSufficientStorage();
  if (!hasSpace) {
    void updateStatus(songId, "paused", { failureReason: "Insufficient storage" });
    return;
  }

  if (prefs.wifiOnly) {
    wifiOnlySongs.add(songId);
    watchWifi();
    if (!hasWifi((await Network.getNetworkStateAsync()).type)) {
      await updateStatus(songId, "waiting_for_wifi");
      return;
    }
  } else {
    wifiOnlySongs.delete(songId);
  }

  return startDownload(songId);
}

/** Restart transfers interrupted when the app process was closed. */
export async function restoreInterruptedDownloads(prefs: DownloadPreferences): Promise<void> {
  const scope = getAccountScope();
  const items = await loadAllDownloads();
  const eligibleItems = items.filter(
    (item) => item.status === "downloading" || item.status === "queued" || item.status === "waiting_for_wifi"
  );
  await Promise.all(
    eligibleItems.map(async (item) => {
      if (suspended || !isCurrentAccount(scope)) return;
      if (item.status === "downloading") {
        await updateStatus(item.songId, "queued");
      }
      await resumeDownload(item.songId, prefs);
    })
  );
}

export async function cancelDownload(songId: string): Promise<void> {
  wifiOnlySongs.delete(songId);
  clearRetryTimer(songId);
  // Remove from pending queue
  const pendingIdx = pendingQueue.indexOf(songId);
  if (pendingIdx !== -1) pendingQueue.splice(pendingIdx, 1);

  const handle = activeHandles.get(songId);
  await updateStatus(songId, "deleted");
  if (handle) {
    try { await handle.cancelAsync(); } catch { /* ignore */ }
  }
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
  return resumeDownload(songId, prefs);
}

export async function suspendDownloadQueue(): Promise<void> {
  suspended = true;
  pendingQueue.length = 0;
  wifiOnlySongs.clear();
  networkListener?.remove();
  networkListener = null;
  for (const songId of retryTimers.keys()) clearRetryTimer(songId);
  await Promise.allSettled([
    ...Array.from(activeHandles.values(), (handle) => handle.cancelAsync()),
    ...runningTasks,
  ]);
  activeHandles.clear();
  startingSet.clear();
}
export function resumeDownloadQueue(): void { suspended = false; }
