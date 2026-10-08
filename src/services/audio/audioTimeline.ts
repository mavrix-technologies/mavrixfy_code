export interface PlaybackStreamMetadata {
  playbackHeaders?: Record<string, string>;
  /** Duration of the selected stream in seconds, when known by its resolver. */
  playbackDurationSeconds?: number;
}

/** Normalize every provider's stream into the same player metadata. */
export function playbackStreamMetadata(stream: { headers?: Record<string, string>; durationSeconds?: number }): PlaybackStreamMetadata {
  const duration = playbackDuration(0, stream.durationSeconds);
  return { playbackHeaders: stream.headers, playbackDurationSeconds: duration > 0 ? duration : undefined };
}

/** A resolved stream timeline takes precedence over a decoder estimate. */
export function playbackDuration(reported: number, resolved?: number): number {
  if (typeof resolved === "number" && Number.isFinite(resolved) && resolved > 0) return resolved;
  return Number.isFinite(reported) && reported > 0 ? reported : 0;
}

export function playbackPosition(seconds: number, duration: number): number {
  const position = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Number.isFinite(duration) && duration > 0 ? Math.min(position, duration) : position;
}

/** A decoder EOF well before the timeline's tail is an interrupted stream. */
export function isPrematurePlaybackEnd(position: number, duration: number): boolean {
  return Number.isFinite(position) && position >= 0 && Number.isFinite(duration) && duration > 0 && duration - position > 2;
}

export function playbackProgress(position: number, duration: number) {
  const safeDuration = playbackDuration(duration);
  const safePosition = playbackPosition(position, safeDuration);
  return { progress: safeDuration > 0 ? safePosition / safeDuration : 0,
    duration: Math.round(safeDuration * 1000), positionMillis: Math.round(safePosition * 1000) };
}
