/**
 * Filesystem — Canonical paths, directory setup, and file operations for offline downloads.
 *
 * Persistent directory layout:
 *   <documentDirectory>/mavrixfy_downloads/
 *     ├── tracks/
 *     │   └── <songId>/
 *     │       ├── track.mp3
 *     │       └── artwork.jpg
 *     └── temp/
 *         └── <songId>.download
 */

import { Platform } from "react-native";
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  moveAsync,
  getFreeDiskStorageAsync,
} from "expo-file-system/legacy";
import { MIN_FREE_STORAGE_BYTES } from "@/types/downloads";
import { logger } from "@/lib/logger";

// ─── Canonical Paths ──────────────────────────────────────────────────────────

/** Root directory URI for all offline downloads (in persistent app storage). */
export function getDownloadsRootUri(): string {
  const base = documentDirectory ?? "";
  return `${base}mavrixfy_downloads/`;
}

export function getTracksRootUri(): string {
  return `${getDownloadsRootUri()}tracks/`;
}

export function getTempRootUri(): string {
  return `${getDownloadsRootUri()}temp/`;
}

export function getTrackDirUri(songId: string): string {
  return `${getTracksRootUri()}${songId}/`;
}

/** Full file URI for a permanent downloaded track. */
export function getTrackFileUri(songId: string): string {
  return `${getTrackDirUri(songId)}track.mp3`;
}

/** In-flight temporary download file URI. */
export function getTempDownloadUri(songId: string): string {
  return `${getTempRootUri()}${songId}.download`;
}

/** Full file URI for offline artwork. */
export function getArtworkFileUri(songId: string): string {
  return `${getTrackDirUri(songId)}artwork.jpg`;
}

// ─── Directory Management ────────────────────────────────────────────────────

/** Ensure the downloads and temp directories exist in persistent storage. */
export async function ensureDownloadsDirs(): Promise<void> {
  try {
    const root = getDownloadsRootUri();
    const tracks = getTracksRootUri();
    const temp = getTempRootUri();

    const [rootInfo, tracksInfo, tempInfo] = await Promise.all([
      getInfoAsync(root),
      getInfoAsync(tracks),
      getInfoAsync(temp),
    ]);

    if (!rootInfo.exists) {
      await makeDirectoryAsync(root, { intermediates: true });
    }
    if (!tracksInfo.exists) {
      await makeDirectoryAsync(tracks, { intermediates: true });
    }
    if (!tempInfo.exists) {
      await makeDirectoryAsync(temp, { intermediates: true });
    }

    if (Platform.OS === "ios") {
      try {
        const ExpoFS = require("expo-file-system/legacy");
        if (typeof ExpoFS.setExcludedFromBackupAsync === "function") {
          await ExpoFS.setExcludedFromBackupAsync(root, true);
        }
      } catch {
        // Fall through
      }
    }
  } catch (err) {
    logger.error("[Filesystem] ensureDownloadsDirs failed", err);
  }
}

/** Ensure directory for a specific track exists. */
export async function ensureTrackDir(songId: string): Promise<void> {
  try {
    const dir = getTrackDirUri(songId);
    const info = await getInfoAsync(dir);
    if (!info.exists) {
      await makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch (err) {
    logger.error("[Filesystem] ensureTrackDir failed", err);
  }
}

// ─── Storage Checks ──────────────────────────────────────────────────────────

/** Returns true if there is enough free disk space to start a download. */
export async function hasSufficientStorage(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  try {
    const free = await getFreeDiskStorageAsync();
    return free > MIN_FREE_STORAGE_BYTES;
  } catch {
    return true;
  }
}

// ─── File Validation & Operations ────────────────────────────────────────────

/**
 * Returns the local audio file URI if the file physically exists and is non-empty.
 * Otherwise returns null.
 */
export async function getValidatedTrackFileUri(songId: string): Promise<string | null> {
  try {
    const uri = getTrackFileUri(songId);
    const info = await getInfoAsync(uri);
    if (info.exists && !info.isDirectory && ((info as any).size ?? 0) > 1024) {
      return uri.startsWith("file://") ? uri : `file://${uri}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Check whether a valid non-empty audio file exists for the song. */
export async function trackFileExists(songId: string): Promise<boolean> {
  const uri = await getValidatedTrackFileUri(songId);
  return Boolean(uri);
}

/** Get the byte size of a track file, or 0 if missing. */
export async function getTrackFileSize(songId: string): Promise<number> {
  try {
    const info = await getInfoAsync(getTrackFileUri(songId));
    if (!info.exists) return 0;
    return (info as any).size ?? 0;
  } catch {
    return 0;
  }
}

/** Atomically moves completed temp file into final track location. */
export async function promoteTempToTrack(songId: string): Promise<boolean> {
  try {
    const tempUri = getTempDownloadUri(songId);
    const destUri = getTrackFileUri(songId);

    const tempInfo = await getInfoAsync(tempUri);
    if (!tempInfo.exists || ((tempInfo as any).size ?? 0) < 1024) {
      return false;
    }

    await ensureTrackDir(songId);
    await moveAsync({ from: tempUri, to: destUri });
    return true;
  } catch (err) {
    logger.error("[Filesystem] promoteTempToTrack failed", err);
    return false;
  }
}

/** Delete track audio & artwork files. */
export async function deleteTrackFiles(songId: string): Promise<void> {
  try {
    const dir = getTrackDirUri(songId);
    const temp = getTempDownloadUri(songId);
    await Promise.all([
      deleteAsync(dir, { idempotent: true }).catch(() => {}),
      deleteAsync(temp, { idempotent: true }).catch(() => {}),
    ]);
  } catch (err) {
    logger.error("[Filesystem] deleteTrackFiles failed", err);
  }
}

/** Delete all downloaded tracks and temp files. */
export async function deleteAllTrackFiles(): Promise<void> {
  try {
    const root = getDownloadsRootUri();
    await deleteAsync(root, { idempotent: true }).catch(() => {});
    await ensureDownloadsDirs();
  } catch (err) {
    logger.error("[Filesystem] deleteAllTrackFiles failed", err);
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
