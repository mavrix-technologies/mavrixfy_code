import { useCallback, useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/musicData";
import type { PlaybackQualityState } from "@/types/playbackTypes";
import { showGlobalToast } from "@/utils/globalToast";
import { logger } from "@/lib/logger";
import { setupPlayer } from "./TrackPlayerAdapter";
import { useStartupPlaybackReconcile } from "./audioStartupReconcile";
import { useAudioNativeQueueLane } from "./audioNativeQueueLane";

export interface UsePlayerCoreStateOptions {
  TrackPlayer: any;
  State: any;
  RepeatMode: any;
}

export function usePlayerCoreState({
  TrackPlayer,
  State,
  RepeatMode,
}: UsePlayerCoreStateOptions) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [userQueuedSongIds, setUserQueuedSongIds] = useState<string[]>([]);
  const [sourceQueue, setSourceQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [albumColor, setAlbumColor] = useState("#282828");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [playbackQuality, setPlaybackQuality] = useState<PlaybackQualityState>({
    requested: "medium",
    actualBitrate: 160,
    qualityLabel: "160kbps",
    unlocked: false,
    isFallback: false,
  });

  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const originalQueueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const isShuffledRef = useRef(false);
  const userQueuedSongIdsRef = useRef<string[]>([]);
  const playbackLoadingRef = useRef(false);
  const desiredPlayStateRef = useRef<boolean | null>(null);
  const playRequestIdRef = useRef(0);
  const playerSetupPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastPlaybackNoticeAtRef = useRef(0);
  const nextSongRef = useRef<() => void>(() => {});
  const prevSongRef = useRef<() => void>(() => {});
  const togglePlayRef = useRef<() => Promise<void> | void>(() => {});
  const togglePlayInFlightRef = useRef(false);
  const seekToRef = useRef<(progress: number) => Promise<void> | void>(() => {});
  const playSongRef = useRef<(song: Song, queue?: Song[]) => Promise<void> | void>(() => {});

  const streamUrlCache = useRef<Map<string, string>>(new Map());
  const streamResolveCache = useRef<Map<string, Promise<string | null>>>(new Map());
  const MAX_STREAM_CACHE = 100;

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playbackLoadingRef.current = playbackLoading; }, [playbackLoading]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isShuffledRef.current = isShuffled; }, [isShuffled]);
  useEffect(() => { userQueuedSongIdsRef.current = userQueuedSongIds; }, [userQueuedSongIds]);

  const showPlaybackNotice = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastPlaybackNoticeAtRef.current < 1200) return;
    lastPlaybackNoticeAtRef.current = now;
    showGlobalToast(message);
  }, []);

  const ensurePlayerReady = useCallback(async (): Promise<boolean> => {
    if (isPlayerReady) return true;
    if (!TrackPlayer) return false;

    if (playerSetupPromiseRef.current) {
      return playerSetupPromiseRef.current;
    }

    const promise = (async () => {
      try {
        await setupPlayer();
        setIsPlayerReady(true);
        return true;
      } catch (error) {
        logger.error("[Player] TrackPlayer setup failed", error);
        return false;
      } finally {
        playerSetupPromiseRef.current = null;
      }
    })();

    playerSetupPromiseRef.current = promise;
    return promise;
  }, [TrackPlayer, isPlayerReady]);

  useEffect(() => {
    if (TrackPlayer) {
      void ensurePlayerReady();
    }
  }, [TrackPlayer, ensurePlayerReady]);

  const setStreamCache = useCallback((songId: string, url: string) => {
    if (!songId || !url) return;
    const cache = streamUrlCache.current;
    if (cache.has(songId)) {
      cache.delete(songId);
    } else if (cache.size >= MAX_STREAM_CACHE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(songId, url);
  }, []);

  const resolvePlaybackUrlCached = useCallback(
    async (song: Song, forcedQuality?: "low" | "medium" | "high"): Promise<string | null> => {
      if (!song?.id) return null;
      const cached = streamUrlCache.current.get(song.id);
      if (cached && !forcedQuality) return cached;

      const pending = streamResolveCache.current.get(song.id);
      if (pending && !forcedQuality) return pending;

      const { resolvePlaybackUrlWithDetails: resolveWithDetails } = await import("@/services/audio/PlayerPlaybackResolver");
      const request = resolveWithDetails(song, forcedQuality)
        .then(({ url, qualityState }) => {
          if (url) {
            setStreamCache(song.id, url);
          }
          if (song.id === currentSongRef.current?.id) {
            setPlaybackQuality(qualityState);
          }
          return url;
        })
        .finally(() => {
          streamResolveCache.current.delete(song.id);
        });

      streamResolveCache.current.set(song.id, request);
      return request;
    },
    [setStreamCache]
  );

  const prefetchAdjacentTrackStreams = useCallback(
    (songQueue: Song[], activeIndex: number) => {
      const nextItem = songQueue[activeIndex + 1];
      if (nextItem) {
        void resolvePlaybackUrlCached(nextItem).catch(() => null);
      }
    },
    [resolvePlaybackUrlCached]
  );

  // Hook: Startup Reconcile
  useStartupPlaybackReconcile({
    TrackPlayer,
    State,
    isPlayerReady,
    ensurePlayerReady,
    currentSongRef,
    setCurrentSong,
    queueRef,
    setQueue,
    originalQueueRef,
    setSourceQueue,
    queueIndexRef,
    setQueueIndex,
    isPlayingRef,
    setIsPlaying,
  });

  // Hook: Native Queue Mutation Lane
  const {
    enqueueNativeQueueMutation,
    nativeQueueIdsMatch,
    replaceNativeQueuePreservingState,
  } = useAudioNativeQueueLane({
    TrackPlayer,
    RepeatMode,
    isPlayerReady,
    repeatModeRef,
    streamUrlCache,
    resolvePlaybackUrlCached,
  });

  return {
    isPlayerReady,
    setIsPlayerReady,
    currentSong,
    setCurrentSong,
    queue,
    setQueue,
    userQueuedSongIds,
    setUserQueuedSongIds,
    sourceQueue,
    setSourceQueue,
    queueIndex,
    setQueueIndex,
    isPlaying,
    setIsPlaying,
    isShuffled,
    setIsShuffled,
    repeatMode,
    setRepeatMode,
    playbackLoading,
    setPlaybackLoading,
    albumColor,
    setAlbumColor,
    textColor,
    setTextColor,
    playbackQuality,
    setPlaybackQuality,
    currentSongRef,
    queueRef,
    originalQueueRef,
    queueIndexRef,
    isPlayingRef,
    repeatModeRef,
    isShuffledRef,
    userQueuedSongIdsRef,
    playbackLoadingRef,
    desiredPlayStateRef,
    playRequestIdRef,
    nextSongRef,
    prevSongRef,
    togglePlayRef,
    togglePlayInFlightRef,
    seekToRef,
    playSongRef,
    streamUrlCache,
    streamResolveCache,
    showPlaybackNotice,
    ensurePlayerReady,
    resolvePlaybackUrlCached,
    prefetchAdjacentTrackStreams,
    enqueueNativeQueueMutation,
    nativeQueueIdsMatch,
    replaceNativeQueuePreservingState,
  };
}
