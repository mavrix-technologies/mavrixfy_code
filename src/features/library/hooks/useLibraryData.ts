import { useAuth } from "@/contexts/AuthContext";
import { useOnReconnect } from "@/contexts/NetworkContext";
import { triggerImpact } from "@/lib/haptics";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useCallback,useEffect,useState } from "react";
import { Alert } from "react-native";
import type { DisplayPlaylist } from "../components/PlaylistListItem";
import {
createPlaylistOptimistic,
deletePlaylistOptimistic,
subscribeLibrary,
} from "../services/libraryRepository";
import { useLibraryStore } from "../store/libraryStore";

export function useLibraryData() {
  const { user } = useAuth();
  const activeUserId = user?.id ?? null;

  const playlists = useLibraryStore((s) => s.playlists);
  const followedArtists = useLibraryStore((s) => s.followedArtists);
  const status = useLibraryStore((s) => s.status);
  const initialized = useLibraryStore((s) => s.initialized);

  const [refreshing, setRefreshing] = useState(false);

  // Create playlist modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Subscribe to realtime sync and 0ms local cache on mount/user change
  useEffect(() => {
    const unsubscribe = subscribeLibrary(activeUserId);
    return () => {
      unsubscribe?.();
    };
  }, [activeUserId]);

  const resetCreateModal = useCallback(() => {
    setNewPlaylistName("");
    setNewPlaylistDescription("");
    setSelectedImage(null);
    setShowCreateModal(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      subscribeLibrary(activeUserId);
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [activeUserId]);

  useOnReconnect(
    useCallback(() => {
      subscribeLibrary(activeUserId);
    }, [activeUserId])
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

    try {
      setIsUploadingImage(true);
      void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);

      // Optimistic creation: added to store and persistent cache at 0ms
      const created = await createPlaylistOptimistic(name, newPlaylistDescription, selectedImage || "", user);
      if (!created) throw new Error("Playlist creation failed");

      resetCreateModal();
    } catch {
      Alert.alert("Error", "Failed to create playlist. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  }, [newPlaylistName, selectedImage, user, newPlaylistDescription, resetCreateModal]);

  const handleDeletePlaylist = useCallback(
    (playlist: DisplayPlaylist) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Delete Playlist", `Are you sure you want to delete "${playlist.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Optimistic deletion: removed from store and cache at 0ms
            void deletePlaylistOptimistic(playlist, activeUserId).then((deleted) => {
              if (!deleted) Alert.alert("Error", "Failed to delete playlist. Please try again.");
            });
          },
        },
      ]);
    },
    [activeUserId]
  );

  const isLoading = !initialized && playlists.length === 0;

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
