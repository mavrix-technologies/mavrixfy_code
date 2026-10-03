import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import {
resetPlaybackProgress,
updatePlaybackProgress,
} from "@/services/audio/playbackProgressStore";
import type { PendingPlayRequest } from "@/services/audio/usePlayerCoreState";
import { toDurationSeconds } from "@/utils/timeFormatters";
import { useCallback,useEffect,useRef,type MutableRefObject } from "react";

export type SeekOverride = {
  songId: string | null;
  seconds: number;
  startedAt: number;
} | null;

interface UseAudioProgressTrackingOptions {
  currentSong: Song | null;
  currentSongRef: MutableRefObject<Song | null>;
  queueRef: MutableRefObject<Song[]>;
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  isPlayingRef: MutableRefObject<boolean>;
  setIsPlaying: (playing: boolean) => void;
  playbackLoadingRef: MutableRefObject<boolean>;
  desiredPlayStateRef: MutableRefObject<boolean | null>;
  pendingPlayRequestRef: MutableRefObject<PendingPlayRequest | null>;
  canUseLightweightAudioFallback: boolean;
  TrackPlayer: any;
  nextSongRef: MutableRefObject<() => void>;
  playSongRef: MutableRefObject<(song: Song, queue?: Song[]) => Promise<void> | void>;
}

export function useAudioProgressTracking({
  currentSong,
  currentSongRef,
  queueRef,
  repeatModeRef,
  isPlayingRef,
  setIsPlaying,
  playbackLoadingRef,
  desiredPlayStateRef,
  pendingPlayRequestRef,
  canUseLightweightAudioFallback,
  TrackPlayer,
  nextSongRef,
  playSongRef,
}: UseAudioProgressTrackingOptions) {
  const positionSecondsRef = useRef(0);
  const durationSecondsRef = useRef(0);
  const seekOverrideRef = useRef<SeekOverride>(null);

  const updateProgressStore = useCallback((pos: number, dur: number) => {
    positionSecondsRef.current = pos;
    durationSecondsRef.current = dur;
    const progress = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
    updatePlaybackProgress({
      progress,
      duration: Math.round(dur * 1000),
      positionMillis: Math.round(pos * 1000),
    });
  }, []);

  const setSeekOverride = useCallback((override: SeekOverride) => {
    seekOverrideRef.current = override;
    if (override && typeof override.seconds === "number") {
      const songDuration = toDurationSeconds(currentSongRef.current?.duration);
      const dur = durationSecondsRef.current > 0 ? durationSecondsRef.current : songDuration;
      updateProgressStore(override.seconds, dur);
    }
  }, [currentSongRef, updateProgressStore]);

  const setNativePosition = useCallback((pos: number) => {
    let effectivePos = pos;
    const override = seekOverrideRef.current;
    if (override && currentSongRef.current?.id && override.songId === currentSongRef.current.id) {
      const elapsed = (Date.now() - override.startedAt) / 1000;
      if (elapsed < 1.2) {
        effectivePos = override.seconds;
      } else {
        seekOverrideRef.current = null;
      }
    }
    const songDuration = toDurationSeconds(currentSongRef.current?.duration);
    const dur = durationSecondsRef.current > 0 ? durationSecondsRef.current : songDuration;
    updateProgressStore(effectivePos, dur);
  }, [currentSongRef, updateProgressStore]);

  const setNativeDuration = useCallback((durOrFn: number | ((prev: number) => number)) => {
    const dur = typeof durOrFn === "function" ? durOrFn(durationSecondsRef.current) : durOrFn;
    durationSecondsRef.current = dur;
    const songDuration = toDurationSeconds(currentSongRef.current?.duration);
    const effectiveDur = dur > 0 ? dur : songDuration;
    updateProgressStore(positionSecondsRef.current, effectiveDur);
  }, [currentSongRef, updateProgressStore]);

  const progressSongIdRef = useRef<string | null>(null);

  // Duration corrections must not reset the user's position.
  useEffect(() => {
    let active = true;
    const songId = currentSong?.id ?? null;
    if (progressSongIdRef.current === songId) {
      if (currentSong?.duration) setNativeDuration(toDurationSeconds(currentSong.duration));
      return;
    }
    progressSongIdRef.current = songId;
    if (currentSong?.id) {
      const initialDur = toDurationSeconds(currentSong.duration);
      durationSecondsRef.current = initialDur;
      seekOverrideRef.current = null;
      if (positionSecondsRef.current > 0) {
        updateProgressStore(positionSecondsRef.current, initialDur);
      } else {
        void import("@/services/player/playerPersistenceService").then(({ playerPersistenceService }) => {
          void playerPersistenceService.loadPlayerState().then((persisted) => {
            if (!active || progressSongIdRef.current !== songId || positionSecondsRef.current > 0) return;
            if (
              persisted?.currentSong?.id === songId &&
              typeof persisted.positionSeconds === "number" &&
              persisted.positionSeconds > 0
            ) {
              positionSecondsRef.current = persisted.positionSeconds;
              updateProgressStore(persisted.positionSeconds, initialDur);
            } else {
              positionSecondsRef.current = 0;
              updateProgressStore(0, initialDur);
            }
          }).catch((error) => logger.warn("[Audio] Progress restore failed", error));
        }).catch((error) => logger.warn("[Audio] Progress restore unavailable", error));
      }
    } else {
      durationSecondsRef.current = 0;
      positionSecondsRef.current = 0;
      seekOverrideRef.current = null;
      resetPlaybackProgress();
    }
    return () => { active = false; };
  }, [currentSong?.id, currentSong?.duration, setNativeDuration, updateProgressStore]);

  useEffect(() => {
    let mounted = true;
    if (canUseLightweightAudioFallback) {
      ExpoAvPlayer.onStatusUpdate((status) => {
        if (!mounted) return;
        if (typeof status.position === "number") {
          setNativePosition(status.position);
        }
        if (typeof status.duration === "number" && status.duration > 0) {
          setNativeDuration(status.duration);
        }
        if (typeof status.isPlaying === "boolean") {
          if (!status.isPlaying && (playbackLoadingRef.current || desiredPlayStateRef.current === true)) {
            return;
          }
          // expo-av can report one last playing status from the outgoing
          // source after the user has already paused during a track change.
          if (status.isPlaying && desiredPlayStateRef.current === false) {
            return;
          }
          if (status.isPlaying) {
            desiredPlayStateRef.current = null;
            pendingPlayRequestRef.current = null;
          }
          if (status.isPlaying !== isPlayingRef.current) {
            setIsPlaying(status.isPlaying);
            isPlayingRef.current = status.isPlaying;
            updatePlaybackEngineSnapshot({ isPlaying: status.isPlaying, isLoading: false, isBuffering: false });
          }
        }
        if (status.didJustFinish) {
          if (repeatModeRef.current === "one" && currentSongRef.current) {
            void playSongRef.current(currentSongRef.current, queueRef.current);
          } else {
            nextSongRef.current();
          }
        }
      });
      return () => {
        mounted = false;
      };
    }
  }, [canUseLightweightAudioFallback, currentSongRef, desiredPlayStateRef, isPlayingRef, nextSongRef, pendingPlayRequestRef, playSongRef, playbackLoadingRef, queueRef, repeatModeRef, setIsPlaying, setNativeDuration, setNativePosition]);

  return {
    positionSecondsRef,
    durationSecondsRef,
    setSeekOverride,
    setNativePosition,
    setNativeDuration,
  };
}
