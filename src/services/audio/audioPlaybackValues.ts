import { useMemo } from "react";
import type { Song } from "@/lib/musicData";
import type {
  PlayerContextValue,
  PlayerLiteContextValue,
  PlayerProgressContextValue,
  PlayerRowContextValue,
  PlayerBrowseContextValue,
  PlayerQueueContextValue,
  PlayerActionsContextValue,
  PlayerLikedContextValue,
  SleepTimerSelection,
  SleepTimerState,
  PlaybackQualityState,
} from "@/types/playbackTypes";

interface UseAudioPlaybackValuesProps {
  currentSong: Song | null;
  queue: Song[];
  userQueuedSongIds: string[];
  sourceQueue: Song[];
  queueIndex: number;
  resolvedIsPlaying: boolean;
  resolvedProgress: number;
  resolvedDurationMillis: number;
  resolvedPositionMillis: number;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  likedSongIds: string[];
  likedSongs: Song[];
  playbackLoading: boolean;
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
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setSleepTimer: (selection: SleepTimerSelection) => void;
  clearSleepTimer: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
  changeStreamingQuality: (quality: "low" | "medium" | "high") => Promise<void>;
}

export function useAudioPlaybackValues(props: UseAudioPlaybackValuesProps) {
  const {
    currentSong,
    queue,
    userQueuedSongIds,
    sourceQueue,
    queueIndex,
    resolvedIsPlaying,
    resolvedProgress,
    resolvedDurationMillis,
    resolvedPositionMillis,
    isShuffled,
    repeatMode,
    likedSongIds,
    likedSongs,
    playbackLoading,
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

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      isPlaying: resolvedIsPlaying,
      progress: resolvedProgress,
      duration: resolvedDurationMillis,
      positionMillis: resolvedPositionMillis,
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      isLoading: playbackLoading,
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
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      resolvedIsPlaying,
      resolvedProgress,
      resolvedDurationMillis,
      resolvedPositionMillis,
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      playbackLoading,
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

  const liteValue = useMemo<PlayerLiteContextValue>(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      isPlaying: resolvedIsPlaying,
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      isLoading: playbackLoading,
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
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      resolvedIsPlaying,
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      playbackLoading,
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

  const progressValue = useMemo<PlayerProgressContextValue>(
    () => ({
      progress: resolvedProgress,
      duration: resolvedDurationMillis,
      positionMillis: resolvedPositionMillis,
    }),
    [resolvedProgress, resolvedDurationMillis, resolvedPositionMillis]
  );

  const rowValue = useMemo<PlayerRowContextValue>(
    () => ({
      currentSongId: currentSong?.id || null,
      isPlaying: resolvedIsPlaying,
      playSong,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
    }),
    [currentSong?.id, resolvedIsPlaying, playSong, toggleLike, isLiked, addToQueue, playNext]
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

  const queueValue = useMemo<PlayerQueueContextValue>(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      queueIndex,
      isShuffled,
      sleepTimer,
      playSong,
      shufflePlay,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
    }),
    [
      currentSong,
      queue,
      userQueuedSongIds,
      queueIndex,
      isShuffled,
      sleepTimer,
      playSong,
      shufflePlay,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
    ]
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

  const likedValue = useMemo<PlayerLikedContextValue>(
    () => ({
      likedSongs,
      likedSongIds,
      likedSongsCount: likedSongs.length,
      isLiked,
      toggleLike,
    }),
    [likedSongs, likedSongIds, isLiked, toggleLike]
  );

  return {
    value,
    liteValue,
    progressValue,
    rowValue,
    browseValue,
    queueValue,
    actionsValue,
    likedValue,
  };
}
