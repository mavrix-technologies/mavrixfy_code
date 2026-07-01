/**
 * Prefetch Queue — Pre-resolves audio URLs for upcoming songs.
 *
 * When the current song reaches 80% progress, this module:
 *  1. Resolves audio URLs for the next 3 songs in queue
 *  2. Fetches related songs via YouTube watch playlist
 *  3. Feeds them into the smart autoplay system
 *
 * This eliminates the gap between songs and ensures gapless playback.
 */

import { logger } from "@/lib/logger";
import { getYouTubeMusicAudioStream } from "@/lib/youtubeMusicService";
import type { Song } from "@/lib/musicData";

/** Track which songs have already been prefetched to avoid duplicate work. */
const prefetchedIds = new Set<string>();

/** Maximum number of prefetched IDs to track (prevents memory leak). */
const MAX_PREFETCH_TRACKING = 200;

/**
 * Resolve audio URLs for the next N songs in the queue.
 *
 * Only processes YouTube-source songs that don't already have
 * a fresh native audio URL.
 */
export async function prefetchNextSongs(
  queue: Song[],
  currentIndex: number,
  count: number = 3
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const songsToResolve: Song[] = [];

  for (let i = currentIndex + 1; i < Math.min(currentIndex + 1 + count, queue.length); i++) {
    const song = queue[i];
    if (!song?.id) continue;

    // Skip songs that already have a valid audio URL or were already prefetched
    if (prefetchedIds.has(song.id)) continue;
    if (song.audioUrl && !song.audioUrl.includes("youtube.com")) continue;

    const isYouTube =
      song.source === "youtube" ||
      String(song.id).startsWith("youtube_");

    if (isYouTube) {
      songsToResolve.push(song);
    }
  }

  if (songsToResolve.length === 0) return resolved;

  // Resolve in parallel with a 10-second timeout per song
  const results = await Promise.allSettled(
    songsToResolve.map(async (song) => {
      const videoId = extractVideoId(song);
      if (!videoId) return null;

      try {
        const stream = await Promise.race([
          getYouTubeMusicAudioStream(videoId),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("Prefetch timeout")), 10000)
          ),
        ]);

        if (stream?.url) {
          trackPrefetched(song.id);
          resolved.set(song.id, stream.url);
          logger.debug("[Prefetch] Resolved:", { songId: song.id, videoId });
          return stream.url;
        }
      } catch (err) {
        logger.warn("[Prefetch] Failed:", { songId: song.id, error: String(err) });
      }
      return null;
    })
  );

  logger.debug("[Prefetch] Batch complete:", {
    attempted: songsToResolve.length,
    resolved: resolved.size,
  });

  return resolved;
}

/**
 * Check if a song's playback has reached the prefetch threshold (80%).
 */
export function shouldPrefetch(
  positionSeconds: number,
  durationSeconds: number
): boolean {
  if (durationSeconds <= 0 || positionSeconds <= 0) return false;
  return positionSeconds / durationSeconds >= 0.8;
}

/**
 * Track a song as prefetched. Evicts old entries if the set grows too large.
 */
function trackPrefetched(songId: string) {
  if (prefetchedIds.size >= MAX_PREFETCH_TRACKING) {
    // Evict the oldest entries (first half)
    const entries = Array.from(prefetchedIds);
    entries.slice(0, Math.floor(entries.length / 2)).forEach((id) => prefetchedIds.delete(id));
  }
  prefetchedIds.add(songId);
}

/**
 * Clear the prefetch tracking set (e.g., on app restart).
 */
export function clearPrefetchCache() {
  prefetchedIds.clear();
}

/**
 * Extract a YouTube video ID from a Song object.
 */
function extractVideoId(song: Song): string | null {
  const source = song as Song & {
    videoId?: unknown;
    video_id?: unknown;
    youtubeId?: unknown;
    youtube_id?: unknown;
    youtubeVideoId?: unknown;
  };

  const candidates = [
    source.youtubeVideoId,
    source.videoId,
    source.video_id,
    source.youtubeId,
    source.youtube_id,
    String(source.id || "").replace(/^youtube_/, ""),
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  }

  return null;
}
