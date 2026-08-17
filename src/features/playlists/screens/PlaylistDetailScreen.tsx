import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  ActivityIndicator,
  Easing,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  Alert,
  DeviceEventEmitter,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import {
  Song,
  convertJioSaavnSong,
  formatDuration,
  getBestImageUrl,
  JioSaavnSong,
} from "@/lib/musicData";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { getUserPlaylists, updateUserPlaylist, deleteUserPlaylist, UserPlaylist } from "@/lib/storage";
import { firestorePlaylistToLocalSongs, getPlaylistById, updateFirestorePlaylist, deleteFirestorePlaylist } from "@/lib/firestore";
import { getCachedHomePublicPlaylists } from "@/lib/homeCache";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import { getJioSaavnAlbumDetails, getJioSaavnPlaylistDetails, getJioSaavnSongDetails } from "@/data/providers/JioSaavnProvider";
import { useAuth } from "@/contexts/AuthContext";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import DownloadCollectionButton from "@/components/DownloadCollectionButton";
import OfflineBanner from "@/components/OfflineBanner";
import { useNetwork } from "@/contexts/NetworkContext";

const subscribeToPlaylistSongRemoved = (
  listener: (event: { playlistId?: string; songId?: string }) => void
) => {
  const subscription = DeviceEventEmitter.addListener("PlaylistSongRemoved", listener);
  return () => subscription.remove();
};

function pickFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PlaylistDetailScreen() {
  return <PlaylistScreenView />;
}

