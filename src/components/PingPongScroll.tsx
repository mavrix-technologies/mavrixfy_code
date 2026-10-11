import * as Animated from "@/lib/nativeAnimated";
import { useAppIsActive } from "@/lib/appActivity";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Easing,
  Platform,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type TextStyle,
  View,
} from "react-native";

export interface PingPongScrollProps {
  text: string;
  className?: string;
  style?: StyleProp<TextStyle>;
  velocity?: number;
  paused?: boolean;
  showFade?: boolean;
  fadeColor?: string;
  fadeWidth?: number;
  startDelay?: number;
  endDelay?: number;
}

export const PingPongScroll: React.FC<PingPongScrollProps> = ({
  text,
  className,
  style,
  velocity = 15,
  paused = false,
  showFade = false,
  fadeColor = "rgba(8, 10, 16, 0.98)",
  fadeWidth = 22,
  startDelay = 1500,
  endDelay = 1200,
}) => {
  const foreground = useAppIsActive();
  const displayText = text;
  const [containerWidth, setContainerWidth] = useState(0);
  const [measurement, setMeasurement] = useState({ text, width: 0 });
  const textWidth = measurement.text === text ? measurement.width : 0;
  const [animatedValue] = useState(() => new Animated.Value(0));
  const [contentOpacity] = useState(() => new Animated.Value(1));
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const MEASURE_WIDTH = 10000;

  // Derive overflow and needsScroll
  const overflow = Math.max(0, textWidth - containerWidth);
  const needsScroll = foreground && !paused && overflow > 6 && containerWidth > 0 && textWidth > 0;
  const distance = overflow;

  const transparentFade = useMemo(() => {
    if (fadeColor.startsWith("rgba(")) {
      return fadeColor.replace(/,\s*[\d.]+\)$/, ", 0)");
    }
    if (fadeColor.startsWith("rgb(")) {
      return fadeColor.replace("rgb(", "rgba(").replace(")", ", 0)");
    }
    return "rgba(0, 0, 0, 0)";
  }, [fadeColor]);

  // Smooth edge fade opacities:
  // At start (animatedValue = 0): leftFade is 0 (first letters crystal clear), rightFade is 1 (overflowing end softly fades)
  // While scrolling: both left and right edges softly fade
  // At end (animatedValue = -distance): leftFade is 1, rightFade is 0 (last letters crystal clear)
  const leftFadeOpacity = useMemo(() => {
    if (!needsScroll) return 0;
    return animatedValue.interpolate({
      inputRange: [-16, 0],
      outputRange: [1, 0],
      extrapolate: "clamp",
    });
  }, [needsScroll, animatedValue]);

  const rightFadeOpacity = useMemo(() => {
    if (!needsScroll || distance <= 0) return 0;
    const fadeThreshold = Math.min(0, -distance + 16);
    return animatedValue.interpolate({
      inputRange: [-distance, fadeThreshold],
      outputRange: [0, 1],
      extrapolate: "clamp",
    });
  }, [needsScroll, distance, animatedValue]);

  useEffect(() => {
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    }).start();
  }, [contentOpacity, text]);

  useEffect(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }

    animatedValue.setValue(0);

    if (!needsScroll || distance <= 0) {
      return () => {
        if (animationRef.current) {
          animationRef.current.stop();
          animationRef.current = null;
        }
      };
    }

    const duration = Math.max(1200, Math.round((distance / Math.max(10, velocity)) * 1000));
    const returnDuration = Math.max(900, Math.round((distance / Math.max(12, velocity * 1.3)) * 1000));

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(startDelay),
        Animated.timing(animatedValue, {
          toValue: -distance,
          duration,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.delay(endDelay),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: returnDuration,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.delay(500),
      ])
    );

    animationRef.current = animation;
    animation.start();

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [animatedValue, displayText, needsScroll, distance, velocity, startDelay, endDelay]);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) setContainerWidth((current) => (current === width ? current : width));
  };

  const handleTextLinesLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lineWidth = event.nativeEvent.lines[0]?.width;
    if (typeof lineWidth === "number") {
      const measuredWidth = Math.ceil(lineWidth);
      if (measuredWidth > 0 && measuredWidth !== textWidth) {
        setMeasurement({ text, width: measuredWidth });
      }
    }
  };

  const sanitizedTextStyle = useMemo(() => {
    const flat = (StyleSheet.flatten(style) || {}) as TextStyle & {
      width?: number | string;
      maxWidth?: number | string;
      minWidth?: number | string;
      flex?: number;
      flexGrow?: number;
      flexShrink?: number;
    };
    const {
      width,
      maxWidth,
      minWidth,
      flex,
      flexGrow,
      flexShrink,
      ...rest
    } = flat;
    return rest;
  }, [style]);

  const isCentered = sanitizedTextStyle.textAlign === "center";

  return (
    <View
      style={[
        styles.container,
        !needsScroll && isCentered ? { alignItems: "center" } : { alignItems: "flex-start" },
      ]}
      onLayout={handleContainerLayout}
    >
      <Text
        style={[styles.measureText, sanitizedTextStyle, { width: MEASURE_WIDTH }]}
        numberOfLines={1}
        onTextLayout={handleTextLinesLayout}
      >
        {displayText}
      </Text>

      <Animated.View
        style={[
          styles.contentLayer,
          !needsScroll && isCentered ? { alignItems: "center" } : { alignItems: "flex-start" },
          {
            opacity: contentOpacity,
            transform: [
              {
                translateY: contentOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [2, 0],
                }),
              },
            ],
          },
        ]}
      >
        {!needsScroll ? (
          <Text
            style={[
              styles.text,
              sanitizedTextStyle,
              isCentered && { width: "100%", textAlign: "center" },
            ]}
            numberOfLines={1}
          >
            {displayText}
          </Text>
        ) : (
          <Animated.View
            style={[
              styles.animatedTrack,
              textWidth > 0 ? { width: textWidth } : undefined,
              { transform: [{ translateX: animatedValue }] },
            ]}
          >
            <Text
              style={[
                styles.text,
                sanitizedTextStyle,
                { textAlign: "left" },
              ]}
              numberOfLines={1}
            >
              {displayText}
            </Text>
          </Animated.View>
        )}
      </Animated.View>

      {/* Seamless Left Edge Gradient Fade */}
      {showFade && needsScroll && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fadeEdgeLeft,
            {
              width: fadeWidth,
              opacity: leftFadeOpacity,
            },
          ]}
        >
          <LinearGradient
            colors={[fadeColor, transparentFade]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}

      {/* Seamless Right Edge Gradient Fade */}
      {showFade && needsScroll && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fadeEdgeRight,
            {
              width: fadeWidth,
              opacity: rightFadeOpacity,
            },
          ]}
        >
          <LinearGradient
            colors={[transparentFade, fadeColor]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}

      <Animated.Text
        style={styles.hiddenTextFix}
        numberOfLines={1}
      >
        {" "}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    width: "100%",
    justifyContent: "center",
    position: "relative",
  },
  measureText: {
    position: "absolute",
    opacity: 0,
    left: -9999,
    top: 0,
  },
  animatedTrack: {
    flexDirection: "row",
    alignItems: "center",
  },
  contentLayer: {
    width: "100%",
  },
  text: {
    flexShrink: 0,
  },
  fadeEdgeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  fadeEdgeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  hiddenTextFix: {
    position: "absolute",
    opacity: 0,
    width: 0,
    height: 0,
  },
});
