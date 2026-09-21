import React, { useCallback } from "react";
import { View, Text, StyleSheet, Switch, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import Colors from "@/constants/colors";
import { type AppSettings } from "@/lib/storage";
import { useDownloads } from "@/contexts/DownloadContext";
import { formatBytes } from "@/lib/downloads/storagePolicy";
import { triggerImpact } from "@/lib/haptics";
import { SegmentPicker } from "./SettingsUIComponents";
import {
  QUALITY_OPTIONS,
  DOWNLOAD_QUALITY_OPTIONS,
  CROSSFADE_OPTIONS,
  SMART_AUTOPLAY_OPTIONS,
  MINI_PLAYER_OPTIONS,
  VIDEO_QUALITY_OPTIONS,
} from "../constants/settingsConstants";

interface ProfilePlaybackSectionProps {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onQualityChange: (value: AppSettings["streamingQuality"]) => Promise<void>;
  loadingQuality?: AppSettings["streamingQuality"] | null;
}

export function ProfilePlaybackSection({
  settings,
  updateSettings,
  onQualityChange,
  loadingQuality,
}: ProfilePlaybackSectionProps) {
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

      {/* ─── 2. Playback & Transitions ─── */}
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

        {/* Crossfade */}
        <View style={[styles.groupBlock, styles.blockDivider]}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="swap-horizontal-outline" size={21} color="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.blockTitle}>Crossfade</Text>
            </View>
          </View>
          <SegmentPicker
            options={CROSSFADE_OPTIONS}
            value={settings.crossfade}
            onChange={(val) => updateSettings({ crossfade: val })}
          />
        </View>

        {/* Gapless Playback */}
        <View style={[styles.row, styles.rowDivider]}>
          <Ionicons name="repeat-outline" size={22} color="rgba(255, 255, 255, 0.7)" style={styles.rowIcon} />
          <View style={styles.rowTextCol}>
            <Text style={styles.rowTitle}>Gapless Playback</Text>
            <Text style={styles.rowSubtitle}>Continuous audio without silence between tracks</Text>
          </View>
          <Switch
            value={settings.gapless}
            onValueChange={(v) => updateSettings({ gapless: v })}
            trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Normalize Volume */}
        <View style={styles.row}>
          <Ionicons name="volume-medium-outline" size={22} color="rgba(255, 255, 255, 0.7)" style={styles.rowIcon} />
          <View style={styles.rowTextCol}>
            <Text style={styles.rowTitle}>Normalize Volume</Text>
            <Text style={styles.rowSubtitle}>Keep volume consistent across all songs</Text>
          </View>
          <Switch
            value={settings.normalizeVolume}
            onValueChange={(v) => updateSettings({ normalizeVolume: v })}
            trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* ─── 3. Controls & Hardware ─── */}
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
});
