import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PlaybackInfo } from "./PlaybackInfo";
import { AudioOutputPicker } from "./AudioOutputPicker";
import React from "react";
import { Text, View } from "react-native";
import * as Animated from "@/lib/nativeAnimated";

import { PingPongScroll } from "@/components/PingPongScroll";
import type { Song } from "@/lib/musicData";
import { usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { unescapeHtml } from "@/utils/stringUtils";
import { styles } from "../styles/playerScreenStyles";
import type { ArtworkQueueItem } from "./PlayerArtworkViews";
import {
PlayerPlayButton,
PlayerSpotifyProgress,
SmoothControlButton,
} from "./PlayerControlComponents";
import { SpotifyMotionSaveButton } from "./SpotifyMotionSaveButton";

export interface PlayerControlsSectionProps {
  screenSong: Song;
  artworkQueue?: ArtworkQueueItem[];
  activeQueueIndex?: number;
  scrollX?: Animated.Value;
  pageSnapInterval?: number;
  sheetTextColor: string;
  sheetMutedTextColor: string;
  selectedControlIconColor: string;
  sideControlIconColor: string;
  activeControlIconColor: string;
  songDetailActionBtnStyle: any;
  playerIconBtnStyle: any;
  prevNextBtnSizeStyle: any;
  isShortScreen: boolean;
  isVeryShortScreen: boolean;
  interactionReady: boolean;
  liked: boolean;
  onToggleLike: () => void;
  onOpenQueue: () => void;
  onSeekTo: (progress: number) => void;
  onSeekingChange: (isSeeking: boolean) => void;
  controlsRowGap: number;
  shuffleRepeatIconSize: number;
  prevNextIconSize: number;
  playButtonSize: number;
  playIconSize: number;
  songDetailIconSize: number;
  playerIsShuffled: boolean;
  playbackActive: boolean;
  playerRepeatMode: "off" | "all" | "one";
  onToggleShuffle: () => void;
  onSkip: (direction: "prev" | "next") => void;
  onTogglePlay: () => void;
  onToggleRepeat: () => void;
}

interface SyncedSongTitleProps {
  screenSong: Song;
  artworkQueue?: ArtworkQueueItem[];
  activeQueueIndex?: number;
  scrollX?: Animated.Value;
  pageSnapInterval?: number;
  sheetTextColor: string;
  sheetMutedTextColor: string;
  isShortScreen: boolean;
  isVeryShortScreen: boolean;
  interactionReady: boolean;
  fadeColor?: string;
}

const SyncedSongTitle = React.memo(function SyncedSongTitle({
  screenSong,
  artworkQueue,
  activeQueueIndex = 0,
  scrollX,
  pageSnapInterval,
  sheetTextColor,
  sheetMutedTextColor,
  isShortScreen,
  isVeryShortScreen,
  interactionReady,
  fadeColor = "rgba(8, 10, 16, 0.98)",
}: SyncedSongTitleProps) {
  const titleFontSize = isVeryShortScreen ? 20 : isShortScreen ? 22 : 24;
  const titleLineHeight = isVeryShortScreen ? 24 : isShortScreen ? 26 : 29;
  const artistFontSize = isVeryShortScreen ? 12 : isShortScreen ? 13 : 13.5;
  const artistLineHeight = isVeryShortScreen ? 16 : isShortScreen ? 17 : 18;

  if (scrollX && pageSnapInterval && artworkQueue && artworkQueue.length > 0) {
    const minIdx = Math.max(0, activeQueueIndex - 2);
    const maxIdx = Math.min(artworkQueue.length - 1, activeQueueIndex + 2);
    const visibleItems: { item: ArtworkQueueItem; index: number }[] = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      if (artworkQueue[i]) {
        visibleItems.push({ item: artworkQueue[i]!, index: i });
      }
    }

    return (
      <View style={styles.songTextWrap} pointerEvents="box-none">
        {visibleItems.map(({ item, index }) => {
          const isActive = index === activeQueueIndex;
          const inputRange = [
            (index - 1) * pageSnapInterval,
            index * pageSnapInterval,
            (index + 1) * pageSnapInterval,
          ];

          const slideX = scrollX.interpolate({
            inputRange,
            outputRange: [65, 0, -65],
            extrapolate: "clamp",
          });

          const slideOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0, 1, 0],
            extrapolate: "clamp",
          });

          return (
            <Animated.View
              key={item.artworkKey}
              style={[
                styles.songTextSlideItem,
                {
                  opacity: slideOpacity,
                  transform: [{ translateX: slideX }],
                },
              ]}
              pointerEvents={isActive ? "auto" : "none"}
            >
              {isActive ? (
                <>
                  <PingPongScroll
                    text={unescapeHtml(item.song.title)}
                    style={[
                      styles.songTitle,
                      {
                        color: sheetTextColor,
                        fontSize: titleFontSize,
                        lineHeight: titleLineHeight,
                        textAlign: "center",
                      },
                    ]}
                    velocity={14}
                    paused={!interactionReady}
                    showFade
                    fadeColor={fadeColor}
                    fadeWidth={22}
                    startDelay={1500}
                    endDelay={1200}
                  />

                  <PingPongScroll
                    text={unescapeHtml(item.song.artist)}
                    style={[
                      styles.songArtist,
                      {
                        color: sheetMutedTextColor,
                        fontSize: artistFontSize,
                        lineHeight: artistLineHeight,
                        textAlign: "center",
                      },
                    ]}
                    velocity={11}
                    paused={!interactionReady}
                    showFade
                    fadeColor={fadeColor}
                    fadeWidth={20}
                    startDelay={1700}
                    endDelay={1200}
                  />
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.songTitle,
                      {
                        color: sheetTextColor,
                        fontSize: titleFontSize,
                        lineHeight: titleLineHeight,
                        textAlign: "center",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {unescapeHtml(item.song.title)}
                  </Text>

                  <Text
                    style={[
                      styles.songArtist,
                      {
                        color: sheetMutedTextColor,
                        fontSize: artistFontSize,
                        lineHeight: artistLineHeight,
                        textAlign: "center",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {unescapeHtml(item.song.artist)}
                  </Text>
                </>
              )}
            </Animated.View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.songTextWrap}>
      <PingPongScroll
        text={unescapeHtml(screenSong.title)}
        style={[
          styles.songTitle,
          {
            color: sheetTextColor,
            fontSize: titleFontSize,
            lineHeight: titleLineHeight,
            textAlign: "center",
          },
        ]}
        velocity={14}
        paused={!interactionReady}
        showFade
        fadeColor={fadeColor}
        fadeWidth={22}
        startDelay={1500}
        endDelay={1200}
      />
      <PingPongScroll
        text={unescapeHtml(screenSong.artist)}
        style={[
          styles.songArtist,
          {
            color: sheetMutedTextColor,
            fontSize: artistFontSize,
            lineHeight: artistLineHeight,
            textAlign: "center",
          },
        ]}
        velocity={11}
        paused={!interactionReady}
        showFade
        fadeColor={fadeColor}
        fadeWidth={20}
        startDelay={1700}
        endDelay={1200}
      />
    </View>
  );
});

export const PlayerControlsSection = React.memo(function PlayerControlsSection({
  screenSong,
  artworkQueue,
  activeQueueIndex,
  scrollX,
  pageSnapInterval,
  sheetTextColor,
  sheetMutedTextColor,
  selectedControlIconColor,
  sideControlIconColor,
  activeControlIconColor,
  songDetailActionBtnStyle,
  playerIconBtnStyle,
  prevNextBtnSizeStyle,
  isShortScreen,
  isVeryShortScreen,
  interactionReady,
  liked,
  onToggleLike,
  onOpenQueue,
  onSeekTo,
  onSeekingChange,
  controlsRowGap,
  shuffleRepeatIconSize,
  prevNextIconSize,
  playButtonSize,
  playIconSize,
  songDetailIconSize,
  playerIsShuffled,
  playbackActive,
  playerRepeatMode,
  onToggleShuffle,
  onSkip,
  onTogglePlay,
  onToggleRepeat,
}: PlayerControlsSectionProps) {
  return (
    <View style={{ flexGrow: 0 }}>
      <View
        style={[
          styles.songBlock,
          {
            marginTop: isVeryShortScreen ? 12 : isShortScreen ? 15 : 18,
            marginHorizontal: isShortScreen ? 12 : 14,
          },
        ]}
      >
        <SmoothControlButton
          accessibilityLabel="Open playback queue"
          accessibilityRole="button"
          style={styles.songDetailCleanActionBtn}
          onPress={onOpenQueue}
          hitSlop={14}
        >
          <MaterialIcons
            name="queue-music"
            size={songDetailIconSize}
            color="rgba(255, 255, 255, 0.75)"
          />
        </SmoothControlButton>

        <SyncedSongTitle
          screenSong={screenSong}
          artworkQueue={artworkQueue}
          activeQueueIndex={activeQueueIndex}
          scrollX={scrollX}
          pageSnapInterval={pageSnapInterval}
          sheetTextColor={sheetTextColor}
          sheetMutedTextColor={sheetMutedTextColor}
          isShortScreen={isShortScreen}
          isVeryShortScreen={isVeryShortScreen}
          interactionReady={interactionReady}
        />

        <SpotifyMotionSaveButton
          liked={liked}
          onToggleLike={onToggleLike}
          iconSize={songDetailIconSize + 1}
          style={styles.songDetailCleanActionBtn}
          activeColor={selectedControlIconColor}
          inactiveColor="rgba(255, 255, 255, 0.75)"
          hitSlop={14}
          accessibilityLabel={
            liked ? "Remove from Liked Songs" : "Add to Liked Songs"
          }
        />
      </View>

      <View style={styles.playerActionStack}>
        <LivePlayerProgress
          key={screenSong.id}
          totalSongSec={screenSong.duration}
          isShortScreen={isShortScreen}
          seekTo={onSeekTo}
          onSeekingChange={onSeekingChange}
        />

        <View
          style={[
            styles.controlsRow,
            {
              marginTop: isShortScreen ? 2 : 4,
              marginHorizontal: (isShortScreen ? 16 : 20)
                - (playerIconBtnStyle.width - shuffleRepeatIconSize) / 2,
              marginBottom: isShortScreen ? 2 : 4,
              gap: controlsRowGap,
            },
          ]}
        >
          <SmoothControlButton
            style={[
              styles.roundIconButton,
              playerIconBtnStyle,
            ]}
            onPress={onToggleShuffle}
          >
              <MaterialCommunityIcons
                name="shuffle-variant"
              size={shuffleRepeatIconSize}
              color={playerIsShuffled ? selectedControlIconColor : sideControlIconColor}
            />
          </SmoothControlButton>

          <SmoothControlButton
            style={[styles.prevNextButton, prevNextBtnSizeStyle]}
            accessibilityLabel="Previous track"
            accessibilityRole="button"
            onPress={() => {
              onSkip("prev");
            }}
          >
            <MaterialCommunityIcons name="skip-previous" size={prevNextIconSize} color={activeControlIconColor} />
          </SmoothControlButton>

          <PlayerPlayButton
            buttonSize={playButtonSize}
            iconSize={playIconSize}
            active={playbackActive}
            onAccentColor="#060A0F"
            onPress={onTogglePlay}
          />

          <SmoothControlButton
            style={[styles.prevNextButton, prevNextBtnSizeStyle]}
            accessibilityLabel="Next track"
            accessibilityRole="button"
            onPress={() => {
              onSkip("next");
            }}
          >
            <MaterialCommunityIcons name="skip-next" size={prevNextIconSize} color={activeControlIconColor} />
          </SmoothControlButton>

          <SmoothControlButton
            style={[
              styles.roundIconButton,
              playerIconBtnStyle,
            ]}
            onPress={onToggleRepeat}
          >
            <MaterialCommunityIcons
              name={playerRepeatMode === "one" ? "repeat-once" : "repeat"}
              size={shuffleRepeatIconSize}
              color={playerRepeatMode !== "off" ? selectedControlIconColor : sideControlIconColor}
            />
          </SmoothControlButton>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
          <PlaybackInfo />
          <AudioOutputPicker />
        </View>
      </View>
    </View>
  );
});

PlayerControlsSection.displayName = "PlayerControlsSection";

const LivePlayerProgress = React.memo(function LivePlayerProgress(
  props: Omit<React.ComponentProps<typeof PlayerSpotifyProgress>, "progressRatio" | "totalLengthMs">
) {
  const { progress, duration, bufferedPositionMillis = 0 } = usePlaybackProgressStore();
  const { isBuffering, isLoading, desiredPlayState } = usePlaybackPlayState();
  return <PlayerSpotifyProgress {...props} progressRatio={progress} totalLengthMs={duration}
    bufferedRatio={duration > 0 ? bufferedPositionMillis / duration : 0}
    isBuffering={desiredPlayState !== false && (isBuffering || isLoading)} />;
});
