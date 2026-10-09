import type { Song } from "@/lib/musicData";

export type QueueMove = { from: number; to: number };
export type QueueOrderSnapshot = { queue: Song[]; queueIndex: number };

/** Maps a drag's final visible slot back to the live queue without moving the playing item. */
export function resolveQueueDragMove(
  queue: Song[],
  originalVisibleOrder: Song[],
  fromVisibleIndex: number,
  toVisibleIndex: number,
  firstUpcomingIndex: number,
): QueueMove | null {
  if (
    !Number.isInteger(fromVisibleIndex) ||
    !Number.isInteger(toVisibleIndex) ||
    !Number.isInteger(firstUpcomingIndex) ||
    firstUpcomingIndex < 0 || firstUpcomingIndex >= queue.length ||
    fromVisibleIndex < 0 || fromVisibleIndex >= originalVisibleOrder.length ||
    fromVisibleIndex === toVisibleIndex ||
    toVisibleIndex < 0 || toVisibleIndex >= originalVisibleOrder.length
  ) return null;

  // Playback, shuffle or queue edits may change the list during a gesture.
  // Never apply an old visible slot to a different live order.
  const upcoming = queue
    .map((song, index) => ({ song, index }))
    .slice(firstUpcomingIndex)
    .filter(entry => Boolean(entry.song?.id));
  if (
    upcoming.length !== originalVisibleOrder.length ||
    originalVisibleOrder.some((song, index) => song !== upcoming[index].song)
  ) return null;

  // Use occurrence positions, so even repeated instances of the same song
  // can move independently without a first-ID-match lookup.
  return { from: upcoming[fromVisibleIndex].index, to: upcoming[toVisibleIndex].index };
}
