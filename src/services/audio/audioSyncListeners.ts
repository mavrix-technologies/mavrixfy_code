import { getSettings } from "@/lib/storage";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { isYouTubeSong, peekYouTubeStream, rejectYouTubeStream } from "@/services/youtube/YouTubeMusic";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { updatePlaybackProgress } from "@/services/audio/playbackProgressStore";
import type { SeekOverride } from "@/services/audio/audioProgressTracking";
import type { PendingPlayRequest } from "@/services/audio/usePlayerCoreState";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import type { SleepTimerState, PlaybackQualityState } from "@/types/playbackTypes";
import { toDurationSeconds } from "@/utils/timeFormatters";
import { useEffect,type MutableRefObject } from "react";
import { AppState } from "react-native";
import type { NativePlaybackPlayer, State as AudioState, Event as AudioEvent } from "./NativePlaybackPlayer";

interface UseAudioSyncListenersOptions {
  setPlaybackQuality?: (update: (previous: PlaybackQualityState) => PlaybackQualityState) => void;
  isPlayerReady: boolean;
  TrackPlayer: NativePlaybackPlayer | null;
  Event: typeof AudioEvent;
  State: typeof AudioState;
  subscribeTrackPlayerEvent: (eventName: unknown, listener: (...args: any[]) => void) => () => void;
  currentSong: Song | null;
  currentSongRef: MutableRefObject<Song | null>;
  setCurrentSong: (song: Song | null) => void;
  queueRef: MutableRefObject<Song[]>;
  queueIndex: number;
  queueIndexRef: MutableRefObject<number>;
  setQueueIndex: (index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  isPlayingRef: MutableRefObject<boolean>;
  setPlaybackLoading: (loading: boolean) => void;
  playbackLoadingRef: MutableRefObject<boolean>;
  desiredPlayStateRef: MutableRefObject<boolean | null>;
  pendingPlayRequestRef: MutableRefObject<PendingPlayRequest | null>;
  playRequestIdRef?: MutableRefObject<number>;
  positionSecondsRef: MutableRefObject<number>;
  setNativePosition: (pos: number) => void;
  setNativeDuration: (value: number | ((previous: number) => number), source?: "media" | "catalog") => void;
  setSeekOverride: (override: SeekOverride) => void;
  prefetchAdjacentTrackStreams: (queue: Song[], index: number) => void;
  sleepTimerRef: MutableRefObject<SleepTimerState | null>;
  clearSleepTimer: () => void;
  showPlaybackNotice: (msg: string) => void;
  playSongRef: MutableRefObject<(song: Song, queue?: Song[], startPositionSeconds?: number) => Promise<void> | void>;
  nextSongRef: MutableRefObject<() => void>;
  prevSongRef: MutableRefObject<() => void>;
  isNativeQueueSyncedRef?: MutableRefObject<boolean>;
  triggerAutoplayAppend?: (seedSong: Song, currentQueue: Song[]) => Promise<Song[]>;
  repeatMode?: "off" | "all" | "one";
  repeatModeRef?: MutableRefObject<"off" | "all" | "one">;
}

export function useAudioSyncListeners({
  setPlaybackQuality,
  isPlayerReady,
  TrackPlayer,
  Event,
  State,
  subscribeTrackPlayerEvent,
  currentSong,
  currentSongRef,
  setCurrentSong,
  queueRef,
  queueIndex,
  queueIndexRef,
  setQueueIndex,
  setIsPlaying,
  isPlayingRef,
  setPlaybackLoading,
  playbackLoadingRef,
  desiredPlayStateRef,
  pendingPlayRequestRef,
  playRequestIdRef,
  positionSecondsRef,
  setNativePosition,
  setNativeDuration,
  setSeekOverride,
  prefetchAdjacentTrackStreams,
  sleepTimerRef,
  clearSleepTimer,
  showPlaybackNotice,
  playSongRef,
  nextSongRef,
  prevSongRef,
  isNativeQueueSyncedRef,
  triggerAutoplayAppend,
  repeatMode,
  repeatModeRef,
}: UseAudioSyncListenersOptions) {
  // TrackPlayer native event handlers
  useEffect(() => {
    if (!isPlayerReady || !TrackPlayer) return;

    const pauseIntent = () => {
      desiredPlayStateRef.current = false;
      setIsPlaying(false);
      isPlayingRef.current = false;
      updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
    };
    const playIntent = () => {
      desiredPlayStateRef.current = true;
      setIsPlaying(true);
      isPlayingRef.current = true;
      updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
    };
    const reconcileActiveTrack = (event: any) => {
        const currentQ = queueRef.current;
        if (event?.externalSelection && playRequestIdRef) {
          playRequestIdRef.current += 1;
          pendingPlayRequestRef.current = null;
          playbackLoadingRef.current = false;
          setPlaybackLoading(false);
        }

        // 1. Identify track by ID if available from native event
        const activeTrackId =
          typeof event?.track?.id === "string"
            ? event?.track?.id
            : typeof event?.track === "string"
            ? event?.track
            : null;

        const pending = pendingPlayRequestRef.current;
        // A matching native selection confirms the requested source. Ignore
        // outgoing selections, without dropping the new track's only event.
        if (pending && activeTrackId !== pending.songId) return;
        if (pending) pendingPlayRequestRef.current = null;

        const activeSong = currentQ.find((song) => song.id === activeTrackId);
        const localTrack = /^(?:file|content):\/\//i.test(event?.track?.url || "");
        const youtubeStream = !localTrack && activeSong && isYouTubeSong(activeSong) ? peekYouTubeStream(activeSong) : undefined;
        if (youtubeStream) {
          const bitrate = Number.isFinite(youtubeStream.bitrate) && youtubeStream.bitrate > 0 ? Math.round(youtubeStream.bitrate / 1000) : 0;
          setPlaybackQuality?.((previous) => ({ ...previous, actualBitrate: bitrate, codec: youtubeStream.codec,
            qualityLabel: `${bitrate > 0 ? `${bitrate}kbps` : "Original audio"}${youtubeStream.codec ? ` · ${youtubeStream.codec}` : ""}`, isFallback: false }));
        }

        const nextIndex =
          typeof event?.index === "number"
            ? event.index
            : typeof event?.nextTrack === "number"
            ? event.nextTrack
            : -1;

        let targetSong: Song | undefined;
        let resolvedIndex = -1;

        // A synchronized native index identifies the playing occurrence even
        // when the queue contains the same song more than once.
        if (isNativeQueueSyncedRef?.current && nextIndex >= 0 && nextIndex < currentQ.length &&
          (!activeTrackId || String(currentQ[nextIndex].id) === String(activeTrackId))) {
          targetSong = currentQ[nextIndex];
          resolvedIndex = nextIndex;
        }

        if (!targetSong && activeTrackId) {
          const requestedIndex = queueIndexRef.current;
          const foundIndex = currentQ[requestedIndex]?.id === activeTrackId ? requestedIndex
            : currentQ.findIndex((s) => String(s.id) === String(activeTrackId));
          if (foundIndex >= 0) {
            targetSong = currentQ[foundIndex];
            resolvedIndex = foundIndex;
          }
        }

        // Only fall back to index if the native queue is confirmed 1:1 synchronized
        if (!targetSong && !activeTrackId && isNativeQueueSyncedRef?.current && nextIndex >= 0 && nextIndex < currentQ.length) {
          targetSong = currentQ[nextIndex];
          resolvedIndex = nextIndex;
        }

        // If native queue is unsynced and no track ID matched, DO NOT blind-revert to queue[0]!
        if (!targetSong) return;

        if (String(targetSong.id) !== String(currentSongRef.current?.id) || resolvedIndex !== queueIndexRef.current) {
          currentSongRef.current = targetSong;
          setCurrentSong(targetSong);
          if (resolvedIndex >= 0) {
            setQueueIndex(resolvedIndex);
            queueIndexRef.current = resolvedIndex;
          }
          setSeekOverride(null);
          setNativePosition(0);
          positionSecondsRef.current = 0;
          const initialDuration = toDurationSeconds(event?.track?.duration || targetSong.duration);
          setNativeDuration(initialDuration > 0 ? initialDuration : 0, "catalog");

          // The native player already selected this source. Reconcile metadata
          // without reloading it or overriding a user's pause/resume intent.
          updatePlaybackEngineSnapshot({
            currentSong: targetSong,
            ...(resolvedIndex >= 0 ? { queueIndex: resolvedIndex } : {}),
          });

          if (resolvedIndex >= 0) {
            prefetchAdjacentTrackStreams(currentQ, resolvedIndex);
            if (triggerAutoplayAppend && resolvedIndex >= currentQ.length - 2) {
              void triggerAutoplayAppend(targetSong, currentQ);
            }
          }
        }
    };

    const unsubs = [
      subscribeTrackPlayerEvent(Event.RemotePlay, () => {
        playIntent();
        if (playbackLoadingRef.current) return;
        void TrackPlayer.getActiveTrack().then((track: any) => {
          if (desiredPlayStateRef.current !== true || playbackLoadingRef.current) return;
          // Native already executed the transport command. Only resolve a
          // restored selection that has no matching native source.
          if (track?.id === currentSongRef.current?.id) return;
          const song = currentSongRef.current;
          if (song) return playSongRef.current(song, queueRef.current, positionSecondsRef.current);
        }).catch((error: unknown) => logger.warn("[Audio] Remote play failed", error));
      }),
      subscribeTrackPlayerEvent(Event.RemotePause, () => {
        pauseIntent();
      }),
      subscribeTrackPlayerEvent(Event.RemoteStop, () => {
        pauseIntent();
      }),
      subscribeTrackPlayerEvent(Event.RemoteNext, () => void nextSongRef.current()),
      subscribeTrackPlayerEvent(Event.RemotePrevious, () => void prevSongRef.current()),
      subscribeTrackPlayerEvent(Event.PlaybackInterruption, (event: { resumed: boolean }) => {
        if (event.resumed) {
          if (desiredPlayStateRef.current === false) return;
          playIntent();
        } else {
          // A transient system interruption pauses output temporarily.
          // Do not overwrite user play intent (desiredPlayState) so that
          // playback can automatically resume when the interruption ends.
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ isPlaying: false });
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackState, (event: any) => {
        const pending = pendingPlayRequestRef.current;
        if (pending && event?.trackId && event.trackId !== pending.songId) return;
        const nextState = event && typeof event === "object" && "state" in event ? event.state : event;

        switch (nextState) {
          case State.Playing:
            if (desiredPlayStateRef.current === false) {
              void TrackPlayer?.pause?.().catch(() => {});
              break;
            }
            playbackLoadingRef.current = false;
            setPlaybackLoading(false);
            pendingPlayRequestRef.current = null;
            desiredPlayStateRef.current = true;
            setIsPlaying(true);
            isPlayingRef.current = true;
            updatePlaybackEngineSnapshot({ isPlaying: true, isLoading: false, isBuffering: false });
            prefetchAdjacentTrackStreams(queueRef.current, queueIndexRef.current);
            break;

          case State.Paused:
          case State.Stopped:
            // Keep the intended play state through a native source change.
            if (!playbackLoadingRef.current && desiredPlayStateRef.current !== true && !pendingPlayRequestRef.current) {
              setIsPlaying(false);
              isPlayingRef.current = false;
              setPlaybackLoading(false);
              updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });
            }
            break;

          case State.Buffering:
          case State.Loading:
            updatePlaybackEngineSnapshot({ isBuffering: true });
            break;
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackPlayWhenReadyChanged, (event: any) => {
        if (typeof event?.playWhenReady !== "boolean") return;
        // Output stops during a system interruption without cancelling the
        // user's Play intent. The native interruption handler owns its resume.
        if (!event.playWhenReady && (event.reason === "interruption" || event.reason === "source-change")) return;
        // A native queue replacement may emit a stale resume after the user
        // has paused. The explicit user intent must always win that race.
        if (desiredPlayStateRef.current === false) {
          if (event.playWhenReady) {
            void TrackPlayer?.pause?.().catch(() => {});
          }
          return;
        }
        // Queue replacement can reset native intent before our play command.
        if (playbackLoadingRef.current || pendingPlayRequestRef.current) return;
        desiredPlayStateRef.current = event.playWhenReady;

        if (event.playWhenReady) {
          setIsPlaying(true);
          isPlayingRef.current = true;
          updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
          return;
        }

        pendingPlayRequestRef.current = null;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false });
      }),
      subscribeTrackPlayerEvent(Event.PlaybackError, (error: any) => {
        const failedSong = currentSongRef.current;
        const isSameTrack = !error?.trackId || !failedSong?.id ||
          failedSong.id === error.trackId ||
          failedSong.id.replace(/^youtube_/, "") === String(error.trackId).replace(/^youtube_/, "");
        if (!isSameTrack) return;
        if (failedSong && peekYouTubeStream(failedSong, undefined, true)?.clientProfile === "JIOSAAVN") {
          // Startup is owned by the awaited Play command; subsequent errors
          // fall back once to YouTube at the same playback position.
          if (pendingPlayRequestRef.current) return;
          if (desiredPlayStateRef.current !== false) {
            rejectYouTubeStream(failedSong);
            void playSongRef.current(failedSong, queueRef.current, Math.max(0, positionSecondsRef.current));
            return;
          }
        }
        // The native source owns reconnects. A terminal error must not trigger
        // a second retry loop that competes with its queue/selection generation.
        logger.error("[Player] PlaybackError event", error);
        const errorMsg = error?.message || error?.code || "Playback failed";
        pendingPlayRequestRef.current = null;
        desiredPlayStateRef.current = false;
        setIsPlaying(false);
        isPlayingRef.current = false;
        playbackLoadingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false, error: String(errorMsg) });
        showPlaybackNotice(`Playback error: ${errorMsg}`);
      }),
      subscribeTrackPlayerEvent(Event.PlaybackProgressUpdated, (event: any) => {
        const trackId = typeof event?.trackId === "string" ? event.trackId : event?.track?.id;
        if (trackId) {
          if (pendingPlayRequestRef.current && trackId !== pendingPlayRequestRef.current.songId) return;
          if (trackId !== currentSongRef.current?.id ||
            (isNativeQueueSyncedRef?.current && typeof event.track === "number" && event.track !== queueIndexRef.current)) {
            const requestId = playRequestIdRef?.current;
            const selectedSong = currentSongRef.current;
            const selectedIndex = queueIndexRef.current;
            const scope = getAccountScope();
            // Confirm against one current native snapshot: a delayed outgoing
            // tick must not undo a newer selection or overwrite its timeline.
            void TrackPlayer.getPlaybackSnapshot().then(state => {
              if (!isCurrentAccount(scope) || requestId !== playRequestIdRef?.current ||
                selectedSong !== currentSongRef.current || selectedIndex !== queueIndexRef.current) return;
              const track = state.queue[state.index];
              if (track?.id !== trackId || (pendingPlayRequestRef.current && trackId !== pendingPlayRequestRef.current.songId)) return;
              reconcileActiveTrack({ index: state.index, track });
              if (currentSongRef.current?.id !== trackId) return;
              if (state.duration > 0) setNativeDuration(state.duration);
              setNativePosition(state.position);
              updatePlaybackProgress({ bufferedPositionMillis: Math.max(0, state.buffered ?? 0) * 1000 });
            }).catch(error => logger.warn("[Audio] Progress reconciliation failed", error));
            return;
          }
          if (trackId !== currentSongRef.current?.id) return;
        }
        // Older native binaries cannot identify a pending source's progress.
        if (!trackId && pendingPlayRequestRef.current) return;
        if (
          isNativeQueueSyncedRef?.current &&
          typeof event?.track === "number" &&
          event.track !== queueIndexRef.current
        ) {
          return;
        }

        const pos = typeof event?.position === "number" ? event.position : 0;
        if (pos > 0) {
          if (playbackLoadingRef.current) {
            playbackLoadingRef.current = false;
            setPlaybackLoading(false);
            updatePlaybackEngineSnapshot({ isLoading: false });
          }
          if (pendingPlayRequestRef.current) {
            pendingPlayRequestRef.current = null;
          }
        }

        const nativeDuration = typeof event?.duration === "number" && event.duration > 0
          ? event.duration
          : 0;

        if (nativeDuration > 0) {
          const dur = nativeDuration;
          setNativeDuration((prev) => (Math.abs(prev - dur) > 0.5 ? dur : prev));
        }
        // Install this source's duration before clamping its position.
        setNativePosition(pos);
        updatePlaybackProgress({ bufferedPositionMillis: typeof event.buffered === "number" && Number.isFinite(event.buffered)
          ? Math.max(0, event.buffered) * 1000 : 0 });

      }),
      subscribeTrackPlayerEvent(Event.PlaybackActiveTrackChanged, reconcileActiveTrack),
      subscribeTrackPlayerEvent(Event.PlaybackQueueEnded, async (event?: { reason?: string; trackId?: string; index?: number }) => {
        const wantsPlayback = () => desiredPlayStateRef.current !== false;
        if (!wantsPlayback() || playbackLoadingRef.current || pendingPlayRequestRef.current) return;
        if (event?.trackId && (event.trackId !== currentSongRef.current?.id ||
          (isNativeQueueSyncedRef?.current && typeof event.index === "number" && event.index !== queueIndexRef.current))) return;
        if (event?.reason === "unresolved-next") {
          const next = queueRef.current[queueIndexRef.current + 1] ||
            ((repeatModeRef?.current || repeatMode) === "all" ? queueRef.current[0] : undefined);
          if (next) void playSongRef.current(next, queueRef.current);
          return;
        }
        const endedSong = currentSongRef.current;
        const isStillEnded = () => currentSongRef.current === endedSong &&
          !playbackLoadingRef.current && !pendingPlayRequestRef.current;
        if (sleepTimerRef.current?.mode === "end-of-stack") {
          clearSleepTimer();
          desiredPlayStateRef.current = false;
          setIsPlaying(false);
          isPlayingRef.current = false;
          playbackLoadingRef.current = false;
          setPlaybackLoading(false);
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false });
          return;
        }

