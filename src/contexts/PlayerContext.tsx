import { useAuth } from "@/contexts/AuthContext";
import { useAudioLikedSync } from "@/services/audio/audioLikedSync";
import { useAudioPlaybackCommands } from "@/services/audio/audioPlaybackCommands";
import { useAudioPlaybackValues } from "@/services/audio/audioPlaybackValues";
import { useAudioProgressTracking } from "@/services/audio/audioProgressTracking";
import { useAudioQualityControl } from "@/services/audio/audioQualityControl";
import { useAudioQueueOperations } from "@/services/audio/audioQueueOperations";
import { useAudioSleepTimer } from "@/services/audio/audioSleepTimer";
import { useAndroidAuto } from "@/services/audio/useAndroidAuto";
import { useAudioSyncListeners } from "@/services/audio/audioSyncListeners";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { resetPlaybackEngine,updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { usePlayerCoreState } from "@/services/audio/usePlayerCoreState";
import { StandardAudioRenderer } from "@/services/audio/StandardAudioRenderer";
import { Event, RepeatMode, StandardAudioPlayer, State } from "@/services/audio/StandardAudioPlayer";
import { isRunningInExpoGo } from "expo";
import { useEffect,type ReactNode } from "react";
import { Platform } from "react-native";
import { PlayerContextTree } from "./PlayerContextProviders";


const TrackPlayer = !isRunningInExpoGo() && Platform.OS !== "web" ? StandardAudioPlayer : null;

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
PlaybackQualityState,PlayerActionsContextValue,PlayerBrowseContextValue,ResolvedPlaybackResult,SleepTimerSelection,
SleepTimerState
} from "@/types/playbackTypes";

export {
resolvePlaybackUrl,resolvePlaybackUrlWithDetails
} from "@/services/audio/PlayerPlaybackResolver";

export {
PlayerActionsContext,PlayerBrowseContext,useLikedSongs,useOptionalPlayerActions,useOptionalPlayerProgress,
usePlayerActions,usePlayerBrowse,usePlayerProgress,usePlayerRowActions
} from "./PlayerContextDefs";

const canUseLightweightAudioFallback = Boolean(isRunningInExpoGo() || !TrackPlayer);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
  const core = usePlayerCoreState({ TrackPlayer, State, RepeatMode });
  useEffect(() => () => {
    core.playRequestIdRef.current += 1;
    core.desiredPlayStateRef.current = false;
    void TrackPlayer?.reset().catch(() => {});
    ExpoAvPlayer.destroy();
    resetPlaybackEngine();
  }, [core.playRequestIdRef, core.desiredPlayStateRef]);

  const {
    positionSecondsRef,
    durationSecondsRef,
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
    pendingPlayRequestRef: core.pendingPlayRequestRef,
    canUseLightweightAudioFallback,
    TrackPlayer,
    nextSongRef: core.nextSongRef,
    playSongRef: core.playSongRef,
  });

  const { sleepTimer, sleepTimerRef, setSleepTimer, clearSleepTimer } = useAudioSleepTimer({
    onTimerExpire: () => {
      const desiredRef = core.desiredPlayStateRef;
      desiredRef.current = false;
      if (TrackPlayer) {
        TrackPlayer.pause().catch(() => {});
      } else if (canUseLightweightAudioFallback) {
        try { ExpoAvPlayer.pause(); } catch {}
      }
      core.setIsPlaying(false);
      const playingRef = core.isPlayingRef;
      playingRef.current = false;
      updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
    },
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
    pendingPlayRequestRef: core.pendingPlayRequestRef,
    positionSecondsRef,
    durationSecondsRef,
    isNativeQueueSyncedRef: core.isNativeQueueSyncedRef,
    setSeekOverride,
    setNativePosition,
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
    triggerAutoplayAppend: core.triggerAutoplayAppend,
    autoplaySongIdsRef: core.autoplaySongIdsRef,
    lastAutoplaySeedIdRef: core.lastAutoplaySeedIdRef,
    sleepTimerRef,
  });

  const { likedSongIds, likedSongs, likedSongsRef, isLiked, toggleLike } = useAudioLikedSync({
    userId: authUser?.id,
  });

  const { changeStreamingQuality } = useAudioQualityControl({
    desiredPlayStateRef: core.desiredPlayStateRef,
    playRequestIdRef: core.playRequestIdRef,
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

  useAndroidAuto({
    queue: core.queue, currentSong: core.currentSong, likedSongs, playSong,
    isShuffled: core.isShuffled, repeatMode: core.repeatMode,
    toggleShuffle, toggleRepeat, toggleLike,
  });

  useAudioSyncListeners({
    setPlaybackQuality: core.setPlaybackQuality,
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
    pendingPlayRequestRef: core.pendingPlayRequestRef,
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
    nextSong,
    prevSong,
    isNativeQueueSyncedRef: core.isNativeQueueSyncedRef,
    triggerAutoplayAppend: core.triggerAutoplayAppend,
    isShuffled: core.isShuffled,
    repeatMode: core.repeatMode,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    likedSongIds,
  });

  const playbackValues = useAudioPlaybackValues({
    currentSong: core.currentSong,
    queue: core.queue,
    resolvedIsPlaying: core.isPlaying,
    isShuffled: core.isShuffled,
    repeatMode: core.repeatMode,
    likedSongIds,
    likedSongs,
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
      {TrackPlayer ? <StandardAudioRenderer /> : null}
      {children}
    </PlayerContextTree>
  );
}
