import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { usePlayerActions } from "@/contexts/PlayerContextDefs";
import { usePlaybackEngineSelector, type PlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";

export function playbackStatusLabel(state: Pick<PlaybackEngineSnapshot, "error" | "isReconnecting" | "isBuffering" | "isLoading">): string | null {
  if (state.error) return /verify|verification|sign.?in|LOGIN_REQUIRED|SIGN_IN_REQUIRED/i.test(state.error)
    ? "Verification required · try later" : "Playback unavailable · tap Play to retry";
  if (state.isReconnecting) return "Reconnecting…";
  if (state.isBuffering) return "Buffering…";
  if (state.isLoading) return "Loading…";
  return null;
}

const qualityNames = { auto: "Auto", low: "Low", medium: "Medium", high: "High" };
export const PlaybackInfo = memo(function PlaybackInfo({ color = "rgba(255,255,255,0.65)" }: { color?: string }) {
  const { playbackQuality } = usePlayerActions();
  const status = usePlaybackEngineSelector(playbackStatusLabel);
  const bitrate = status && status !== "Buffering…" ? 0 : playbackQuality.actualBitrate;
  const preference = playbackQuality.qualityLabel.startsWith("Offline") ? "Offline" : `${qualityNames[playbackQuality.requested]} requested`;
  const quality = `${preference} · ${Number.isFinite(bitrate) && bitrate > 0 ? `${Math.round(bitrate)} kbps` : "bitrate unavailable"}`;
  return <View style={styles.info} accessible accessibilityLabel={[status, quality].filter(Boolean).join(". ")}>
    <Text numberOfLines={1} style={[styles.label, { color }]} accessibilityLiveRegion="polite">{status ?? quality}</Text>
  </View>;
});

const styles = StyleSheet.create({
  info: { flexShrink: 1, minWidth: 0 },
  label: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular" },
});
