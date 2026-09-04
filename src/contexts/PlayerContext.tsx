import React, { type ReactNode } from "react";
import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioSleepTimer } from "@/services/audio/audioSleepTimer";
import { useAudioLikedSync } from "@/services/audio/audioLikedSync";
import { useAudioQueueOperations } from "@/services/audio/audioQueueOperations";
import { useAudioSyncListeners } from "@/services/audio/audioSyncListeners";
import { useAudioPlaybackValues } from "@/services/audio/audioPlaybackValues";
import { useAudioQualityControl } from "@/services/audio/audioQualityControl";
import { useAudioProgressTracking } from "@/services/audio/audioProgressTracking";
import { useAudioPlaybackCommands } from "@/services/audio/audioPlaybackCommands";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { usePlayerCoreState } from "@/services/audio/usePlayerCoreState";
import { PlayerContextTree } from "./PlayerContextProviders";
import {
  PlayerContext,
  PlayerLiteContext,
  PlayerProgressContext,
  PlayerRowContext,
  PlayerBrowseContext,
  PlayerQueueContext,
  PlayerLikedContext,
  PlayerActionsContext,
} from "./PlayerContextDefs";

let TrackPlayer: typeof import("react-native-track-player").default | null = null;
let Event: any = {};
let RepeatMode: any = {};
let State: any = {};

if (!isRunningInExpoGo() && Platform.OS !== "web") {
  try {
    const rntp = require("react-native-track-player");
    TrackPlayer = rntp.default || rntp;
    Event = rntp.Event || {};
    RepeatMode = rntp.RepeatMode || {};
    State = rntp.State || {};
  } catch {
    // Non-fatal fallback for Expo Go / unlinked runtimes
  }
}

type NativeSubscription = {
  remove: () => void;
};

const cleanupNativeSubscription = (subscription: NativeSubscription | null | undefined) => {
  subscription?.remove();
};

const subscribeTrackPlayerEvent = (eventName: unknown, listener: (...args: any[]) => void) => {
  if (!TrackPlayer?.addEventListener || !eventName) return () => {};
  const subscription = TrackPlayer.addEventListener(eventName as any, listener) as NativeSubscription;
  return () => cleanupNativeSubscription(subscription);
};

export type {
  SleepTimerSelection,
  SleepTimerState,
  PlaybackQualityState,
  PlayerState,
  PlayerContextValue,
  PlayerLiteContextValue,
  PlayerProgressContextValue,
  PlayerRowContextValue,
  PlayerBrowseContextValue,
  PlayerQueueContextValue,
  PlayerActionsContextValue,
  PlayerLikedContextValue,
  ResolvedPlaybackResult,
} from "@/types/playbackTypes";

import type { PlaybackQualityState } from "@/types/playbackTypes";

export {
  resolvePlaybackUrlWithDetails,
  resolvePlaybackUrl,
} from "@/services/audio/PlayerPlaybackResolver";

export {
  PlayerContext,
  PlayerLiteContext,
  PlayerProgressContext,
  PlayerRowContext,
  PlayerBrowseContext,
  PlayerQueueContext,
  PlayerLikedContext,
  PlayerActionsContext,
  usePlayerProgress,
  useOptionalPlayerProgress,
  usePlayerActions,
  useOptionalPlayerActions,
  useLikedSongs,
  usePlayerRow,
  usePlayerRowActions,
  usePlayerBrowse,
} from "./PlayerContextDefs";

