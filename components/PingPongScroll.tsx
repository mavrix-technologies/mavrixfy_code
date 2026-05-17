import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  Platform,
  StyleProp,
  TextStyle,
  TextLayoutEventData,
} from "react-native";

interface PingPongScrollProps {
  text: string;
  className?: string;
  style?: StyleProp<TextStyle>;
  velocity?: number;
  paused?: boolean;
}

export const PingPongScroll: React.FC<PingPongScrollProps> = ({
  text,
  className,
  style,
  velocity = 15,
  paused = false,
}) => {
  const [displayText, setDisplayText] = useState(text);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const animatedValue = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const previousTextRef = useRef(text);
  const GAP = 28;
  const MEASURE_WIDTH = 10000;

  useEffect(() => {
    if (previousTextRef.current === text) return;

    previousTextRef.current = text;
    contentOpacity.stopAnimation();
    contentOpacity.setValue(0.72);
    setDisplayText(text);

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

    if (paused) {
      animatedValue.setValue(0);
      setNeedsScroll(false);
      return;
    }

    const overflow = textWidth - containerWidth;
    const shouldScroll = overflow > 6 && containerWidth > 0 && textWidth > 0;

    animatedValue.setValue(0);

    if (shouldScroll) {
      setNeedsScroll(true);
      const distance = overflow + GAP;
      const duration = Math.max(900, Math.round((distance / Math.max(8, velocity)) * 1000));

      const animation = Animated.loop(
        Animated.sequence([
          Animated.delay(850),
          Animated.timing(animatedValue, {
            toValue: -distance,
            duration,
            easing: Easing.linear,
            useNativeDriver: Platform.OS !== "web",
            isInteraction: false,
          }),
          Animated.delay(500),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration,
            easing: Easing.linear,
            useNativeDriver: Platform.OS !== "web",
            isInteraction: false,
          }),
          Animated.delay(450),
        ])
      );

      animationRef.current = animation;
      animation.start();
    } else {
      setNeedsScroll(false);
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [animatedValue, containerWidth, displayText, paused, textWidth, velocity]);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  const handleTextLinesLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lineWidth = event.nativeEvent.lines[0]?.width;
    if (typeof lineWidth === "number") {
      const measuredWidth = Math.ceil(lineWidth);
      if (measuredWidth > 0 && measuredWidth !== textWidth) {
        setTextWidth(measuredWidth);
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

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
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
          <Text style={[styles.text, sanitizedTextStyle]} numberOfLines={1}>
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
            <Text style={[styles.text, sanitizedTextStyle]} numberOfLines={1}>
              {displayText}
            </Text>
          </Animated.View>
        )}
      </Animated.View>

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
  },
  measureText: {
    position: "absolute",
    opacity: 0,
    left: -9999,
    top: 0,
  },
  animatedTrack: {
    flexDirection: "row",
  },
  contentLayer: {
    width: "100%",
  },
  text: {
    flexShrink: 0,
  },
  hiddenTextFix: {
    position: "absolute",
    opacity: 0,
    width: 0,
    height: 0,
  },
});
