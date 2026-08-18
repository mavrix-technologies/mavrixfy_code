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
  InteractionManager,
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
import { formatDuration, Song } from "@/lib/musicData";
import { useArtworkPalette } from "@/lib/colorExtractor";

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
 * Convert accent color to the signature Spotify lyrics card/screen background hue.
 */
function getSpotifyLyricsBg(accentColor?: string, defaultBg = "#2E6B94"): string {
  if (!accentColor || accentColor === "#0E1016" || accentColor === "#000000") {
    return defaultBg;
  }
  const hex = accentColor.replace("#", "");
  if (hex.length !== 6) return defaultBg;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(5, 7), 16) || parseInt(hex.slice(4, 6), 16);

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

  // Saturated rich slate tone (lightness 0.32-0.38, saturation 0.45-0.65)
  const targetL = Math.max(0.28, Math.min(0.38, l < 0.15 ? 0.32 : l > 0.65 ? 0.35 : l));
  const targetS = Math.max(0.42, Math.min(0.68, s < 0.2 ? 0.48 : s));

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const red = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const green = Math.round(hue2rgb(p, q, h) * 255);
  const blue = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}

/**
 * 60 FPS Spotify-Style Instrumental Break Pill with pulsing music dots
 */
const SpotifyInstrumentalBreak = memo(function SpotifyInstrumentalBreak({
  item,
  isActive,
  isPassed,
  onPress,
}: {
  item: LyricLine;
  isActive: boolean;
  isPassed: boolean;
  onPress: (time: number) => void;
}) {
  const [pulseAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (isActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 750,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isActive, pulseAnim]);

  const dot1Opacity = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 1.0, 0.35],
  });
  const dot2Opacity = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.65, 0.35, 1.0],
  });
  const dot3Opacity = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1.0, 0.65, 0.35],
  });

  return (
    <Pressable
      android_disableSound
      onPress={() => onPress(item.time)}
      style={styles.spotifyBreakContainer}
    >
      <View
        style={[
          styles.spotifyBreakPill,
          isActive && styles.spotifyBreakPillActive,
          isPassed && styles.spotifyBreakPillPassed,
        ]}
      >
        <Ionicons
          name="musical-notes"
          size={16}
          color={isActive ? "#FFFFFF" : isPassed ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)"}
        />
        <View style={styles.spotifyBreakDotsRow}>
          <Animated.View
            style={[
              styles.spotifyBreakDot,
              { opacity: isActive ? dot1Opacity : isPassed ? 0.7 : 0.35 },
            ]}
          />
          <Animated.View
            style={[
              styles.spotifyBreakDot,
              { opacity: isActive ? dot2Opacity : isPassed ? 0.7 : 0.35 },
            ]}
          />
          <Animated.View
            style={[
              styles.spotifyBreakDot,
              { opacity: isActive ? dot3Opacity : isPassed ? 0.7 : 0.35 },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
});

/**
 * 60 FPS Spotify-Style Fullscreen Lyric Line with smooth transition animation
 */
const SpotifyLyricLine = memo(function SpotifyLyricLine({
  item,
  index,
  isActive,
  isPassed,
  isSynced,
  onPress,
}: {
  item: LyricLine;
  index: number;
  isActive: boolean;
  isPassed: boolean;
  isSynced: boolean;
  onPress: (time: number) => void;
}) {
  const [animValue] = useState(() => new Animated.Value(isActive ? 2 : isPassed ? 1 : 0));

  useEffect(() => {
    const toValue = isActive ? 2 : isPassed ? 1 : 0;
    Animated.timing(animValue, {
      toValue,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [isActive, isPassed, animValue]);

  const opacity = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.32, 0.78, 1.0],
  });

  const scale = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.98, 1.0, 1.025],
  });

  const translateY = animValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [2, 0, 0],
  });

  const handlePress = useCallback(() => {
    if (isSynced) {
      onPress(item.time);
    }
  }, [isSynced, item.time, onPress]);

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
 * 1. Inline Spotify Preview Card on Player Screen (Screenshot 1)
 */
