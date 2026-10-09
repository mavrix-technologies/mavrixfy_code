import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { mapFilter } from "@/lib/arrayUtils";
import { scheduleArtworkPreload } from "@/lib/artworkPreload";
import type { Song } from "@/lib/musicData";
import { globalPlayerDetailsVisibleRef } from "@/lib/playerModalRef";
import {
usePlaybackNowPlaying,
usePlaybackPlayState,
} from "@/services/audio/PlaybackEngine";
import { getPlaybackProgressSnapshot } from "@/services/audio/playbackProgressStore";
import { router,useNavigation } from "expo-router";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useArtistDiscovery } from "./useArtistDiscovery";
import { usePlayerQueueSwipe } from "./usePlayerQueueCarousel";
import type { ArtworkQueueItem } from "../components/PlayerArtworkViews";
import { useArtworkPaletteSync } from "./useArtworkPaletteSync";
import { useBackgroundVisualVideo } from "./useBackgroundVisualVideo";
import { useDevTrackHelper } from "./useDevTrackHelper";
import { usePlayerLayoutMetrics } from "./usePlayerLayoutMetrics";
import { usePlayerLiveQueue } from "./usePlayerLiveQueue";

export function useLegacyPlayerViewState(interactionReady: boolean) {
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
    videoBackgroundQuality,
    backgroundVideoId,
    isScreenFocused,
    shouldRenderBackgroundVideo,
    videoBackgroundRequested,
  } = useBackgroundVisualVideo({ screenSong, navigation });

  const [isProgressSeeking, setIsProgressSeeking] = useState(false);
  const prevSongIdRef = useRef(currentSong?.id);
  const optionsPressLockRef = useRef(false);
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

  const handleLyricSeek = useCallback(
    (seconds: number) => {
      const nativeDuration = getPlaybackProgressSnapshot().duration / 1000;
      const totalSec = nativeDuration > 0 ? nativeDuration : currentSong?.duration || 0;
      if (totalSec > 0) {
        seekTo(Math.max(0, Math.min(1, seconds / totalSec)));
      }
    },
    [currentSong?.duration, seekTo]
  );

  useEffect(() => {
    globalPlayerDetailsVisibleRef.setVisible(true);
    return () => globalPlayerDetailsVisibleRef.setVisible(false);
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
    prevNextIconSize,
    shuffleRepeatIconSize,
    playButtonSize,
    playIconSize,
    controlsRowGap,
    songDetailIconSize,
    bottomContentPadding,
    trackSwipeAreaHeight,
    playerIconBtnStyle,
    songDetailActionBtnStyle,
    prevNextBtnSizeStyle,
    trackSwipePageWidth,
  } = usePlayerLayoutMetrics(screenWidth, screenHeight, insets);

  const { livePlayingQueue, liveActiveQueueIndex } = usePlayerLiveQueue(
    queue,
    sourceQueue,
    currentSong,
    queueIndex
  );

  const playingQueue = livePlayingQueue;
  const activeQueueIndex = liveActiveQueueIndex;

  const artworkQueue = useMemo<ArtworkQueueItem[]>(() => {
    const occurrenceByKey = new Map<string, number>();
    return playingQueue.map((song) => {
      const baseKey = String(song.id || song.audioUrl || song.coverUrl || song.title || "artwork");
      const occurrence = occurrenceByKey.get(baseKey) ?? 0;
      occurrenceByKey.set(baseKey, occurrence + 1);
      return { song, artworkKey: occurrence === 0 ? baseKey : `${baseKey}-${occurrence}` };
    });
  }, [playingQueue]);

  useEffect(() => {
    if (!interactionReady) return;
    const urls = mapFilter(
      [playingQueue[activeQueueIndex - 1]?.coverUrl, playingQueue[activeQueueIndex]?.coverUrl,
        playingQueue[activeQueueIndex + 1]?.coverUrl],
      (url) => url?.trim(),
      (url): url is string => Boolean(url)
    );
    if (urls.length === 0) return;
    return scheduleArtworkPreload(urls, trackSwipeAreaHeight);
  }, [activeQueueIndex, interactionReady, playingQueue, trackSwipeAreaHeight]);

  const {
    artistDetails,
    artistLoading,
    relatedSongs,
    handleViewArtistProfile,
    handlePlayRelatedSong,
  } = useArtistDiscovery({
    enabled: interactionReady,
    screenSong,
    playingQueue,
    activeQueueIndex,
    playSong,
  });

  const playerIsPlaying = playbackState.isPlaying;
  const playerRepeatMode = repeatMode;
  const playerIsShuffled = isShuffled;

  const liked = screenSong ? isLiked(screenSong.id) : false;
  const sheetTextColor = Colors.text;
  const sheetMutedTextColor = "rgba(223,226,235,0.68)";
  const activeControlIconColor = "#FFFFFF";
  const sideControlIconColor = "#FFFFFF";
  const selectedControlIconColor = Colors.primary;

  const trackSwipeGetItemLayout = useCallback(
    (_: ArrayLike<Song> | null | undefined, index: number) => ({
      length: trackSwipePageWidth,
      offset: trackSwipePageWidth * index,
      index,
    }),
    [trackSwipePageWidth]
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
    scrollX,
    listRef,
    handleTrackChange,
    handleScrollFinished,
    handleScroll,
  } = usePlayerQueueSwipe({
    playingQueue,
    activeQueueIndex,
    currentSongId: currentSong?.id,
    pageWidth: trackSwipePageWidth,
    nextSong,
    prevSong,
    playSong,
  });

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
    seekTo,
    handleLyricSeek,
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
    trackSwipeAreaHeight,
    playerIconBtnStyle,
    songDetailActionBtnStyle,
    prevNextBtnSizeStyle,
    trackSwipePageWidth,
    artworkQueue,
    playingQueue,
    activeQueueIndex,
    artistDetails,
    artistLoading,
    relatedSongs,
    handleViewArtistProfile,
    handlePlayRelatedSong,
    playerIsPlaying,
    playerRepeatMode,
    playerIsShuffled,
    liked,
    toggleLike,
    sheetTextColor,
    sheetMutedTextColor,
    activeControlIconColor,
    sideControlIconColor,
    selectedControlIconColor,
    trackSwipeGetItemLayout,
    handleSkip,
    scrollX,
    listRef,
    handleTrackChange,
    handleScrollFinished,
    handleScroll,
    togglePlay,
    toggleShuffle,
    toggleRepeat,
    shouldRenderBackgroundVideo,
    isLowEnd,
    videoBackgroundQuality,
    backgroundVideoId,
    isScreenFocused,
    fullscreenLyricsVisible,
    setFullscreenLyricsVisible,
    videoBackgroundRequested,
  };
}
