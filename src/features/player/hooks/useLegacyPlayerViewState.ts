import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useNavigation } from "expo-router";
import { Gesture } from "react-native-gesture-handler";
import { withSpring, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import type { Song } from "@/lib/musicData";
import { globalPlayerDetailsVisibleRef } from "@/lib/playerModalRef";
import { runAfterIdle } from "@/utils/idleTask";
import { preloadDominantColors } from "@/lib/colorExtractor";
import { mapFilter } from "@/lib/arrayUtils";
import {
  usePlayerProgress,
  usePlayerActions,
} from "@/contexts/PlayerContext";
import {
  usePlaybackNowPlaying,
  usePlaybackPlayState,
} from "@/services/audio/PlaybackEngine";
import { playerUIStateStore } from "@/lib/playerUIState";
import { useArtworkPaletteSync } from "./useArtworkPaletteSync";
import { useBackgroundVisualVideo } from "./useBackgroundVisualVideo";
import { useDevTrackHelper } from "./useDevTrackHelper";
import { usePlayerLayoutMetrics } from "./usePlayerLayoutMetrics";
import { usePlayerHeaderAnimation } from "./usePlayerHeaderAnimation";
import { usePlayerLiveQueue } from "./usePlayerLiveQueue";
import { useArtistDiscovery } from "./useArtistDiscovery";
import { useArtworkCarouselSync } from "./useArtworkCarouselSync";
import type { ArtworkQueueItem } from "../components/PlayerArtworkViews";

export const SPRING_CONFIG = { damping: 28, mass: 0.8, stiffness: 220 };

export function collapseOnJS() {
  playerUIStateStore.collapsePlayer();
}

export function useLegacyPlayerViewState(translateY?: SharedValue<number>) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const {
    currentSong,
    queue,
    sourceQueue,
    queueIndex,
    isShuffled,
    repeatMode,
  } = usePlaybackNowPlaying();
  const playbackState = usePlaybackPlayState();

  const screenSong = currentSong ?? null;

  const {
    isLowEnd,
    backgroundVideoId,
    videoActive,
    handleVideoActive,
    isScreenFocused,
    shouldRenderBackgroundVideo,
    ambientVideoLayoutActive,
  } = useBackgroundVisualVideo({ screenSong, navigation });

  const [isProgressSeeking, setIsProgressSeeking] = useState(false);
  const [interactionReady, setInteractionReady] = useState(false);
  const prevSongIdRef = useRef(currentSong?.id);
  const optionsPressLockRef = useRef(false);
  const { positionMillis, duration, progress } = usePlayerProgress();
  const [fullscreenLyricsVisible, setFullscreenLyricsVisible] = useState(false);

  const {
    togglePlay,
    playSong,
    nextSong,
    prevSong,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    isLiked,
  } = usePlayerActions();

  const { artworkPalette } = useArtworkPaletteSync({
    screenSong,
    interactionReady,
  });

  const { isLoadingDevTrack, handleLoadDevTrack } = useDevTrackHelper(playSong);

  useEffect(() => {
    if (prevSongIdRef.current !== currentSong?.id) {
      prevSongIdRef.current = currentSong?.id;
      setIsProgressSeeking(false);
    }
  }, [currentSong?.id]);

  const currentPositionSeconds = positionMillis > 0 ? positionMillis / 1000 : ((progress || 0) * (duration || 0)) / 1000;

  const handleLyricSeek = useCallback(
    (seconds: number) => {
      const totalSec = (duration > 0 ? duration / 1000 : currentSong?.duration) || 0;
      if (totalSec > 0) {
        seekTo(Math.max(0, Math.min(1, seconds / totalSec)));
      }
    },
    [duration, currentSong?.duration, seekTo]
  );

  const playerPrimaryDismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isProgressSeeking)
        .activeOffsetY(8)
        .failOffsetY(-8)
        .failOffsetX([-40, 40])
        .onUpdate((event) => {
          if (event.translationY > 0 && translateY) {
            translateY.value = event.translationY;
          }
        })
        .onEnd((event) => {
          if (!translateY) return;
          const flickedDown = event.translationY > 15 && event.velocityY > 500;
          const draggedFarEnough = event.translationY > 80 || event.translationY > screenHeight * 0.12;

          if (draggedFarEnough || flickedDown) {
            translateY.value = withSpring(screenHeight, SPRING_CONFIG);
            scheduleOnRN(collapseOnJS);
            return;
          }

          translateY.value = withSpring(0, SPRING_CONFIG);
        }),
    [isProgressSeeking, screenHeight, translateY]
  );

  useEffect(() => {
    globalPlayerDetailsVisibleRef.setVisible(true);
    const cancelIdle = runAfterIdle(() => {
      setInteractionReady(true);
    });
    const fallbackTimer = setTimeout(() => {
      setInteractionReady(true);
    }, 300);
    return () => {
      globalPlayerDetailsVisibleRef.setVisible(false);
      cancelIdle();
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleSongOptionsPress = useCallback(() => {
    if (!screenSong || optionsPressLockRef.current) return;

    optionsPressLockRef.current = true;
    router.push({
      pathname: "/song-options",
      params: {
        song: JSON.stringify(screenSong),
        showDownload: "1",
        canRemove: "0",
        optionContext: "",
        playlistSource: "",
        playlistName: "",
      },
    });

    setTimeout(() => {
      optionsPressLockRef.current = false;
    }, 600);
  }, [screenSong]);

  const {
    topInset,
    isShortScreen,
    isVeryShortScreen,
    topBarHeight,
    prevNextButtonSize,
    prevNextIconSize,
    shuffleRepeatIconSize,
    playButtonSize,
    playIconSize,
    controlsRowGap,
    songDetailIconSize,
    bottomContentPadding,
    artSize,
    playerIconBtnStyle,
    songDetailActionBtnStyle,
    prevNextBtnSizeStyle,
    artCarouselPageWidth,
    artCarouselSnapInterval,
  } = usePlayerLayoutMetrics(screenWidth, screenHeight, insets);

  const {
    headerScrollY,
    headerBgOpacity,
    topTitleOpacity,
    topTitleTranslateY,
    scrolledTitleOpacity,
    scrolledTitleTranslateY,
  } = usePlayerHeaderAnimation();

  const { livePlayingQueue, liveActiveQueueIndex } = usePlayerLiveQueue(
    queue,
    sourceQueue,
    currentSong,
    queueIndex
  );

  const playingQueue = livePlayingQueue;
  const activeQueueIndex = liveActiveQueueIndex;

  const {
    artistDetails,
    artistLoading,
    relatedSongs,
    handleViewArtistProfile,
    handlePlayRelatedSong,
  } = useArtistDiscovery({
    screenSong,
    playingQueue,
    activeQueueIndex,
    playSong,
  });

  const artworkQueue = useMemo<ArtworkQueueItem[]>(() => {
    const occurrenceByKey = new Map<string, number>();
    return playingQueue.map((song) => {
      const baseKey = String(song.id || song.audioUrl || song.coverUrl || song.title || "artwork");
      const occurrence = occurrenceByKey.get(baseKey) ?? 0;
      occurrenceByKey.set(baseKey, occurrence + 1);
      return {
        song,
        artworkKey: occurrence === 0 ? baseKey : `${baseKey}-${occurrence}`,
      };
    });
  }, [playingQueue]);

  const playerIsPlaying = playbackState.isPlaying;
  const playerRepeatMode = repeatMode;
  const playerIsShuffled = isShuffled;

  useEffect(() => {
    const urls = mapFilter(
      [
        playingQueue[activeQueueIndex - 1]?.coverUrl,
        playingQueue[activeQueueIndex]?.coverUrl,
        playingQueue[activeQueueIndex + 1]?.coverUrl,
      ],
      (url) => url?.trim(),
      (url): url is string => Boolean(url)
    );

    if (urls.length === 0) return;
    const cacheImages = Image.prefetch;
    void cacheImages(urls, "memory-disk").catch(() => {});
    preloadDominantColors(urls);
  }, [activeQueueIndex, liveActiveQueueIndex, playingQueue]);

  const liked = screenSong ? isLiked(screenSong.id) : false;
  const queueRowHeight = isShortScreen ? 48 : 54;
  const queueViewportHeight = Math.min(
    playingQueue.length * queueRowHeight + 16,
    Math.round(screenHeight * 0.55)
  );
  const queueViewportStyle = useMemo(
    () => ({ height: queueViewportHeight }),
    [queueViewportHeight]
  );

  const sheetTextColor = Colors.text;
  const sheetMutedTextColor = "rgba(223,226,235,0.68)";
  const activeControlIconColor = "#FFFFFF";
  const sideControlIconColor = "#FFFFFF";
  const selectedControlIconColor = Colors.primary;

  const artCarouselGetItemLayout = useCallback(
    (_: ArtworkQueueItem[] | null | undefined, index: number) => ({
      length: artCarouselSnapInterval,
      offset: artCarouselSnapInterval * index,
      index,
    }),
    [artCarouselSnapInterval]
  );

  const handleQueueSongPress = useCallback(
    (song: Song) => {
      playSong(song, playingQueue);
    },
    [playSong, playingQueue]
  );

  const handleSkip = useCallback(
    (direction: "next" | "prev") => {
      if (direction === "next") {
        void nextSong();
      } else {
        void prevSong();
      }
    },
    [nextSong, prevSong]
  );

  const {
    artScrollX,
    artCarouselRef,
    handleArtworkSongChange,
    handleArtworkScrollFinished,
    handleArtworkScroll,
  } = useArtworkCarouselSync({
    playingQueue,
    activeQueueIndex,
    currentSongId: currentSong?.id,
    artCarouselSnapInterval,
    nextSong,
    prevSong,
    playSong,
  });

  const queueKeyExtractor = useCallback((item: Song, index: number) => {
    const baseKey = String(item.id || item.audioUrl || item.title || "queue-song");
    return `${baseKey}-${index}`;
  }, []);

  const getQueueItemLayout = useCallback(
    (_data: ArrayLike<Song> | null | undefined, index: number) => {
      const rowH = isShortScreen ? 48 : 54;
      return {
        length: rowH,
        offset: rowH * index,
        index,
      };
    },
    [isShortScreen]
  );

  return {
    screenWidth,
    screenHeight,
    screenSong,
    playbackState,
    artworkPalette,
    isLoadingDevTrack,
    handleLoadDevTrack,
    isProgressSeeking,
    setIsProgressSeeking,
    interactionReady,
    currentPositionSeconds,
    duration,
    progress,
    seekTo,
    handleLyricSeek,
    playerPrimaryDismissGesture,
    handleSongOptionsPress,
    topInset,
    isShortScreen,
    isVeryShortScreen,
    topBarHeight,
    shuffleRepeatIconSize,
    prevNextIconSize,
    playButtonSize,
    playIconSize,
    controlsRowGap,
    songDetailIconSize,
    bottomContentPadding,
    artSize,
    playerIconBtnStyle,
    songDetailActionBtnStyle,
    prevNextBtnSizeStyle,
    artCarouselPageWidth,
    artCarouselSnapInterval,
    headerScrollY,
    headerBgOpacity,
    topTitleOpacity,
    topTitleTranslateY,
    scrolledTitleOpacity,
    scrolledTitleTranslateY,
    playingQueue,
    activeQueueIndex,
    artistDetails,
    artistLoading,
    relatedSongs,
    handleViewArtistProfile,
    handlePlayRelatedSong,
    artworkQueue,
    playerIsPlaying,
    playerRepeatMode,
    playerIsShuffled,
    liked,
    toggleLike,
    queueViewportStyle,
    sheetTextColor,
    sheetMutedTextColor,
    activeControlIconColor,
    sideControlIconColor,
    selectedControlIconColor,
    artCarouselGetItemLayout,
    handleQueueSongPress,
    handleSkip,
    artScrollX,
    artCarouselRef,
    handleArtworkSongChange,
    handleArtworkScrollFinished,
    handleArtworkScroll,
    queueKeyExtractor,
    getQueueItemLayout,
    togglePlay,
    toggleShuffle,
    toggleRepeat,
    shouldRenderBackgroundVideo,
    isLowEnd,
    backgroundVideoId,
    videoActive,
    isScreenFocused,
    fullscreenLyricsVisible,
    setFullscreenLyricsVisible,
    positionMillis,
    handleVideoActive,
    ambientVideoLayoutActive,
  };
}