export const KaraokeLyricsView = memo(function KaraokeLyricsView({
  song,
  currentPositionSeconds,
  accentColor,
  onToggleFullScreen,
}: KaraokeLyricsViewProps) {
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const artworkPalette = useArtworkPalette(song?.coverUrl);

  const previewFadeRef = useRef<Animated.Value | null>(null);
  if (previewFadeRef.current === null) {
    previewFadeRef.current = new Animated.Value(1);
  }
  const previewFade = previewFadeRef.current;

  const cardBgColor = useMemo(
    () => getSpotifyLyricsBg(accentColor || artworkPalette.accent),
    [accentColor, artworkPalette.accent]
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

    return () => {
      isCurrent = false;
    };
  }, [song?.id, song?.title, song?.artist, song?.duration]);

  // Active line index calculation
  const activeIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.synced || lyricsData.lines.length === 0) {
      return -1;
    }
    const lines = lyricsData.lines;
    let foundIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentPositionSeconds + 0.15) {
        foundIndex = i;
      } else {
        break;
      }
    }
    return foundIndex >= 0 ? foundIndex : 0;
  }, [lyricsData, currentPositionSeconds]);

  useEffect(() => {
    previewFade.setValue(0.55);
    Animated.timing(previewFade, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, previewFade]);

  if (!song) return null;

  const hasLyrics = lyricsData && lyricsData.lines.length > 0;
  const lines = hasLyrics ? lyricsData.lines : [];

  // Preview lines window (shows up to 5 lines)
  const previewStart = Math.max(0, activeIndex >= 0 ? Math.max(0, activeIndex - 2) : 0);
  const previewLines = lines.slice(previewStart, previewStart + 5);

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
          hitSlop={8}
          style={styles.spotifyCardHeaderIconBtn}
        >
          <MaterialIcons name="lyrics" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.spotifyCardLoading}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.spotifyCardSubtext}>Loading lyrics...</Text>
        </View>
      ) : !hasLyrics ? (
        <View style={styles.spotifyCardLoading}>
          <Ionicons name="musical-notes-outline" size={22} color="rgba(255,255,255,0.4)" />
          <Text style={styles.spotifyCardSubtext}>No lyrics available for this song</Text>
        </View>
      ) : (
        <Animated.View style={[styles.spotifyCardLyricsBlock, { opacity: previewFade }]}>
          {previewLines.map((line, idx) => {
            const actualIndex = previewStart + idx;
            const isActive = actualIndex === activeIndex;
            const isPassed = actualIndex < activeIndex;
            return (
              <Text
                key={line.id || `preview_${line.time}_${line.text}`}
                numberOfLines={2}
                style={[
                  styles.spotifyCardLineText,
                  isActive
                    ? styles.spotifyCardLineActive
                    : isPassed
                    ? styles.spotifyCardLinePassed
                    : styles.spotifyCardLineUpcoming,
                ]}
              >
                {line.text}
              </Text>
            );
          })}
        </Animated.View>
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
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
            }
            onClose();
          }}
          hitSlop={14}
          style={styles.spotifyHeaderBackBtn}
        >
          <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.spotifyHeaderSongInfo}>
          <Text numberOfLines={1} style={styles.spotifyHeaderTitle}>
            {song.title}
          </Text>
          <Text numberOfLines={1} style={styles.spotifyHeaderArtist}>
            {song.artist}
          </Text>
        </View>

        <View style={{ width: 32 }} />
      </View>
    </GestureDetector>
  );
});

