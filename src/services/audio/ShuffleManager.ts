import type { Song } from "@/lib/musicData";

/**
 * Pure Fisher-Yates shuffle algorithm for immutable array randomization.
 */
export function shuffleArray<T>(items: readonly T[]): T[] {
  if (!items || items.length <= 1) return items ? [...items] : [];
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates a shuffled playback queue from a canonical song list.
 * Places the target/start song at index 0 and randomizes the remaining items.
 */
export function createShuffledPlaybackQueue(
  songs: readonly Song[],
  startSong?: Song | null
): { shuffledQueue: Song[]; targetSong: Song; targetIndex: number } | null {
  if (!Array.isArray(songs) || songs.length === 0) return null;

  const source = songs.filter((s) => Boolean(s?.id));
  if (source.length === 0) return null;

  const target = startSong || source[Math.floor(Math.random() * source.length)] || source[0];
  const otherSongs = source.filter((s) => s.id !== target.id);
  const shuffledOthers = shuffleArray(otherSongs);

  const shuffledQueue = [target, ...shuffledOthers];
  return {
    shuffledQueue,
    targetSong: target,
    targetIndex: 0,
  };
}

/**
 * Handles toggling shuffle ON and OFF for an active queue.
 * - Toggling ON: Preserves currentSong at index 0, shuffles all remaining canonical tracks.
 * - Toggling OFF: Restores canonical queue order and computes the active track's index in it.
 */
export function toggleQueueShuffleState(params: {
  isShuffled: boolean;
  currentSong: Song | null;
  activeQueue: readonly Song[];
  originalQueue: readonly Song[];
}): {
  nextIsShuffled: boolean;
  nextQueue: Song[];
  nextIndex: number;
} {
  const nextIsShuffled = !params.isShuffled;
  const current = params.currentSong;
  const canonicalSource =
    params.originalQueue.length > 0 ? params.originalQueue : params.activeQueue;

  if (nextIsShuffled) {
    // Turning shuffle ON
    if (!current) {
      const shuffled = shuffleArray(canonicalSource);
      return { nextIsShuffled: true, nextQueue: shuffled, nextIndex: 0 };
    }
    const otherSongs = canonicalSource.filter((s) => s.id !== current.id);
    const shuffledOthers = shuffleArray(otherSongs);
    const nextQueue = [current, ...shuffledOthers];
    return { nextIsShuffled: true, nextQueue, nextIndex: 0 };
  } else {
    // Turning shuffle OFF -> Restore canonical order
    const nextQueue = [...canonicalSource];
    const nextIndex = current
      ? Math.max(0, nextQueue.findIndex((s) => s.id === current.id))
      : 0;
    return { nextIsShuffled: false, nextQueue, nextIndex };
  }
}
