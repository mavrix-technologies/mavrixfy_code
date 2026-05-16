/**
 * Downloads Screen — Download manager and storage management.
 *
 * Shows:
 * - All downloaded / in-progress / failed tracks
 * - Per-track actions (pause, resume, retry, remove)
 * - Storage usage summary
 * - Download preferences (Wi-Fi only, charging only, quality, auto-delete)
 * - Remove all downloads
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Switch,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { useDownloads } from "@/contexts/DownloadContext";
import { onQueueEvent } from "@/lib/downloads/downloadManager";
import { DownloadItem, DownloadStatus, DownloadQuality } from "@/types/downloads";
import { formatBytes } from "@/lib/downloads/storagePolicy";

// ─── UI constants ─────────────────────────────────────────────────────────────

const UI = {
  bg: Colors.background,
  text: Colors.text,
  subtext: Colors.subtext,
  surface: Colors.surface,
  surfaceLight: Colors.surfaceLight,
  primary: Colors.primary,
  error: Colors.error,
  border: Colors.cardBorder,
};

// ─── Status helpers ───────────────────────────────────────────────────────────

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
    case "completed": return Colors.primary;
    case "downloading": return Colors.primary;
    case "failed": return Colors.error;
    case "expired":
    case "revoked": return Colors.error;
    default: return Colors.subtext;
  }
}

// ─── Download Row ─────────────────────────────────────────────────────────────

interface DownloadRowProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

// ─── Playlist/Collection Section ──────────────────────────────────────────────

interface PlaylistDownloadSection {
  collectionId: string;
  collectionName: string;
  items: DownloadItem[];
  coverUrl?: string;
  totalSize: number;
  completedCount: number;
  downloadingCount: number;
  failedCount: number;
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
      {/* Cover art */}
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

      {/* Info */}
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowArtist} numberOfLines={1}>{item.artist}</Text>

        {/* Progress bar for active downloads */}
        {item.status === "downloading" && (
          <View style={styles.progressBarTrack}>
            <View
              style={[styles.progressBarFill, { width: `${item.progress}%` }]}
            />
          </View>
        )}

        <Text style={[styles.rowStatus, { color: statusColor(item.status) }]}>
          {item.status === "downloading"
            ? `${item.progress}% · ${formatBytes(item.bytesDownloaded)}`
            : statusLabel(item.status)}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.rowActions}>
        {canPause && (
          <Pressable
            onPress={() => onPause(item.songId)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pause" size={18} color={UI.subtext} />
          </Pressable>
        )}
        {canResume && (
          <Pressable
            onPress={() => onResume(item.songId)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="play" size={18} color={UI.primary} />
          </Pressable>
        )}
        {canRetry && (
          <Pressable
            onPress={() => onRetry(item.songId)}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh" size={18} color={UI.error} />
          </Pressable>
        )}
        {isActive && (
          <ActivityIndicator size="small" color={UI.primary} style={styles.spinner} />
        )}
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  const {
    preferences,
    storageSummary,
    isInitialized,
    pauseDownload,
    resumeDownload,
    retryDownload,
    removeDownload,
    removeAllDownloads,
    updatePreferences,
    refreshSummary,
    getAllDownloadItems,
  } = useDownloads();

  // Re-render this screen when any download status changes (not on progress ticks).
  const [, setStatusTick] = useState(0);
  useEffect(() => {
    const unsubs = [
      onQueueEvent("status", () => setStatusTick((n) => n + 1)),
      onQueueEvent("completed", () => setStatusTick((n) => n + 1)),
      onQueueEvent("failed", () => setStatusTick((n) => n + 1)),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const allItems = getAllDownloadItems();

  const [tab, setTab] = useState<"downloads" | "settings">("downloads");
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);

  // Load collection metadata
  const [collectionMetadata, setCollectionMetadata] = useState<Record<string, { name: string; imageUrl: string }>>({});

  useEffect(() => {
    async function loadMetadata() {
      const { loadAllCollectionMetadata } = await import("@/lib/downloads/collectionMetadata");
      const metadata = await loadAllCollectionMetadata();
      const mapped: Record<string, { name: string; imageUrl: string }> = {};
      for (const [id, data] of Object.entries(metadata)) {
        mapped[id] = { name: data.name, imageUrl: data.imageUrl };
      }
      setCollectionMetadata(mapped);
    }
    loadMetadata();
  }, []);

  // Group downloads by collection/playlist
  const playlistSections = useMemo<PlaylistDownloadSection[]>(() => {
    const collectionMap = new Map<string, DownloadItem[]>();
    const uncategorized: DownloadItem[] = [];

    for (const item of allItems) {
      if (item.collectionRefs && item.collectionRefs.length > 0) {
        // Add to each collection it belongs to
        for (const collectionId of item.collectionRefs) {
          if (!collectionMap.has(collectionId)) {
            collectionMap.set(collectionId, []);
          }
          collectionMap.get(collectionId)!.push(item);
        }
      } else {
        // No collection reference
        uncategorized.push(item);
      }
    }

    const sections: PlaylistDownloadSection[] = [];

    // Add collection sections
    for (const [collectionId, items] of collectionMap.entries()) {
      const completedCount = items.filter(i => i.status === "completed").length;
      const downloadingCount = items.filter(i => 
        i.status === "downloading" || 
        i.status === "queued" || 
        i.status === "waiting_for_wifi" || 
        i.status === "waiting_for_charging"
      ).length;
      const failedCount = items.filter(i => 
        i.status === "failed" || 
        i.status === "expired" || 
        i.status === "revoked"
      ).length;
      const totalSize = items.reduce((sum, i) => sum + (i.totalBytes || 0), 0);

      // Get metadata for this collection
      const metadata = collectionMetadata[collectionId];
      const collectionName = metadata?.name || `Playlist ${collectionId.slice(0, 8)}`;
      const coverUrl = metadata?.imageUrl || items[0]?.coverUrl;

      sections.push({
        collectionId,
        collectionName,
        items,
        coverUrl,
        totalSize,
        completedCount,
        downloadingCount,
        failedCount,
      });
    }

    // Add uncategorized section if any
    if (uncategorized.length > 0) {
      const completedCount = uncategorized.filter(i => i.status === "completed").length;
      const downloadingCount = uncategorized.filter(i => 
        i.status === "downloading" || 
        i.status === "queued" || 
        i.status === "waiting_for_wifi" || 
        i.status === "waiting_for_charging"
      ).length;
      const failedCount = uncategorized.filter(i => 
        i.status === "failed" || 
        i.status === "expired" || 
        i.status === "revoked"
      ).length;
      const totalSize = uncategorized.reduce((sum, i) => sum + (i.totalBytes || 0), 0);

      sections.push({
        collectionId: "uncategorized",
        collectionName: "Individual Downloads",
        items: uncategorized,
        totalSize,
        completedCount,
        downloadingCount,
        failedCount,
      });
    }

    return sections;
  }, [allItems, collectionMetadata]);

  const handlePause = useCallback(async (songId: string) => {
    await triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    await pauseDownload(songId);
  }, [pauseDownload]);

  const handleResume = useCallback(async (songId: string) => {
    await triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    await resumeDownload(songId);
  }, [resumeDownload]);

  const handleRetry = useCallback(async (songId: string) => {
    await triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    await retryDownload(songId);
  }, [retryDownload]);

  const handleRemove = useCallback((songId: string) => {
    const item = getAllDownloadItems().find((i) => i.songId === songId);
    Alert.alert(
      "Remove Download",
      `Remove "${item?.title ?? "this track"}" from offline storage?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
            await removeDownload(songId);
          },
        },
      ]
    );
  }, [getAllDownloadItems, removeDownload]);

  const handleRemoveAll = useCallback(() => {
    Alert.alert(
      "Remove All Downloads",
      "This will delete all downloaded tracks from this device. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove All",
          style: "destructive",
          onPress: async () => {
            await triggerImpact(Haptics.ImpactFeedbackStyle.Heavy);
            await removeAllDownloads();
            refreshSummary();
          },
        },
      ]
    );
  }, [removeAllDownloads, refreshSummary]);

  const handleQualityChange = useCallback(
    (quality: DownloadQuality) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      updatePreferences({ quality });
    },
    [updatePreferences]
  );

  // ─── Header ───────────────────────────────────────────────────────────────

  const Header = (
    <View style={[styles.header, { paddingTop: topPadding }]}>
      <Pressable
        onPress={() => router.back()}
        style={styles.backBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-back" size={24} color={UI.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Downloads</Text>
      <Pressable
        onPress={() => router.push("/downloaded-songs")}
        style={styles.headerActionBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="musical-notes-outline" size={20} color={UI.primary} />
      </Pressable>
    </View>
  );

  // ─── Storage card ─────────────────────────────────────────────────────────

  const StorageCard = (
    <View style={styles.storageCard}>
      <View style={styles.storageRow}>
        <View style={styles.storageIconWrap}>
          <Ionicons name="folder-open-outline" size={20} color={UI.primary} />
        </View>
        <View style={styles.storageInfo}>
          <Text style={styles.storageTitle}>Storage Used</Text>
          <Text style={styles.storageValue}>
            {formatBytes(storageSummary.totalDownloadedBytes)}
          </Text>
        </View>
      </View>
      <View style={styles.storageDivider} />
      <View style={styles.storageStats}>
        <View style={styles.storageStat}>
          <Text style={styles.storageStatNum}>{storageSummary.completedTracks}</Text>
          <Text style={styles.storageStatLabel}>Downloaded</Text>
        </View>
        <View style={styles.storageStat}>
          <Text style={styles.storageStatNum}>{storageSummary.pendingTracks}</Text>
          <Text style={styles.storageStatLabel}>Pending</Text>
        </View>
        <View style={styles.storageStat}>
          <Text style={[styles.storageStatNum, storageSummary.failedTracks > 0 && { color: UI.error }]}>
            {storageSummary.failedTracks}
          </Text>
          <Text style={styles.storageStatLabel}>Failed</Text>
        </View>
      </View>
    </View>
  );

  // ─── Tab bar ──────────────────────────────────────────────────────────────

  const TabBar = (
    <View style={styles.tabBar}>
      <Pressable
        style={[styles.tabBtn, tab === "downloads" && styles.tabBtnActive]}
        onPress={() => setTab("downloads")}
      >
        <Text style={[styles.tabLabel, tab === "downloads" && styles.tabLabelActive]}>
          Downloads
        </Text>
      </Pressable>
      <Pressable
        style={[styles.tabBtn, tab === "settings" && styles.tabBtnActive]}
        onPress={() => setTab("settings")}
      >
        <Text style={[styles.tabLabel, tab === "settings" && styles.tabLabelActive]}>
          Settings
        </Text>
      </Pressable>
    </View>
  );

  // ─── Downloads list ───────────────────────────────────────────────────────

  const DownloadsList = (
    <ScrollView
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    >
      {playlistSections.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="arrow-down-circle-outline" size={48} color={UI.subtext} />
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptySub}>
            Tap the download icon on any song to save it for offline playback.
          </Text>
        </View>
      ) : (
        <>
          {/* Playlist Cards */}
          {playlistSections.map((section) => (
            <View key={section.collectionId} style={styles.playlistCardContainer}>
              {/* Playlist Card */}
              <Pressable
                style={({ pressed }) => [
                  styles.playlistCard,
                  pressed && styles.playlistCardPressed,
                  expandedPlaylistId === section.collectionId && styles.playlistCardExpanded,
                ]}
                onPress={() => {
                  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPlaylistId(
                    expandedPlaylistId === section.collectionId ? null : section.collectionId
                  );
                }}
              >
                {/* Cover Image */}
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

                {/* Info */}
                <View style={styles.playlistCardInfo}>
                  <Text style={styles.playlistCardTitle} numberOfLines={2}>
                    {section.collectionName}
                  </Text>
                  <View style={styles.playlistCardStats}>
                    {section.completedCount > 0 && (
                      <View style={styles.playlistCardStat}>
                        <Ionicons name="checkmark-circle" size={12} color={UI.primary} />
                        <Text style={styles.playlistCardStatText}>{section.completedCount}</Text>
                      </View>
                    )}
                    {section.downloadingCount > 0 && (
                      <View style={styles.playlistCardStat}>
                        <Ionicons name="arrow-down-circle" size={12} color={UI.primary} />
                        <Text style={styles.playlistCardStatText}>{section.downloadingCount}</Text>
                      </View>
                    )}
                    {section.failedCount > 0 && (
                      <View style={styles.playlistCardStat}>
                        <Ionicons name="alert-circle" size={12} color={UI.error} />
                        <Text style={[styles.playlistCardStatText, { color: UI.error }]}>
                          {section.failedCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.playlistCardSize}>{formatBytes(section.totalSize)}</Text>
                </View>

                {/* Expand Icon */}
                <Ionicons
                  name={expandedPlaylistId === section.collectionId ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={UI.subtext}
                  style={styles.playlistCardChevron}
                />
              </Pressable>

              {/* Expanded Song List */}
              {expandedPlaylistId === section.collectionId && (
                <View style={styles.expandedSongList}>
                  {section.items.map((item) => (
                    <DownloadRow
                      key={item.songId}
                      item={item}
                      onPause={handlePause}
                      onResume={handleResume}
                      onRetry={handleRetry}
                      onRemove={handleRemove}
                    />
                  ))}
                </View>
              )}
            </View>
          ))}

          {/* Remove All Button */}
          {allItems.length > 0 && (
            <Pressable style={styles.removeAllBtn} onPress={handleRemoveAll}>
              <Ionicons name="trash-outline" size={16} color={UI.error} />
              <Text style={styles.removeAllText}>Remove All Downloads</Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );

  // ─── Settings panel ───────────────────────────────────────────────────────

  const SettingsPanel = (
    <ScrollView
      contentContainerStyle={styles.settingsContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.settingsSection}>Download Constraints</Text>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Wi-Fi only</Text>
          <Text style={styles.settingDesc}>
            Preference only — network detection requires a future update
          </Text>
        </View>
        <Switch
          value={preferences.wifiOnly}
          onValueChange={(v) => updatePreferences({ wifiOnly: v })}
          trackColor={{ false: UI.surfaceLight, true: UI.primary }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Charging only</Text>
          <Text style={styles.settingDesc}>
            Only download while the device is charging
          </Text>
        </View>
        <Switch
          value={preferences.chargingOnly}
          onValueChange={(v) => updatePreferences({ chargingOnly: v })}
          trackColor={{ false: UI.surfaceLight, true: UI.primary }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Auto-delete expired</Text>
          <Text style={styles.settingDesc}>
            Automatically remove downloads whose licenses have expired
          </Text>
        </View>
        <Switch
          value={preferences.autoDeleteExpired}
          onValueChange={(v) => updatePreferences({ autoDeleteExpired: v })}
          trackColor={{ false: UI.surfaceLight, true: UI.primary }}
          thumbColor="#fff"
        />
      </View>

      <Text style={[styles.settingsSection, { marginTop: 24 }]}>Download Quality</Text>

      {(["low", "medium", "high"] as const).map((q) => (
        <Pressable
          key={q}
          style={({ pressed }) => [
            styles.qualityRow,
            preferences.quality === q && styles.qualityRowActive,
            pressed && styles.qualityRowPressed,
          ]}
          onPress={() => handleQualityChange(q)}
          android_ripple={{ color: "rgba(38,225,154,0.15)", borderless: false }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.qualityInfo}>
            <Text style={styles.qualityLabel}>
              {q.charAt(0).toUpperCase() + q.slice(1)}
            </Text>
            <Text style={styles.qualityDesc}>
              {q === "low"
                ? "~48 kbps · Saves storage"
                : q === "medium"
                ? "~128 kbps · Balanced"
                : "~320 kbps · Best quality"}
            </Text>
          </View>
          {preferences.quality === q && (
            <Ionicons name="checkmark-circle" size={20} color={UI.primary} />
          )}
        </Pressable>
      ))}

      <Text style={[styles.settingsSection, { marginTop: 24 }]}>Storage</Text>

      <Pressable style={styles.dangerRow} onPress={handleRemoveAll}>
        <Ionicons name="trash-outline" size={18} color={UI.error} />
        <Text style={styles.dangerLabel}>Remove All Downloads</Text>
      </Pressable>
    </ScrollView>
  );

  // ─── Loading state ────────────────────────────────────────────────────────

  if (!isInitialized) {
    return (
      <View style={[styles.container, styles.centered]}>
        <LinearGradient
          colors={[Colors.backgroundGradientStart, Colors.background]}
          style={StyleSheet.absoluteFillObject}
        />
        <ActivityIndicator size="large" color={UI.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.backgroundGradientStart, Colors.background, Colors.background]}
        style={StyleSheet.absoluteFillObject}
      />

      {Header}
      {StorageCard}
      {TabBar}

      <View style={styles.tabContent}>
        {tab === "downloads" ? DownloadsList : SettingsPanel}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  // Storage card
  storageCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: UI.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  storageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  storageIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(38,225,154,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  storageInfo: {
    flex: 1,
  },
  storageTitle: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  storageValue: {
    color: UI.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  storageDivider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 12,
  },
  storageStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  storageStat: {
    alignItems: "center",
  },
  storageStatNum: {
    color: UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  storageStatLabel: {
    color: UI.subtext,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  // Tab bar
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: UI.surface,
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: UI.surfaceLight,
  },
  tabLabel: {
    color: UI.subtext,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  tabLabelActive: {
    color: UI.text,
  },

  tabContent: {
    flex: 1,
  },

  // Playlist Cards (homepage style)
  playlistCardContainer: {
    marginBottom: 12,
  },
  playlistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UI.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
    width: 80,
    height: 80,
    borderRadius: 8,
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
    marginBottom: 6,
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
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  playlistCardChevron: {
    marginLeft: 8,
  },
  expandedSongList: {
    backgroundColor: UI.surface,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },

  // Section headers (playlist groups) - REMOVED, using cards instead
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: UI.bg,
    marginTop: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  sectionCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  sectionCoverPlaceholder: {
    backgroundColor: UI.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionInfo: {
    flex: 1,
  },
  sectionTitle: {
    color: UI.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  sectionStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  sectionStat: {
    color: UI.subtext,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  sectionSize: {
    color: UI.subtext,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },

  // Download list
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
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

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptySub: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 20,
  },

  // Remove all
  removeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.3)",
  },
  removeAllText: {
    color: UI.error,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  // Settings
  settingsContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  settingsSection: {
    color: UI.subtext,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UI.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  settingDesc: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    lineHeight: 16,
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
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,107,107,0.08)",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.2)",
  },
  dangerLabel: {
    color: UI.error,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
