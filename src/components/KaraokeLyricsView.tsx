import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Animated from "@/lib/nativeAnimated";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import { getSongLyrics, type LyricLine, type LyricsResult } from "@/services/lyricsService";
import { formatDuration, type Song } from "@/lib/musicData";
import { useArtworkPalette } from "@/lib/colorExtractor";
import { PlayerSlider } from "@/components/PlayerSlider";
import { Image } from "expo-image";

interface KaraokeLyricsViewProps {
  song: Song | null;
  currentPositionSeconds: number;
  durationSeconds?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeek: (seconds: number) => void;
  accentColor?: string;
  onToggleFullScreen?: () => void;
}

/**
 * Convert accent color or image palette to the signature Spotify lyrics card/screen background hue.
 */
function getSpotifyLyricsBg(accentColor?: string, songFallbackSeed?: string): string {
  let hex = (accentColor || "").replace("#", "").trim();

  // If no valid accent color or default fallback (#0E1016 / #000000 / #16181D), derive distinct hue from song seed
  if (hex.length !== 6 || hex === "0E1016" || hex === "000000" || hex === "16181D" || hex === "181A20") {
    if (!songFallbackSeed) return "#24527A";
    let hash = 0;
    for (let i = 0; i < songFallbackSeed.length; i++) {
      hash = songFallbackSeed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360) / 360;
    const s = 0.55;
    const l = 0.32;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (pVal: number, qVal: number, tVal: number) => {
      let t = tVal;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return pVal + (qVal - pVal) * 6 * t;
      if (t < 1 / 2) return qVal;
      if (t < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - t) * 6;
      return pVal;
    };
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // RGB to HSL
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r / 255:
        h = (g / 255 - b / 255) / d + (g < b ? 6 : 0);
        break;
      case g / 255:
        h = (b / 255 - r / 255) / d + 2;
        break;
      case b / 255:
        h = (r / 255 - g / 255) / d + 4;
        break;
    }
    h /= 6;
  }

  // Saturated rich slate tone (lightness 0.28-0.36, saturation 0.45-0.65)
  const targetL = Math.max(0.26, Math.min(0.36, l < 0.15 ? 0.30 : l > 0.65 ? 0.32 : l));
  const targetS = Math.max(0.45, Math.min(0.70, s < 0.2 ? 0.50 : s));

  const hue2rgb = (pVal: number, qVal: number, tVal: number) => {
    let t = tVal;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return pVal + (qVal - pVal) * 6 * t;
    if (t < 1 / 2) return qVal;
    if (t < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - t) * 6;
    return pVal;
  };
  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const red = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const green = Math.round(hue2rgb(p, q, h) * 255);
  const blue = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}

/**
 * Clean & Minimal Spotify-Style Pulsing 3-Dots Instrumental Break
 */
