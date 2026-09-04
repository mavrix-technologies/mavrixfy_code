import { useCallback, type MutableRefObject } from "react";
import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import {
  songToTrack,
  resolvePlaybackUrlWithDetails,
  withResolvedPlaybackUrl,
} from "@/services/audio/PlayerPlaybackResolver";
import type { PlaybackQualityState } from "@/types/playbackTypes";

interface UseAudioQualityControlOptions {
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
  TrackPlayer: any;
  isPlayerReady: boolean;
  ensurePlayerReady: () => Promise<boolean>;
  RepeatMode: any;
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  enqueueNativeQueueMutation: <T>(op: () => Promise<T>) => Promise<T>;
  canUseLightweightAudioFallback: boolean;
  showPlaybackNotice: (msg: string) => void;
}

export function useAudioQualityControl({
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
  const changeStreamingQuality = useCallback(
    async (quality: "low" | "medium" | "high") => {
      await playerPersistenceService.saveStreamingQuality(quality);

      streamUrlCache.current.clear();
      streamResolveCache.current.clear();

      const activeSong = currentSongRef.current;
      if (!activeSong) return;

      const positionSec = Math.max(0, positionSecondsRef.current);
      const wasPlaying = isPlayingRef.current;

      try {
        const { url: newAudioUrl, qualityState } = await resolvePlaybackUrlWithDetails(activeSong, quality);
        if (!newAudioUrl) {
          showPlaybackNotice("Could not change streaming quality.");
          return;
        }

        setPlaybackQuality(qualityState);

        const resolvedSong = withResolvedPlaybackUrl(activeSong, newAudioUrl);
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

        if (TrackPlayer && (isPlayerReady || (await ensurePlayerReady()))) {
          await enqueueNativeQueueMutation(async () => {
            const nativeQueue = await TrackPlayer!.getQueue();
            const activeIdx = queueIndexRef.current;
            if (!nativeQueue.length || activeIdx < 0 || activeIdx >= nativeQueue.length) return;

            const updatedNativeQueue = nativeQueue.map((track: any, idx: number) =>
              idx === activeIdx
                ? songToTrack(resolvedSong, newAudioUrl, streamUrlCache.current)
                : track
            );

            await TrackPlayer!.setQueue(updatedNativeQueue).then(() =>
              TrackPlayer!.skip(activeIdx)
            );
            if (positionSec > 0) {
              await TrackPlayer!.seekTo(positionSec);
            }

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

            if (wasPlaying) {
              await TrackPlayer!.play();
            } else {
              await TrackPlayer!.pause().catch(() => {});
            }
          });
        } else if (canUseLightweightAudioFallback) {
          await ExpoAvPlayer.loadAndPlay(newAudioUrl);
          if (positionSec > 0) {
            await ExpoAvPlayer.seekTo(positionSec);
          }
          if (!wasPlaying) {
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
      streamUrlCache,
      TrackPlayer,
    ]
  );

  return { changeStreamingQuality };
}
