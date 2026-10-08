import type { Song } from "@/lib/musicData";
import * as Animated from "@/lib/nativeAnimated";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import type { FlatList,NativeScrollEvent,NativeSyntheticEvent } from "react-native";
import type { ArtworkQueueItem } from "../components/PlayerArtworkViews";

export interface UseArtworkCarouselSyncParams {
  playingQueue: Song[];
  activeQueueIndex: number;
  currentSongId: string | undefined;
  artCarouselSnapInterval: number;
  nextSong: () => Promise<any> | void;
  prevSong: () => Promise<any> | void;
  playSong: (song: Song, queue: Song[]) => void;
}

export function useArtworkCarouselSync({
  playingQueue,
  activeQueueIndex,
  currentSongId,
  artCarouselSnapInterval,
  nextSong,
  prevSong,
  playSong,
}: UseArtworkCarouselSyncParams) {
  const [artScrollX] = useState(() => new Animated.Value(activeQueueIndex * artCarouselSnapInterval));
  const artCarouselRef = useRef<FlatList<ArtworkQueueItem> | null>(null);
  const hasAlignedArtCarouselRef = useRef(false);
  const prevCarouselSongIdRef = useRef(currentSongId);
  const pendingArtworkTargetIndexRef = useRef<number | null>(null);
  const userScrolledToIndexRef = useRef<number | null>(null);
  const skipCooldownRef = useRef(false);
  const skipCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSkipCooldownTimer = useCallback(() => {
    if (!skipCooldownTimerRef.current) return;
    clearTimeout(skipCooldownTimerRef.current);
    skipCooldownTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearSkipCooldownTimer();
    };
  }, [clearSkipCooldownTimer]);

  const handleArtworkSongChange = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= playingQueue.length || targetIndex === activeQueueIndex) {
        return;
      }
      if (skipCooldownRef.current) return;
      skipCooldownRef.current = true;
      clearSkipCooldownTimer();
      skipCooldownTimerRef.current = setTimeout(() => {
        skipCooldownRef.current = false;
        skipCooldownTimerRef.current = null;
      }, 350);

      const targetSong = playingQueue[targetIndex];
      if (!targetSong) {
        return;
      }

      playSong(targetSong, playingQueue);
    },
    [activeQueueIndex, clearSkipCooldownTimer, playSong, playingQueue]
  );

  useEffect(() => {
    pendingArtworkTargetIndexRef.current = activeQueueIndex;
  }, [activeQueueIndex]);

  const handleArtworkScrollFinished = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (playingQueue.length <= 1 || artCarouselSnapInterval <= 0) {
        return;
      }

      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / artCarouselSnapInterval);
      const targetIndex = Math.max(0, Math.min(rawIndex, playingQueue.length - 1));

      if (
        targetIndex === activeQueueIndex ||
        targetIndex === pendingArtworkTargetIndexRef.current
      ) {
        return;
      }

      // Mark that user manually scrolled the list here so useEffect doesn't fight the gesture
      userScrolledToIndexRef.current = targetIndex;
      pendingArtworkTargetIndexRef.current = targetIndex;
      handleArtworkSongChange(targetIndex);
    },
    [activeQueueIndex, artCarouselSnapInterval, handleArtworkSongChange, playingQueue.length]
  );

  const handleArtworkScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: artScrollX } } }], {
        useNativeDriver: true,
      }),
    [artScrollX]
  );

  useEffect(() => {
    if (!artCarouselRef.current || artCarouselSnapInterval <= 0 || playingQueue.length === 0) {
      return;
    }

    const songChanged = currentSongId !== prevCarouselSongIdRef.current;
    prevCarouselSongIdRef.current = currentSongId;

    if (songChanged) {
      hasAlignedArtCarouselRef.current = false;
    }

    // If the carousel was already positioned here by manual user flick, do NOT bounce back
    if (userScrolledToIndexRef.current === activeQueueIndex) {
      userScrolledToIndexRef.current = null;
      hasAlignedArtCarouselRef.current = true;
      return;
    }

    const targetOffset = activeQueueIndex * artCarouselSnapInterval;
    const shouldAnimate = hasAlignedArtCarouselRef.current && songChanged;

    try {
      artCarouselRef.current.scrollToOffset({
        offset: targetOffset,
        animated: shouldAnimate,
      });
      hasAlignedArtCarouselRef.current = true;
    } catch {
      // Ignore scroll errors
    }
  }, [activeQueueIndex, artCarouselSnapInterval, currentSongId, playingQueue.length]);

  return {
    artScrollX,
    artCarouselRef,
    handleArtworkSongChange,
    handleArtworkScrollFinished,
    handleArtworkScroll,
  };
}
