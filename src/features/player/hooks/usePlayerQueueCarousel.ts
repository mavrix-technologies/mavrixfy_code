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
  const userScrolledToIndexRef = useRef<number | null>(null);
  const userScrollingRef = useRef(false);

  const handleTrackChange = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= playingQueue.length || targetIndex === activeQueueIndex) {
        return;
      }
      const targetSong = playingQueue[targetIndex];
      if (!targetSong) {
        return;
      }

      userScrollingRef.current = false;
      playSong(targetSong, playingQueue);
    },
    [activeQueueIndex, playSong, playingQueue]
  );

  useEffect(() => {
    userScrollingRef.current = false;
  }, [activeQueueIndex, currentSongId]);

  const handleScrollBeginDrag = useCallback(() => {
    userScrollingRef.current = true;
  }, []);

  const handleScrollFinished = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // scrollToOffset also ends with momentum events on iOS. Aligning artwork
      // after native Next must never send a second playback selection.
      if (!userScrollingRef.current) return;
      userScrollingRef.current = false;
      if (playingQueue.length <= 1 || pageWidth <= 0) return;

      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      const targetIndex = Math.max(0, Math.min(rawIndex, playingQueue.length - 1));

      if (targetIndex === activeQueueIndex) return;

      // Mark that user manually scrolled the list here so useEffect doesn't fight the gesture
      userScrolledToIndexRef.current = targetIndex;
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
    handleScrollBeginDrag,
    handleScrollFinished,
    handleScroll,
  };
}
