import type { LyricLine } from "@/services/lyricsService";

/** Synced lyrics are sorted; select the last started line without scanning every tick. */
export function getStandByLyricIndex(lines: readonly LyricLine[], positionSeconds: number): number {
  if (!Number.isFinite(positionSeconds)) return -1;
  let low = 0;
  let high = lines.length - 1;
  let active = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].time <= positionSeconds + 0.05) {
      active = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return active;
}
