import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { formatBytes } from "@/lib/downloads/storagePolicy";
import { DownloadItem, DownloadQuality, DownloadStatus } from "@/types/downloads";

const UI = {
  text: Colors.text,
  subtext: Colors.subtext,
  surface: Colors.surface,
  surfaceLight: Colors.surfaceLight,
  primary: Colors.primary,
  error: Colors.error,
};

export interface PlaylistDownloadSection {
  collectionId: string;
  collectionName: string;
  items: DownloadItem[];
  coverUrl?: string;
  totalSize: number;
  completedCount: number;
  downloadingCount: number;
  failedCount: number;
}

interface DownloadRowProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

interface PlaylistDownloadCardProps {
  section: PlaylistDownloadSection;
  expandedPlaylistId: string | null;
  onToggle: (collectionId: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

interface QualityOptionRowProps {
  quality: DownloadQuality;
  selectedQuality: DownloadQuality;
  onChange: (quality: DownloadQuality) => void;
}

function statusLabel(status: DownloadStatus): string {
  switch (status) {
    case "queued": return "Queued";
    case "waiting_for_wifi": return "Waiting for Wi-Fi";
    case "waiting_for_charging": return "Waiting for charger";
    case "downloading": return "Downloading";
    case "paused": return "Paused";
    case "completed": return "Downloaded";
    case "failed": return "Failed";
    case "expired": return "Expired";
    case "revoked": return "Revoked";
    case "deleted": return "Deleted";
    default: return status;
  }
}

function statusColor(status: DownloadStatus): string {
  switch (status) {
    case "completed":
    case "downloading":
      return Colors.primary;
    case "failed":
    case "expired":
    case "revoked":
      return Colors.error;
    default:
      return Colors.subtext;
  }
}

function getQualityLabel(quality: DownloadQuality): string {
  return quality.charAt(0).toUpperCase() + quality.slice(1);
}

function getQualityDescription(quality: DownloadQuality): string {
  switch (quality) {
    case "low":
      return "~48 kbps · Saves storage";
    case "medium":
      return "~128 kbps · Balanced";
    case "high":
      return "~320 kbps · Best quality";
    default:
      return "";
  }
}

function DownloadRow({ item, onPause, onResume, onRetry, onRemove }: DownloadRowProps) {
  const isActive =
    item.status === "downloading" ||
    item.status === "queued" ||
    item.status === "waiting_for_wifi" ||
    item.status === "waiting_for_charging";

  const canPause = item.status === "downloading";
  const canResume = item.status === "paused" || item.status === "waiting_for_wifi" || item.status === "waiting_for_charging";
  const canRetry = item.status === "failed" || item.status === "expired" || item.status === "revoked";

  return (
    <View style={styles.row}>
      {item.coverUrl ? (
        <Image
          recyclingKey={item.songId}
          source={{ uri: item.coverUrl }}
          style={styles.rowCover}
          contentFit="cover"
          transition={80}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.rowCover, styles.rowCoverPlaceholder]}>
          <Ionicons name="musical-note" size={18} color={UI.subtext} />
        </View>
      )}

      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowArtist} numberOfLines={1}>{item.artist}</Text>

