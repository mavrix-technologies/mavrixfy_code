import { FullscreenKaraokeModal } from "@/components/FullscreenKaraokeModal";
import { IS_ANDROID,IS_IOS } from "@/constants/platform";
import { useAppIsActive } from "@/lib/appActivity";
import { collapsePlayer,playerUIStateStore,usePlayerUIState } from "@/lib/playerUIState";
import { usePlaybackNowPlaying } from "@/services/audio/PlaybackEngine";
import { getPlaybackProgressSnapshot,usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { globalQueueSheetRef } from "@/lib/queueRef";
import React,{ memo,useCallback,useEffect,useMemo,useRef,useState } from "react";
import {
BackHandler,
StyleSheet,
View,
useWindowDimensions,
} from "react-native";
import BottomSheet, { BottomSheetScrollView, useScrollEventsHandlersDefault } from "@gorhom/bottom-sheet";
import {
useSharedValue,
useAnimatedReaction,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { PlayerAmbientBackdrop } from "../components/PlayerAmbientBackdrop";
import { PlayerTrackCarousel } from "../components/PlayerTrackCarousel";
import { PlayerBottomDetailsSection } from "../components/PlayerBottomDetailsSection";
import { PlayerControlsSection } from "../components/PlayerControlsSection";
import { PlayerEmptyState } from "../components/PlayerEmptyState";
import { PlayerStickyHeader } from "../components/PlayerStickyHeader";
import { useLegacyPlayerViewState } from "../hooks/useLegacyPlayerViewState";
import { usePlayerSheetState } from "../hooks/usePlayerSheetState";
import { styles } from "../styles/playerScreenStyles";

function LegacyPlayerScreenView({ interactionReady }: { interactionReady: boolean }) {
  const s = useLegacyPlayerViewState(interactionReady);
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

  const scrollEventsHandlersHook = useMemo(() => function usePlayerScrollEvents(
    ref: Parameters<typeof useScrollEventsHandlersDefault>[0],
    offset: Parameters<typeof useScrollEventsHandlersDefault>[1]
  ) {
    const handlers = useScrollEventsHandlersDefault(ref, offset);
    return {
      ...handlers,
      handleOnScroll(event: Parameters<NonNullable<typeof handlers.handleOnScroll>>[0],
        context: Parameters<NonNullable<typeof handlers.handleOnScroll>>[1]) {
        "worklet";
        handlers.handleOnScroll?.(event, context);
        scrollY.value = Math.max(0, event.contentOffset.y);
      },
    };
  }, [scrollY]);
  useAnimatedReaction(() => scrollY.value > 50, (scrolled, previous) => {
    if (scrolled !== previous) scheduleOnRN(setIsHeaderScrolled, scrolled);
  });

  if (!s.screenSong) {
    return (
      <PlayerEmptyState
        topInset={s.topInset}
        isLoadingDevTrack={s.isLoadingDevTrack}
        onLoadDevTrack={s.handleLoadDevTrack}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.playerSheetSurface}>
        <View style={[styles.playerForeground, { paddingBottom: 0 }]}>
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
            onClose={collapsePlayer}
            onOptionsPress={s.handleSongOptionsPress}
            onTogglePlay={s.togglePlay}
          />

          <BottomSheetScrollView
            style={styles.playerScroll}
            contentContainerStyle={[styles.playerScrollContent, { paddingBottom: s.bottomContentPadding }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={!s.isProgressSeeking}
            keyboardShouldPersistTaps="handled"
            bounces={IS_IOS}
            alwaysBounceVertical={IS_IOS}
            overScrollMode="never"
            scrollEventsHandlersHook={scrollEventsHandlersHook}
          >
            <PlayerAmbientBackdrop
              shouldRender={s.shouldRenderBackgroundVideo}
              screenHeight={s.screenHeight}
              screenWidth={s.screenWidth}
              isLowEnd={s.isLowEnd}
              quality={s.videoBackgroundQuality}
              backgroundVideoId={s.backgroundVideoId}
              isScreenFocused={s.isScreenFocused}
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
                  height: s.screenHeight - (s.isShortScreen ? 48 : 58),
                  paddingTop: s.topInset + s.topBarHeight,
                  paddingBottom: 6,
                },
              ]}
            >
                <View style={styles.playerPrimaryStack}>
                  <PlayerTrackCarousel
                    listRef={s.listRef}
                    artworkQueue={s.artworkQueue}
                    pageWidth={s.trackSwipePageWidth}
                    pageSnapInterval={s.trackSwipePageWidth}
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
                    onOpenQueue={() => globalQueueSheetRef.current?.expand()}
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

            {s.interactionReady && <PlayerBottomDetailsSection
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
            />}
          </BottomSheetScrollView>
        </View>
      </View>

      <LiveFullscreenKaraokeModal
        visible={s.fullscreenLyricsVisible}
        song={s.screenSong}
        isPlaying={s.playbackState.isPlaying}
        accentColor={s.artworkPalette.accent}
        onTogglePlay={s.togglePlay}
        onSeek={s.handleLyricSeek}
        onClose={() => s.setFullscreenLyricsVisible(false)}
      />
    </View>
  );
}

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

export const PlayerScreen = memo(function PlayerScreen() {
  const foreground = useAppIsActive();
  const { height: screenHeight } = useWindowDimensions();

  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;

  const uiState = usePlayerUIState();

  useEffect(() => {
    if (activeSong && playerUIStateStore.current === "hidden") {
      playerUIStateStore.showMini();
    } else if (!activeSong && playerUIStateStore.current !== "hidden") {
      playerUIStateStore.hidePlayer();
    }
  }, [activeSong]);

  const { visible, interactionReady, onAnimate, onChange, onClose } = usePlayerSheetState(uiState);
  const snapPoints = useMemo(() => [screenHeight], [screenHeight]);
  const bottomSheetRef = useRef<React.ElementRef<typeof BottomSheet>>(null);

  useEffect(() => {
    if (!visible) return;
    if (uiState === "expanded") {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [uiState, visible]);

  useEffect(() => {
    if (!IS_ANDROID) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (playerUIStateStore.current === "expanded") {
        playerUIStateStore.collapsePlayer();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  if (!activeSong || !visible || !foreground) return null;

  return (
    <View pointerEvents="box-none" style={[styles.sheetContainer, StyleSheet.absoluteFillObject]}>
      <BottomSheet
        ref={bottomSheetRef}
        index={uiState === "expanded" ? 0 : -1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        enableContentPanningGesture
        enableOverDrag={false}
        handleComponent={null}
        backgroundStyle={{ backgroundColor: "#000000", borderRadius: 0 }}
        onAnimate={onAnimate}
        onChange={onChange}
        onClose={onClose}
      >
        <LegacyPlayerScreenView interactionReady={interactionReady} />
      </BottomSheet>
    </View>
  );
});

PlayerScreen.displayName = "PlayerScreen";

export default PlayerScreen;
