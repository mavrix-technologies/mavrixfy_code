/**
 * DownloadButton — per-song download state button.
 *
 * Downloading state shows a circular SVG progress ring that fills clockwise,
 * with a pause icon in the center. Tap while downloading → pause immediately.
 */

import React, { useCallback } from "react";
import { Pressable, View, Text, StyleSheet, Alert } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Song } from "@/lib/musicData";
import { useDownloadsSafe, useSongDownload } from "@/contexts/DownloadContext";
import { DownloadStatus } from "@/types/downloads";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { formatBytes } from "@/lib/downloads/storagePolicy";

const AVG_BYTES_PER_SECOND = 25_000; // ~200 kbps estimate

interface DownloadButtonProps {
  song: Song;
  size?: number;
  collectionId?: string;
  style?: object;
}

// ─── Circular progress ring ───────────────────────────────────────────────────

interface CircleProgressProps {
  size: number;       // outer diameter
  progress: number;   // 0–100
  strokeWidth?: number;
}

function CircleProgress({ size, progress, strokeWidth = 2.5 }: CircleProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // clamp 0–100, start from top (rotate -90°)
  const pct = Math.max(0, Math.min(100, progress));
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const center = size / 2;
  const pauseSize = size * 0.38;
  const pauseBarW = pauseSize * 0.28;
  const pauseBarH = pauseSize * 0.72;
  const pauseGap = pauseSize * 0.18;
  const pauseX1 = center - pauseGap / 2 - pauseBarW;
  const pauseX2 = center + pauseGap / 2;
  const pauseY = center - pauseBarH / 2;

  return (
    <Svg width={size} height={size}>
      {/* Track ring */}
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke="rgba(38,225,154,0.18)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Progress arc — rotated so it starts at 12 o'clock */}
      <G rotation="-90" origin={`${center}, ${center}`}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={Colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </G>
      {/* Pause bars in center */}
      {/* Left bar */}
      <G>
        <Circle
          cx={pauseX1 + pauseBarW / 2}
          cy={center}
          r={0}
          fill="none"
        />
      </G>
    </Svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DownloadButton({
  song,
  size = 22,
  collectionId,
  style,
}: DownloadButtonProps) {
  const item = useSongDownload(song.id);
  const ctx = useDownloadsSafe();

  const status: DownloadStatus | "none" = item?.status ?? "none";
  const progress = item?.progress ?? 0;
  const totalBytes = item?.totalBytes ?? 0;

  const handlePress = useCallback(async () => {
    if (!ctx) return;
    const { downloadSong, pauseDownload, resumeDownload, retryDownload, removeDownload } = ctx;
    await triggerImpact(Haptics.ImpactFeedbackStyle.Light);

    switch (status) {
      case "none":
      case "deleted": {
        const estimatedBytes = (song.duration ?? 0) * AVG_BYTES_PER_SECOND;
        Alert.alert(
          "Download Song",
          `Download "${song.title}" for offline playback?\n\nEstimated size: ~${formatBytes(estimatedBytes)}`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Download",
              onPress: async () => {
                const result = await downloadSong(song, { collectionId });
                if (!result.ok) Alert.alert("Download Failed", result.reason);
              },
            },
          ]
        );
        break;
      }

      case "downloading":
        // Tap pauses immediately — no alert needed
        await pauseDownload(song.id);
        break;

      case "queued":
      case "waiting_for_wifi":
      case "waiting_for_charging":
        Alert.alert(
          "Queued",
          status === "waiting_for_wifi"
            ? "Waiting for Wi-Fi connection."
            : status === "waiting_for_charging"
            ? "Waiting for device to charge."
            : "Queued — will start shortly.",
          [
            { text: "Keep Queued", style: "cancel" },
            {
              text: "Cancel",
              style: "destructive",
              onPress: () => removeDownload(song.id, collectionId),
            },
          ]
        );
        break;

      case "paused":
        await resumeDownload(song.id);
        break;

      case "failed":
        Alert.alert(
          "Download Failed",
          item?.failureReason ? `Error: ${item.failureReason}\n\nRetry?` : "Retry this download?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Retry", onPress: () => retryDownload(song.id) },
          ]
        );
        break;

      case "completed": {
        const sizeLabel = totalBytes > 0 ? ` (${formatBytes(totalBytes)})` : "";
        Alert.alert(
          "Remove Download",
          `Remove "${song.title}"${sizeLabel} from offline storage?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Remove",
              style: "destructive",
              onPress: () => removeDownload(song.id, collectionId),
            },
          ]
        );
        break;
      }

      case "revoked":
      case "expired":
        Alert.alert(
          "License Expired",
          "Re-download to listen offline.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Re-download",
              onPress: async () => {
                await removeDownload(song.id);
                const result = await downloadSong(song, { collectionId });
                if (!result.ok) Alert.alert("Download Failed", result.reason);
              },
            },
          ]
        );
        break;
    }
  }, [ctx, status, song, collectionId, item?.failureReason, totalBytes]);

  if (!ctx) return null;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityLabel={getA11yLabel(status, song.title)}
      accessibilityRole="button"
    >
      {renderIcon(status, size, progress)}
    </Pressable>
  );
}

// ─── Icon renderer ────────────────────────────────────────────────────────────

function renderIcon(status: DownloadStatus | "none", size: number, progress: number) {
  switch (status) {

    case "completed":
      return <Ionicons name="arrow-down-circle" size={size} color={Colors.primary} />;

    case "downloading": {
      // Circular progress ring with pause icon in center
      const ringSize = size + 6;
      const pauseBarH = size * 0.34;
      const pauseBarW = size * 0.13;
      const gap = size * 0.1;
      return (
        <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center" }}>
          {/* SVG ring */}
          <CircleProgress size={ringSize} progress={progress} strokeWidth={2.2} />
          {/* Pause icon overlay */}
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <View style={[styles.pauseBar, { width: pauseBarW, height: pauseBarH, marginRight: gap }]} />
            <View style={[styles.pauseBar, { width: pauseBarW, height: pauseBarH }]} />
          </View>
          {/* % label below ring */}
          {progress > 0 && (
            <Text style={[styles.progressPct, { fontSize: Math.max(7, size * 0.32) }]}>
              {progress}%
            </Text>
          )}
        </View>
      );
    }

    case "queued":
    case "waiting_for_wifi":
    case "waiting_for_charging": {
      // Indeterminate ring (empty arc) + clock icon
      const ringSize = size + 6;
      return (
        <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center" }}>
          <CircleProgress size={ringSize} progress={15} strokeWidth={2.2} />
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <Ionicons name="time-outline" size={size * 0.7} color={Colors.subtext} />
          </View>
        </View>
      );
    }

    case "paused": {
      // Ring frozen at current progress + play icon
      const ringSize = size + 6;
      return (
        <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center" }}>
          <CircleProgress size={ringSize} progress={progress > 0 ? progress : 30} strokeWidth={2.2} />
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <Ionicons name="play" size={size * 0.55} color={Colors.primary} style={{ marginLeft: size * 0.08 }} />
          </View>
        </View>
      );
    }

    case "failed":
      return <Ionicons name="refresh-circle-outline" size={size} color={Colors.error} />;

    case "revoked":
    case "expired":
      return <Ionicons name="lock-closed-outline" size={size} color={Colors.subtext} />;

    default:
      return <Ionicons name="arrow-down-circle-outline" size={size} color={Colors.subtext} />;
  }
}

function getA11yLabel(status: DownloadStatus | "none", title: string): string {
  switch (status) {
    case "completed":   return `${title} downloaded. Tap to remove.`;
    case "downloading": return `Downloading ${title}. Tap to pause.`;
    case "paused":      return `${title} paused. Tap to resume.`;
    case "queued":      return `${title} queued.`;
    case "failed":      return `${title} failed. Tap to retry.`;
    default:            return `Download ${title}`;
  }
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.6 },
  ringCenter: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  pauseBar: {
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressPct: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
    lineHeight: 10,
    position: "absolute",
    bottom: -10,
  },
});
