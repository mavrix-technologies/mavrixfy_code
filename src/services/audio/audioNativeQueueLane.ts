import { useRef, useCallback, type MutableRefObject } from "react";
import type { Song } from "@/lib/musicData";
import { songToTrack, readAudioCandidate } from "@/services/audio/PlayerPlaybackResolver";

export const isSameQueueContent = (
  a: Song[] | undefined | null,
  b: Song[] | undefined | null
): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
};

interface UseAudioNativeQueueLaneOptions {
  TrackPlayer: any;
  RepeatMode: any;
  isPlayerReady: boolean;
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  streamUrlCache: MutableRefObject<Map<string, string>>;
  resolvePlaybackUrlCached: (song: Song) => Promise<string | null>;
}
const RESOLVED_EMPTY_PROMISE: Promise<any> = Promise.resolve();

export function useAudioNativeQueueLane({
  TrackPlayer,
  RepeatMode,
  isPlayerReady,
  repeatModeRef,
  streamUrlCache,
  resolvePlaybackUrlCached,
}: UseAudioNativeQueueLaneOptions) {
  const nativeQueueMutationRef = useRef<Promise<any>>(RESOLVED_EMPTY_PROMISE);

  const enqueueNativeQueueMutation = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const run = nativeQueueMutationRef.current.then(operation, operation);
      nativeQueueMutationRef.current = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
    []
  );

  const nativeQueueIdsMatch = useCallback((nativeQueue: any[], songs: Song[]) => {
    return (
      Array.isArray(nativeQueue) &&
      nativeQueue.length === songs.length &&
      nativeQueue.every((track, index) => {
        const s = songs[index];
        if (!track || !s || track.id !== s.id) return false;
        if (s.audioUrl && track.url && track.url !== s.audioUrl) return false;
        return true;
      })
    );
  }, []);

  const buildNativeQueueTracks = useCallback(
    async (
      songs: Song[],
      forcedUrls: Map<string, string> = new Map()
    ): Promise<any[]> => {
      return Promise.all(
        songs.map(async (song) => {
          const forced = forcedUrls.get(song.id);
          if (forced) return songToTrack(song, forced, streamUrlCache.current);

          const cached = streamUrlCache.current.get(song.id);
          if (cached) return songToTrack(song, cached, streamUrlCache.current);

          const resolved = await resolvePlaybackUrlCached(song);
          return songToTrack(song, resolved, streamUrlCache.current);
        })
      );
    },
    [resolvePlaybackUrlCached, streamUrlCache]
  );

  const replaceNativeQueuePreservingState = useCallback(
    async (
      songs: Song[],
      activeIndex: number,
      options?: {
        position?: number;
        wasPlaying?: boolean;
        forcedUrls?: Map<string, string>;
      }
    ) => {
      if (!TrackPlayer || !isPlayerReady || songs.length === 0) return;

      const position = Math.max(0, options?.position ?? 0);
      const wasPlaying = options?.wasPlaying ?? false;
      const forcedUrls = options?.forcedUrls ?? new Map<string, string>();

      const nativeTracks = await buildNativeQueueTracks(songs, forcedUrls);
      if (nativeTracks.some((track) => !readAudioCandidate(track?.url))) {
        throw new Error("One or more queue tracks have no playable audio URL.");
      }

      return TrackPlayer.setQueue(nativeTracks)
        .then(() => TrackPlayer.skip(Math.max(0, Math.min(activeIndex, songs.length - 1))))
        .then(() => (position > 0 ? TrackPlayer.seekTo(position) : undefined))
        .then(() => (wasPlaying ? TrackPlayer.play() : TrackPlayer.pause().catch(() => {})))
        .then(() => {
          if (RepeatMode) {
            const repeatMap: Record<string, any> = {
              off: RepeatMode.Off,
              all: RepeatMode.Queue,
              one: RepeatMode.Track,
            };
            return TrackPlayer.setRepeatMode(repeatMap[repeatModeRef.current] ?? RepeatMode.Off).catch(() => {});
          }
        });
    },
    [buildNativeQueueTracks, isPlayerReady, repeatModeRef, RepeatMode, TrackPlayer]
  );

  return {
    enqueueNativeQueueMutation,
    nativeQueueIdsMatch,
    buildNativeQueueTracks,
    replaceNativeQueuePreservingState,
  };
}