export default PlaylistDetailScreen;

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- acceptable component structure for this screen
// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this screen
function PlaylistScreenView() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    jiosaavn?: string | string[];
    album?: string | string[];
    song?: string | string[];
    type?: string | string[];
    link?: string | string[];
    firestore?: string | string[];
    title?: string | string[];
    description?: string | string[];
    cover?: string | string[];
    songCount?: string | string[];
  }>();

  const playlistId = pickFirstParam(params.id).trim();
  const sourceLink = pickFirstParam(params.link).trim();
  const isSongSource = pickFirstParam(params.song) === "true" || pickFirstParam(params.type) === "song" || sourceLink.includes("/song/");
  const isAlbumSource = !isSongSource && (pickFirstParam(params.album) === "true" || pickFirstParam(params.type) === "album" || sourceLink.includes("/album/"));
  const isFirestoreSource = pickFirstParam(params.firestore) === "true";
  const isJioSaavnSource = !isFirestoreSource;
  const initialTitle = pickFirstParam(params.title).trim();
  const initialCover = pickFirstParam(params.cover).trim();
  const initialDescription = pickFirstParam(params.description).trim();
  const initialSongCount = Math.max(0, Number(pickFirstParam(params.songCount)) || 0);
  const hasPrefilledHeader = initialTitle.length > 0 || initialCover.length > 0 || initialSongCount > 0;

  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const { currentSong, queue } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay } = usePlayerActions();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 132 : Math.max(150, insets.bottom + 126);

  const contentContainerStyle = useMemo(() => ({
    paddingBottom: bottomPad,
  }), [bottomPad]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [playlistName, setPlaylistName] = useState(initialTitle);
  const [playlistCover, setPlaylistCover] = useState(initialCover);
  const [playlistDescription, setPlaylistDescription] = useState(
    initialDescription || (initialSongCount > 0 ? `${initialSongCount} songs` : "")
  );
  const [songs, setSongs] = useState<Song[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [playlistIsPublic, setPlaylistIsPublic] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCover, setEditCover] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Sticky header
  const stickyOpacityRef = useRef<Animated.Value | null>(null);
  if (stickyOpacityRef.current === null) stickyOpacityRef.current = new Animated.Value(0);
  const stickyOpacity = stickyOpacityRef.current;
  const [isStickyVisible, setIsStickyVisible] = useState(false);
  const stickyVisibleRef = useRef(false);

  // Bottom sheet animation
  const { height: screenHeight } = useWindowDimensions();
  const modalTranslateYRef = useRef<Animated.Value | null>(null);
  if (modalTranslateYRef.current === null) modalTranslateYRef.current = new Animated.Value(screenHeight);
  const modalTranslateY = modalTranslateYRef.current;
  const modalOpacityRef = useRef<Animated.Value | null>(null);
  if (modalOpacityRef.current === null) modalOpacityRef.current = new Animated.Value(0);
  const modalOpacity = modalOpacityRef.current;

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalDuration = useMemo(() => songs.reduce((a, s) => a + s.duration, 0), [songs]);
  const totalDurationLabel = totalDuration > 0 ? formatDuration(totalDuration) : "";
  const totalMinutes = useMemo(() => Math.max(0, Math.floor(totalDuration / 60)), [totalDuration]);
  const effectiveSongCount = songs.length > 0 ? songs.length : initialSongCount;
  const collectionKind = isSongSource ? "Single" : isAlbumSource ? "Album" : "Playlist";
  const collectionKindLower = isSongSource ? "single" : isAlbumSource ? "album" : "playlist";
  const downloadCollectionId = isAlbumSource ? `album:${playlistId}` : playlistId;

  const isPlayingFromThisPlaylist = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return songs.some((s) => s.id === currentSong.id) &&
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

  const canRemoveSongsFromPlaylist = !isJioSaavnSource && (!isFirestoreSource || Boolean(user?.id));
  const playlistRowSource = isFirestoreSource ? "firestore" : "local";

  useEffect(() => {
    return subscribeToPlaylistSongRemoved(
      (event: { playlistId?: string; songId?: string }) => {
        if (event?.playlistId !== playlistId || !event.songId) return;
        setSongs((prev) => prev.filter((song) => song.id !== event.songId));
      }
    );
  }, [playlistId]);

  // ── Normalizers ────────────────────────────────────────────────────────────
  const normalizeLoadedSongs = useCallback((rawSongs: JioSaavnSong[]): Song[] => {
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const raw of rawSongs) {
      const song = convertJioSaavnSong(raw);
      const id = String(song.id || "").trim();
      const title = String(song.title || "").trim();
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...song, id, title, audioUrl: String(song.audioUrl || "").trim() });
    }
    const playable = out.filter((s) => s.audioUrl.length > 0);
    return playable.length > 0 ? playable : out;
  }, []);

  const applyJioPlaylistData = useCallback((data: {
    name?: string; description?: string; songCount?: number;
    image?: { quality: string; url: string }[] | string; songs?: JioSaavnSong[];
  }): number => {
    if (data.name) setPlaylistName(data.name);
    if (data.image) setPlaylistCover(Array.isArray(data.image) ? getBestImageUrl(data.image) : data.image);
    setPlaylistDescription((data.description || "").trim() || `${data.songCount || data.songs?.length || 0} songs`);
    const finalSongs = normalizeLoadedSongs(data.songs || []);
    if (finalSongs.length > 0) setSongs(finalSongs);
    return finalSongs.length;
  }, [normalizeLoadedSongs]);

  const applyFirestorePlaylistData = useCallback((playlist: {
    name?: string; description?: string; imageUrl?: string; songs?: Song[] | unknown[]; isPublic?: boolean;
  }) => {
    const nextSongs = firestorePlaylistToLocalSongs({
      id: playlistId,
      name: playlist.name || initialTitle || "Playlist",
      description: playlist.description || "",
      imageUrl: playlist.imageUrl || "",
      songs: Array.isArray(playlist.songs) ? playlist.songs : [],
      createdBy: { id: "", name: "Community" },
      isPublic: playlist.isPublic ?? false,
    });
    setPlaylistName(playlist.name || initialTitle || "Playlist");
    setPlaylistDescription((playlist.description || "").trim() || `${nextSongs.length || initialSongCount} songs`);
    setPlaylistCover(playlist.imageUrl || initialCover || "");
    setPlaylistIsPublic(playlist.isPublic ?? false);
    setSongs(nextSongs);
  }, [initialCover, initialSongCount, initialTitle, playlistId]);

  const resetPlaylistLoadState = useCallback(() => {
    setPlaylistName(initialTitle);
    setPlaylistDescription(initialDescription || (initialSongCount > 0 ? `${initialSongCount} songs` : ""));
    setPlaylistCover(initialCover);
    setSongs([]);
    setNotFound(false);
    setLoadError("");
    setLoading(true);
  }, [initialCover, initialDescription, initialSongCount, initialTitle]);

  const applyLocalPlaylistData = useCallback((playlist: UserPlaylist) => {
    setPlaylistName(playlist.name);
    setPlaylistDescription(playlist.description);
    setPlaylistCover(playlist.coverUrl);
    setSongs(playlist.songs);
  }, []);

  const finishPlaylistLoad = useCallback(() => {
    setLoading(false);
  }, []);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!playlistId) {
      setNotFound(true);
      return;
    }

    resetPlaylistLoadState();

    const load = async () => {
      try {
        if (isFirestoreSource) {
          const playlist = await getPlaylistById(playlistId)
            ?? (await getCachedHomePublicPlaylists({ allowStale: true })).find((p) => p.id === playlistId);
          if (!cancelled) {
            if (playlist) applyFirestorePlaylistData(playlist);
            else if (!hasPrefilledHeader) setNotFound(true);
            else setLoadError("Playlist tracks could not load right now.");
          }
          return;
        }

        if (isJioSaavnSource) {
          const loadJioCollectionAttempt = async (attempt: number): Promise<number> => {
            try {
              if (isSongSource) {
                const songData = await getJioSaavnSongDetails(playlistId, sourceLink);
                if (songData && !cancelled) {
                  const songImg = songData.image || (initialCover ? [{ quality: "500x500", url: initialCover }] : []);
                  const loadedCount = applyJioPlaylistData({
                    name: songData.name || (songData as any).title || initialTitle || "Song",
                    description: songData.album?.name || (songData as any).artists?.primary?.map((a: any) => a.name).join(", ") || initialDescription || "Single Track",
                    image: songImg,
                    songCount: 1,
                    songs: [songData],
                  });
                  if (loadedCount > 0) {
                    const albumId = songData.album?.id || (songData as any).album_id;
                    const albumUrl = songData.album?.url || (songData as any).album_url;
                    if (albumId || albumUrl) {
                      void getJioSaavnAlbumDetails(albumId || "", { link: albumUrl }).then((albumData) => {
                        if (!cancelled && albumData?.songs?.length && albumData.songs.length > 1) {
                          applyJioPlaylistData(albumData);
                        }
                      }).catch(() => {});
                    }
                    return loadedCount;
                  }
                }
              }

              let data: any = null;
              if (isAlbumSource) {
                try {
                  data = await getJioSaavnAlbumDetails(playlistId, { link: sourceLink });
                } catch {
                  data = await getJioSaavnPlaylistDetails(playlistId, { link: sourceLink }).catch(() => null);
                }
              } else {
                try {
                  data = await getJioSaavnPlaylistDetails(playlistId, { link: sourceLink });
                } catch {
                  data = await getJioSaavnAlbumDetails(playlistId, { link: sourceLink }).catch(() => null);
                }
              }

              if (!data?.songs?.length) {
                const singleSong = await getJioSaavnSongDetails(playlistId, sourceLink);
                if (singleSong) {
                  data = {
                    name: singleSong.name || (singleSong as any).title || initialTitle,
                    description: singleSong.album?.name || initialDescription || "Single Track",
                    image: singleSong.image || (initialCover ? [{ quality: "500x500", url: initialCover }] : []),
                    songCount: 1,
                    songs: [singleSong],
                  };
                }
              }

              if (!cancelled && data) {
                const loadedCount = applyJioPlaylistData(data);
                if (loadedCount > 0) return loadedCount;
              }
            } catch {
              // Retry on transient failure
            }

            if (!cancelled && attempt < 2) {
              await delay(180);
              return cancelled ? 0 : loadJioCollectionAttempt(attempt + 1);
            }

            return 0;
          };

          const loadedCount = await loadJioCollectionAttempt(0);
          if (!cancelled && loadedCount === 0) {
            if (!hasPrefilledHeader) setNotFound(true);
            else setLoadError("Songs are taking longer than expected to load.");
          }
          return;
        }

        const playlists = await getUserPlaylists();
        if (!cancelled) {
          const found = playlists.find((p) => p.id === playlistId);
          if (found) {
            applyLocalPlaylistData(found);
          } else if (!hasPrefilledHeader) {
            setNotFound(true);
          } else {
            setLoadError("Playlist tracks could not load right now.");
          }
        }
      } catch {
        if (cancelled) return;
        if (hasPrefilledHeader) setLoadError("Songs could not load right now.");
        else setNotFound(true);
      } finally {
        if (!cancelled) finishPlaylistLoad();
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [
    playlistId, isAlbumSource, isSongSource, sourceLink, isFirestoreSource, isJioSaavnSource,
    initialTitle, initialCover, initialDescription,
    applyFirestorePlaylistData, applyJioPlaylistData,
    applyLocalPlaylistData, finishPlaylistLoad,
    hasPrefilledHeader,
    resetPlaylistLoadState,
  ]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const shouldShow = y > 260;
    if (stickyVisibleRef.current === shouldShow) return;
    stickyVisibleRef.current = shouldShow;
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
    if (isPlayingFromThisPlaylist) { togglePlay(); return; }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromThisPlaylist, togglePlay, playSong]);

  const handleShufflePlay = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shufflePlay(songs);
  }, [songs, shufflePlay]);

  // Edit handlers
  const handleOpenEdit = useCallback(() => {
    setEditName(playlistName);
    setEditDescription(playlistDescription);
    setEditCover(playlistCover);
    setEditIsPublic(playlistIsPublic);
    modalOpacity.setValue(0);
    modalTranslateY.setValue(screenHeight);
    setShowEditModal(true);
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(modalTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 30,
        stiffness: 360,
        mass: 0.78,
      }),
    ]).start();
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [modalOpacity, modalTranslateY, playlistName, playlistDescription, playlistCover, playlistIsPublic, screenHeight]);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photo library to upload images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setEditCover(result.assets[0].uri);
        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image");
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setEditCover("");
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const closeEditModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: screenHeight,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowEditModal(false);
      modalTranslateY.setValue(screenHeight);
    });
  }, [modalOpacity, modalTranslateY, screenHeight]);

  const handleSaveEdit = useCallback(async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Playlist name cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      let finalImageUrl = editCover;
      if (editCover && (editCover.startsWith("file://") || editCover.startsWith("content://"))) {
        try {
          setIsUploadingImage(true);
          finalImageUrl = await uploadImageToCloudinary(editCover, (progress) => {
            setUploadProgress(progress);
          });
          setIsUploadingImage(false);
          if (!finalImageUrl) throw new Error("Upload failed");
        } catch {
          setIsUploadingImage(false);
          Alert.alert("Upload Error", "Failed to upload image. Please try again.");
          setIsSaving(false);
          return;
        }
      }

      if (isFirestoreSource && user?.id) {
        await updateFirestorePlaylist(playlistId, {
          name: editName.trim(),
          description: editDescription.trim(),
          imageUrl: finalImageUrl.trim(),
          isPublic: editIsPublic,
        });
      } else {
        await updateUserPlaylist(playlistId, {
          name: editName.trim(),
          description: editDescription.trim(),
          coverUrl: finalImageUrl.trim(),
        });
      }

      setPlaylistName(editName.trim());
      setPlaylistDescription(editDescription.trim());
      setPlaylistCover(finalImageUrl.trim());
      setPlaylistIsPublic(editIsPublic);
      setShowEditModal(false);
      Alert.alert("Success", "Playlist updated successfully");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to update playlist");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  }, [editName, editDescription, editCover, editIsPublic, playlistId, isFirestoreSource, user?.id]);

  const handleDeletePlaylist = useCallback(() => {
    Alert.alert(
      "Delete Playlist",
      `Are you sure you want to delete "${playlistName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (isFirestoreSource && user?.id) {
                await deleteFirestorePlaylist(playlistId);
              } else {
                await deleteUserPlaylist(playlistId);
              }
              if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              safeGoBack();
            } catch {
              Alert.alert("Error", "Failed to delete playlist");
            }
          },
        },
      ]
    );
  }, [playlistName, playlistId, isFirestoreSource, user?.id]);

  const canEdit = !isJioSaavnSource && (!isFirestoreSource || Boolean(user?.id));
  const songsQueueKey = useMemo(() => songs.map((s) => s.id).join("|"), [songs]);

  const renderPlaylistSong = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow
        song={item}
        index={index}
        queue={songs}
        queueKey={songsQueueKey}
        optionContext={canRemoveSongsFromPlaylist ? "playlist" : undefined}
        playlistId={canRemoveSongsFromPlaylist ? playlistId : undefined}
        playlistSource={canRemoveSongsFromPlaylist ? playlistRowSource : undefined}
        playlistName={canRemoveSongsFromPlaylist ? playlistName : undefined}
      />
    ),
    [canRemoveSongsFromPlaylist, playlistId, playlistName, playlistRowSource, songs, songsQueueKey]
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

  // ── Error / not-found screens ──────────────────────────────────────────────
  if (loading && !hasPrefilledHeader) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtnSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtnSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <Text style={styles.emptyText}>{collectionKind} not found</Text>
        </View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner />}
      <FlatList
        data={loadError ? [] : songs}
        keyExtractor={playlistSongKeyExtractor}
        renderItem={renderPlaylistSong}
        getItemLayout={getItemLayout}
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
        ListHeaderComponent={
          <>
            {/* ── Hero ── */}
            <View style={[styles.hero, { paddingTop: topInset + 8 }]}>
              {playlistCover ? (
                <Image
                  source={{ uri: playlistCover }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  contentPosition={{ left: "50%", top: "28%" }}
                  transition={120}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
                  <Ionicons name="musical-notes" size={72} color="rgba(255,255,255,0.15)" />
                </View>
              )}
              <LinearGradient
                colors={["transparent", "rgba(16,20,26,0.55)", Colors.background]}
                locations={[0.25, 0.65, 1]}
                style={StyleSheet.absoluteFill}
              />
              <Pressable onPress={safeGoBack} style={[styles.heroBack, { top: topInset + 8 }]}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </Pressable>
              {canEdit && (
                <Pressable onPress={handleOpenEdit} style={[styles.heroEdit, { top: topInset + 8 }]}>
                  <Ionicons name="create-outline" size={20} color="#fff" />
                </Pressable>
              )}
              <View style={styles.heroInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text numberOfLines={3} style={[styles.heroTitle, { fontSize: playlistTitleSize, flex: 1 }]}>
                    {playlistName}
                  </Text>
                  {isFirestoreSource && (
                    <View style={[styles.visibilityBadge, playlistIsPublic ? styles.visibilityBadgePublic : styles.visibilityBadgePrivate]}>
                      <Ionicons name={playlistIsPublic ? "globe-outline" : "lock-closed-outline"} size={12} color="#fff" />
                      <Text style={styles.visibilityBadgeText}>{playlistIsPublic ? "Public" : "Private"}</Text>
                    </View>
                  )}
                </View>
                {playlistDescription && !/^\d+\s+songs?$/i.test(playlistDescription) ? (
                  <Text numberOfLines={1} style={styles.heroSub}>{playlistDescription}</Text>
                ) : null}
                <Text style={styles.heroMeta}>
                  {effectiveSongCount > 0 ? `${effectiveSongCount} songs` : ""}
                  {totalMinutes > 0 ? `  ·  ${totalMinutes} min` : ""}
                </Text>
                <View style={styles.heroActions}>
                  <Pressable style={styles.shuffleBtn} onPress={handleShufflePlay} disabled={!songs.length}>
                    <Ionicons name="shuffle" size={17} color={Colors.text} />
                    <Text style={styles.shuffleBtnText}>Shuffle</Text>
                  </Pressable>
                  <Pressable style={styles.playBtn} onPress={handlePlayAll} disabled={!songs.length}>
                    <Ionicons
                      name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
                      size={18}
                      color="#000"
                    />
                    <Text style={styles.playBtnText}>
                      {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play All"}
                    </Text>
                  </Pressable>
                  {songs.length > 0 && (
                    <DownloadCollectionButton
                      songs={songs}
                      collectionId={downloadCollectionId}
                      collectionName={playlistName}
                      collectionImage={playlistCover}
                      collectionType={isAlbumSource ? "album" : "playlist"}
                      compact
                    />
                  )}
                </View>
              </View>
            </View>

            {/* ── Tracks header ── */}
            <View style={styles.tracksHeader}>
              <Text style={styles.tracksTitle}>Tracks</Text>
              {totalDurationLabel ? (
                <Text style={styles.tracksMeta}>{effectiveSongCount} · {totalDurationLabel}</Text>
              ) : null}
            </View>

            {loadError ? (
              <View style={styles.inlineWrap}>
                <Ionicons name="cloud-offline-outline" size={28} color={Colors.subtext} />
                <Text style={styles.inlineText}>{loadError}</Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loadError ? null : loading ? (
            <SongRowSkeleton count={Math.max(3, Math.min(initialSongCount || 6, 6))} />
          ) : (
            <View style={styles.inlineWrap}>
              <Text style={styles.inlineText}>No songs available in this {collectionKindLower}.</Text>
            </View>
          )
        }
      />

      {/* ── Sticky header ── */}
      <Animated.View
        pointerEvents={isStickyVisible ? "auto" : "none"}
        style={[styles.sticky, { paddingTop: topInset, opacity: stickyOpacity }]}
      >
        <Pressable onPress={safeGoBack} style={styles.stickyBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stickyTitle} numberOfLines={1}>{playlistName}</Text>
        <Pressable style={styles.stickyPlay} onPress={handlePlayAll} disabled={!songs.length}>
          <Ionicons
            name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
            size={14}
            color="#000"
          />
        </Pressable>
      </Animated.View>

      {/* ── Edit Modal ── */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="none"
        onRequestClose={closeEditModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0, 0, 0, 0.7)", opacity: modalOpacity },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeEditModal} />
          </Animated.View>

          <Animated.View
            style={[
              styles.modalBottomSheet,
              { transform: [{ translateY: modalTranslateY }] },
            ]}
          >
            <View style={styles.modalDragHandle}>
              <View style={styles.modalDragIndicator} />
            </View>

            <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Edit Playlist</Text>

              <View style={styles.compactImageSection}>
                {editCover ? (
                  <View style={styles.compactImageContainer}>
                    <Image source={{ uri: editCover }} style={styles.compactImage} contentFit="cover" />
                    <View style={styles.compactImageOverlay}>
                      <Pressable style={styles.compactImageButton} onPress={handlePickImage}>
                        <Ionicons name="camera" size={16} color="#fff" />
                      </Pressable>
                      <Pressable style={[styles.compactImageButton, styles.compactImageButtonDanger]} onPress={handleRemoveImage}>
                        <Ionicons name="trash" size={16} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.compactImagePlaceholder} onPress={handlePickImage}>
                    <Ionicons name="image" size={28} color={Colors.subtext} />
                    <Text style={styles.compactImagePlaceholderText}>Add Cover</Text>
                  </Pressable>
                )}

                <View style={styles.compactInfoSection}>
                  <TextInput
                    style={styles.compactInput}
                    placeholder="Playlist name"
                    placeholderTextColor={Colors.subtext}
                    value={editName}
                    onChangeText={setEditName}
                    maxLength={100}
                  />
                  <TextInput
                    style={[styles.compactInput, styles.compactInputSmall]}
                    placeholder="Description (optional)"
                    placeholderTextColor={Colors.subtext}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    maxLength={150}
                  />
                </View>
              </View>

              {isFirestoreSource && (
                <View style={styles.compactToggleSection}>
                  <View style={styles.compactToggleHeader}>
                    <Ionicons name="eye-outline" size={18} color={Colors.text} />
                    <Text style={styles.compactToggleLabel}>Visibility</Text>
                  </View>
                  <View style={styles.compactToggleButtons}>
                    <Pressable
                      style={[styles.compactToggleButton, editIsPublic && styles.compactToggleButtonActive]}
                      onPress={() => {
                        setEditIsPublic(true);
                        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Ionicons name="globe-outline" size={16} color={editIsPublic ? "#fff" : Colors.subtext} />
                      <Text style={[styles.compactToggleButtonText, editIsPublic && styles.compactToggleButtonTextActive]}>Public</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.compactToggleButton, !editIsPublic && styles.compactToggleButtonActive]}
                      onPress={() => {
                        setEditIsPublic(false);
                        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Ionicons name="lock-closed-outline" size={16} color={!editIsPublic ? "#fff" : Colors.subtext} />
                      <Text style={[styles.compactToggleButtonText, !editIsPublic && styles.compactToggleButtonTextActive]}>Private</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              <View style={styles.compactActions}>
                <Pressable
                  style={[styles.compactActionButton, styles.compactActionButtonPrimary, (isSaving || isUploadingImage || !editName.trim()) && styles.compactActionButtonDisabled]}
                  onPress={handleSaveEdit}
                  disabled={isSaving || isUploadingImage || !editName.trim()}
                >
                  <LinearGradient
                    colors={isSaving || isUploadingImage || !editName.trim() ? ["#555", "#666"] : [Colors.primary, "#84E655"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.compactActionButtonGradient}
                  >
                    {isSaving || isUploadingImage ? (
                      <View style={styles.compactActionButtonContent}>
                        <ActivityIndicator size="small" color="#000" />
                        {isUploadingImage && <Text style={[styles.compactActionButtonText, { fontSize: 11 }]}>{uploadProgress}%</Text>}
                      </View>
                    ) : (
                      <Text style={styles.compactActionButtonText}>Save</Text>
                    )}
                  </LinearGradient>
                </Pressable>
                <Pressable style={[styles.compactActionButton, styles.compactActionButtonSecondary]} onPress={closeEditModal} disabled={isSaving}>
                  <Text style={styles.compactActionButtonTextSecondary}>Cancel</Text>
                </Pressable>
              </View>

              <Pressable style={styles.compactDeleteButton} onPress={handleDeletePlaylist} disabled={isSaving || isUploadingImage}>
                <Ionicons name="trash-outline" size={16} color="#FF4444" />
                <Text style={styles.compactDeleteButtonText}>Delete Playlist</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtnSolo: { width: 36, height: 36, marginLeft: 12, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.subtext, fontSize: 16, fontFamily: "Inter_500Medium" },

  hero: {
    height: 340,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroFallback: {
    backgroundColor: "#111820",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBack: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEdit: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "Inter_800ExtraBold",
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  shuffleBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: Colors.primary,
  },
  playBtnText: {
    color: "#000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },

  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  visibilityBadgePublic: {
    backgroundColor: "rgba(108, 92, 231, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(108, 92, 231, 0.5)",
  },
  visibilityBadgePrivate: {
    backgroundColor: "rgba(255, 107, 107, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.5)",
  },
  visibilityBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  tracksHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  tracksTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  tracksMeta: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  inlineWrap: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  inlineText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 32,
  },

  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: "rgba(11, 15, 20, 0.94)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    zIndex: 20,
  },
  stickyBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  stickyPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBottomSheet: {
    backgroundColor: "#161B22",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    maxHeight: "85%",
  },
  modalDragHandle: {
    alignItems: "center",
    paddingVertical: 12,
  },
  modalDragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  modalScrollView: {
    paddingHorizontal: 20,
  },
  modalContent: {
    gap: 18,
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  compactImageSection: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  compactImageContainer: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: "hidden",
  },
  compactImage: {
    width: "100%",
    height: "100%",
  },
  compactImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  compactImageButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  compactImageButtonDanger: {
    backgroundColor: "rgba(255,68,68,0.5)",
  },
  compactImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  compactImagePlaceholderText: {
    color: Colors.subtext,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  compactInfoSection: {
    flex: 1,
    gap: 10,
  },
  compactInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  compactInputSmall: {
    fontSize: 12,
    paddingVertical: 8,
  },
  compactToggleSection: {
    gap: 8,
  },
  compactToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactToggleLabel: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  compactToggleButtons: {
    flexDirection: "row",
    gap: 10,
  },
  compactToggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  compactToggleButtonActive: {
    backgroundColor: "rgba(108, 92, 231, 0.25)",
    borderColor: "rgba(108, 92, 231, 0.6)",
  },
  compactToggleButtonText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  compactToggleButtonTextActive: {
    color: "#fff",
  },
  compactActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  compactActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  compactActionButtonPrimary: {},
  compactActionButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  compactActionButtonDisabled: {
    opacity: 0.5,
  },
  compactActionButtonGradient: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  compactActionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactActionButtonText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  compactActionButtonTextSecondary: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  compactDeleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  compactDeleteButtonText: {
    color: "#FF4444",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
