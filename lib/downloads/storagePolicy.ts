/**
 * Storage Policy — file paths, directory management, storage checks.
 *
 * Uses expo-file-system LEGACY API (expo-file-system/legacy) which is stable,
 * proven with TrackPlayer, and supports progress callbacks.
 *
 * Files are stored as .mp3 so TrackPlayer can play them without extension issues.
 */

import { Platform } from "react-native";
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  getFreeDiskStorageAsync,
} from "expo-file-system/legacy";
import { MIN_FREE_STORAGE_BYTES } from "@/types/downloads";
import { logger } from "@/lib/logger";
// ─── Paths ────────────────────────────────────────────────────────────────────

/** Root directory URI for all downloaded track files. Always ends with /. */
function getDownloadsRootUri(): string {
  const base = documentDirectory ?? "";
  return `${base}mavrixfy_downloads/`;
}

/** Directory URI for a specific track. */
function getTrackDirUri(songId: string): string {
  return `${getDownloadsRootUri()}tracks/${songId}/`;
}

/**
 * Full file URI for a downloaded track.
 * Uses .mp3 extension so TrackPlayer plays it without issues on all platforms.
 */
export function getTrackFileUri(songId: string): string {
  return `${getTrackDirUri(songId)}track.mp3`;
}

// ─── Directory setup ──────────────────────────────────────────────────────────

/** Ensure the downloads root directory exists. */
async function ensureDownloadsDir(): Promise<void> {
  try {
    const root = getDownloadsRootUri();
    const info = await getInfoAsync(root);
    if (!info.exists) {
      await makeDirectoryAsync(root, { intermediates: true });
    }
    // Exclude from iCloud backup on iOS — downloaded audio files can be large
    // and should not be backed up. iOS will re-download them if needed.
    if (Platform.OS === "ios") {
      try {
        // expo-file-system doesn't expose setExcludedFromBackup directly,
        // but we can use the native module if available.
        const ExpoFS = require("expo-file-system/legacy");
        if (typeof ExpoFS.setExcludedFromBackupAsync === "function") {
          await ExpoFS.setExcludedFromBackupAsync(root, true);
        }
      } catch {
        // Not critical — just means files may be backed up to iCloud
      }
    }
  } catch (err) {
    logger.error("[StoragePolicy] ensureDownloadsDir failed", err);
  }
}

/** Ensure the directory for a specific track exists. */
export async function ensureTrackDir(songId: string): Promise<void> {
  try {
    const dir = getTrackDirUri(songId);
    const info = await getInfoAsync(dir);
    if (!info.exists) {
      await makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch (err) {
    logger.error("[StoragePolicy] ensureTrackDir failed", err);
  }
}

// ─── Storage checks ───────────────────────────────────────────────────────────

/** Returns true if there is enough free space to start a new download. */
export async function hasSufficientStorage(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  try {
    const free = await getFreeDiskStorageAsync();
    return free > MIN_FREE_STORAGE_BYTES;
  } catch {
    return true;
  }
}

/** Returns free disk space in bytes, or -1 if unavailable. */
async function getFreeDiskSpace(): Promise<number> {
  if (Platform.OS === "web") return -1;
  try {
    return await getFreeDiskStorageAsync();
  } catch {
    return -1;
  }
}

// ─── File operations ──────────────────────────────────────────────────────────

/** Delete the local file(s) for a track. */
export async function deleteTrackFiles(songId: string): Promise<void> {
  try {
    const dir = getTrackDirUri(songId);
    const info = await getInfoAsync(dir);
    if (info.exists) {
      await deleteAsync(dir, { idempotent: true });
    }
  } catch (err) {
    logger.error("[StoragePolicy] deleteTrackFiles failed", err);
  }
}

/** Delete all downloaded track files. */
export async function deleteAllTrackFiles(): Promise<void> {
  try {
    const root = getDownloadsRootUri();
    const info = await getInfoAsync(root);
    if (info.exists) {
      await deleteAsync(root, { idempotent: true });
    }
  } catch (err) {
    logger.error("[StoragePolicy] deleteAllTrackFiles failed", err);
  }
}

/** Check whether the local file for a track exists. */
export async function trackFileExists(songId: string): Promise<boolean> {
  try {
    const info = await getInfoAsync(getTrackFileUri(songId));
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

/** Get the size of a track's local file in bytes, or 0 if not found. */
export async function getTrackFileSize(songId: string): Promise<number> {
  try {
    const info = await getInfoAsync(getTrackFileUri(songId));
    if (!info.exists) return 0;
    return (info as any).size ?? 0;
  } catch {
    return 0;
  }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format bytes into a human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