const SpotifyInstrumentalBreak = memo(function SpotifyInstrumentalBreak({
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

const PREVIEW_LINE_HEIGHT = 44;

/**
 * 60 FPS Spotify-Style Fullscreen Lyric Line
 */
const SpotifyLyricLine = memo(function SpotifyLyricLine({
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
const SpotifyCardPreviewLine = memo(function SpotifyCardPreviewLine({
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

/**
 * 1. Inline Spotify Preview Card on Player Screen (Screenshot 1)
 */
export const KaraokeLyricsView = memo(function KaraokeLyricsView({
  song,
  currentPositionSeconds,
  isPlaying,
  accentColor,
  onToggleFullScreen,
}: KaraokeLyricsViewProps) {
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const artworkPalette = useArtworkPalette(song?.coverUrl);
  const [offsetAnim] = useState(() => new Animated.Value(0));

  const songSeed = useMemo(() => `${song?.id || ""}_${song?.title || ""}_${song?.artist || ""}`, [song?.id, song?.title, song?.artist]);

  const effectiveAccent = accentColor || (artworkPalette.accent !== "#0E1016" ? artworkPalette.accent : undefined) || (artworkPalette.primary !== "#0E1016" ? artworkPalette.primary : undefined);

  const cardBgColor = useMemo(
    () => getSpotifyLyricsBg(effectiveAccent, songSeed),
    [effectiveAccent, songSeed]
  );

  useEffect(() => {
    if (!song?.title) {
      setLyricsData(null);
      return;
    }

    let isCurrent = true;
    setLoading(true);

    getSongLyrics({
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
    })
      .then((res) => {
        if (isCurrent) {
          setLyricsData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLyricsData({ synced: false, lines: [], provider: "none" });
          setLoading(false);
        }
      });

}, [song?.id, song?.title, song?.artist, song?.duration]);

  const livePosition = currentPositionSeconds;

  // Active line index calculation
  const activeIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.synced || lyricsData.lines.length === 0) {
      return -1;
    }
    const lines = lyricsData.lines;
    let foundIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= livePosition + 0.05) {
        foundIndex = i;
      } else {
        break;
      }
    }
    return foundIndex >= 0 ? foundIndex : 0;
  }, [lyricsData, livePosition]);

  // Smooth continuous gliding translation to active line
  useEffect(() => {
    const targetOffset = activeIndex > 0 ? -Math.max(0, activeIndex - 1) * PREVIEW_LINE_HEIGHT : 0;
    Animated.spring(offsetAnim, {
      toValue: targetOffset,
      damping: 22,
      stiffness: 130,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, offsetAnim]);

  if (!song) return null;

  const hasLyrics = Boolean(lyricsData && lyricsData.lines.length > 0);

  return (
    <Pressable
      android_disableSound
      onPress={onToggleFullScreen}
      style={({ pressed }) => [
        styles.spotifyCardContainer,
        { backgroundColor: cardBgColor },
        pressed && styles.spotifyCardPressed,
      ]}
    >
      {/* Header with Title on Left & Lyrics Icon on Top Right */}
      <View style={styles.spotifyCardHeader}>
        <Text style={styles.spotifyCardHeaderTitle}>Lyrics</Text>
        <Pressable
          android_disableSound
          onPress={onToggleFullScreen}
          hitSlop={10}
          style={styles.spotifyCardHeaderIconBtn}
        >
          <MaterialIcons name="lyrics" size={22} color="rgba(255, 255, 255, 0.9)" />
        </Pressable>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.spotifyCardLoading}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.spotifyCardSubtext}>Loading lyrics...</Text>
        </View>
      ) : !hasLyrics || !lyricsData ? (
        <View style={styles.spotifyCardLoading}>
          <Ionicons name="musical-notes-outline" size={22} color="rgba(255,255,255,0.4)" />
          <Text style={styles.spotifyCardSubtext}>No lyrics available for this song</Text>
        </View>
      ) : (
        <View style={styles.spotifyCardViewport} pointerEvents="none">
          <Animated.View style={{ transform: [{ translateY: offsetAnim }] }}>
            {lyricsData.lines.map((line, index) => {
              const isActive = index === activeIndex;
              const isPassed = index < activeIndex;
              return (
                <SpotifyCardPreviewLine
                  key={line.id || `card_line_${line.time}_${line.text}`}
                  item={line}
                  isActive={isActive}
                  isPassed={isPassed}
                  isSynced={Boolean(lyricsData.synced)}
                />
              );
            })}
          </Animated.View>
        </View>
      )}

      {/* Bottom Button Pill */}
      <View style={styles.spotifyCardFooter}>
        <Pressable
          android_disableSound
          onPress={onToggleFullScreen}
          style={({ pressed }) => [
            styles.spotifyShowLyricsPill,
            pressed && styles.spotifyShowLyricsPillPressed,
          ]}
        >
          <Text style={styles.spotifyShowLyricsText}>Show lyrics</Text>
        </Pressable>
      </View>
    </Pressable>
  );
});

// ─── Fullscreen Modal Subcomponents ──────────────────────────────────────────

const SpotifyModalHeader = memo(function SpotifyModalHeader({
  song,
  gesture,
  onClose,
}: {
  song: Song;
  gesture: ReturnType<typeof Gesture.Pan>;
  onClose: () => void;
}) {
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.spotifyModalHeader}>
        {/* Left: Artwork thumbnail */}
        {song.coverUrl ? (
          <Image
            source={{ uri: song.coverUrl }}
            style={styles.spotifyHeaderArtwork}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.spotifyHeaderArtwork, styles.spotifyHeaderArtworkFallback]}>
            <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.7)" />
          </View>
        )}

        {/* Middle: Title & Artist info */}
        <View style={styles.spotifyHeaderSongInfo}>
          <Text numberOfLines={1} style={styles.spotifyHeaderTitle}>
            {song.title}
          </Text>
          <Text numberOfLines={1} style={styles.spotifyHeaderArtist}>
            {song.artist}
          </Text>
        </View>

        {/* Right: Circular close button pill */}
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
            }
            onClose();
          }}
          hitSlop={12}
          style={styles.spotifyHeaderCloseBtn}
        >
          <Ionicons name="close" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </GestureDetector>
  );
});

