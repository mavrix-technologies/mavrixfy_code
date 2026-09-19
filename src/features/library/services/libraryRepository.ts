import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getUserPlaylists,
  createUserPlaylist,
  deleteUserPlaylist,
} from "@/lib/storage";
import {
  createFirestorePlaylist,
  deleteFirestorePlaylist,
  updateFirestorePlaylist,
  type FirestorePlaylist,
} from "@/lib/firestore";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { getFollowedArtists, type FollowedArtist } from "@/lib/followedArtists";
import { sortedCopy } from "@/lib/arrayUtils";
import { setCachedPlaylists } from "@/lib/playlistMemoryCache";
import { logger } from "@/lib/logger";
import type { DisplayPlaylist } from "../components/PlaylistListItem";
import { useLibraryStore } from "../store/libraryStore";

const PLAYLISTS_CACHE_KEY_PREFIX = "@mavrixfy_library_playlists_";
const ARTISTS_CACHE_KEY = "@mavrixfy_followed_artists";

let activeUnsubscribeById: Unsubscribe | null = null;
let activeUnsubscribeByUid: Unsubscribe | null = null;
let activeSubscriptionUserId: string | null = null;

function getPlaylistsCacheKey(userId?: string | null): string {
  return `${PLAYLISTS_CACHE_KEY_PREFIX}${userId || "guest"}`;
}

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

