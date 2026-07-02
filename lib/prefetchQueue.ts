/**
 * Prefetch Queue — transient playback preparation only.
 *
 * At 80% progress this module asks the backend for the next autoplay
 * recommendations. Audio URLs are resolved only when a song actually starts.
 */

import {
  convertYouTubeMusicTrack,
  prefetchYouTubeMusicAutoplay,
} from "@/lib/youtubeMusicService";
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
  const songs: Song[] = [];
  const targetCount = Math.max(1, Math.min(count, PREFETCH_TARGET_COUNT));
  const currentSong = queue[currentIndex];
  const currentVideoId = currentSong ? extractVideoId(currentSong) : null;

  const autoplayValue = currentVideoId
    ? await prefetchYouTubeMusicAutoplay(currentVideoId, targetCount).catch(() => null)
    : null;
  if (autoplayValue) {
    for (const track of autoplayValue.queue) {
      const song = convertYouTubeMusicTrack(track);
      if (song) songs.push(song);
    }
  }

  return { songs };
}

export function shouldPrefetch(positionSeconds: number, durationSeconds: number): boolean {
  if (durationSeconds <= 0 || positionSeconds <= 0) return false;
  return positionSeconds / durationSeconds >= 0.8;
}

export function clearPrefetchCache() {
  // Kept for compatibility with callers. No stream URL cache is maintained.
}

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
