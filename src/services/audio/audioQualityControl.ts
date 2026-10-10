import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import {
resolvePlaybackUrlWithDetails,
invalidateQualityPreferenceCache,
songToTrack,
withResolvedPlaybackUrl,
} from "@/services/audio/PlayerPlaybackResolver";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import type { PlaybackQualityState } from "@/types/playbackTypes";
import { useCallback,useRef,type MutableRefObject } from "react";
import type { NativePlaybackPlayer, RepeatMode as AudioRepeatMode } from "./StandardAudioPlayer";

interface UseAudioQualityControlOptions {
  desiredPlayStateRef?: MutableRefObject<boolean | null>;
  playRequestIdRef?: MutableRefObject<number>;
  streamUrlCache: MutableRefObject<Map<string, string>>;
  streamResolveCache: MutableRefObject<Map<string, Promise<string | null>>>;
  currentSongRef: MutableRefObject<Song | null>;
  setCurrentSong: (song: Song | null) => void;
  positionSecondsRef: MutableRefObject<number>;
  isPlayingRef: MutableRefObject<boolean>;
  setPlaybackQuality: (quality: PlaybackQualityState) => void;
  queueIndexRef: MutableRefObject<number>;
  queueRef: MutableRefObject<Song[]>;
  setQueue: (songs: Song[]) => void;
  originalQueueRef: MutableRefObject<Song[]>;
  setSourceQueue: (songs: Song[]) => void;
  TrackPlayer: NativePlaybackPlayer | null;
  isPlayerReady: boolean;
  ensurePlayerReady: () => Promise<boolean>;
  RepeatMode: typeof AudioRepeatMode;
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  enqueueNativeQueueMutation: (op: () => Promise<void>) => Promise<void>;
  canUseLightweightAudioFallback: boolean;
  showPlaybackNotice: (msg: string) => void;
}

export function useAudioQualityControl({
  desiredPlayStateRef,
  playRequestIdRef,
  streamUrlCache,
  streamResolveCache,
  currentSongRef,
  setCurrentSong,
  positionSecondsRef,
  isPlayingRef,
  setPlaybackQuality,
  queueIndexRef,
  queueRef,
  setQueue,
  originalQueueRef,
  setSourceQueue,
  TrackPlayer,
  isPlayerReady,
  ensurePlayerReady,
  RepeatMode,
  repeatModeRef,
  enqueueNativeQueueMutation,
  canUseLightweightAudioFallback,
  showPlaybackNotice,
}: UseAudioQualityControlOptions) {
  const qualityRequest = useRef(0);
  const changeStreamingQuality = useCallback(
    async (quality: "auto" | "low" | "medium" | "high") => {
      const version = ++qualityRequest.current;
      const requestId = playRequestIdRef?.current;
      await playerPersistenceService.saveStreamingQuality(quality);
      if (version !== qualityRequest.current) return;
      invalidateQualityPreferenceCache();

      streamUrlCache.current.clear();
      streamResolveCache.current.clear();

      const activeSong = currentSongRef.current;
      if (!activeSong) return;

      const wasPlaying = isPlayingRef.current;
      const isCurrent = () => version === qualityRequest.current &&
        currentSongRef.current?.id === activeSong.id && requestId === playRequestIdRef?.current;
      const shouldPlay = () => isCurrent() && (desiredPlayStateRef?.current ?? wasPlaying);

      try {
        const { url: newAudioUrl, qualityState } = await resolvePlaybackUrlWithDetails(activeSong, quality);
        if (!isCurrent()) return;
        if (!newAudioUrl) {
          showPlaybackNotice("Could not change streaming quality.");
          return;
        }

        setPlaybackQuality(qualityState);

        const resolvedSong = withResolvedPlaybackUrl(currentSongRef.current!, newAudioUrl);
        currentSongRef.current = resolvedSong;
        setCurrentSong(resolvedSong);

        const currentIdx = queueIndexRef.current;
        const updatedJsQueue = queueRef.current.map((s, idx) =>
          idx === currentIdx ? resolvedSong : s
        );
        queueRef.current = updatedJsQueue;
        setQueue(updatedJsQueue);

        const updatedSourceQueue = originalQueueRef.current.map((s) =>
          s.id === resolvedSong.id ? resolvedSong : s
        );
        originalQueueRef.current = updatedSourceQueue;
        setSourceQueue(updatedSourceQueue);
        updatePlaybackEngineSnapshot({ currentSong: resolvedSong, queue: updatedJsQueue, sourceQueue: updatedSourceQueue });

        if (TrackPlayer && (isPlayerReady || (await ensurePlayerReady()))) {
          await enqueueNativeQueueMutation(async () => {
            if (!isCurrent()) return;
            const nativeQueue = await TrackPlayer!.getQueue();
            if (!isCurrent()) return;
            const activeIdx = await TrackPlayer!.getActiveTrackIndex();
            if (!isCurrent()) return;
            if (!nativeQueue.length || !Number.isInteger(activeIdx) || activeIdx < 0 || activeIdx >= nativeQueue.length ||
              nativeQueue[activeIdx]?.id !== resolvedSong.id) return;

            const updatedNativeQueue = nativeQueue.map((track: any, idx: number) =>
              idx === activeIdx
                ? songToTrack(resolvedSong, newAudioUrl, streamUrlCache.current)
                : track
            );

            await TrackPlayer!.setQueue(updatedNativeQueue, activeIdx, Math.max(0, positionSecondsRef.current));
            if (!isCurrent()) return;

            if (RepeatMode) {
              const repeatMap: Record<string, any> = {
                off: RepeatMode.Off,
                all: RepeatMode.Queue,
                one: RepeatMode.Track,
              };
              await TrackPlayer!.setRepeatMode(
                repeatMap[repeatModeRef.current] ?? RepeatMode.Off
              ).catch(() => {});
            }

            if (shouldPlay()) {
              await TrackPlayer!.play();
            } else {
              await TrackPlayer!.pause().catch(() => {});
            }
          });
        } else if (canUseLightweightAudioFallback) {
          const positionSec = Math.max(0, positionSecondsRef.current);
          await ExpoAvPlayer.loadAndPlay(newAudioUrl, resolvedSong, shouldPlay, positionSec);
          if (!isCurrent()) return;
          if (!shouldPlay()) {
            try { ExpoAvPlayer.pause(); } catch {}
          }
        }
      } catch (err) {
        logger.error("[Player] Failed to reload playback stream on quality change:", err);
      }
    },
    [
      canUseLightweightAudioFallback,
      currentSongRef,
      enqueueNativeQueueMutation,
      ensurePlayerReady,
      isPlayerReady,
      isPlayingRef,
      originalQueueRef,
      positionSecondsRef,
      queueIndexRef,
      queueRef,
      repeatModeRef,
      RepeatMode,
      setCurrentSong,
      setPlaybackQuality,
      setQueue,
      setSourceQueue,
      showPlaybackNotice,
      streamResolveCache,
      desiredPlayStateRef,
      playRequestIdRef,
      streamUrlCache,
      TrackPlayer,
    ]
  );

  return { changeStreamingQuality };
}
