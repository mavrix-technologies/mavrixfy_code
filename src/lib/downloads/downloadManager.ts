/**
 * Download Manager — public API used by UI and playback.
 *
 * This is the single entry point for all download operations.
 * It enforces entitlement, device, territory, and storage rules before
 * delegating to the queue.
 */

import { type Song } from "@/lib/musicData";
import { type DownloadItem, type DownloadPreferences, type StorageSummary } from "@/types/downloads";
import {
  loadAllDownloads,
  loadDownload,
  saveDownload,
  removeDownload,
  patchDownload,
} from "@/lib/downloads/downloadStore";
import {
  enqueueDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  onQueueEvent,
} from "@/lib/downloads/downloadQueue";
import {
  getDownloadEntitlement,
  getTrackRights,
  isTerritoryAllowed,
} from "@/lib/downloads/entitlement";
import {
  registerDevice,
  writeLicenseCompleted,
  writeLicenseFailed,
  refreshLicenses,
} from "@/lib/downloads/licenseSync";
import { deleteTrackFiles, deleteAllTrackFiles, trackFileExists, getTrackFileSize, type getTrackFileUri, getValidatedTrackFileUri, hasSufficientStorage } from "@/lib/downloads/filesystem";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DownloadResult =
  | { ok: true }
  | { ok: false; reason: string };

// ─── Re-export event subscription ────────────────────────────────────────────

export { onQueueEvent };

// ─── Download a song ─────────────────────────────────────────────────────────

/**
 * Queue a song for download.
 *
 * Enforces:
 * - Entitlement (premium required)
 * - Device registration
 * - Track rights (offlineAllowed, territory)
 * - Storage safety
 * - Duplicate detection (idempotent)
 */
export async function downloadSong(
  song: Song,
  uid: string,
  prefs: DownloadPreferences,
  options?: {
    collectionId?: string;
    userCountry?: string | null;
  }
): Promise<DownloadResult> {
  try {
    // 1. Check entitlement.
    const entitlement = await getDownloadEntitlement(uid);
    if (!entitlement.canDownload) {
      return { ok: false, reason: entitlement.blockedReason ?? "Downloads not available" };
    }

    // 2. Register device.
    await registerDevice(uid);

    // 3. Storage safety check.
    const storageOk = await hasSufficientStorage();
    if (!storageOk) {
      return {
        ok: false,
        reason: "Low device storage. Free up space to continue downloading.",
      };
    }

    // 4. Track rights check.
    const rights = await getTrackRights(song.id);
    if (!rights.offlineAllowed) {
      return { ok: false, reason: "This track is not available for offline download." };
    }
    if (!isTerritoryAllowed(rights.territoryRights, options?.userCountry ?? null)) {
      return { ok: false, reason: "This track is not available in your region." };
    }

    // 5. Idempotency — if already downloaded or in progress, return ok.
    const existing = await loadDownload(song.id);
    if (existing) {
      if (existing.status === "completed") {
        return { ok: true };
      }
      if (
        existing.status === "downloading" ||
        existing.status === "queued" ||
        existing.status === "waiting_for_wifi" ||
        existing.status === "waiting_for_charging"
      ) {
        return { ok: true };
      }
    }

    // 6. Build the download item.
    const item: DownloadItem = {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album ?? "",
      coverUrl: song.coverUrl ?? "",
      audioUrl: song.audioUrl,
      duration: song.duration,
      quality: prefs.quality,
      status: "queued",
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      localPath: null,
      collectionRefs: options?.collectionId ? [options.collectionId] : [],
      retryCount: 0,
      queuedAt: new Date().toISOString(),
      completedAt: null,
      failedAt: null,
      failureReason: null,
      licenseExpiresAt: null,
    };

    // 7. Persist and enqueue.
    await saveDownload(item);
    await enqueueDownload(item, prefs);

    return { ok: true };
  } catch (err: any) {
    logger.error("[DownloadManager] downloadSong failed", err);
    return { ok: false, reason: err?.message ?? "Download failed unexpectedly" };
  }
}

// ─── Download a collection (album / playlist) ────────────────────────────────

export async function downloadCollection(
  songs: Song[],
  collectionId: string,
  uid: string,
  prefs: DownloadPreferences,
  userCountry?: string | null
): Promise<{ queued: number; skipped: number; failed: number }> {
  const results = await Promise.all(
    songs.map(async (song) => {
      const existing = await loadDownload(song.id);
      if (existing?.status === "completed") {
        return "skipped" as const;
      }

      const res = await downloadSong(song, uid, prefs, {
        collectionId,
        userCountry,
      });

      return res.ok ? ("queued" as const) : ("failed" as const);
    })
  );

  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const result of results) {
    if (result === "queued") {
      queued++;
    } else if (result === "skipped") {
      skipped++;
    } else {
      failed++;
    }
  }

  return { queued, skipped, failed };
}

