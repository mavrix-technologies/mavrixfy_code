import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { safeGoBack } from "@/utils/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import DownloadCollectionButton from "@/components/DownloadCollectionButton";
import OfflineBanner from "@/components/OfflineBanner";
import SongRow from "@/components/SongRow";
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

export default function LikedSongsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { isAuthenticated } = useAuth();
  const { isOnline } = useNetwork();
  const { playSong, likedSongs, currentSong, isPlaying, togglePlay, queue } = usePlayerBrowse();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);

  const songs = useMemo(() => {
    if (!Array.isArray(likedSongs)) return [];
    return likedSongs.filter((song) => song && song.id && song.title);
  }, [likedSongs]);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const query = searchQuery.toLowerCase();
    return songs.filter((song) =>
      song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)
    );
  }, [songs, searchQuery]);

  const isPlayingFromLikedSongs = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return (
      songs.some((song) => song.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((queuedSong, index) => queuedSong.id === songs[index]?.id)
    );
  }, [currentSong, queue, songs]);

  const handlePlayAll = useCallback(() => {
    if (songs.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromLikedSongs) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromLikedSongs, togglePlay, playSong]);

  const handleShufflePlay = useCallback(() => {
    if (songs.length === 0) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    const shuffled = [...songs];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const rand = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[rand]] = [shuffled[rand], shuffled[index]];
    }
    playSong(shuffled[0], shuffled);
  }, [songs, playSong]);

  const renderSong = useCallback(
    ({ item }: { item: Song; index: number }) => {
      return <SongRow song={item} queue={filteredSongs} />;
    },
    [filteredSongs]
  );

  const headerMeta = songs.length > 0 ? `${songs.length} songs` : "No songs";

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient colors={["#09111B", "#10141a", "#10141a"]} style={StyleSheet.absoluteFillObject} />
      {!isOnline && <OfflineBanner />}

      <View style={styles.topBar}>
        <Pressable 
          style={({ pressed }) => [styles.topIconButton, pressed && styles.topIconButtonPressed]} 
          onPress={() => {
            void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
            safeGoBack();
          }}
          hitSlop={10}
          android_ripple={{ color: "rgba(38,225,154,0.15)", borderless: true }}
        >
          <Ionicons name="arrow-back" size={18} color={UI.primaryA} />
        </Pressable>
        <Text style={styles.topBarTitle}>Liked Songs</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        renderItem={renderSong}
        ListHeaderComponent={
          <>
            {isSearchActive && (
              <View style={styles.searchContainer}>
                <View style={styles.searchInputWrapper}>
                  <Ionicons name="search" size={16} color={UI.subtext} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search liked songs..."
                    placeholderTextColor={UI.subtext}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    selectionColor={UI.primaryA}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable
                      onPress={() => setSearchQuery("")}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={16} color={UI.subtext} />
                    </Pressable>
                  )}
                </View>
              </View>
            )}
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
                <Pressable 
                onPress={handlePlayAll} 
                style={({ pressed }) => [styles.playAllButton, pressed && styles.playAllButtonPressed]}
                android_ripple={{ color: "rgba(0,0,0,0.15)", borderless: false }}
              >
                  <Ionicons
                    name={isPlayingFromLikedSongs && isPlaying ? "pause" : "play"}
                    size={16}
                    color="#06241a"
                    style={!isPlayingFromLikedSongs || !isPlaying ? { marginLeft: 1 } : undefined}
                  />
                  <Text style={styles.playAllText}>
                    {isPlayingFromLikedSongs && isPlaying ? "Pause" : "Play All"}
                  </Text>
                </Pressable>

                <Pressable 
                  onPress={handleShufflePlay}
                  style={({ pressed }) => [styles.shuffleButton, pressed && styles.shuffleButtonPressed]}
                  android_ripple={{ color: "rgba(255,255,255,0.12)", borderless: false }}
                >
                  <Ionicons name="shuffle" size={16} color={UI.text} />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </Pressable>
              </View>

              <View style={styles.rightActions}>
                <Pressable
                  style={({ pressed }) => [styles.utilityIcon, pressed && styles.utilityIconPressed]}
                  onPress={() => {
                    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                    setIsSearchActive(!isSearchActive);
                    if (isSearchActive) {
                      setSearchQuery("");
                    }
                  }}
                  android_ripple={{ color: "rgba(255,255,255,0.1)", borderless: true }}
                >
                  <Ionicons name={isSearchActive ? "close" : "search"} size={22} color={UI.subtext} />
                </Pressable>
                <DownloadCollectionButton
                  songs={filteredSongs}
                  collectionId="liked-songs"
                  collectionName="Liked Songs"
                  collectionImage=""
                  compact
                  style={styles.utilityIcon}
                />
              </View>
            </View>

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
          songs.length === 0 ? styles.listContentEmpty : undefined,
        ]}
        showsVerticalScrollIndicator={false}
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
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
    borderRadius: 999,
    paddingHorizontal: 20,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: UI.primaryA,
    borderWidth: 1.5,
    borderColor: "rgba(38,225,154,0.6)",
  },
  playAllButtonPressed: {
    backgroundColor: UI.primaryB,
    borderColor: "rgba(0,184,123,0.8)",
    transform: [{ scale: 0.96 }],
  },
  playAllText: {
    color: "#06241a",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  shuffleButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: UI.highSurface,
    borderWidth: 1.5,
    borderColor: "rgba(61,74,61,0.48)",
  },
  shuffleButtonPressed: {
    backgroundColor: UI.lowSurface,
    borderColor: "rgba(61,74,61,0.72)",
    transform: [{ scale: 0.96 }],
  },
  shuffleText: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
});
