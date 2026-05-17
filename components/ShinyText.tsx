import React, { memo, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type ShinyTextProps = {
  text: string;
  disabled?: boolean;
  speed?: number;
  delay?: number;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: "left" | "right";
  className?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

type ShineOverlayProps = {
  text: string;
  textWidth: number;
  shineWidth: number;
  direction: "left" | "right";
  progress: SharedValue<number>;
  shineColor: string;
  textStyle: StyleProp<TextStyle>;
};

const HOLD_CONFIG = { duration: 0 };

const ShineOverlay = memo(function ShineOverlay({
  text,
  textWidth,
  shineWidth,
  direction,
  progress,
  shineColor,
  textStyle,
}: ShineOverlayProps) {
  const clipStyle = useAnimatedStyle(() => {
    const translateX =
      direction === "left"
        ? interpolate(progress.value, [0, 1], [textWidth + shineWidth, -shineWidth])
        : interpolate(progress.value, [0, 1], [-shineWidth, textWidth + shineWidth]);

    return {
      opacity: interpolate(progress.value, [0, 0.08, 0.92, 1], [0, 1, 1, 0]),
      transform: [{ translateX }],
    };
  }, [direction, shineWidth, textWidth]);

  const textAnimatedStyle = useAnimatedStyle(() => {
    const translateX =
      direction === "left"
        ? interpolate(progress.value, [0, 1], [-(textWidth + shineWidth), shineWidth])
        : interpolate(progress.value, [0, 1], [shineWidth, -(textWidth + shineWidth)]);

    return {
      transform: [{ translateX }],
    };
  }, [direction, shineWidth, textWidth]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.shineClip,
        {
          width: shineWidth,
        },
        clipStyle,
      ]}
    >
      <Animated.Text
        numberOfLines={1}
        style={[
          textStyle,
          styles.shineText,
          {
            width: textWidth,
            color: shineColor,
          },
          textAnimatedStyle,
        ]}
      >
        {text}
      </Animated.Text>
    </Animated.View>
  );
});

export default function ShinyText({
  text,
  disabled = false,
  speed = 2,
  delay = 0,
  color = "#B5B5B5",
  shineColor = "#FFFFFF",
  spread = 120,
  yoyo = false,
  direction = "left",
  style,
  containerStyle,
}: ShinyTextProps) {
  const [textWidth, setTextWidth] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const progress = useSharedValue(0);
  const displayText = useMemo(() => text.toUpperCase(), [text]);
  const shineWidth = useMemo(() => {
    if (textWidth <= 0) return 0;
    const spreadRatio = Math.max(0.22, Math.min(0.5, spread / 360));
    return Math.max(28, textWidth * spreadRatio);
  }, [spread, textWidth]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => {
        if (mounted) setReducedMotion(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;

    if (disabled || reducedMotion || textWidth <= 0) {
      return;
    }

    const durationMs = Math.max(600, speed * 1000);
    const delayMs = Math.max(0, delay * 1000);
    const timingConfig = {
      duration: durationMs,
      easing: Easing.inOut(Easing.cubic),
    };

    if (yoyo) {
      progress.value = withRepeat(
        withSequence(
          withTiming(1, timingConfig),
          withDelay(delayMs, withTiming(1, HOLD_CONFIG)),
          withTiming(0, timingConfig),
          withDelay(delayMs, withTiming(0, HOLD_CONFIG))
        ),
        -1,
        false
      );
      return;
    }

    progress.value = withRepeat(
      withSequence(
        withTiming(1, timingConfig),
        withDelay(delayMs, withTiming(0, HOLD_CONFIG))
      ),
      -1,
      false
    );
  }, [delay, disabled, progress, reducedMotion, speed, textWidth, yoyo]);

  const handleTextLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.ceil(event.nativeEvent.layout.width);
    setTextWidth((current) => (current === nextWidth ? current : nextWidth));
  };

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={displayText}
      style={[styles.container, containerStyle]}
    >
      <Text
        numberOfLines={1}
        onLayout={handleTextLayout}
        style={[styles.baseText, { color }, style]}
      >
        {displayText}
      </Text>

      {!disabled && !reducedMotion && textWidth > 0 && shineWidth > 0 ? (
        <ShineOverlay
          text={displayText}
          textWidth={textWidth}
          shineWidth={shineWidth}
          direction={direction}
          progress={progress}
          shineColor={shineColor}
          textStyle={[styles.baseText, style]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignSelf: "center",
    overflow: "hidden",
  },
  baseText: {
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
  },
  shineClip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  shineText: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
});
