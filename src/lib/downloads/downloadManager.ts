import { getAccountScope,isCurrentAccount } from "@/lib/accountScope";
/**
 * Download Manager — public API used by UI and playback.
 *
 * This is the single entry point for all download operations.
 * It enforces entitlement, device, territory, and storage rules before
 * delegating to the queue.
 */

import {
cancelDownload,
enqueueDownload,
onQueueEvent,
pauseDownload,
resumeDownload,
retryDownload,
} from "@/lib/downloads/downloadQueue";
import {
getDownloadSync,
loadAllDownloads,
loadDownload,
patchDownload,
removeDownload,
saveDownload,
} from "@/lib/downloads/downloadStore";
import {
getDownloadEntitlement,
getTrackRights,
isTerritoryAllowed,
} from "@/lib/downloads/entitlement";
import { deleteAllTrackFiles,deleteTrackFiles,getTrackFileSize,getValidatedTrackFileUri,hasSufficientStorage,trackFileExists } from "@/lib/downloads/filesystem";
import { issueOfflineLicense,refreshLicenses } from "@/lib/downloads/licenseSync";
import { logger } from "@/lib/logger";
import { type Song } from "@/lib/musicData";
import { type DownloadItem,type DownloadPreferences,type StorageSummary } from "@/types/downloads";

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
    const scope = getAccountScope();
    if (scope.accountId !== uid) return { ok: false, reason: "Account changed. Try again." };
    // 1. Check entitlement.
    const entitlement = await getDownloadEntitlement(uid);
    if (!entitlement.canDownload) {
      return { ok: false, reason: entitlement.blockedReason ?? "Downloads not available" };
    }

    // 2. Register device.
    // License issuance registers the device on the server.

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

    const license = await issueOfflineLicense(uid, song.id, prefs.quality);
    // 6. Build the download item.
    const item: DownloadItem = {
      accountId: uid,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album ?? "",
      coverUrl: song.coverUrl ?? "",
      audioUrl: song.audioUrl,
      duration: song.duration,
      quality: license.quality,
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
      licenseExpiresAt: license.expiresAt,
    };

    // 7. Persist and enqueue.
    if (!isCurrentAccount(scope)) return { ok: false, reason: "Account changed. Try again." };
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
): Promise<{ queued: number; skipped: number; failed: number; reason?: string }> {
  let queued = 0;
  let skipped = 0;
  let failed = 0;
  let reason: string | undefined;

  // License issuance updates the same device record for every song. Issuing
  // licenses concurrently makes Firestore transactions contend with each other.
  for (const song of songs) {
    const existing = getDownloadSync(song.id);
    if (existing?.status === "completed") {
      skipped++;
      continue;
    }

    const result = await downloadSong(song, uid, prefs, {
      collectionId,
      userCountry,
    });
    if (result.ok) {
      queued++;
    } else {
      failed++;
      reason ??= result.reason;
    }
  }

  return { queued, skipped, failed, reason };
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

    const expiry = item.licenseExpiresAt ? Date.parse(item.licenseExpiresAt) : NaN;
    if (!Number.isFinite(expiry) || Date.now() > expiry + 7 * 24 * 60 * 60 * 1000) return null;
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

export function getAllDownloads(): Promise<DownloadItem[]> {
  return loadAllDownloads();
}

export function getSongDownload(songId: string): Promise<DownloadItem | null> {
  return loadDownload(songId);
}

export async function isDownloaded(songId: string): Promise<boolean> {
  const item = await loadDownload(songId);
  if (item?.status !== "completed") return false;
  return trackFileExists(songId);
}
