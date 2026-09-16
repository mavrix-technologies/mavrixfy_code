import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
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
  getImmediateCachedArtist,
  JioSaavnArtist,
  type JioSaavnArtistAlbum,
  type JioSaavnSimilarArtist,
  prefetchArtist,
} from "@/data/providers/ArtistProvider";
import { isFollowingArtist, toggleFollowArtist, type FollowedArtist } from "@/lib/followedArtists";
import { showGlobalToast } from "@/utils/globalToast";
import { shareArtist } from "@/utils/shareUtils";
import { useArtworkPalette, colorWithAlpha } from "@/lib/colorExtractor";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import { mapFilter } from "@/lib/arrayUtils";
import AdMobBanner from "@/components/AdMobBanner";
import { pickFirst, formatFollowers } from "@/utils/stringUtils";

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
  const artistId = pickFirst(params.id).trim();
  const initName = pickFirst(params.name).trim();
  const initImage = pickFirst(params.image).trim();

  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const { currentSong, queue } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay } = usePlayerActions();
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Math.max(140, insets.bottom + 120);

  const [artist, setArtist] = useState<JioSaavnArtist | null>(() => getImmediateCachedArtist(artistId));
  const [loading, setLoading] = useState<boolean>(() => !getImmediateCachedArtist(artistId));
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [extraSongs, setExtraSongs] = useState<Song[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextPageRef = useRef(2);
  const [hasMore, setHasMore] = useState(true);
  const [showBioModal, setShowBioModal] = useState(false);

  const followScaleRef = useRef<Animated.Value | null>(null);
  if (followScaleRef.current === null) followScaleRef.current = new Animated.Value(1);
  const followScale = followScaleRef.current;

  const playScaleRef = useRef<Animated.Value | null>(null);
  if (playScaleRef.current === null) playScaleRef.current = new Animated.Value(1);
  const playScale = playScaleRef.current;

  const shuffleScaleRef = useRef<Animated.Value | null>(null);
  if (shuffleScaleRef.current === null) shuffleScaleRef.current = new Animated.Value(1);
  const shuffleScale = shuffleScaleRef.current;

  const stickyOpacityRef = useRef<Animated.Value | null>(null);
  if (stickyOpacityRef.current === null) stickyOpacityRef.current = new Animated.Value(0);
  const stickyOpacity = stickyOpacityRef.current;
  const [isStickyVisible, setIsStickyVisible] = useState(false);

  const floatingNavOpacity = useMemo(
    () =>
      stickyOpacity.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [stickyOpacity]
  );

  const topAlbums = artist?.topAlbums ?? [];
  const visibleSimilarArtists = useMemo(
    () => artist?.similarArtists?.slice(0, 10) ?? [],
    [artist?.similarArtists]
  );

  const coverUrl = useMemo(() => {
    if (artist?.image?.length) return getBestImageUrl(artist.image);
    return initImage;
  }, [artist, initImage]);

  const palette = useArtworkPalette(coverUrl);
  const backgroundColor = useMemo(() => {
    return palette.background || Colors.background;
  }, [palette.background]);

  const displayName = artist?.name || initName || "Artist";

  const songs: Song[] = useMemo(() => {
    if (!artist) return [];
    const base = artist?.topSongs
      ? mapFilter(artist.topSongs, (s) => convertJioSaavnSong(s), (s) => s.audioUrl?.trim())
      : [];
    return [...base, ...extraSongs];
  }, [artist, extraSongs]);

  // Latest Release item (top albums or single)
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  const latestRelease = useMemo(() => {
    if (topAlbums.length > 0) {
      return {
        id: topAlbums[0].id,
        name: topAlbums[0].name,
        year: topAlbums[0].year,
        image: getBestImageUrl(topAlbums[0].image),
        songCount: topAlbums[0].songCount ?? (topAlbums[0].name.toLowerCase().includes("single") ? 1 : 8),
        url: topAlbums[0].url,
        isAlbum: true,
      };
    }
    if (songs.length > 0) {
      return {
        id: songs[0].id,
        name: `${songs[0].title} - Single`,
        year: songs[0].year || new Date().getFullYear().toString(),
        image: songs[0].coverUrl || coverUrl,
        songCount: 1,
        url: "",
        isAlbum: false,
      };
    }
    return null;
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, [topAlbums, songs, coverUrl]);

  // Is current queue playing from this artist?
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- currentSong and songs are tracked
  const isPlayingFromThisArtist = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return songs.some((s) => s.id === currentSong.id);
  }, [currentSong, songs]);

  const markArtistNotFound = useCallback(() => {
    queueMicrotask(() => {
      setError("Artist not found");
      setLoading(false);
    });
  }, []);

  const resetArtistLoadState = useCallback((isCached: boolean) => {
    queueMicrotask(() => {
      if (!isCached) {
        setLoading(true);
      }
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

  // Fetch artist details
  // react-doctor-disable-next-line react-doctor/no-cascading-set-state -- loading an artist resets several independent UI fields at once before async fetches start.
  useEffect(() => {
    if (!artistId) {
      markArtistNotFound();
      return;
    }

    let cancelled = false;
    const initialCached = getImmediateCachedArtist(artistId);
    if (initialCached) {
      setArtist(initialCached);
      setLoading(false);
    }
    resetArtistLoadState(Boolean(initialCached));

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

    return () => {
      cancelled = true;
    };
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
    Animated.sequence([
      Animated.spring(playScale, { toValue: 0.9, speed: 50, bounciness: 0, useNativeDriver: true }),
      Animated.spring(playScale, { toValue: 1, speed: 20, bounciness: 12, useNativeDriver: true }),
    ]).start();

    if (isPlayingFromThisArtist) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps listed
  }, [songs, isPlayingFromThisArtist, togglePlay, playSong, playScale]);

  const handleFollow = useCallback(async () => {
    Animated.sequence([
      Animated.spring(followScale, { toValue: 0.82, speed: 50, bounciness: 0, useNativeDriver: true }),
      Animated.spring(followScale, { toValue: 1, speed: 20, bounciness: 14, useNativeDriver: true }),
    ]).start();

    const artistCard: FollowedArtist = {
      id: artistId,
      name: displayName,
      image: coverUrl,
      followedAt: Date.now(),
    };
    const nowFollowing = await toggleFollowArtist(artistCard);
    setFollowing(nowFollowing);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps listed
  }, [artistId, displayName, coverUrl, followScale]);

  const handleShare = useCallback(async () => {
    await shareArtist({
      id: artistId || "",
      name: displayName || "Artist",
      coverUrl,
    });
  }, [artistId, displayName, coverUrl]);

  const handleShuffle = useCallback(() => {
    if (!songs.length) return;
    Animated.sequence([
      Animated.spring(shuffleScale, { toValue: 0.85, speed: 50, bounciness: 0, useNativeDriver: true }),
      Animated.spring(shuffleScale, { toValue: 1, speed: 20, bounciness: 12, useNativeDriver: true }),
    ]).start();
    shufflePlay(songs);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps listed
  }, [songs, shufflePlay, shuffleScale]);

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

  const handleSimilarArtistPress = useCallback(
    (id: string, name: string, image: string) => {
      routerPush(
        { pathname: "/artist/[id]", params: { id, name, image } },
        { dangerouslySingular: () => "artist-profile" }
      );
    },
    [routerPush]
  );

  const handleAlbumPress = useCallback(
    (album: JioSaavnArtistAlbum) => {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: album.id,
          jiosaavn: "true",
          youtube: "false",
          album: "true",
          firestore: "false",
          link: album.url,
          title: album.name,
          cover: getBestImageUrl(album.image),
          songCount: String(album.songCount ?? 0),
        },
      });
    },
    [routerPush]
  );

  const handleLatestReleasePress = useCallback(() => {
    if (!latestRelease) return;
    if (latestRelease.isAlbum) {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: latestRelease.id,
          jiosaavn: "true",
          youtube: "false",
          album: "true",
          firestore: "false",
          link: latestRelease.url,
          title: latestRelease.name,
          cover: latestRelease.image,
          songCount: String(latestRelease.songCount),
        },
      });
    } else if (songs.length > 0) {
      playSong(songs[0], songs);
    }
  }, [latestRelease, routerPush, songs, playSong]);

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
        <Text style={styles.albumName} numberOfLines={2}>
          {item.name}
        </Text>
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
          <Text style={styles.similarName} numberOfLines={2}>
            {item.name}
          </Text>
        </Pressable>
      );
    },
    [handleSimilarArtistPress]
  );

  const isStickyVisibleRef = useRef(false);
  const handleScroll = useCallback(
    (e: any) => {
      const y = e.nativeEvent.contentOffset.y;
      const shouldShow = y > 300;
      if (isStickyVisibleRef.current !== shouldShow) {
        isStickyVisibleRef.current = shouldShow;
        setIsStickyVisible(shouldShow);
        Animated.timing(stickyOpacity, {
          toValue: shouldShow ? 1 : 0,
          duration: 160,
          useNativeDriver: true,
        }).start();
      }
    },
    [stickyOpacity]
  );

  const songsQueueKey = useMemo(() => songs.map((song) => song.id).join("|"), [songs]);

  const renderSongRow = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow
        key={item.id}
        song={item}
        index={index}
        queue={songs}
        queueKey={songsQueueKey}
        showDownload={false}
      />
    ),
    [songs, songsQueueKey]
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<Song> | null | undefined, index: number) => ({
      length: 68,
      offset: 68 * index,
      index,
    }),
    []
  );

  const keyExtractor = useCallback((item: Song) => item.id, []);

  if (loading && !initName) {
    return (
      <View style={[styles.container, { backgroundColor, paddingTop: topInset }]}>
        <View style={[styles.floatingNavContainer, { top: topInset + 6 }]}>
          <Pressable onPress={safeGoBack} style={styles.iosCircularNavBtn}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </View>
    );
  }

  if (error && !artist) {
    return (
      <View style={[styles.container, { backgroundColor, paddingTop: topInset }]}>
        <View style={[styles.floatingNavContainer, { top: topInset + 6 }]}>
          <Pressable onPress={safeGoBack} style={styles.iosCircularNavBtn}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.center}>
          <Ionicons name="person-outline" size={42} color="rgba(255,255,255,0.4)" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  const bioText = artist?.bio?.[0]?.text || "";

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <FlatList
        data={songs}
        keyExtractor={keyExtractor}
        renderItem={renderSongRow}
        getItemLayout={getItemLayout}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
        contentInset={{ bottom: bottomPad }}
        scrollIndicatorInsets={{ bottom: bottomPad }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* ── Apple Music Full-Bleed Hero Portrait ── */}
            <View style={styles.heroContainer}>
              {coverUrl ? (
                <Image
                  source={{ uri: coverUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  priority="high"
                />
              ) : null}

              {/* Gradient Vignette overlay for seamless Apple Music background transition */}
              <LinearGradient
                colors={[
                  "rgba(0,0,0,0.28)",
                  "transparent",
                  "transparent",
                  colorWithAlpha(backgroundColor, 0.38),
                  colorWithAlpha(backgroundColor, 0.88),
                  backgroundColor,
                ]}
                locations={[0, 0.25, 0.56, 0.8, 0.93, 1]}
                style={StyleSheet.absoluteFill}
              />

              {/* Artist Name */}
              <View style={styles.heroInfoSection}>
                {/* Massive Bold Bulky Artist Typography */}
                <Text style={styles.appleMusicArtistName} numberOfLines={2}>
                  {displayName}
                </Text>

                {/* ── Signature 3-Button Action Row (Shuffle, Play, Like) ── */}
                <View style={styles.appleMusicActionRow}>
                  {/* Left: Shuffle Button */}
                  <Animated.View style={{ transform: [{ scale: shuffleScale }] }}>
                    <Pressable
                      style={styles.appleMusicCircleBtn}
                      onPress={handleShuffle}
                      disabled={!songs.length}
                    >
                      <Ionicons name="shuffle" size={19} color="#FFFFFF" />
                    </Pressable>
                  </Animated.View>

                  {/* Center: Prominent White Play Button */}
                  <Animated.View style={{ transform: [{ scale: playScale }] }}>
                    <Pressable
                      style={styles.appleMusicMainPlayBtn}
                      onPress={handlePlayAll}
                      disabled={!songs.length}
                    >
                      <Ionicons
                        name={isPlayingFromThisArtist && isPlaying ? "pause" : "play"}
                        size={24}
                        color="#000000"
                        style={!isPlayingFromThisArtist || !isPlaying ? { marginLeft: 2 } : undefined}
                      />
                    </Pressable>
                  </Animated.View>

                  {/* Right: Like / Favorite Heart Button */}
                  <Animated.View style={{ transform: [{ scale: followScale }] }}>
                    <Pressable
                      style={[
                        styles.appleMusicCircleBtn,
                        following && styles.appleMusicCircleBtnActive,
                      ]}
                      onPress={handleFollow}
                    >
                      <Ionicons
                        name={following ? "heart" : "heart-outline"}
                        size={19}
                        color={following ? "#FFFFFF" : "#FFFFFF"}
                      />
                    </Pressable>
                  </Animated.View>
                </View>
              </View>
            </View>

            {/* ── Featured "Latest Release" Glass Card ── */}
            {latestRelease ? (
              <Pressable style={styles.latestReleaseCard} onPress={handleLatestReleasePress}>
                <Image
                  source={{ uri: latestRelease.image }}
                  style={styles.latestReleaseThumb}
                  contentFit="cover"
                  transition={80}
                  cachePolicy="memory-disk"
                />
                <View style={styles.latestReleaseMeta}>
                  <Text style={styles.latestReleaseDate}>
                    {latestRelease.year ? `${latestRelease.year} • ` : ""}Latest Release
                  </Text>
                  <Text style={styles.latestReleaseTitle} numberOfLines={1}>
                    {latestRelease.name}
                  </Text>
                  <Text style={styles.latestReleaseCount}>
                    {latestRelease.songCount} {latestRelease.songCount === 1 ? "song" : "songs"}
                  </Text>
                </View>
                <View style={styles.latestReleaseAction}>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </View>
              </Pressable>
            ) : null}

            {/* ── Section: "Top Songs >" ── */}
            <View style={styles.sectionHeaderRow}>
              <Pressable style={styles.sectionTitleLink} onPress={handleShuffle}>
                <Text style={styles.sectionTitle}>Top Songs</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <SongRowSkeleton count={6} />
          ) : (
            <Text style={styles.emptyText}>No songs available</Text>
          )
        }
        ListFooterComponent={
          <>
            {/* Load More Songs Button */}
            {hasMore ? (
              <Pressable
                style={styles.loadMoreBtn}
                onPress={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.loadMoreText}>Load More Songs</Text>
                )}
              </Pressable>
            ) : null}

            <AdMobBanner loadDelayMs={800} />

            {/* ── Section: Albums ── */}
            {topAlbums.length ? (
              <View style={styles.section}>
                <Text style={styles.carouselSectionTitle}>Albums</Text>
                <FlatList
                  data={topAlbums}
                  keyExtractor={(item) => item.id}
                  renderItem={renderAlbumCard}
                  horizontal
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContentPadding}
                  nestedScrollEnabled={false}
                />
              </View>
            ) : null}

            {/* ── Section: Similar Artists ── */}
            {visibleSimilarArtists.length ? (
              <View style={styles.section}>
                <Text style={styles.carouselSectionTitle}>Fans Also Like</Text>
                <FlatList
                  data={visibleSimilarArtists}
                  keyExtractor={(item) => item.id}
                  renderItem={renderSimilarArtist}
                  horizontal
                  initialNumToRender={5}
                  maxToRenderPerBatch={5}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContentPadding}
                  nestedScrollEnabled={false}
                />
              </View>
            ) : null}
          </>
        }
      />

      {/* ── Top Floating Navigation Buttons (Native iOS Style) ── */}
      <Animated.View
        pointerEvents={isStickyVisible ? "none" : "box-none"}
        style={[
          styles.floatingNavContainer,
          {
            top: topInset + 6,
            opacity: floatingNavOpacity,
          },
        ]}
      >
        {/* Left: Native iOS Circular Back Button */}
        <Pressable onPress={safeGoBack} style={styles.iosCircularNavBtn}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </Pressable>

        {/* Right: Native iOS Capsule Button Group */}
        <View style={styles.iosCapsuleNavGroup}>
          <Pressable style={styles.iosCapsuleBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={19} color="#FFFFFF" />
          </Pressable>
          <View style={styles.iosCapsuleDivider} />
          <Pressable style={styles.iosCapsuleBtn} onPress={() => setShowBioModal(true)}>
            <Ionicons name="ellipsis-horizontal" size={19} color="#FFFFFF" />
          </Pressable>
        </View>
      </Animated.View>

      {/* ── Apple Music Frosted Sticky Header ── */}
      <Animated.View
        pointerEvents={isStickyVisible ? "auto" : "none"}
        style={[
          styles.stickyHeader,
          {
            paddingTop: topInset,
            opacity: stickyOpacity,
            backgroundColor: backgroundColor,
          },
        ]}
      >
        <Pressable onPress={safeGoBack} style={styles.stickyBackBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.stickyTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={styles.stickyRightActions}>
          <Pressable
            style={styles.stickyPlayBtn}
            onPress={handlePlayAll}
            disabled={!songs.length}
          >
            <Ionicons
              name={isPlayingFromThisArtist && isPlaying ? "pause" : "play"}
              size={16}
              color="#000000"
              style={!isPlayingFromThisArtist || !isPlaying ? { marginLeft: 2 } : undefined}
            />
          </Pressable>
          <Pressable
            style={styles.stickyMoreBtn}
            onPress={() => setShowBioModal(true)}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </Animated.View>

      {/* ── Artist Bio Bottom Sheet Modal ── */}
      <Modal
        visible={showBioModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBioModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowBioModal(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} style={styles.modalAvatar} contentFit="cover" />
              ) : null}
              <View style={styles.modalHeaderTextGroup}>
                <Text style={styles.modalArtistName}>{displayName}</Text>
                {artist?.followerCount ? (
                  <Text style={styles.modalFollowers}>
                    {formatFollowers(artist.followerCount)}
                  </Text>
                ) : null}
              </View>
            </View>

            {bioText ? (
              <Text style={styles.modalBioText}>{bioText}</Text>
            ) : (
              <Text style={styles.modalBioText}>
                {displayName} is featured on Mavrixfy Music with top charts, albums, and exclusive tracks.
              </Text>
            )}

            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => setShowBioModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080B0F",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },

  // ── Hero ──
  heroContainer: {
    height: 460,
    justifyContent: "flex-end",
    position: "relative",
  },
  heroInfoSection: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 6,
  },
  appleMusicArtistName: {
    color: "#FFFFFF",
    fontSize: 42,
    fontFamily: "Anton_400Regular",
    letterSpacing: 0.8,
    lineHeight: 48,
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 8,
    textAlign: "center",
    textTransform: "uppercase",
    includeFontPadding: false,
    textShadowColor: "rgba(0, 0, 0, 0.85)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },

  // ── Apple Music 3-Button Action Row ──
  appleMusicActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginTop: 6,
  },
  appleMusicCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  appleMusicCircleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  appleMusicMainPlayBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.35)",
  },

  // ── Featured "Latest Release" Glass Card ──
  latestReleaseCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 20,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    gap: 14,
  },
  latestReleaseThumb: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  latestReleaseMeta: {
    flex: 1,
    gap: 3,
  },
  latestReleaseDate: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
  },
  latestReleaseTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  latestReleaseCount: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  latestReleaseAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Section Headers ──
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitleLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  carouselSectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  section: {
    paddingTop: 24,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
    paddingHorizontal: 16,
    fontFamily: "Inter_400Regular",
  },
  carouselContentPadding: {
    paddingHorizontal: 16,
    gap: 14,
  },

  // ── Albums Carousel ──
  albumCard: {
    width: 136,
    gap: 6,
  },
  albumCover: {
    width: 136,
    height: 136,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  albumName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  albumYear: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },

  // ── Similar Artists Carousel ──
  similarCard: {
    width: 96,
    alignItems: "center",
    gap: 8,
  },
  similarAvatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  similarName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },

  loadMoreBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Top Floating Navigation Bar (Native iOS Style) ──
  floatingNavContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 90,
  },
  iosCircularNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iosCapsuleNavGroup: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 2,
  },
  iosCapsuleBtn: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  iosCapsuleDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },

  // ── Sticky Header ──
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.12)",
    zIndex: 95,
  },
  stickyBackBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  stickyPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stickyRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stickyMoreBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Bio Bottom Sheet Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#161B22",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 16,
    maxHeight: "80%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignSelf: "center",
    marginBottom: 8,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  modalAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  modalHeaderTextGroup: {
    flex: 1,
    gap: 2,
  },
  modalArtistName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  modalFollowers: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  modalBioText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14.5,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
  },
  modalCloseBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
