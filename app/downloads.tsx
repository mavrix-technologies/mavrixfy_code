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

import React, { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { useDownloads } from "@/contexts/DownloadContext";
import { onQueueEvent } from "@/lib/downloads/downloadManager";
import { DownloadItem, DownloadQuality } from "@/types/downloads";
import { formatBytes } from "@/lib/downloads/storagePolicy";
import {
  getCollectionMetadataSnapshot,
  loadAllCollectionMetadata,
  subscribeCollectionMetadata,
} from "@/lib/downloads/collectionMetadata";
import {
  PlaylistDownloadCard,
  QualityOptionRow,
  type PlaylistDownloadSection,
} from "@/components/downloads/DownloadRows";

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

const DOWNLOAD_QUALITY_OPTIONS: DownloadQuality[] = ["low", "medium", "high"];
type CollectionMetadataSummary = Record<string, { name: string; imageUrl: string }>;

function toCollectionMetadataSummary(metadata: ReturnType<typeof getCollectionMetadataSnapshot>): CollectionMetadataSummary {
  const mapped: CollectionMetadataSummary = {};
  for (const [id, data] of Object.entries(metadata)) {
    mapped[id] = { name: data.name, imageUrl: data.imageUrl };
  }
  return mapped;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DownloadsScreen() {
  return useDownloadsScreenView();
}

function useDownloadsScreenView() {
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
  const bumpStatusTick = useCallback(() => {
    setStatusTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const unsubs = [
      onQueueEvent("status", bumpStatusTick),
      onQueueEvent("completed", bumpStatusTick),
      onQueueEvent("failed", bumpStatusTick),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [bumpStatusTick]);

  const allItems = getAllDownloadItems();

  const [tab, setTab] = useState<"downloads" | "settings">("downloads");
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);

  // Load collection metadata
  const collectionMetadataSnapshot = useSyncExternalStore(
    subscribeCollectionMetadata,
    getCollectionMetadataSnapshot,
    getCollectionMetadataSnapshot
  );

  useEffect(() => {
    void loadAllCollectionMetadata();
  }, []);
  const collectionMetadata = useMemo(
    () => toCollectionMetadataSummary(collectionMetadataSnapshot),
    [collectionMetadataSnapshot]
  );

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

  const renderQualityOption = useCallback(
    ({ item }: { item: DownloadQuality }) => (
      <QualityOptionRow
        quality={item}
        selectedQuality={preferences.quality}
        onChange={handleQualityChange}
      />
    ),
    [handleQualityChange, preferences.quality]
  );

  const handleTogglePlaylistSection = useCallback(
    (collectionId: string) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      setExpandedPlaylistId((currentId) => currentId === collectionId ? null : collectionId);
    },
    []
  );

  const renderPlaylistDownloadSection = useCallback(
    ({ item }: { item: PlaylistDownloadSection }) => (
      <PlaylistDownloadCard
        section={item}
        expandedPlaylistId={expandedPlaylistId}
        onToggle={handleTogglePlaylistSection}
        onPause={handlePause}
        onResume={handleResume}
        onRetry={handleRetry}
        onRemove={handleRemove}
      />
    ),
    [expandedPlaylistId, handlePause, handleRemove, handleResume, handleRetry, handleTogglePlaylistSection]
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
      <View style={styles.storageHeader}>
        <View style={styles.storageIconWrap}>
          <Ionicons name="file-tray-full-outline" size={22} color={UI.primary} />
        </View>
        <View style={styles.storageInfo}>
          <Text style={styles.storageEyebrow}>Offline storage</Text>
          <Text style={styles.storageValue}>
            {formatBytes(storageSummary.totalDownloadedBytes)}
          </Text>
          <Text style={styles.storageCaption}>
            {storageSummary.completedTracks} downloaded · {storageSummary.pendingTracks} pending
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/downloaded-songs")}
          style={styles.storageAction}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="musical-notes-outline" size={18} color={UI.primary} />
          <Text style={styles.storageActionText}>Songs</Text>
        </Pressable>
      </View>

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
    <FlatList
      data={playlistSections}
      keyExtractor={(section) => section.collectionId}
      renderItem={renderPlaylistDownloadSection}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        playlistSections.length > 0 ? (
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Saved groups</Text>
            <Text style={styles.listSubtext}>{allItems.length} track{allItems.length !== 1 ? "s" : ""}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="arrow-down-circle-outline" size={48} color={UI.subtext} />
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptySub}>
            Tap the download icon on any song to save it for offline playback.
          </Text>
        </View>
      }
    />
  );

  // ─── Settings panel ───────────────────────────────────────────────────────

  const SettingsHeader = (
    <>
      <Text style={styles.settingsSection}>Download Constraints</Text>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Wi-Fi only</Text>
          <Text style={styles.settingDesc}>
            Preference only, network detection requires a future update
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
    </>
  );

  const SettingsFooter = (
    <>
      <Text style={[styles.settingsSection, { marginTop: 24 }]}>Storage</Text>

      <View style={styles.storageSettingCard}>
        <View style={styles.storageSettingIcon}>
          <Ionicons name="shield-checkmark-outline" size={18} color={UI.primary} />
        </View>
        <View style={styles.storageSettingInfo}>
          <Text style={styles.settingLabel}>Offline library</Text>
          <Text style={styles.settingDesc}>
            {formatBytes(storageSummary.totalDownloadedBytes)} used by {storageSummary.completedTracks} saved track{storageSummary.completedTracks !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.dangerRow, pressed && styles.dangerRowPressed]}
        onPress={handleRemoveAll}
      >
        <Ionicons name="trash-outline" size={18} color={UI.error} />
        <Text style={styles.dangerLabel}>Remove All Downloads</Text>
      </Pressable>
    </>
  );

  const SettingsPanel = (
    <FlatList
      data={DOWNLOAD_QUALITY_OPTIONS}
      keyExtractor={(quality) => quality}
      renderItem={renderQualityOption}
      ListHeaderComponent={SettingsHeader}
      ListFooterComponent={SettingsFooter}
      contentContainerStyle={styles.settingsContent}
      showsVerticalScrollIndicator={false}
    />
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
    paddingBottom: 10,
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
    marginBottom: 14,
    backgroundColor: "rgba(24,28,34,0.92)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.42)",
    overflow: "hidden",
  },
  storageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  storageIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "rgba(38,225,154,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  storageInfo: {
    flex: 1,
    minWidth: 0,
  },
  storageEyebrow: {
    color: UI.subtext,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  storageValue: {
    color: UI.text,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginTop: 3,
  },
  storageCaption: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  storageAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(38,225,154,0.1)",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.18)",
  },
  storageActionText: {
    color: UI.primary,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  storageStats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  storageStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: "rgba(38,42,49,0.68)",
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.28)",
  },
  storageStatNum: {
    color: UI.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums"],
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
    marginBottom: 0,
    backgroundColor: "rgba(24,28,34,0.9)",
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.28)",
  },
  tabBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
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
    paddingTop: 14,
    paddingBottom: 56,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  listTitle: {
    color: UI.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  listSubtext: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
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

  // Settings
  settingsContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 56,
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
    backgroundColor: "rgba(24,28,34,0.92)",
    borderRadius: 14,
    padding: 15,
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
  storageSettingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(24,28,34,0.92)",
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  storageSettingIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(38,225,154,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  storageSettingInfo: {
    flex: 1,
    minWidth: 0,
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    backgroundColor: "rgba(255,107,107,0.09)",
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.28)",
  },
  dangerRowPressed: {
    backgroundColor: "rgba(255,107,107,0.15)",
  },
  dangerLabel: {
    color: UI.error,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
