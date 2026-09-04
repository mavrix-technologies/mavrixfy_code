import { useState, useCallback } from "react";
import { Alert, ToastAndroid } from "react-native";
import { IS_ANDROID } from "@/constants/platform";
import { mapFilter } from "@/lib/arrayUtils";
import { getRecentlyPlayed, getUserPlaylists } from "@/lib/storage";
import type { Song } from "@/lib/musicData";

export function useDevTrackHelper(playSong: (song: Song, queue: Song[]) => void) {
  const [isLoadingDevTrack, setIsLoadingDevTrack] = useState(false);

  const showDevLoadMessage = useCallback((message: string) => {
    if (IS_ANDROID) {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert("Player Dev Helper", message);
  }, []);

  const normalizePlayableSong = useCallback((source: Partial<Song> | null | undefined): Song | null => {
    if (!source?.id || !source.audioUrl || source.audioUrl.trim().length === 0) {
      return null;
    }

    return {
      id: source.id,
      title: source.title || "Unknown Song",
      artist: source.artist || "Unknown Artist",
      album: source.album || "",
      duration: Number(source.duration) || 0,
      coverUrl: source.coverUrl || "",
      genre: source.genre || "",
      audioUrl: source.audioUrl,
      year: source.year,
      language: source.language,
      source: source.source,
    };
  }, []);

  const handleLoadDevTrack = useCallback(async () => {
    if (isLoadingDevTrack) {
      return;
    }

    setIsLoadingDevTrack(true);
    try {
      const recentItems = await getRecentlyPlayed();
      const recentSongs = mapFilter(
        recentItems.filter((item) => item.type === "song"),
        (item) => normalizePlayableSong(item.data as Partial<Song> | undefined),
        (song): song is Song => Boolean(song)
      );

      const localPlaylistSongs = mapFilter(
        (await getUserPlaylists()).flatMap((playlist) => playlist.songs || []),
        (song) => normalizePlayableSong(song),
        (song): song is Song => Boolean(song)
      );

      const candidateQueue = [recentSongs, localPlaylistSongs].find((songs) => songs.length > 0) || [];

      if (candidateQueue.length === 0) {
        showDevLoadMessage("No saved playable song found yet. Play one song from Home once, then come back here.");
        return;
      }

      playSong(candidateQueue[0], candidateQueue);
    } catch {
      showDevLoadMessage("Could not load a development test song.");
    } finally {
      setIsLoadingDevTrack(false);
    }
  }, [isLoadingDevTrack, normalizePlayableSong, playSong, showDevLoadMessage]);

  return {
    isLoadingDevTrack,
    handleLoadDevTrack,
  };
}
