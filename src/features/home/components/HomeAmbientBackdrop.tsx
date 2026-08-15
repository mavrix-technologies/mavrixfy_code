import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { type Song } from "@/lib/musicData";
import { extractArtworkColors, colorWithAlpha } from "@/lib/colorExtractor";

type GradientStops = readonly [string, string, string, string];

const DEFAULT_GRADIENT_COLORS: GradientStops = [
  "#0B0F14",
  "#0B0F14",
  "#0B0F14",
  "#0B0F14",
] as const;

const GRADIENT_LOCATIONS = [0, 0.40, 0.75, 1] as const;
const GRADIENT_START = { x: 0.5, y: 0 } as const;
const GRADIENT_END = { x: 0.5, y: 1 } as const;
const TRANSITION_DURATION_MS = 850;
const TRANSITION_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

let gCachedCoverUrl: string | null = null;
let gCachedColorStops: GradientStops = DEFAULT_GRADIENT_COLORS;

interface HomeAmbientBackdropProps {
  currentSong: Song | null;
}

function buildColorStopsFromPalette(accent: string, background: string): GradientStops {
  return [
    colorWithAlpha(accent, 0.42, "rgba(38, 225, 154, 0.30)"),
    colorWithAlpha(background, 0.65, "rgba(18, 30, 26, 0.50)"),
    "rgba(11, 15, 20, 0.90)",
    "#0B0F14",
  ];
}

export function HomeAmbientBackdrop({ currentSong }: HomeAmbientBackdropProps) {
  const [colorsA, setColorsA] = useState<GradientStops>(gCachedColorStops);
  const [colorsB, setColorsB] = useState<GradientStops>(DEFAULT_GRADIENT_COLORS);

  const activeLayerRef = useRef<0 | 1>(0);
  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);

  const activeCoverUrlRef = useRef<string | null>(gCachedCoverUrl);

  const animatedStyleA = useAnimatedStyle(() => ({
    opacity: opacityA.value,
  }));

  const animatedStyleB = useAnimatedStyle(() => ({
    opacity: opacityB.value,
  }));

  useEffect(() => {
    let isCancelled = false;
    const coverUrl = currentSong?.coverUrl || null;

    if (!coverUrl) {
      if (activeCoverUrlRef.current !== null) {
        activeCoverUrlRef.current = null;
        gCachedCoverUrl = null;
        gCachedColorStops = DEFAULT_GRADIENT_COLORS;

        opacityA.value = withTiming(0, { duration: TRANSITION_DURATION_MS, easing: TRANSITION_EASING });
        opacityB.value = withTiming(0, { duration: TRANSITION_DURATION_MS, easing: TRANSITION_EASING });
      }
      return;
    }

    if (coverUrl === activeCoverUrlRef.current) {
      return;
    }

    void extractArtworkColors(coverUrl)
      .then((palette) => {
        if (isCancelled) return;
        const newStops = buildColorStopsFromPalette(palette.accent, palette.background);
        activeCoverUrlRef.current = coverUrl;
        gCachedCoverUrl = coverUrl;
        gCachedColorStops = newStops;

        if (activeLayerRef.current === 0) {
          setColorsB(newStops);
          activeLayerRef.current = 1;
          opacityB.value = withTiming(1, { duration: TRANSITION_DURATION_MS, easing: TRANSITION_EASING });
          opacityA.value = withTiming(0, { duration: TRANSITION_DURATION_MS, easing: TRANSITION_EASING });
        } else {
          setColorsA(newStops);
          activeLayerRef.current = 0;
          opacityA.value = withTiming(1, { duration: TRANSITION_DURATION_MS, easing: TRANSITION_EASING });
          opacityB.value = withTiming(0, { duration: TRANSITION_DURATION_MS, easing: TRANSITION_EASING });
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [currentSong?.coverUrl, opacityA, opacityB]);

  return (
    <View style={styles.topGlowContainer} pointerEvents="none">
      <Animated.View style={[styles.gradientFill, animatedStyleA]}>
        <LinearGradient
          colors={colorsA}
          locations={GRADIENT_LOCATIONS}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.gradientFill}
        />
      </Animated.View>
      <Animated.View style={[styles.gradientFill, animatedStyleB]}>
        <LinearGradient
          colors={colorsB}
          locations={GRADIENT_LOCATIONS}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.gradientFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  topGlowContainer: {
    position: "absolute",
    top: -300,
    left: 0,
    right: 0,
    height: 780,
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
  },
});
