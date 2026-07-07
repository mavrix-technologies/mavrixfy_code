/**
 * Premium Music Equalizer Bars Component
 * Built using react-native-reanimated for 60fps native thread performance.
 * Emulates the clean, official equalizer look found in apps like Spotify and Apple Music.
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
} from "react-native-reanimated";
import Colors from "@/constants/colors";

interface Props {
  isPlaying: boolean;
  color?: string;
  size?: number; // width of each bar
}

// 4 distinct bars with different heights and speeds to look organic and professional
const BARS = [
  { minScale: 0.2, maxScale: 1.0, duration: 320 },
  { minScale: 0.2, maxScale: 0.8, duration: 420 },
  { minScale: 0.2, maxScale: 0.95, duration: 360 },
  { minScale: 0.2, maxScale: 0.7, duration: 480 },
];

function Bar({
  isPlaying,
  minScale,
  maxScale,
  duration,
  color,
  width,
  height,
}: {
  isPlaying: boolean;
  minScale: number;
  maxScale: number;
  duration: number;
  color: string;
  width: number;
  height: number;
}) {
  const scaleY = useSharedValue(minScale);

  useEffect(() => {
    if (!isPlaying) {
      // Settle down smoothly to the minimum paused scale
      scaleY.value = withTiming(minScale, { duration: 350 });
      return;
    }

    // Run infinite bounce sequence on the native thread
    scaleY.value = withRepeat(
      withSequence(
        withTiming(maxScale, { duration }),
        withTiming(minScale, { duration })
      ),
      -1, // infinite loop
      true // reverse direction (ping-pong)
    );

    return () => {
      cancelAnimation(scaleY);
    };
  }, [isPlaying, minScale, maxScale, duration, scaleY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        // Anchors the scale to the bottom of the bar
        { translateY: (height / 2) * (1 - scaleY.value) },
        { scaleY: scaleY.value },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: color,
          borderRadius: width / 2,
          alignSelf: "flex-end",
        },
        animatedStyle,
      ]}
    />
  );
}

export default function EqualizerBars({ isPlaying, color, size = 2.5 }: Props) {
  const barColor = color ?? Colors.primary;
  const gap = 1.5;
  const height = 15;
  const totalWidth = BARS.length * size + (BARS.length - 1) * gap;

  return (
    <View style={[styles.container, { width: totalWidth, height }]}>
      {BARS.map((cfg, index) => (
        <Bar
          key={`bar-${cfg.maxScale}-${cfg.duration}-${index}`}
          isPlaying={isPlaying}
          minScale={cfg.minScale}
          maxScale={cfg.maxScale}
          duration={cfg.duration}
          color={barColor}
          width={size}
          height={height}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
});
