import { logger } from "@/lib/logger";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
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
import type { NativePlaybackPlayer } from "./NativePlaybackPlayer";

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
  enqueueNativeQueueMutation,
  canUseLightweightAudioFallback,
  showPlaybackNotice,
}: UseAudioQualityControlOptions) {
  const qualityRequest = useRef(0);
  const changeStreamingQuality = useCallback(
    async (quality: "auto" | "low" | "medium" | "high") => {
      const version = ++qualityRequest.current;
      const scope = getAccountScope();
      const requestId = playRequestIdRef?.current;
      await playerPersistenceService.saveStreamingQuality(quality);
      if (version !== qualityRequest.current || !isCurrentAccount(scope)) return;
      invalidateQualityPreferenceCache();

      streamUrlCache.current.clear();
      streamResolveCache.current.clear();
      if (requestId !== playRequestIdRef?.current) return;

      const activeSong = currentSongRef.current;
      if (!activeSong) return;

      const wasPlaying = isPlayingRef.current;
      const isCurrent = () => isCurrentAccount(scope) && version === qualityRequest.current &&
        currentSongRef.current?.id === activeSong.id && requestId === playRequestIdRef?.current;
      const shouldPlay = () => isCurrent() && (desiredPlayStateRef?.current ?? wasPlaying);

      try {
        const { url: newAudioUrl, qualityState } = await resolvePlaybackUrlWithDetails(activeSong, quality);
        if (!isCurrent()) return;
        if (!newAudioUrl) {
          showPlaybackNotice("Could not change streaming quality.");
          return;
        }

        const resolvedSong = withResolvedPlaybackUrl(currentSongRef.current!, newAudioUrl);
        const publishQuality = () => {
          setPlaybackQuality(qualityState);
          currentSongRef.current = resolvedSong;
          setCurrentSong(resolvedSong);
          const updatedJsQueue = queueRef.current.map((song, index) =>
            index === queueIndexRef.current ? resolvedSong : song);
          queueRef.current = updatedJsQueue;
          setQueue(updatedJsQueue);
          const updatedSourceQueue = originalQueueRef.current.map((song) =>
            song.id === resolvedSong.id ? resolvedSong : song);
          originalQueueRef.current = updatedSourceQueue;
          setSourceQueue(updatedSourceQueue);
          updatePlaybackEngineSnapshot({ currentSong: resolvedSong, queue: updatedJsQueue, sourceQueue: updatedSourceQueue });
        };

        if (TrackPlayer && (isPlayerReady || (await ensurePlayerReady()))) {
          await enqueueNativeQueueMutation(async () => {
            if (!isCurrent()) return;
            const nativeState = await TrackPlayer!.getPlaybackSnapshot();
            if (!isCurrent()) return;
            const { queue: nativeQueue, index: activeIdx } = nativeState;
            if (!nativeQueue.length || !Number.isInteger(activeIdx) || activeIdx < 0 || activeIdx >= nativeQueue.length ||
              nativeQueue[activeIdx]?.id !== resolvedSong.id) return;

            // Native validates the active occurrence again when applying this
            // update, retaining its own live position, queue and repeat mode.
            const applied = await TrackPlayer!.updateCurrentTrack(activeIdx,
              songToTrack(resolvedSong, newAudioUrl, streamUrlCache.current));
            if (!isCurrent() || applied.index !== activeIdx ||
              applied.queue[activeIdx]?.id !== resolvedSong.id || applied.queue[activeIdx]?.url !== newAudioUrl) return;
            publishQuality();

            if (shouldPlay()) {
              await TrackPlayer!.play();
            } else {
              await TrackPlayer!.pause().catch(() => {});
            }
          });
        } else if (canUseLightweightAudioFallback) {
          publishQuality();
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
