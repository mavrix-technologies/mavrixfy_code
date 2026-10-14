import { playbackStatusLabel } from "@/services/audio/playbackStatusLabel";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { usePlayerActions } from "@/contexts/PlayerContextDefs";
import { usePlaybackEngineSelector } from "@/services/audio/PlaybackEngine";


const qualityNames = { auto: "Auto", low: "Low", medium: "Medium", high: "High" };
export const PlaybackInfo = memo(function PlaybackInfo({ color = "rgba(255,255,255,0.65)" }: { color?: string }) {
  const { playbackQuality } = usePlayerActions();
  const status = usePlaybackEngineSelector(playbackStatusLabel);
  const bitrate = status && status !== "Buffering…" ? 0 : playbackQuality.actualBitrate;
  const preference = playbackQuality.qualityLabel.startsWith("Offline") ? "Offline" : `${qualityNames[playbackQuality.requested]} requested`;
  const codec = !status || status === "Buffering…" ? playbackQuality.codec?.toUpperCase() : undefined;
  const quality = [preference, codec, Number.isFinite(bitrate) && bitrate > 0 ? `${Math.round(bitrate)} kbps` : "bitrate unavailable"].filter(Boolean).join(" · ");
  return <View style={styles.info} accessible accessibilityLabel={[status, quality].filter(Boolean).join(". ")}>
    <Text numberOfLines={1} style={[styles.label, { color }]} accessibilityLiveRegion="polite">{status ?? quality}</Text>
  </View>;
});

const styles = StyleSheet.create({
  info: { flexShrink: 1, minWidth: 0 },
  label: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular" },
});
