import { useState, useCallback, useEffect } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {
  getUserPlaylists,
  updateUserPlaylist,
  deleteUserPlaylist,
  UserPlaylist,
} from "@/lib/storage";
import {
  getPlaylistById,
  updateFirestorePlaylist,
  deleteFirestorePlaylist,
  firestorePlaylistToLocalSongs,
} from "@/lib/firestore";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import {
  convertJioSaavnSong,
  getBestImageUrl,
  JioSaavnSong,
  Song,
} from "@/lib/musicData";
import {
  getJioSaavnAlbumDetails,
  getJioSaavnPlaylistDetails,
  getJioSaavnSongDetails,
} from "@/data/providers/JioSaavnProvider";
import { useAuth } from "@/contexts/AuthContext";
import { safeGoBack } from "@/utils/navigation";
import { getCachedHomePublicPlaylists } from "@/lib/homeCache";
import {
  getCachedPlaylist,
  setCachedPlaylist,
  removeCachedPlaylist,
} from "@/lib/playlistMemoryCache";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UsePlaylistDetailDataProps {
  playlistId: string;
  sourceLink: string;
  isSongSource: boolean;
  isAlbumSource: boolean;
  isFirestoreSource: boolean;
  isLocalCustomPlaylist: boolean;
  isJioSaavnSource: boolean;
  initialTitle: string;
  initialCover: string;
  initialDescription: string;
  initialSongCount: number;
  hasPrefilledHeader: boolean;
}

