import type { Song } from "@/lib/musicData";
import * as Animated from "@/lib/nativeAnimated";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import type { FlatList,NativeScrollEvent,NativeSyntheticEvent } from "react-native";
import type { ArtworkQueueItem } from "../components/PlayerArtworkViews";

export interface UsePlayerQueueSwipeParams {
  playingQueue: Song[];
  activeQueueIndex: number;
  currentSongId: string | undefined;
  pageWidth: number;
  playSong: (song: Song, queue: Song[]) => void;
}

export function usePlayerQueueSwipe({
  playingQueue,
  activeQueueIndex,
  currentSongId,
  pageWidth,
  playSong,
}: UsePlayerQueueSwipeParams) {
  const [scrollX] = useState(() => new Animated.Value(activeQueueIndex * pageWidth));
  const listRef = useRef<FlatList<ArtworkQueueItem> | null>(null);
  const hasAlignedListRef = useRef(false);
  const prevListSongIdRef = useRef(currentSongId);
  const pendingTargetIndexRef = useRef<number | null>(null);
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

  const handleTrackChange = useCallback(
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
    pendingTargetIndexRef.current = activeQueueIndex;
  }, [activeQueueIndex]);

  const handleScrollFinished = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (playingQueue.length <= 1 || pageWidth <= 0) {
        return;
      }

      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      const targetIndex = Math.max(0, Math.min(rawIndex, playingQueue.length - 1));

      if (
        targetIndex === activeQueueIndex ||
        targetIndex === pendingTargetIndexRef.current
      ) {
        return;
      }

      // Mark that user manually scrolled the list here so useEffect doesn't fight the gesture
      userScrolledToIndexRef.current = targetIndex;
      pendingTargetIndexRef.current = targetIndex;
      handleTrackChange(targetIndex);
    },
    [activeQueueIndex, pageWidth, handleTrackChange, playingQueue.length]
  );

  const handleScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
      }),
    [scrollX]
  );

  useEffect(() => {
    if (!listRef.current || pageWidth <= 0 || playingQueue.length === 0) {
      return;
    }

    const songChanged = currentSongId !== prevListSongIdRef.current;
    prevListSongIdRef.current = currentSongId;

    if (songChanged) {
      hasAlignedListRef.current = false;
    }

    // If the carousel was already positioned here by manual user flick, do NOT bounce back
    if (userScrolledToIndexRef.current === activeQueueIndex) {
      userScrolledToIndexRef.current = null;
      hasAlignedListRef.current = true;
      return;
    }

    const targetOffset = activeQueueIndex * pageWidth;
    const shouldAnimate = hasAlignedListRef.current && songChanged;

    try {
      listRef.current.scrollToOffset({
        offset: targetOffset,
        animated: shouldAnimate,
      });
      hasAlignedListRef.current = true;
    } catch {
      // Ignore scroll errors
    }
  }, [activeQueueIndex, pageWidth, currentSongId, playingQueue.length]);

  return {
    scrollX,
    listRef,
    handleTrackChange,
    handleScrollFinished,
    handleScroll,
  };
}
