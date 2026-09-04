import { useCallback, useEffect, type MutableRefObject } from "react";
import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { songToTrack, withResolvedPlaybackUrl } from "@/services/audio/PlayerPlaybackResolver";
import { toDurationSeconds } from "@/utils/timeFormatters";
import { isSameQueueContent } from "@/services/audio/audioNativeQueueLane";

interface UseAudioPlaybackCommandsOptions {
  currentSongRef: MutableRefObject<Song | null>;
  setCurrentSong: (song: Song | null) => void;
  queueRef: MutableRefObject<Song[]>;
  setQueue: (songs: Song[]) => void;
  originalQueueRef: MutableRefObject<Song[]>;
  setSourceQueue: (songs: Song[]) => void;
  queueIndexRef: MutableRefObject<number>;
  setQueueIndex: (index: number) => void;
  userQueuedSongIdsRef: MutableRefObject<string[]>;
  setUserQueuedSongIds: React.Dispatch<React.SetStateAction<string[]>>;
  isShuffledRef: MutableRefObject<boolean>;
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  isPlayingRef: MutableRefObject<boolean>;
  setIsPlaying: (playing: boolean) => void;
  playbackLoadingRef: MutableRefObject<boolean>;
  setPlaybackLoading: (loading: boolean) => void;
  desiredPlayStateRef: MutableRefObject<boolean | null>;
  playRequestIdRef: MutableRefObject<number>;
  positionSecondsRef: MutableRefObject<number>;
  setSeekOverride: (override: any) => void;
  setNativePosition: (pos: number) => void;
  resolvedDuration: number;
  streamUrlCache: MutableRefObject<Map<string, string>>;
  resolvePlaybackUrlCached: (song: Song) => Promise<string | null>;
  prefetchAdjacentTrackStreams: (queue: Song[], index: number) => void;
  enqueueNativeQueueMutation: <T>(op: () => Promise<T>) => Promise<T>;
  TrackPlayer: any;
  isPlayerReady: boolean;
  ensurePlayerReady: () => Promise<boolean>;
  State: any;
  canUseLightweightAudioFallback: boolean;
  showPlaybackNotice: (msg: string) => void;
  playSongRef: MutableRefObject<(song: Song, queue?: Song[]) => Promise<void> | void>;
  togglePlayRef: MutableRefObject<() => Promise<void> | void>;
  togglePlayInFlightRef: MutableRefObject<boolean>;
  nextSongRef: MutableRefObject<() => void>;
  prevSongRef: MutableRefObject<() => void>;
  seekToRef: MutableRefObject<(progress: number) => Promise<void> | void>;
}

