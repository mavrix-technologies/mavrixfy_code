import React from "react";
import * as Animated from "@/lib/nativeAnimated";
import { LinearGradient } from "expo-linear-gradient";
import { BackgroundYoutubeVideo } from "./BackgroundYoutubeVideo";
import { styles } from "../styles/playerScreenStyles";

export interface PlayerAmbientBackdropProps {
  shouldRender: boolean;
  screenHeight: number;
  screenWidth: number;
  isLowEnd: boolean;
  backgroundVideoId: string | null;
  isScreenFocused: boolean;
  playerIsPlaying: boolean;
  fullscreenLyricsVisible: boolean;
  positionMillis: number;
  onVideoActive: (active: boolean) => void;
  artScrollX: Animated.Value;
  activeQueueIndex: number;
  artCarouselSnapInterval: number;
}

export const PlayerAmbientBackdrop = React.memo(function PlayerAmbientBackdrop({
  shouldRender,
  screenHeight,
  screenWidth,
  isLowEnd,
  backgroundVideoId,
  isScreenFocused,
  playerIsPlaying,
  fullscreenLyricsVisible,
  positionMillis,
  onVideoActive,
  artScrollX,
  activeQueueIndex,
  artCarouselSnapInterval,
}: PlayerAmbientBackdropProps) {
  if (!shouldRender || !backgroundVideoId) return null;

  const containerH = Math.max(
    Math.round(screenHeight * 0.90),
    Math.round(screenWidth * (16 / 9))
  ) * (isLowEnd ? 0.6 : 1);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.backgroundYoutubeContainer,
        {
          height: containerH,
          opacity: artScrollX.interpolate({
            inputRange: [
              (activeQueueIndex - 1) * artCarouselSnapInterval,
              activeQueueIndex * artCarouselSnapInterval,
              (activeQueueIndex + 1) * artCarouselSnapInterval,
            ],
            outputRange: [0, 1, 0],
            extrapolate: "clamp",
          }),
        },
      ]}
    >
      <BackgroundYoutubeVideo
        key={`bg-video-${backgroundVideoId}`}
        videoId={backgroundVideoId}
        active={isScreenFocused && playerIsPlaying && !fullscreenLyricsVisible}
        initialOffsetMs={positionMillis}
        containerHeight={containerH}
        isLowEnd={isLowEnd}
        onVideoActive={onVideoActive}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.40)", "rgba(0,0,0,0.75)", "#000000"]}
        locations={[0, 0.40, 0.75, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -1,
          height: 320,
        }}
      />
    </Animated.View>
  );
});

PlayerAmbientBackdrop.displayName = "PlayerAmbientBackdrop";
