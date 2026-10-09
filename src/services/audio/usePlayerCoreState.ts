import { isYouTubeSong } from "@/services/youtube/YouTubeMusic";
import { logger } from "@/lib/logger";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import type { Song } from "@/lib/musicData";
import { getSettings } from "@/lib/storage";
import type { PlaybackQualityState } from "@/types/playbackTypes";
import { showGlobalToast } from "@/utils/globalToast";
import { useCallback,useEffect,useRef,useState } from "react";
import { useAudioNativeQueueLane } from "./audioNativeQueueLane";
import { useStartupPlaybackReconcile } from "./audioStartupReconcile";
import { updatePlaybackEngineSnapshot } from "./PlaybackEngine";
import { resolvePlaybackUrlWithDetails, songToTrack, withResolvedPlaybackUrl } from "./PlayerPlaybackResolver";
import { fetchAutoplayRecommendations } from "./smartAutoplayService";
import { StandardAudioPlayer } from "./StandardAudioPlayer";
import * as ExpoAvPlayer from "./ExpoAvAdapter";

export interface UsePlayerCoreStateOptions {
  TrackPlayer: any;
  State: any;
  RepeatMode: any;
}

export interface PendingPlayRequest {
  id: number;
  songId: string;
}

export function usePlayerCoreState({
  TrackPlayer,
  State,
  RepeatMode,
}: UsePlayerCoreStateOptions) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const isNativeQueueSyncedRef = useRef(false);

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
    actualBitrate: 0,
    qualityLabel: "Original audio",
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
  const pendingPlayRequestRef = useRef<PendingPlayRequest | null>(null);
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

  // Refs are kept synchronously up-to-date at the call site (state setter + ref write together).
  // Removed one-render-delayed useEffect ref-sync wrappers to prevent auto-pause from stale reads.

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
        await StandardAudioPlayer.setupPlayer();
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
    async (song: Song, forcedQuality?: "auto" | "low" | "medium" | "high"): Promise<string | null> => {
      if (!song?.id) return null;
      if (isYouTubeSong(song)) {
        const { url, qualityState } = await resolvePlaybackUrlWithDetails(song, forcedQuality);
        if (song.id === currentSongRef.current?.id) setPlaybackQuality(qualityState);
        return url;
      }
      const cached = streamUrlCache.current.get(song.id);
      if (cached && !forcedQuality) return cached;

      const pending = streamResolveCache.current.get(song.id);
      if (pending && !forcedQuality) return pending;

      const request = resolvePlaybackUrlWithDetails(song, forcedQuality)
        .then(({ url, qualityState }) => {
          // Quality changes invalidate pending resolutions. An outgoing
          // result must not refill the cache or overwrite the new quality.
          if (streamResolveCache.current.get(song.id) !== request) return url;
          if (url) {
            setStreamCache(song.id, url);
          }
          if (song.id === currentSongRef.current?.id) {
            setPlaybackQuality(qualityState);
          }
          return url;
        })
        .finally(() => {
          if (streamResolveCache.current.get(song.id) === request) {
            streamResolveCache.current.delete(song.id);
          }
        });

      streamResolveCache.current.set(song.id, request);
      return request;
    },
    [setStreamCache]
  );

  const prefetchAdjacentTrackStreams = useCallback(
    (songQueue: Song[], activeIndex: number) => {
      const nextItem = songQueue[activeIndex + 1];
      const queueAtPrefetch = songQueue;
      if (nextItem) {
        void resolvePlaybackUrlCached(nextItem)
          .then((resolvedUrl) => {
            if (resolvedUrl && queueRef.current === queueAtPrefetch && currentSongRef.current?.id === songQueue[activeIndex]?.id) {
              if (TrackPlayer && typeof TrackPlayer.updateMetadataForTrack === "function") {
                void TrackPlayer.updateMetadataForTrack(activeIndex + 1, songToTrack(nextItem, resolvedUrl));
              }
              if (!TrackPlayer) void ExpoAvPlayer.prepareStandby(resolvedUrl, withResolvedPlaybackUrl(nextItem, resolvedUrl));
            }
          })
          .catch(() => null);
      }
      // Widen prefetch: also warm up the track two positions ahead
      const nextNextItem = songQueue[activeIndex + 2];
      if (nextNextItem && !isYouTubeSong(nextNextItem)) void resolvePlaybackUrlCached(nextNextItem).catch(() => null);
    },
    [resolvePlaybackUrlCached, TrackPlayer]
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
    isNativeQueueSyncedRef,
    desiredPlayStateRef,
    currentSongRef,
  });

  const autoplaySongIdsRef = useRef<string[]>([]);
  const autoplayInFlightRef = useRef(false);
  const lastAutoplaySeedIdRef = useRef<string | null>(null);

  const triggerAutoplayAppend = useCallback(
    async (seedSong: Song, currentQueue: Song[]): Promise<Song[]> => {
      if (!seedSong?.id || autoplayInFlightRef.current) return [];
      if (lastAutoplaySeedIdRef.current === seedSong.id) return [];
      autoplayInFlightRef.current = true;
      const sourceQueue = originalQueueRef.current;
      const scope = getAccountScope();
      try {
        const settings = await getSettings();
        if (!settings.smartAutoplayEnabled) return [];

        lastAutoplaySeedIdRef.current = seedSong.id;
        updatePlaybackEngineSnapshot({ isAutoplayLoading: true });

        const recommendations = await fetchAutoplayRecommendations({
          seedSong,
          currentQueue,
          mode: settings.smartAutoplayMode,
          limit: 12,
        });

        if (!isCurrentAccount(scope) || sourceQueue !== originalQueueRef.current) return [];
        const existingIds = new Set(queueRef.current.map((song) => song.id));
        const additions = recommendations.filter((song) => {
          if (existingIds.has(song.id)) return false;
          existingIds.add(song.id);
          return true;
        });
        if (additions.length === 0) return [];

        const currentActiveQueue = queueRef.current;
        const currentActiveSource = originalQueueRef.current;
        const nextQueue = [...currentActiveQueue, ...additions];
        const nextSourceQueue = [...currentActiveSource, ...additions];
        const newAutoplayIds = [
          ...autoplaySongIdsRef.current,
          ...additions.map((s) => s.id),
        ];

        autoplaySongIdsRef.current = newAutoplayIds;
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        originalQueueRef.current = nextSourceQueue;
        setSourceQueue(nextSourceQueue);
        const wasNativeQueueSynced = isNativeQueueSyncedRef.current;
        isNativeQueueSyncedRef.current = false;

        updatePlaybackEngineSnapshot({
          queue: nextQueue,
          sourceQueue: nextSourceQueue,
          autoplaySongIds: newAutoplayIds,
        });

        if (TrackPlayer && isPlayerReady && wasNativeQueueSynced) {
          void Promise.all(additions.map(async (song) =>
                isYouTubeSong(song) ? songToTrack(song) : songToTrack(song, await resolvePlaybackUrlCached(song), streamUrlCache.current)
              )).then((tracks) => enqueueNativeQueueMutation(async () => {
              if (!isCurrentAccount(scope) || queueRef.current !== nextQueue) return;
              if (tracks.some((track) => track.source !== "youtube" && !track.url)) return;
              const nativeQueue = await TrackPlayer.getQueue();
              if (!isCurrentAccount(scope) || queueRef.current !== nextQueue || !nativeQueueIdsMatch(nativeQueue, currentActiveQueue)) return;
              await TrackPlayer.add(tracks);
              if (queueRef.current === nextQueue) isNativeQueueSyncedRef.current = true;
          })).catch((error) => logger.warn("[Autoplay] Native queue append failed", error));
        }

        return additions;
      } catch (err) {
        logger.error("[Autoplay] Error appending recommendations:", err);
        return [];
      } finally {
        autoplayInFlightRef.current = false;
        updatePlaybackEngineSnapshot({ isAutoplayLoading: false });
      }
    },
    [
      TrackPlayer,
      enqueueNativeQueueMutation,
      isPlayerReady,
      nativeQueueIdsMatch,
      originalQueueRef,
      queueRef,
      resolvePlaybackUrlCached,
      setQueue,
      setSourceQueue,
      streamUrlCache,
    ]
  );

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
    pendingPlayRequestRef,
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
    isNativeQueueSyncedRef,
    autoplaySongIdsRef,
    lastAutoplaySeedIdRef,
    triggerAutoplayAppend,
  };
}
