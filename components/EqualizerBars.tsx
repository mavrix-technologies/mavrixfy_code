/**
 * Compact now-playing equalizer.
 * Real playback samples drive the bars when the active player exposes waveform data.
 */
import React, { useEffect, useRef } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";
import { usePlaybackAudioLevels } from "@/lib/playbackAudioLevels";

interface Props {
  isPlaying: boolean;
  color?: string;
  size?: number; // width of each bar
}

const BAR_CONFIGS = [
  { minH: 3, maxH: 14, activeScale: 0.4 },
  { minH: 3, maxH: 18, activeScale: 0.34 },
  { minH: 3, maxH: 11, activeScale: 0.46 },
];

function Bar({
  isPlaying,
  minH,
  maxH,
  activeScale,
  signalLevel,
  color,
  width,
}: {
  isPlaying: boolean;
  minH: number;
  maxH: number;
  activeScale: number;
  signalLevel: number | null;
  color: string;
  width: number;
}) {
  const minScale = minH / maxH;
  const pausedScale = (minH + 1) / maxH;
  const scaleRef = useRef<Animated.Value | null>(null);
  if (scaleRef.current === null) scaleRef.current = new Animated.Value(minScale);
  const scale = scaleRef.current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }

    const targetScale = isPlaying
      ? Math.max(minScale, signalLevel ?? activeScale)
      : pausedScale;
    const settle = Animated.timing(scale, {
      toValue: targetScale,
      duration: signalLevel == null ? 180 : 72,
      useNativeDriver: true,
      isInteraction: false,
    });
    animRef.current = settle;
    settle.start();

    return () => {
      animRef.current?.stop();
    };
  }, [activeScale, isPlaying, minScale, pausedScale, scale, signalLevel]);

  const translateY = scale.interpolate({
    inputRange: [minScale, 1],
    outputRange: [(maxH - minH) / 2, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={{
        width,
        height: maxH,
        backgroundColor: color,
        borderRadius: 1.5,
        alignSelf: "flex-end",
        transform: [{ translateY }, { scaleY: scale }],
      }}
    />
  );
}

export default function EqualizerBars({ isPlaying, color, size = 3 }: Props) {
  const barColor = color ?? Colors.primary;
  const audioLevels = usePlaybackAudioLevels();
  const signalLevels = isPlaying && audioLevels.hasSignal ? audioLevels.levels : null;

  return (
    <View style={[styles.container, { width: size * 3 + 4, height: 20 }]}>
      {BAR_CONFIGS.map((cfg, index) => (
        <Bar
          key={`${cfg.minH}-${cfg.maxH}-${cfg.activeScale}`}
          isPlaying={isPlaying}
          minH={cfg.minH}
          maxH={cfg.maxH}
          activeScale={cfg.activeScale}
          signalLevel={signalLevels?.[index] ?? null}
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
