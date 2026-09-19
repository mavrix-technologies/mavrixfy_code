import { useEffect, useCallback, useRef, useMemo } from "react";
import type { Song } from "@/lib/musicData";
import {
  useLikedSongsStore,
  subscribeLikedSongs,
  toggleLikeSong,
} from "@/features/liked-songs";

interface UseAudioLikedSyncOptions {
  userId?: string | null;
}

export function useAudioLikedSync({ userId }: UseAudioLikedSyncOptions) {
  const songs = useLikedSongsStore((state) => state.songs);
  const ids = useLikedSongsStore((state) => state.ids);
  const likedSongsRef = useRef<Song[]>(songs);

  useEffect(() => {
    likedSongsRef.current = songs;
  }, [songs]);

  // Subscribe to realtime updates and local cache hydration
  useEffect(() => {
    const unsubscribe = subscribeLikedSongs(userId);
    return () => {
      unsubscribe?.();
    };
  }, [userId]);

  const likedSongIds = useMemo(() => Array.from(ids), [ids]);

  const isLiked = useCallback(
    (songId: string) => {
      if (!songId) return false;
      return useLikedSongsStore.getState().ids.has(songId);
    },
    []
  );

  const toggleLike = useCallback(
    async (song: Song) => {
      await toggleLikeSong(userId, song);
    },
    [userId]
  );

  return {
    likedSongIds,
    likedSongs: songs,
    likedSongsRef,
    isLiked,
    toggleLike,
  };
}
