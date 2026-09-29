import { accountStorageKey } from "@/lib/accountScope";
import { sortedCopy } from "@/lib/arrayUtils";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { db } from "@/lib/firebase";
import {
createFirestorePlaylist,
deleteFirestorePlaylist,
updateFirestorePlaylist,
type FirestorePlaylist,
} from "@/lib/firestore";
import { getFollowedArtists,type FollowedArtist } from "@/lib/followedArtists";
import { logger } from "@/lib/logger";
import { removeCachedPlaylist,setCachedPlaylists } from "@/lib/playlistMemoryCache";
import {
createUserPlaylist,
deleteUserPlaylist,
getUserPlaylists,
} from "@/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
collection,
onSnapshot,
query,
where,
type Unsubscribe,
} from "firebase/firestore";
import { useLibraryStore,type DisplayPlaylist } from "../store/libraryStore";

const PLAYLISTS_CACHE_KEY_PREFIX = "@mavrixfy_library_playlists_";
const ARTISTS_CACHE_KEY = "@mavrixfy_followed_artists";

let activeUnsubscribeById: Unsubscribe | null = null;
let activeUnsubscribeByUid: Unsubscribe | null = null;
let activeSubscriptionUserId: string | null = null;
let subscriptionGeneration = 0;

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
  const generation = subscriptionGeneration;
  try {
    const cacheKey = getPlaylistsCacheKey(userId);
    const [rawPlaylists, rawArtists] = await Promise.all([
      AsyncStorage.getItem(cacheKey),
      AsyncStorage.getItem(accountStorageKey(ARTISTS_CACHE_KEY)),
    ]);
    if (generation !== subscriptionGeneration || (userId ?? null) !== activeSubscriptionUserId) return;

    if (rawPlaylists) {
      const parsed = JSON.parse(rawPlaylists);
      if (Array.isArray(parsed) && useLibraryStore.getState().status === "loading") {
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
    await AsyncStorage.setItem(accountStorageKey(ARTISTS_CACHE_KEY), JSON.stringify(artists));
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
  const generation = subscriptionGeneration;
  useLibraryStore.getState().setStatus("loading");

  // 1. Instant 0ms cache hydration
  void loadCachedLibrary(userId);

  // 2. Refresh followed artists in background
  void getFollowedArtists().then((artists) => {
    if (generation !== subscriptionGeneration) return;
    useLibraryStore.getState().setFollowedArtists(artists);
    void persistCachedArtists(artists);
  });

  // 3. If guest / no user, load local storage only
  if (!userId) {
    void loadLocalPlaylistsFormatted().then((local) => {
      if (generation !== subscriptionGeneration) return;
      useLibraryStore.getState().setPlaylists(local, "ready");
      void persistCachedPlaylists(null, local);
    });
    return cleanupLibrarySubscription;
  }

  if (!db) {
    void loadLocalPlaylistsFormatted().then((local) => {
      if (generation !== subscriptionGeneration) return;
      useLibraryStore.getState().setPlaylists(local, "ready");
    });
    return cleanupLibrarySubscription;
  }

  const playlistsRef = collection(db, "playlists");
  let playlistsById = new Map<string, DisplayPlaylist>();
  let playlistsByUid = new Map<string, DisplayPlaylist>();
  let reconcileGeneration = 0;

  const reconcileAndEmit = async () => {
    const currentReconcile = ++reconcileGeneration;
    const local = await loadLocalPlaylistsFormatted();
    if (generation !== subscriptionGeneration || currentReconcile !== reconcileGeneration) return;
    const firestoreList = Array.from(new Map([...playlistsById, ...playlistsByUid]).values());
    const firestoreIds = new Set(firestoreList.map((p) => p.id));
    const localOnly = local.filter((p) => !firestoreIds.has(p.id));

    const merged = sortedCopy(firestoreList.concat(localOnly), (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    useLibraryStore.getState().setPlaylists(merged, "ready");
    setCachedPlaylists(merged);
    void persistCachedPlaylists(userId, merged);
  };

  const handleSnapshot = (snapshot: any, source: "id" | "uid") => {
    if (generation !== subscriptionGeneration) return;
    const next = new Map<string, DisplayPlaylist>();
    snapshot.forEach((docSnap: any) => {
      const p = docSnap.data() as FirestorePlaylist;
      next.set(docSnap.id, {
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

    if (source === "id") playlistsById = next;
    else playlistsByUid = next;

    void reconcileAndEmit();
  };

  const handleError = (error: any) => {
    if (generation !== subscriptionGeneration) return;
    logger.warn("[LibraryRepository] Realtime listener error:", error);
    void loadLocalPlaylistsFormatted().then((local) => {
      if (generation !== subscriptionGeneration) return;
      useLibraryStore.getState().setPlaylists(local, "ready");
    });
  };

  try {
    const qById = query(playlistsRef, where("createdBy.id", "==", userId));
    activeUnsubscribeById = onSnapshot(qById, (snapshot) => handleSnapshot(snapshot, "id"), handleError);

    const qByUid = query(playlistsRef, where("createdBy.uid", "==", userId));
    activeUnsubscribeByUid = onSnapshot(qByUid, (snapshot) => handleSnapshot(snapshot, "uid"), handleError);
  } catch (err) {
    logger.warn("[LibraryRepository] Failed to attach playlist listeners:", err);
    void loadLocalPlaylistsFormatted().then((local) => {
      if (generation !== subscriptionGeneration) return;
      useLibraryStore.getState().setPlaylists(local, "ready");
    });
  }

  return cleanupLibrarySubscription;
}

export function cleanupLibrarySubscription(): void {
  subscriptionGeneration += 1;
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
  useLibraryStore.getState().reset();
  setCachedPlaylists([]);
}

/**
 * Optimistic delete playlist.
 * Removes from Zustand store immediately (0ms) and disk cache, then deletes remotely.
 */
export async function deletePlaylistOptimistic(
  playlist: DisplayPlaylist,
  userId?: string | null
): Promise<boolean> {
  // 1. Instant local removal
  useLibraryStore.getState().removePlaylistOptimistic(playlist.id);
  removeCachedPlaylist(playlist.id);
  const remaining = useLibraryStore.getState().playlists;
  void persistCachedPlaylists(userId, remaining);

  // 2. Background deletion
  try {
    if (playlist.isFirestore) {
      if (!await deleteFirestorePlaylist(playlist.id)) throw new Error("Firestore playlist deletion failed");
    } else {
      await deleteUserPlaylist(playlist.id);
    }
    return true;
  } catch (error) {
    logger.error("[LibraryRepository] Failed to delete playlist in background:", error);
    useLibraryStore.getState().addPlaylistOptimistic(playlist);
    setCachedPlaylists(useLibraryStore.getState().playlists);
    void persistCachedPlaylists(userId, useLibraryStore.getState().playlists);
    return false;
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
      const local = await createUserPlaylist(name, description, uploadedImageUrl);
      useLibraryStore.getState().removePlaylistOptimistic(tempId);
      const confirmed = { ...optimisticPlaylist, id: local.id, isFirestore: false };
      useLibraryStore.getState().addPlaylistOptimistic(confirmed);
      void persistCachedPlaylists(null, useLibraryStore.getState().playlists);
      return confirmed;
    }

    useLibraryStore.getState().removePlaylistOptimistic(tempId);
    void persistCachedPlaylists(user?.id, useLibraryStore.getState().playlists);
    return null;
  } catch (error) {
    logger.error("[LibraryRepository] Background playlist creation failed:", error);
    useLibraryStore.getState().removePlaylistOptimistic(tempId);
    void persistCachedPlaylists(user?.id, useLibraryStore.getState().playlists);
    return null;
  }
}