// ─── Playback URL resolution ─────────────────────────────────────────────────

/**
 * Returns the local file URI for a song if it is fully downloaded and the
 * file physically exists and is non-empty on disk. Returns null otherwise.
 */
export async function getLocalPlaybackUrl(songId: string): Promise<string | null> {
  try {
    const item = await loadDownload(songId);
    if (!item || item.status !== "completed") return null;

    return getValidatedTrackFileUri(songId);
  } catch {
    return null;
  }
}

// ─── Queue management ─────────────────────────────────────────────────────────

export async function pauseSongDownload(songId: string): Promise<void> {
  await pauseDownload(songId);
}

export async function resumeSongDownload(
  songId: string,
  prefs: DownloadPreferences
): Promise<void> {
  await resumeDownload(songId, prefs);
}

export async function retrySongDownload(
  songId: string,
  prefs: DownloadPreferences
): Promise<void> {
  await retryDownload(songId, prefs);
}

/**
 * Remove a song download and delete its local audio and artwork files.
 */
export async function removeSongDownload(songId: string): Promise<void> {
  try {
    await Promise.all([
      cancelDownload(songId),
      deleteTrackFiles(songId),
      removeDownload(songId),
    ]);
  } catch (err) {
    logger.error("[DownloadManager] removeSongDownload failed", err);
  }
}

/** Remove all downloaded songs and delete all track files. */
export async function removeAllDownloads(): Promise<void> {
  try {
    const all = await loadAllDownloads();
    await Promise.all(all.map((item) => cancelDownload(item.songId)));
    await deleteAllTrackFiles();
    await Promise.all(all.map((item) => removeDownload(item.songId)));
  } catch (err) {
    logger.error("[DownloadManager] removeAllDownloads failed", err);
  }
}

// ─── License sync ────────────────────────────────────────────────────────────

/**
 * Sync licenses with Firestore. Revokes local playback for any tracks whose
 * licenses have expired or been revoked server-side.
 */
export async function syncLicenses(uid: string): Promise<void> {
  try {
    const revokedIds = await refreshLicenses(uid);

    await Promise.all(
      [...revokedIds].map((songId) =>
        patchDownload(songId, {
          status: "revoked",
          licenseExpiresAt: null,
        })
      )
    );
  } catch (err) {
    logger.error("[DownloadManager] syncLicenses failed", err);
  }
}

/** Write a completed license event after a successful download. */
export async function onDownloadCompleted(
  uid: string,
  songId: string,
  rightsVersion: number
): Promise<void> {
  await writeLicenseCompleted(uid, songId, rightsVersion);
}

/** Write a failed license event after a download failure. */
export async function onDownloadFailed(
  uid: string,
  songId: string,
  failureCode: string
): Promise<void> {
  await writeLicenseFailed(uid, songId, failureCode);
}

// ─── Storage summary ──────────────────────────────────────────────────────────

export async function getStorageSummary(): Promise<StorageSummary> {
  try {
    const all = await loadAllDownloads();
    let totalBytes = 0;
    let completed = 0;
    let pending = 0;
    let failed = 0;

    const completedSizes = await Promise.all(
      all.map(async (item) => {
        if (item.status === "completed") {
          return { status: "completed" as const, size: await getTrackFileSize(item.songId) };
        }
        if (
          item.status === "queued" ||
          item.status === "downloading" ||
          item.status === "paused" ||
          item.status === "waiting_for_wifi" ||
          item.status === "waiting_for_charging"
        ) {
          return { status: "pending" as const, size: 0 };
        }
        if (item.status === "failed") {
          return { status: "failed" as const, size: 0 };
        }
        return { status: "other" as const, size: 0 };
      })
    );

    for (const item of completedSizes) {
      if (item.status === "completed") {
        completed++;
        totalBytes += item.size;
      } else if (item.status === "pending") {
        pending++;
      } else if (item.status === "failed") {
        failed++;
      }
    }

    return {
      totalDownloadedBytes: totalBytes,
      totalDownloadedTracks: completed + pending + failed,
      completedTracks: completed,
      pendingTracks: pending,
      failedTracks: failed,
    };
  } catch {
    return {
      totalDownloadedBytes: 0,
      totalDownloadedTracks: 0,
      completedTracks: 0,
      pendingTracks: 0,
      failedTracks: 0,
    };
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getAllDownloads(): Promise<DownloadItem[]> {
  return loadAllDownloads();
}

export async function getSongDownload(songId: string): Promise<DownloadItem | null> {
  return loadDownload(songId);
}

export async function isDownloaded(songId: string): Promise<boolean> {
  const item = await loadDownload(songId);
  if (item?.status !== "completed") return false;
  return trackFileExists(songId);
}
