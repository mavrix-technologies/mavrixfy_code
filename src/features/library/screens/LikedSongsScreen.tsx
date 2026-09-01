import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, TextInput, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { IS_ANDROID, IS_WEB } from "@/constants/platform";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ImpactFeedbackStyle } from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useLikedSongs, usePlayerBrowse } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { type Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import DownloadCollectionButton from "@/components/DownloadCollectionButton";
import OfflineBanner from "@/components/OfflineBanner";
import SongRow from "@/components/SongRow";
import SearchHeaderField from "@/components/SearchHeaderField";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderDownloadButton,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { useNetwork } from "@/contexts/NetworkContext";
import AdMobBanner from "@/components/AdMobBanner";

const UI = {
  bg: "#10141a",
  text: "#dfe2eb",
  subtext: "#bccbb9",
  lowSurface: "#181c22",
  highSurface: "#262a31",
  outline: "rgba(61,74,61,0.35)",
  primaryA: "#26e19a",
  primaryB: "#00b87b",
};

const MOOD_SUGGESTIONS = [
  "Smooth",
  "Fast",
  "Soothing",
  "Pop",
  "Peaceful",
  "Love",
  "Motivation",
  "Mellow",
  "Soft",
  "Romantic",
  "Slow",
  "Soulful",
  "Quiet",
  "Relaxing",
  "Moody",
  "Party",
  "Desi",
] as const;

function normalizeText(text: string | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const likedSongKeyExtractor = (item: Song) => item.id;

// react-doctor-disable-next-line react-doctor/no-giant-component
export function LikedSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = IS_WEB ? 67 : insets.top;
  const { isAuthenticated } = useAuth();
  const { isOnline } = useNetwork();
  const { currentSong, isShuffled } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { likedSongs } = useLikedSongs();
  const { playSong, shufflePlay, togglePlay } = usePlayerBrowse();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const { isHeaderElevated, handleHeaderScroll } = useAppTopHeaderScrollElevation();

  // Reanimated shared values for the search overlay
  const searchOverlayOpacity = useSharedValue(0);
  const searchOverlayY = useSharedValue(-12);

  // Reanimated shared values for the smooth sticky play button and download readjustment
  const stickyPlayOpacity = useSharedValue(0);
  const stickyPlayScale = useSharedValue(0.82);
  const stickyPlayIsVisible = useSharedValue(false);
  const downloadTranslateX = useSharedValue(52);

  const stickyPlayStyle = useAnimatedStyle(() => ({
    opacity: stickyPlayOpacity.value,
    transform: [{ scale: stickyPlayScale.value }],
  }));

  const downloadAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: downloadTranslateX.value }],
  }));

  const openSearch = useCallback(() => {
    setIsSearchMode(true);
    searchOverlayOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    searchOverlayY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [searchOverlayOpacity, searchOverlayY]);

  const closeSearch = useCallback(() => {
    searchOverlayOpacity.value = withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) });
    searchOverlayY.value = withTiming(-10, { duration: 170, easing: Easing.in(Easing.quad) });
    setTimeout(() => {
      setIsSearchMode(false);
      setSearchQuery("");
    }, 170);
  }, [searchOverlayOpacity, searchOverlayY]);

  const searchOverlayStyle = useAnimatedStyle(() => ({
    opacity: searchOverlayOpacity.value,
    transform: [{ translateY: searchOverlayY.value }],
  }));

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleHeaderScroll(event);
      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldShow = offsetY > 240;
      if (shouldShow !== stickyPlayIsVisible.value) {
        stickyPlayIsVisible.value = shouldShow;
        if (shouldShow) {
          downloadTranslateX.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
          stickyPlayOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
          stickyPlayScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.4)) });
        } else {
          downloadTranslateX.value = withTiming(52, { duration: 180, easing: Easing.inOut(Easing.cubic) });
          stickyPlayOpacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
          stickyPlayScale.value = withTiming(0.82, { duration: 140, easing: Easing.in(Easing.quad) });
        }
      }
    },
    [handleHeaderScroll, stickyPlayIsVisible, stickyPlayOpacity, stickyPlayScale, downloadTranslateX]
  );

  const songs = useMemo(() => {
    if (!Array.isArray(likedSongs)) return [];
    return likedSongs.filter((song) => song && song.id && song.title);
  }, [likedSongs]);

  const filteredSongs = useMemo(() => {
    let list = songs;

    if (selectedMood) {
      const moodLower = normalizeText(selectedMood);
      const moodKeywords: Record<string, string[]> = {
        smooth: ["smooth", "soothing", "mellow", "soft", "breeze", "quiet", "easy"],
        fast: ["fast", "dance", "upbeat", "bhangra", "party", "beat", "rap"],
        soothing: ["soothing", "relaxing", "peaceful", "calm", "unplugged", "chill", "soft", "meditation"],
        pop: ["pop", "dance", "electronic", "synth", "party", "hit"],
        peaceful: ["peaceful", "soothing", "quiet", "relaxing", "ambient", "prayer", "shanti"],
        love: ["love", "dil", "pyar", "ishq", "heart", "pyaar", "valentine", "romantic", "forever"],
        motivation: ["motivation", "gym", "power", "win", "hustle", "victory", "fire", "rise"],
        mellow: ["mellow", "soft", "acoustic", "gentle", "chill", "quiet", "breeze"],
        soft: ["soft", "gentle", "piano", "acoustic", "lofi", "lullaby", "slow"],
        romantic: ["romantic", "love", "dil", "pyar", "ishq", "sanam", "tere", "humsafar", "heart"],
        slow: ["slow", "unplugged", "reverb", "acoustic", "ballad", "subtle"],
        soulful: ["soulful", "sufi", "sufism", "gazal", "ghazal", "khuda", "aayat", "duaa", "raahat"],
        quiet: ["quiet", "peaceful", "silent", "night", "sleep", "rest", "lofi"],
        relaxing: ["relaxing", "calm", "chill", "spa", "breeze", "nature", "waves"],
        moody: ["moody", "sad", "alone", "dark", "broken", "judai", "pain", "tears"],
        party: ["party", "club", "dj", "remix", "dance", "bhangra", "bass", "dhamaka"],
        desi: ["desi", "punjabi", "hindi", "bollywood", "bhangra", "t-series", "filmi"],
      };

      const rawKeywords = moodKeywords[moodLower] || [moodLower];
      const escapedKeywords = rawKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const moodRegex = new RegExp(`(?:${escapedKeywords.join("|")})`, "i");

      list = list.filter((song) => {
        const title = normalizeText(song.title);
        const artist = normalizeText(song.artist);
        const album = normalizeText(song.album);
        const genre = normalizeText(song.genre);
        const moodAttr = Array.isArray(song.mood)
          ? song.mood.map((m) => normalizeText(m)).join(" ")
          : normalizeText(song.mood);

        const combined = `${title} ${artist} ${album} ${genre} ${moodAttr}`;
        return moodRegex.test(combined);
      });
    }

    if (!searchQuery.trim()) return list;
    const escapedQuery = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedQuery, "i");
    return list.filter((song) => {
      const combined = `${normalizeText(song.title)} ${normalizeText(song.artist)} ${normalizeText(song.album)}`;
      return searchRegex.test(combined);
    });
  }, [songs, selectedMood, searchQuery]);

  const isPlayingFromLikedSongs = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    const songIds = new Set(songs.map((s) => s.id));
    return songIds.has(currentSong.id);
  }, [currentSong, songs]);

  const handlePlayAll = useCallback(() => {
    const listToPlay = filteredSongs.length > 0 ? filteredSongs : songs;
    if (listToPlay.length === 0) return;
    void triggerImpact(ImpactFeedbackStyle.Light);
    if (isPlayingFromLikedSongs && isPlaying) {
      togglePlay();
      return;
    }
    if (isShuffled) {
      shufflePlay(listToPlay);
    } else {
      playSong(listToPlay[0], listToPlay);
    }
  }, [filteredSongs, songs, isPlayingFromLikedSongs, isPlaying, togglePlay, isShuffled, shufflePlay, playSong]);

  const handleShufflePlay = useCallback(() => {
    const listToPlay = filteredSongs.length > 0 ? filteredSongs : songs;
    if (listToPlay.length === 0) return;
    void triggerImpact(ImpactFeedbackStyle.Light);
    shufflePlay(listToPlay);
  }, [filteredSongs, songs, shufflePlay]);

  const handleSongPress = useCallback(
    (song: Song) => {
      playSong(song, filteredSongs);
    },
    [filteredSongs, playSong]
  );

  const keyExtractor = likedSongKeyExtractor;

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: 68,
      offset: 68 * index,
      index,
    }),
    []
  );

  const renderSong = useCallback(
    ({ item }: { item: Song }) => {
      return (
        <SongRow
          song={item}
          queue={filteredSongs}
          queueKey="liked-songs"
          horizontalPadding={8}
          showDownload={false}
          onSongPress={handleSongPress}
        />
      );
    },
    [filteredSongs, handleSongPress]
  );

  const renderMoodChip = useCallback(
    ({ item: mood }: { item: string }) => (
      <Pressable
        onPress={() => setSelectedMood(mood)}
        accessibilityRole="button"
        accessibilityLabel={`Filter by ${mood}`}
        accessibilityState={{ selected: false }}
        style={({ pressed }) => [
          styles.moodChip,
          pressed && styles.moodChipPressed,
        ]}
      >
        <Text style={styles.moodChipText}>{mood}</Text>
      </Pressable>
    ),
    [setSelectedMood]
  );

  const availableMoods = useMemo(
    () => (selectedMood ? MOOD_SUGGESTIONS.filter((m) => m !== selectedMood) : MOOD_SUGGESTIONS),
    [selectedMood]
  );

  const headerMeta = selectedMood
    ? `${filteredSongs.length} songs • ${selectedMood}`
    : songs.length > 0
      ? `${songs.length} songs`
      : "No songs";

  return (
    <View style={styles.container}>
      {/* Base background */}
      <LinearGradient colors={["#09111B", "#10141a", "#10141a"]} style={StyleSheet.absoluteFillObject} />

      {/* Ambient glow — bleeds the primary green from top header area downward */}
      <LinearGradient
        colors={[
          "rgba(38,225,154,0.22)",
          "rgba(20,180,120,0.10)",
          "rgba(10,100,70,0.04)",
          "transparent",
        ]}
        locations={[0, 0.38, 0.62, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.ambientGlow}
      />

      {!isOnline && <OfflineBanner />}
      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Liked Songs"
        left={<AppTopHeaderProfileButton />}
        rightWidth={96}
        right={
          <View style={styles.headerRightContainer}>
            <Animated.View style={downloadAnimStyle}>
              <AppTopHeaderDownloadButton />
            </Animated.View>
            <Animated.View style={[styles.stickyPlayButton, stickyPlayStyle]}>
              <Pressable
                onPress={handlePlayAll}
                accessibilityRole="button"
                accessibilityLabel={isPlayingFromLikedSongs && isPlaying ? "Pause liked songs" : "Play liked songs"}
                style={({ pressed }) => [
                  styles.stickyPlayInner,
                  pressed && styles.stickyPlayButtonPressed,
                ]}
              >
                <Ionicons
                  name={isPlayingFromLikedSongs && isPlaying ? "pause" : "play"}
                  size={18}
                  color="#06241a"
                  style={!isPlayingFromLikedSongs || !isPlaying ? { marginLeft: 1 } : undefined}
                />
              </Pressable>
            </Animated.View>
          </View>
        }
      />

      <FlatList
        data={filteredSongs}
        keyExtractor={keyExtractor}
        renderItem={renderSong}
        getItemLayout={getItemLayout}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={IS_ANDROID}
        ListHeaderComponent={
          <>
            <Pressable
              onPress={openSearch}
              accessibilityRole="button"
              accessibilityLabel="Search liked songs"
              style={styles.searchContainer}
            >
              <View pointerEvents="none">
                <SearchHeaderField
                  value=""
                  onChangeText={() => {}}
                  onClear={() => {}}
                  placeholder="Search liked songs..."
                />
              </View>
            </Pressable>
            <View style={styles.heroSection}>
              <LinearGradient
                colors={[UI.primaryA, UI.primaryB]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIconCard}
              >
                <Ionicons name="heart" size={38} color="#042115" />
              </LinearGradient>
              <Text style={styles.heroTitle}>Liked Songs</Text>
              <Text style={styles.heroMeta}>{headerMeta.toUpperCase()}</Text>
            </View>

            <View style={styles.actionSection}>
              <View style={styles.leftActions}>
                <DownloadCollectionButton
                  songs={filteredSongs}
                  collectionId="liked-songs"
                  collectionName="Liked Songs"
                  collectionImage=""
                  compact
                  style={styles.utilityIcon}
                />
              </View>

              <View style={styles.rightActions}>
                <Pressable
                  onPress={handleShufflePlay}
                  accessibilityRole="button"
                  accessibilityLabel={isShuffled ? "Shuffle on" : "Shuffle off"}
                  accessibilityState={{ checked: isShuffled }}
                  style={({ pressed }) => [
                    styles.shuffleButton,
                    pressed && styles.shuffleButtonPressed,
                  ]}
                  android_ripple={{ color: "rgba(255,255,255,0.1)", borderless: true, radius: 28 }}
                >
                  <Ionicons
                    name="shuffle"
                    size={22}
                    color={isShuffled ? UI.primaryA : UI.subtext}
                  />
                  {isShuffled && <View style={styles.shuffleDot} />}
                </Pressable>

                <Pressable
                  onPress={handlePlayAll}
                  accessibilityRole="button"
                  accessibilityLabel={isPlayingFromLikedSongs && isPlaying ? "Pause liked songs" : "Play liked songs"}
                  style={({ pressed }) => [styles.playAllButton, pressed && styles.playAllButtonPressed]}
                  android_ripple={{ color: "rgba(0,0,0,0.15)", borderless: false }}
                >
                  <Ionicons
                    name={isPlayingFromLikedSongs && isPlaying ? "pause" : "play"}
                    size={28}
                    color="#06241a"
                    style={!isPlayingFromLikedSongs || !isPlaying ? { marginLeft: 3 } : undefined}
                  />
                </Pressable>
              </View>
            </View>

            {songs.length > 0 && (
              <View style={styles.moodSection}>
                <FlatList
                  horizontal
                  data={availableMoods}
                  keyExtractor={(item) => item}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.moodScrollContent}
                  ListHeaderComponent={
                    selectedMood ? (
                      <Pressable
                        onPress={() => setSelectedMood(null)}
                        accessibilityRole="button"
                        accessibilityLabel={`${selectedMood} mood filter, selected`}
                        accessibilityState={{ selected: true }}
                        style={[styles.moodChip, styles.moodChipActive]}
                      >
                        <Ionicons name="close" size={14} color="#042115" style={{ marginRight: 4 }} />
                        <Text style={[styles.moodChipText, styles.moodChipTextActive]}>{selectedMood}</Text>
                      </Pressable>
                    ) : null
                  }
                  renderItem={renderMoodChip}
                />
              </View>
            )}

            <AdMobBanner loadDelayMs={800} />

            <Pressable
              onPress={() => {
                void triggerImpact(ImpactFeedbackStyle.Light);
                globalAddSongsSheetRef.current?.expand();
              }}
              accessibilityRole="button"
              accessibilityLabel="Add songs to liked songs"
              style={({ pressed }) => [
                styles.addSongsContainer,
                pressed && styles.addSongsContainerPressed,
              ]}
            >
              <View style={styles.addSongsSquare}>
                <Ionicons name="add" size={26} color={UI.text} />
              </View>
              <Text style={styles.addSongsText}>Add songs</Text>
            </Pressable>

            {filteredSongs.length > 0 ? <View style={styles.songListSpacer} /> : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name={selectedMood ? "funnel-outline" : searchQuery ? "search-outline" : "heart-outline"} size={56} color={UI.subtext} />
            <Text style={styles.emptyTitle}>
              {selectedMood
                ? `No ${selectedMood} songs found`
                : searchQuery
                  ? "No songs found"
                  : isAuthenticated
                    ? "No liked songs yet"
                    : "Sign in to view liked songs"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {selectedMood
                ? `None of your liked songs matched the ${selectedMood} mood.`
                : searchQuery
                  ? `No results for "${searchQuery}"`
                  : isAuthenticated
                    ? "Tap the heart on any song to save it here."
                    : "Sign in to sync your liked songs across all your devices."}
            </Text>
          </View>
        }
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInset + APP_TOP_HEADER_HEIGHT },
          filteredSongs.length === 0 ? styles.listContentEmpty : undefined,
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {/* Animated search overlay — slides in smoothly over the main screen */}
      {isSearchMode && (
        <Animated.View style={[styles.searchOverlay, searchOverlayStyle]}>
          <LinearGradient colors={["#09111B", "#10141a"]} style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={["rgba(38,225,154,0.14)", "transparent"]}
            style={[styles.ambientGlow, { height: 160 }]}
          />

          {/* Search header */}
          <View style={[styles.searchModeHeader, { paddingTop: topInset + 10 }]}>
            <View style={{ flex: 1 }}>
              <SearchHeaderField
                value={searchQuery}
                onChangeText={setSearchQuery}
                onClear={() => setSearchQuery("")}
                placeholder="Search liked songs..."
                autoFocus={true}
              />
            </View>
            <Pressable
              onPress={closeSearch}
              accessibilityRole="button"
              accessibilityLabel="Cancel search"
              style={styles.searchModeCancelButton}
            >
              <Text style={styles.searchModeCancelText}>Cancel</Text>
            </Pressable>
          </View>

          {/* Results list */}
          <FlatList
            data={filteredSongs}
            keyExtractor={keyExtractor}
            renderItem={renderSong}
            getItemLayout={getItemLayout}
            contentContainerStyle={styles.searchModeListContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={IS_ANDROID}
            ListEmptyComponent={
              searchQuery ? (
                <View style={styles.searchModeEmptyWrap}>
                  <Ionicons name="search-outline" size={48} color={UI.subtext} style={{ opacity: 0.7 }} />
                  <Text style={styles.searchModeEmptyTitle}>No results found</Text>
                  <Text style={styles.searchModeEmptySubtitle}>
                    {`No liked songs matched "${searchQuery}"`}
                  </Text>
                </View>
              ) : null
            }
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  ambientGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    zIndex: 0,
  },
  searchContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: UI.lowSurface,
    gap: 8,
  },
  searchPlaceholderText: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 152,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  heroSection: {
    alignItems: "center",
    marginTop: 14,
  },
  heroIconCard: {
    width: 112,
    height: 112,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    marginTop: 14,
    color: UI.text,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  heroMeta: {
    marginTop: 6,
    color: UI.subtext,
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: "Inter_600SemiBold",
  },
  actionSection: {
    marginTop: 18,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  playAllButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.primaryA,
    borderWidth: 1.5,
    borderColor: "rgba(38,225,154,0.6)",
  },
  playAllButtonPressed: {
    backgroundColor: UI.primaryB,
    borderColor: "rgba(0,184,123,0.8)",
    transform: [{ scale: 0.96 }],
  },
  shuffleButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  shuffleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: UI.primaryA,
  },
  shuffleButtonPressed: {
    opacity: 0.55,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  utilityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,42,49,0.48)",
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.2)",
  },
  songListSpacer: {
    height: 10,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingTop: 40,
    gap: 8,
  },
  emptyTitle: {
    color: UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtitle: {
    color: UI.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  searchModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  searchModeInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    height: 48,
    backgroundColor: UI.lowSurface,
    gap: 8,
  },
  searchModeInput: {
    flex: 1,
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  searchClearButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  searchModeCancelButton: {
    height: 48,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  searchModeCancelText: {
    color: UI.primaryA,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  searchModeListContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 100,
  },
  searchModeEmptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 8,
  },
  searchModeEmptyTitle: {
    color: UI.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  searchModeEmptySubtitle: {
    color: UI.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  headerRightContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  stickyPlayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyPlayInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: UI.primaryA,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyPlayButtonPressed: {
    backgroundColor: UI.primaryB,
    transform: [{ scale: 0.94 }],
  },
  moodSection: {
    marginVertical: 10,
    marginHorizontal: -14,
  },
  moodScrollContent: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: "center",
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: UI.highSurface,
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.38)",
  },
  moodChipActive: {
    backgroundColor: UI.primaryA,
    borderColor: "rgba(38,225,154,0.8)",
  },
  moodChipPressed: {
    backgroundColor: "rgba(38,225,154,0.14)",
    borderColor: UI.primaryA,
    transform: [{ scale: 0.96 }],
  },
  moodChipText: {
    color: UI.text,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  moodChipTextActive: {
    color: "#042115",
    fontFamily: "Inter_700Bold",
  },
  addSongsContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginVertical: 4,
    gap: 14,
  },
  addSongsContainerPressed: {
    opacity: 0.7,
  },
  addSongsSquare: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: UI.highSurface,
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  addSongsText: {
    color: UI.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});

export default LikedSongsScreen;
