import Colors from "@/constants/colors";
import { useDownloads } from "@/contexts/DownloadContext";
import { formatBytes } from "@/lib/downloads/storagePolicy";
import { triggerImpact } from "@/lib/haptics";
import { type AppSettings } from "@/lib/storage";
import { applyEqualizerEnabled } from "@/services/audio/audioEqualizer";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert,Pressable,StyleSheet,Switch,Text,View } from "react-native";
import {
DOWNLOAD_QUALITY_OPTIONS,
detectMatchingPreset,
EQUALIZER_PRESETS,
MINI_PLAYER_OPTIONS,
QUALITY_OPTIONS,
SMART_AUTOPLAY_OPTIONS,
VIDEO_QUALITY_OPTIONS,
} from "../constants/settingsConstants";
import { SegmentPicker } from "./SettingsUIComponents";

interface ProfilePlaybackSectionProps {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onQualityChange: (value: AppSettings["streamingQuality"]) => Promise<void>;
  loadingQuality?: AppSettings["streamingQuality"] | null;
  onOpenEqualizer?: () => void;
}

export function ProfilePlaybackSection({
  settings,
  updateSettings,
  onQualityChange,
  loadingQuality,
  onOpenEqualizer,
}: ProfilePlaybackSectionProps) {
  const router = useRouter();
  const equalizerStatusText = useMemo(() => {
    const presetId = detectMatchingPreset(settings.equalizer);
    const presetName = EQUALIZER_PRESETS.find((preset) => preset.id === presetId)?.name;
    const active = [settings.equalizerEnabled && (presetName || "Custom"), settings.surroundSoundEnabled && "3D Surround"].filter(Boolean);
    return active.length ? active.join(" • ") : "Off";
  }, [settings.equalizer, settings.equalizerEnabled, settings.surroundSoundEnabled]);

  const handleToggleEqualizer = useCallback(async (enabled: boolean) => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    if (!enabled) {
      await updateSettings({ equalizerEnabled: false });
      void applyEqualizerEnabled(false).catch(() => {});
      return;
    }
    try {
      await applyEqualizerEnabled(enabled);
      await updateSettings({ equalizerEnabled: enabled });
    } catch (error) {
      Alert.alert("Equalizer unavailable", error instanceof Error ? error.message : "Could not change the equalizer.");
    }
  }, [updateSettings]);

  const handleOpenEqualizer = useCallback(() => {
    if (onOpenEqualizer) {
      onOpenEqualizer();
    } else {
      router.push("/equalizer" as any);
    }
  }, [onOpenEqualizer, router]);

  const handleDataSaverToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await updateSettings({
          dataSaverEnabled: true,
          streamingQuality: "low",
          videoBackgroundQuality: "low",
        });
        void onQualityChange("low");
      } else {
        await updateSettings({
          dataSaverEnabled: false,
          streamingQuality: "auto",
          videoBackgroundQuality: "auto",
        });
        void onQualityChange("auto");
      }
    },
    [onQualityChange, updateSettings]
  );

  const { storageSummary, removeAllDownloads } = useDownloads();

  const handleConfirmClearDownloads = useCallback(() => {
    const totalBytes = storageSummary?.totalDownloadedBytes || 0;
    const formatted = totalBytes > 0 ? ` (${formatBytes(totalBytes)})` : "";

    void triggerImpact(ImpactFeedbackStyle.Medium);

    Alert.alert(
      "Delete All Downloads",
      `Are you sure you want to delete all offline downloaded songs${formatted}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            void triggerImpact(ImpactFeedbackStyle.Heavy);
            await removeAllDownloads();
          },
        },
      ]
    );
  }, [storageSummary?.totalDownloadedBytes, removeAllDownloads]);

  return (
    <>
      {/* ─── 1. Streaming & Downloads ─── */}
      <Text style={styles.sectionLabel}>STREAMING & DOWNLOADS</Text>
      <View style={styles.sectionGroup}>
        {/* Streaming Quality */}
        <View style={styles.groupBlock}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="musical-notes-outline" size={21} color="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.blockTitle}>Streaming Quality</Text>
            </View>
          </View>
          <SegmentPicker
            options={QUALITY_OPTIONS}
            value={settings.streamingQuality}
            loadingValue={loadingQuality}
            onChange={onQualityChange}
          />
        </View>

        {/* Download Quality */}
        <View style={[styles.groupBlock, styles.blockDivider]}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="cloud-download-outline" size={21} color="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.blockTitle}>Download Quality</Text>
            </View>
          </View>
          <SegmentPicker
            options={DOWNLOAD_QUALITY_OPTIONS}
            value={settings.downloadQuality}
            onChange={(val) => updateSettings({ downloadQuality: val })}
          />
        </View>

        {/* Download on Wi-Fi Only */}
        <View style={[styles.row, styles.rowDivider]}>
          <Ionicons name="wifi-outline" size={22} color="rgba(255, 255, 255, 0.7)" style={styles.rowIcon} />
          <View style={styles.rowTextCol}>
            <Text style={styles.rowTitle}>Download on Wi-Fi Only</Text>
            <Text style={styles.rowSubtitle}>Avoid consuming mobile cellular data</Text>
          </View>
          <Switch
            value={settings.downloadWifiOnly}
            onValueChange={(v) => updateSettings({ downloadWifiOnly: v })}
            trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Delete All Downloads */}
        <Pressable
          style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
          onPress={handleConfirmClearDownloads}
          accessibilityRole="button"
          accessibilityLabel="Delete all downloaded songs"
        >
          <Ionicons name="trash-outline" size={22} color="#FF6B6B" style={styles.rowIcon} />
          <View style={styles.rowTextCol}>
            <Text style={[styles.rowTitle, { color: "#FF6B6B" }]}>Delete All Downloads</Text>
            <Text style={styles.rowSubtitle}>
              {storageSummary && storageSummary.totalDownloadedBytes > 0
                ? `${formatBytes(storageSummary.totalDownloadedBytes)} offline storage`
                : "Remove all offline songs from device"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255, 255, 255, 0.3)" />
        </Pressable>

        {/* Data Saver Mode */}
        <View style={styles.row}>
          <Ionicons name="speedometer-outline" size={22} color="rgba(255, 255, 255, 0.7)" style={styles.rowIcon} />
          <View style={styles.rowTextCol}>
            <Text style={styles.rowTitle}>Data Saver Mode</Text>
            <Text style={styles.rowSubtitle}>Reduces audio and video bandwidth usage</Text>
          </View>
          <Switch
            value={settings.dataSaverEnabled}
            onValueChange={handleDataSaverToggle}
            trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* ─── 2. Audio & Equalizer ─── */}
      <Text style={styles.sectionLabel}>AUDIO & EQUALIZER</Text>
      <View style={styles.sectionGroup}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleOpenEqualizer}
          accessibilityRole="button"
          accessibilityLabel="Open Equalizer Settings"
        >
          <Ionicons
            name="options-outline"
            size={22}
            color={settings.equalizerEnabled ? Colors.primary : "rgba(255, 255, 255, 0.7)"}
            style={styles.rowIcon}
          />
          <View style={styles.rowTextCol}>
            <Text style={styles.rowTitle}>Equalizer</Text>
            <Text style={styles.rowSubtitle}>{settings.equalizerEnabled || settings.surroundSoundEnabled ? `On • ${equalizerStatusText}` : "Off"}</Text>
          </View>
          <View style={styles.rowTrailingActions}>
            <Switch
              value={settings.equalizerEnabled}
              onValueChange={handleToggleEqualizer}
              trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
            <Ionicons
              name="chevron-forward"
              size={18}
              color="rgba(255, 255, 255, 0.25)"
              style={{ marginLeft: 6 }}
            />
          </View>
        </Pressable>
      </View>

      {/* ─── 3. Playback & Transitions ─── */}
      <Text style={styles.sectionLabel}>PLAYBACK & TRANSITIONS</Text>
      <View style={styles.sectionGroup}>
        {/* Video Background */}
        <View style={styles.groupBlock}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="videocam-outline" size={21} color="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.blockTitle}>Video Background</Text>
            </View>
            <Switch
              value={settings.ambientBackdropEnabled}
              onValueChange={(v) => updateSettings({ ambientBackdropEnabled: v })}
              trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          {settings.ambientBackdropEnabled && (
            <View style={styles.subSegmentWrapper}>
              <SegmentPicker
                options={VIDEO_QUALITY_OPTIONS}
                value={settings.videoBackgroundQuality}
                onChange={(val) => updateSettings({ videoBackgroundQuality: val })}
              />
            </View>
          )}
        </View>

        {/* Smart Autoplay */}
        <View style={[styles.groupBlock, styles.blockDivider]}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="infinite-outline" size={21} color="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.blockTitle}>Smart Autoplay</Text>
            </View>
            <Switch
              value={settings.smartAutoplayEnabled}
              onValueChange={(v) => updateSettings({ smartAutoplayEnabled: v })}
              trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          {settings.smartAutoplayEnabled && (
            <View style={styles.subSegmentWrapper}>
              <SegmentPicker
                options={SMART_AUTOPLAY_OPTIONS}
                value={settings.smartAutoplayMode}
                onChange={(val) => updateSettings({ smartAutoplayMode: val })}
              />
            </View>
          )}
        </View>

      </View>

      {/* ─── 4. Controls & Hardware ─── */}
      <Text style={styles.sectionLabel}>CONTROLS & HARDWARE</Text>
      <View style={styles.sectionGroup}>
        {/* Mini Player Control */}
        <View style={styles.groupBlock}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="browsers-outline" size={21} color="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.blockTitle}>Mini Player Action</Text>
            </View>
          </View>
          <SegmentPicker
            options={MINI_PLAYER_OPTIONS}
            value={settings.miniPlayerSecondaryControl}
            onChange={(val) => updateSettings({ miniPlayerSecondaryControl: val })}
          />
        </View>

        {/* Haptics */}
        <View style={[styles.row, styles.rowDivider]}>
          <Ionicons name="phone-portrait-outline" size={22} color="rgba(255, 255, 255, 0.7)" style={styles.rowIcon} />
          <View style={styles.rowTextCol}>
            <Text style={styles.rowTitle}>Haptic Feedback</Text>
            <Text style={styles.rowSubtitle}>Vibration response on controls and gestures</Text>
          </View>
          <Switch
            value={settings.hapticsEnabled}
            onValueChange={(v) => updateSettings({ hapticsEnabled: v })}
            trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: "rgba(255, 255, 255, 0.38)",
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    marginTop: 26,
    marginBottom: 10,
    marginLeft: 6,
  },
  sectionGroup: {
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
  groupBlock: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  blockDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.07)",
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  blockTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  blockTitle: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontFamily: "Inter_600SemiBold",
  },
  subSegmentWrapper: {
    marginTop: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
  },
  rowIcon: {
    marginRight: 14,
  },
  rowTextCol: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontFamily: "Inter_500Medium",
  },
  rowSubtitle: {
    color: "rgba(255, 255, 255, 0.42)",
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  rowTrailingActions: {
    flexDirection: "row",
    alignItems: "center",
  },
});
