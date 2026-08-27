import React, { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

interface MavrixfyRefreshIndicatorProps {
  progress: SharedValue<number>;
  refreshing: boolean;
  topOffset?: number;
}

export const MavrixfyRefreshIndicator = memo(function MavrixfyRefreshIndicator({
  progress,
  refreshing,
  topOffset = 100,
}: MavrixfyRefreshIndicatorProps) {
  const continuousRotation = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      continuousRotation.value = 0;
      continuousRotation.value = withRepeat(
        withTiming(360, {
          duration: 850,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    } else {
      continuousRotation.value = 0;
    }
  }, [refreshing, continuousRotation]);

  const rotationStyle = useAnimatedStyle(() => {
    if (refreshing) {
      return {
        transform: [{ rotate: `${continuousRotation.value}deg` }],
      };
    }
    return {
      transform: [{ rotate: `${progress.value * 360}deg` }],
    };
  });

  const containerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const isVisible = p > 0.04 || refreshing;
    const opacity = refreshing ? 1 : Math.min(1, p * 1.25);
    const scale = refreshing ? 1 : 0.75 + p * 0.25;
    const translateY = refreshing ? 0 : -8 + p * 8;

    return {
      opacity: isVisible ? withTiming(opacity, { duration: 120 }) : withTiming(0, { duration: 180 }),
      transform: [{ translateY }, { scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { top: topOffset },
        containerStyle,
      ]}
    >
      <Animated.View style={[styles.spinner, rotationStyle]}>
        <View style={styles.arc} />
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  spinner: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  arc: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.8,
    borderTopColor: "#FFFFFF",
    borderBottomColor: "#FFFFFF",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});

export default MavrixfyRefreshIndicator;
