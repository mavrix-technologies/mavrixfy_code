import { getAccountScope } from "@/lib/accountScope";
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

import { logger } from "@/lib/logger";
import { MIN_FREE_STORAGE_BYTES } from "@/types/downloads";
import {
  deleteAsync,
  documentDirectory,
  getFreeDiskStorageAsync,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  readAsStringAsync,
} from "expo-file-system/legacy";
import { Platform } from "react-native";

// ─── Canonical Paths ──────────────────────────────────────────────────────────

/** Root directory URI for all offline downloads (in persistent app storage). */
export function getDownloadsRootUri(uid?: string | null): string {
  const accountId = uid !== undefined ? uid : getAccountScope().accountId;
  const base = documentDirectory ?? "";
  return `${base}mavrixfy_downloads/accounts/${encodeURIComponent(accountId ?? "guest")}/`;
}

export function getTracksRootUri(uid?: string | null): string {
  return `${getDownloadsRootUri(uid)}tracks/`;
}

export function getTempRootUri(uid?: string | null): string {
  return `${getDownloadsRootUri(uid)}temp/`;
}

export function getTrackDirUri(songId: string, uid?: string | null): string {
  return `${getTracksRootUri(uid)}${encodeURIComponent(songId)}/`;
}

/** Full file URI for a permanent downloaded track. Default extension is m4a (AAC in MP4). */
export function getTrackFileUri(songId: string, ext = "m4a", uid?: string | null): string {
  const cleanExt = (ext || "m4a").replace(/^\./, "");
  return `${getTrackDirUri(songId, uid)}track.${cleanExt}`;
}

/** In-flight temporary download file URI. */
export function getTempDownloadUri(songId: string, uid?: string | null): string {
  return `${getTempRootUri(uid)}${encodeURIComponent(songId)}.download`;
}

/** Full file URI for offline artwork. */
export function getArtworkFileUri(songId: string, uid?: string | null): string {
  return `${getTrackDirUri(songId, uid)}artwork.jpg`;
}

// ─── Directory Management ────────────────────────────────────────────────────

/** Ensure the downloads and temp directories exist in persistent storage. */
export async function ensureDownloadsDirs(uid?: string | null): Promise<void> {
  try {
    const root = getDownloadsRootUri(uid);
    const tracks = getTracksRootUri(uid);
    const temp = getTempRootUri(uid);

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
export async function ensureTrackDir(songId: string, uid?: string | null): Promise<void> {
  try {
    const dir = getTrackDirUri(songId, uid);
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

const CANDIDATE_AUDIO_EXTENSIONS = ["m4a", "mp4", "mp3", "aac", "wav", "flac"] as const;

/**
 * Returns the local audio file URI if the file physically exists and is non-empty.
 * Also checks across candidate extensions (m4a, mp4, mp3) and migrates misnamed
 * track.mp3 files containing MP4/AAC container streams so react-native-audio-api
 * correctly uses the FFmpeg decoder instead of failing MiniAudio MP3 decoding.
 */
export async function getValidatedTrackFileUri(
  songId: string,
  accountId?: string | null
): Promise<string | null> {
  try {
    const accountCandidates = accountId
      ? [accountId, getAccountScope().accountId, "guest"]
      : [getAccountScope().accountId, "guest"];
    const uniqueAccounts = Array.from(new Set(accountCandidates.map((id) => id ?? "guest")));

    for (const uid of uniqueAccounts) {
      for (const ext of CANDIDATE_AUDIO_EXTENSIONS) {
        const uri = getTrackFileUri(songId, ext, uid);
        const info = await getInfoAsync(uri);
        if (info.exists && !info.isDirectory && ((info as any).size ?? 0) > 1024) {
          // If file is named track.mp3, inspect the header to see if it is actually
          // an MP4/AAC stream. If so, rename to track.m4a for react-native-audio-api.
          if (ext === "mp3") {
            try {
              const header = await readAsStringAsync(uri, { encoding: "base64", length: 64 });
              if (header && (header.includes("ZnR5cA") || header.includes("ftyp"))) {
                const m4aUri = getTrackFileUri(songId, "m4a", uid);
                await moveAsync({ from: uri, to: m4aUri });
                return m4aUri.startsWith("file://") ? m4aUri : `file://${m4aUri}`;
              }
            } catch {
              // Fall through and return valid mp3 uri
            }
          }
          return uri.startsWith("file://") ? uri : `file://${uri}`;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Check whether a valid non-empty audio file exists for the song. */
export async function trackFileExists(songId: string, accountId?: string | null): Promise<boolean> {
  const uri = await getValidatedTrackFileUri(songId, accountId);
  return Boolean(uri);
}

/** Get the byte size of a track file, or 0 if missing. */
export async function getTrackFileSize(songId: string, accountId?: string | null): Promise<number> {
  try {
    const validUri = await getValidatedTrackFileUri(songId, accountId);
    if (!validUri) return 0;
    const info = await getInfoAsync(validUri);
    if (!info.exists) return 0;
    return (info as any).size ?? 0;
  } catch {
    return 0;
  }
}

/** Atomically moves completed temp file into final track location. */
export async function promoteTempToTrack(
  songId: string,
  ext = "m4a",
  uid?: string | null
): Promise<string | null> {
  try {
    const tempUri = getTempDownloadUri(songId, uid);
    const destUri = getTrackFileUri(songId, ext, uid);

    const tempInfo = await getInfoAsync(tempUri);
    if (!tempInfo.exists || ((tempInfo as any).size ?? 0) < 1024) {
      return null;
    }

    await ensureTrackDir(songId, uid);
    await moveAsync({ from: tempUri, to: destUri });
    return destUri.startsWith("file://") ? destUri : `file://${destUri}`;
  } catch (err) {
    logger.error("[Filesystem] promoteTempToTrack failed", err);
    return null;
  }
}

/** Delete track audio & artwork files. */
export async function deleteTrackFiles(songId: string, uid?: string | null): Promise<void> {
  try {
    const dir = getTrackDirUri(songId, uid);
    const temp = getTempDownloadUri(songId, uid);
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