const SpotifyModalLyricsList = memo(function SpotifyModalLyricsList({
  lyricsData,
  loading,
  activeIndex,
  currentPositionSeconds,
  screenHeight,
  visible,
  onSeek,
}: {
  lyricsData: LyricsResult | null;
  loading: boolean;
  activeIndex: number;
  currentPositionSeconds: number;
  screenHeight: number;
  visible: boolean;
  onSeek: (seconds: number) => void;
}) {
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList<LyricLine>>(null);
  const lastScrolledIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (visible && activeIndex >= 0 && lyricsData?.synced && !isUserScrollingRef.current && flatListRef.current) {
      lastScrolledIndexRef.current = activeIndex;
      const timer = setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: activeIndex,
            animated: true,
            viewPosition: 0.22,
          });
        } catch {
          // Handled via onScrollToIndexFailed
        }
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [visible, activeIndex, lyricsData?.synced]);

  useEffect(() => {
    if (visible) {
      isUserScrollingRef.current = false;
      lastScrolledIndexRef.current = -1;
    }
  }, [visible]);

  const handleScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 3500);
  }, []);

  const handleSeekToLine = useCallback(
    (time: number) => {
      if (Platform.OS !== "web") {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      }
      onSeek(time);
    },
    [onSeek]
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<LyricLine>) => {
      const isActive = index === activeIndex;
      const isPassed = index < activeIndex;
      if (item.isBreak) {
        return (
          <SpotifyInstrumentalBreak
            item={item}
            isActive={isActive}
            isPassed={isPassed}
            onPress={handleSeekToLine}
          />
        );
      }
      return (
        <SpotifyLyricLine
          item={item}
          isActive={isActive}
          isPassed={isPassed}
          isSynced={Boolean(lyricsData?.synced)}
          onPress={handleSeekToLine}
        />
      );
    },
    [activeIndex, lyricsData?.synced, handleSeekToLine]
  );

  const keyExtractor = useCallback(
    (item: LyricLine) => item.id || `lyric_${item.time}_${item.text}`,
    []
  );

  if (loading) {
    return (
      <View style={styles.spotifyModalCenterState}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.spotifyModalLoadingText}>Loading lyrics...</Text>
      </View>
    );
  }

  if (!lyricsData || lyricsData.lines.length === 0) {
    return (
      <View style={styles.spotifyModalCenterState}>
        <Ionicons name="musical-notes-outline" size={38} color="rgba(255,255,255,0.3)" />
        <Text style={styles.spotifyModalEmptyTitle}>No lyrics available for this song</Text>
        <Text style={styles.spotifyModalEmptySubtext}>Enjoy the music!</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={lyricsData.lines}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      extraData={activeIndex}
      onScrollToIndexFailed={(info) => {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: info.index,
            animated: true,
            viewPosition: 0.22,
          });
        }, 40);
      }}
      contentContainerStyle={[
        styles.spotifyModalListContent,
        {
          paddingTop: screenHeight * 0.06,
          paddingBottom: screenHeight * 0.30,
        },
      ]}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onMomentumScrollEnd={handleScrollEndDrag}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={Platform.OS === "android"}
    />
  );
});