        {item.status === "downloading" ? (
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${item.progress}%` }]} />
          </View>
        ) : null}

        <Text style={[styles.rowStatus, { color: statusColor(item.status) }]}>
          {item.status === "downloading"
            ? `${item.progress}% · ${formatBytes(item.bytesDownloaded)}`
            : item.status === "completed"
            ? `Downloaded · ${formatBytes(item.totalBytes || item.bytesDownloaded)}`
            : statusLabel(item.status)}
        </Text>
      </View>

      <View style={styles.rowActions}>
        {canPause ? (
          <Pressable
            onPress={() => onPause(item.songId)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pause" size={18} color={UI.subtext} />
          </Pressable>
        ) : null}
        {canResume ? (
          <Pressable
            onPress={() => onResume(item.songId)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="play" size={18} color={UI.primary} />
          </Pressable>
        ) : null}
        {canRetry ? (
          <Pressable
            onPress={() => onRetry(item.songId)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh" size={18} color={UI.error} />
          </Pressable>
        ) : null}
        {isActive ? (
          <ActivityIndicator size="small" color={UI.primary} style={styles.spinner} />
        ) : null}
        <Pressable
          onPress={() => onRemove(item.songId)}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={18} color={UI.subtext} />
        </Pressable>
      </View>
    </View>
  );
}

export function PlaylistDownloadCard({
  section,
  expandedPlaylistId,
  onToggle,
  onPause,
  onResume,
  onRetry,
  onRemove,
}: PlaylistDownloadCardProps) {
  const expanded = expandedPlaylistId === section.collectionId;
  const handleToggle = useCallback(() => onToggle(section.collectionId), [onToggle, section.collectionId]);

  return (
    <View style={styles.playlistCardContainer}>
      <Pressable
        style={({ pressed }) => [
          styles.playlistCard,
          pressed && styles.playlistCardPressed,
          expanded && styles.playlistCardExpanded,
        ]}
        onPress={handleToggle}
      >
        {section.coverUrl ? (
          <Image
            recyclingKey={section.collectionId}
            source={{ uri: section.coverUrl }}
            style={styles.playlistCardCover}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.playlistCardCover, styles.playlistCardCoverPlaceholder]}>
            <Ionicons name="musical-notes" size={32} color={UI.subtext} />
          </View>
        )}

        <View style={styles.playlistCardInfo}>
          <Text style={styles.playlistCardTitle} numberOfLines={2}>
            {section.collectionName}
          </Text>
          <View style={styles.playlistCardStats}>
            {section.completedCount > 0 ? (
              <View style={styles.playlistCardStat}>
                <Ionicons name="checkmark-circle" size={12} color={UI.primary} />
                <Text style={styles.playlistCardStatText}>{section.completedCount}</Text>
              </View>
            ) : null}
            {section.downloadingCount > 0 ? (
              <View style={styles.playlistCardStat}>
                <Ionicons name="arrow-down-circle" size={12} color={UI.primary} />
                <Text style={styles.playlistCardStatText}>{section.downloadingCount}</Text>
              </View>
            ) : null}
            {section.failedCount > 0 ? (
              <View style={styles.playlistCardStat}>
                <Ionicons name="alert-circle" size={12} color={UI.error} />
                <Text style={[styles.playlistCardStatText, { color: UI.error }]}>
                  {section.failedCount}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.playlistCardSize}>{formatBytes(section.totalSize)}</Text>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={UI.subtext}
          style={styles.playlistCardChevron}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.expandedSongList}>
          {section.items.map((item) => (
            <DownloadRow
              key={item.songId}
              item={item}
              onPause={onPause}
              onResume={onResume}
              onRetry={onRetry}
              onRemove={onRemove}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function QualityOptionRow({ quality, selectedQuality, onChange }: QualityOptionRowProps) {
  const selected = selectedQuality === quality;
  const handlePress = useCallback(() => onChange(quality), [onChange, quality]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.qualityRow,
        selected && styles.qualityRowActive,
        pressed && styles.qualityRowPressed,
      ]}
      onPress={handlePress}
      android_ripple={{ color: "rgba(38,225,154,0.15)", borderless: false }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={styles.qualityInfo}>
        <Text style={styles.qualityLabel}>{getQualityLabel(quality)}</Text>
        <Text style={styles.qualityDesc}>{getQualityDescription(quality)}</Text>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={UI.primary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  playlistCardContainer: {
    marginBottom: 10,
  },
  playlistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(24,28,34,0.92)",
    borderRadius: 16,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.38)",
  },
  playlistCardPressed: {
    opacity: 0.7,
  },
  playlistCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  playlistCardCover: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  playlistCardCoverPlaceholder: {
    backgroundColor: UI.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistCardInfo: {
    flex: 1,
  },
  playlistCardTitle: {
    color: UI.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  playlistCardStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  playlistCardStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  playlistCardStatText: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  playlistCardSize: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  playlistCardChevron: {
    marginLeft: 8,
  },
  expandedSongList: {
    backgroundColor: "rgba(24,28,34,0.92)",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 12,
  },
  rowCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  rowCoverPlaceholder: {
    backgroundColor: UI.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  rowArtist: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  progressBarTrack: {
    height: 2,
    backgroundColor: UI.surfaceLight,
    borderRadius: 1,
    marginTop: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 2,
    backgroundColor: UI.primary,
    borderRadius: 1,
  },
  rowStatus: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 3,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionBtn: {
    padding: 4,
  },
  spinner: {
    marginHorizontal: 2,
  },
  qualityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UI.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  qualityRowActive: {
    borderColor: UI.primary,
    backgroundColor: "rgba(38,225,154,0.06)",
  },
  qualityRowPressed: {
    backgroundColor: "rgba(38,225,154,0.12)",
    transform: [{ scale: 0.98 }],
  },
  qualityInfo: {
    flex: 1,
  },
  qualityLabel: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  qualityDesc: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
});
