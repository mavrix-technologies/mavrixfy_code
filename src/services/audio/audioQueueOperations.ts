import { useCallback, type MutableRefObject } from "react";
import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { createShuffledPlaybackQueue, toggleQueueShuffleState } from "@/lib/arrayUtils";
import { songToTrack, withResolvedPlaybackUrl } from "@/services/audio/PlayerPlaybackResolver";

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
  TrackPlayer: any;
  isPlayerReady: boolean;
  RepeatMode: any;
  enqueueNativeQueueMutation: <T>(op: () => Promise<T>) => Promise<T>;
  nativeQueueIdsMatch: (nativeQueue: any[], songs: Song[]) => boolean;
  replaceNativeQueuePreservingState: (
    songs: Song[],
    activeIndex: number,
    options?: { position?: number; wasPlaying?: boolean; forcedUrls?: Map<string, string> }
  ) => Promise<any>;
  resolvePlaybackUrlCached: (song: Song, forcedQuality?: "low" | "medium" | "high") => Promise<string | null>;
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
  const toggleShuffle = useCallback(() => {
    const { nextIsShuffled, nextQueue, nextIndex } = toggleQueueShuffleState({
      isShuffled: isShuffledRef.current,
      currentSong: currentSongRef.current,
      activeQueue: queueRef.current,
      originalQueue: originalQueueRef.current,
    });

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
  ]);

  const shufflePlay = useCallback(
    async (songs: Song[], startSong?: Song) => {
      const result = createShuffledPlaybackQueue(songs, startSong);
      if (!result) return;

      const { shuffledQueue, targetSong } = result;
      const canonicalSource = [...songs];

      originalQueueRef.current = canonicalSource;
      setSourceQueue(canonicalSource);
      isShuffledRef.current = true;
      setIsShuffled(true);

      await playSong(targetSong, shuffledQueue);

      updatePlaybackEngineSnapshot({
        isShuffled: true,
        sourceQueue: canonicalSource,
      });
    },
    [playSong, setIsShuffled, isShuffledRef, originalQueueRef, setSourceQueue]
  );

  const toggleRepeat = useCallback(() => {
    const prev = repeatModeRef.current;
    const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
    repeatModeRef.current = next;
    setRepeatMode(next);

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

      if (queueRef.current.some((s) => s.id === song.id)) {
        showPlaybackNotice("Already in queue");
        return;
      }
      showPlaybackNotice("Added to queue");

      void enqueueNativeQueueMutation(async () => {
        if (queueRef.current.some((s) => s.id === song.id)) {
          return;
        }

        const resolvedUrl = await resolvePlaybackUrlCached(song);
        if (!resolvedUrl) {
          showPlaybackNotice("Could not add song: audio unavailable.");
          return;
        }

        const previousQueue = queueRef.current;
        const songWithUrl = withResolvedPlaybackUrl(song, resolvedUrl);
        const nextQueue = [...previousQueue, songWithUrl];
        queueRef.current = nextQueue;
        setQueue(nextQueue);

        const nextSourceQueue = [...originalQueueRef.current, songWithUrl];
        originalQueueRef.current = nextSourceQueue;
        setSourceQueue(nextSourceQueue);

        setUserQueuedSongIds((prev) => (prev.includes(song.id) ? prev : [...prev, song.id]));

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
      TrackPlayer,
      streamUrlCache,
      queueIndexRef,
      positionSecondsRef,
      isPlayingRef,
    ]
  );

  const playNext = useCallback(
    (song: Song) => {
      if (!song?.id) return;

      if (currentSongRef.current?.id === song.id) {
        showPlaybackNotice("This song is already playing");
        return;
      }
      showPlaybackNotice("Playing next");

      void enqueueNativeQueueMutation(async () => {
        const resolvedUrl = await resolvePlaybackUrlCached(song);
        if (!resolvedUrl) {
          showPlaybackNotice("Could not queue song: audio unavailable.");
          return;
        }

        const currentQ = queueRef.current;
        const cleanQ = currentQ.filter((s) => s.id !== song.id);
        const currentIndexInClean = cleanQ.findIndex((s) => s.id === currentSongRef.current?.id);
        const insertAt = Math.max(0, (currentIndexInClean >= 0 ? currentIndexInClean : 0) + 1);
        const nextSongWithUrl = withResolvedPlaybackUrl(song, resolvedUrl);
        const nextQueue = [
          ...cleanQ.slice(0, insertAt),
          nextSongWithUrl,
          ...cleanQ.slice(insertAt),
        ];

        queueRef.current = nextQueue;
        setQueue(nextQueue);

        const currentSourceQ = originalQueueRef.current;
        const cleanSourceQ = currentSourceQ.filter((s) => s.id !== song.id);
        const current = currentSongRef.current;
        const sci = current ? cleanSourceQ.findIndex((s) => s.id === current.id) : 0;
        const sourceInsertAt = Math.max(0, (sci >= 0 ? sci : 0) + 1);
        const nextSourceQueue = [
          ...cleanSourceQ.slice(0, sourceInsertAt),
          song,
          ...cleanSourceQ.slice(sourceInsertAt),
        ];
        originalQueueRef.current = nextSourceQueue;
        setSourceQueue(nextSourceQueue);

        setUserQueuedSongIds((prev) => [song.id, ...prev.filter((id) => id !== song.id)]);

        if (TrackPlayer && isPlayerReady) {
          try {
            const nativeQueue = await TrackPlayer!.getQueue();
            if (nativeQueueIdsMatch(nativeQueue, currentQ)) {
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
      showPlaybackNotice,
      streamUrlCache,
      TrackPlayer,
    ]
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      const currentQ = queueRef.current;
      if (index === queueIndexRef.current || index < 0 || index >= currentQ.length) return;

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

      if (TrackPlayer && isPlayerReady) {
        void enqueueNativeQueueMutation(async () => {
          try {
            await TrackPlayer.remove(index);
          } catch {
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
    ]
  );

  const reorderQueue = useCallback(
    (from: number, to: number) => {
      const currentQ = queueRef.current;
      if (from === to || from < 0 || to < 0 || from >= currentQ.length || to >= currentQ.length) return;

      const item = currentQ[from];
      const withoutItem = currentQ.filter((_, i) => i !== from);
      const nextQueue = [
        ...withoutItem.slice(0, to),
        item,
        ...withoutItem.slice(to),
      ];

      const currentSongId = currentSongRef.current?.id;
      const nextIndex = currentSongId
        ? nextQueue.findIndex((s) => s.id === currentSongId)
        : queueIndexRef.current;

      queueRef.current = nextQueue;
      setQueue(nextQueue);
      setQueueIndex(Math.max(0, nextIndex));
      queueIndexRef.current = Math.max(0, nextIndex);

      updatePlaybackEngineSnapshot({
        queue: nextQueue,
        queueIndex: Math.max(0, nextIndex),
      });

      if (TrackPlayer && isPlayerReady) {
        void enqueueNativeQueueMutation(async () => {
          try {
            await replaceNativeQueuePreservingState(
              nextQueue,
              Math.max(0, nextIndex),
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
      currentSongRef,
      enqueueNativeQueueMutation,
      isPlayerReady,
      isPlayingRef,
      positionSecondsRef,
      queueIndexRef,
      queueRef,
      replaceNativeQueuePreservingState,
      setQueue,
      setQueueIndex,
      TrackPlayer,
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
