/**
 * Downloaded Songs — Spotify-style offline library with tabs.
 *
 * Clean, premium, and unified with LikedSongsScreen and Settings.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { useDownloads } from "@/contexts/DownloadContext";
import { onQueueEvent } from "@/lib/downloads/downloadManager";
import { DownloadItem, DownloadQuality } from "@/types/downloads";
import { Song } from "@/lib/musicData";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import SongRow from "@/components/SongRow";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderIconButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { formatBytes } from "@/lib/downloads/storagePolicy";

const UI = {
  bg: "#10141a",
  card: "#181c22",
  cardHover: "#20242b",
  border: "rgba(255, 255, 255, 0.08)",
  text: "#dfe2eb",
  subtext: "#8e99a8",
  lowSurface: "#181c22",
  highSurface: "#262a31",
  primaryA: "#26e19a",
  primaryB: "#00b87b",
  error: "#ff5449",
};

const QUALITY_OPTIONS: { label: string; sub: string; value: DownloadQuality }[] = [
  { label: "High Quality", sub: "~320 kbps · Full studio fidelity audio", value: "high" },
  { label: "Normal Quality", sub: "~128 kbps · Standard balance of speed & quality", value: "medium" },
  { label: "Low Quality", sub: "~48 kbps · Uses minimal device storage", value: "low" },
];

function downloadItemToSong(item: DownloadItem): Song {
  return {
    id: item.songId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    audioUrl: item.audioUrl,
    duration: item.duration,
    genre: "",
    source: "jiosaavn",
  };
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- screen layout component containing downloads and storage settings tabs
export function DownloadedSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const {
    getAllDownloadItems,
    storageSummary,
    preferences,
    updatePreferences,
    removeAllDownloads,
    refreshSummary,
  } = useDownloads();

  const { currentSong, isShuffled } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay, toggleShuffle } = usePlayerBrowse();

  const [activeTab, setActiveTab] = useState<"songs" | "settings">("songs");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [showStickyPlay, setShowStickyPlay] = useState(false);

  const {
    isHeaderElevated,
    handleHeaderScroll,
  } = useAppTopHeaderScrollElevation();

  // Re-render when download statuses change
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubs = [
      onQueueEvent("completed", () => setTick((n) => n + 1)),
      onQueueEvent("status", () => setTick((n) => n + 1)),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const completedSongs = useMemo<Song[]>(() => {
    return getAllDownloadItems()
      .filter((item) => item.status === "completed")
      .sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      })
      .map(downloadItemToSong);
  }, [getAllDownloadItems]);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return completedSongs;
    const query = searchQuery.toLowerCase().trim();
    return completedSongs.filter(
      (song) =>
        (song.title && song.title.toLowerCase().includes(query)) ||
        (song.artist && song.artist.toLowerCase().includes(query)) ||
        (song.album && song.album.toLowerCase().includes(query))
    );
  }, [completedSongs, searchQuery]);

  const isPlayingFromDownloaded = useMemo(() => {
    if (!currentSong || completedSongs.length === 0) return false;
    const songIds = new Set(completedSongs.map((s) => s.id));
    return songIds.has(currentSong.id);
  }, [currentSong, completedSongs]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleHeaderScroll(event);
      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldShowSticky = offsetY > 240;
      setShowStickyPlay((prev) => (prev === shouldShowSticky ? prev : shouldShowSticky));
    },
    [handleHeaderScroll]
  );

  const handlePlayAll = useCallback(() => {
    const listToPlay = filteredSongs.length > 0 ? filteredSongs : completedSongs;
    if (listToPlay.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromDownloaded) {
      togglePlay();
      return;
    }
    playSong(listToPlay[0], listToPlay);
    if (isShuffled) {
      toggleShuffle();
    }
  }, [filteredSongs, completedSongs, isPlayingFromDownloaded, togglePlay, playSong, isShuffled, toggleShuffle]);

  const handleShufflePlay = useCallback(() => {
    const listToPlay = filteredSongs.length > 0 ? filteredSongs : completedSongs;
    if (listToPlay.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    shufflePlay(listToPlay);
  }, [filteredSongs, completedSongs, shufflePlay]);

  const handleQualityChange = useCallback(
    (quality: DownloadQuality) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      updatePreferences({ quality });
    },
    [updatePreferences]
  );

  const handleRemoveAll = useCallback(() => {
    Alert.alert(
      "Remove All Downloads",
      "This will delete all downloaded songs from this device to free up storage space. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
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

  const keyExtractor = useCallback((item: Song) => item.id, []);

  const renderSong = useCallback(
    ({ item }: { item: Song }) => {
      return (
        <SongRow
          song={item}
          queue={filteredSongs}
          queueKey="downloaded-songs"
          horizontalPadding={8}
          showDownload={false}
        />
      );
    },
    [filteredSongs]
  );

  const totalBytesFormatted = useMemo(() => {
    return storageSummary.totalDownloadedBytes > 0
      ? formatBytes(storageSummary.totalDownloadedBytes)
      : "0 B";
  }, [storageSummary.totalDownloadedBytes]);

  const headerMeta = `${completedSongs.length} SONGS • ${totalBytesFormatted} OFFLINE`;

  if (isSearchMode) {
    return (
      <View style={styles.searchModeContainer}>
        <LinearGradient colors={["#09111B", "#10141a", "#10141a"]} style={StyleSheet.absoluteFillObject} />

        {/* Search Header */}
        <View style={[styles.searchModeHeader, { paddingTop: topInset + 10 }]}>
          <View style={styles.searchModeInputWrapper}>
            <Ionicons name="search" size={18} color={UI.subtext} />
            <TextInput
              style={styles.searchModeInput}
              placeholder="Search downloaded songs..."
              placeholderTextColor={UI.subtext}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              selectionColor={UI.primaryA}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery("")}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={18} color={UI.subtext} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
              setIsSearchMode(false);
              setSearchQuery("");
            }}
            hitSlop={12}
            style={styles.searchModeCancelButton}
          >
            <Text style={styles.searchModeCancelText}>Cancel</Text>
          </Pressable>
        </View>

        {/* Results List */}
        <FlatList
          data={filteredSongs}
          keyExtractor={keyExtractor}
          renderItem={renderSong}
          contentContainerStyle={styles.searchModeListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== "web"}
          ListEmptyComponent={
            searchQuery ? (
              <View style={styles.searchModeEmptyWrap}>
                <Ionicons name="search-outline" size={48} color={UI.subtext} style={{ opacity: 0.7 }} />
                <Text style={styles.searchModeEmptyTitle}>No results found</Text>
                <Text style={styles.searchModeEmptySubtitle}>
                  {`No downloaded songs matched "${searchQuery}"`}
                </Text>
              </View>
            ) : null
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#09111B", "#10141a", "#10141a"]} style={StyleSheet.absoluteFillObject} />

      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title={activeTab === "songs" ? "Downloads" : "Download Settings"}
        left={
          <AppTopHeaderIconButton
            iconName="chevron-back"
            iconSize={24}
            accessibilityLabel="Back"
            onPress={() => {
              if (activeTab === "settings") {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("songs");
              } else {
                router.back();
              }
            }}
          />
        }
        rightWidth={activeTab === "songs" && showStickyPlay ? 80 : 40}
        right={
          <View style={styles.headerRightContainer}>
            <AppTopHeaderIconButton
              iconName={activeTab === "songs" ? "options-outline" : "musical-notes-outline"}
              iconSize={20}
              accessibilityLabel={activeTab === "songs" ? "Settings" : "Songs"}
              onPress={() => {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab((prev) => (prev === "songs" ? "settings" : "songs"));
              }}
            />
            {activeTab === "songs" && showStickyPlay && (
              <Pressable
                onPress={handlePlayAll}
                style={({ pressed }) => [
                  styles.stickyPlayButton,
                  pressed && styles.stickyPlayButtonPressed,
                ]}
              >
                <Ionicons
                  name={isPlayingFromDownloaded && isPlaying ? "pause" : "play"}
                  size={15}
                  color="#06241a"
                  style={!isPlayingFromDownloaded || !isPlaying ? { marginLeft: 1 } : undefined}
                />
              </Pressable>
            )}
          </View>
        }
      />

      <View style={[styles.mainWrap, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT }]}>
        {/* Segmented Tab Bar */}
        <View style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            <Pressable
              style={[styles.tabBtn, activeTab === "songs" && styles.tabBtnActive]}
              onPress={() => {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("songs");
              }}
            >
              <Ionicons
                name="musical-notes"
                size={15}
                color={activeTab === "songs" ? "#042115" : UI.subtext}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabBtnText, activeTab === "songs" && styles.tabBtnTextActive]}>
                Songs ({completedSongs.length})
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabBtn, activeTab === "settings" && styles.tabBtnActive]}
              onPress={() => {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("settings");
              }}
            >
              <Ionicons
                name="settings-outline"
                size={15}
                color={activeTab === "settings" ? "#042115" : UI.subtext}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabBtnText, activeTab === "settings" && styles.tabBtnTextActive]}>
                Storage & Settings
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tab 1: Downloaded Songs View */}
        {activeTab === "songs" ? (
          <FlatList
            data={filteredSongs}
            keyExtractor={keyExtractor}
            renderItem={renderSong}
            initialNumToRender={15}
            maxToRenderPerBatch={15}
            windowSize={7}
            removeClippedSubviews={Platform.OS !== "web"}
            ListHeaderComponent={
              <>
                <Pressable
                  onPress={() => {
                    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                    setIsSearchMode(true);
                  }}
                  style={styles.searchContainer}
                >
                  <View style={styles.searchInputWrapper}>
                    <Ionicons name="search" size={16} color={UI.subtext} />
                    <Text style={styles.searchPlaceholderText}>Search downloaded songs...</Text>
                  </View>
                </Pressable>

                <View style={styles.heroSection}>
                  <LinearGradient
                    colors={[UI.primaryA, UI.primaryB]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroIconCard}
                  >
                    <Ionicons name="arrow-down-circle" size={38} color="#042115" />
                  </LinearGradient>
                  <Text style={styles.heroTitle}>Downloaded Songs</Text>
                  <Text style={styles.heroMeta}>{headerMeta}</Text>
                </View>

                <View style={styles.actionSection}>
                  <Pressable
                    onPress={() => {
                      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                      setActiveTab("settings");
                    }}
                    style={styles.storageBadge}
                  >
                    <Ionicons name="phone-portrait-outline" size={14} color={UI.primaryA} />
                    <Text style={styles.storageBadgeText}>{totalBytesFormatted}</Text>
                    <Ionicons name="chevron-forward" size={12} color={UI.primaryA} style={{ marginLeft: 2 }} />
                  </Pressable>

                  <View style={styles.rightActions}>
                    <Pressable
                      onPress={handleShufflePlay}
                      style={({ pressed }) => [
                        styles.shuffleButton,
                        isShuffled && isPlayingFromDownloaded && styles.shuffleButtonActive,
                        pressed && styles.shuffleButtonPressed,
                      ]}
                      android_ripple={{ color: "rgba(255,255,255,0.12)", borderless: false }}
                    >
                      <Ionicons
                        name="shuffle"
                        size={24}
                        color={isShuffled && isPlayingFromDownloaded ? UI.primaryA : UI.text}
                      />
                    </Pressable>

                    <Pressable
                      onPress={handlePlayAll}
                      style={({ pressed }) => [styles.playAllButton, pressed && styles.playAllButtonPressed]}
                      android_ripple={{ color: "rgba(0,0,0,0.15)", borderless: false }}
                    >
                      <Ionicons
                        name={isPlayingFromDownloaded && isPlaying ? "pause" : "play"}
                        size={28}
                        color="#06241a"
                        style={!isPlayingFromDownloaded || !isPlaying ? { marginLeft: 3 } : undefined}
                      />
                    </Pressable>
                  </View>
                </View>

                {filteredSongs.length > 0 ? <View style={styles.songListSpacer} /> : null}
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons
                  name={searchQuery ? "search-outline" : "arrow-down-circle-outline"}
                  size={56}
                  color={UI.subtext}
                />
                <Text style={styles.emptyTitle}>
                  {searchQuery ? "No songs found" : "No downloaded songs"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? `No results for "${searchQuery}"`
                    : "Tap the download icon on any song or playlist to save it for offline playback."}
                </Text>
                {!searchQuery && (
                  <Pressable
                    style={styles.browseBtn}
                    onPress={() => router.push("/(tabs)/search")}
                  >
                    <Text style={styles.browseBtnText}>Browse Music</Text>
                  </Pressable>
                )}
              </View>
            }
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              completedSongs.length === 0 ? styles.listContentEmpty : undefined,
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          />
        ) : (
          /* Tab 2: Settings & Storage View */
          <ScrollView
            style={styles.settingsScrollView}
            contentContainerStyle={[styles.settingsScrollContent, { paddingBottom: Math.max(insets.bottom + 20, 100) }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Storage Hero Card */}
            <View style={styles.storageCard}>
              <View style={styles.storageTopRow}>
                <View style={styles.storageTextGroup}>
                  <Text style={styles.storageTitle}>Offline Storage</Text>
                  <Text style={styles.storageValue}>{totalBytesFormatted}</Text>
                </View>
                <View style={styles.storageIconWrap}>
                  <Ionicons name="phone-portrait-outline" size={24} color={UI.primaryA} />
                </View>
              </View>

              <View style={styles.storageMetricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricNum}>{storageSummary.completedTracks}</Text>
                  <Text style={styles.metricLabel}>Saved</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricNum}>{storageSummary.pendingTracks}</Text>
                  <Text style={styles.metricLabel}>Pending</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={[styles.metricNum, storageSummary.failedTracks > 0 && { color: UI.error }]}>
                    {storageSummary.failedTracks}
                  </Text>
                  <Text style={styles.metricLabel}>Failed</Text>
                </View>
              </View>
            </View>

            {/* Audio Quality Section */}
            <Text style={styles.sectionHeaderTitle}>Audio Download Quality</Text>
            <View style={styles.groupedCard}>
              {QUALITY_OPTIONS.map((opt, idx) => {
                const isSelected = preferences.quality === opt.value;
                return (
                  <React.Fragment key={opt.value}>
                    {idx > 0 && <View style={styles.settingDivider} />}
                    <Pressable
                      style={({ pressed }) => [
                        styles.qualityItemRow,
                        isSelected && styles.qualityItemRowActive,
                        pressed && styles.qualityItemRowPressed,
                      ]}
                      onPress={() => handleQualityChange(opt.value)}
                    >
                      <View style={styles.qualityTextCol}>
                        <Text style={[styles.qualityItemTitle, isSelected && styles.qualityItemTitleActive]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.qualityItemSub}>{opt.sub}</Text>
                      </View>
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>

            {/* Network & Power Section */}
            <Text style={[styles.sectionHeaderTitle, { marginTop: 22 }]}>Network & Power</Text>
            <View style={styles.groupedCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Download over Wi-Fi only</Text>
                  <Text style={styles.settingDesc}>Prevents using mobile cellular data</Text>
                </View>
                <Switch
                  value={preferences.wifiOnly}
                  onValueChange={(v) => updatePreferences({ wifiOnly: v })}
                  trackColor={{ false: "#2a2f38", true: UI.primaryA }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.settingDivider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Download only when charging</Text>
                  <Text style={styles.settingDesc}>Preserves battery when running unplugged</Text>
                </View>
                <Switch
                  value={preferences.chargingOnly}
                  onValueChange={(v) => updatePreferences({ chargingOnly: v })}
                  trackColor={{ false: "#2a2f38", true: UI.primaryA }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.settingDivider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Auto-delete expired</Text>
                  <Text style={styles.settingDesc}>Cleans up expired offline tracks</Text>
                </View>
                <Switch
                  value={preferences.autoDeleteExpired}
                  onValueChange={(v) => updatePreferences({ autoDeleteExpired: v })}
                  trackColor={{ false: "#2a2f38", true: UI.primaryA }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* Delete All Section */}
            <Text style={[styles.sectionHeaderTitle, { marginTop: 22 }]}>Storage Cleanup</Text>
            <Pressable
              style={({ pressed }) => [styles.dangerCard, pressed && styles.dangerCardPressed]}
              onPress={handleRemoveAll}
            >
              <Ionicons name="trash-outline" size={18} color={UI.error} style={{ marginRight: 8 }} />
              <Text style={styles.dangerText}>Delete All Offline Downloads</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  mainWrap: {
    flex: 1,
  },
  headerRightContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  stickyPlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: UI.primaryA,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
  },
  stickyPlayButtonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  tabBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: UI.card,
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: UI.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 20,
  },
  tabBtnActive: {
    backgroundColor: UI.primaryA,
  },
  tabBtnText: {
    color: UI.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  tabBtnTextActive: {
    color: "#042115",
    fontFamily: "Inter_700Bold",
  },
  searchContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UI.lowSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  searchPlaceholderText: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginLeft: 8,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  heroIconCard: {
    width: 96,
    height: 96,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    boxShadow: "0 8px 16px rgba(38, 225, 154, 0.35)",
  },
  heroTitle: {
    color: UI.text,
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  heroMeta: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  actionSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  storageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(38, 225, 154, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(38, 225, 154, 0.2)",
  },
  storageBadgeText: {
    color: UI.primaryA,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  shuffleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  shuffleButtonActive: {
    backgroundColor: "rgba(38, 225, 154, 0.12)",
  },
  shuffleButtonPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.8,
  },
  playAllButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: UI.primaryA,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 10px rgba(38, 225, 154, 0.35)",
  },
  playAllButtonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  songListSpacer: {
    height: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: UI.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtitle: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  browseBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: UI.primaryA,
  },
  browseBtnText: {
    color: "#042115",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  searchModeContainer: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  searchModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  searchModeInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UI.lowSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  searchModeInput: {
    flex: 1,
    color: UI.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginLeft: 8,
    paddingVertical: 0,
  },
  searchModeCancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  searchModeCancelText: {
    color: UI.subtext,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  searchModeListContent: {
    paddingTop: 8,
    paddingBottom: 120,
  },
  searchModeEmptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  searchModeEmptyTitle: {
    color: UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  searchModeEmptySubtitle: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  // Settings tab styles
  settingsScrollView: {
    flex: 1,
  },
  settingsScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  storageCard: {
    backgroundColor: UI.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: UI.border,
    marginBottom: 20,
  },
  storageTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  storageTextGroup: {
    flex: 1,
  },
  storageTitle: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  storageValue: {
    color: UI.text,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  storageIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(38, 225, 154, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  storageMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#13171d",
    borderRadius: 10,
    paddingVertical: 10,
  },
  metricItem: {
    alignItems: "center",
    flex: 1,
  },
  metricNum: {
    color: UI.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  metricLabel: {
    color: UI.subtext,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  sectionHeaderTitle: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  groupedCard: {
    backgroundColor: UI.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    overflow: "hidden",
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginHorizontal: 14,
  },
  qualityItemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  qualityItemRowActive: {
    backgroundColor: "#1c222b",
  },
  qualityItemRowPressed: {
    backgroundColor: UI.cardHover,
  },
  qualityTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  qualityItemTitle: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  qualityItemTitleActive: {
    color: UI.primaryA,
  },
  qualityItemSub: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: UI.subtext,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleActive: {
    borderColor: UI.primaryA,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI.primaryA,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 12,
  },
  settingLabel: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  settingDesc: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  dangerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 84, 73, 0.08)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 84, 73, 0.2)",
    marginTop: 4,
  },
  dangerCardPressed: {
    backgroundColor: "rgba(255, 84, 73, 0.16)",
  },
  dangerText: {
    color: UI.error,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

export default DownloadedSongsScreen;
