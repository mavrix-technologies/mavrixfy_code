import React, { useCallback, useMemo } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { safeGoBack } from "@/utils/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { formatDuration, Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import EqualizerBars from "@/components/EqualizerBars";

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
  const { playSong, likedSongs, currentSong, isPlaying, togglePlay, toggleLike, queue } = usePlayerBrowse();

  const songs = useMemo(() => {
    if (!Array.isArray(likedSongs)) return [];
    return likedSongs.filter((song) => song && song.id && song.title);
  }, [likedSongs]);

  const isPlayingFromLikedSongs = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return (
      songs.some((song) => song.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((queuedSong, index) => queuedSong.id === songs[index]?.id)
    );
  }, [currentSong, queue, songs]);

  const totalDuration = useMemo(() => songs.reduce((acc, song) => acc + (song?.duration || 0), 0), [songs]);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const durationText = totalHours > 0 ? `${totalHours} hr ${remainingMinutes} min` : `${totalMinutes} min`;

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

  const handleSongPress = useCallback(
    (song: Song) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      playSong(song, songs);
    },
    [playSong, songs]
  );

  const renderSong = useCallback(
    ({ item, index }: { item: Song; index: number }) => {
      const isCurrent = currentSong?.id === item.id;
      const liked = true;

      return (
        <Pressable
          onPress={() => handleSongPress(item)}
          style={({ pressed }) => [styles.trackRow, pressed && styles.trackRowPressed]}
        >
          <View style={styles.indexCell}>
            {isCurrent ? (
              <EqualizerBars isPlaying={isPlaying} size={3} />
            ) : (
              <Text style={styles.indexText}>{index + 1}</Text>
            )}
          </View>

          <View style={styles.trackMain}>
            <View style={styles.coverWrap}>
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Ionicons name="musical-notes" size={12} color={UI.subtext} />
                </View>
              )}
            </View>
            <View style={styles.trackTextWrap}>
              <Text numberOfLines={1} style={styles.trackTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.trackArtist}>
                {item.artist}
              </Text>
            </View>
          </View>

          <View style={styles.metaCell}>
            <Pressable
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                toggleLike(item);
              }}
              style={styles.likeButton}
            >
              <Ionicons name={liked ? "heart" : "heart-outline"} size={19} color={UI.primaryA} />
            </Pressable>
            <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
          </View>

          <Pressable
            hitSlop={8}
            onPress={(event) => event.stopPropagation()}
            style={styles.moreButton}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={UI.subtext} />
          </Pressable>
        </Pressable>
      );
    },
    [currentSong?.id, handleSongPress, isPlaying, toggleLike]
  );

  const headerMeta = songs.length > 0 ? `${songs.length} songs` : "No songs";
  const headerMetaDetail = songs.length > 0 && totalDuration > 0 ? `${headerMeta}  •  ${durationText}` : headerMeta;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <LinearGradient colors={["#09111B", "#10141a", "#10141a"]} style={StyleSheet.absoluteFillObject} />

      <View style={styles.topBar}>
        <Pressable style={styles.topIconButton} onPress={safeGoBack} hitSlop={10}>
          <Ionicons name="arrow-back" size={18} color={UI.primaryA} />
        </Pressable>
        <Text style={styles.topBarTitle}>Liked Songs</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        renderItem={renderSong}
        ListHeaderComponent={
          <>
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
              <Text style={styles.heroMeta}>{headerMetaDetail.toUpperCase()}</Text>
            </View>

            <View style={styles.actionSection}>
              <View style={styles.leftActions}>
                <Pressable onPress={handlePlayAll} style={styles.playAllButton}>
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

                <Pressable onPress={handleShufflePlay} style={styles.shuffleButton}>
                  <Ionicons name="shuffle" size={16} color={UI.text} />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </Pressable>
              </View>

              <View style={styles.rightActions}>
                <Pressable
                  style={styles.utilityIcon}
                  onPress={() => {
                    router.push("/search");
                  }}
                >
                  <Ionicons name="search" size={17} color={UI.subtext} />
                </Pressable>
              </View>
            </View>

            {songs.length > 0 ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.tableIndexHeader]}>#</Text>
                <Text style={[styles.tableHeaderText, styles.tableTitleHeader]}>TITLE</Text>
                <View style={styles.tableDurationHeader}>
                  <Ionicons name="time-outline" size={13} color={UI.subtext} />
                </View>
                <View style={styles.tableMoreHeader} />
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="heart-outline" size={56} color={UI.subtext} />
            <Text style={styles.emptyTitle}>
              {isAuthenticated ? "No liked songs yet" : "Sign in to view liked songs"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {isAuthenticated
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
        removeClippedSubviews={Platform.OS === "android"}
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
  topIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
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
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.5)",
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
    borderWidth: 1,
    borderColor: "rgba(61,74,61,0.34)",
  },
  shuffleText: {
    color: UI.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  utilityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,42,49,0.45)",
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
