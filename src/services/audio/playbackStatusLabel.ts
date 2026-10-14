import type { PlaybackEngineSnapshot } from "./PlaybackEngine";

export function playbackStatusLabel(state: Pick<PlaybackEngineSnapshot, "error" | "isReconnecting" | "isBuffering" | "isLoading">): string | null {
  if (state.error) return /verify|verification|sign.?in|LOGIN_REQUIRED|SIGN_IN_REQUIRED/i.test(state.error)
    ? "Verification required · try later" : "Playback unavailable · tap Play to retry";
  if (state.isReconnecting) return "Reconnecting…";
  if (state.isBuffering) return "Buffering…";
  if (state.isLoading) return "Loading…";
  return null;
}

