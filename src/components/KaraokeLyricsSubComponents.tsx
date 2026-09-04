import React, { useCallback, useEffect, useState, memo } from "react";
import { Pressable, Text, View } from "react-native";
import * as Animated from "@/lib/nativeAnimated";
import { styles } from "./styles/karaokeLyricsStyles";
import type { LyricLine } from "@/services/lyricsService";

export const PREVIEW_LINE_HEIGHT = 44;

/**
 * Clean & Minimal Spotify-Style Pulsing 3-Dots Instrumental Break
 */
export const SpotifyInstrumentalBreak = memo(function SpotifyInstrumentalBreak({
  item,
  isActive,
  isPassed,
  onPress,
  isCompact = false,
}: {
  item: LyricLine;
  isActive: boolean;
  isPassed: boolean;
  onPress?: (time: number) => void;
  isCompact?: boolean;
}) {
  const [dot1] = useState(() => new Animated.Value(0));
  const [dot2] = useState(() => new Animated.Value(0));
  const [dot3] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (isActive) {
      const makePulse = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1,
              duration: 450,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 450,
              useNativeDriver: true,
            }),
          ])
        );
      };

      const anim1 = makePulse(dot1, 0);
      const anim2 = makePulse(dot2, 180);
      const anim3 = makePulse(dot3, 360);

      Animated.parallel([anim1, anim2, anim3]).start();

      return () => {
        anim1.stop();
        anim2.stop();
        anim3.stop();
      };
    } else {
      dot1.setValue(0);
      dot2.setValue(0);
      dot3.setValue(0);
    }
  }, [isActive, dot1, dot2, dot3]);

  const dot1Scale = dot1.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.35],
  });
  const dot1Opacity = dot1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1.0],
  });

  const dot2Scale = dot2.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.35],
  });
  const dot2Opacity = dot2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1.0],
  });

  const dot3Scale = dot3.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.35],
  });
  const dot3Opacity = dot3.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1.0],
  });

  const handlePress = useCallback(() => {
    onPress?.(item.time);
  }, [item.time, onPress]);

  return (
    <Pressable
      android_disableSound
      onPress={onPress ? handlePress : undefined}
      disabled={!onPress}
      style={[
        styles.spotifyBreakContainer,
        isCompact && styles.spotifyBreakContainerCompact,
      ]}
    >
      <View style={[styles.spotifyBreakDotsRow, isCompact && styles.spotifyBreakDotsRowCompact]}>
        <Animated.View
          style={[
            styles.spotifyBreakDot,
            isCompact && styles.spotifyBreakDotCompact,
            {
              backgroundColor: isActive || isPassed ? "#FFFFFF" : "rgba(0, 0, 0, 0.40)",
              opacity: isActive ? dot1Opacity : isPassed ? 0.70 : 0.40,
              transform: [{ scale: isActive ? dot1Scale : 1 }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.spotifyBreakDot,
            isCompact && styles.spotifyBreakDotCompact,
            {
              backgroundColor: isActive || isPassed ? "#FFFFFF" : "rgba(0, 0, 0, 0.40)",
              opacity: isActive ? dot2Opacity : isPassed ? 0.70 : 0.40,
              transform: [{ scale: isActive ? dot2Scale : 1 }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.spotifyBreakDot,
            isCompact && styles.spotifyBreakDotCompact,
            {
              backgroundColor: isActive || isPassed ? "#FFFFFF" : "rgba(0, 0, 0, 0.40)",
              opacity: isActive ? dot3Opacity : isPassed ? 0.70 : 0.40,
              transform: [{ scale: isActive ? dot3Scale : 1 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
});

/**
 * 60 FPS Spotify-Style Fullscreen Lyric Line
 */
export const SpotifyLyricLine = memo(function SpotifyLyricLine({
  item,
  isActive,
  isPassed,
  isSynced,
  onPress,
}: {
  item: LyricLine;
  isActive: boolean;
  isPassed: boolean;
  isSynced: boolean;
  onPress: (time: number) => void;
}) {
  const [animValue] = useState(() => new Animated.Value(isActive ? 2 : isPassed ? 1 : 0));

  const handlePress = useCallback(() => {
    if (isSynced) {
      onPress(item.time);
    }
  }, [isSynced, item.time, onPress]);

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: isActive ? 2 : isPassed ? 1 : 0,
      damping: 20,
      stiffness: 140,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isActive, isPassed, animValue]);

  if (item.isBreak || item.text === "♪ ♪ ♪" || !item.text?.trim()) {
    return (
      <SpotifyInstrumentalBreak
        item={item}
        isActive={isActive}
        isPassed={isPassed}
        onPress={onPress}
      />
    );
  }

  const opacity = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [isSynced ? 0.35 : 0.85, 0.72, 1.0],
  });

  const scale = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.98, 1.0, 1.025],
  });

  const translateY = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [2, 0, 0],
  });

  return (
    <Pressable
      android_disableSound
      onPress={handlePress}
      style={({ pressed }) => [
        styles.spotifyLinePressable,
        pressed && isSynced ? styles.spotifyLinePressed : null,
      ]}
    >
      <Animated.View
        style={{
          opacity,
          transform: [{ scale }, { translateY }],
        }}
      >
        <Text
          style={[
            styles.spotifyLineText,
            isActive
              ? styles.spotifyLineActive
              : isPassed
              ? styles.spotifyLinePassed
              : styles.spotifyLineUpcoming,
          ]}
        >
          {item.text || "♪ ♪ ♪"}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/**
 * 60 FPS Spotify-Style Preview Line on Player Screen
 */
export const SpotifyCardPreviewLine = memo(function SpotifyCardPreviewLine({
  item,
  isActive,
  isPassed,
  isSynced,
}: {
  item: LyricLine;
  isActive: boolean;
  isPassed: boolean;
  isSynced: boolean;
}) {
  const [animValue] = useState(() => new Animated.Value(isActive ? 2 : isPassed ? 1 : 0));

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: isActive ? 2 : isPassed ? 1 : 0,
      damping: 20,
      stiffness: 140,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isActive, isPassed, animValue]);

  if (item.isBreak || item.text === "♪ ♪ ♪" || !item.text?.trim()) {
    return (
      <Animated.View
        style={[
          styles.spotifyCardLineWrap,
          {
            opacity: isActive ? 1 : 0.6,
          },
        ]}
      >
        <SpotifyInstrumentalBreak
          item={item}
          isActive={isActive}
          isPassed={isPassed}
          isCompact={true}
        />
      </Animated.View>
    );
  }

  const opacity = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [isSynced ? 0.38 : 0.85, 0.72, 1.0],
  });

  const scale = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.97, 1.0, 1.025],
  });

  return (
    <Animated.View
      style={[
        styles.spotifyCardLineWrap,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.spotifyCardLineText,
          isActive
            ? styles.spotifyCardLineActive
            : isPassed
            ? styles.spotifyCardLinePassed
            : styles.spotifyCardLineUpcoming,
        ]}
      >
        {item.text || "♪ ♪ ♪"}
      </Text>
    </Animated.View>
  );
});
