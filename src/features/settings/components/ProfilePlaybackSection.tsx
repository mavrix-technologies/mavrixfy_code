import Colors from "@/constants/colors";
import { useDownloads } from "@/contexts/DownloadContext";
import { formatBytes } from "@/lib/downloads/storagePolicy";
import { triggerImpact } from "@/lib/haptics";
import { type AppSettings } from "@/lib/storage";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { useCallback } from "react";
import { Alert,Pressable,StyleSheet,Switch,Text,View } from "react-native";
import {
DOWNLOAD_QUALITY_OPTIONS,
MINI_PLAYER_OPTIONS,
QUALITY_OPTIONS,
SMART_AUTOPLAY_OPTIONS,
} from "../constants/settingsConstants";
import { SegmentPicker } from "./SettingsUIComponents";

interface ProfilePlaybackSectionProps {
  section: "streaming-downloads" | "playback" | "controls";
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onQualityChange: (value: AppSettings["streamingQuality"]) => Promise<void>;
  loadingQuality?: AppSettings["streamingQuality"] | null;
}

export function ProfilePlaybackSection({
  section,
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
        });
        await onQualityChange("low");
      } else {
        await updateSettings({
          dataSaverEnabled: false,
        });
        await onQualityChange("auto");
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
      {section === "streaming-downloads" && (
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
      )}

      {section === "playback" && (
        <View style={styles.sectionGroup}>
        {/* Ambient Artwork */}
        <View style={styles.groupBlock}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="image-outline" size={21} color="rgba(255, 255, 255, 0.7)" />
              <View>
                <Text style={styles.blockTitle}>Artwork Background</Text>
                <Text style={styles.rowSubtitle}>Use the current song cover behind the player</Text>
              </View>
            </View>
            <Switch
              value={settings.ambientBackdropEnabled}
              onValueChange={(v) => updateSettings({ ambientBackdropEnabled: v })}
              trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
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
      )}

      {section === "controls" && (
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
      )}
    </>
  );
}

const styles = StyleSheet.create({
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