const canUseLightweightAudioFallback = Boolean(isRunningInExpoGo() || !TrackPlayer);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
  const core = usePlayerCoreState({ TrackPlayer, State, RepeatMode });

  const {
    positionSecondsRef,
    resolvedDuration,
    resolvedDurationMillis,
    resolvedPositionSeconds,
    resolvedProgress,
    resolvedPositionMillis,
    setSeekOverride,
    setNativePosition,
    setNativeDuration,
  } = useAudioProgressTracking({
    currentSong: core.currentSong,
    currentSongRef: core.currentSongRef,
    queueRef: core.queueRef,
    repeatModeRef: core.repeatModeRef,
    isPlayingRef: core.isPlayingRef,
    setIsPlaying: core.setIsPlaying,
    playbackLoadingRef: core.playbackLoadingRef,
    desiredPlayStateRef: core.desiredPlayStateRef,
    canUseLightweightAudioFallback,
    TrackPlayer,
    nextSongRef: core.nextSongRef,
    playSongRef: core.playSongRef,
  });

  const { playSong, togglePlay, nextSong, prevSong, seekTo } = useAudioPlaybackCommands({
    currentSongRef: core.currentSongRef,
    setCurrentSong: core.setCurrentSong,
    queueRef: core.queueRef,
    setQueue: core.setQueue,
    originalQueueRef: core.originalQueueRef,
    setSourceQueue: core.setSourceQueue,
    queueIndexRef: core.queueIndexRef,
    setQueueIndex: core.setQueueIndex,
    userQueuedSongIdsRef: core.userQueuedSongIdsRef,
    setUserQueuedSongIds: core.setUserQueuedSongIds,
    isShuffledRef: core.isShuffledRef,
    repeatModeRef: core.repeatModeRef,
    isPlayingRef: core.isPlayingRef,
    setIsPlaying: core.setIsPlaying,
    playbackLoadingRef: core.playbackLoadingRef,
    setPlaybackLoading: core.setPlaybackLoading,
    desiredPlayStateRef: core.desiredPlayStateRef,
    playRequestIdRef: core.playRequestIdRef,
    positionSecondsRef,
    setSeekOverride,
    setNativePosition,
    resolvedDuration,
    streamUrlCache: core.streamUrlCache,
    resolvePlaybackUrlCached: core.resolvePlaybackUrlCached,
    prefetchAdjacentTrackStreams: core.prefetchAdjacentTrackStreams,
    enqueueNativeQueueMutation: core.enqueueNativeQueueMutation,
    TrackPlayer,
    isPlayerReady: core.isPlayerReady,
    ensurePlayerReady: core.ensurePlayerReady,
    State,
    canUseLightweightAudioFallback,
    showPlaybackNotice: core.showPlaybackNotice,
    playSongRef: core.playSongRef,
    togglePlayRef: core.togglePlayRef,
    togglePlayInFlightRef: core.togglePlayInFlightRef,
    nextSongRef: core.nextSongRef,
    prevSongRef: core.prevSongRef,
    seekToRef: core.seekToRef,
  });

  const { sleepTimer, sleepTimerRef, setSleepTimer, clearSleepTimer } = useAudioSleepTimer({
    onTimerExpire: () => {
      if (TrackPlayer) {
        TrackPlayer.pause().catch(() => {});
      } else if (canUseLightweightAudioFallback) {
        try { ExpoAvPlayer.pause(); } catch {}
      }
      core.setIsPlaying(false);
      core.isPlayingRef.current = false;
    },
  });

  const { likedSongIds, likedSongs, likedSongsRef, isLiked, toggleLike } = useAudioLikedSync({
    userId: authUser?.id,
  });

  const { changeStreamingQuality } = useAudioQualityControl({
    streamUrlCache: core.streamUrlCache,
    streamResolveCache: core.streamResolveCache,
    currentSongRef: core.currentSongRef,
    setCurrentSong: core.setCurrentSong,
    positionSecondsRef,
    isPlayingRef: core.isPlayingRef,
    setPlaybackQuality: core.setPlaybackQuality,
    queueIndexRef: core.queueIndexRef,
    queueRef: core.queueRef,
    setQueue: core.setQueue,
    originalQueueRef: core.originalQueueRef,
    setSourceQueue: core.setSourceQueue,
    TrackPlayer,
    isPlayerReady: core.isPlayerReady,
    ensurePlayerReady: core.ensurePlayerReady,
    RepeatMode,
    repeatModeRef: core.repeatModeRef,
    enqueueNativeQueueMutation: core.enqueueNativeQueueMutation,
    canUseLightweightAudioFallback,
    showPlaybackNotice: core.showPlaybackNotice,
  });

  const {
    toggleShuffle,
    shufflePlay,
    toggleRepeat,
    addToQueue,
    playNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    shuffleQueue,
  } = useAudioQueueOperations({
    queue: core.queue,
    queueRef: core.queueRef,
    setQueue: core.setQueue,
    sourceQueue: core.sourceQueue,
    originalQueueRef: core.originalQueueRef,
    setSourceQueue: core.setSourceQueue,
    queueIndex: core.queueIndex,
    queueIndexRef: core.queueIndexRef,
    setQueueIndex: core.setQueueIndex,
    userQueuedSongIds: core.userQueuedSongIds,
    userQueuedSongIdsRef: core.userQueuedSongIdsRef,
    setUserQueuedSongIds: core.setUserQueuedSongIds,
    isShuffled: core.isShuffled,
    isShuffledRef: core.isShuffledRef,
    setIsShuffled: core.setIsShuffled,
    repeatMode: core.repeatMode,
    repeatModeRef: core.repeatModeRef,
    setRepeatMode: core.setRepeatMode,
    currentSongRef: core.currentSongRef,
    isPlayingRef: core.isPlayingRef,
    positionSecondsRef,
    streamUrlCache: core.streamUrlCache,
    TrackPlayer,
    isPlayerReady: core.isPlayerReady,
    RepeatMode,
    enqueueNativeQueueMutation: core.enqueueNativeQueueMutation,
    nativeQueueIdsMatch: core.nativeQueueIdsMatch,
    replaceNativeQueuePreservingState: core.replaceNativeQueuePreservingState,
    resolvePlaybackUrlCached: core.resolvePlaybackUrlCached,
    showPlaybackNotice: core.showPlaybackNotice,
    playSong,
  });

  useAudioSyncListeners({
    isPlayerReady: core.isPlayerReady,
    TrackPlayer,
    Event,
    State,
    subscribeTrackPlayerEvent,
    currentSong: core.currentSong,
    currentSongRef: core.currentSongRef,
    setCurrentSong: core.setCurrentSong,
    queueRef: core.queueRef,
    queueIndex: core.queueIndex,
    queueIndexRef: core.queueIndexRef,
    setQueueIndex: core.setQueueIndex,
    setIsPlaying: core.setIsPlaying,
    isPlayingRef: core.isPlayingRef,
    setPlaybackLoading: core.setPlaybackLoading,
    playbackLoadingRef: core.playbackLoadingRef,
    desiredPlayStateRef: core.desiredPlayStateRef,
    positionSecondsRef,
    setNativePosition,
    setNativeDuration,
    setSeekOverride,
    prefetchAdjacentTrackStreams: core.prefetchAdjacentTrackStreams,
    sleepTimerRef,
    clearSleepTimer,
    showPlaybackNotice: core.showPlaybackNotice,
    likedSongs,
    likedSongsRef,
    playSong,
  });

  const playbackValues = useAudioPlaybackValues({
    currentSong: core.currentSong,
    queue: core.queue,
    userQueuedSongIds: core.userQueuedSongIds,
    sourceQueue: core.sourceQueue,
    queueIndex: core.queueIndex,
    resolvedIsPlaying: core.isPlaying,
    resolvedProgress,
    resolvedDurationMillis,
    resolvedPositionMillis,
    isShuffled: core.isShuffled,
    repeatMode: core.repeatMode,
    likedSongIds,
    likedSongs,
    playbackLoading: core.playbackLoading,
    albumColor: core.albumColor,
    textColor: core.textColor,
    sleepTimer,
    playbackQuality: core.playbackQuality,
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
    setAlbumColor: core.setAlbumColor,
    setTextColor: core.setTextColor,
    changeStreamingQuality,
  });

  return (
    <PlayerContextTree playbackValues={playbackValues}>
      {children}
    </PlayerContextTree>
  );
}
