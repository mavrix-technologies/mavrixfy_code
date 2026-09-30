import { getAccountScope } from "@/lib/accountScope";
import { db } from "@/lib/firebase";
import { addLikedSongToFirestore,removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
collection,
onSnapshot,
orderBy,
query,
type Unsubscribe,
} from "firebase/firestore";
import { useLikedSongsStore } from "./likedSongsStore";

const CACHE_KEY_PREFIX = "@mavrixfy_liked_songs_";

let activeUnsubscribe: Unsubscribe | null = null;
let activeSubscriptionUserId: string | null = null;
let subscriptionGeneration = 0;

function getCacheKey(userId?: string | null): string {
  return `${CACHE_KEY_PREFIX}${userId || "guest"}`;
}

function sanitizeSongForCache(song: Song): Partial<Song> {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album || "",
    coverUrl: song.coverUrl || "",
    genre: song.genre || "",
    duration: song.duration || 0,
    source: song.source,
    videoId: song.videoId,
    youtubeVideoId: song.youtubeVideoId,
  };
}

/**
 * Reads cached liked songs from local storage and hydrates Zustand store immediately (0ms).
 */
export async function loadCachedLikedSongs(userId?: string | null): Promise<Song[]> {
  const generation = subscriptionGeneration;
  try {
    const key = getCacheKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (generation !== subscriptionGeneration || (userId ?? null) !== activeSubscriptionUserId) return [];
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validSongs = parsed.filter((s: any) => Boolean(s && s.id && s.title)) as Song[];
      if (useLikedSongsStore.getState().status === "loading") {
        useLikedSongsStore.getState().setSongs(validSongs, "loading");
      }
      return validSongs;
    }
  } catch (error) {
    logger.warn("[LikedSongsRepository] Failed to read cached liked songs:", error);
  }
  return [];
}

/**
 * Persists songs to local AsyncStorage asynchronously without blocking the UI thread.
 */
export async function persistCachedLikedSongs(userId: string | null | undefined, songs: Song[]): Promise<void> {
  try {
    const key = getCacheKey(userId);
    const sanitized = songs.slice(0, 500).map(sanitizeSongForCache);
    await AsyncStorage.setItem(key, JSON.stringify(sanitized));
  } catch (error) {
    logger.warn("[LikedSongsRepository] Failed to persist liked songs to cache:", error);
  }
}

/**
 * Sets up a persistent Firestore realtime sync listener for the user.
 * Silently synchronizes the store and local cache whenever remote documents change.
 */
export function subscribeLikedSongs(userId?: string | null): () => void {
  // If no user or same active listener, avoid duplicate subscriptions
  if (!userId) {
    cleanupLikedSongsSubscription();
    useLikedSongsStore.getState().setStatus("loading");
    void loadCachedLikedSongs(null);
    return cleanupLikedSongsSubscription;
  }

  if (activeSubscriptionUserId === userId && activeUnsubscribe) {
    return cleanupLikedSongsSubscription;
  }

  cleanupLikedSongsSubscription();
  activeSubscriptionUserId = userId;
  useLikedSongsStore.getState().setStatus("loading");

  // 1. Instant local-first hydration from cache
  void loadCachedLikedSongs(userId);

  if (!db) {
    useLikedSongsStore.getState().setStatus("ready");
    return () => {};
  }

  const likedSongsRef = collection(db, "users", userId, "likedSongs");

  const handleLikedSongsSnapshot = (snapshot: any) => {
    if (activeSubscriptionUserId !== userId) return;
    const songs: Song[] = [];
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      const songId = docSnap.id;
      if (!songId) return;

      songs.push({
        id: songId,
        title: data.title || data.name || "",
        artist: data.artist || data.artists || "",
        coverUrl: data.imageUrl || data.coverUrl || data.image || "",
        audioUrl: data.audioUrl || data.streamUrl || data.url || data.previewUrl || "",
        duration: data.duration || 0,
        album: data.album || data.albumName || "",
        genre: data.genre || "",
        source: data.source,
        videoId: data.videoId,
        youtubeVideoId: data.youtubeVideoId,
      });
    });

    useLikedSongsStore.getState().setSongs(songs, "ready");
    void persistCachedLikedSongs(userId, songs);
  };

  const handleLikedSongsError = (error: any) => {
    if (activeSubscriptionUserId !== userId) return;
    logger.warn("[LikedSongsRepository] Realtime listener error, falling back to cached state:", error);
    // Don't blow away cached songs on network errors
    useLikedSongsStore.getState().setStatus("ready");
  };

  try {
    const q = query(likedSongsRef, orderBy("likedAt", "desc"));
    activeUnsubscribe = onSnapshot(q, handleLikedSongsSnapshot, (err) => {
      // If composite index is missing or orderBy fails, fallback to unordered snapshot
      logger.warn("[LikedSongsRepository] Ordered query failed, falling back to unordered listener:", err);
      if (activeSubscriptionUserId === userId) {
        activeUnsubscribe = onSnapshot(likedSongsRef, handleLikedSongsSnapshot, handleLikedSongsError);
      }
    });
  } catch (err) {
    logger.warn("[LikedSongsRepository] Failed to initialize query, attaching unordered listener:", err);
    activeUnsubscribe = onSnapshot(likedSongsRef, handleLikedSongsSnapshot, handleLikedSongsError);
  }

  return cleanupLikedSongsSubscription;
}

/**
 * Cleans up any active Firestore listener and resets state tracking.
 */
export function cleanupLikedSongsSubscription(): void {
  subscriptionGeneration += 1;
  if (activeUnsubscribe) {
    try {
      activeUnsubscribe();
    } catch {
      // Ignored
    }
    activeUnsubscribe = null;
  }
  activeSubscriptionUserId = null;
  useLikedSongsStore.getState().reset();
}

/**
 * Optimistic Like / Unlike Mutation.
 * Updates Zustand store immediately (0ms) and local cache, then syncs Firestore in background.
 */
export async function toggleLikeSong(userId: string | null | undefined, song: Song): Promise<boolean> {
  if (!song?.id) return false;
  const songId = song.id;
  const isCurrentlyLiked = useLikedSongsStore.getState().ids.has(songId);
  const willBeLiked = !isCurrentlyLiked;
  const previousSong = useLikedSongsStore.getState().songs.find((item) => item.id === songId);

  // 1. Instant local UI update
  if (willBeLiked) {
    useLikedSongsStore.getState().addSongOptimistic(song);
  } else {
    useLikedSongsStore.getState().removeSongOptimistic(songId);
  }

  // 2. Local cache persistence
  const currentSongs = useLikedSongsStore.getState().songs;
  void persistCachedLikedSongs(userId, currentSongs);

  // 3. Background Firestore sync
  if (userId) {
    try {
      const saved = willBeLiked
        ? await addLikedSongToFirestore(userId, song)
        : await removeLikedSongFromFirestore(userId, songId);
      if (!saved) throw new Error("Could not sync liked song");
    } catch (error) {
      logger.error("[LikedSongsRepository] Background Firestore sync failed:", error);
      if (getAccountScope().accountId === userId && useLikedSongsStore.getState().ids.has(songId) === willBeLiked) {
        if (isCurrentlyLiked && previousSong) useLikedSongsStore.getState().addSongOptimistic(previousSong);
        else useLikedSongsStore.getState().removeSongOptimistic(songId);
        void persistCachedLikedSongs(userId, useLikedSongsStore.getState().songs);
      }
      return isCurrentlyLiked;
    }
  }

  return willBeLiked;
}
