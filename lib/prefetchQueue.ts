/**
 * Prefetch Queue — transient playback preparation only.
 *
 * At 80% progress this module asks the backend for the next 20 autoplay
 * recommendations and fresh stream URLs. Stream URLs are not persisted.
 */

import { logger } from "@/lib/logger";
import {
  convertYouTubeMusicTrack,
  getYouTubeMusicAudioStream,
  prefetchYouTubeMusicAutoplay,
} from "@/lib/youtubeMusicService";
import type { Song } from "@/lib/musicData";

const prefetchedIds = new Set<string>();
const MAX_PREFETCH_TRACKING = 200;
const PREFETCH_TARGET_COUNT = 20;

export type QueuePrefetchResult = {
  urls: Map<string, string>;
  songs: Song[];
};

export async function prefetchNextSongs(
  queue: Song[],
  currentIndex: number,
  count: number = PREFETCH_TARGET_COUNT
): Promise<QueuePrefetchResult> {
  const urls = new Map<string, string>();
  const songs: Song[] = [];
  const targetCount = Math.max(1, Math.min(count, PREFETCH_TARGET_COUNT));
  const currentSong = queue[currentIndex];
  const currentVideoId = currentSong ? extractVideoId(currentSong) : null;

  const existingYouTubeSongs = queue
    .slice(currentIndex + 1, currentIndex + 1 + targetCount)
    .filter((song) => {
      if (!song?.id || prefetchedIds.has(song.id)) return false;
      return Boolean(extractVideoId(song));
    });

  const [existingResults, autoplayResult] = await Promise.allSettled([
    Promise.allSettled(
      existingYouTubeSongs.map(async (song) => {
        const videoId = extractVideoId(song);
        if (!videoId) return null;
        const stream = await Promise.race([
          getYouTubeMusicAudioStream(videoId),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Prefetch timeout")), 10000)),
        ]);
        if (!stream?.url) return null;
        trackPrefetched(song.id);
        return { songId: song.id, videoId, url: stream.url };
      })
    ),
    currentVideoId ? prefetchYouTubeMusicAutoplay(currentVideoId, targetCount) : Promise.resolve(null),
  ]);

  if (existingResults.status === "fulfilled") {
    for (const result of existingResults.value) {
      if (result.status !== "fulfilled" || !result.value) continue;
      urls.set(result.value.songId, result.value.url);
      urls.set(`youtube_${result.value.videoId}`, result.value.url);
      urls.set(result.value.videoId, result.value.url);
    }
  }

  if (autoplayResult.status === "fulfilled" && autoplayResult.value) {
    for (const track of autoplayResult.value.queue) {
      const song = convertYouTubeMusicTrack(track);
      if (song) songs.push(song);
    }

    for (const entry of autoplayResult.value.streams) {
      if (!entry.stream?.url) continue;
      urls.set(entry.videoId, entry.stream.url);
      urls.set(`youtube_${entry.videoId}`, entry.stream.url);
    }
  }

  logger.debug("[Prefetch] Batch complete:", {
    existingAttempted: existingYouTubeSongs.length,
    recommendedSongs: songs.length,
    resolvedUrls: urls.size,
  });

  return { urls, songs };
}

export function shouldPrefetch(positionSeconds: number, durationSeconds: number): boolean {
  if (durationSeconds <= 0 || positionSeconds <= 0) return false;
  return positionSeconds / durationSeconds >= 0.8;
}

function trackPrefetched(songId: string) {
  if (prefetchedIds.size >= MAX_PREFETCH_TRACKING) {
    const entries = Array.from(prefetchedIds);
    entries.slice(0, Math.floor(entries.length / 2)).forEach((id) => prefetchedIds.delete(id));
  }
  prefetchedIds.add(songId);
}

export function clearPrefetchCache() {
  prefetchedIds.clear();
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
