/**
 * Downloaded Songs — Spotify-style offline library.
 *
 * Clean, premium, and unified with LikedSongsScreen.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import { useDownloads } from "@/contexts/DownloadContext";
import { onQueueEvent } from "@/lib/downloads/downloadManager";
import { DownloadItem } from "@/types/downloads";
import { Song } from "@/lib/musicData";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import SongRow from "@/components/SongRow";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderIconButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { formatBytes, getTrackFileUri } from "@/lib/downloads/storagePolicy";
import AdMobBanner from "@/components/AdMobBanner";
import CollectionHero from "@/components/CollectionHero";
import ActionCircleButton from "@/components/ActionCircleButton";

import { DOWNLOADS_UI as UI, styles } from "../styles/downloadedSongsStyles";


function downloadItemToSong(item: DownloadItem): Song {
  return {
    id: item.songId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    audioUrl: getTrackFileUri(item.songId),
    duration: item.duration,
    genre: "",
    source: "local",
  };
}

const songKeyExtractor = (item: Song) => item.id;

// react-doctor-disable-next-line react-doctor/no-giant-component -- screen layout component for downloaded songs offline library
export function DownloadedSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const {
    getAllDownloadItems,
    storageSummary,
    removeAllDownloads,
  } = useDownloads();

  const { currentSong, isShuffled } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay, toggleShuffle } = usePlayerBrowse();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [showStickyPlay, setShowStickyPlay] = useState(false);

  const {
    isHeaderElevated,
    handleHeaderScroll,
  } = useAppTopHeaderScrollElevation();

  // Reactive download items state updated on queue events
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>(() => getAllDownloadItems());

  useEffect(() => {
    setDownloadItems(getAllDownloadItems());
    const unsubs = [
      onQueueEvent("completed", () => setDownloadItems(getAllDownloadItems())),
      onQueueEvent("status", () => setDownloadItems(getAllDownloadItems())),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [getAllDownloadItems]);

  const completedSongs = useMemo<Song[]>(() => {
    return downloadItems
      .filter((item) => item.status === "completed")
      .sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      })
      .map(downloadItemToSong);
  }, [downloadItems]);

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

  const keyExtractor = songKeyExtractor;

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

  const getItemLayout = useCallback(
    (_data: ArrayLike<Song> | null | undefined, index: number) => ({
      length: 68,
      offset: 68 * index,
      index,
    }),
    []
  );

  const totalBytesFormatted = useMemo(() => {
    return storageSummary.totalDownloadedBytes > 0
      ? formatBytes(storageSummary.totalDownloadedBytes)
      : "0 B";
  }, [storageSummary.totalDownloadedBytes]);

  const headerMeta = useMemo(() => {
    if (completedSongs.length === 0) return "No downloaded songs";
    const count = `${completedSongs.length} ${completedSongs.length === 1 ? "song" : "songs"}`;
    return totalBytesFormatted && totalBytesFormatted !== "0 B"
      ? `${count} • ${totalBytesFormatted}`
      : count;
  }, [completedSongs.length, totalBytesFormatted]);

  const handleConfirmDeleteAll = useCallback(() => {
    if (completedSongs.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      "Delete All Downloads",
      `Are you sure you want to remove all ${completedSongs.length} downloaded song${completedSongs.length === 1 ? "" : "s"} (${totalBytesFormatted}) from your device?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            void triggerImpact(Haptics.ImpactFeedbackStyle.Heavy);
            await removeAllDownloads();
            setDownloadItems([]);
          },
        },
      ]
    );
  }, [completedSongs.length, totalBytesFormatted, removeAllDownloads]);

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
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
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
        title="Downloaded Songs"
        left={
          <AppTopHeaderIconButton
            iconName="chevron-back"
            iconSize={24}
            accessibilityLabel="Back"
            onPress={() => {
              router.back();
            }}
          />
        }
        rightWidth={showStickyPlay ? 44 : completedSongs.length > 0 ? 40 : 0}
        right={
          showStickyPlay ? (
            <View style={styles.headerRightContainer}>
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
                  color="#06241A"
                  style={!isPlayingFromDownloaded || !isPlaying ? { marginLeft: 1 } : undefined}
                />
              </Pressable>
            </View>
          ) : completedSongs.length > 0 ? (
            <AppTopHeaderIconButton
              iconName="trash-outline"
              iconSize={20}
              iconColor="#F8FBF9"
              accessibilityLabel="Delete all downloaded songs"
              onPress={handleConfirmDeleteAll}
              haptic={true}
            />
          ) : null
        }
      />

      <View style={[styles.mainWrap, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT }]}>
        <FlatList
          data={filteredSongs}
          keyExtractor={keyExtractor}
          renderItem={renderSong}
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
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

              <CollectionHero
                iconName="arrow-down-circle"
                iconColor="#26E19A"
                title="Downloaded Songs"
                meta={headerMeta}
                isPlaying={isPlayingFromDownloaded && isPlaying}
                isShuffled={isShuffled && isPlayingFromDownloaded}
                onPlayAll={handlePlayAll}
                onShufflePlay={handleShufflePlay}
                leftAction={
                  completedSongs.length > 0 ? (
                    <ActionCircleButton
                      iconName="trash-outline"
                      size={44}
                      iconSize={20}
                      iconColor="#F8FBF9"
                      accessibilityLabel="Delete all downloaded songs"
                      onPress={handleConfirmDeleteAll}
                    />
                  ) : null
                }
              />

                <AdMobBanner loadDelayMs={800} />

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
              { paddingBottom: Math.max(insets.bottom, 0) + 140 },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          />
      </View>
    </View>
  );
}


export default DownloadedSongsScreen;
