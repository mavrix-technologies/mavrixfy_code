/* eslint-disable react-hooks/immutability -- Reanimated shared values are updated inside user-event handlers. */
import AdMobBanner from "@/components/AdMobBanner";
import AppTopHeader,{
APP_TOP_HEADER_HEIGHT,
AppTopHeaderDownloadButton,
AppTopHeaderProfileButton,
useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { CollectionHero } from "@/components/CollectionHero";
import DownloadCollectionButton from "@/components/DownloadCollectionButton";
import { NavLikedIcon } from "@/components/OfficialNavIcons";
import OfflineBanner from "@/components/OfflineBanner";
import { SearchHeaderField } from "@/components/SearchHeaderField";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import { IS_ANDROID,IS_WEB } from "@/constants/platform";
import { useAuth } from "@/contexts/AuthContext";
import { useNetwork } from "@/contexts/NetworkContext";
import { useLikedSongs,usePlayerBrowse } from "@/contexts/PlayerContext";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import { triggerImpact } from "@/lib/haptics";
import { type Song } from "@/lib/musicData";
import { usePlaybackNowPlaying,usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import {FlatList,Pressable,StyleSheet,Text,TextInput,View,type NativeScrollEvent,type NativeSyntheticEvent } from "react-native";
import Animated,{
Easing,
useAnimatedStyle,
useSharedValue,
withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

import { LIKED_SONGS_UI as UI,styles } from "../styles/likedSongsStyles";

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
  const { likedSongs, status, initialized } = useLikedSongs();
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
  const stickyPlayScale = useSharedValue(0.7);
  const stickyPlayIsVisible = useSharedValue(false);
  const downloadTranslateX = useSharedValue(0);
  const [isStickyPlayActive, setIsStickyPlayActive] = useState(false);

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
        setIsStickyPlayActive(shouldShow);
        if (shouldShow) {
          downloadTranslateX.value = withTiming(-42, { duration: 220, easing: Easing.out(Easing.cubic) });
          stickyPlayOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
          stickyPlayScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.4)) });
        } else {
          downloadTranslateX.value = withTiming(0, { duration: 180, easing: Easing.inOut(Easing.cubic) });
          stickyPlayOpacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
          stickyPlayScale.value = withTiming(0.7, { duration: 140, easing: Easing.in(Easing.quad) });
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

  // Stable ref so handleSongPress/renderSong never recreate when list changes
  const playableFilteredSongs = filteredSongs;
  const filteredSongsRef = useRef(playableFilteredSongs);
  useEffect(() => {
    filteredSongsRef.current = playableFilteredSongs;
  }, [playableFilteredSongs]);

  const isPlayingFromLikedSongs = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    const songIds = new Set(songs.map((s) => s.id));
    return songIds.has(currentSong.id);
  }, [currentSong, songs]);

  const handlePlayAll = useCallback(() => {
    const listToPlay = (filteredSongs.length > 0 ? filteredSongs : songs);
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
    const listToPlay = (filteredSongs.length > 0 ? filteredSongs : songs);
    if (listToPlay.length === 0) return;
    void triggerImpact(ImpactFeedbackStyle.Light);
    shufflePlay(listToPlay);
  }, [filteredSongs, songs, shufflePlay]);

  const handleSongPress = useCallback(
    (song: Song) => {
      playSong(song, filteredSongsRef.current);
    },
    // filteredSongsRef is stable — read current value at call time
     
    [playSong]
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
          queue={filteredSongsRef.current}
          queueKey="liked-songs"
          optionContext="liked"
          horizontalPadding={4}
          showDownload={false}
          onSongPress={handleSongPress}
        />
      );
    },
    // handleSongPress is stable; filteredSongsRef read at call time — no re-render on list change
     
    [handleSongPress]
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
      <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />

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
        leftWidth={84}
        rightWidth={84}
        right={
          <View style={styles.headerRightContainer}>
            <Animated.View style={[styles.downloadButtonWrapper, downloadAnimStyle]}>
              <AppTopHeaderDownloadButton />
            </Animated.View>
            <Animated.View
              pointerEvents={isStickyPlayActive ? "auto" : "none"}
              style={[styles.stickyPlayButton, stickyPlayStyle]}
            >
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
                  size={16}
                  color="#06241A"
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

            <CollectionHero
              customIcon={<NavLikedIcon size={46} color="#042115" isFocused />}
              iconGradientColors={[UI.primaryA, UI.primaryB]}
              showIconCard={true}
              title="Liked Songs"
              meta={headerMeta}
              isPlaying={isPlayingFromLikedSongs && isPlaying}
              isShuffled={isShuffled}
              onPlayAll={handlePlayAll}
              onShufflePlay={handleShufflePlay}
              leftAction={
                <DownloadCollectionButton
                  songs={playableFilteredSongs}
                  collectionId="liked-songs"
                  collectionName="Liked Songs"
                  collectionImage=""
                  compact
                />
              }
            />


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
          !initialized || (status === "loading" && songs.length === 0) ? (
            <View style={{ paddingTop: 8 }}>
              <SongRowSkeleton count={8} />
            </View>
          ) : (
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
          )
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
          <LinearGradient colors={[Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
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


export default LikedSongsScreen;
