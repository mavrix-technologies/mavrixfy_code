import { FullscreenKaraokeModal } from "@/components/FullscreenKaraokeModal";
import { useAppIsActive } from "@/lib/appActivity";
import { playerUIStateStore } from "@/lib/playerUIState";
import { router, useFocusEffect, useIsFocused, useNavigation } from "expo-router";
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
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useKeepAwake } from "expo-keep-awake";
import { useSharedValue } from "react-native-reanimated";
import { PlayerAmbientBackdrop } from "../components/PlayerAmbientBackdrop";
import { PlayerTrackCarousel } from "../components/PlayerTrackCarousel";
import { PlayerBottomDetailsSection } from "../components/PlayerBottomDetailsSection";
import { PlayerControlsSection } from "../components/PlayerControlsSection";
import { PlayerEmptyState } from "../components/PlayerEmptyState";
import { PlayerStickyHeader } from "../components/PlayerStickyHeader";
import { useLegacyPlayerViewState } from "../hooks/useLegacyPlayerViewState";
import { useStandByMode } from "../hooks/useStandByMode";
import { StandByOverlay } from "../components/StandByOverlay";
import { styles } from "../styles/playerScreenStyles";

const LegacyPlayerScreenView = memo(function LegacyPlayerScreenView({ interactionReady, viewport, onEnterStandBy, onClose }: { interactionReady: boolean; viewport: { width: number; height: number }; onEnterStandBy: () => void; onClose: () => void }) {
  const s = useLegacyPlayerViewState(interactionReady, viewport);

  const [videoFrameSongId, setVideoFrameSongId] = useState<string | null>(null);
  const videoVisible = s.shouldRenderBackgroundVideo && videoFrameSongId === s.screenSong?.id;
  const handleVideoFirstFrame = useCallback(() => {
    setVideoFrameSongId(s.screenSong?.id || null);
  }, [s.screenSong?.id]);
  const scrollY = useSharedValue(0);
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
  const focused = useIsFocused();
  const navigation = useNavigation();
  const sheetRef = useRef<BottomSheet>(null);
  const closeSheet = useCallback(() => sheetRef.current?.forceClose(), []);
  const dismissedRef = useRef(false);
  const { width, height } = useWindowDimensions();
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({ width, height }));
  const onSheetClosed = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/(tabs)");
  }, [navigation]);
  useFocusEffect(useCallback(() => {
    playerUIStateStore.expandPlayer();
    return () => playerUIStateStore.collapsePlayer();
  }, []));

  const { currentSong, queue, queueIndex, isShuffled, repeatMode } = usePlaybackNowPlaying();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;

  const standBy = useStandByMode({ isPlayerExpanded: focused && Boolean(activeSong), viewport });
  const { isStandByActive } = standBy;
  const [playerViewport, setPlayerViewport] = useState(viewport);
  if (!isStandByActive && playerViewport !== viewport) setPlayerViewport(viewport);
  // Measure the route, never the sheet's animated mask or scroll content.
  const onLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width <= 0 || layout.height <= 0) return;
    setViewport(previous => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
    if (!isStandByActive) setPlayerViewport(previous => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
  }, [isStandByActive]);


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
      closeSheet();
      return true;
    });
    return () => subscription.remove();
  }, [focused, isStandByActive, foreground, closeSheet]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <StatusBar hidden={standBy.isStandByActive} style="light" />
      {standBy.isStandByActive && <StandByKeepAwake />}
      <BottomSheet ref={sheetRef} index={0} snapPoints={PLAYER_SNAP_POINTS}
        style={styles.playerSheetFrame}
        enableDynamicSizing={false} enablePanDownToClose enableOverDrag={false}
        backgroundStyle={{ backgroundColor: "#000000", borderRadius: 0 }}
        handleComponent={null}
        onClose={onSheetClosed}>
        <View pointerEvents={isStandByActive ? "none" : "auto"}
          style={{ width: playerViewport.width, height: playerViewport.height }}>
          {foreground && <LegacyPlayerScreenView viewport={playerViewport}
            interactionReady={focused && !isStandByActive} onEnterStandBy={standBy.enterStandBy} onClose={closeSheet} />}
        </View>
      </BottomSheet>

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
    </GestureHandlerRootView>
  );
});

PlayerScreen.displayName = "PlayerScreen";

export default PlayerScreen;
