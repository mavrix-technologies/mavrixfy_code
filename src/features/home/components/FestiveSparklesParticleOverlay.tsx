import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

interface ParticleConfig {
  id: number;
  x: string;
  y: number;
  size: number;
  delay: number;
  duration: number;
  colorIndex: number;
}

const DEFAULT_SPARKLE_COLORS = ["#FFE899", "#FFD166", "#FFB3D9"];

const BASE_PARTICLES: ParticleConfig[] = [
  { id: 1, x: "6%", y: 22, size: 13, delay: 0, duration: 1800, colorIndex: 0 },
  { id: 2, x: "12%", y: 64, size: 10, delay: 400, duration: 2200, colorIndex: 1 },
  { id: 3, x: "8%", y: 92, size: 8, delay: 900, duration: 1600, colorIndex: 2 },
  { id: 4, x: "88%", y: 28, size: 12, delay: 200, duration: 2000, colorIndex: 0 },
  { id: 5, x: "92%", y: 68, size: 9, delay: 700, duration: 1700, colorIndex: 1 },
  { id: 6, x: "84%", y: 98, size: 11, delay: 1100, duration: 2100, colorIndex: 2 },
  { id: 7, x: "18%", y: 118, size: 7, delay: 500, duration: 1900, colorIndex: 0 },
  { id: 8, x: "80%", y: 122, size: 8, delay: 850, duration: 2300, colorIndex: 1 },
];

const SingleSparkle = React.memo(function SingleSparkle({
  particle,
  color,
}: {
  particle: ParticleConfig;
  color: string;
}) {
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(0.1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      particle.delay,
      withRepeat(
        withSequence(
          withTiming(1.2, { duration: particle.duration / 2, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
          withTiming(0.2, { duration: particle.duration / 2, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
        ),
        -1,
        false
      )
    );

    opacity.value = withDelay(
      particle.delay,
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: particle.duration / 2 }),
          withTiming(0.05, { duration: particle.duration / 2 })
        ),
        -1,
        false
      )
    );

    translateY.value = withDelay(
      particle.delay,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: particle.duration, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: particle.duration, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      )
    );
  }, [particle.delay, particle.duration, opacity, scale, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: particle.x as any,
          top: particle.y,
        },
        animStyle,
      ]}
    >
      <Ionicons name="sparkles" size={particle.size} color={color} />
    </Animated.View>
  );
});

interface FestiveSparklesParticleOverlayProps {
  colors?: string[];
}

export const FestiveSparklesParticleOverlay = React.memo(
  function FestiveSparklesParticleOverlay({ colors }: FestiveSparklesParticleOverlayProps) {
    const palette = colors && colors.length > 0 ? colors : DEFAULT_SPARKLE_COLORS;

    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {BASE_PARTICLES.map((particle) => {
          const color = palette[particle.colorIndex % palette.length];
          return <SingleSparkle key={particle.id} particle={particle} color={color} />;
        })}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  particle: {
    position: "absolute",
  },
});

export default FestiveSparklesParticleOverlay;
