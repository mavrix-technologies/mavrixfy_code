import { MusicArtwork } from "@/components/MusicArtwork";
import * as Animated from "@/lib/nativeAnimated";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { styles } from "../styles/playerScreenStyles";

export interface PlayerAmbientBackdropProps {
  enabled: boolean;
  coverUrl: string;
  onArtworkLoad: () => void;
  screenHeight: number;
  screenWidth: number;
  artScrollX: Animated.Value;
  activeQueueIndex: number;
  artCarouselSnapInterval: number;
}

export const PlayerAmbientBackdrop = React.memo(function PlayerAmbientBackdrop({
  enabled,
  coverUrl,
  onArtworkLoad,
  screenHeight,
  screenWidth,
  artScrollX,
  activeQueueIndex,
  artCarouselSnapInterval,
}: PlayerAmbientBackdropProps) {
  const containerHeight = Math.max(Math.round(screenHeight * 0.9), Math.round(screenWidth * (16 / 9)));
  const containerStyle = useMemo(() => enabled ? [styles.ambientArtworkContainer, {
    height: containerHeight,
    opacity: artScrollX.interpolate({
      inputRange: [(activeQueueIndex - 1) * artCarouselSnapInterval, activeQueueIndex * artCarouselSnapInterval,
        (activeQueueIndex + 1) * artCarouselSnapInterval],
      outputRange: [0, 1, 0], extrapolate: "clamp",
    }),
  }] : undefined, [enabled, containerHeight, artScrollX, activeQueueIndex, artCarouselSnapInterval]);

  if (!enabled || !coverUrl.trim()) return null;
  return (
    <Animated.View pointerEvents="none" style={containerStyle}>
      <MusicArtwork
        uri={coverUrl}
        size={Math.max(screenWidth, containerHeight)}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="normal"
        onLoad={onArtworkLoad}
      />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.52)" }]} />
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.40)", "rgba(0,0,0,0.75)", "#000000"]}
        locations={[0, 0.40, 0.75, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 320 }}
      />
    </Animated.View>
  );
});

PlayerAmbientBackdrop.displayName = "PlayerAmbientBackdrop";
