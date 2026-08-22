import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { convertJioSaavnSong, getBestImageUrl, Song } from "@/lib/musicData";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import {
  getArtistDetails,
  getArtistSongs,
  JioSaavnArtist,
  JioSaavnArtistAlbum,
  JioSaavnSimilarArtist,
  prefetchArtist,
} from "@/data/providers/ArtistProvider";
import {
  isFollowingArtist,
  toggleFollowArtist,
  FollowedArtist,
} from "@/lib/followedArtists";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import { mapFilter } from "@/lib/arrayUtils";

function pickFirst(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}



function formatFollowers(n: number | null | undefined): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`;
  return `${n} followers`;
}

export function ArtistDetailScreen() {
  return useArtistScreenView();
}

export default ArtistDetailScreen;

function useArtistScreenView() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    name?: string | string[];
    image?: string | string[];
  }>();
  const artistId   = pickFirst(params.id).trim();
  const initName   = pickFirst(params.name).trim();
  const initImage  = pickFirst(params.image).trim();

  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const { currentSong, queue } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay } = usePlayerActions();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Math.max(140, insets.bottom + 120);

  const [artist, setArtist] = useState<JioSaavnArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [extraSongs, setExtraSongs] = useState<Song[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextPageRef = useRef(2); // page 1 = initial 20, page 2+ = more
  const [hasMore, setHasMore] = useState(true);
  const followScaleRef = useRef<Animated.Value | null>(null);
  if (followScaleRef.current === null) followScaleRef.current = new Animated.Value(1);
  const followScale = followScaleRef.current;
  const stickyOpacityRef = useRef<Animated.Value | null>(null);
  if (stickyOpacityRef.current === null) stickyOpacityRef.current = new Animated.Value(0);
  const stickyOpacity = stickyOpacityRef.current;
  const [isStickyVisible, setIsStickyVisible] = useState(false);
  const topAlbums = artist?.topAlbums ?? [];
  const visibleSimilarArtists = useMemo(
    () => artist?.similarArtists?.slice(0, 10) ?? [],
    [artist?.similarArtists]
  );

  // All songs = initial topSongs + loaded extra pages
  const allSongs: Song[] = useMemo(() => {
    if (!artist) return [];
    const isYt = false;
    if (isYt) {
      return [...(artist.topSongs as unknown as Song[]), ...extraSongs];
    }
    const base = artist?.topSongs
      ? mapFilter(artist.topSongs, (s) => convertJioSaavnSong(s), (s) => s.audioUrl?.trim())
      : [];
    return [...base, ...extraSongs];
  }, [artist, extraSongs]);

  // songs alias kept for play/shuffle handlers
  const songs = allSongs;

  // Is the current queue playing from this artist?
  const isPlayingFromThisArtist = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return (
      songs.some((s) => s.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((queuedSong, index) => queuedSong.id === songs[index]?.id)
    );
  }, [currentSong, queue, songs]);

  const coverUrl = useMemo(() => {
    if (artist?.image?.length) return getBestImageUrl(artist.image);
    return initImage;
  }, [artist, initImage]);

  const displayName = artist?.name || initName || "Artist";
  const markArtistNotFound = useCallback(() => {
    queueMicrotask(() => {
      setError("Artist not found");
      setLoading(false);
    });
  }, []);
  const resetArtistLoadState = useCallback(() => {
    queueMicrotask(() => {
      setLoading(true);
      setError("");
      setExtraSongs([]);
      nextPageRef.current = 2;
      setHasMore(true);
    });
  }, []);
  const applyArtistFollowState = useCallback((nextFollowing: boolean) => {
    queueMicrotask(() => {
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
      setFollowing(nextFollowing);
    });
  }, []);
  const applyArtistDetails = useCallback((data: JioSaavnArtist | null) => {
    queueMicrotask(() => {
      if (data) {
        // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
        setArtist(data);
      } else {
        setError("Artist not found");
      }
    });
  }, []);
  const applyArtistLoadFailure = useCallback(() => {
    queueMicrotask(() => {
      setError("Could not load artist. Check your connection.");
    });
  }, []);
  const finishArtistLoad = useCallback(() => {
    queueMicrotask(() => {
      setLoading(false);
    });
  }, []);

  // react-doctor-disable-next-line react-doctor/no-cascading-set-state -- loading an artist resets several independent UI fields at once before async fetches start.
  useEffect(() => {
    if (!artistId) { markArtistNotFound(); return; }

    let cancelled = false;
    resetArtistLoadState();

    void isFollowingArtist(artistId).then((v) => {
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
      if (!cancelled) applyArtistFollowState(v);
    });
    getArtistDetails(artistId)
      .then((data) => {
        if (cancelled) return;
        // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
        applyArtistDetails(data);
      })
      .catch(() => {
        if (!cancelled) applyArtistLoadFailure();
      })
      .finally(() => {
        if (!cancelled) finishArtistLoad();
      });

    return () => { cancelled = true; };
  }, [
    applyArtistDetails,
    applyArtistFollowState,
    applyArtistLoadFailure,
    artistId,
    finishArtistLoad,
    markArtistNotFound,
    resetArtistLoadState,
  ]);

  // Prefetch similar artists in background
  useEffect(() => {
    if (!artist?.similarArtists?.length) return;
    artist.similarArtists.slice(0, 4).forEach((a) => prefetchArtist(a.id));
  }, [artist]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    if (isPlayingFromThisArtist && isPlaying) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps (songs, playback state, actions) are listed
  }, [songs, isPlayingFromThisArtist, isPlaying, togglePlay, playSong]);

  const handleFollow = useCallback(async () => {
    Animated.sequence([
      Animated.spring(followScale, { toValue: 0.88, speed: 50, bounciness: 0, useNativeDriver: true }),
      Animated.spring(followScale, { toValue: 1, speed: 18, bounciness: 14, useNativeDriver: true }),
    ]).start();

    const artistCard: FollowedArtist = {
      id: artistId, name: displayName, image: coverUrl, followedAt: Date.now(),
    };
    const nowFollowing = await toggleFollowArtist(artistCard);
    setFollowing(nowFollowing);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps (artistId, displayName, coverUrl, followScale) are listed
  }, [artistId, displayName, coverUrl, followScale]);

  const handleShuffle = useCallback(() => {
    if (!songs.length) return;
    shufflePlay(songs);
  }, [songs, shufflePlay]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !artistId) return;
    setLoadingMore(true);
    try {
      const newSongs = await getArtistSongs(artistId, nextPageRef.current);
      if (newSongs.length === 0) {
        setHasMore(false);
        return;
      }
      const converted = mapFilter(newSongs, (s) => convertJioSaavnSong(s), (s) => s.audioUrl?.trim());
      setExtraSongs((prev) => {
        // Dedupe by id
        const existingIds = new Set(prev.map((s) => s.id));
        const unique = converted.filter((s) => !existingIds.has(s.id));
        return [...prev, ...unique];
      });
      nextPageRef.current += 1;
      if (newSongs.length < 10) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, artistId]);

  const handleSimilarArtistPress = useCallback((id: string, name: string, image: string) => {
    // Already inside the artist Stack — push directly.
    // dangerouslySingular ensures only one artist profile exists in the stack at a time.
    routerPush(
      { pathname: "/artist/[id]", params: { id, name, image } },
      { dangerouslySingular: () => "artist-profile" }
    );
  }, [routerPush]);

  const handleAlbumPress = useCallback((album: JioSaavnArtistAlbum) => {
    const isYt = false;
    routerPush({
      pathname: "/playlist/[id]",
      params: {
        id: album.id,
        jiosaavn: isYt ? "false" : "true",
        youtube: isYt ? "true" : "false",
        album: "true",
        firestore: "false",
        link: album.url,
        title: album.name,
        cover: getBestImageUrl(album.image),
        songCount: String(album.songCount ?? 0),
      },
    });
  }, [routerPush]);

  const renderAlbumCard = useCallback(
    ({ item }: { item: JioSaavnArtistAlbum }) => (
      <Pressable style={styles.albumCard} onPress={() => handleAlbumPress(item)}>
        <Image
          recyclingKey={item.id}
          source={{ uri: getBestImageUrl(item.image) }}
          style={styles.albumCover}
          contentFit="cover"
          transition={80}
          cachePolicy="memory-disk"
        />
        <Text style={styles.albumName} numberOfLines={2}>{item.name}</Text>
        {item.year ? <Text style={styles.albumYear}>{item.year}</Text> : null}
      </Pressable>
    ),
    [handleAlbumPress]
  );

  const renderSimilarArtist = useCallback(
    ({ item }: { item: JioSaavnSimilarArtist }) => {
      const img = getBestImageUrl(item.image);
      return (
        <Pressable
          style={styles.similarCard}
          onPress={() => handleSimilarArtistPress(item.id, item.name, img)}
        >
          <Image
            recyclingKey={item.id}
            source={{ uri: img }}
            style={styles.similarAvatar}
            contentFit="cover"
            transition={80}
            cachePolicy="memory-disk"
          />
          <Text style={styles.similarName} numberOfLines={2}>{item.name}</Text>
        </Pressable>
      );
    },
    [handleSimilarArtistPress]
  );

  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    // Show sticky after scrolling past the hero (320px)
    const shouldShow = y > 260;
    setIsStickyVisible((prev) => {
      if (prev === shouldShow) return prev;
      Animated.timing(stickyOpacity, {
        toValue: shouldShow ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }).start();
      return shouldShow;
    });
  }, [stickyOpacity]);

  // ── Render helpers ──────────────────────────────────────────────────────────
  const songsQueueKey = useMemo(() => songs.map((song) => song.id).join("|"), [songs]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading && !initName) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (error && !artist) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <Ionicons name="person-outline" size={40} color={Colors.subtext} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentInset={{ bottom: bottomPad }}
        scrollIndicatorInsets={{ bottom: bottomPad }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={false}
      >
        {/* ── Hero ── */}
        <View style={[styles.hero, { paddingTop: topInset + 8 }]}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <LinearGradient
            colors={["transparent", "rgba(16,20,26,0.7)", Colors.background]}
            locations={[0.3, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable onPress={safeGoBack} style={[styles.heroBack, { top: topInset + 8 }]}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.heroInfo}>
            {artist?.isVerified ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                <Text style={styles.verifiedText}>Verified Artist</Text>
              </View>
            ) : null}
            <Text style={styles.artistName}>{displayName}</Text>
            {artist?.followerCount ? (
              <Text style={styles.followers}>{formatFollowers(artist.followerCount)}</Text>
            ) : null}
            <View style={styles.heroActions}>
              <Animated.View style={{ transform: [{ scale: followScale }] }}>
                <Pressable
                  style={[styles.followBtn, following && styles.followBtnFollowed]}
                  onPress={handleFollow}
                >
                  {following ? (
                    <>
                      <Ionicons name="checkmark" size={16} color="#000" />
                      <Text style={styles.followBtnTextActive}>Following</Text>
                    </>
                  ) : (
                    <Text style={styles.followBtnText}>Follow</Text>
                  )}
                </Pressable>
              </Animated.View>
              <Pressable style={styles.playAllBtn} onPress={handlePlayAll} disabled={!songs.length}>
                <Ionicons name={isPlayingFromThisArtist && isPlaying ? "pause" : "play"} size={16} color="#000" />
                <Text style={styles.playAllText}>{isPlayingFromThisArtist && isPlaying ? "Pause" : "Play"}</Text>
              </Pressable>
              {/* Shuffle icon */}
              <Pressable style={styles.iconCircleBtn} onPress={handleShuffle} disabled={!songs.length}>
                <Ionicons name="shuffle" size={18} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Top Songs ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Songs</Text>
          {loading ? (
            <SongRowSkeleton count={6} />
          ) : songs.length > 0 ? (
            <>
              {songs.map((song, i) => (
                <SongRow key={song.id} song={song} index={i} queue={songs} queueKey={songsQueueKey} />
              ))}
              {/* Load More button */}
              {hasMore ? (
                <Pressable
                  style={styles.loadMoreBtn}
                  onPress={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>Load More Songs</Text>
                  )}
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyText}>No songs available</Text>
          )}
        </View>

        {/* ── Albums ── */}
        {topAlbums.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Albums</Text>
            <FlatList
              data={topAlbums}
              keyExtractor={(item) => item.id}
              renderItem={renderAlbumCard}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rowPad}
              nestedScrollEnabled={false}
            />
          </View>
        ) : null}

        {/* ── Similar Artists ── */}
        {visibleSimilarArtists.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fans Also Like</Text>
            <FlatList
              data={visibleSimilarArtists}
              keyExtractor={(item) => item.id}
              renderItem={renderSimilarArtist}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rowPad}
              nestedScrollEnabled={false}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* ── Sticky header — always mounted, fades in/out via opacity ── */}
      <Animated.View
        pointerEvents={isStickyVisible ? "auto" : "none"}
        style={[styles.sticky, { paddingTop: topInset, opacity: stickyOpacity }]}
      >
        <Pressable onPress={safeGoBack} style={styles.stickyBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stickyName} numberOfLines={1}>{displayName}</Text>
        <Pressable style={styles.stickyPlay} onPress={handlePlayAll} disabled={!songs.length}>
          <Ionicons name={isPlayingFromThisArtist && isPlaying ? "pause" : "play"} size={14} color="#000" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtn: { width: 36, height: 36, marginLeft: 12, alignItems: "center", justifyContent: "center" },
  errorText: { color: Colors.subtext, fontSize: 14, textAlign: "center", fontFamily: "Inter_500Medium" },

  // Hero
  hero: {
    height: 320,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroBack: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: { paddingHorizontal: 16, paddingBottom: 20, gap: 6 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { color: Colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  artistName: {
    color: "#fff",
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  followers: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular" },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  followBtn: {
    height: 38,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.65)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  followBtnFollowed: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  followBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  followBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  followBtnTextActive: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  playAllText: { color: "#000", fontSize: 14, fontFamily: "Inter_700Bold" },

  // Icon-only circle buttons (shuffle)
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Sections
  section: { paddingTop: 24 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  emptyText: { color: Colors.subtext, fontSize: 14, paddingHorizontal: 16, fontFamily: "Inter_400Regular" },
  rowPad: { paddingHorizontal: 16, gap: 12 },

  loadMoreBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  // Albums
  albumCard: { width: 130, gap: 6 },
  albumCover: { width: 130, height: 130, borderRadius: 8, backgroundColor: Colors.surface },
  albumName: { color: Colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  albumYear: { color: Colors.subtext, fontSize: 11, fontFamily: "Inter_400Regular" },

  // Similar artists
  similarCard: { width: 90, alignItems: "center", gap: 6 },
  similarAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface },
  similarName: { color: Colors.text, fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },

  // Sticky — always rendered, opacity animated
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(16,20,26,0.97)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  stickyBack: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stickyName: { flex: 1, color: Colors.text, fontSize: 16, fontFamily: "Inter_700Bold" },
  stickyPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