const SpotifyModalLyricsList = memo(function SpotifyModalLyricsList({
  lyricsData,
  loading,
  activeIndex,
  screenHeight,
  visible,
  onSeek,
}: {
  lyricsData: LyricsResult | null;
  loading: boolean;
  activeIndex: number;
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
          index={index}
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
      initialNumToRender={25}
      maxToRenderPerBatch={15}
      windowSize={9}
      removeClippedSubviews={false}
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
  const progressRatio = Math.max(0, Math.min(1, currentPositionSeconds / totalDuration));

  const [scrubbingRatio, setScrubbingRatio] = useState<number | null>(null);
  const progressBarWidthRef = useRef<number>(1);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((e) => {
          const ratio = Math.max(0, Math.min(1, e.x / (progressBarWidthRef.current || 1)));
          setScrubbingRatio(ratio);
          if (Platform.OS !== "web") {
            void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
          }
        })
        .onUpdate((e) => {
          const ratio = Math.max(0, Math.min(1, e.x / (progressBarWidthRef.current || 1)));
          setScrubbingRatio(ratio);
        })
        .onEnd((e) => {
          const ratio = Math.max(0, Math.min(1, e.x / (progressBarWidthRef.current || 1)));
          const targetSeconds = ratio * totalDuration;
          if (Platform.OS !== "web") {
            void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
          }
          onSeek(targetSeconds);
          setScrubbingRatio(null);
        })
        .onFinalize(() => {
          setScrubbingRatio(null);
        }),
    [totalDuration, onSeek]
  );

  const displayRatio = scrubbingRatio !== null ? scrubbingRatio : progressRatio;
  const displayCurrentSeconds =
    scrubbingRatio !== null ? scrubbingRatio * totalDuration : currentPositionSeconds;
  const displayRemainingSeconds = Math.max(0, totalDuration - displayCurrentSeconds);

  return (
    <View style={styles.spotifyBottomBar}>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.spotifyProgressContainer}
          onLayout={(e) => {
            progressBarWidthRef.current = e.nativeEvent.layout.width;
          }}
        >
          <View style={styles.spotifyProgressTouchArea}>
            <View style={styles.spotifyProgressTrack}>
              <View
                style={[
                  styles.spotifyProgressFill,
                  { width: `${Math.round(displayRatio * 100)}%` },
                ]}
              />
              <View
                style={[
                  styles.spotifyProgressThumb,
                  { left: `${Math.max(0, Math.min(97, displayRatio * 100))}%` },
                  scrubbingRatio !== null && styles.spotifyProgressThumbActive,
                ]}
              />
            </View>
          </View>

          <View style={styles.spotifyTimeRow}>
            <Text style={styles.spotifyTimeText}>
              {formatDuration(Math.floor(displayCurrentSeconds))}
            </Text>
            <Text style={styles.spotifyTimeText}>
              -{formatDuration(Math.floor(displayRemainingSeconds))}
            </Text>
          </View>
        </View>
      </GestureDetector>

      {onTogglePlay ? (
        <View style={styles.spotifyPlayBtnWrap}>
          <Pressable
            android_disableSound
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.spotifyBigPlayBtn,
              pressed && styles.spotifyBigPlayBtnPressed,
            ]}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={30}
              color="#000000"
              style={!isPlaying ? { marginLeft: 2 } : undefined}
            />
          </Pressable>
        </View>
      ) : null}
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
  const screenBgColor = useMemo(
    () => getSpotifyLyricsBg(accentColor || artworkPalette.accent),
    [accentColor, artworkPalette.accent]
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

  // Defer heavy lyrics loading to 0ms post-interaction
  useEffect(() => {
    if (!visible || !song?.title) return;

    let isCurrent = true;
    const task = InteractionManager.runAfterInteractions(() => {
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
    });

    return () => {
      isCurrent = false;
      task.cancel();
    };
  }, [visible, song?.id, song?.title, song?.artist, song?.duration]);

  // Compute active line index
  const activeIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.synced || lyricsData.lines.length === 0) {
      return -1;
    }
    const lines = lyricsData.lines;
    let foundIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentPositionSeconds + 0.15) {
        foundIndex = i;
      } else {
        break;
      }
    }
    return foundIndex >= 0 ? foundIndex : 0;
  }, [lyricsData, currentPositionSeconds]);

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
          screenHeight={screenHeight}
          visible={visible}
          onSeek={onSeek}
        />
        <SpotifyModalBottomBar
          currentPositionSeconds={currentPositionSeconds}
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
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  spotifyCardHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  spotifyCardLyricsBlock: {
    gap: 8,
    marginBottom: 20,
  },
  spotifyCardLineText: {
    fontSize: 21,
    lineHeight: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
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
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 54 : 36,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  spotifyHeaderBackBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  spotifyHeaderSongInfo: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  spotifyHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  spotifyHeaderArtist: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
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
  spotifyBreakContainer: {
    paddingVertical: 14,
    alignItems: "flex-start",
  },
  spotifyBreakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  spotifyBreakPillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderColor: "rgba(255, 255, 255, 0.45)",
    transform: [{ scale: 1.04 }],
  },
  spotifyBreakPillPassed: {
    opacity: 0.65,
  },
  spotifyBreakDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  spotifyBreakDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
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

  // Bottom Control Bar
  spotifyBottomBar: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 38 : 24,
    paddingTop: 8,
  },
  spotifyProgressContainer: {
    marginBottom: 8,
  },
  spotifyProgressTouchArea: {
    paddingVertical: 2,
    justifyContent: "center",
  },
  spotifyProgressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    position: "relative",
  },
  spotifyProgressFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  spotifyProgressThumb: {
    position: "absolute",
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  spotifyProgressThumbActive: {
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
  spotifyTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 1,
  },
  spotifyTimeText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  spotifyPlayBtnWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  spotifyBigPlayBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
  },
  spotifyBigPlayBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
});
