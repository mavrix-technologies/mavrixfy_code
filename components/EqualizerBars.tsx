/**
 * Spotify-style animated equalizer bars.
 * 3 bars that bounce at different heights and speeds when playing,
 * freeze at a low height when paused.
 */
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

interface Props {
  isPlaying: boolean;
  color?: string;
  size?: number; // width of each bar
}

// Each bar has its own animation config so they feel organic
// Spotify-like: slow, gentle bounce — not fast
const BAR_CONFIGS = [
  { minH: 3, maxH: 14, duration: 900 },
  { minH: 3, maxH: 18, duration: 700 },
  { minH: 3, maxH: 11, duration: 1100 },
];

function Bar({
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
  const height = useRef(new Animated.Value(minH)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }

    if (isPlaying) {
      // Bounce between minH and maxH continuously
      const bounce = Animated.loop(
        Animated.sequence([
          Animated.timing(height, {
            toValue: maxH,
            duration: duration / 2,
            useNativeDriver: false,
          }),
          Animated.timing(height, {
            toValue: minH,
            duration: duration / 2,
            useNativeDriver: false,
          }),
        ])
      );
      animRef.current = bounce;
      bounce.start();
    } else {
      // Settle to a low "paused" height
      const settle = Animated.timing(height, {
        toValue: minH + 1,
        duration: 180,
        useNativeDriver: false,
      });
      animRef.current = settle;
      settle.start();
    }

    return () => {
      animRef.current?.stop();
    };
  }, [isPlaying, height, minH, maxH, duration]);

  return (
    <Animated.View
      style={{
        width,
        height,
        backgroundColor: color,
        borderRadius: 1.5,
        alignSelf: "flex-end",
      }}
    />
  );
}

export default function EqualizerBars({ isPlaying, color, size = 3 }: Props) {
  const barColor = color ?? Colors.primary;

  return (
    <View style={[styles.container, { width: size * 3 + 4, height: 20 }]}>
      {BAR_CONFIGS.map((cfg, i) => (
        <Bar
          key={i}
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
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
});