        const effectiveRepeat = repeatModeRef?.current || repeatMode;
        const next = queueRef.current[queueIndexRef.current + 1] ||
          (effectiveRepeat === "all" ? queueRef.current[0] : undefined);
        if (next) {
          void playSongRef.current(next, queueRef.current);
          return;
        }

        try {
          const settings = await getSettings();
          if (!isStillEnded()) return;
          if (settings?.smartAutoplayEnabled && triggerAutoplayAppend) {
            const seed = currentSongRef.current || queueRef.current[queueRef.current.length - 1];
            if (seed) {
              const recs = await triggerAutoplayAppend(seed, queueRef.current);
              if (!isStillEnded() || !wantsPlayback()) return;
              if (recs.length > 0) {
                void playSongRef.current(recs[0], queueRef.current);
                return;
              }
            }
          }
        } catch (err) {
          logger.warn("[Player] Autoplay queue-ended continuation error:", err);
        }

        if (!isStillEnded()) return;
        desiredPlayStateRef.current = false;
        setIsPlaying(false);
        isPlayingRef.current = false;
        playbackLoadingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false });
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub?.());
    };
    // playSong, nextSong, prevSong are accessed via refs (playSongRef/nextSongRef/prevSongRef)
    // to prevent handler reinstall races when function identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerReady, triggerAutoplayAppend, repeatMode]);

  // Save current playback state (event-driven)
  useEffect(() => {
    if (!currentSong) return;
    const scope = getAccountScope();

    const persist = () => {
      if (!isCurrentAccount(scope) || !currentSongRef.current) return;
      playerPersistenceService.savePlayerState({
        currentSong: currentSongRef.current,
        queue: queueRef.current,
        queueIndex: queueIndexRef.current,
        positionSeconds: positionSecondsRef.current,
        updatedAt: Date.now(),
      }).catch(() => {});
    };

    persist();

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") persist();
    });

    return () => {
      sub.remove();
      persist();
    };
  }, [currentSong, queueIndex, queueIndexRef, queueRef, positionSecondsRef, currentSongRef]);

  // Synchronize playback progress and active track when returning to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextState: string) => {
      if (nextState === "active" && TrackPlayer && isPlayerReady) {
        const selectedSong = currentSongRef.current;
        const selectedQueue = queueRef.current;
        if (playbackLoadingRef.current || pendingPlayRequestRef.current) return;
        try {
          const prog = await TrackPlayer.getPlaybackSnapshot();
          const nativeIndex = prog.index;
          const activeTrack = prog.queue[nativeIndex];
          if (currentSongRef.current !== selectedSong || queueRef.current !== selectedQueue ||
            playbackLoadingRef.current || pendingPlayRequestRef.current) return;
          if (!activeTrack?.id) return;
          const synchronizedIndex = isNativeQueueSyncedRef?.current && typeof nativeIndex === "number" && Number.isInteger(nativeIndex) &&
            selectedQueue[nativeIndex]?.id === activeTrack.id ? nativeIndex : -1;
          if (activeTrack.id !== currentSongRef.current?.id ||
            (synchronizedIndex >= 0 && synchronizedIndex !== queueIndexRef.current)) {
            const foundIdx = synchronizedIndex >= 0 ? synchronizedIndex : selectedQueue.findIndex((s: Song) => s.id === activeTrack.id);
            if (foundIdx >= 0) {
              const target = queueRef.current[foundIdx];
              currentSongRef.current = target;
              setCurrentSong(target);
              setQueueIndex(foundIdx);
              queueIndexRef.current = foundIdx;
              updatePlaybackEngineSnapshot({ currentSong: target, queueIndex: foundIdx });
            } else {
              return;
            }
          }
          if (prog) {
            if (typeof prog.duration === "number" && prog.duration > 0) {
              setNativeDuration(prog.duration);
            }
            if (typeof prog.position === "number") {
              setNativePosition(prog.position);
              updatePlaybackProgress({ bufferedPositionMillis: Math.max(0, prog.buffered ?? 0) * 1000 });
            }
          }
        } catch {
          // ignore non-fatal sync errors
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [isPlayerReady, TrackPlayer, currentSongRef, isNativeQueueSyncedRef, pendingPlayRequestRef, playbackLoadingRef, queueIndexRef, queueRef, setCurrentSong, setNativeDuration, setNativePosition, setQueueIndex]);

}
