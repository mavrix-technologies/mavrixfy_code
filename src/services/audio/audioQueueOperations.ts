import { shufflePlaybackQueue } from "@/lib/arrayUtils";
import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import type { QueueOrderSnapshot } from "@/services/audio/queueDrag";
import { isYouTubeSong } from "@/services/youtube/YouTubeMusic";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { songToTrack,withResolvedPlaybackUrl } from "@/services/audio/PlayerPlaybackResolver";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import { useCallback,type MutableRefObject } from "react";
import type { NativePlaybackPlayer, RepeatMode as AudioRepeatMode } from "./StandardAudioPlayer";

interface UseAudioQueueOperationsOptions {
  queue: Song[];
  queueRef: MutableRefObject<Song[]>;
  setQueue: (songs: Song[]) => void;
  sourceQueue: Song[];
  originalQueueRef: MutableRefObject<Song[]>;
  setSourceQueue: (songs: Song[]) => void;
  queueIndex: number;
  queueIndexRef: MutableRefObject<number>;
  setQueueIndex: (index: number) => void;
  userQueuedSongIds: string[];
  userQueuedSongIdsRef: MutableRefObject<string[]>;
  setUserQueuedSongIds: React.Dispatch<React.SetStateAction<string[]>>;
  isShuffled: boolean;
  isShuffledRef: MutableRefObject<boolean>;
  setIsShuffled: (shuffled: boolean) => void;
  repeatMode: "off" | "all" | "one";
  repeatModeRef: MutableRefObject<"off" | "all" | "one">;
  setRepeatMode: (mode: "off" | "all" | "one") => void;
  currentSongRef: MutableRefObject<Song | null>;
  isPlayingRef: MutableRefObject<boolean>;
  positionSecondsRef: MutableRefObject<number>;
  streamUrlCache: MutableRefObject<Map<string, string>>;
  TrackPlayer: NativePlaybackPlayer | null;
  isPlayerReady: boolean;
  RepeatMode: typeof AudioRepeatMode;
  enqueueNativeQueueMutation: (op: () => Promise<void>) => Promise<void>;
  nativeQueueIdsMatch: (nativeQueue: any[], songs: Song[]) => boolean;
  replaceNativeQueuePreservingState: (
    songs: Song[],
    activeIndex: number,
    options?: { position?: number; wasPlaying?: boolean; forcedUrls?: Map<string, string> }
  ) => Promise<void>;
  resolvePlaybackUrlCached: (song: Song, forcedQuality?: "auto" | "low" | "medium" | "high") => Promise<string | null>;
  showPlaybackNotice: (message: string) => void;
  playSong: (song: Song, requestedQueue?: Song[]) => Promise<void> | void;
}