export function usePlaylistDetailData({
  playlistId,
  sourceLink,
  isSongSource,
  isAlbumSource,
  isFirestoreSource,
  isLocalCustomPlaylist,
  isJioSaavnSource,
  initialTitle,
  initialCover,
  initialDescription,
  initialSongCount,
  hasPrefilledHeader,
}: UsePlaylistDetailDataProps) {
  const { user } = useAuth();

  // Instant synchronous memory cache lookup
  const initialCached = getCachedPlaylist(playlistId);
  const initialCachedSongs =
    initialCached?.songs && initialCached.songs.length > 0 ? initialCached.songs : [];

  const [loading, setLoading] = useState(!initialCachedSongs.length);
  const [playlistName, setPlaylistName] = useState(initialCached?.name || initialTitle);
  const [playlistCover, setPlaylistCover] = useState(
    initialCached?.coverUrl || initialCached?.imageUrl || initialCover
  );
  const [playlistDescription, setPlaylistDescription] = useState(
    initialCached?.description ||
      initialDescription ||
      (initialSongCount > 0 ? `${initialSongCount} songs` : "")
  );
  const [songs, setSongs] = useState<Song[]>(initialCachedSongs);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [playlistIsPublic, setPlaylistIsPublic] = useState(initialCached?.isPublic ?? false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCover, setEditCover] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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

  const applyJioPlaylistData = useCallback(
    (data: {
      name?: string;
      description?: string;
      songCount?: number;
      image?: { quality: string; url: string }[] | string;
      songs?: JioSaavnSong[];
    }): number => {
      const coverUrl = data.image
        ? Array.isArray(data.image)
          ? getBestImageUrl(data.image)
          : data.image
        : "";
      if (data.name) setPlaylistName(data.name);
      if (coverUrl) setPlaylistCover(coverUrl);
      const desc =
        (data.description || "").trim() || `${data.songCount || data.songs?.length || 0} songs`;
      setPlaylistDescription(desc);
      const finalSongs = normalizeLoadedSongs(data.songs || []);
      if (finalSongs.length > 0) {
        setSongs(finalSongs);
        setCachedPlaylist(playlistId, {
          id: playlistId,
          name: data.name || initialTitle,
          description: desc,
          coverUrl,
          songs: finalSongs,
          isFirestore: false,
        });
      }
      return finalSongs.length;
    },
    [initialTitle, normalizeLoadedSongs, playlistId]
  );

  const applyFirestorePlaylistData = useCallback(
    (playlist: {
      name?: string;
      description?: string;
      imageUrl?: string;
      songs?: Song[] | unknown[];
      isPublic?: boolean;
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
      const name = playlist.name || initialTitle || "Playlist";
      const desc =
        (playlist.description || "").trim() || `${nextSongs.length || initialSongCount} songs`;
      const cover = playlist.imageUrl || initialCover || "";
      const isPub = playlist.isPublic ?? false;

      setPlaylistName(name);
      setPlaylistDescription(desc);
      setPlaylistCover(cover);
      setPlaylistIsPublic(isPub);
      setSongs(nextSongs);
      setCachedPlaylist(playlistId, {
        id: playlistId,
        name,
        description: desc,
        imageUrl: cover,
        coverUrl: cover,
        songs: nextSongs,
        isFirestore: true,
        isPublic: isPub,
      });
    },
    [initialCover, initialSongCount, initialTitle, playlistId]
  );

  const resetPlaylistLoadState = useCallback(() => {
    const cached = getCachedPlaylist(playlistId);
    setPlaylistName(cached?.name || initialTitle);
    setPlaylistDescription(
      cached?.description ||
        initialDescription ||
        (initialSongCount > 0 ? `${initialSongCount} songs` : "")
    );
    setPlaylistCover(cached?.coverUrl || cached?.imageUrl || initialCover);
    if (cached?.songs && cached.songs.length > 0) {
      setSongs(cached.songs);
      setLoading(false);
    } else {
      setSongs([]);
      setLoading(true);
    }
    setNotFound(false);
    setLoadError("");
  }, [initialCover, initialDescription, initialSongCount, initialTitle, playlistId]);

  const applyLocalPlaylistData = useCallback(
    (playlist: UserPlaylist) => {
      setPlaylistName(playlist.name);
      setPlaylistDescription(playlist.description);
      setPlaylistCover(playlist.coverUrl);
      setSongs(playlist.songs);
      setCachedPlaylist(playlist.id, {
        ...playlist,
        isFirestore: false,
      });
    },
    []
  );

  const finishPlaylistLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const loadPlaylistData = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        // 1. FAST MEMORY CACHE CHECK: If playlist already loaded in memory, render it instantly
        const memoryCached = getCachedPlaylist(playlistId);
        if (memoryCached && !isCancelled()) {
          if (memoryCached.name) setPlaylistName(memoryCached.name);
          if (memoryCached.description) setPlaylistDescription(memoryCached.description);
          if (memoryCached.coverUrl || memoryCached.imageUrl) {
            setPlaylistCover(memoryCached.coverUrl || memoryCached.imageUrl || "");
          }
          if (memoryCached.isPublic !== undefined) setPlaylistIsPublic(memoryCached.isPublic);
          if (memoryCached.songs && memoryCached.songs.length > 0) {
            setSongs(memoryCached.songs);
            finishPlaylistLoad();
            if (!isFirestoreSource && !isJioSaavnSource) return;
          }
        }

        // 2. FAST LOCAL CHECK: Custom created or local playlists
        if (isLocalCustomPlaylist || !isJioSaavnSource) {
          const localPlaylists = await getUserPlaylists();
          if (isCancelled()) return;
          const localFound = localPlaylists.find((p) => p.id === playlistId);
          if (localFound) {
            applyLocalPlaylistData(localFound);
            finishPlaylistLoad();
            if (!isFirestoreSource) return;
          }
        }

        // 3. FIRESTORE PLAYLISTS
        if (isFirestoreSource) {
          const playlist =
            (await getPlaylistById(playlistId)) ??
            (await getCachedHomePublicPlaylists({ allowStale: true })).find((p) => p.id === playlistId);
          if (isCancelled()) return;
          if (playlist) {
            applyFirestorePlaylistData(playlist);
          } else if (!memoryCached?.songs?.length) {
            const localPlaylists = await getUserPlaylists();
            if (isCancelled()) return;
            const localFound = localPlaylists.find((p) => p.id === playlistId);
            if (localFound) applyLocalPlaylistData(localFound);
            else if (!hasPrefilledHeader) setNotFound(true);
            else setLoadError("Playlist tracks could not load right now.");
          }
          return;
        }

        // 4. JIOSAAVN ONLINE PLAYLISTS / ALBUMS / TRACKS
        if (isJioSaavnSource) {
          const loadJioCollectionAttempt = async (attempt: number): Promise<number> => {
            try {
              if (isSongSource) {
                const songData = await getJioSaavnSongDetails(playlistId, sourceLink);
                if (songData && !isCancelled()) {
                  const songImg =
                    songData.image || (initialCover ? [{ quality: "500x500", url: initialCover }] : []);
                  const loadedCount = applyJioPlaylistData({
                    name: songData.name || (songData as any).title || initialTitle || "Song",
                    description:
                      songData.album?.name ||
                      (songData as any).artists?.primary?.map((a: any) => a.name).join(", ") ||
                      initialDescription ||
                      "Single Track",
                    image: songImg,
                    songCount: 1,
                    songs: [songData],
                  });
                  if (loadedCount > 0) {
                    const albumId = songData.album?.id || (songData as any).album_id;
                    const albumUrl = songData.album?.url || (songData as any).album_url;
                    if (albumId || albumUrl) {
                      void getJioSaavnAlbumDetails(albumId || "", { link: albumUrl })
                        .then((albumData: any) => {
                          if (!isCancelled() && albumData?.songs?.length && albumData.songs.length > 1) {
                            applyJioPlaylistData(albumData);
                          }
                        })
                        .catch(() => {});
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

              if (!isCancelled() && data) {
                const loadedCount = applyJioPlaylistData(data);
                if (loadedCount > 0) return loadedCount;
              }
            } catch {
              // Retry on transient failure
            }

            if (!isCancelled() && attempt < 2) {
              await delay(180);
              return isCancelled() ? 0 : loadJioCollectionAttempt(attempt + 1);
            }

            return 0;
          };

          const loadedCount = await loadJioCollectionAttempt(0);
          if (!isCancelled() && loadedCount === 0) {
            if (!hasPrefilledHeader && !memoryCached?.songs?.length) setNotFound(true);
            else if (!memoryCached?.songs?.length) setLoadError("Songs are taking longer than expected to load.");
          }
          return;
        }

        // 5. FALLBACK: Check local storage
        const playlists = await getUserPlaylists();
        if (!isCancelled()) {
          const found = playlists.find((p) => p.id === playlistId);
          if (found) {
            applyLocalPlaylistData(found);
          } else if (!hasPrefilledHeader && !memoryCached?.songs?.length) {
            setNotFound(true);
          } else if (!memoryCached?.songs?.length) {
            setLoadError("Playlist tracks could not load right now.");
          }
        }
      } catch {
        if (isCancelled()) return;
        if (hasPrefilledHeader) setLoadError("Songs could not load right now.");
        else setNotFound(true);
      } finally {
        if (!isCancelled()) finishPlaylistLoad();
      }
    },
    [
      playlistId,
      isLocalCustomPlaylist,
      isJioSaavnSource,
      isFirestoreSource,
      isSongSource,
      isAlbumSource,
      sourceLink,
      initialTitle,
      initialCover,
      initialDescription,
      hasPrefilledHeader,
      applyLocalPlaylistData,
      finishPlaylistLoad,
      applyFirestorePlaylistData,
      applyJioPlaylistData,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    if (!playlistId) {
      setNotFound(true);
      return;
    }

    resetPlaylistLoadState();
    void loadPlaylistData(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [playlistId, resetPlaylistLoadState, loadPlaylistData]);

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

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setEditCover(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Failed to select image");
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setEditCover("");
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

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
      setCachedPlaylist(playlistId, {
        id: playlistId,
        name: editName.trim(),
        description: editDescription.trim(),
        coverUrl: finalImageUrl.trim(),
        imageUrl: finalImageUrl.trim(),
        isPublic: editIsPublic,
      });
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
              removeCachedPlaylist(playlistId);
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

  return {
    loading,
    playlistName,
    setPlaylistName,
    playlistCover,
    setPlaylistCover,
    playlistDescription,
    setPlaylistDescription,
    songs,
    setSongs,
    notFound,
    loadError,
    playlistIsPublic,
    setPlaylistIsPublic,
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
  };
}
