import { playbackStatusLabel } from "@/services/audio/playbackStatusLabel";
import { memo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { AudioDiagnosticsPanel } from "./AudioDiagnosticsPanel";
import { usePlayerActions } from "@/contexts/PlayerContextDefs";
import { usePlaybackEngineSelector } from "@/services/audio/PlaybackEngine";
import { getSongProvider } from "@/lib/providerFilter";
import { useAuth } from "@/contexts/AuthContext";

const qualityNames = { auto: "Auto", low: "Low", medium: "Medium", high: "High" };

export const PlaybackInfo = memo(function PlaybackInfo({ color = "rgba(255,255,255,0.65)" }: { color?: string }) {
  const [showDetails, setShowDetails] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const { playbackQuality } = usePlayerActions();
  const currentSong = usePlaybackEngineSelector((state) => state.currentSong);
  const status = usePlaybackEngineSelector(playbackStatusLabel);
  const bitrate = status && status !== "Buffering…" ? 0 : playbackQuality.actualBitrate;

  const provider = getSongProvider(currentSong);
  const sourceName =
    provider === "spotify"
      ? "Spotify"
      : provider === "youtube"
      ? "YouTube Music"
      : provider === "local"
      ? "Local Audio"
      : "JioSaavn";

  const preference = playbackQuality.qualityLabel.startsWith("Offline")
    ? "Offline"
    : `${qualityNames[playbackQuality.requested] || "High"} requested`;
  const codec = !status || status === "Buffering…" ? playbackQuality.codec?.toUpperCase() : undefined;
  const bitrateStr = Number.isFinite(bitrate) && bitrate > 0 ? `${Math.round(bitrate)} kbps` : "bitrate unavailable";

  const quality = [sourceName, preference, codec, bitrateStr].filter(Boolean).join(" · ");
  const label = isAdmin ? (status ? `${sourceName} · ${status}` : quality) : (status || "Mavrixfy Music");

  return (
    <>
    <Pressable style={styles.info} onPress={() => setShowDetails(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${isAdmin ? [status, quality].filter(Boolean).join(". ") : label}. Open audio details`}>
      <Text numberOfLines={1} style={[styles.label, { color }]} accessibilityLiveRegion="polite">
        {label}
      </Text>
    </Pressable>
    {showDetails && <AudioDiagnosticsPanel key={currentSong?.id || "none"} visible onClose={() => setShowDetails(false)} song={currentSong} quality={{ ...playbackQuality, actualBitrate: bitrate, codec }} />}
    </>
  );
});

const styles = StyleSheet.create({
  info: { flexShrink: 1, minWidth: 0 },
  label: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular" },
});
