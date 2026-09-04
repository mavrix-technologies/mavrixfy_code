import { useState, useRef, useCallback, useEffect } from "react";
import type { Song } from "@/lib/musicData";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";

interface UseAudioLikedSyncOptions {
  userId?: string | null;
}

export function useAudioLikedSync({ userId }: UseAudioLikedSyncOptions) {
  const [likedSongIds, setLikedSongIds] = useState<string[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const likedSongsRef = useRef<Song[]>([]);
  const likePendingSongsRef = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    likedSongsRef.current = likedSongs;
  }, [likedSongs]);

  useEffect(() => {
    if (userId) {
      getLikedSongsFromFirestore(userId)
        .then((songs) => {
          if (songs && songs.length > 0) {
            setLikedSongs(songs);
            setLikedSongIds(songs.map((s) => s.id));
            likedSongsRef.current = songs;
          }
        })
        .catch(() => {});
    } else {
      setLikedSongs([]);
      setLikedSongIds([]);
      likedSongsRef.current = [];
    }
  }, [userId]);

  const isLiked = useCallback(
    (songId: string) => {
      return likedSongIds.includes(songId);
    },
    [likedSongIds]
  );

  const toggleLike = useCallback(
    async (song: Song) => {
      if (!song?.id) return;
      const songId = song.id;
      const isCurrentlyLiked =
        likedSongsRef.current.some((s) => s.id === songId) || likedSongIds.includes(songId);
      const willBeLiked = !isCurrentlyLiked;

      const prevSongs = likedSongsRef.current;
      const nextSongs = willBeLiked
        ? prevSongs.some((s) => s.id === songId)
          ? prevSongs
          : [...prevSongs, song]
        : prevSongs.filter((s) => s.id !== songId);
      likedSongsRef.current = nextSongs;
      setLikedSongs(nextSongs);

      setLikedSongIds((prevIds) =>
        willBeLiked
          ? prevIds.includes(songId)
            ? prevIds
            : [...prevIds, songId]
          : prevIds.filter((id) => id !== songId)
      );

      if (userId) {
        const previousPromise = likePendingSongsRef.current.get(songId) || Promise.resolve();
        const currentOperation = previousPromise
          .then(async () => {
            if (willBeLiked) {
              await addLikedSongToFirestore(userId, song);
            } else {
              await removeLikedSongFromFirestore(userId, songId);
            }
          })
          .catch((error) => {
            logger.error("[Player] Failed to sync like state with Firestore", error);
          })
          .finally(() => {
            if (likePendingSongsRef.current.get(songId) === currentOperation) {
              likePendingSongsRef.current.delete(songId);
            }
          });

        likePendingSongsRef.current.set(songId, currentOperation);
      }
    },
    [userId, likedSongIds]
  );

  return {
    likedSongIds,
    likedSongs,
    likedSongsRef,
    isLiked,
    toggleLike,
  };
}
