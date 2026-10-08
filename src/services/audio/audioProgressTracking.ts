import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import { isYouTubeSong, rejectYouTubeStream } from "@/services/youtube/YouTubeMusic";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import {
resetPlaybackProgress,
updatePlaybackProgress,
} from "@/services/audio/playbackProgressStore";
import type { PendingPlayRequest } from "@/services/audio/usePlayerCoreState";
import { toDurationSeconds } from "@/utils/timeFormatters";
import { playbackDuration, playbackPosition, playbackProgress } from "./audioTimeline";
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
  playSongRef: MutableRefObject<(song: Song, queue?: Song[], startPositionSeconds?: number) => Promise<void> | void>;
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
  const fallbackRetryRef = useRef<{ songId: string; at: number } | null>(null);
  const mediaDurationRef = useRef<{ songId: string | null; seconds: number } | null>(null);
  const finishedSongRef = useRef<string | null>(null);

  const updateProgressStore = useCallback((pos: number, dur: number) => {
    positionSecondsRef.current = playbackPosition(pos, dur);
    durationSecondsRef.current = playbackDuration(dur);
    updatePlaybackProgress(playbackProgress(pos, dur));
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
    if (!Number.isFinite(pos) || pos < 0) return;
    let effectivePos = pos;
    const override = seekOverrideRef.current;
    if (override && currentSongRef.current?.id && override.songId === currentSongRef.current.id) {
      const elapsed = (Date.now() - override.startedAt) / 1000;
      if (elapsed < 1.2 && Math.abs(pos - override.seconds) > 0.5) {
        effectivePos = override.seconds;
      } else {
        seekOverrideRef.current = null;
      }
    }
    const songDuration = toDurationSeconds(currentSongRef.current?.duration);
    const dur = durationSecondsRef.current > 0 ? durationSecondsRef.current : songDuration;
    updateProgressStore(effectivePos, dur);
  }, [currentSongRef, updateProgressStore]);

  const setNativeDuration = useCallback((durOrFn: number | ((prev: number) => number), source: "media" | "catalog" = "media") => {
    const reported = typeof durOrFn === "function" ? durOrFn(durationSecondsRef.current) : durOrFn;
    if (!Number.isFinite(reported) || reported < 0) return;
    const song = currentSongRef.current;
    const dur = playbackDuration(reported, song?.playbackDurationSeconds);
    const songId = currentSongRef.current?.id ?? null;
    if (source === "media" && dur > 0) mediaDurationRef.current = { songId, seconds: dur };
    if (source === "catalog" && mediaDurationRef.current?.songId === songId &&
      playbackDuration(0, song?.playbackDurationSeconds) === 0) return;
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
      if (currentSong?.duration) setNativeDuration(toDurationSeconds(currentSong.duration), "catalog");
      return;
    }
    progressSongIdRef.current = songId;
    finishedSongRef.current = null;
    if (mediaDurationRef.current?.songId !== songId) mediaDurationRef.current = null;
    if (currentSong?.id) {
      const initialDur = playbackDuration(mediaDurationRef.current?.songId === songId ? mediaDurationRef.current.seconds : toDurationSeconds(currentSong.duration),
        currentSong.playbackDurationSeconds);
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
  }, [currentSong?.id, currentSong?.duration, currentSong?.playbackDurationSeconds, setNativeDuration, updateProgressStore]);

  useEffect(() => {
    let mounted = true;
    if (canUseLightweightAudioFallback) {
      const unsubscribe = ExpoAvPlayer.onStatusUpdate((status) => {
        if (!mounted) return;
        if (status.didJustFinish && finishedSongRef.current === currentSongRef.current?.id) return;
        if (status.error) {
          const song = currentSongRef.current;
          const retry = fallbackRetryRef.current;
          if (song && isYouTubeSong(song) && desiredPlayStateRef.current !== false &&
            (retry?.songId !== song.id || Date.now() - retry.at > 60000)) {
            fallbackRetryRef.current = { songId: song.id, at: Date.now() };
            const resumePosition = positionSecondsRef.current;
            rejectYouTubeStream(song);
            void playSongRef.current(song, queueRef.current, resumePosition);
          } else {
            ExpoAvPlayer.pause();
            desiredPlayStateRef.current = false;
            isPlayingRef.current = false;
            playbackLoadingRef.current = false;
            pendingPlayRequestRef.current = null;
            setIsPlaying(false);
            updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false,
              error: "Audio playback failed. Tap Play to retry." });
          }
          return;
        }
        if (status.didJustFinish) {
          if (desiredPlayStateRef.current === false) return;
          const songId = currentSongRef.current?.id;
          if (!songId || finishedSongRef.current === songId) return;
          finishedSongRef.current = songId;
          seekOverrideRef.current = null;
          const end = playbackDuration(status.duration, currentSongRef.current?.playbackDurationSeconds)
            || Math.max(status.position, durationSecondsRef.current);
          updateProgressStore(end, end);
          if (repeatModeRef.current === "one" && currentSongRef.current) {
            void playSongRef.current(currentSongRef.current, queueRef.current);
          } else {
            nextSongRef.current();
          }
          return;
        }
        if (typeof status.position === "number") {
          setNativePosition(status.position);
        }
        if (typeof status.duration === "number" && status.duration > 0) {
          setNativeDuration(status.duration);
        }
        if (typeof status.isPlaying === "boolean") {
          if (status.isPlaying) finishedSongRef.current = null;
          if (!status.isPlaying && (playbackLoadingRef.current || desiredPlayStateRef.current === true)) {
            return;
          }
          // Expo audio can report one last playing status from the outgoing
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

      });
      return () => {
        mounted = false;
        unsubscribe?.();
      };
    }
  }, [canUseLightweightAudioFallback, currentSongRef, desiredPlayStateRef, isPlayingRef, nextSongRef, pendingPlayRequestRef, playSongRef, playbackLoadingRef, queueRef, repeatModeRef, setIsPlaying, setNativeDuration, setNativePosition, updateProgressStore]);

  return {
    positionSecondsRef,
    durationSecondsRef,
    setSeekOverride,
    setNativePosition,
    setNativeDuration,
  };
}