const SpotifyModalBottomBar = memo(function SpotifyModalBottomBar({
  currentPositionSeconds,
  durationSeconds,
  isPlaying,
  onTogglePlay,
  onSeek,
}: {
  currentPositionSeconds: number;
  durationSeconds: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeek: (seconds: number) => void;
}) {
  const totalDuration = durationSeconds > 0 ? durationSeconds : 180;
  const [seekingSeconds, setSeekingSeconds] = useState<number | null>(null);

  const displaySeconds = seekingSeconds !== null ? seekingSeconds : currentPositionSeconds;

  const handleSlidingStart = useCallback(() => {
    setSeekingSeconds(currentPositionSeconds);
  }, [currentPositionSeconds]);

  const handleValueChange = useCallback((val: number) => {
    setSeekingSeconds(val);
  }, []);

  const handleSlidingComplete = useCallback(
    (val: number) => {
      setSeekingSeconds(null);
      if (Platform.OS !== "web") {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSeek(val);
    },
    [onSeek]
  );

  const handleSlidingCancel = useCallback(() => {
    setSeekingSeconds(null);
  }, []);

  return (
    <View style={styles.spotifyBottomBar}>
      {/* Left: Play/Pause button */}
      {onTogglePlay ? (
        <Pressable
          android_disableSound
          onPress={onTogglePlay}
          style={({ pressed }) => [
            styles.spotifyBottomPlayBtn,
            pressed && styles.spotifyBottomPlayBtnPressed,
          ]}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={18}
            color="#FFFFFF"
            style={!isPlaying ? { marginLeft: 2 } : undefined}
          />
        </Pressable>
      ) : null}

      {/* Middle: Progress Scrubber Slider */}
      <View style={styles.spotifyBottomSliderWrap}>
        <PlayerSlider
          value={displaySeconds}
          minimumValue={0}
          maximumValue={totalDuration}
          onSlidingStart={handleSlidingStart}
          onValueChange={handleValueChange}
          onSlidingComplete={handleSlidingComplete}
          onSlidingCancel={handleSlidingCancel}
        />
      </View>

      {/* Right: Time string e.g. 0:02 / 0:20 */}
      <Text style={styles.spotifyBottomTimeText}>
        {formatDuration(Math.floor(displaySeconds))} / {formatDuration(Math.floor(totalDuration))}
      </Text>
    </View>
  );
});

/**
 * 2. Fullscreen Immersive Spotify Lyrics Screen (Screenshot 2)
 */
export const FullscreenKaraokeModal = memo(function FullscreenKaraokeModal({
  visible,
  song,
  currentPositionSeconds,
  durationSeconds = 0,
  isPlaying = false,
  onTogglePlay,
  onSeek,
  accentColor,
  onClose,
}: {
  visible: boolean;
  song: Song | null;
  currentPositionSeconds: number;
  durationSeconds?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeek: (seconds: number) => void;
  accentColor?: string;
  onClose: () => void;
}) {
  const { height: screenHeight } = useWindowDimensions();
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const artworkPalette = useArtworkPalette(song?.coverUrl);
  const songSeed = useMemo(() => `${song?.id || ""}_${song?.title || ""}_${song?.artist || ""}`, [song?.id, song?.title, song?.artist]);
  const effectiveAccent = accentColor || (artworkPalette.accent !== "#0E1016" ? artworkPalette.accent : undefined) || (artworkPalette.primary !== "#0E1016" ? artworkPalette.primary : undefined);

  const screenBgColor = useMemo(
    () => getSpotifyLyricsBg(effectiveAccent, songSeed),
    [effectiveAccent, songSeed]
  );

  const translateY = useSharedValue(0);

  const handleDismiss = useCallback(() => {
    "worklet";
    translateY.value = withSpring(
      screenHeight,
      { damping: 24, stiffness: 260, mass: 0.7 },
      (finished) => {
        if (finished) {
          scheduleOnRN(onClose);
        }
      }
    );
  }, [screenHeight, onClose, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const dismissPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationY > 0) {
            translateY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (e.translationY > 120 || e.velocityY > 700) {
            handleDismiss();
          } else {
            translateY.value = withSpring(0, { damping: 24, stiffness: 260, mass: 0.7 });
          }
        }),
    [handleDismiss, translateY]
  );

  useEffect(() => {
    if (!visible || !song?.title) return;

    let isCurrent = true;
    setLoading(true);
    getSongLyrics({
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
    })
      .then((res) => {
        if (isCurrent) {
          setLyricsData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLyricsData({ synced: false, lines: [], provider: "none" });
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [visible, song?.id, song?.title, song?.artist, song?.duration]);

  const livePosition = currentPositionSeconds;

  // Compute active line index
  const activeIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.synced || lyricsData.lines.length === 0) {
      return -1;
    }
    const lines = lyricsData.lines;
    let foundIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= livePosition + 0.05) {
        foundIndex = i;
      } else {
        break;
      }
    }
    return foundIndex >= 0 ? foundIndex : 0;
  }, [lyricsData, livePosition]);

  if (!visible || !song) return null;

  const totalDuration = durationSeconds > 0 ? durationSeconds : song.duration || 180;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <Reanimated.View
        style={[styles.spotifyModalRoot, { backgroundColor: screenBgColor }, sheetAnimatedStyle]}
        renderToHardwareTextureAndroid={true}
        needsOffscreenAlphaCompositing={true}
      >
        <SpotifyModalHeader song={song} gesture={dismissPanGesture} onClose={onClose} />
        <SpotifyModalLyricsList
          lyricsData={lyricsData}
          loading={loading}
          activeIndex={activeIndex}
          currentPositionSeconds={livePosition}
          screenHeight={screenHeight}
          visible={visible}
          onSeek={onSeek}
        />
        <SpotifyModalBottomBar
          currentPositionSeconds={livePosition}
          durationSeconds={totalDuration}
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          onSeek={onSeek}
        />
      </Reanimated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  // ── 1. Inline Preview Card (Screenshot 1) ──────────────────────────────────
  spotifyCardContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
  },
  spotifyCardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  spotifyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  spotifyCardHeaderIconBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  spotifyCardHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  spotifyCardViewport: {
    height: 132,
    overflow: "hidden",
    marginBottom: 16,
    justifyContent: "flex-start",
  },
  spotifyCardLineWrap: {
    height: 44,
    justifyContent: "center",
  },
  spotifyCardLineText: {
    fontSize: 21,
    lineHeight: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.35,
  },
  spotifyCardLineActive: {
    color: "#FFFFFF",
  },
  spotifyCardLinePassed: {
    color: "rgba(255, 255, 255, 0.78)",
  },
  spotifyCardLineUpcoming: {
    color: "rgba(0, 0, 0, 0.90)",
  },
  spotifyCardFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  spotifyShowLyricsPill: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  spotifyShowLyricsPillPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  spotifyShowLyricsText: {
    color: "#000000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  spotifyCardLoading: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  spotifyCardSubtext: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  // ── 2. Fullscreen Modal (Screenshot 2) ──────────────────────────────────────
  spotifyModalRoot: {
    flex: 1,
  },
  spotifyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 54 : 36,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  spotifyHeaderArtwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  spotifyHeaderArtworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  spotifyHeaderSongInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  spotifyHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 21,
    fontFamily: "Inter_700Bold",
  },
  spotifyHeaderArtist: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  spotifyHeaderCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  spotifyModalListContent: {
    paddingHorizontal: 22,
  },
  spotifyLinePressable: {
    paddingVertical: 12,
  },
  spotifyLinePressed: {
    opacity: 0.75,
  },
  spotifyLineText: {
    fontSize: 25,
    lineHeight: 35,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  spotifyLineActive: {
    color: "#FFFFFF",
  },
  spotifyLinePassed: {
    color: "rgba(255, 255, 255, 0.78)",
  },
  spotifyLineUpcoming: {
    color: "rgba(0, 0, 0, 0.90)",
  },
  spotifyWordActive: {
    color: "#FFFFFF",
  },
  spotifyWordUpcoming: {
    color: "rgba(0, 0, 0, 0.40)",
  },
  spotifyBreakContainer: {
    paddingVertical: 14,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  spotifyBreakContainerCompact: {
    paddingVertical: 4,
  },
  spotifyBreakDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 6,
  },
  spotifyBreakDotsRowCompact: {
    gap: 6,
    paddingVertical: 2,
  },
  spotifyBreakDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spotifyBreakDotCompact: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  spotifyModalCenterState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  spotifyModalLoadingText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  spotifyModalEmptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  spotifyModalEmptySubtext: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  // Bottom Control Bar matching screenshot
  spotifyBottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 38 : 24,
    paddingTop: 12,
    gap: 10,
  },
  spotifyBottomPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  spotifyBottomPlayBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  spotifyBottomSliderWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  spotifyBottomTimeText: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
});