export function useAudioQueueOperations({
  queueRef,
  setQueue,
  originalQueueRef,
  setSourceQueue,
  queueIndexRef,
  setQueueIndex,
  userQueuedSongIdsRef,
  setUserQueuedSongIds,
  isShuffledRef,
  setIsShuffled,
  repeatModeRef,
  setRepeatMode,
  currentSongRef,
  isPlayingRef,
  positionSecondsRef,
  streamUrlCache,
  TrackPlayer,
  isPlayerReady,
  RepeatMode,
  enqueueNativeQueueMutation,
  nativeQueueIdsMatch,
  replaceNativeQueuePreservingState,
  resolvePlaybackUrlCached,
  showPlaybackNotice,
  playSong,
}: UseAudioQueueOperationsOptions) {
  const { accountId, generation } = getAccountScope();
  const persistQueueState = useCallback((songs: Song[], index: number) => {
    const currentSong = currentSongRef.current;
    if (!currentSong || !isCurrentAccount({ accountId, generation })) return;
    void playerPersistenceService.savePlayerState({
      currentSong,
      queue: songs,
      queueIndex: index,
      positionSeconds: Math.max(0, positionSecondsRef.current),
      updatedAt: Date.now(),
    }).catch(() => {});
  }, [accountId, currentSongRef, generation, positionSecondsRef]);

  const toggleShuffle = useCallback(() => {
    const nextIsShuffled = !isShuffledRef.current;
    const sourceQueue = originalQueueRef.current.length > 0
      ? originalQueueRef.current
      : queueRef.current;
    const currentSong = currentSongRef.current;
    const queuedOccurrence = queueRef.current[queueIndexRef.current];
    const anchorSong = queuedOccurrence?.id === currentSong?.id ? queuedOccurrence : currentSong;
    let currentIndex = anchorSong
      ? sourceQueue.findIndex((song) => song === anchorSong)
      : -1;
    if (currentSong && currentIndex < 0)
      currentIndex = sourceQueue.findIndex((song) => song.id === currentSong.id);
    const nextQueue = nextIsShuffled
      ? shufflePlaybackQueue(sourceQueue, currentIndex)?.queue ?? []
      : [...sourceQueue];
    const nextIndex = nextIsShuffled
      ? 0
      : Math.max(0, currentIndex);

    isShuffledRef.current = nextIsShuffled;
    setIsShuffled(nextIsShuffled);
    setQueue(nextQueue as Song[]);
    queueRef.current = nextQueue as Song[];
    setQueueIndex(nextIndex);
    queueIndexRef.current = nextIndex;

    updatePlaybackEngineSnapshot({
      isShuffled: nextIsShuffled,
      queue: nextQueue as Song[],
      queueIndex: nextIndex,
    });
    persistQueueState(nextQueue as Song[], nextIndex);

    if (TrackPlayer && isPlayerReady && nextQueue.length > 0) {
      void enqueueNativeQueueMutation(async () => {
        try {
          await replaceNativeQueuePreservingState(nextQueue as Song[], nextIndex, {
            position: positionSecondsRef.current,
            wasPlaying: isPlayingRef.current,
          });
        } catch (error) {
          logger.error("[Player] toggleShuffle native sync failed:", error);
        }
      });
    }
  }, [
    enqueueNativeQueueMutation,
    isPlayerReady,
    replaceNativeQueuePreservingState,
    currentSongRef,
    isShuffledRef,
    setIsShuffled,
    queueRef,
    setQueue,
    originalQueueRef,
    queueIndexRef,
    setQueueIndex,
    TrackPlayer,
    positionSecondsRef,
    isPlayingRef,
    persistQueueState,
  ]);

  const shufflePlay = useCallback(
    async (songs: Song[], startSong?: Song) => {
      const sourceQueue = songs.filter((song) => Boolean(song?.id));
      const startIndex = startSong
        ? sourceQueue.findIndex((song) => song === startSong || song.id === startSong.id)
        : -1;
      const result = shufflePlaybackQueue(sourceQueue, startIndex);
      if (!result) return;

      const { queue: shuffledQueue } = result;
      const targetSong = shuffledQueue[0];
      const canonicalSource = sourceQueue;

      originalQueueRef.current = canonicalSource;
      setSourceQueue(canonicalSource);
      isShuffledRef.current = true;
      setIsShuffled(true);

      // playSong installs its new queue synchronously before resolving audio.
      // Restore the canonical order immediately, so a later Play request cannot
      // be overwritten by this shuffle's delayed completion.
      const playback = playSong(targetSong, shuffledQueue);
      originalQueueRef.current = canonicalSource;
      setSourceQueue(canonicalSource);
      updatePlaybackEngineSnapshot({
        isShuffled: true,
        sourceQueue: canonicalSource,
      });
      await playback;
    },
    [playSong, setIsShuffled, isShuffledRef, originalQueueRef, setSourceQueue]
  );

  const toggleRepeat = useCallback(() => {
    const prev = repeatModeRef.current;
    const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
    repeatModeRef.current = next;
    setRepeatMode(next);
    updatePlaybackEngineSnapshot({ repeatMode: next });

    if (TrackPlayer && RepeatMode) {
      const repeatMap: Record<string, any> = {
        off: RepeatMode.Off,
        all: RepeatMode.Queue,
        one: RepeatMode.Track,
      };
      void enqueueNativeQueueMutation(async () => {
        await TrackPlayer.setRepeatMode(repeatMap[next] || RepeatMode.Off);
      }).catch(() => {});
    }
  }, [enqueueNativeQueueMutation, repeatModeRef, setRepeatMode, TrackPlayer, RepeatMode]);

  const addToQueue = useCallback(
    (song: Song) => {
      if (!song?.id) return;
      const scope = getAccountScope();

      if (queueRef.current.some((s) => s.id === song.id)) {
        showPlaybackNotice("Already in queue");
        return;
      }
      showPlaybackNotice("Added to queue");

      void enqueueNativeQueueMutation(async () => {
        if (queueRef.current.some((s) => s.id === song.id)) {
          return;
        }

        const isYouTube = isYouTubeSong(song);
        const resolvedUrl = isYouTube ? null : await resolvePlaybackUrlCached(song);
        if (!isCurrentAccount(scope)) return;
        if (!isYouTube && !resolvedUrl) {
          showPlaybackNotice("Could not add song: audio unavailable.");
          return;
        }

        const previousQueue = queueRef.current;
        const songWithUrl = resolvedUrl ? withResolvedPlaybackUrl(song, resolvedUrl) : song;
        const nextQueue = [...previousQueue, songWithUrl];
        queueRef.current = nextQueue;
        setQueue(nextQueue);

        const nextSourceQueue = [...originalQueueRef.current, songWithUrl];
        originalQueueRef.current = nextSourceQueue;
        setSourceQueue(nextSourceQueue);

        const nextUserQueuedSongIds = userQueuedSongIdsRef.current.includes(song.id)
          ? userQueuedSongIdsRef.current
          : [...userQueuedSongIdsRef.current, song.id];
        userQueuedSongIdsRef.current = nextUserQueuedSongIds;
        setUserQueuedSongIds(nextUserQueuedSongIds);
        updatePlaybackEngineSnapshot({
          queue: nextQueue,
          sourceQueue: nextSourceQueue,
          userQueuedSongIds: nextUserQueuedSongIds,
        });
        persistQueueState(nextQueue, queueIndexRef.current);

        if (TrackPlayer && isPlayerReady) {
          try {
            const nativeQueue = await TrackPlayer!.getQueue();
            if (nativeQueueIdsMatch(nativeQueue, previousQueue)) {
              await TrackPlayer!.add([songToTrack(songWithUrl, resolvedUrl, streamUrlCache.current)]);
            } else {
              await replaceNativeQueuePreservingState(
                nextQueue,
                queueIndexRef.current,
                {
                  position: positionSecondsRef.current,
                  wasPlaying: isPlayingRef.current,
                }
              );
            }
          } catch (error) {
            logger.error("[Player] addToQueue native synchronization failed:", error);
          }
        }
      });
    },
    [
      enqueueNativeQueueMutation,
      isPlayerReady,
      nativeQueueIdsMatch,
      replaceNativeQueuePreservingState,
      resolvePlaybackUrlCached,
      showPlaybackNotice,
      queueRef,
      setQueue,
      originalQueueRef,
      setSourceQueue,
      setUserQueuedSongIds,
      userQueuedSongIdsRef,
      TrackPlayer,
      streamUrlCache,
      queueIndexRef,
      positionSecondsRef,
      isPlayingRef,
      persistQueueState,
    ]
  );

  const playNext = useCallback(
    (song: Song) => {
      if (!song?.id) return;
      const scope = getAccountScope();

      if (currentSongRef.current?.id === song.id) {
        showPlaybackNotice("This song is already playing");
        return;
      }
      showPlaybackNotice("Playing next");

      void enqueueNativeQueueMutation(async () => {
        const isYouTube = isYouTubeSong(song);
        const resolvedUrl = isYouTube ? null : await resolvePlaybackUrlCached(song);
        if (!isCurrentAccount(scope)) return;
        if (!isYouTube && !resolvedUrl) {
          showPlaybackNotice("Could not queue song: audio unavailable.");
          return;
        }

        const currentQ = queueRef.current;
        if (currentSongRef.current?.id === song.id) return;
        const alreadyQueued = currentQ.some((track) => track.id === song.id);
        const cleanQ = currentQ.filter((s) => s.id !== song.id);
        const currentIndexInClean = cleanQ.findIndex((s) => s.id === currentSongRef.current?.id);
        const insertAt = Math.max(0, (currentIndexInClean >= 0 ? currentIndexInClean : 0) + 1);
        const nextSongWithUrl = resolvedUrl ? withResolvedPlaybackUrl(song, resolvedUrl) : song;
        const nextQueue = [
          ...cleanQ.slice(0, insertAt),
          nextSongWithUrl,
          ...cleanQ.slice(insertAt),
        ];

        queueRef.current = nextQueue;
        setQueue(nextQueue);
        const nextActiveIndex = Math.max(0, currentIndexInClean);
        queueIndexRef.current = nextActiveIndex;
        setQueueIndex(nextActiveIndex);

        const currentSourceQ = originalQueueRef.current;
        const cleanSourceQ = currentSourceQ.filter((s) => s.id !== song.id);
        const current = currentSongRef.current;
        const sci = current ? cleanSourceQ.findIndex((s) => s.id === current.id) : 0;
        const sourceInsertAt = Math.max(0, (sci >= 0 ? sci : 0) + 1);
        const nextSourceQueue = [
          ...cleanSourceQ.slice(0, sourceInsertAt),
          nextSongWithUrl,
          ...cleanSourceQ.slice(sourceInsertAt),
        ];
        originalQueueRef.current = nextSourceQueue;
        setSourceQueue(nextSourceQueue);

        const nextUserQueuedSongIds = [song.id, ...userQueuedSongIdsRef.current.filter((id) => id !== song.id)];
        userQueuedSongIdsRef.current = nextUserQueuedSongIds;
        setUserQueuedSongIds(nextUserQueuedSongIds);
        updatePlaybackEngineSnapshot({
          queue: nextQueue,
          sourceQueue: nextSourceQueue,
          userQueuedSongIds: nextUserQueuedSongIds,
          queueIndex: nextActiveIndex,
        });
        persistQueueState(nextQueue, nextActiveIndex);

        if (TrackPlayer && isPlayerReady) {
          try {
            const nativeQueue = await TrackPlayer!.getQueue();
            if (!alreadyQueued && nativeQueueIdsMatch(nativeQueue, currentQ)) {
              await TrackPlayer!.add(
                [songToTrack(nextSongWithUrl, resolvedUrl, streamUrlCache.current)],
                insertAt
              );
            } else {
              await replaceNativeQueuePreservingState(
                nextQueue,
                queueIndexRef.current,
                {
                  position: positionSecondsRef.current,
                  wasPlaying: isPlayingRef.current,
                }
              );
            }
          } catch (error) {
            logger.error("[Player] playNext native synchronization failed:", error);
          }
        }
      });
    },
    [
      currentSongRef,
      enqueueNativeQueueMutation,
      isPlayerReady,
      isPlayingRef,
      nativeQueueIdsMatch,
      originalQueueRef,
      positionSecondsRef,
      queueIndexRef,
      queueRef,
      replaceNativeQueuePreservingState,
      resolvePlaybackUrlCached,
      setQueue,
      setSourceQueue,
      setUserQueuedSongIds,
      userQueuedSongIdsRef,
      setQueueIndex,
      showPlaybackNotice,
      streamUrlCache,
      TrackPlayer,
      persistQueueState,
    ]
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      const currentQ = queueRef.current;
      if (!Number.isInteger(index) || index === queueIndexRef.current || index < 0 || index >= currentQ.length) return;

      const removedSong = currentQ[index];
      const nextQueue = currentQ.filter((_, i) => i !== index);
      const previousIndex = queueIndexRef.current;
      const nextIndex = index < previousIndex ? previousIndex - 1 : previousIndex;

      queueRef.current = nextQueue;
      setQueue(nextQueue);
      setQueueIndex(nextIndex);
      queueIndexRef.current = nextIndex;

      if (removedSong) {
        const nextSourceQueue = originalQueueRef.current.filter((s) => s.id !== removedSong.id);
        originalQueueRef.current = nextSourceQueue;
        setSourceQueue(nextSourceQueue);

        const nextUserIds = userQueuedSongIdsRef.current.filter((id) => id !== removedSong.id);
        userQueuedSongIdsRef.current = nextUserIds;
        setUserQueuedSongIds(nextUserIds);
      }

      updatePlaybackEngineSnapshot({
        queue: nextQueue,
        sourceQueue: originalQueueRef.current,
        userQueuedSongIds: userQueuedSongIdsRef.current,
        queueIndex: nextIndex,
      });
      persistQueueState(nextQueue, nextIndex);

      if (TrackPlayer && isPlayerReady) {
        void enqueueNativeQueueMutation(async () => {
          try {
            if (queueRef.current !== nextQueue) return;
            const nativeQueue = await TrackPlayer.getQueue();
            if (queueRef.current !== nextQueue) return;
            if (nativeQueueIdsMatch(nativeQueue, currentQ)) {
              await TrackPlayer.remove(index);
            } else {
              await replaceNativeQueuePreservingState(nextQueue, nextIndex, {
                position: positionSecondsRef.current,
                wasPlaying: isPlayingRef.current,
              });
            }
          } catch {
            if (queueRef.current !== nextQueue) return;
            await replaceNativeQueuePreservingState(nextQueue, nextIndex, {
              position: positionSecondsRef.current,
              wasPlaying: isPlayingRef.current,
            });
          }
        });
      }
    },
    [
      enqueueNativeQueueMutation,
      isPlayerReady,
      isPlayingRef,
      nativeQueueIdsMatch,
      originalQueueRef,
      positionSecondsRef,
      queueIndexRef,
      queueRef,
      replaceNativeQueuePreservingState,
      setQueue,
      setQueueIndex,
      setSourceQueue,
      setUserQueuedSongIds,
      userQueuedSongIdsRef,
      TrackPlayer,
      persistQueueState,
    ]
  );

  const reorderQueue = useCallback(
    (from: number, to: number, expectedState?: QueueOrderSnapshot) => {
      const currentQ = queueRef.current;
      if (expectedState && (currentQ !== expectedState.queue || queueIndexRef.current !== expectedState.queueIndex)) return;
      if (!Number.isInteger(from) || !Number.isInteger(to) ||
        from === to || from < 0 || to < 0 || from >= currentQ.length || to >= currentQ.length) return;

      const nextQueue = [...currentQ];
      const [movedSong] = nextQueue.splice(from, 1);
      nextQueue.splice(to, 0, movedSong);

      // Preserve the playing occurrence, including queues with duplicate songs.
      let nextIndex = queueIndexRef.current;
      if (nextIndex === from) nextIndex = to;
      else if (from < to && nextIndex > from && nextIndex <= to) nextIndex -= 1;
      else if (from > to && nextIndex >= to && nextIndex < from) nextIndex += 1;
      const safeNextIndex = Math.max(0, nextIndex);
      const updateSourceOrder = !isShuffledRef.current;

      queueRef.current = nextQueue;
      setQueue(nextQueue);
      setQueueIndex(safeNextIndex);
      queueIndexRef.current = safeNextIndex;
      if (updateSourceOrder) {
        originalQueueRef.current = nextQueue;
        setSourceQueue(nextQueue);
      }

      updatePlaybackEngineSnapshot({
        queue: nextQueue,
        queueIndex: safeNextIndex,
        ...(updateSourceOrder ? { sourceQueue: nextQueue } : {}),
      });
      persistQueueState(nextQueue, safeNextIndex);

      if (TrackPlayer && isPlayerReady) {
        void enqueueNativeQueueMutation(async () => {
          try {
            if (queueRef.current !== nextQueue) return;
            const nativeQueue = await TrackPlayer.getQueue();
            if (queueRef.current !== nextQueue) return;

            if (
              typeof TrackPlayer.move === "function" &&
              nativeQueueIdsMatch(nativeQueue, currentQ)
            ) {
              try {
                await TrackPlayer.move(from, to);
                return;
              } catch (moveError) {
                logger.warn("[Player] Native queue move failed; syncing the reordered queue", moveError);
              }
            }

            if (queueRef.current !== nextQueue) return;
            await replaceNativeQueuePreservingState(
              nextQueue,
              safeNextIndex,
              {
                position: positionSecondsRef.current,
                wasPlaying: isPlayingRef.current,
              }
            );
          } catch (error) {
            logger.error("[Player] reorderQueue native synchronization failed:", error);
          }
        });
      }
    },
    [
      enqueueNativeQueueMutation,
      isPlayerReady,
      isShuffledRef,
      isPlayingRef,
      nativeQueueIdsMatch,
      originalQueueRef,
      positionSecondsRef,
      queueIndexRef,
      queueRef,
      replaceNativeQueuePreservingState,
      setQueue,
      setQueueIndex,
      setSourceQueue,
      TrackPlayer,
      persistQueueState,
    ]
  );

  const clearQueue = useCallback(() => {
    const current = currentSongRef.current;
    const nextQueue = current ? [current] : [];
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    queueIndexRef.current = 0;
    setQueueIndex(0);
    originalQueueRef.current = nextQueue;
    setSourceQueue(nextQueue);
    setUserQueuedSongIds([]);
    userQueuedSongIdsRef.current = [];

    updatePlaybackEngineSnapshot({
      queue: nextQueue,
      sourceQueue: nextQueue,
      userQueuedSongIds: [],
      queueIndex: 0,
    });
    persistQueueState(nextQueue, 0);

    if (TrackPlayer && isPlayerReady) {
      void enqueueNativeQueueMutation(async () => {
        try {
          await replaceNativeQueuePreservingState(nextQueue, 0, {
            position: positionSecondsRef.current,
            wasPlaying: isPlayingRef.current,
          });
        } catch (error) {
          logger.error("[Player] clearQueue native sync failed:", error);
        }
      });
    }
  }, [
    currentSongRef,
    enqueueNativeQueueMutation,
    isPlayerReady,
    isPlayingRef,
    originalQueueRef,
    positionSecondsRef,
    queueIndexRef,
    queueRef,
    replaceNativeQueuePreservingState,
    setQueue,
    setQueueIndex,
    setSourceQueue,
    setUserQueuedSongIds,
    userQueuedSongIdsRef,
    TrackPlayer,
    persistQueueState,
  ]);

  const shuffleQueue = useCallback(() => {
    toggleShuffle();
  }, [toggleShuffle]);

  return {
    toggleShuffle,
    shufflePlay,
    toggleRepeat,
    addToQueue,
    playNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    shuffleQueue,
  };
}
