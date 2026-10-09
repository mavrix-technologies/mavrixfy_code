import type { Song } from "@/lib/musicData";
import type { QueueOrderSnapshot } from "@/services/audio/queueDrag";
import type {
PlaybackQualityState,
PlayerActionsContextValue,
PlayerBrowseContextValue,
SleepTimerSelection,
SleepTimerState,
} from "@/types/playbackTypes";
import { useMemo } from "react";

interface UseAudioPlaybackValuesProps {
  currentSong: Song | null;
  queue: Song[];
  resolvedIsPlaying: boolean;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  likedSongIds: string[];
  likedSongs: Song[];
  albumColor: string;
  textColor: string;
  sleepTimer: SleepTimerState | null;
  playbackQuality: PlaybackQualityState;
  playSong: (song: Song, requestedQueue?: Song[]) => Promise<void> | void;
  shufflePlay: (songs: Song[], startSong?: Song) => Promise<void> | void;
  togglePlay: () => Promise<void> | void;
  nextSong: () => Promise<void> | void;
  prevSong: () => Promise<void> | void;
  seekTo: (progress: number) => Promise<void> | void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (song: Song) => Promise<void>;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number, expectedState?: QueueOrderSnapshot) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setSleepTimer: (selection: SleepTimerSelection) => void;
  clearSleepTimer: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
  changeStreamingQuality: (quality: "auto" | "low" | "medium" | "high") => Promise<void>;
}

export function useAudioPlaybackValues(props: UseAudioPlaybackValuesProps) {
  const {
    currentSong,
    queue,
    resolvedIsPlaying,
    isShuffled,
    repeatMode,
    likedSongIds,
    likedSongs,
    albumColor,
    textColor,
    sleepTimer,
    playbackQuality,
    playSong,
    shufflePlay,
    togglePlay,
    nextSong,
    prevSong,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    isLiked,
    addToQueue,
    playNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    shuffleQueue,
    setSleepTimer,
    clearSleepTimer,
    setAlbumColor,
    setTextColor,
    changeStreamingQuality,
  } = props;

  const rowActionsValue = useMemo(
    () => ({
      playSong,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
    }),
    [playSong, toggleLike, isLiked, addToQueue, playNext]
  );

  const browseValue = useMemo<PlayerBrowseContextValue>(
    () => ({
      currentSong,
      queue,
      isPlaying: resolvedIsPlaying,
      likedSongs,
      playSong,
      shufflePlay,
      togglePlay,
      toggleLike,
      toggleShuffle,
    }),
    [currentSong, queue, resolvedIsPlaying, likedSongs, playSong, shufflePlay, togglePlay, toggleLike, toggleShuffle]
  );

  const actionsValue = useMemo<PlayerActionsContextValue>(
    () => ({
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      albumColor,
      textColor,
      sleepTimer,
      playbackQuality,
      playSong,
      shufflePlay,
      togglePlay,
      nextSong,
      prevSong,
      seekTo,
      toggleShuffle,
      toggleRepeat,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
      setSleepTimer,
      clearSleepTimer,
      setAlbumColor,
      setTextColor,
      changeStreamingQuality,
    }),
    [
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      albumColor,
      textColor,
      sleepTimer,
      playbackQuality,
      playSong,
      shufflePlay,
      togglePlay,
      nextSong,
      prevSong,
      seekTo,
      toggleShuffle,
      toggleRepeat,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
      setSleepTimer,
      clearSleepTimer,
      setAlbumColor,
      setTextColor,
      changeStreamingQuality,
    ]
  );

  return {
    rowActionsValue,
    browseValue,
    actionsValue,
  };
}
