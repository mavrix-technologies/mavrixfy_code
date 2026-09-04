import { useState, useMemo, useRef, useEffect, type MutableRefObject } from "react";
import type { Song } from "@/lib/musicData";
import { toDurationSeconds } from "@/utils/timeFormatters";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";

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
  const [nativePosition, setNativePosition] = useState(0);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [seekOverride, setSeekOverride] = useState<{
    songId: string | null;
    seconds: number;
    startedAt: number;
  } | null>(null);

  const positionSecondsRef = useRef(0);

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
  }, [canUseLightweightAudioFallback, currentSongRef, desiredPlayStateRef, isPlayingRef, nextSongRef, playSongRef, playbackLoadingRef, queueRef, repeatModeRef, setIsPlaying]);

  const resolvedDuration = useMemo(() => {
    if (nativeDuration > 0) return nativeDuration;
    const songDuration = toDurationSeconds(currentSong?.duration);
    if (songDuration > 0) return songDuration;
    return 0;
  }, [nativeDuration, currentSong?.duration]);

  const resolvedDurationMillis = useMemo(() => {
    return Math.round(resolvedDuration * 1000);
  }, [resolvedDuration]);

  const resolvedPositionSeconds = useMemo(() => {
    if (seekOverride && currentSong?.id && seekOverride.songId === currentSong.id) {
      const elapsed = (Date.now() - seekOverride.startedAt) / 1000;
      if (elapsed < 1.2) {
        return seekOverride.seconds;
      }
    }
    if (TrackPlayer || canUseLightweightAudioFallback) {
      return nativePosition;
    }
    return 0;
  }, [seekOverride, currentSong?.id, nativePosition, TrackPlayer, canUseLightweightAudioFallback]);

  const resolvedProgress = useMemo(() => {
    if (resolvedDuration <= 0) return 0;
    return Math.max(0, Math.min(1, resolvedPositionSeconds / resolvedDuration));
  }, [resolvedPositionSeconds, resolvedDuration]);

  const resolvedPositionMillis = useMemo(() => {
    return Math.round(resolvedPositionSeconds * 1000);
  }, [resolvedPositionSeconds]);

  useEffect(() => {
    positionSecondsRef.current = resolvedPositionSeconds;
  }, [resolvedPositionSeconds]);

  return {
    nativePosition,
    setNativePosition,
    nativeDuration,
    setNativeDuration,
    seekOverride,
    setSeekOverride,
    positionSecondsRef,
    resolvedDuration,
    resolvedDurationMillis,
    resolvedPositionSeconds,
    resolvedProgress,
    resolvedPositionMillis,
  };
}
