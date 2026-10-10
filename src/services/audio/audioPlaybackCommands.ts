import { isYouTubeSong, peekYouTubeStream, youTubePlaybackErrorMessage, youTubePlaybackErrorDetails } from "@/services/youtube/YouTubeMusic";
import { getSettings } from "@/lib/storage";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { resolveAudioUrl,songToTrack,withResolvedPlaybackUrl } from "@/services/audio/PlayerPlaybackResolver";
import { isSameQueueContent } from "@/services/audio/audioNativeQueueLane";
import type { SeekOverride } from "@/services/audio/audioProgressTracking";
import type { PendingPlayRequest } from "@/services/audio/usePlayerCoreState";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import { toDurationSeconds } from "@/utils/timeFormatters";
import { playbackPosition } from "./audioTimeline";
import type { NativePlaybackPlayer, State as AudioState } from "./StandardAudioPlayer";
import { useCallback,useEffect,type MutableRefObject } from "react";

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
  pendingPlayRequestRef: MutableRefObject<PendingPlayRequest | null>;
  positionSecondsRef: MutableRefObject<number>;
  durationSecondsRef?: MutableRefObject<number>;
  isNativeQueueSyncedRef?: MutableRefObject<boolean>;
  setSeekOverride: (override: SeekOverride) => void;
  setNativePosition: (pos: number) => void;
  streamUrlCache: MutableRefObject<Map<string, string>>;
  resolvePlaybackUrlCached: (song: Song) => Promise<string | null>;
  prefetchAdjacentTrackStreams: (queue: Song[], index: number) => void;
  enqueueNativeQueueMutation: (op: () => Promise<void>) => Promise<void>;
  TrackPlayer: NativePlaybackPlayer | null;
  isPlayerReady: boolean;
  ensurePlayerReady: () => Promise<boolean>;
  State: typeof AudioState;
  canUseLightweightAudioFallback: boolean;
  showPlaybackNotice: (msg: string) => void;
  playSongRef: MutableRefObject<(song: Song, queue?: Song[], startPositionSeconds?: number) => Promise<void> | void>;
  togglePlayRef: MutableRefObject<() => Promise<void> | void>;
  nextSongRef: MutableRefObject<() => void>;
  prevSongRef: MutableRefObject<() => void>;
  seekToRef: MutableRefObject<(progress: number) => Promise<void> | void>;
  triggerAutoplayAppend?: (seedSong: Song, currentQueue: Song[]) => Promise<Song[]>;
  autoplaySongIdsRef?: MutableRefObject<string[]>;
  lastAutoplaySeedIdRef?: MutableRefObject<string | null>;
  sleepTimerRef?: MutableRefObject<any>;
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
  pendingPlayRequestRef,
  positionSecondsRef,
  durationSecondsRef,
  isNativeQueueSyncedRef,
  setSeekOverride,
  setNativePosition,
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
  nextSongRef,
  prevSongRef,
  seekToRef,
  triggerAutoplayAppend,
  autoplaySongIdsRef,
  lastAutoplaySeedIdRef,
  sleepTimerRef,
}: UseAudioPlaybackCommandsOptions) {
  const playSong = useCallback(
    async (song: Song, requestedQueue?: Song[], startPositionSeconds?: number) => {
      if (!song?.id) return;
      const scope = getAccountScope();
      const reqId = ++playRequestIdRef.current;
      pendingPlayRequestRef.current = {
        id: reqId,
        songId: song.id,
      };

      const hasRequestedQueue = Array.isArray(requestedQueue) && requestedQueue.length > 0;
      const candidateQueue = hasRequestedQueue ? requestedQueue : queueRef.current;
      const occurrenceIndex = candidateQueue.indexOf(song);
      const songIndexInQueue = occurrenceIndex >= 0 ? occurrenceIndex : candidateQueue.findIndex((s) => s.id === song.id);

      const isNewQueue = hasRequestedQueue
        ? !isSameQueueContent(requestedQueue, queueRef.current)
        : songIndexInQueue < 0;

      const q = hasRequestedQueue
        ? requestedQueue
        : songIndexInQueue >= 0
          ? queueRef.current
          : [song];

      const targetIndex = songIndexInQueue >= 0 ? songIndexInQueue : Math.max(0, q.findIndex((s) => s.id === song.id));
      const targetSong = q[targetIndex] || song;
      const sameSong = currentSongRef.current?.id === targetSong.id;

      // Retire outgoing audio and its callbacks before URL resolution or UI swap.
      // URL prefetch is retained; only the selected track owns audible output.
      if (TrackPlayer?.beginTrackChange) TrackPlayer.beginTrackChange();
      else if (!TrackPlayer && canUseLightweightAudioFallback) ExpoAvPlayer.beginTrackChange();

      // 1. Instant local UI feedback
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
        if (autoplaySongIdsRef) autoplaySongIdsRef.current = [];
        if (lastAutoplaySeedIdRef) lastAutoplaySeedIdRef.current = null;
        if (isNativeQueueSyncedRef) isNativeQueueSyncedRef.current = false;
      } else {
        const prevIds = userQueuedSongIdsRef.current;
        if (prevIds.includes(targetSong.id)) {
          const next = prevIds.filter((id) => id !== targetSong.id);
          userQueuedSongIdsRef.current = next;
          setUserQueuedSongIds(next);
        }
      }

      desiredPlayStateRef.current = true;
      setIsPlaying(true);
      isPlayingRef.current = true;
      playbackLoadingRef.current = true;
      setPlaybackLoading(true);
      setSeekOverride(null);
      if (durationSecondsRef && !sameSong) durationSecondsRef.current = toDurationSeconds(targetSong.duration);
      const initialPos = typeof startPositionSeconds === "number" && startPositionSeconds > 0 ? startPositionSeconds : 0;
      positionSecondsRef.current = initialPos;
      setNativePosition(initialPos);

      updatePlaybackEngineSnapshot({
        currentSong: targetSong,
        queue: q,
        sourceQueue: originalQueueRef.current,
        userQueuedSongIds: isNewQueue ? [] : userQueuedSongIdsRef.current,
        autoplaySongIds: isNewQueue ? [] : (autoplaySongIdsRef?.current || []),
        queueIndex: targetIndex,
        desiredPlayState: true,
        isPlaying: true,
        isLoading: true,
        isBuffering: false,
        error: null,
      });

      // Proactively fetch and append similar songs if queue is near end
      if (triggerAutoplayAppend && (q.length - targetIndex <= 2)) {
        void triggerAutoplayAppend(targetSong, q);
      }

      // 2. Offload persistence completely off the critical tap path
      setTimeout(() => {
        if (reqId !== playRequestIdRef.current || !isCurrentAccount(scope)) return;
        playerPersistenceService.addRecentlyPlayed(targetSong).catch(() => {});
        playerPersistenceService.savePlayerState({
          currentSong: targetSong,
          queue: q,
          queueIndex: targetIndex,
          positionSeconds: Math.max(0, positionSecondsRef.current),
          updatedAt: Date.now(),
        }).catch(() => {});
      }, 800);

      try {
        let resolutionTimer: ReturnType<typeof setTimeout> | undefined;
        const audioUrl = await Promise.race([
          resolvePlaybackUrlCached(targetSong),
          new Promise<null>((resolve) => { resolutionTimer = setTimeout(() => resolve(null), isYouTubeSong(targetSong) ? 27000 : 12000); }),
        ]).finally(() => clearTimeout(resolutionTimer));
        if (reqId !== playRequestIdRef.current || !isCurrentAccount(scope)) return;

        if (!audioUrl) {
          if (pendingPlayRequestRef.current?.id === reqId) {
            pendingPlayRequestRef.current = null;
          }
          desiredPlayStateRef.current = false;
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false,
            error: "Playback stream timed out or unavailable." });
          showPlaybackNotice("Playback stream timed out or unavailable.");
          return;
        }

        const resolvedSong = withResolvedPlaybackUrl(targetSong, audioUrl);
        currentSongRef.current = resolvedSong;
        setCurrentSong(resolvedSong);

        if (TrackPlayer) {
          const ready = isPlayerReady || (await ensurePlayerReady());
          if (reqId !== playRequestIdRef.current) return;
          if (!ready) {
            if (pendingPlayRequestRef.current?.id === reqId) {
              pendingPlayRequestRef.current = null;
            }
            desiredPlayStateRef.current = false;
            setIsPlaying(false);
            isPlayingRef.current = false;
            updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false,
              error: "Audio player initialization failed." });
            showPlaybackNotice("Audio player initialization failed.");
            return;
          }

          await enqueueNativeQueueMutation(async () => {
            if (reqId !== playRequestIdRef.current) return;

            const targetTrack = songToTrack(targetSong, audioUrl, streamUrlCache.current);

            // Fast path: native queue already synchronized -> skip + play directly
            if (!isNewQueue && isNativeQueueSyncedRef?.current) {
              try {
                const nativeQueue = await TrackPlayer!.getQueue();
                if (reqId !== playRequestIdRef.current) return;
                const nativeTrack = nativeQueue[targetIndex];
                // Resolution may replace an expired URL or revoke a managed
                // local file. Only reuse the native item if it still matches.
                if (nativeTrack?.id === targetSong.id && nativeTrack.url === audioUrl) {
                  await TrackPlayer!.skip(targetIndex, initialPos);
                  if (reqId !== playRequestIdRef.current) return;
                  if (desiredPlayStateRef.current === false) await TrackPlayer!.pause();
                  else await TrackPlayer!.play();
                  return;
                }
                if (isNativeQueueSyncedRef) isNativeQueueSyncedRef.current = false;
              } catch {
                if (isNativeQueueSyncedRef) isNativeQueueSyncedRef.current = false;
              }
            }

            // Sync native queue without blocking on bulk URL scrape
            try {
              const nativeTracks = q.map((queueSong, index) => {
                if (index === targetIndex) return targetTrack;
                const cachedUrl = streamUrlCache.current.get(queueSong.id) ||
                  (isYouTubeSong(queueSong) ? '' : resolveAudioUrl(queueSong));
                return songToTrack(queueSong, cachedUrl || null, streamUrlCache.current);
              });

              const hasValidUrl = (t: any) => t?.source === "youtube" || (typeof t?.url === "string" && t.url.length > 5);
              const allTracksValid = nativeTracks.length === q.length && nativeTracks.every(hasValidUrl);

              if (allTracksValid) {
                await TrackPlayer!.setQueue(nativeTracks, targetIndex, initialPos);
                if (isNativeQueueSyncedRef) isNativeQueueSyncedRef.current = true;
              } else {
                await TrackPlayer!.load(targetTrack, initialPos);
                if (isNativeQueueSyncedRef) isNativeQueueSyncedRef.current = false;
              }
            } catch (queueErr) {
              logger.error("[Player] Native track load failed:", queueErr);
              if (reqId !== playRequestIdRef.current || !isCurrentAccount(scope)) return;
              await TrackPlayer!.load(targetTrack, initialPos);
              if (isNativeQueueSyncedRef) isNativeQueueSyncedRef.current = false;
            }

            if (reqId !== playRequestIdRef.current) return;
            if (desiredPlayStateRef.current === false) await TrackPlayer!.pause();
            else {
              await TrackPlayer!.play();
            }
          });

          if (reqId !== playRequestIdRef.current) return;
          prefetchAdjacentTrackStreams(q, targetIndex);
        } else if (canUseLightweightAudioFallback) {
          if (reqId !== playRequestIdRef.current) return;
          await ExpoAvPlayer.loadAndPlay(audioUrl, resolvedSong, () =>
            reqId === playRequestIdRef.current && desiredPlayStateRef.current !== false
          , initialPos);
          if (reqId === playRequestIdRef.current) prefetchAdjacentTrackStreams(q, targetIndex);
        }
      } catch (error) {
        if (reqId !== playRequestIdRef.current) return;
        const nativeStartupTimedOut = error instanceof Error && /^Audio (?:loading|start) timed out\.$/.test(error.message);
        const notice = isYouTubeSong(targetSong) ? youTubePlaybackErrorMessage(error) : "Could not start playback.";
        const upstreamRequiresSignIn = isYouTubeSong(targetSong) && /LOGIN_REQUIRED|SIGN_IN_REQUIRED/.test(youTubePlaybackErrorDetails(error));
        // A missing `playing` event by the startup deadline is not a native
        // decoder error. Keep it quiet for users and log it as a retryable
        // connection delay; explicit errors still get the normal notice.
        if (nativeStartupTimedOut || upstreamRequiresSignIn) {
          logger.warn(upstreamRequiresSignIn ? "[Player] Upstream requires verification for this track" : "[Player] Audio startup is still pending after the native wait window",
            { songId: targetSong.id, reason: upstreamRequiresSignIn ? "sign_in_required" : "startup_timeout",
              ...(upstreamRequiresSignIn ? { cause: youTubePlaybackErrorDetails(error) } : {}) });
        } else {
          // Release logging retains the first string only; include sanitized
          // extraction diagnostics there so physical-device failures are traceable.
          logger.error(isYouTubeSong(targetSong)
            ? `[Player] playSong failed ${JSON.stringify({ songId: targetSong.id, message: notice, cause: youTubePlaybackErrorDetails(error) })}`
            : "[Player] playSong failed", error);
        }
        if (pendingPlayRequestRef.current?.id === reqId) {
          pendingPlayRequestRef.current = null;
        }
        desiredPlayStateRef.current = false;
        setIsPlaying(false);
        isPlayingRef.current = false;
        playbackLoadingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false,
          error: nativeStartupTimedOut ? "Audio playback timed out. Tap Play to retry." : notice });
        if (!nativeStartupTimedOut) showPlaybackNotice(notice);
      } finally {
        if (reqId === playRequestIdRef.current) {
          pendingPlayRequestRef.current = null;
          playbackLoadingRef.current = false;
          setPlaybackLoading(false);
          updatePlaybackEngineSnapshot({ isLoading: false });
        }
      }
    },
    [
      currentSongRef,
      durationSecondsRef,
      positionSecondsRef,
      enqueueNativeQueueMutation,
      ensurePlayerReady,
      isNativeQueueSyncedRef,
      isPlayerReady,
      isPlayingRef,
      isShuffledRef,
      originalQueueRef,
      playRequestIdRef,
      playbackLoadingRef,
      pendingPlayRequestRef,
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
      autoplaySongIdsRef,
      lastAutoplaySeedIdRef,
      triggerAutoplayAppend,
    ]
  );

  useEffect(() => {
    playSongRef.current = playSong;
  }, [playSong, playSongRef]);

  const togglePlay = useCallback(async () => {
    const nextPlayState = !isPlayingRef.current;
    desiredPlayStateRef.current = nextPlayState;
    const requestId = playRequestIdRef.current;
    const selectedSongId = currentSongRef.current?.id;
    const isCurrent = () => requestId === playRequestIdRef.current &&
      selectedSongId === currentSongRef.current?.id && desiredPlayStateRef.current === nextPlayState;

    if (!currentSongRef.current) {
      if (queueRef.current.length > 0) {
        const target = queueRef.current[queueIndexRef.current] || queueRef.current[0];
        if (target) {
          const resumePos = positionSecondsRef.current > 0 ? positionSecondsRef.current : 0;
          void playSong(target, queueRef.current, resumePos);
        }
      }
      return;
    }

    try {
      if (nextPlayState && playbackLoadingRef.current) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
        return;
      }
      // Signed URLs can expire while paused. Keep local downloads independent
      // and reload remote YouTube audio at the exact saved position.
      const activeSong = currentSongRef.current;
      if (nextPlayState && isYouTubeSong(activeSong) &&
        !/^(file|content):\/\/|^\//i.test(activeSong.audioUrl || "") && !peekYouTubeStream(activeSong)) {
        await playSong(activeSong, queueRef.current, Math.max(0, positionSecondsRef.current));
        return;
      }
      if (TrackPlayer) {
        if (nextPlayState) {
          setIsPlaying(true);
          isPlayingRef.current = true;
          updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
          const ready = isPlayerReady || (await ensurePlayerReady());
          if (!isCurrent()) return;
          if (!ready) {
            desiredPlayStateRef.current = false;
            isPlayingRef.current = false;
            setIsPlaying(false);
            updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, error: "Audio player initialization failed." });
            showPlaybackNotice("Audio player initialization failed.");
            return;
          }
          if (ready) {
            const [activeTrack, playbackState] = await Promise.all([
              TrackPlayer.getActiveTrack().catch(() => null),
              TrackPlayer.getPlaybackState().catch(() => null),
            ]);
            if (!isCurrent()) return;
            const rawState = typeof playbackState === "object" ? (playbackState as any)?.state : playbackState;

            const activeId = activeTrack?.id ? String(activeTrack.id) : null;
            const currentId = currentSongRef.current?.id ? String(currentSongRef.current.id) : null;
            const isTrackValid = activeTrack && activeTrack.url && activeId === currentId;

            // If native player has no active track, wrong track, or state is none/stopped/error:
            if (
              !isTrackValid ||
              rawState === State.None ||
              rawState === State.Stopped ||
              rawState === State.Error
            ) {
              const resumePos = positionSecondsRef.current > 0 ? positionSecondsRef.current : 0;
              await playSong(currentSongRef.current, queueRef.current, resumePos);
              return;
            }

            if (rawState === State.Ended) {
              await playSong(currentSongRef.current, queueRef.current, 0);
              return;
            }

            try {
              await enqueueNativeQueueMutation(async () => {
                if (!isCurrent()) return;
                await TrackPlayer.play();
              });
            } catch (playErr) {
              if (!isCurrent()) return;
              logger.warn("[Player] TrackPlayer.play() failed, reloading track via playSong:", playErr);
              const resumePos = positionSecondsRef.current > 0 ? positionSecondsRef.current : 0;
              await playSong(currentSongRef.current, queueRef.current, resumePos);
            }
          }
        } else {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
          await enqueueNativeQueueMutation(async () => {
            if (!isCurrent()) return;
            await TrackPlayer.pause();
          });
        }
      } else if (canUseLightweightAudioFallback) {
        if (nextPlayState) {
          if (ExpoAvPlayer.isEnded()) {
            await playSong(currentSongRef.current, queueRef.current, 0);
          } else if (ExpoAvPlayer.isLoaded()) {
            ExpoAvPlayer.play();
            setIsPlaying(true);
            isPlayingRef.current = true;
            updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
          } else {
            const resumePos = positionSecondsRef.current > 0 ? positionSecondsRef.current : 0;
            void playSong(currentSongRef.current, queueRef.current, resumePos);
          }
        } else {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
          try { ExpoAvPlayer.pause(); } catch {}
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      logger.error("[Player] togglePlay failed", error);
      if (nextPlayState && currentSongRef.current) {
        const resumePos = positionSecondsRef.current > 0 ? positionSecondsRef.current : 0;
        void playSong(currentSongRef.current, queueRef.current, resumePos);
      }
    }
  }, [
    State,
    canUseLightweightAudioFallback,
    currentSongRef,
    desiredPlayStateRef,
    enqueueNativeQueueMutation,
    ensurePlayerReady,
    isPlayerReady,
    isPlayingRef,
    playSong,
    positionSecondsRef,
    playbackLoadingRef,
    queueIndexRef,
    queueRef,
    setIsPlaying,
    playRequestIdRef,
    showPlaybackNotice,
    TrackPlayer,
  ]);

  useEffect(() => {
    togglePlayRef.current = togglePlay;
  }, [togglePlay, togglePlayRef]);

  const nextSong = useCallback(async () => {
    const requestId = playRequestIdRef.current;
    const selectedSong = currentSongRef.current;
    const stillCurrent = () => requestId === playRequestIdRef.current && currentSongRef.current === selectedSong;
    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;

    if (repeatModeRef.current === "all" || ci < cq.length - 1) {
      const nextIndex = (ci + 1) % cq.length;
      const targetSong = cq[nextIndex];
      if (targetSong) {
        await playSong(targetSong, cq);
      }
    } else {
      // Reached end of queue: check smart autoplay before stopping
      try {
        const settings = await getSettings();
        if (!stillCurrent()) return;
        if (
          settings?.smartAutoplayEnabled &&
          sleepTimerRef?.current?.mode !== "end-of-stack" &&
          triggerAutoplayAppend
        ) {
          const seed = cq[ci] || currentSongRef.current;
          if (seed) {
            showPlaybackNotice("Finding similar songs...");
            const recs = await triggerAutoplayAppend(seed, cq);
            if (!stillCurrent() || desiredPlayStateRef.current === false) return;
            if (recs.length > 0) {
              void playSong(recs[0], queueRef.current);
              return;
            }
          }
        }
      } catch (err) {
        logger.warn("[Player] Autoplay nextSong error:", err);
      }

      if (!stillCurrent()) return;
      desiredPlayStateRef.current = false;
      if (TrackPlayer) await TrackPlayer.pause();
      else if (canUseLightweightAudioFallback) ExpoAvPlayer.pause();
      if (!stillCurrent()) return;
      setIsPlaying(false);
      isPlayingRef.current = false;
      updatePlaybackEngineSnapshot({ isPlaying: false, desiredPlayState: false });
    }
  }, [
    TrackPlayer,
    canUseLightweightAudioFallback,
    desiredPlayStateRef,
    currentSongRef,
    isPlayingRef,
    playSong,
    playRequestIdRef,
    queueIndexRef,
    queueRef,
    repeatModeRef,
    setIsPlaying,
    showPlaybackNotice,
    sleepTimerRef,
    triggerAutoplayAppend,
  ]);

  useEffect(() => {
    nextSongRef.current = nextSong;
  }, [nextSong, nextSongRef]);

  const seekTo = useCallback(
    async (progress: number) => {
      if (!Number.isFinite(progress)) return;
      const songId = currentSongRef.current?.id;
      const requestId = playRequestIdRef?.current;
      const isCurrent = () => requestId === playRequestIdRef?.current && currentSongRef.current?.id === songId;
      const native = TrackPlayer && isPlayerReady;
      let engineProgress: { position: number; duration: number } | undefined;
      if (native && typeof TrackPlayer.getProgress === "function") engineProgress = await TrackPlayer.getProgress().catch(() => undefined);
      else if (canUseLightweightAudioFallback) engineProgress = ExpoAvPlayer.getProgress();
      if (!isCurrent()) return;
      const durationSeconds = Number.isFinite(engineProgress?.duration) && engineProgress!.duration > 0
        ? engineProgress!.duration : (durationSecondsRef?.current && durationSecondsRef.current > 0)
        ? durationSecondsRef.current
        : toDurationSeconds(currentSongRef.current?.duration);
      if (durationSeconds <= 0 || (!native && !canUseLightweightAudioFallback)) return;
      if (durationSecondsRef) durationSecondsRef.current = durationSeconds;

      const seconds = playbackPosition(progress * durationSeconds, durationSeconds);
      setSeekOverride({
        songId: currentSongRef.current?.id || null,
        seconds,
        startedAt: Date.now(),
      });
      try {
        if (native) await TrackPlayer.seekTo(seconds);
        else await ExpoAvPlayer.seekTo(seconds);
      } catch {
        if (!isCurrent()) return;
        setSeekOverride(null);
        if (Number.isFinite(engineProgress?.position)) setNativePosition(engineProgress!.position);
        showPlaybackNotice("Could not seek this audio. Please try again.");
      }
    },
    [canUseLightweightAudioFallback, currentSongRef, durationSecondsRef, isPlayerReady, playRequestIdRef, setNativePosition, setSeekOverride, showPlaybackNotice, TrackPlayer]
  );

  useEffect(() => {
    seekToRef.current = seekTo;
  }, [seekTo, seekToRef]);

  const prevSong = useCallback(async () => {
    if (positionSecondsRef.current > 3) {
      void seekTo(0);
      return;
    }

    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;

    if (repeatModeRef.current === "all" || ci > 0) {
      const prevIndex = (ci - 1 + cq.length) % cq.length;
      const targetSong = cq[prevIndex];
      if (targetSong) {
        void playSong(targetSong, cq);
      }
    } else {
      void seekTo(0);
    }
  }, [playSong, positionSecondsRef, queueIndexRef, queueRef, repeatModeRef, seekTo]);

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
