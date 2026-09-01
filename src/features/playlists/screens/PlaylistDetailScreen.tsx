import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
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
import { usePlaylistDetailData } from "../hooks/usePlaylistDetailData";
import { usePlaylistDetailParams } from "../hooks/usePlaylistDetailParams";
import { usePlaylistEditModalState } from "../hooks/usePlaylistEditModalState";
import { PlaylistEditModal } from "../components/PlaylistEditModal";
import { PlaylistHero } from "../components/PlaylistHero";
import { PlaylistStickyHeader } from "../components/PlaylistStickyHeader";
import { PlaylistTrackListEmpty } from "../components/PlaylistTrackListEmpty";
import AdMobBanner from "@/components/AdMobBanner";

export function PlaylistDetailScreen() {
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

  // Sticky header state
  const [stickyOpacity] = useState(() => new Animated.Value(0));
  const [isStickyVisible, setIsStickyVisible] = useState(false);

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
    return songs.some((s: Song) => s.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((q, i) => q.id === songs[i]?.id);
  }, [currentSong, queue, songs]);

  const playlistTitleSize = useMemo(() => {
    const len = playlistName.trim().length;
    if (len <= 16) return 34;
    if (len <= 32) return 28;
    if (len <= 48) return 23;
    return 20;
  }, [playlistName]);

  const canRemoveSongsFromPlaylist = !params.isJioSaavnSource && (!params.isFirestoreSource || Boolean(user?.id));
  const playlistRowSource = params.isFirestoreSource ? "firestore" : "local";
  const canEdit = !params.isJioSaavnSource && (!params.isFirestoreSource || Boolean(user?.id));

  // Handlers
  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const shouldShow = y > 260;
    setIsStickyVisible(shouldShow);
    Animated.timing(stickyOpacity, {
      toValue: shouldShow ? 1 : 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [stickyOpacity]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromThisPlaylist && isPlaying) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromThisPlaylist, isPlaying, togglePlay, playSong]);

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
      isStickyVisible,
      loading,
      hasSongs: songs.length > 0,
      isPlayingFromThisPlaylist,
      isPlaying,
    }),
    [isStickyVisible, loading, songs.length, isPlayingFromThisPlaylist, isPlaying]
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
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtnSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
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
        playlistTitleSize={playlistTitleSize}
        effectiveSongCount={effectiveSongCount}
        totalMinutes={totalMinutes}
        totalDurationLabel={totalDurationLabel}
        stateFlags={heroStateFlags}
        songs={songs}
        downloadCollectionId={downloadCollectionId}
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tracks</Text>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <PlaylistStickyHeader
        topInset={topInset}
        stickyOpacity={stickyOpacity}
        playlistName={playlistName}
        playState={stickyPlayState}
        onPlayAll={handlePlayAll}
      />

      <FlatList
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
        scrollEventThrottle={16}
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

export default PlaylistDetailScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtnSolo: { width: 36, height: 36, marginLeft: 12, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.subtext, fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },

  offlineBannerWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  section: {
    paddingTop: 16,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});
