import { useRef, useEffect, useCallback, type MutableRefObject } from "react";
import type { Song } from "@/lib/musicData";
import { toDurationSeconds } from "@/utils/timeFormatters";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import {
  updatePlaybackProgress,
  resetPlaybackProgress,
} from "@/services/audio/playbackProgressStore";

interface UseAudioProgressTrackingOptions {
  currentSong: Song | null;
  currentSongRef: MutableRefObject<Song | null>;
  queueRef: MutableRefObject<Song[]>;
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  isPlayingRef: MutableRefObject<boolean>;
  setIsPlaying: (playing: boolean) => void;
  playbackLoadingRef: MutableRefObject<boolean>;
  desiredPlayStateRef: MutableRefObject<boolean | null>;
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
  canUseLightweightAudioFallback,
  TrackPlayer,
  nextSongRef,
  playSongRef,
}: UseAudioProgressTrackingOptions) {
  const positionSecondsRef = useRef(0);
  const durationSecondsRef = useRef(0);
  const seekOverrideRef = useRef<{
    songId: string | null;
    seconds: number;
    startedAt: number;
  } | null>(null);

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

  const setSeekOverride = useCallback((override: any) => {
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

  // Reset progress when song changes
  useEffect(() => {
    if (currentSong?.id) {
      const initialDur = toDurationSeconds(currentSong.duration);
      durationSecondsRef.current = initialDur;
      positionSecondsRef.current = 0;
      seekOverrideRef.current = null;
      updateProgressStore(0, initialDur);
    } else {
      durationSecondsRef.current = 0;
      positionSecondsRef.current = 0;
      seekOverrideRef.current = null;
      resetPlaybackProgress();
    }
  }, [currentSong?.id, currentSong?.duration, updateProgressStore]);

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
          if (status.isPlaying) {
            desiredPlayStateRef.current = null;
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
  }, [canUseLightweightAudioFallback, currentSongRef, desiredPlayStateRef, isPlayingRef, nextSongRef, playSongRef, playbackLoadingRef, queueRef, repeatModeRef, setIsPlaying, setNativeDuration, setNativePosition]);

  return {
    positionSecondsRef,
    durationSecondsRef,
    setSeekOverride,
    setNativePosition,
    setNativeDuration,
  };
}

