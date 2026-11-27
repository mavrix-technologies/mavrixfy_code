import { useCallback, useEffect, useState } from "react";
import { FlatList, type ListRenderItemInfo, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { getSettings, subscribeSettings, type AppSettings } from "@/lib/storage";
import type { Song } from "@/lib/musicData";
import type { PlaybackQualityState } from "@/types/playbackTypes";
import { NativePlaybackPlayer, type AudioDiagnostics } from "@/services/audio/NativePlaybackPlayer";
import { audioBitrateLabel, audioSourceLabel } from "@/services/audio/audioDiagnostics";

type DiagnosticRow = [string, string];
const diagnosticKeyExtractor = ([name]: DiagnosticRow) => name;

export function AudioDiagnosticsPanel({ visible, onClose, song, quality }: {
  visible: boolean; onClose: () => void; song: Song | null; quality: PlaybackQualityState;
}) {
  const [native, setNative] = useState<AudioDiagnostics | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let settingsChanged = false;
    const refresh = async () => {
      try {
        const snapshot = await NativePlaybackPlayer.getPlaybackSnapshot();
        if (!active) return;
        setNative(snapshot.audioDiagnostics?.trackId === song?.id ? snapshot.audioDiagnostics ?? null : null);
      } catch { if (active) setNative(null); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    const unsub = subscribeSettings(value => { settingsChanged = true; if (active) setSettings(value); });
    void getSettings().then(value => { if (active && !settingsChanged) setSettings(value); }).catch(() => {});
    return () => { active = false; clearInterval(timer); unsub(); };
  }, [visible, song?.id]);
  const toggleLabel = (value?: boolean) => value === undefined ? "Unknown" : value ? "On" : "Off";
  const positive = (value?: number, unit = "") => value && value > 0 ? `${value}${unit}` : "Unknown";
  const rows: DiagnosticRow[] = [
    ["Catalog", song?.source || "Unknown"],
    ["Audio source", audioSourceLabel(song?.audioUrl)],
    ["Requested quality", quality.requested],
    ["Source-reported bitrate", audioBitrateLabel(quality.actualBitrate * 1000)],
    ["Source-reported codec", quality.codec?.toUpperCase() || "Unknown"],
    ["Player-reported bitrate", audioBitrateLabel(native?.bitrate)],
    ["Player format", native?.codec || "Unknown"],
    ["Source sample rate", positive(native?.sampleRate, " Hz")],
    ["Source channels", positive(native?.channelCount)],
    ...(Platform.OS === "ios"
      ? ([["Output sample rate", positive(native?.outputSampleRate, " Hz")], ["Output channels", positive(native?.outputChannels)]] as DiagnosticRow[])
      : []),
    ["EQ active", toggleLabel(native?.equalizerActive)],
    ["Compression active", toggleLabel(native?.compressionActive)],
    ["Original sound preference", settings ? toggleLabel(Boolean(settings.originalSoundEnabled)) : "Unknown"],
    ["Original sound applied", toggleLabel(native?.originalSoundEnabled)],
  ];
  const renderRow = useCallback(
    ({ item: [name, value] }: ListRenderItemInfo<DiagnosticRow>) => (
      <View style={styles.row}>
        <Text style={styles.key}>{name}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    ),
    []
  );
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close audio details" />
      <View style={styles.sheet} accessibilityViewIsModal>
        <Text style={styles.heading}>Audio details</Text>
        <Text style={styles.note}>{song?.title || "No active track"}</Text>
        <FlatList
          data={rows}
          keyExtractor={diagnosticKeyExtractor}
          renderItem={renderRow}
          ListFooterComponent={DiagnosticsFooterNote}
        />
        <Pressable style={styles.close} onPress={onClose} accessibilityRole="button"><Text style={styles.value}>Done</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function DiagnosticsFooterNote() {
  return (
    <Text style={styles.note}>
      Unknown means this source or installed player does not report the value. Source bitrate and device output format are different measurements. Original sound bypasses Mavrixfy effects; it cannot restore missing source detail.
    </Text>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: "#10151D", padding: 22, paddingBottom: 38, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
  heading: { color: "#FFF", fontSize: 21, fontWeight: "700", marginBottom: 8 },
  note: { color: "#AAB4C2", fontSize: 13, lineHeight: 20, marginBottom: 15, marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 8 },
  key: { color: "#AAB4C2", flex: 1, fontSize: 13 },
  value: { color: "#FFF", fontSize: 13, flexShrink: 1 },
  close: { alignItems: "center", padding: 14, marginTop: 12, backgroundColor: "#26323E", borderRadius: 12 },
});
