import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Animated from "@/lib/nativeAnimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { type Song, formatDuration } from "@/lib/musicData";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import SongRow from "@/components/SongRow";
import { useAuth } from "@/contexts/AuthContext";
import OfflineBanner from "@/components/OfflineBanner";
import { useNetwork } from "@/contexts/NetworkContext";
import { sharePlaylist } from "@/utils/shareUtils";
import { useArtworkPalette, colorWithAlpha } from "@/lib/colorExtractor";
import { usePlaylistDetailData } from "../hooks/usePlaylistDetailData";
import { usePlaylistDetailParams } from "../hooks/usePlaylistDetailParams";
import { usePlaylistEditModalState } from "../hooks/usePlaylistEditModalState";
import { PlaylistEditModal } from "../components/PlaylistEditModal";
import { PlaylistHero } from "../components/PlaylistHero";
import { PlaylistStickyHeader } from "../components/PlaylistStickyHeader";
import { PlaylistTrackListEmpty } from "../components/PlaylistTrackListEmpty";
import AdMobBanner from "@/components/AdMobBanner";

export function PlaylistDetailScreen() {
  return usePlaylistDetailView();
}

export default PlaylistDetailScreen;

function usePlaylistDetailView() {
  const params = usePlaylistDetailParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const { currentSong, queue } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay } = usePlayerActions();

  const topInset = insets.top;
  const bottomPad = Platform.OS === "web" ? 132 : Math.max(150, insets.bottom + 126);
  const contentContainerStyle = useMemo(() => ({ paddingBottom: bottomPad }), [bottomPad]);

  const {
    loading,
    playlistName,
    playlistCover,
    playlistDescription,
    songs,
    notFound,
    loadError,
    playlistIsPublic,
    showEditModal,
    setShowEditModal,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editCover,
    setEditCover,
    editIsPublic,
    setEditIsPublic,
    isSaving,
    isUploadingImage,
    uploadProgress,
    handlePickImage,
    handleRemoveImage,
    handleSaveEdit,
    handleDeletePlaylist,
  } = usePlaylistDetailData(params);

  const palette = useArtworkPalette(playlistCover);
  const backgroundColor = palette?.background || Colors.background;

  // Sticky header cross-fade animation
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

  // Edit modal animation hook
  const {
    modalOpacity,
    modalTranslateY,
    handleOpenEdit,
    closeEditModal,
  } = usePlaylistEditModalState({
    playlistName,
    playlistDescription,
    playlistCover,
    playlistIsPublic,
    setEditName,
    setEditDescription,
    setEditCover,
    setEditIsPublic,
    setShowEditModal,
  });

  // Derived calculations
  const totalDuration = useMemo(() => songs.reduce((a: number, s: Song) => a + (s.duration || 0), 0), [songs]);
  const totalDurationLabel = totalDuration > 0 ? formatDuration(totalDuration) : "";
  const totalMinutes = useMemo(() => Math.max(0, Math.floor(totalDuration / 60)), [totalDuration]);
  const effectiveSongCount = songs.length > 0 ? songs.length : params.initialSongCount;
  const collectionKind = params.isSongSource ? "Single" : params.isAlbumSource ? "Album" : "Playlist";
  const collectionKindLower = params.isSongSource ? "single" : params.isAlbumSource ? "album" : "playlist";
  const downloadCollectionId = params.isAlbumSource ? `album:${params.playlistId}` : params.playlistId;

  const isPlayingFromThisPlaylist = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return songs.some((s: Song) => s.id === currentSong.id);
  }, [currentSong, songs]);

  const canRemoveSongsFromPlaylist = !params.isJioSaavnSource && (!params.isFirestoreSource || Boolean(user?.id));
  const playlistRowSource = params.isFirestoreSource ? "firestore" : "local";
  const canEdit = !params.isJioSaavnSource && (!params.isFirestoreSource || Boolean(user?.id));

  // Scroll listener for sticky cross-fade
  const isStickyVisibleRef = useRef(false);
  const handleScroll = useCallback(
    (e: any) => {
      const y = e?.nativeEvent?.contentOffset?.y ?? 0;
      const shouldShow = y > 240;
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

  const handleShare = useCallback(async () => {
    await sharePlaylist({
      id: params.playlistId || "",
      name: playlistName || "Playlist",
      coverUrl: playlistCover,
      songCount: songs.length,
    });
  }, [params.playlistId, playlistName, playlistCover, songs.length]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromThisPlaylist) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromThisPlaylist, togglePlay, playSong]);

  const handleShufflePlay = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shufflePlay(songs);
  }, [songs, shufflePlay]);

  const songsQueueKey = useMemo(() => songs.map((s: Song) => s.id).join("|"), [songs]);

  const renderPlaylistSong = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow
        song={item}
        index={index}
        queue={songs}
        queueKey={songsQueueKey}
        optionContext={canRemoveSongsFromPlaylist ? "playlist" : undefined}
        playlistId={canRemoveSongsFromPlaylist ? params.playlistId : undefined}
        playlistSource={canRemoveSongsFromPlaylist ? playlistRowSource : undefined}
        playlistName={canRemoveSongsFromPlaylist ? playlistName : undefined}
      />
    ),
    [canRemoveSongsFromPlaylist, params.playlistId, playlistName, playlistRowSource, songs, songsQueueKey]
  );

  const playlistSongKeyExtractor = useCallback((item: Song, index: number) => `${item.id}-${index}`, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<Song> | null | undefined, index: number) => ({
      length: 68,
      offset: 68 * index,
      index,
    }),
    []
  );

  const stickyPlayState = useMemo(
    () => ({
      loading,
      hasSongs: songs.length > 0,
      isPlayingFromThisPlaylist,
      isPlaying,
    }),
    [loading, songs.length, isPlayingFromThisPlaylist, isPlaying]
  );

  const heroStateFlags = useMemo(
    () => ({
      isFirestoreSource: params.isFirestoreSource,
      playlistIsPublic,
      canEdit,
      loading,
      isPlayingFromThisPlaylist,
      isPlaying,
    }),
    [params.isFirestoreSource, playlistIsPublic, canEdit, loading, isPlayingFromThisPlaylist, isPlaying]
  );

  if (notFound) {
    return (
      <View style={[styles.container, { backgroundColor, paddingTop: topInset }]}>
        <Pressable
          onPress={safeGoBack}
          style={styles.backBtnSolo}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <Ionicons name="musical-notes-outline" size={40} color={Colors.subtext} />
          <Text style={styles.emptyText}>{collectionKind} not found</Text>
        </View>
      </View>
    );
  }

  const listHeader = (
    <>
      <PlaylistHero
        topInset={topInset}
        playlistCover={playlistCover}
        playlistName={playlistName}
        playlistDescription={playlistDescription}
        collectionKind={collectionKind}
        collectionKindLower={collectionKindLower}
        effectiveSongCount={effectiveSongCount}
        totalMinutes={totalMinutes}
        stateFlags={heroStateFlags}
        songs={songs}
        downloadCollectionId={downloadCollectionId}
        backgroundColor={backgroundColor}
        onOpenEdit={handleOpenEdit}
        onPlayAll={handlePlayAll}
        onShufflePlay={handleShufflePlay}
      />

      {!isOnline && (
        <View style={styles.offlineBannerWrap}>
          <OfflineBanner />
        </View>
      )}

      <AdMobBanner loadDelayMs={800} />

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Tracks</Text>
        <Text style={styles.sectionSubtitle}>
          {effectiveSongCount} {effectiveSongCount === 1 ? "track" : "tracks"}
          {totalDurationLabel ? ` • ${totalDurationLabel}` : totalMinutes > 0 ? ` • ${totalMinutes} min` : ""}
        </Text>
      </View>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Top Floating Navigation Bar */}
      <Animated.View
        style={[
          styles.floatingNavContainer,
          { top: topInset + 6, opacity: floatingNavOpacity },
        ]}
        pointerEvents={isStickyVisible ? "none" : "box-none"}
      >
        <Pressable onPress={safeGoBack} style={styles.iosCircularNavBtn}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </Pressable>

        {canEdit ? (
          <View style={styles.iosCapsuleNavGroup}>
            <Pressable onPress={handleOpenEdit} style={styles.iosCapsuleBtn}>
              <Ionicons name="pencil" size={16} color="#FFFFFF" />
            </Pressable>
            <View style={styles.iosCapsuleDivider} />
            <Pressable onPress={handleShare} style={styles.iosCapsuleBtn}>
              <Ionicons name="share-outline" size={17} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={handleShare} style={styles.iosCircularNavBtn}>
            <Ionicons name="share-outline" size={17} color="#FFFFFF" />
          </Pressable>
        )}
      </Animated.View>

      <PlaylistStickyHeader
        topInset={topInset}
        stickyOpacity={stickyOpacity}
        playlistName={playlistName}
        isStickyVisible={isStickyVisible}
        playState={stickyPlayState}
        backgroundColor={backgroundColor}
        onPlayAll={handlePlayAll}
      />

      <Animated.FlatList
        data={songs}
        renderItem={renderPlaylistSong}
        keyExtractor={playlistSongKeyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <PlaylistTrackListEmpty
            loading={loading}
            collectionKind={collectionKind}
            loadError={loadError}
          />
        }
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        removeClippedSubviews={Platform.OS === "android"}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        getItemLayout={getItemLayout}
      />

      <PlaylistEditModal
        visible={showEditModal}
        modalOpacity={modalOpacity}
        modalTranslateY={modalTranslateY}
        isFirestoreSource={params.isFirestoreSource}
        editName={editName}
        setEditName={setEditName}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        editCover={editCover}
        editIsPublic={editIsPublic}
        setEditIsPublic={setEditIsPublic}
        isSaving={isSaving}
        isUploadingImage={isUploadingImage}
        uploadProgress={uploadProgress}
        onPickImage={handlePickImage}
        onRemoveImage={handleRemoveImage}
        onSave={handleSaveEdit}
        onClose={closeEditModal}
        onDelete={handleDeletePlaylist}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080B0F" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtnSolo: { width: 36, height: 36, marginLeft: 12, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.subtext, fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },

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

  offlineBannerWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
