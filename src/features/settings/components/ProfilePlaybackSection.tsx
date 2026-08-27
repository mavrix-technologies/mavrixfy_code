import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { type AppSettings } from "@/lib/storage";
import { SegmentPicker } from "./SettingsUIComponents";
import {
  QUALITY_OPTIONS,
  SMART_AUTOPLAY_OPTIONS,
  MINI_PLAYER_OPTIONS,
} from "../constants/settingsConstants";

interface ProfilePlaybackSectionProps {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onQualityChange: (value: AppSettings["streamingQuality"]) => Promise<void>;
}

export function ProfilePlaybackSection({
  settings,
  updateSettings,
  onQualityChange,
}: ProfilePlaybackSectionProps) {
  return (
    <>
      <Text style={styles.sectionLabel}>AUDIO & PLAYBACK</Text>
      <View style={styles.sectionGroup}>
        {/* Quality */}
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
            onChange={onQualityChange}
          />
        </View>

        {/* Autoplay */}
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

        {/* Video Background */}
        <View style={[styles.row, styles.rowDivider]}>
          <Ionicons name="videocam-outline" size={22} color="rgba(255, 255, 255, 0.7)" style={styles.rowIcon} />
          <Text style={styles.rowTitle}>Video Background</Text>
          <Switch
            value={settings.ambientBackdropEnabled}
            onValueChange={(v) => updateSettings({ ambientBackdropEnabled: v })}
            trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: Colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Mini Player Control */}
        <View style={[styles.groupBlock, styles.blockDivider]}>
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
        <View style={styles.row}>
          <Ionicons name="phone-portrait-outline" size={22} color="rgba(255, 255, 255, 0.7)" style={styles.rowIcon} />
          <Text style={styles.rowTitle}>Haptic Feedback</Text>
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
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
  },
  rowIcon: {
    marginRight: 14,
  },
  rowTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontFamily: "Inter_500Medium",
  },
});
