import { useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Song } from "@/lib/musicData";
import { useLikedSongsStore } from "./likedSongsStore";
import { toggleLikeSong, loadCachedLikedSongs } from "./likedSongsRepository";

export function useLikedSongs() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const songs = useLikedSongsStore((state) => state.songs);
  const ids = useLikedSongsStore((state) => state.ids);
  const status = useLikedSongsStore((state) => state.status);
  const initialized = useLikedSongsStore((state) => state.initialized);

  const likedSongIds = useMemo(() => Array.from(ids), [ids]);
  const likedSongsCount = songs.length;

  const isLiked = useCallback(
    (songId: string | undefined | null) => {
      if (!songId) return false;
      return ids.has(songId);
    },
    [ids]
  );

  const toggleLike = useCallback(
    async (song: Song) => {
      await toggleLikeSong(userId, song);
    },
    [userId]
  );

  const refresh = useCallback(() => {
    void loadCachedLikedSongs(userId);
  }, [userId]);

  return {
    likedSongs: songs,
    likedSongIds,
    likedSongsCount,
    isLiked,
    toggleLike,
    status,
    initialized,
    refresh,
  };
}

/**
 * Selective hook to observe like status for a single song ID.
 * Components using this hook ONLY re-render when this specific song's like state changes.
 */
export function useIsSongLiked(songId?: string | null): boolean {
  return useLikedSongsStore((state) => Boolean(songId && state.ids.has(songId)));
}
