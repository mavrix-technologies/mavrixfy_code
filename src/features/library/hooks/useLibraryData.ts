import { useState, useCallback, useEffect } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "@/contexts/AuthContext";
import { triggerImpact } from "@/lib/haptics";
import {
  getUserPlaylists,
  createUserPlaylist,
  deleteUserPlaylist,
} from "@/lib/storage";
import { getUserFirestorePlaylists, createFirestorePlaylist, deleteFirestorePlaylist, updateFirestorePlaylist, type FirestorePlaylist } from "@/lib/firestore";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { getFollowedArtists, FollowedArtist } from "@/lib/followedArtists";
import { useOnReconnect } from "@/contexts/NetworkContext";
import { sortedCopy } from "@/lib/arrayUtils";
import { setCachedPlaylists } from "@/lib/playlistMemoryCache";
import { DisplayPlaylist } from "../components/PlaylistListItem";

type LibrarySessionCache = {
  hydrated: boolean;
  userId: string | null;
  playlists: DisplayPlaylist[];
};

const LIBRARY_SESSION_CACHE: LibrarySessionCache = {
  hydrated: false,
  userId: null,
  playlists: [],
};

function toMillis(value: any): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Date.now();
  }

  if (value && typeof value.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : Date.now();
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

async function loadLocalPlaylists(): Promise<DisplayPlaylist[]> {
  const localPlaylists = await getUserPlaylists();
  const formatted: DisplayPlaylist[] = localPlaylists.map(
    (p): DisplayPlaylist => ({
      ...p,
      isFirestore: false,
      coverUrl: p.coverUrl || p.songs?.[0]?.coverUrl || "",
    })
  );
  return sortedCopy(formatted, (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function useLibraryData() {
  const { user } = useAuth();
  const activeUserId = user?.id ?? null;
  const hasCachedPlaylists =
    LIBRARY_SESSION_CACHE.hydrated && LIBRARY_SESSION_CACHE.userId === activeUserId;

  const [playlists, setPlaylists] = useState<DisplayPlaylist[]>(
    hasCachedPlaylists ? LIBRARY_SESSION_CACHE.playlists : []
  );
  const [followedArtists, setFollowedArtists] = useState<FollowedArtist[]>([]);
  const [isLoading, setIsLoading] = useState(!hasCachedPlaylists);
  const [refreshing, setRefreshing] = useState(false);

  // Create playlist modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const resetCreateModal = useCallback(() => {
    setNewPlaylistName("");
    setNewPlaylistDescription("");
    setSelectedImage(null);
    setShowCreateModal(false);
  }, []);

  const commitPlaylists = useCallback(
    (nextPlaylists: DisplayPlaylist[]) => {
      LIBRARY_SESSION_CACHE.hydrated = true;
      LIBRARY_SESSION_CACHE.userId = activeUserId;
      LIBRARY_SESSION_CACHE.playlists = nextPlaylists;
      setCachedPlaylists(nextPlaylists);
      setPlaylists(nextPlaylists);
    },
    [activeUserId]
  );

  const loadPlaylists = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setIsLoading(true);
      }

      try {
        const formattedLocalPlaylists = await loadLocalPlaylists();

        if (!activeUserId) {
          commitPlaylists(formattedLocalPlaylists);
          return;
        }

        const firestorePlaylists = await getUserFirestorePlaylists(activeUserId);
        const formattedFirestorePlaylists: DisplayPlaylist[] = firestorePlaylists.map(
          (p: FirestorePlaylist): DisplayPlaylist => ({
            id: p.id,
            name: p.name,
            description: p.description || "",
            coverUrl: p.imageUrl || p.songs?.[0]?.imageUrl || "",
            songs: (p.songs || []).map((fs: any) => ({
              id: fs.id,
              title: fs.title,
              artist: fs.artist,
              coverUrl: fs.imageUrl,
              audioUrl: fs.audioUrl,
              duration: fs.duration,
              album: "",
              genre: "",
            })),
            createdAt: toMillis(p.createdAt),
            updatedAt: toMillis(p.updatedAt),
            isFirestore: true,
          })
        );

        const firestoreIds = new Set(firestorePlaylists.map((fp: FirestorePlaylist) => fp.id));
        const localOnlyPlaylists = formattedLocalPlaylists.filter((p) => !firestoreIds.has(p.id));

        const merged = sortedCopy(
          formattedFirestorePlaylists.concat(localOnlyPlaylists),
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
        );
        commitPlaylists(merged);
      } catch {
        const formattedLocalPlaylists = await loadLocalPlaylists();
        commitPlaylists(formattedLocalPlaylists);
      } finally {
        setIsLoading(false);
      }
    },
    [activeUserId, commitPlaylists]
  );

  useEffect(() => {
    const cacheMatches =
      LIBRARY_SESSION_CACHE.hydrated && LIBRARY_SESSION_CACHE.userId === activeUserId;
    if (cacheMatches) {
      setPlaylists(LIBRARY_SESSION_CACHE.playlists);
      setIsLoading(false);
      return;
    }
    void loadPlaylists();
  }, [activeUserId, loadPlaylists]);

  useEffect(() => {
    void getFollowedArtists().then(setFollowedArtists);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadPlaylists({ silent: true }),
        getFollowedArtists().then(setFollowedArtists),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadPlaylists]);

  useOnReconnect(
    useCallback(() => {
      void loadPlaylists({ silent: true });
    }, [loadPlaylists])
  );

  const handleSelectImage = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        if (asset.size && asset.size > 5 * 1024 * 1024) {
          Alert.alert("Error", "Image must be less than 5MB");
          return;
        }

        setSelectedImage(asset.uri);
      }
    } catch {
      Alert.alert("Error", "Failed to select image");
    }
  }, []);

  const handleCreatePlaylist = useCallback(async () => {
    const name = newPlaylistName.trim();
    if (!name) return;

    if (!selectedImage) {
      Alert.alert("Error", "Please select a cover image for your playlist");
      return;
    }

    try {
      setIsUploadingImage(true);
      const imageUrl = await uploadImageToCloudinary(selectedImage);

      if (!imageUrl) {
        Alert.alert("Error", "Failed to upload image. Please try again.");
        return;
      }

      if (user && user.id) {
        const newPlaylist = await createFirestorePlaylist(
          user.id,
          user.name || "Unknown User",
          name,
          newPlaylistDescription || ""
        );

        if (newPlaylist) {
          await updateFirestorePlaylist(newPlaylist.id, { imageUrl });
          await createUserPlaylist(name, newPlaylistDescription);
        }
      } else {
        await createUserPlaylist(name, newPlaylistDescription);
      }

      resetCreateModal();
      await loadPlaylists({ silent: true });
      Alert.alert("Success", "Playlist created successfully!");
    } catch {
      Alert.alert("Error", "Failed to create playlist. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  }, [newPlaylistName, selectedImage, user, newPlaylistDescription, resetCreateModal, loadPlaylists]);

  const handleDeletePlaylist = useCallback(
    (playlist: DisplayPlaylist) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Delete Playlist", `Are you sure you want to delete "${playlist.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (playlist.isFirestore) {
                await deleteFirestorePlaylist(playlist.id);
              } else {
                await deleteUserPlaylist(playlist.id);
              }
              await loadPlaylists({ silent: true });
            } catch {
              Alert.alert("Error", "Failed to delete playlist");
            }
          },
        },
      ]);
    },
    [loadPlaylists]
  );

  return {
    playlists,
    followedArtists,
    isLoading,
    refreshing,
    showCreateModal,
    setShowCreateModal,
    newPlaylistName,
    setNewPlaylistName,
    newPlaylistDescription,
    setNewPlaylistDescription,
    selectedImage,
    isUploadingImage,
    resetCreateModal,
    handleRefresh,
    handleSelectImage,
    handleCreatePlaylist,
    handleDeletePlaylist,
  };
}
