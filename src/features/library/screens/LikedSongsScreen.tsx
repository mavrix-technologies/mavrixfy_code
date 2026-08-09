import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View, TextInput, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/src/services/audio/PlaybackEngine";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import DownloadCollectionButton from "@/components/DownloadCollectionButton";
import OfflineBanner from "@/src/components/OfflineBanner";
import SongRow from "@/src/components/SongRow";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderDownloadButton,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/src/components/AppTopHeader";
import { useNetwork } from "@/contexts/NetworkContext";

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

// react-doctor-disable-next-line react-doctor/no-giant-component
export function LikedSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { isAuthenticated } = useAuth();
  const { isOnline } = useNetwork();
  const { currentSong, queue, isShuffled } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, likedSongs, togglePlay, toggleShuffle } = usePlayerActions();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const {
    isHeaderElevated,
    handleHeaderScroll,
  } = useAppTopHeaderScrollElevation();
  const [showStickyPlay, setShowStickyPlay] = useState(false);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleHeaderScroll(event);
      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldShowSticky = offsetY > 240;
      setShowStickyPlay((prev) => (prev === shouldShowSticky ? prev : shouldShowSticky));
    },
    [handleHeaderScroll]
  );

  const songs = useMemo(() => {
    if (!Array.isArray(likedSongs)) return [];
    return likedSongs.filter((song) => song && song.id && song.title);
  }, [likedSongs]);

  const filteredSongs = useMemo(() => {
    let list = songs;

    if (selectedMood) {
      const moodLower = selectedMood.toLowerCase();
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

      const targetKeywords = moodKeywords[moodLower] || [moodLower];

      const matches = list.filter((song) => {
        const title = (song.title || "").toLowerCase();
        const artist = (song.artist || "").toLowerCase();
        const album = (song.album || "").toLowerCase();
        const genre = (song.genre || "").toLowerCase();
        const moodAttr = Array.isArray(song.mood)
          ? song.mood.join(" ").toLowerCase()
          : (song.mood || "").toLowerCase();

        if (genre.includes(moodLower) || moodAttr.includes(moodLower)) return true;

        return targetKeywords.some(
          (kw) => title.includes(kw) || artist.includes(kw) || album.includes(kw)
        );
      });

      if (matches.length > 0) {
        list = matches;
      } else {
        const hashVal = moodLower.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        list = songs.filter((_, idx) => (idx + hashVal) % 3 !== 0);
        if (list.length === 0) list = songs;
      }
    }

    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase();
    return list.filter((song) =>
      song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)
    );
  }, [songs, selectedMood, searchQuery]);

  const isPlayingFromLikedSongs = useMemo(() => {
    if (!currentSong || songs.length === 0 || queue.length !== songs.length) return false;
    const songIds = new Set(songs.map((s) => s.id));
    return queue.every((qs) => songIds.has(qs.id));
  }, [currentSong, queue, songs]);

  const handlePlayAll = useCallback(() => {
    if (songs.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromLikedSongs) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
    if (isShuffled) {
      void toggleShuffle();
    }
  }, [songs, isPlayingFromLikedSongs, togglePlay, playSong, isShuffled, toggleShuffle]);

  const handleShufflePlay = useCallback(() => {
    if (songs.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    
    if (isPlayingFromLikedSongs) {
      void toggleShuffle();
      return;
    }

    const shuffled = [...songs];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const rand = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[rand]] = [shuffled[rand], shuffled[index]];
    }
    playSong(shuffled[0], shuffled);
    if (!isShuffled) {
      void toggleShuffle();
    }
  }, [songs, isPlayingFromLikedSongs, playSong, isShuffled, toggleShuffle]);

  const filteredSongsQueueKey = useMemo(
    () => filteredSongs.map((song) => song.id).join("|"),
    [filteredSongs]
  );

  const renderSong = useCallback(
    ({ item }: { item: Song; index: number }) => {
      return <SongRow song={item} queue={filteredSongs} queueKey={filteredSongsQueueKey} horizontalPadding={8} />;
    },
    [filteredSongs, filteredSongsQueueKey]
  );

  const headerMeta = selectedMood
    ? `${filteredSongs.length} songs • ${selectedMood}`
    : songs.length > 0
      ? `${songs.length} songs`
      : "No songs";

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
              placeholder="Search liked songs..."
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
          keyExtractor={(item) => item.id}
          renderItem={renderSong}
          contentContainerStyle={styles.searchModeListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#09111B", "#10141a", "#10141a"]} style={StyleSheet.absoluteFillObject} />
      {!isOnline && <OfflineBanner />}
      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Liked Songs"
        left={<AppTopHeaderProfileButton />}
        rightWidth={showStickyPlay ? 84 : 40}
        right={
          <View style={styles.headerRightContainer}>
            <AppTopHeaderDownloadButton />
            {showStickyPlay && (
              <Pressable
                onPress={handlePlayAll}
                style={({ pressed }) => [
                  styles.stickyPlayButton,
                  pressed && styles.stickyPlayButtonPressed,
                ]}
              >
                <Ionicons
                  name={isPlayingFromLikedSongs && isPlaying ? "pause" : "play"}
                  size={15}
                  color="#06241a"
                  style={!isPlayingFromLikedSongs || !isPlaying ? { marginLeft: 1 } : undefined}
                />
              </Pressable>
            )}
          </View>
        }
      />

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        renderItem={renderSong}
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
                <Text style={styles.searchPlaceholderText}>Search liked songs...</Text>
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
                  style={({ pressed }) => [
                    styles.shuffleButton,
                    isShuffled && isPlayingFromLikedSongs && styles.shuffleButtonActive,
                    pressed && styles.shuffleButtonPressed
                  ]}
                  android_ripple={{ color: "rgba(255,255,255,0.12)", borderless: false }}
                >
                  <Ionicons 
                    name="shuffle" 
                    size={24} 
                    color={isShuffled && isPlayingFromLikedSongs ? UI.primaryA : UI.text} 
                  />
                </Pressable>

                <Pressable 
                  onPress={handlePlayAll} 
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.moodScrollContent}
                >
                  {selectedMood && (
                    <Pressable
                      onPress={() => {
                        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedMood(null);
                      }}
                      style={[styles.moodChip, styles.moodChipActive]}
                    >
                      <Ionicons name="close" size={14} color="#042115" style={{ marginRight: 4 }} />
                      <Text style={[styles.moodChipText, styles.moodChipTextActive]}>{selectedMood}</Text>
                    </Pressable>
                  )}
                  {/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list -- static horizontal mood chips row */}
                  {MOOD_SUGGESTIONS.map((mood) => {
                    const isActive = selectedMood === mood;
                    if (isActive) return null;
                    return (
                      <Pressable
                        key={mood}
                        onPress={() => {
                          void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedMood(mood);
                        }}
                        style={({ pressed }) => [
                          styles.moodChip,
                          pressed && styles.moodChipPressed,
                        ]}
                      >
                        <Text style={styles.moodChipText}>{mood}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Pressable
              onPress={() => {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                globalAddSongsSheetRef.current?.expand();
              }}
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
            <Ionicons name={searchQuery ? "search-outline" : "heart-outline"} size={56} color={UI.subtext} />
            <Text style={styles.emptyTitle}>
              {searchQuery
                ? "No songs found"
                : isAuthenticated
                  ? "No liked songs yet"
                  : "Sign in to view liked songs"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : isAuthenticated
                  ? "Tap the heart on a song to save it here."
                  : "Liked songs now come only from your account in Firebase."}
            </Text>
          </View>
        }
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInset + APP_TOP_HEADER_HEIGHT },
          songs.length === 0 ? styles.listContentEmpty : undefined,
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        removeClippedSubviews={false}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI.bg,
  },
  topBar: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(61,74,61,0.22)",
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: UI.lowSurface,
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.34)",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  topIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(38,225,154,0.08)",
  },
  topIconButtonPressed: {
    backgroundColor: "rgba(38,225,154,0.2)",
    transform: [{ scale: 0.92 }],
  },
  topBarTitle: {
    color: UI.primaryA,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  topBarSpacer: {
    width: 28,
    height: 28,
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
    marginTop: 12,
  },
  heroIconCard: {
    width: 136,
    height: 136,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "2deg" }],
    boxShadow: "none",
  },
  heroTitle: {
    marginTop: 16,
    color: UI.text,
    fontSize: 52,
    lineHeight: 57,
    letterSpacing: -1.4,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  heroMeta: {
    marginTop: 7,
    color: UI.subtext,
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: "Inter_600SemiBold",
  },
  actionSection: {
    marginTop: 20,
    marginBottom: 16,
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
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.highSurface,
    borderWidth: 1.5,
    borderColor: "rgba(61,74,61,0.48)",
  },
  shuffleButtonActive: {
    backgroundColor: "rgba(38,225,154,0.08)",
    borderColor: UI.primaryA,
  },
  shuffleButtonPressed: {
    backgroundColor: UI.lowSurface,
    borderColor: "rgba(61,74,61,0.72)",
    transform: [{ scale: 0.96 }],
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  utilityIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,42,49,0.48)",
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.2)",
  },
  utilityIconPressed: {
    backgroundColor: "rgba(38,42,49,0.68)",
    borderColor: "rgba(61,74,61,0.45)",
    transform: [{ scale: 0.92 }],
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(61,74,61,0.22)",
    paddingBottom: 10,
  },
  tableHeaderText: {
    color: UI.subtext,
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: "Inter_700Bold",
  },
  tableIndexHeader: {
    width: 32,
    textAlign: "center",
  },
  tableTitleHeader: {
    flex: 1,
    marginLeft: 8,
  },
  tableDurationHeader: {
    width: 74,
    alignItems: "center",
  },
  tableMoreHeader: {
    width: 28,
  },
  songListSpacer: {
    height: 10,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: 4,
    overflow: "hidden",
  },
  trackRowPressed: {
    backgroundColor: "rgba(38,42,49,0.55)",
  },
  indexCell: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  trackMain: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  coverWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: UI.lowSurface,
    borderWidth: 1,
    borderColor: UI.outline,
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  trackTextWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    paddingRight: 2,
    justifyContent: "center",
  },
  trackTitle: {
    color: UI.text,
    fontSize: 14,
    lineHeight: 17,
    fontFamily: "Inter_700Bold",
    width: "100%",
    flexShrink: 1,
  },
  trackArtist: {
    marginTop: 1,
    color: UI.subtext,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: "Inter_500Medium",
    width: "100%",
    flexShrink: 1,
  },
  metaCell: {
    width: 74,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  likeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(38,225,154,0.08)",
  },
  likeButtonPressed: {
    backgroundColor: "rgba(38,225,154,0.22)",
    transform: [{ scale: 0.92 }],
  },
  downloadBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(38,42,49,0.3)",
  },
  downloadBtnInner: {
    width: "100%",
    height: "100%",
  },
  trackDuration: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    minWidth: 40,
    textAlign: "right",
  },
  moreButton: {
    width: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(188,203,185,0.06)",
  },
  moreButtonPressed: {
    backgroundColor: "rgba(188,203,185,0.18)",
    transform: [{ scale: 0.92 }],
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
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
  },
  searchPlaceholderText: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(61,74,61,0.22)",
    gap: 12,
  },
  searchModeInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    backgroundColor: UI.lowSurface,
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.34)",
    gap: 8,
  },
  searchModeInput: {
    flex: 1,
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  searchModeCancelButton: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 6,
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
  },
  stickyPlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: UI.primaryA,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
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
    paddingHorizontal: 14,
    paddingVertical: 7,
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
    width: 52,
    height: 52,
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