async function loadLocalPlaylistsFormatted(): Promise<DisplayPlaylist[]> {
  try {
    const local = await getUserPlaylists();
    const formatted: DisplayPlaylist[] = local.map((p) => ({
      ...p,
      isFirestore: false,
      coverUrl: p.coverUrl || p.songs?.[0]?.coverUrl || "",
    }));
    return sortedCopy(formatted, (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}

/**
 * Reads cached playlists and artists from AsyncStorage and hydrates Zustand store at 0ms.
 */
export async function loadCachedLibrary(userId?: string | null): Promise<void> {
  try {
    const cacheKey = getPlaylistsCacheKey(userId);
    const [rawPlaylists, rawArtists] = await Promise.all([
      AsyncStorage.getItem(cacheKey),
      AsyncStorage.getItem(ARTISTS_CACHE_KEY),
    ]);

    if (rawPlaylists) {
      const parsed = JSON.parse(rawPlaylists);
      if (Array.isArray(parsed) && parsed.length > 0) {
        useLibraryStore.getState().setPlaylists(parsed, "loading");
        setCachedPlaylists(parsed);
      }
    }

    if (rawArtists) {
      const parsedArtists = JSON.parse(rawArtists);
      if (Array.isArray(parsedArtists) && parsedArtists.length > 0) {
        useLibraryStore.getState().setFollowedArtists(parsedArtists);
      }
    }
  } catch (error) {
    logger.warn("[LibraryRepository] Failed to read cached library data:", error);
  }
}

/**
 * Persists playlists to local storage asynchronously.
 */
export async function persistCachedPlaylists(
  userId: string | null | undefined,
  playlists: DisplayPlaylist[]
): Promise<void> {
  try {
    const cacheKey = getPlaylistsCacheKey(userId);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(playlists));
  } catch (error) {
    logger.warn("[LibraryRepository] Failed to persist playlists to cache:", error);
  }
}

/**
 * Persists followed artists to local storage asynchronously.
 */
export async function persistCachedArtists(artists: FollowedArtist[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ARTISTS_CACHE_KEY, JSON.stringify(artists));
  } catch (error) {
    logger.warn("[LibraryRepository] Failed to persist followed artists:", error);
  }
}

/**
 * Subscribes to Firestore playlists and local storage playlists.
 * Realtime sync automatically updates Zustand store and local cache.
 */
export function subscribeLibrary(userId?: string | null): () => void {
  // If active for same user, keep existing subscription
  if (activeSubscriptionUserId === userId && (activeUnsubscribeById || activeUnsubscribeByUid)) {
    return cleanupLibrarySubscription;
  }

  cleanupLibrarySubscription();
  activeSubscriptionUserId = userId ?? null;

  // 1. Instant 0ms cache hydration
  void loadCachedLibrary(userId);

  // 2. Refresh followed artists in background
  void getFollowedArtists().then((artists) => {
    useLibraryStore.getState().setFollowedArtists(artists);
    void persistCachedArtists(artists);
  });

  // 3. If guest / no user, load local storage only
  if (!userId) {
    void loadLocalPlaylistsFormatted().then((local) => {
      useLibraryStore.getState().setPlaylists(local, "ready");
      void persistCachedPlaylists(null, local);
    });
    return cleanupLibrarySubscription;
  }

  if (!db) {
    void loadLocalPlaylistsFormatted().then((local) => {
      useLibraryStore.getState().setPlaylists(local, "ready");
    });
    return cleanupLibrarySubscription;
  }

  const playlistsRef = collection(db, "playlists");
  let firestoreMap = new Map<string, DisplayPlaylist>();

  const reconcileAndEmit = async () => {
    const local = await loadLocalPlaylistsFormatted();
    const firestoreList = Array.from(firestoreMap.values());
    const firestoreIds = new Set(firestoreList.map((p) => p.id));
    const localOnly = local.filter((p) => !firestoreIds.has(p.id));

    const merged = sortedCopy(firestoreList.concat(localOnly), (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    useLibraryStore.getState().setPlaylists(merged, "ready");
    setCachedPlaylists(merged);
    void persistCachedPlaylists(userId, merged);
  };

  const handleSnapshot = (snapshot: any) => {
    snapshot.forEach((docSnap: any) => {
      const p = docSnap.data() as FirestorePlaylist;
      firestoreMap.set(docSnap.id, {
        id: docSnap.id,
        name: p.name || "Untitled Playlist",
        description: p.description || "",
        coverUrl: p.imageUrl || p.songs?.[0]?.imageUrl || "",
        songs: (p.songs || []).map((fs: any) => ({
          id: fs.id,
          title: fs.title || "",
          artist: fs.artist || "",
          coverUrl: fs.imageUrl || "",
          audioUrl: fs.audioUrl || "",
          duration: fs.duration || 0,
          album: "",
          genre: "",
        })),
        createdAt: toMillis(p.createdAt),
        updatedAt: toMillis(p.updatedAt),
        isFirestore: true,
      });
    });

    void reconcileAndEmit();
  };

  const handleError = (error: any) => {
    logger.warn("[LibraryRepository] Realtime listener error:", error);
    void loadLocalPlaylistsFormatted().then((local) => {
      useLibraryStore.getState().setPlaylists(local, "ready");
    });
  };

  try {
    const qById = query(playlistsRef, where("createdBy.id", "==", userId));
    activeUnsubscribeById = onSnapshot(qById, handleSnapshot, handleError);

    const qByUid = query(playlistsRef, where("createdBy.uid", "==", userId));
    activeUnsubscribeByUid = onSnapshot(qByUid, handleSnapshot, handleError);
  } catch (err) {
    logger.warn("[LibraryRepository] Failed to attach playlist listeners:", err);
    void loadLocalPlaylistsFormatted().then((local) => {
      useLibraryStore.getState().setPlaylists(local, "ready");
    });
  }

  return cleanupLibrarySubscription;
}

export function cleanupLibrarySubscription(): void {
  if (activeUnsubscribeById) {
    try {
      activeUnsubscribeById();
    } catch {}
    activeUnsubscribeById = null;
  }
  if (activeUnsubscribeByUid) {
    try {
      activeUnsubscribeByUid();
    } catch {}
    activeUnsubscribeByUid = null;
  }
  activeSubscriptionUserId = null;
}

/**
 * Optimistic delete playlist.
 * Removes from Zustand store immediately (0ms) and disk cache, then deletes remotely.
 */
export async function deletePlaylistOptimistic(
  playlist: DisplayPlaylist,
  userId?: string | null
): Promise<void> {
  // 1. Instant local removal
  useLibraryStore.getState().removePlaylistOptimistic(playlist.id);
  const remaining = useLibraryStore.getState().playlists;
  void persistCachedPlaylists(userId, remaining);

  // 2. Background deletion
  try {
    if (playlist.isFirestore) {
      await deleteFirestorePlaylist(playlist.id);
    } else {
      await deleteUserPlaylist(playlist.id);
    }
  } catch (error) {
    logger.error("[LibraryRepository] Failed to delete playlist in background:", error);
    // On error, onSnapshot or local reload will naturally reconcile
  }
}

/**
 * Optimistic create playlist.
 * Generates local ID and adds to store immediately, then uploads and syncs Firestore in background.
 */
export async function createPlaylistOptimistic(
  name: string,
  description: string,
  imageUri: string,
  user?: { id: string; name?: string } | null
): Promise<DisplayPlaylist | null> {
  const tempId = `local_pl_${Date.now()}`;
  const now = Date.now();

  const optimisticPlaylist: DisplayPlaylist = {
    id: tempId,
    name,
    description: description || "",
    coverUrl: imageUri,
    songs: [],
    createdAt: now,
    updatedAt: now,
    isFirestore: Boolean(user?.id),
  };

  // 1. Instant local display
  useLibraryStore.getState().addPlaylistOptimistic(optimisticPlaylist);
  void persistCachedPlaylists(user?.id, useLibraryStore.getState().playlists);

  // 2. Background image upload and remote creation
  try {
    let uploadedImageUrl = imageUri;
    if (imageUri && !imageUri.startsWith("http")) {
      const uploaded = await uploadImageToCloudinary(imageUri);
      if (uploaded) {
        uploadedImageUrl = uploaded;
      }
    }

    if (user?.id) {
      const remote = await createFirestorePlaylist(
        user.id,
        user.name || "Unknown User",
        name,
        description || ""
      );

      if (remote) {
        if (uploadedImageUrl) {
          await updateFirestorePlaylist(remote.id, { imageUrl: uploadedImageUrl });
        }
        await createUserPlaylist(name, description);

        // Replace temp playlist with confirmed remote playlist
        const confirmed: DisplayPlaylist = {
          id: remote.id,
          name,
          description,
          coverUrl: uploadedImageUrl,
          songs: [],
          createdAt: now,
          updatedAt: now,
          isFirestore: true,
        };

        useLibraryStore.getState().removePlaylistOptimistic(tempId);
        useLibraryStore.getState().addPlaylistOptimistic(confirmed);
        void persistCachedPlaylists(user.id, useLibraryStore.getState().playlists);
        return confirmed;
      }
    } else {
      await createUserPlaylist(name, description);
    }

    return optimisticPlaylist;
  } catch (error) {
    logger.error("[LibraryRepository] Background playlist creation failed:", error);
    return optimisticPlaylist;
  }
}