export function useAudioPlaybackCommands({
  currentSongRef,
  setCurrentSong,
  queueRef,
  setQueue,
  originalQueueRef,
  setSourceQueue,
  queueIndexRef,
  setQueueIndex,
  userQueuedSongIdsRef,
  setUserQueuedSongIds,
  isShuffledRef,
  repeatModeRef,
  isPlayingRef,
  setIsPlaying,
  playbackLoadingRef,
  setPlaybackLoading,
  desiredPlayStateRef,
  playRequestIdRef,
  positionSecondsRef,
  setSeekOverride,
  setNativePosition,
  resolvedDuration,
  streamUrlCache,
  resolvePlaybackUrlCached,
  prefetchAdjacentTrackStreams,
  enqueueNativeQueueMutation,
  TrackPlayer,
  isPlayerReady,
  ensurePlayerReady,
  State,
  canUseLightweightAudioFallback,
  showPlaybackNotice,
  playSongRef,
  togglePlayRef,
  togglePlayInFlightRef,
  nextSongRef,
  prevSongRef,
  seekToRef,
}: UseAudioPlaybackCommandsOptions) {
  const playSong = useCallback(
    async (song: Song, requestedQueue?: Song[]) => {
      if (!song?.id) return;
      const reqId = ++playRequestIdRef.current;

      const hasRequestedQueue = Array.isArray(requestedQueue) && requestedQueue.length > 0;
      const songIndexInQueue = hasRequestedQueue
        ? requestedQueue.findIndex((s) => s.id === song.id)
        : queueRef.current.findIndex((s) => s.id === song.id);

      const isNewQueue = hasRequestedQueue
        ? !isSameQueueContent(requestedQueue, queueRef.current)
        : songIndexInQueue < 0;

      const q = hasRequestedQueue
        ? requestedQueue
        : songIndexInQueue >= 0
          ? queueRef.current
          : [song];

      const targetIndex = Math.max(0, q.findIndex((s) => s.id === song.id));
      const targetSong = q[targetIndex] || song;

      setCurrentSong(targetSong);
      currentSongRef.current = targetSong;
      setQueue(q);
      queueRef.current = q;
      if (isNewQueue || !isShuffledRef.current) {
        originalQueueRef.current = q;
        setSourceQueue(q);
      }
      setQueueIndex(targetIndex);
      queueIndexRef.current = targetIndex;

      if (isNewQueue) {
        setUserQueuedSongIds([]);
        userQueuedSongIdsRef.current = [];
      } else {
        const prevIds = userQueuedSongIdsRef.current;
        if (prevIds.includes(targetSong.id)) {
          const next = prevIds.filter((id) => id !== targetSong.id);
          userQueuedSongIdsRef.current = next;
          setUserQueuedSongIds(next);
        }
      }

      desiredPlayStateRef.current = true;
      setPlaybackLoading(true);
      setSeekOverride(null);
      setNativePosition(0);

      updatePlaybackEngineSnapshot({
        currentSong: targetSong,
        queue: q,
        sourceQueue: originalQueueRef.current,
        userQueuedSongIds: isNewQueue ? [] : userQueuedSongIdsRef.current,
        queueIndex: targetIndex,
        desiredPlayState: true,
        isLoading: true,
        isBuffering: false,
      });

      setTimeout(() => {
        playerPersistenceService.addRecentlyPlayed(targetSong).catch(() => {});
        playerPersistenceService.savePlayerState({
          currentSong: targetSong,
          queue: q,
          queueIndex: targetIndex,
          positionSeconds: 0,
          updatedAt: Date.now(),
        }).catch(() => {});
      }, 150);

      try {
        const audioUrl = await resolvePlaybackUrlCached(targetSong);
        if (reqId !== playRequestIdRef.current) return;

        if (!audioUrl) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: null, isPlaying: false, isLoading: false, isBuffering: false });
          showPlaybackNotice("Could not resolve playback URL.");
          return;
        }

        const resolvedSong = withResolvedPlaybackUrl(targetSong, audioUrl);
        currentSongRef.current = resolvedSong;
        setCurrentSong(resolvedSong);

        if (TrackPlayer) {
          const ready = isPlayerReady || (await ensurePlayerReady());
          if (reqId !== playRequestIdRef.current) return;
          if (!ready) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            showPlaybackNotice("Audio player initialization failed.");
            return;
          }

          await enqueueNativeQueueMutation(async () => {
            if (reqId !== playRequestIdRef.current) return;

            const currentNativeQueue = await TrackPlayer!.getQueue().catch(() => []);
            const isQueueSynced =
              !isNewQueue &&
              Array.isArray(currentNativeQueue) &&
              currentNativeQueue.length === q.length &&
              currentNativeQueue.every((t: any, idx: number) => {
                const item = q[idx];
                if (!item || t?.id !== item.id) return false;
                if (idx === targetIndex && audioUrl && t?.url !== audioUrl) return false;
                const expectedDur = toDurationSeconds(item.duration);
                if (expectedDur > 0 && Math.abs((t?.duration || 0) - expectedDur) > 1) return false;
                return true;
              });

            if (!isQueueSynced) {
              const nativeTracks = q.map((s, idx) =>
                songToTrack(s, idx === targetIndex ? audioUrl : null, streamUrlCache.current)
              );

              try {
                if (typeof TrackPlayer!.setQueue === "function") {
                  await TrackPlayer!.setQueue(nativeTracks);
                } else {
                  await TrackPlayer!.add(nativeTracks);
                }
              } catch (queueErr) {
                logger.error("[Player] Native queue synchronization failed:", queueErr);
              }
            }

            if (reqId !== playRequestIdRef.current) return;
            await TrackPlayer!.skip(targetIndex)
              .catch(() => {})
              .then(() => {
                if (reqId === playRequestIdRef.current) {
                  return TrackPlayer!.play();
                }
              });
          });

          if (reqId !== playRequestIdRef.current) return;
          prefetchAdjacentTrackStreams(q, targetIndex);
        } else if (canUseLightweightAudioFallback) {
          if (reqId !== playRequestIdRef.current) return;
          await ExpoAvPlayer.loadAndPlay(audioUrl);
        }
      } catch (error) {
        if (reqId !== playRequestIdRef.current) return;
        logger.error("[Player] playSong failed", error);
        desiredPlayStateRef.current = false;
        setIsPlaying(false);
        isPlayingRef.current = false;
        updatePlaybackEngineSnapshot({ desiredPlayState: null, isPlaying: false, isLoading: false, isBuffering: false });
        showPlaybackNotice("Could not start playback.");
      } finally {
        setPlaybackLoading(false);
        if (reqId === playRequestIdRef.current) {
          updatePlaybackEngineSnapshot({ isLoading: false, isBuffering: false });
        }
      }
    },
    [
      currentSongRef,
      enqueueNativeQueueMutation,
      ensurePlayerReady,
      isPlayerReady,
      isPlayingRef,
      isShuffledRef,
      originalQueueRef,
      playRequestIdRef,
      prefetchAdjacentTrackStreams,
      queueIndexRef,
      queueRef,
      resolvePlaybackUrlCached,
      setCurrentSong,
      setIsPlaying,
      setNativePosition,
      setPlaybackLoading,
      setQueue,
      setQueueIndex,
      setSeekOverride,
      setSourceQueue,
      setUserQueuedSongIds,
      showPlaybackNotice,
      streamUrlCache,
      TrackPlayer,
      userQueuedSongIdsRef,
      desiredPlayStateRef,
      canUseLightweightAudioFallback,
    ]
  );

  useEffect(() => {
    playSongRef.current = playSong;
  }, [playSong, playSongRef]);

  const togglePlay = useCallback(async () => {
    if (togglePlayInFlightRef.current) return;
    togglePlayInFlightRef.current = true;

    const nextPlayState = !isPlayingRef.current;
    desiredPlayStateRef.current = nextPlayState;

    if (!nextPlayState) {
      playRequestIdRef.current += 1;
    }

    if (!currentSongRef.current) {
      if (queueRef.current.length > 0) {
        const target = queueRef.current[queueIndexRef.current] || queueRef.current[0];
        if (target) {
          void playSong(target, queueRef.current);
        }
      }
      togglePlayInFlightRef.current = false;
      return;
    }

    try {
      if (TrackPlayer) {
        if (nextPlayState) {
          const ready = isPlayerReady || (await ensurePlayerReady());
          const activeTrack = ready ? await TrackPlayer.getActiveTrack().catch(() => null) : null;
          const playbackState = ready ? await TrackPlayer.getPlaybackState().catch(() => null) : null;
          const rawState = (playbackState as any)?.state ?? playbackState;

          const isPlayerLoaded = Boolean(
            activeTrack?.id &&
            (rawState === State.Playing ||
              rawState === State.Paused ||
              rawState === State.Ready ||
              rawState === State.Buffering ||
              rawState === State.Loading)
          );

          if (!isPlayerLoaded) {
            void playSong(currentSongRef.current, queueRef.current);
            return;
          }

          updatePlaybackEngineSnapshot({ desiredPlayState: true });
          await TrackPlayer.play();
        } else {
          updatePlaybackEngineSnapshot({ desiredPlayState: false });
          await TrackPlayer.pause();
        }
      } else if (canUseLightweightAudioFallback) {
        if (nextPlayState) {
          void playSong(currentSongRef.current, queueRef.current);
        } else {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
          try { ExpoAvPlayer.pause(); } catch {}
        }
      }
    } catch (error) {
      logger.error("[Player] togglePlay failed", error);
      if (nextPlayState && currentSongRef.current) {
        void playSong(currentSongRef.current, queueRef.current);
      }
    } finally {
      togglePlayInFlightRef.current = false;
    }
  }, [
    canUseLightweightAudioFallback,
    currentSongRef,
    desiredPlayStateRef,
    ensurePlayerReady,
    isPlayerReady,
    isPlayingRef,
    playRequestIdRef,
    playSong,
    queueIndexRef,
    queueRef,
    setIsPlaying,
    State,
    togglePlayInFlightRef,
    TrackPlayer,
  ]);

  useEffect(() => {
    togglePlayRef.current = togglePlay;
  }, [togglePlay, togglePlayRef]);

  const nextSong = useCallback(async () => {
    if (TrackPlayer && isPlayerReady) {
      let skipSucceeded = false;
      await enqueueNativeQueueMutation(async () => {
        try {
          await TrackPlayer!.skipToNext();
          skipSucceeded = true;
        } catch {
          const activeTrack = await TrackPlayer!.getActiveTrack().catch(() => null);
          if (activeTrack?.id && activeTrack.id !== currentSongRef.current?.id) {
            skipSucceeded = true;
          }
        }
      });
      if (skipSucceeded) return;
    }

    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;

    if (repeatModeRef.current === "all" || ci < cq.length - 1) {
      const nextIndex = (ci + 1) % cq.length;
      const targetSong = cq[nextIndex];
      if (targetSong) {
        void playSong(targetSong, cq);
      }
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
      updatePlaybackEngineSnapshot({ isPlaying: false, desiredPlayState: false });
    }
  }, [enqueueNativeQueueMutation, isPlayerReady, playSong, currentSongRef, isPlayingRef, queueIndexRef, queueRef, repeatModeRef, setIsPlaying, TrackPlayer]);

  useEffect(() => {
    nextSongRef.current = nextSong;
  }, [nextSong, nextSongRef]);

  const seekTo = useCallback(
    async (progress: number) => {
      const durationSeconds = resolvedDuration;
      if (durationSeconds <= 0) return;

      const seconds = Math.max(0, Math.min(durationSeconds, progress * durationSeconds));
      setSeekOverride({
        songId: currentSongRef.current?.id || null,
        seconds,
        startedAt: Date.now(),
      });
      setNativePosition(seconds);

      if (TrackPlayer && isPlayerReady) {
        await TrackPlayer.seekTo(seconds).catch(() => {});
      } else if (canUseLightweightAudioFallback) {
        await ExpoAvPlayer.seekTo(seconds);
      }
    },
    [canUseLightweightAudioFallback, currentSongRef, isPlayerReady, resolvedDuration, setNativePosition, setSeekOverride, TrackPlayer]
  );

  useEffect(() => {
    seekToRef.current = seekTo;
  }, [seekTo, seekToRef]);

  const prevSong = useCallback(async () => {
    if (positionSecondsRef.current > 3) {
      void seekTo(0);
      return;
    }

    if (TrackPlayer && isPlayerReady) {
      let skipSucceeded = false;
      await enqueueNativeQueueMutation(async () => {
        try {
          await TrackPlayer!.skipToPrevious();
          skipSucceeded = true;
        } catch {
          const activeTrack = await TrackPlayer!.getActiveTrack().catch(() => null);
          if (activeTrack?.id && activeTrack.id !== currentSongRef.current?.id) {
            skipSucceeded = true;
          }
        }
      });
      if (skipSucceeded) return;
    }

    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;

    const prevIndex = (ci - 1 + cq.length) % cq.length;
    const targetSong = cq[prevIndex];
    if (targetSong) {
      void playSong(targetSong, cq);
    }
  }, [currentSongRef, enqueueNativeQueueMutation, isPlayerReady, playSong, positionSecondsRef, queueIndexRef, queueRef, seekTo, TrackPlayer]);

  useEffect(() => {
    prevSongRef.current = prevSong;
  }, [prevSong, prevSongRef]);

  return {
    playSong,
    togglePlay,
    nextSong,
    prevSong,
    seekTo,
  };
}
