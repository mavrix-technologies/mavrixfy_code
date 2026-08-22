/**
 * Equalizer Bars — Spotify-style animated bars shown inline with the song title.
 * Runs 100% on the Reanimated UI thread (no JS frame budget used during animation).
 */
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import Colors from "@/constants/colors";

interface Props {
  isPlaying: boolean;
  color?: string;
  /** Width of each bar in dp. Default 3. */
  size?: number;
  /** Gap between bars in dp. Default 2. */
  gap?: number;
}

const MAX_HEIGHT = 18; // tallest possible bar (container height)

const BARS = [
  { id: "bar-1", minScale: 3 / MAX_HEIGHT,  maxScale: 14 / MAX_HEIGHT, duration: 380 },
  { id: "bar-2", minScale: 6 / MAX_HEIGHT,  maxScale: 18 / MAX_HEIGHT, duration: 300 },
  { id: "bar-3", minScale: 4 / MAX_HEIGHT,  maxScale: 12 / MAX_HEIGHT, duration: 440 },
] as const;

const Bar = React.memo(function Bar({
  isPlaying,
  minScale,
  maxScale,
  duration,
  color,
  width,
}: {
  isPlaying: boolean;
  minScale: number;
  maxScale: number;
  duration: number;
  color: string;
  width: number;
}) {
  const scale = useSharedValue(minScale);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimation(scale);
      scale.value = withTiming(minScale, { duration: 220, easing: Easing.out(Easing.quad) });
      return;
    }

    scale.value = withRepeat(
      withSequence(
        withTiming(maxScale, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(minScale, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(scale);
    };
  }, [isPlaying, minScale, maxScale, duration, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height: MAX_HEIGHT,
          backgroundColor: color,
          borderRadius: width / 2,
          transformOrigin: "bottom",
        },
        animatedStyle,
      ]}
    />
  );
});

const EqualizerBars = React.memo(function EqualizerBars({
  isPlaying,
  color,
  size = 3,
  gap = 2,
}: Props) {
  const barColor = color ?? Colors.primary;

  return (
    <View
      style={[
        styles.container,
        {
          height: MAX_HEIGHT,
          gap,
        },
      ]}
    >
      {BARS.map((cfg) => (
        <Bar
          key={cfg.id}
          isPlaying={isPlaying}
          minScale={cfg.minScale}
          maxScale={cfg.maxScale}
          duration={cfg.duration}
          color={barColor}
          width={size}
        />
      ))}
    </View>
  );
});
EqualizerBars.displayName = "EqualizerBars";

export default EqualizerBars;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
});
