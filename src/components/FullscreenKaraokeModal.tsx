import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import { styles } from "./styles/karaokeLyricsStyles";
import { IS_ANDROID, IS_IOS, IS_WEB } from "@/constants/platform";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";
import { getSongLyrics, type LyricLine, type LyricsResult } from "@/services/lyricsService";
import { formatDuration, type Song } from "@/lib/musicData";
import { useArtworkPalette } from "@/lib/colorExtractor";
import { PlayerSlider } from "@/components/PlayerSlider";
import { Image } from "expo-image";
import { getSpotifyLyricsBg } from "./karaokeLyricsUtils";
import { SpotifyInstrumentalBreak, SpotifyLyricLine } from "./KaraokeLyricsSubComponents";

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
            if (!IS_WEB) {
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
      if (!IS_WEB) {
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
      removeClippedSubviews={IS_ANDROID}
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
      if (!IS_WEB) {
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
  const translateY = useSharedValue(0);
  const artworkPalette = useArtworkPalette(song?.coverUrl);

  const songSeed = useMemo(() => `${song?.id || ""}_${song?.title || ""}_${song?.artist || ""}`, [song?.id, song?.title, song?.artist]);

  const effectiveAccent = accentColor || (artworkPalette.accent !== "#0E1016" ? artworkPalette.accent : undefined) || (artworkPalette.primary !== "#0E1016" ? artworkPalette.primary : undefined);

  const screenBgColor = useMemo(
    () => getSpotifyLyricsBg(effectiveAccent, songSeed),
    [effectiveAccent, songSeed]
  );

  const handleDismiss = useCallback(() => {
    translateY.value = withSpring(screenHeight, { damping: 20, stiffness: 220, mass: 0.8 }, (finished) => {
      if (finished) {
        onClose();
      }
    });
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
