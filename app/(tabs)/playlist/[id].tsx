import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import {
  Song,
  convertJioSaavnSong,
  formatDuration,
  getBestImageUrl,
  JioSaavnSong,
} from "@/lib/musicData";
import { usePlayer } from "@/contexts/PlayerContext";
import { getUserPlaylists, UserPlaylist } from "@/lib/storage";
import { firestorePlaylistToLocalSongs, getPlaylistById } from "@/lib/firestore";
import SongRow from "@/components/SongRow";
import { getJioSaavnPlaylistDetails } from "@/lib/jioSaavnService";
import { createSpotifyColorTheme, extractDominantColor } from "@/lib/colorExtractor";

const APP_BRAND_ICON = require("@/assets/images/icon.png");

function pickFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function PlaylistScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    jiosaavn?: string | string[];
    firestore?: string | string[];
  }>();
  const playlistId = pickFirstParam(params.id).trim();
  const isJioSaavnSource = pickFirstParam(params.jiosaavn) === "true";
  const isFirestoreSource = pickFirstParam(params.firestore) === "true";
  const insets = useSafeAreaInsets();
  const { playSong, currentSong, isPlaying, queue, togglePlay } = usePlayer();

  const [loading, setLoading] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistCover, setPlaylistCover] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [showStickyTopBar, setShowStickyTopBar] = useState(false);
  const [playlistColor, setPlaylistColor] = useState(Colors.primary);
  const stickyVisibleRef = useRef(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 132 : Math.max(150, insets.bottom + 126);

  const totalDuration = useMemo(() => songs.reduce((acc, song) => acc + song.duration, 0), [songs]);
  const totalDurationLabel = useMemo(
    () => (totalDuration > 0 ? formatDuration(totalDuration) : "0:00"),
    [totalDuration]
  );
  const totalMinutes = useMemo(() => Math.max(0, Math.floor(totalDuration / 60)), [totalDuration]);
  const sourceLabel = useMemo(
    () => (isFirestoreSource ? "CLOUD" : "MAVRIXFY"),
    [isFirestoreSource]
  );
  const showHeaderDescription = useMemo(() => {
    const desc = (playlistDescription || "").trim();
    if (!desc) return false;
    // Avoid duplicate counters like "30 songs" when stats line is already shown below.
    if (/^\d+\s+songs?$/i.test(desc)) return false;
    return true;
  }, [playlistDescription]);

  const isPlayingFromThisPlaylist = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return (
      songs.some((song) => song.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((queuedSong, index) => queuedSong.id === songs[index]?.id)
    );
  }, [currentSong, queue, songs]);

  const playlistTitleStyle = useMemo(() => {
    const length = playlistName.trim().length;
    if (length <= 16) return { fontSize: 29, lineHeight: 34 };
    if (length <= 32) return { fontSize: 24, lineHeight: 29 };
    if (length <= 48) return { fontSize: 21, lineHeight: 26 };
    return { fontSize: 19, lineHeight: 24 };
  }, [playlistName]);

  const playlistTheme = useMemo(
    () => createSpotifyColorTheme(playlistColor || Colors.primary),
    [playlistColor]
  );
  const headerGradientColors = useMemo(
    () =>
      [
        playlistTheme.playlistBackdrop[0],
        playlistTheme.playlistBackdrop[1],
        playlistTheme.playlistBackdrop[3],
      ] as [string, string, string],
    [playlistTheme]
  );

  const normalizeLoadedSongs = useCallback((rawSongs: JioSaavnSong[]): Song[] => {
    const converted = rawSongs.map((song) => convertJioSaavnSong(song));
    const seenSongIds = new Set<string>();
    const normalizedSongs: Song[] = [];

    for (const song of converted) {
      const id = String(song.id || "").trim();
      const title = String(song.title || "").trim();
      if (!id || !title || seenSongIds.has(id)) continue;
      seenSongIds.add(id);
      normalizedSongs.push({
        ...song,
        id,
        title,
        audioUrl: String(song.audioUrl || "").trim(),
      });
    }

    const playableSongs = normalizedSongs.filter((song) => song.audioUrl.length > 0);
    return playableSongs.length > 0 ? playableSongs : normalizedSongs;
  }, []);

  const applyJioPlaylistData = useCallback(
    (data: {
      name?: string;
      description?: string;
      songCount?: number;
      image?: { quality: string; url: string }[] | string;
      songs?: JioSaavnSong[];
    }): number => {
      setPlaylistName(data.name || "");
      setPlaylistCover(Array.isArray(data.image) ? getBestImageUrl(data.image) : data.image || "");
      setPlaylistDescription(
        (data.description || "").trim() || `${data.songCount || data.songs?.length || 0} songs`
      );

      const finalSongs = normalizeLoadedSongs(data.songs || []);
      if (finalSongs.length > 0) {
        setSongs(finalSongs);
      }
      return finalSongs.length;
    },
    [normalizeLoadedSongs]
  );

  useEffect(() => {
    let cancelled = false;
    if (!playlistId) {
      setNotFound(true);
      return;
    }

    setLoading(true);
    setNotFound(false);

    if (isFirestoreSource) {
      getPlaylistById(playlistId)
        .then((playlist) => {
          if (cancelled) return;
          if (!playlist) {
            setNotFound(true);
            return;
          }
          setPlaylistName(playlist.name);
          setPlaylistDescription(playlist.description || `${playlist.songs.length} songs`);
          setPlaylistCover(playlist.imageUrl || "");
          setSongs(firestorePlaylistToLocalSongs(playlist));
        })
        .catch(() => {
          if (!cancelled) {
            setNotFound(true);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    if (isJioSaavnSource) {
      (async () => {
        try {
          const initialData = await getJioSaavnPlaylistDetails(playlistId, {
            loadAllPages: false,
            preferCache: true,
          });
          if (cancelled) return;

          const initialSongCount = applyJioPlaylistData(initialData);
          if (initialSongCount === 0) {
            setNotFound(true);
          }
          setLoading(false);

          void getJioSaavnPlaylistDetails(playlistId, { loadAllPages: true })
            .then((fullData) => {
              if (cancelled) return;
              const hydratedSongCount = applyJioPlaylistData(fullData);
              if (hydratedSongCount > 0) {
                setNotFound(false);
              }
            })
            .catch(() => {
              // Keep initial render if hydration fails.
            });
        } catch {
          if (cancelled) return;
          setNotFound(true);
          setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    getUserPlaylists()
      .then((playlists: UserPlaylist[]) => {
        if (cancelled) return;
        const found = playlists.find((playlist) => playlist.id === playlistId);
        if (!found) {
          setNotFound(true);
          return;
        }
        setPlaylistName(found.name);
        setPlaylistDescription(found.description);
        setPlaylistCover(found.coverUrl);
        setSongs(found.songs);
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [playlistId, isFirestoreSource, isJioSaavnSource, applyJioPlaylistData]);

  useEffect(() => {
    let mounted = true;
    const cover = (playlistCover || "").trim();
    if (!cover) {
      setPlaylistColor(Colors.primary);
      return () => {
        mounted = false;
      };
    }

    extractDominantColor(cover)
      .then((result) => {
        if (!mounted) return;
        setPlaylistColor(result.primary || Colors.primary);
      })
      .catch(() => {
        if (!mounted) return;
        setPlaylistColor(Colors.primary);
      });

    return () => {
      mounted = false;
    };
  }, [playlistCover]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const nextVisible = y > 84;
    if (stickyVisibleRef.current === nextVisible) return;
    stickyVisibleRef.current = nextVisible;
    setShowStickyTopBar(nextVisible);
  };

  const handlePlayAll = () => {
    if (songs.length === 0) return;
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (isPlayingFromThisPlaylist) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  };

  const handleShufflePlay = () => {
    if (songs.length === 0) return;
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backButtonSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backButtonSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Playlist not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={headerGradientColors} style={[styles.header, { paddingTop: topInset }]}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={safeGoBack} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={20} color={Colors.text} />
            </Pressable>
            <View style={styles.iconButtonPlaceholder} />
          </View>

          <View style={styles.heroRow}>
            <View style={styles.coverWrap}>
              {playlistCover ? (
                <Image
                  source={{ uri: playlistCover }}
                  style={styles.cover}
                  contentFit="contain"
                />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Ionicons name="musical-notes" size={42} color={Colors.subtext} />
                </View>
              )}
              <View pointerEvents="none" style={styles.brandCoverBadge}>
                <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
              </View>
            </View>

            <View style={styles.heroContent}>
              <Text numberOfLines={3} style={[styles.playlistName, playlistTitleStyle]}>
                {playlistName}
              </Text>
              {showHeaderDescription ? (
                <Text numberOfLines={1} style={styles.playlistDescription}>
                  {playlistDescription}
                </Text>
              ) : null}
              <View style={styles.sourcePill}>
                <Text style={styles.sourcePillText}>{sourceLabel}</Text>
              </View>
              <Text style={styles.playlistMeta}>
                {songs.length} SONGS · {totalMinutes} MIN
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={handleShufflePlay}
              style={[
                styles.shuffleButton,
                {
                  borderColor: "rgba(255,255,255,0.24)",
                  backgroundColor: "rgba(10,16,24,0.72)",
                },
              ]}
            >
              <Ionicons name="shuffle" size={17} color={Colors.text} />
              <Text style={styles.shuffleText}>Shuffle</Text>
            </Pressable>

            <Pressable
              onPress={handlePlayAll}
              style={[
                styles.playButton,
                {
                  backgroundColor: playlistTheme.accent,
                  borderColor: "rgba(255,255,255,0.28)",
                },
              ]}
            >
              <Ionicons
                name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
                size={19}
                color={playlistTheme.onAccent}
              />
              <Text style={[styles.playText, { color: playlistTheme.onAccent }]}>
                {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play All"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.tracksHeadRow}>
            <Text style={styles.tracksTitle}>Tracks</Text>
            <Text style={styles.tracksMeta}>{songs.length} · {totalDurationLabel}</Text>
          </View>
        </LinearGradient>

        {songs.map((song, index) => (
          <SongRow key={`${song.id}-${index}`} song={song} index={index} queue={songs} />
        ))}
      </ScrollView>

      {showStickyTopBar ? (
        <View
          style={[
            styles.stickyTopWrap,
            {
              paddingTop: topInset,
              backgroundColor: playlistTheme.accentSoft,
              borderBottomColor: "rgba(255,255,255,0.22)",
            },
          ]}
        >
          <View style={styles.stickyTopBar}>
            <Text numberOfLines={1} style={styles.stickyTitle}>
              {playlistName}
            </Text>
            <Pressable
              onPress={handlePlayAll}
              style={[
                styles.stickyPlayButton,
                {
                  backgroundColor: playlistTheme.accent,
                  borderColor: "rgba(255,255,255,0.28)",
                },
              ]}
            >
              <Ionicons
                name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
                size={14}
                color={playlistTheme.onAccent}
              />
              <Text style={[styles.stickyPlayText, { color: playlistTheme.onAccent }]}>
                {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  iconButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPlaceholder: {
    width: 30,
    height: 30,
  },
  backButtonSolo: {
    width: 30,
    height: 30,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  coverWrap: {
    position: "relative",
    width: 92,
    height: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  brandCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.45)",
    backgroundColor: "#0E131A",
  },
  brandCoverBadgeImage: {
    width: "100%",
    height: "100%",
    opacity: 0.82,
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  heroContent: {
    flex: 1,
    paddingRight: 2,
  },
  playlistName: {
    color: "#F3F8FF",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  playlistDescription: {
    marginTop: 3,
    color: "rgba(235,245,255,0.82)",
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  sourcePill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(20,29,43,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  sourcePillText: {
    color: "#EAF5FF",
    fontSize: 10,
    letterSpacing: 0.7,
    fontFamily: "Inter_700Bold",
  },
  playlistMeta: {
    marginTop: 7,
    color: "rgba(221,238,255,0.9)",
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
    fontFamily: "Inter_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  shuffleButton: {
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(22,35,50,0.9)",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  shuffleText: {
    color: "#E7F2FF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  playButton: {
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "#4F9BF5",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  playText: {
    color: "#EAF6FF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  tracksHeadRow: {
    marginTop: 2,
    marginBottom: 0,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tracksTitle: {
    color: Colors.text,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.2,
    fontFamily: "Inter_700Bold",
  },
  tracksMeta: {
    color: Colors.subtext,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },
  stickyTopWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(61,74,61,0.36)",
    backgroundColor: "rgba(25,66,114,0.98)",
  },
  stickyTopBar: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stickyTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
    fontFamily: "Inter_700Bold",
  },
  stickyPlayButton: {
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "#4F9BF5",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  stickyPlayText: {
    color: "#EAF6FF",
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
