import type { YouTubeVideoQualityPreference } from "@/lib/storage";
import * as Animated from "@/lib/nativeAnimated";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { styles } from "../styles/playerScreenStyles";
import { BackgroundYoutubeVideo } from "./BackgroundYoutubeVideo";

export interface PlayerAmbientBackdropProps {
  shouldRender: boolean;
  screenHeight: number;
  screenWidth: number;
  isLowEnd: boolean;
  quality: YouTubeVideoQualityPreference;
  backgroundVideoId: string | null;
  isScreenFocused: boolean;
  fullscreenLyricsVisible: boolean;
  initialOffsetMs: number;
  onVideoActive: (active: boolean) => void;
  onVideoError?: (error: string) => void;
  artScrollX: Animated.Value;
  activeQueueIndex: number;
  artCarouselSnapInterval: number;
}

export const PlayerAmbientBackdrop = React.memo(function PlayerAmbientBackdrop({
  shouldRender,
  screenHeight,
  screenWidth,
  isLowEnd,
  quality,
  backgroundVideoId,
  isScreenFocused,
  fullscreenLyricsVisible,
  initialOffsetMs,
  onVideoActive,
  onVideoError,
  artScrollX,
  activeQueueIndex,
  artCarouselSnapInterval,
}: PlayerAmbientBackdropProps) {
  const containerH = Math.max(
    Math.round(screenHeight * 0.90),
    Math.round(screenWidth * (16 / 9))
  ) * (isLowEnd ? 0.6 : 1);
  const hasBackground = shouldRender && Boolean(backgroundVideoId);
  const containerStyle = useMemo(() => hasBackground ? [styles.backgroundYoutubeContainer, {
    height: containerH,
    opacity: artScrollX.interpolate({
      inputRange: [(activeQueueIndex - 1) * artCarouselSnapInterval, activeQueueIndex * artCarouselSnapInterval,
        (activeQueueIndex + 1) * artCarouselSnapInterval],
      outputRange: [0, 1, 0], extrapolate: "clamp",
    }),
  }] : undefined, [hasBackground, containerH, artScrollX, activeQueueIndex, artCarouselSnapInterval]);
  if (!shouldRender || !backgroundVideoId) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={containerStyle}
    >
      <BackgroundYoutubeVideo
        key={`bg-video-${backgroundVideoId}`}
        videoId={backgroundVideoId}
        active={isScreenFocused && !fullscreenLyricsVisible}
        initialOffsetMs={initialOffsetMs}
        containerHeight={containerH}
        isLowEnd={isLowEnd}
        quality={quality}
        onVideoActive={onVideoActive}
        onVideoError={onVideoError}
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
