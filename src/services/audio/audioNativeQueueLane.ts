import { isYouTubeSong } from "@/services/youtube/YouTubeMusic";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import type { Song } from "@/lib/musicData";
import { readAudioCandidate,songToTrack } from "@/services/audio/PlayerPlaybackResolver";
import { useCallback,useRef,type MutableRefObject } from "react";
import type { NativePlaybackPlayer, RepeatMode as AudioRepeatMode } from "./StandardAudioPlayer";

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
  TrackPlayer: NativePlaybackPlayer | null;
  RepeatMode: typeof AudioRepeatMode;
  isPlayerReady: boolean;
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  streamUrlCache: MutableRefObject<Map<string, string>>;
  resolvePlaybackUrlCached: (song: Song) => Promise<string | null>;
  isNativeQueueSyncedRef?: MutableRefObject<boolean>;
  desiredPlayStateRef: MutableRefObject<boolean | null>;
  currentSongRef: MutableRefObject<Song | null>;
  queueRef?: MutableRefObject<Song[]>;
  playRequestIdRef?: MutableRefObject<number>;
}
const RESOLVED_EMPTY_PROMISE: Promise<void> = Promise.resolve();

export function useAudioNativeQueueLane({
  TrackPlayer,
  RepeatMode,
  isPlayerReady,
  repeatModeRef,
  streamUrlCache,
  resolvePlaybackUrlCached,
  isNativeQueueSyncedRef,
  desiredPlayStateRef,
  currentSongRef,
  queueRef,
  playRequestIdRef,
}: UseAudioNativeQueueLaneOptions) {
  const nativeQueueMutationRef = useRef<Promise<void>>(RESOLVED_EMPTY_PROMISE);

  const enqueueNativeQueueMutation = useCallback(
    (operation: () => Promise<void>): Promise<void> => {
      const scope = getAccountScope();
      const runOperation = () => isCurrentAccount(scope) ? operation() : Promise.resolve();
      const run = nativeQueueMutationRef.current.then(runOperation, runOperation);
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
    ): Promise<ReturnType<typeof songToTrack>[]> => {
      return Promise.all(
        songs.map(async (song) => {
          if (isYouTubeSong(song) && !forcedUrls.has(song.id)) return songToTrack(song);
          const forced = forcedUrls.get(song.id);
          if (forced) return songToTrack(song, forced, streamUrlCache.current);

          const cached = streamUrlCache.current.get(song.id);
          if (cached && !/^(?:file|content):\/\/|^\//i.test(cached)) return songToTrack(song, cached, streamUrlCache.current);

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
      const scope = getAccountScope();
      const selectedSong = currentSongRef.current;
      const requestId = playRequestIdRef?.current;
      const isCurrent = () => isCurrentAccount(scope) && currentSongRef.current === selectedSong &&
        (!queueRef || queueRef.current === songs) && requestId === playRequestIdRef?.current;

      const position = Math.max(0, options?.position ?? 0);
      const wasPlaying = options?.wasPlaying ?? false;
      const forcedUrls = options?.forcedUrls ?? new Map<string, string>();

      const active = songs[activeIndex];
      if (active && isYouTubeSong(active) && !forcedUrls.has(active.id)) {
        const url = await resolvePlaybackUrlCached(active);
        if (!url) throw new Error("Mavrixfy Music stream unavailable");
        forcedUrls.set(active.id, url);
      }
      const nativeTracks = await buildNativeQueueTracks(songs, forcedUrls);
      if (!isCurrent() ||
        currentSongRef.current?.id !== songs[activeIndex]?.id) return;
      if (nativeTracks.some((track) => track?.source !== "youtube" && !readAudioCandidate(track?.url))) {
        throw new Error("One or more queue tracks have no playable audio URL.");
      }

      return TrackPlayer.setQueue(nativeTracks, Math.max(0, Math.min(activeIndex, songs.length - 1)), position, true)
        .then(() => {
          if (!isCurrent()) return;
          return (desiredPlayStateRef.current ?? wasPlaying) ? TrackPlayer.play() : TrackPlayer.pause().catch(() => {});
        })
        .then(() => {
          if (!isCurrent()) return;
          if (isNativeQueueSyncedRef) isNativeQueueSyncedRef.current = true;
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
    [buildNativeQueueTracks, currentSongRef, desiredPlayStateRef, isNativeQueueSyncedRef, isPlayerReady, playRequestIdRef, queueRef, repeatModeRef, RepeatMode, resolvePlaybackUrlCached, TrackPlayer]
  );

  return {
    enqueueNativeQueueMutation,
    nativeQueueIdsMatch,
    buildNativeQueueTracks,
    replaceNativeQueuePreservingState,
  };
}
