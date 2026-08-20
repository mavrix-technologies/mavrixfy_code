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

// 3 bars — matches Spotify's look closely
const BARS = [
  { id: "bar-1", minH: 3,  maxH: 14, duration: 380 },
  { id: "bar-2", minH: 6,  maxH: 18, duration: 300 },
  { id: "bar-3", minH: 4,  maxH: 12, duration: 440 },
] as const;

const MAX_HEIGHT = 18; // tallest possible bar (container height)

const Bar = React.memo(function Bar({
  isPlaying,
  minH,
  maxH,
  duration,
  color,
  width,
}: {
  isPlaying: boolean;
  minH: number;
  maxH: number;
  duration: number;
  color: string;
  width: number;
}) {
  const height = useSharedValue(minH);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimation(height);
      height.value = withTiming(minH, { duration: 220, easing: Easing.out(Easing.quad) });
      return;
    }

    height.value = withRepeat(
      withSequence(
        withTiming(maxH, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(minH, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(height);
    };
  }, [isPlaying, minH, maxH, duration, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          backgroundColor: color,
          borderRadius: width / 2,
          alignSelf: "flex-end",
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
          minH={cfg.minH}
          maxH={cfg.maxH}
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
