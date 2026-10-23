import { FullscreenKaraokeModal } from "@/components/FullscreenKaraokeModal";
import { useAppIsActive, useAppIsBackgrounded } from "@/lib/appActivity";
import { playerUIStateStore, readMiniPlayerOrigin } from "@/lib/playerUIState";
import { router, useFocusEffect, useIsFocused, useNavigation, useLocalSearchParams } from "expo-router";
import { usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { usePlayerActions } from "@/contexts/PlayerContextDefs";
import { useArtworkPalette } from "@/lib/colorExtractor";
import type { Song } from "@/lib/musicData";
import { getPlaybackProgressSnapshot,usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { globalAddSongsSheetRef } from "@/lib/addSongsSheetRef";
import React,{ memo,useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
View,
BackHandler,
useWindowDimensions,
type LayoutChangeEvent,
type NativeScrollEvent,
type NativeSyntheticEvent,
} from "react-native";
import BottomSheet, { BottomSheetScrollView, useGestureEventsHandlersDefault, type GestureEventsHandlersHookType } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useKeepAwake } from "expo-keep-awake";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { PlayerContainerTransition } from "../components/PlayerContainerTransition";
import { PlayerAmbientBackdrop } from "../components/PlayerAmbientBackdrop";
import { PlayerTrackCarousel } from "../components/PlayerTrackCarousel";
import { PlayerBottomDetailsSection } from "../components/PlayerBottomDetailsSection";
import { PlayerControlsSection } from "../components/PlayerControlsSection";
import { PlayerEmptyState } from "../components/PlayerEmptyState";
import { PlayerStickyHeader } from "../components/PlayerStickyHeader";
import { useLegacyPlayerViewState } from "../hooks/useLegacyPlayerViewState";
import { useStandByMode } from "../hooks/useStandByMode";
import { usePlayerArtworkMeasurement } from "../hooks/usePlayerArtworkMeasurement";
import { StandByOverlay } from "../components/StandByOverlay";
import { styles } from "../styles/playerScreenStyles";

type LegacyPlayerProps = {
  interactionReady: boolean;
  viewport: { width: number; height: number };
  onEnterStandBy: () => void;
  onClose: () => void;
  transitionArtworkRef: React.RefObject<View | null>;
  onArtworkLayout: () => void;
  artworkVisibility: SharedValue<number>;
  onArtworkReady: (songId: string, coverUrl: string | undefined) => void;
  scrollY: SharedValue<number>;
};

const LegacyPlayerScreenView = memo(function LegacyPlayerScreenView({ interactionReady, viewport, onEnterStandBy, onClose,
  transitionArtworkRef, onArtworkLayout, artworkVisibility, onArtworkReady, scrollY }: LegacyPlayerProps) {
  const s = useLegacyPlayerViewState(interactionReady, viewport);

  const [videoFrameSongId, setVideoFrameSongId] = useState<string | null>(null);
  const videoVisible = s.shouldRenderBackgroundVideo && videoFrameSongId === s.screenSong?.id;
  const handleVideoFirstFrame = useCallback(() => {
    setVideoFrameSongId(s.screenSong?.id || null);
  }, [s.screenSong?.id]);
  const ambientStartPositionMs = useMemo(
    () => getPlaybackProgressSnapshot().positionMillis,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reset the video offset only for a new song/video.
    [s.backgroundVideoId, s.screenSong?.id]
  );

  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const headerScrolledRef = useRef(false);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = Math.max(0, event.nativeEvent.contentOffset.y);
    scrollY.set(offset);
    const scrolled = headerScrolledRef.current ? offset > 40 : offset >= 80;
    if (headerScrolledRef.current !== scrolled) {
      headerScrolledRef.current = scrolled;
      setIsHeaderScrolled(scrolled);
    }
  }, [scrollY]);

  if (!s.screenSong) {
    return (
      <PlayerEmptyState
        topInset={s.topInset}
        isLoadingDevTrack={s.isLoadingDevTrack}
        onLoadDevTrack={s.handleLoadDevTrack}
        onClose={onClose}
      />
    );
  }

  return (
    <View style={styles.container}>
      <BottomSheetScrollView
        style={styles.playerScroll}
        contentContainerStyle={[styles.playerScrollContent, { paddingBottom: s.bottomContentPadding }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEnabled={!s.isProgressSeeking}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
        onScroll={onScroll}
        contentInsetAdjustmentBehavior="never"
      >
        <PlayerAmbientBackdrop
          shouldRender={s.shouldRenderBackgroundVideo}
          screenHeight={s.screenHeight}
          screenWidth={s.screenWidth}
          isLowEnd={s.isLowEnd}
          quality={s.videoBackgroundQuality}
          backgroundVideoId={s.backgroundVideoId}
          isScreenFocused={s.isScreenFocused && interactionReady}
          fullscreenLyricsVisible={s.fullscreenLyricsVisible}
          initialOffsetMs={ambientStartPositionMs}
          trackScrollX={s.scrollX}
          activeQueueIndex={s.activeQueueIndex}
          trackPageWidth={s.trackSwipePageWidth}
          artworkPalette={s.artworkPalette}
          screenSong={s.screenSong}
          onVideoFirstFrame={handleVideoFirstFrame}
        />
        <View
          style={[
            styles.playerContent,
            {
              height: Math.max(0, s.screenHeight - s.bottomContentPadding),
              paddingTop: s.topInset + s.topBarHeight,
              paddingBottom: 6,
            },
          ]}
        >
            <View style={styles.playerPrimaryStack}>
              <PlayerTrackCarousel
                listRef={s.listRef}
                artworkQueue={s.artworkQueue}
                cardWidth={s.trackSwipeCardWidth}
                cardGap={s.trackSwipeCardGap}
                pageSnapInterval={s.trackSwipeSnapInterval}
                sideInset={s.trackSwipeSideInset}
                artworkSize={s.trackSwipeAreaHeight}
                activeQueueIndex={s.activeQueueIndex}
                scrollX={s.scrollX}
                isProgressSeeking={s.isProgressSeeking}
                videoVisible={videoVisible}
                onTrackPress={s.handleTrackChange}
                onScroll={s.handleScroll}
                onMomentumScrollEnd={s.handleScrollFinished}
                getItemLayout={s.trackSwipeGetItemLayout}
                transitionArtworkRef={transitionArtworkRef}
                onArtworkLayout={onArtworkLayout}
                artworkVisibility={artworkVisibility}
                onArtworkReady={onArtworkReady}
              />

              <PlayerControlsSection
                screenSong={s.screenSong}
                artworkQueue={s.artworkQueue}
                activeQueueIndex={s.activeQueueIndex}
                scrollX={s.scrollX}
                pageSnapInterval={s.trackSwipeSnapInterval}
                sheetTextColor={s.sheetTextColor}
                sheetMutedTextColor={s.sheetMutedTextColor}
                selectedControlIconColor={s.selectedControlIconColor}
                sideControlIconColor={s.sideControlIconColor}
                activeControlIconColor={s.activeControlIconColor}
                songDetailActionBtnStyle={s.songDetailActionBtnStyle}
                playerIconBtnStyle={s.playerIconBtnStyle}
                prevNextBtnSizeStyle={s.prevNextBtnSizeStyle}
                isShortScreen={s.isShortScreen}
                isVeryShortScreen={s.isVeryShortScreen}
                interactionReady={s.interactionReady}
                liked={s.liked}
                onToggleLike={() => s.toggleLike(s.screenSong!)}
                onOpenQueue={() => router.navigate("/queue")}
                onSeekTo={s.seekTo}
                onSeekingChange={s.setIsProgressSeeking}
                controlsRowGap={s.controlsRowGap}
                shuffleRepeatIconSize={s.shuffleRepeatIconSize}
                prevNextIconSize={s.prevNextIconSize}
                playButtonSize={s.playButtonSize}
                playIconSize={s.playIconSize}
                songDetailIconSize={s.songDetailIconSize}
                playerIsShuffled={s.playerIsShuffled}
                playbackActive={s.playerIsPlaying}
                playerRepeatMode={s.playerRepeatMode}
                onToggleShuffle={s.toggleShuffle}
                onSkip={s.handleSkip}
                onTogglePlay={s.togglePlay}
                onToggleRepeat={s.toggleRepeat}
              />
            </View>
        </View>

        {s.screenSong && (
          <PlayerBottomDetailsSection
            screenSong={s.screenSong}
            playbackActive={s.playbackState.isPlaying}
            accentColor={s.artworkPalette.accent}
            onTogglePlay={s.togglePlay}
            onLyricSeek={s.handleLyricSeek}
            onToggleFullScreenLyrics={() => s.setFullscreenLyricsVisible(true)}
            artistDetails={s.artistDetails}
            artistLoading={s.artistLoading}
            onViewArtistProfile={s.handleViewArtistProfile}
            relatedSongs={s.relatedSongs}
            onPlayRelatedSong={s.handlePlayRelatedSong}
          />
        )}
      </BottomSheetScrollView>
      <PlayerStickyHeader
        topInset={s.topInset}
        topBarHeight={s.topBarHeight}
        isShortScreen={s.isShortScreen}
        scrollY={scrollY}
        sheetTextColor={s.sheetTextColor}
        albumName={s.screenSong.album || "Single"}
        songTitle={s.screenSong.title || ""}
        songArtist={s.screenSong.artist || ""}
        accentColor={s.artworkPalette.accent}
        backgroundColor={s.artworkPalette.background}
        isScrolled={isHeaderScrolled}
        isPlaying={s.playerIsPlaying}
        onClose={onClose}
        onOptionsPress={s.handleSongOptionsPress}
        onEnterStandBy={onEnterStandBy}
        onTogglePlay={s.togglePlay}
      />



      {s.fullscreenLyricsVisible && <LiveFullscreenKaraokeModal
        visible={s.fullscreenLyricsVisible}
        song={s.screenSong}
        isPlaying={s.playbackState.isPlaying}
        accentColor={s.artworkPalette.accent}
        onTogglePlay={s.togglePlay}
        onSeek={s.handleLyricSeek}
        onClose={() => s.setFullscreenLyricsVisible(false)}
      />}
    </View>
  );
});

const LiveFullscreenKaraokeModal = memo(function LiveFullscreenKaraokeModal(
  props: Omit<React.ComponentProps<typeof FullscreenKaraokeModal>, "currentPositionSeconds" | "durationSeconds">
) {
  const { positionMillis, duration } = usePlaybackProgressStore();
  return (
    <FullscreenKaraokeModal
      {...props}
      currentPositionSeconds={positionMillis / 1000}
      durationSeconds={duration > 0 ? duration / 1000 : props.song?.duration || 0}
    />
  );
});

function StandByKeepAwake() {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  return null;
}

const PLAYER_SNAP_POINTS = ["100%"];

export const PlayerScreen = memo(function PlayerScreen() {
  const foreground = useAppIsActive();
  const backgrounded = useAppIsBackgrounded();
  const focused = useIsFocused();
  const navigation = useNavigation();
  const { miniOrigin } = useLocalSearchParams<{ miniOrigin?: string }>();
  const dismissedRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [canLeave, setCanLeave] = useState(false);
  const pendingAction = useRef<NavigationAction | null>(null);
  const routeRef = useRef<View>(null);
  const [routeOffset, setRouteOffset] = useState<{ x: number; y: number } | null>(() => ({ x: 0, y: 0 }));
  const scrollY = useSharedValue(0);
  const { width, height } = useWindowDimensions();
  // Seed the first frame; BottomSheet's hosting container keeps the measured
  // height and window offsets current through layout changes and rotation.
  const containerLayoutState = useSharedValue({
    height,
    offset: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({ width, height }));
  const closeFrameRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (closeFrameRef.current !== null) cancelAnimationFrame(closeFrameRef.current);
  }, []);
  const finishClose = useCallback(() => {
    // Reveal the original dock underneath the finished overlay before popping.
    playerUIStateStore.collapsePlayer();
    closeFrameRef.current = requestAnimationFrame(() => setCanLeave(true));
  }, []);
  useEffect(() => {
    if (!canLeave) return;
    if (pendingAction.current) navigation.dispatch(pendingAction.current);
    else if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/(tabs)");
  }, [canLeave, navigation]);
  const closePlayer = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    playerUIStateStore.beginCollapse();
    setClosing(true);
  }, []);
  usePreventRemove(!canLeave, ({ data }) => {
    pendingAction.current = data.action;
    closePlayer();
  });
  useFocusEffect(useCallback(() => {
    playerUIStateStore.expandPlayer();
    return () => playerUIStateStore.collapsePlayer();
  }, []));

  const { currentSong, queue, queueIndex, isShuffled, repeatMode } = usePlaybackNowPlaying();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const [origin] = useState(() => readMiniPlayerOrigin(miniOrigin, activeSong?.id));
  const [openComplete, setOpenComplete] = useState(!origin);
  const artworkVisibility = useSharedValue(origin ? 0 : 1);
  const [readyArtwork, setReadyArtwork] = useState<string | null>(null);
  const onArtworkReady = useCallback((songId: string, coverUrl: string | undefined) => {
    setReadyArtwork(JSON.stringify([songId, coverUrl]));
  }, []);
  const destinationArtworkReady = readyArtwork === JSON.stringify([activeSong?.id, activeSong?.coverUrl]);
  const standBy = useStandByMode({ isPlayerExpanded: focused && Boolean(activeSong), viewport });
  const { isStandByActive } = standBy;
  const [playerViewport, setPlayerViewport] = useState(viewport);
  if (!isStandByActive && playerViewport !== viewport) setPlayerViewport(viewport);
  const { contentRef, transitionArtworkRef, artwork, measureArtwork } = usePlayerArtworkMeasurement(playerViewport);
  const finishOpen = useCallback(() => {
    setOpenComplete(true);
    measureArtwork();
  }, [measureArtwork]);
  const moving = Boolean(origin) && (!openComplete || closing);
  const handleMeasureArtwork = useCallback(() => {
    if (moving && artwork) return;
    measureArtwork();
  }, [artwork, measureArtwork, moving]);
  // Keep the existing sheet/scroll gesture arbitration. At its top detent a
  // downward release requests the same reverse morph, rather than a second slide.
  const useMorphGestureHandlers: GestureEventsHandlersHookType = function useMorphGestureHandlers() {
    const handlers = useGestureEventsHandlersDefault();
    const handleOnEnd: typeof handlers.handleOnEnd = (source, event) => {
      "worklet";
      handlers.handleOnEnd(source, event);
      if (scrollY.get() <= 0 && (event.translationY > 65 || (event.translationY > 10 && event.velocityY > 700))) {
        scheduleOnRN(closePlayer);
      }
    };
    return { ...handlers, handleOnEnd };
  };
  // Measure the route, never the sheet's animated mask or scroll content.
  const onLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width <= 0 || layout.height <= 0) return;
    setViewport(previous => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
    if (!isStandByActive) setPlayerViewport(previous => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
    if (!moving) {
      routeRef.current?.measureInWindow((x, y) => setRouteOffset(previous => previous?.x === x && previous.y === y ? previous : { x, y }));
    }
    handleMeasureArtwork();
  }, [handleMeasureArtwork, isStandByActive, moving]);


  useEffect(() => {
    if (!standBy.isStandByActive) return;
    globalQueueSheetRef.current?.collapse();
    globalAddSongsSheetRef.current?.collapse();
  }, [standBy.isStandByActive]);

  const { isPlaying } = usePlaybackPlayState();
  const { togglePlay, nextSong, prevSong, seekTo, toggleShuffle, toggleRepeat, toggleLike, isLiked, playSong, sleepTimer } = usePlayerActions();
  const artworkPalette = useArtworkPalette(activeSong?.coverUrl);
  const handleToggleLike = useCallback(() => {
    if (activeSong) void toggleLike(activeSong);
  }, [activeSong, toggleLike]);
  const handlePlayQueueSong = useCallback((song: Song) => {
    playSong(song, queue);
  }, [playSong, queue]);

  useEffect(() => {
    if (!focused || isStandByActive || !foreground) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closePlayer();
      return true;
    });
    return () => subscription.remove();
  }, [focused, isStandByActive, foreground, closePlayer]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View ref={routeRef} collapsable={false} style={{ flex: 1 }} onLayout={onLayout}>
      <StatusBar hidden={false} style="light" />
      {standBy.isStandByActive && <StandByKeepAwake />}
      <PlayerContainerTransition origin={origin} song={activeSong} viewport={playerViewport}
        routeOffset={routeOffset} artwork={artwork} moving={moving} closing={closing}
        artworkVisibility={artworkVisibility} destinationArtworkReady={destinationArtworkReady}
        onOpenComplete={finishOpen} onCloseComplete={finishClose}>
      <View ref={contentRef} collapsable={false} style={{ flex: 1 }} onLayout={handleMeasureArtwork}>
      <BottomSheet index={0} snapPoints={PLAYER_SNAP_POINTS}
        style={styles.playerSheetFrame}
        animateOnMount={false} containerLayoutState={containerLayoutState}
        enableDynamicSizing={false} enablePanDownToClose={false} enableOverDrag={false}
        gestureEventsHandlersHook={useMorphGestureHandlers}
        backgroundStyle={{ backgroundColor: "#000000", borderRadius: 0 }}
        handleComponent={null}
        onChange={handleMeasureArtwork}
        onClose={closePlayer}>
        <View pointerEvents={isStandByActive ? "none" : "auto"}
          style={{ width: playerViewport.width, height: playerViewport.height }}>
          {!backgrounded && <LegacyPlayerScreenView viewport={playerViewport}
            interactionReady={focused && !isStandByActive && !moving} onEnterStandBy={standBy.enterStandBy} onClose={closePlayer}
            transitionArtworkRef={transitionArtworkRef} onArtworkLayout={handleMeasureArtwork}
            artworkVisibility={artworkVisibility} onArtworkReady={onArtworkReady} scrollY={scrollY} />}
        </View>
      </BottomSheet>
      </View>
      </PlayerContainerTransition>

      <StandByOverlay
        visible={standBy.isStandByActive}
        rootViewport={viewport}
        song={activeSong}
        accentColor={artworkPalette?.accent}
        ambientColor={artworkPalette?.rawDominant}
        backgroundColor={artworkPalette?.background}
        liked={activeSong ? isLiked(activeSong.id) : false}
        queue={queue}
        queueIndex={queueIndex}
        isPlaying={isPlaying}
        isShuffled={isShuffled}
        repeatMode={repeatMode}
        standByStyle={standBy.standByStyle}
        controlsDimmed={standBy.controlsDimmed}
        sleepTimerLabel={sleepTimer?.label}
        onTogglePlay={togglePlay}
        onSkipNext={nextSong}
        onSkipPrev={prevSong}
        onToggleShuffle={toggleShuffle}
        onToggleRepeat={toggleRepeat}
        onSeek={seekTo}
        onSelectStyle={standBy.selectStyle}
        onToggleLike={handleToggleLike}
        onPlayQueueSong={handlePlayQueueSong}
        onExitStandBy={standBy.exitStandBy}
        onTouchActivity={standBy.handleTouch}
      />
    </View>
    </GestureHandlerRootView>
  );
});

PlayerScreen.displayName = "PlayerScreen";

export default PlayerScreen;
