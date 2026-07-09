/**
 * Prefetch Queue — transient playback preparation only.
 *
 * At 80% progress this module asks the backend for the next autoplay
 * recommendations. Audio URLs are resolved only when a song actually starts.
 */

import type { Song } from "@/lib/musicData";

const PREFETCH_TARGET_COUNT = 20;

export type QueuePrefetchResult = {
  songs: Song[];
};

export async function prefetchNextSongs(
  queue: Song[],
  currentIndex: number,
  count: number = PREFETCH_TARGET_COUNT
): Promise<QueuePrefetchResult> {
  // YouTube is disabled, returning empty autoplay recommendations
  return { songs: [] };
}

export function shouldPrefetch(positionSeconds: number, durationSeconds: number): boolean {
  if (durationSeconds <= 0 || positionSeconds <= 0) return false;
  return positionSeconds / durationSeconds >= 0.8;
}

export function clearPrefetchCache() {
  // Kept for compatibility with callers.
}

