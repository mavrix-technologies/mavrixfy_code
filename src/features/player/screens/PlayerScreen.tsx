import React, { memo, useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Animated from "@/lib/nativeAnimated";
import { LinearGradient } from "expo-linear-gradient";
import { IS_ANDROID, IS_IOS } from "@/constants/platform";
import type { Song } from "@/lib/musicData";
import { safeGoBack } from "@/utils/navigation";
import { usePlaybackNowPlaying } from "@/services/audio/PlaybackEngine";
import { playerUIStateStore, type PlayerUIState } from "@/lib/playerUIState";
import { styles } from "../styles/playerScreenStyles";
import { PlayerStickyHeader } from "../components/PlayerStickyHeader";
import { PlayerArtworkCarousel } from "../components/PlayerArtworkCarousel";
import { PlayerControlsSection } from "../components/PlayerControlsSection";
import { PlayerBottomDetailsSection } from "../components/PlayerBottomDetailsSection";
import { PlayerAmbientBackdrop } from "../components/PlayerAmbientBackdrop";
import { CinematicPlayerBackground } from "../components/PlayerArtworkViews";
import { QueueSongRow } from "../components/PlayerDiscoverySections";
import { FullscreenKaraokeModal } from "@/components/FullscreenKaraokeModal";
import { PlayerEmptyState } from "../components/PlayerEmptyState";
import {
  useLegacyPlayerViewState,
  SPRING_CONFIG,
  collapseOnJS,
} from "../hooks/useLegacyPlayerViewState";

const AnimatedPlayerFlatList = Animated.createAnimatedComponent(FlatList);
const EMPTY_PLAYER_SCROLL_SONGS: Song[] = [];

function LegacyPlayerScreenView({ translateY }: { translateY?: SharedValue<number> }) {
  const s = useLegacyPlayerViewState(translateY);

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

  const renderPlayerScrollItem = useCallback(() => null, []);

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
            headerBgOpacity={s.headerBgOpacity}
            topTitleOpacity={s.topTitleOpacity}
            topTitleTranslateY={s.topTitleTranslateY}
            scrolledTitleOpacity={s.scrolledTitleOpacity}
            scrolledTitleTranslateY={s.scrolledTitleTranslateY}
            sheetTextColor={s.sheetTextColor}
            albumName={s.screenSong.album || "Single"}
            songTitle={s.screenSong.title || ""}
            songArtist={s.screenSong.artist || ""}
            onClose={safeGoBack}
            onOptionsPress={s.handleSongOptionsPress}
          />

          <AnimatedPlayerFlatList
            style={styles.playerScroll}
            data={EMPTY_PLAYER_SCROLL_SONGS}
            keyExtractor={(item: any) => item.id}
            renderItem={renderPlayerScrollItem}
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
              { useNativeDriver: true }
            )}
            ListHeaderComponent={
              <>
                <PlayerAmbientBackdrop
                  shouldRender={s.shouldRenderBackgroundVideo}
                  screenHeight={s.screenHeight}
                  screenWidth={s.screenWidth}
                  isLowEnd={s.isLowEnd}
                  backgroundVideoId={s.backgroundVideoId}
                  isScreenFocused={s.isScreenFocused}
                  playerIsPlaying={s.playerIsPlaying}
                  fullscreenLyricsVisible={s.fullscreenLyricsVisible}
                  positionMillis={s.positionMillis}
                  onVideoActive={s.handleVideoActive}
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
                        progress={s.progress}
                        totalLengthMs={s.duration}
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
                  currentPositionSeconds={s.currentPositionSeconds}
                  totalLengthSec={s.duration > 0 ? s.duration / 1000 : s.screenSong?.duration || 0}
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
              </>
            }
          />
        </View>
      </View>

      <FullscreenKaraokeModal
        visible={s.fullscreenLyricsVisible}
        song={s.screenSong}
        currentPositionSeconds={s.currentPositionSeconds}
        durationSeconds={s.duration > 0 ? s.duration / 1000 : s.screenSong?.duration || 0}
        isPlaying={s.playbackState.isPlaying}
        accentColor={s.artworkPalette.accent}
        onTogglePlay={s.togglePlay}
        onSeek={s.handleLyricSeek}
        onClose={() => s.setFullscreenLyricsVisible(false)}
      />
    </View>
  );
}

export const PlayerScreen = memo(function PlayerScreen() {
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

  const containerStyle = useAnimatedStyle(() => {
    const isHidden = translateY.value >= screenHeight - 100;
    return {
      transform: [{ translateY: Math.max(0, translateY.value) }],
      opacity: isHidden ? 0 : 1,
    };
  });

  if (!activeSong || uiState === "hidden") return null;

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
