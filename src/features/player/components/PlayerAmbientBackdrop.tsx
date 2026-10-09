import type { YouTubeVideoQualityPreference } from "@/lib/storage";
import {
  ARTWORK_AMBIENT_GRADIENT_LOCATIONS,
  ARTWORK_AMBIENT_TRANSITION_DURATION_MS,
  getArtworkAmbientGradientStops,
  type ArtworkAmbientGradientStops,
  type ArtworkPalette,
} from "@/lib/colorExtractor";
import * as Animated from "@/lib/nativeAnimated";
import type { Song } from "@/lib/musicData";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
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
  trackScrollX: Animated.Value;
  activeQueueIndex: number;
  trackPageWidth: number;
  artworkPalette: ArtworkPalette;
  screenSong: Song;
  onVideoFirstFrame: () => void;
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
  trackScrollX,
  activeQueueIndex,
  trackPageWidth,
  artworkPalette,
  screenSong,
  onVideoFirstFrame,
}: PlayerAmbientBackdropProps) {
  const containerH = Math.max(
    Math.round(screenHeight * 0.90),
    Math.round(screenWidth * (16 / 9))
  ) * (isLowEnd ? 0.6 : 1);
  const hasBackground = shouldRender && Boolean(backgroundVideoId);
  const initialStops = getArtworkAmbientGradientStops(
    artworkPalette.accent,
    artworkPalette.background,
    "#000000"
  );
  const [stopsA, setStopsA] = useState<ArtworkAmbientGradientStops>(initialStops);
  const [stopsB, setStopsB] = useState<ArtworkAmbientGradientStops>(initialStops);
  const activeStopsRef = useRef<ArtworkAmbientGradientStops>(initialStops);
  const opacityA = useRef(new Animated.Value(1)).current;
  const opacityB = useRef(new Animated.Value(0)).current;
  const activeLayerRef = useRef<0 | 1>(0);

  useEffect(() => {
    const nextStops = getArtworkAmbientGradientStops(
      artworkPalette.accent,
      artworkPalette.background,
      "#000000"
    );
    if (nextStops.join("|") === activeStopsRef.current.join("|")) return;

    const nextLayer = activeLayerRef.current === 0 ? 1 : 0;
    const fadeOut = nextLayer === 0 ? opacityB : opacityA;
    const fadeIn = nextLayer === 0 ? opacityA : opacityB;
    if (nextLayer === 0) setStopsA(nextStops);
    else setStopsB(nextStops);
    activeStopsRef.current = nextStops;

    fadeOut.stopAnimation();
    fadeIn.stopAnimation();
    fadeIn.setValue(0);
    activeLayerRef.current = nextLayer;
    const transition = Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: ARTWORK_AMBIENT_TRANSITION_DURATION_MS,
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: ARTWORK_AMBIENT_TRANSITION_DURATION_MS,
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    transition.start();
    return () => transition.stop();
  }, [artworkPalette.accent, artworkPalette.background, opacityA, opacityB]);

  const containerStyle = useMemo(() => hasBackground ? [styles.backgroundYoutubeContainer, {
    height: containerH,
    opacity: trackScrollX.interpolate({
      inputRange: [(activeQueueIndex - 1) * trackPageWidth, activeQueueIndex * trackPageWidth,
        (activeQueueIndex + 1) * trackPageWidth],
      outputRange: [0, 1, 0], extrapolate: "clamp",
    }),
  }] : undefined, [hasBackground, containerH, trackScrollX, activeQueueIndex, trackPageWidth]);
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.ambientColorContainer, { height: screenHeight }]}
      >
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: opacityA }]}>
          <LinearGradient
            colors={stopsA}
            locations={ARTWORK_AMBIENT_GRADIENT_LOCATIONS}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: opacityB }]}>
          <LinearGradient
            colors={stopsB}
            locations={ARTWORK_AMBIENT_GRADIENT_LOCATIONS}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      </Animated.View>
      {hasBackground ? (
        <Animated.View pointerEvents="none" style={containerStyle}>
          <BackgroundYoutubeVideo
            key={`bg-video-${backgroundVideoId}`}
            videoId={backgroundVideoId!}
            active={isScreenFocused && !fullscreenLyricsVisible}
            initialOffsetMs={initialOffsetMs}
            isLowEnd={isLowEnd}
            quality={quality}
            song={screenSong}
            onFirstFrame={onVideoFirstFrame}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.40)", "rgba(0,0,0,0.75)", "#000000"]}
            locations={[0, 0.40, 0.75, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 320 }}
          />
        </Animated.View>
      ) : null}
    </>
  );
});

PlayerAmbientBackdrop.displayName = "PlayerAmbientBackdrop";
