import { FullscreenKaraokeModal } from "@/components/FullscreenKaraokeModal";
import { IS_ANDROID,IS_IOS } from "@/constants/platform";
import { useAppIsActive } from "@/lib/appActivity";
import type { Song } from "@/lib/musicData";
import * as Animated from "@/lib/nativeAnimated";
import { playerUIStateStore,type PlayerUIState } from "@/lib/playerUIState";
import { usePlaybackNowPlaying } from "@/services/audio/PlaybackEngine";
import { getPlaybackProgressSnapshot,usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { safeGoBack } from "@/utils/navigation";
import { LinearGradient } from "expo-linear-gradient";
import React,{ memo,useCallback,useEffect,useMemo,useState } from "react";
import {
BackHandler,
ScrollView,
StyleSheet,
View,
useWindowDimensions,
type NativeScrollEvent,
type NativeSyntheticEvent,
} from "react-native";
import { Gesture,GestureDetector } from "react-native-gesture-handler";
import Reanimated,{
useAnimatedStyle,
useSharedValue,
withSpring,
type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { PlayerAmbientBackdrop } from "../components/PlayerAmbientBackdrop";
import { PlayerArtworkCarousel } from "../components/PlayerArtworkCarousel";
import { CinematicPlayerBackground } from "../components/PlayerArtworkViews";
import { PlayerBottomDetailsSection } from "../components/PlayerBottomDetailsSection";
import { PlayerControlsSection } from "../components/PlayerControlsSection";
import { QueueSongRow } from "../components/PlayerDiscoverySections";
import { PlayerEmptyState } from "../components/PlayerEmptyState";
import { PlayerStickyHeader } from "../components/PlayerStickyHeader";
import {
SPRING_CONFIG,
collapseOnJS,
useLegacyPlayerViewState,
} from "../hooks/useLegacyPlayerViewState";
import { styles } from "../styles/playerScreenStyles";

const AnimatedPlayerScrollView = Animated.createAnimatedComponent(ScrollView);

function LegacyPlayerScreenView({ translateY }: { translateY?: SharedValue<number> }) {
  const s = useLegacyPlayerViewState(translateY);
  const ambientStartPositionMs = useMemo(
    () => getPlaybackProgressSnapshot().positionMillis,
    [s.backgroundVideoId, s.screenSong?.id]
  );

  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);

  const handlePlayerScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset?.y ?? 0;
    const scrolled = y > 50;
    setIsHeaderScrolled((prev) => (prev !== scrolled ? scrolled : prev));
  }, []);

  const renderQueueItem = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <QueueSongRow
        item={item}
        index={index}
        isCurrent={index === s.activeQueueIndex}
        isShortScreen={s.isShortScreen}
        active={s.playerIsPlaying}
        onPress={s.handleQueueSongPress}
      />
    ),
    [s.activeQueueIndex, s.handleQueueSongPress, s.isShortScreen, s.playerIsPlaying]
  );

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
        <View style={StyleSheet.absoluteFillObject}>
          <CinematicPlayerBackground />
        </View>

        {!s.shouldRenderBackgroundVideo ? (
          <View
            pointerEvents="none"
            style={[
              styles.lowerDarkBackdrop,
              { top: Math.max(180, s.topInset + s.topBarHeight + s.artSize - (s.isShortScreen ? 20 : 10)) },
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.40)", "rgba(0,0,0,0.75)", "#000000"]}
              locations={[0, 0.40, 0.75, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        ) : null}

        <View style={[styles.playerForeground, { paddingBottom: 0 }]}>
          <PlayerStickyHeader
            topInset={s.topInset}
            topBarHeight={s.topBarHeight}
            isShortScreen={s.isShortScreen}
            headerScrollY={s.headerScrollY}
            headerBgOpacity={s.headerBgOpacity}
            topTitleOpacity={s.topTitleOpacity}
            topTitleTranslateY={s.topTitleTranslateY}
            scrolledTitleOpacity={s.scrolledTitleOpacity}
            scrolledTitleTranslateY={s.scrolledTitleTranslateY}
            sheetTextColor={s.sheetTextColor}
            albumName={s.screenSong.album || "Single"}
            songTitle={s.screenSong.title || ""}
            songArtist={s.screenSong.artist || ""}
            accentColor={s.artworkPalette.accent}
            backgroundColor={s.artworkPalette.background}
            isScrolled={isHeaderScrolled}
            isPlaying={s.playerIsPlaying}
            onClose={safeGoBack}
            onOptionsPress={s.handleSongOptionsPress}
            onTogglePlay={s.togglePlay}
          />

          <AnimatedPlayerScrollView
            style={styles.playerScroll}
            contentContainerStyle={[styles.playerScrollContent, { paddingBottom: s.bottomContentPadding }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={!s.isProgressSeeking}
            keyboardShouldPersistTaps="handled"
            bounces={IS_IOS}
            alwaysBounceVertical={IS_IOS}
            overScrollMode="never"
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: s.headerScrollY } } }],
              { useNativeDriver: true, listener: handlePlayerScroll }
            )}
          >
            <PlayerAmbientBackdrop
              shouldRender={s.shouldRenderBackgroundVideo}
              screenHeight={s.screenHeight}
              screenWidth={s.screenWidth}
              isLowEnd={s.isLowEnd}
              backgroundVideoId={s.backgroundVideoId}
              isScreenFocused={s.isScreenFocused}
              playerIsPlaying={s.playerIsPlaying}
              fullscreenLyricsVisible={s.fullscreenLyricsVisible}
              initialOffsetMs={ambientStartPositionMs}
              onVideoActive={s.handleVideoActive}
              onVideoError={s.handleVideoError}
              artScrollX={s.artScrollX}
              activeQueueIndex={s.activeQueueIndex}
              artCarouselSnapInterval={s.artCarouselSnapInterval}
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
              <GestureDetector gesture={s.playerPrimaryDismissGesture}>
                <View style={styles.playerPrimaryStack}>
                  <PlayerArtworkCarousel
                    artCarouselRef={s.artCarouselRef}
                    artworkQueue={s.artworkQueue}
                    artCarouselSnapInterval={s.artCarouselSnapInterval}
                    artCarouselPageWidth={s.artCarouselPageWidth}
                    artSize={s.artSize}
                    activeQueueIndex={s.activeQueueIndex}
                    artScrollX={s.artScrollX}
                    playingQueueLength={s.playingQueue.length}
                    isProgressSeeking={s.isProgressSeeking}
                    ambientVideoLayoutActive={s.ambientVideoLayoutActive}
                    onArtworkSongChange={s.handleArtworkSongChange}
                    onScroll={s.handleArtworkScroll}
                    onMomentumScrollEnd={s.handleArtworkScrollFinished}
                    artCarouselGetItemLayout={s.artCarouselGetItemLayout}
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
              </GestureDetector>
            </View>

            <PlayerBottomDetailsSection
              screenSong={s.screenSong}
              playbackActive={s.playbackState.isPlaying}
              accentColor={s.artworkPalette.accent}
              onTogglePlay={s.togglePlay}
              onLyricSeek={s.handleLyricSeek}
              onToggleFullScreenLyrics={() => s.setFullscreenLyricsVisible(true)}
              ambientVideoLayoutActive={s.ambientVideoLayoutActive}
              isShortScreen={s.isShortScreen}
              queueViewportStyle={s.queueViewportStyle}
              playingQueue={s.playingQueue}
              queueKeyExtractor={s.queueKeyExtractor}
              renderQueueItem={renderQueueItem}
              getQueueItemLayout={s.getQueueItemLayout}
              artistDetails={s.artistDetails}
              artistLoading={s.artistLoading}
              onViewArtistProfile={s.handleViewArtistProfile}
              relatedSongs={s.relatedSongs}
              onPlayRelatedSong={s.handlePlayRelatedSong}
            />
          </AnimatedPlayerScrollView>
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

  const [uiState, setUiState] = useState<PlayerUIState>(() => playerUIStateStore.current);

  useEffect(() => playerUIStateStore.subscribe(setUiState), []);

  useEffect(() => {
    if (activeSong && playerUIStateStore.current === "hidden") {
      playerUIStateStore.showMini();
    } else if (!activeSong && playerUIStateStore.current !== "hidden") {
      playerUIStateStore.hidePlayer();
    }
  }, [activeSong]);

  const translateY = useSharedValue(screenHeight);

  useEffect(() => {
    if (uiState === "expanded") {
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else if (uiState === "mini" || uiState === "hidden") {
      translateY.value = withSpring(screenHeight, SPRING_CONFIG);
    }
  }, [uiState, screenHeight, translateY]);

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

  /* eslint-disable react-hooks/immutability -- Gesture callbacks update Reanimated shared values after render. */
  const panGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-8)
    .failOffsetX([-35, 35])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 100 || (e.translationY > 20 && e.velocityY > 500)) {
        translateY.value = withSpring(screenHeight, SPRING_CONFIG);
        scheduleOnRN(collapseOnJS);
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });
  /* eslint-enable react-hooks/immutability */

  const containerStyle = useAnimatedStyle(() => {
    const isHidden = translateY.value >= screenHeight - 100;
    return {
      transform: [{ translateY: Math.max(0, translateY.value) }],
      opacity: isHidden ? 0 : 1,
    };
  });

  if (!activeSong || uiState !== "expanded" || !foreground) return null;

  const isExpanded = uiState === "expanded";

  return (
    <Reanimated.View
      pointerEvents={isExpanded ? "auto" : "none"}
      style={[
        styles.sheetContainer,
        StyleSheet.absoluteFillObject,
        containerStyle,
      ]}
    >
      <GestureDetector gesture={panGesture}>
        <Reanimated.View style={styles.contentWrap}>
          <LegacyPlayerScreenView translateY={translateY} />
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  );
});

PlayerScreen.displayName = "PlayerScreen";

export default PlayerScreen;
