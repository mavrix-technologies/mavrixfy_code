/**
 * Track References — one physical track download, many playlist or album references.
 *
 * Ensures that removing a song from one playlist does not delete the bytes
 * if another playlist still references the same track.
 */

import { loadDownload, patchDownload } from "@/lib/downloads/downloadStore";
import { logger } from "@/lib/logger";

/**
 * Add a collection reference (playlist/album ID) to a downloaded track.
 * No-op if the reference already exists.
 */
export async function addCollectionRef(
  songId: string,
  collectionId: string
): Promise<void> {
  try {
    const item = await loadDownload(songId);
    if (!item) return;

    if (!item.collectionRefs.includes(collectionId)) {
      await patchDownload(songId, {
        collectionRefs: [...item.collectionRefs, collectionId],
      });
    }
  } catch (err) {
    logger.error("[TrackReferences] addCollectionRef failed", err);
  }
}

/**
 * Remove a collection reference from a downloaded track.
 * Returns true if the track has no remaining references (caller should delete bytes).
 */
export async function removeCollectionRef(
  songId: string,
  collectionId: string
): Promise<boolean> {
  try {
    const item = await loadDownload(songId);
    if (!item) return true;

    const remaining = item.collectionRefs.filter((id) => id !== collectionId);
    await patchDownload(songId, { collectionRefs: remaining });

    return remaining.length === 0;
  } catch (err) {
    logger.error("[TrackReferences] removeCollectionRef failed", err);
    return false;
  }
}

/**
 * Returns true if the track has no collection references.
 * A track with no references can have its bytes safely deleted.
 */
async function hasNoReferences(songId: string): Promise<boolean> {
  try {
    const item = await loadDownload(songId);
    if (!item) return true;
    return item.collectionRefs.length === 0;
  } catch {
    return true;
  }
}
