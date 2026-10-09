import { displayArtworkUrl } from "@/lib/artworkDisplay";
import AdMobBanner from "@/components/AdMobBanner";
import { CollectionActionRow } from "@/components/CollectionActionRow";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import {
  CapsuleDivider,
  CapsuleNavButton,
  CapsuleNavGroup,
  CircularBackButton,
} from "@/components/navigation/CircularNavButton";
import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import {
getArtistDetails,
getArtistSongs,
getImmediateCachedArtist,
ArtistDetails,
type ArtistAlbum,
type ArtistCard,
} from "@/data/providers/ArtistProvider";
import { colorWithAlpha,useArtworkPalette } from "@/lib/colorExtractor";
import { isFollowingArtist,reconcileFollowedArtist,toggleFollowArtist,type FollowedArtist } from "@/lib/followedArtists";
import { getBestImageUrl,Song } from "@/lib/musicData";
import * as Animated from "@/lib/nativeAnimated";
import { usePlaybackNowPlaying,usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { showGlobalToast } from "@/utils/globalToast";
import { safeGoBack } from "@/utils/navigation";
import { shareArtist } from "@/utils/shareUtils";
import { formatFollowers,pickFirst } from "@/utils/stringUtils";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams,useRouter } from "expo-router";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
ActivityIndicator,
FlatList,
Modal,
Platform,
Pressable,
StyleSheet,
Text,
View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "../styles/artistDetailStyles";

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
  const { currentSong } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay } = usePlayerActions();
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Math.max(140, insets.bottom + 120);

  const [artist, setArtist] = useState<ArtistDetails | null>(() => getImmediateCachedArtist(artistId));
  const [loading, setLoading] = useState<boolean>(() => !getImmediateCachedArtist(artistId));
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [extraSongs, setExtraSongs] = useState<Song[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextPageRef = useRef("");
  const routeRef = useRef<string | null>(artistId);
  const [hasMore, setHasMore] = useState(true);
  const [showBioModal, setShowBioModal] = useState(false);

  const [stickyOpacity] = useState(() => new Animated.Value(0));
  const [isStickyVisible, setIsStickyVisible] = useState(false);

  const floatingNavOpacity = useMemo(
    () =>
      stickyOpacity.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [stickyOpacity]
  );

  const topAlbums = useMemo(
    () => artist?.topAlbums ?? [],
    [artist?.topAlbums]
  );
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
      ? artist.topSongs
      : [];
    return [...base, ...extraSongs];
  }, [artist, extraSongs]);

  // Latest Release item (top albums or single)
  const latestRelease = useMemo(() => {
    if (topAlbums.length > 0) {
      return {
        id: topAlbums[0].id,
        name: topAlbums[0].name,
        year: topAlbums[0].year,
        image: getBestImageUrl(topAlbums[0].image),
        songCount: topAlbums[0].songCount ?? 0,
        url: topAlbums[0].url,
        isAlbum: true,
      };
    }
    return null;
  }, [topAlbums]);

  // Is current queue playing from this artist?
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
      setLoadingMore(false);
      setFollowing(false);
      nextPageRef.current = "";
      setHasMore(true);
    });
  }, []);

  const applyArtistFollowState = useCallback((nextFollowing: boolean) => {
    queueMicrotask(() => {
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
      setFollowing(nextFollowing);
    });
  }, []);

  const applyArtistDetails = useCallback((data: ArtistDetails | null) => {
    queueMicrotask(() => {
      if (data) {
        // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
        setArtist(data);
        setHasMore(data.hasMoreSongs);
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
    routeRef.current = artistId;
    if (!artistId) {
      // Reset the result when navigating to an invalid artist URL.
       
      markArtistNotFound();
      return;
    }

    let cancelled = false;
    const initialCached = getImmediateCachedArtist(artistId);
    // A route change replaces the visible artist with the cached result before fetching.
    /* eslint-disable react-hooks/set-state-in-effect */
    setArtist(initialCached);
    setLoading(!initialCached);
    resetArtistLoadState(Boolean(initialCached));
    /* eslint-enable react-hooks/set-state-in-effect */

    void isFollowingArtist(artistId).then((v) => {
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
      if (!cancelled) applyArtistFollowState(v);
    });

    getArtistDetails(artistId, initName)
      .then((data) => {
        if (cancelled) return;
        // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
        applyArtistDetails(data);
        if (data) void reconcileFollowedArtist(artistId, { id: data.id, name: data.name, image: getBestImageUrl(data.image), followedAt: 0 }).then(value => { if (!cancelled) applyArtistFollowState(value); });
      })
      .catch(() => {
        if (!cancelled) applyArtistLoadFailure();
      })
      .finally(() => {
        if (!cancelled) finishArtistLoad();
      });

    return () => {
      cancelled = true;
      routeRef.current = null;
    };
  }, [
    applyArtistDetails,
    applyArtistFollowState,
    applyArtistLoadFailure,
    artistId,
    initName,
    finishArtistLoad,
    markArtistNotFound,
    resetArtistLoadState,
  ]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    if (isPlayingFromThisArtist) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps listed
  }, [songs, isPlayingFromThisArtist, togglePlay, playSong]);

  const handleFollow = useCallback(async () => {
    if (!artist) return;
    const artistCard: FollowedArtist = {
      id: artist?.id || artistId,
      name: displayName,
      image: coverUrl,
      followedAt: Date.now(),
    };
    const nowFollowing = await toggleFollowArtist(artistCard);
    setFollowing(nowFollowing);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps listed
  }, [artistId, artist, displayName, coverUrl]);

  const handleShare = useCallback(async () => {
    await shareArtist({
      id: artist?.id || artistId || "",
      name: displayName || "Artist",
      coverUrl,
    });
  }, [artistId, artist?.id, displayName, coverUrl]);

  const handleShuffle = useCallback(() => {
    if (!songs.length) return;
    shufflePlay(songs);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps listed
  }, [songs, shufflePlay]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !artistId) return;
    setLoadingMore(true);
    try {
      const newSongs = await getArtistSongs(artist?.id || artistId, nextPageRef.current);
      if (routeRef.current !== artistId) return;
      if (newSongs.songs.length === 0) {
        setHasMore(false);
        return;
      }
      const converted = newSongs.songs;
      setExtraSongs((prev) => {
        const existingIds = new Set([...(artist?.topSongs || []), ...prev].map((s) => s.id));
        const unique = converted.filter((s) => !existingIds.has(s.id));
        return [...prev, ...unique];
      });
      nextPageRef.current = newSongs.cursor;
      setHasMore(Boolean(newSongs.cursor));
    } catch {
      if (routeRef.current === artistId) showGlobalToast("Could not load more songs. Tap to retry.");
    } finally {
      if (routeRef.current === artistId) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, artistId, artist]);

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
    (album: ArtistAlbum) => {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: album.id,
          jiosaavn: "false",
          youtube: "true",
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
          jiosaavn: "false",
          youtube: "true",
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
    ({ item }: { item: ArtistAlbum }) => (
      <Pressable style={styles.albumCard} onPress={() => handleAlbumPress(item)}>
        <Image
          recyclingKey={item.id}
          source={{ uri: displayArtworkUrl(getBestImageUrl(item.image), 136) }}
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
    ({ item }: { item: ArtistCard }) => {
      const img = getBestImageUrl(item.image);
      return (
        <Pressable
          style={styles.similarCard}
          onPress={() => handleSimilarArtistPress(item.id, item.name, img)}
        >
          <Image
            recyclingKey={item.id}
            source={{ uri: displayArtworkUrl(img, 86) }}
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

  const songsRef = useRef(songs);
  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  const renderSongRow = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow
        key={item.id}
        song={item}
        index={index}
        queue={songsRef.current}
        queueKey={songsQueueKey}
        showDownload={false}
      />
    ),
     
    [songsQueueKey]
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
          <CircularBackButton onPress={safeGoBack} />
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
          <CircularBackButton onPress={safeGoBack} />
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
                  source={{ uri: displayArtworkUrl(coverUrl, 480) }}
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

                <CollectionActionRow
                  onShuffle={handleShuffle}
                  onPlay={handlePlayAll}
                  onLike={handleFollow}
                  isPlaying={isPlayingFromThisArtist && isPlaying}
                  isLiked={following}
                  disabled={!songs.length}
                  playLabel="Play"
                  likedLabel="artist"
                />

              </View>
            </View>

            {/* ── Featured "Latest Release" Glass Card ── */}
            {latestRelease ? (
              <Pressable style={styles.latestReleaseCard} onPress={handleLatestReleasePress}>
                <Image
                  source={{ uri: displayArtworkUrl(latestRelease.image, 128) }}
                  style={styles.latestReleaseThumb}
                  contentFit="cover"
                  transition={80}
                  cachePolicy="memory-disk"
                />
                <View style={styles.latestReleaseMeta}>
                  <Text style={styles.latestReleaseDate}>
                    {latestRelease.year ? `${latestRelease.year} • ` : ""}Featured Release
                  </Text>
                  <Text style={styles.latestReleaseTitle} numberOfLines={1}>
                    {latestRelease.name}
                  </Text>
                  <Text style={styles.latestReleaseCount}>
                    {latestRelease.songCount ? `${latestRelease.songCount} songs` : "Album / EP"}
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
            {hasMore && !loading && artist ? (
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
                <Text style={styles.carouselSectionTitle}>Albums & EPs</Text>
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

      {/* ── Top Floating Navigation Buttons (Reusable Nav System) ── */}
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
        {/* Left: Circular Back Button */}
        <CircularBackButton onPress={safeGoBack} />

        {/* Right: Capsule Group — Share + More */}
        <CapsuleNavGroup>
          <CapsuleNavButton
            icon="share-outline"
            iconSize={19}
            onPress={handleShare}
            accessibilityLabel="Share artist"
          />
          <CapsuleDivider />
          <CapsuleNavButton
            icon="ellipsis-horizontal"
            iconSize={19}
            onPress={() => setShowBioModal(true)}
            accessibilityLabel="More info"
          />
        </CapsuleNavGroup>
      </Animated.View>

      {/* ── Apple Music Sticky Header ── */}
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
                <Image source={{ uri: displayArtworkUrl(coverUrl, 60) }} style={styles.modalAvatar} contentFit="cover" />
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

