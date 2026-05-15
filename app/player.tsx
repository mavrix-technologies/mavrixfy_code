import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import Slider from "@react-native-community/slider";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ToastAndroid,
  ActivityIndicator,
  Animated,
  InteractionManager,
  LayoutChangeEvent,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { convertJioSaavnSong, formatDuration, getBestImageUrl, Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { getRecentlyPlayed, getUserPlaylists } from "@/lib/storage";
import { PingPongScroll } from "@/components/PingPongScroll";
import { createSpotifyColorTheme, extractDominantColor } from "@/lib/colorExtractor";
import EqualizerBars from "@/components/EqualizerBars";
import { getArtistDetails, JioSaavnArtist, searchArtists } from "@/lib/artistService";
import { isFollowingArtist, toggleFollowArtist } from "@/lib/followedArtists";

function hexToRgba(color: string, alpha: number): string {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const hex = color.replace("#", "").trim();
  if (hex.length === 3) {
    const red = Number.parseInt(hex[0] + hex[0], 16);
    const green = Number.parseInt(hex[1] + hex[1], 16);
    const blue = Number.parseInt(hex[2] + hex[2], 16);
    if (!Number.isNaN(red) && !Number.isNaN(green) && !Number.isNaN(blue)) {
      return `rgba(${red},${green},${blue},${safeAlpha})`;
    }
  }
  if (hex.length === 6) {
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(red) && !Number.isNaN(green) && !Number.isNaN(blue)) {
      return `rgba(${red},${green},${blue},${safeAlpha})`;
    }
  }
  return `rgba(255,255,255,${safeAlpha})`;
}

function brightenHexColor(color: string, saturationBoost = 1.35, lightnessBoost = 1.12): string {
  const hex = color.replace("#", "").trim();
  const fullHex = hex.length === 3
    ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return Colors.primary;
  }

  const red = Number.parseInt(fullHex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(fullHex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(fullHex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const nextSaturation = Math.max(0.62, Math.min(1, saturation * saturationBoost));
  const nextLightness = Math.max(0.48, Math.min(0.72, lightness * lightnessBoost));
  const chroma = (1 - Math.abs(2 * nextLightness - 1)) * nextSaturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = nextLightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) { r = chroma; g = x; }
  else if (hue < 120) { r = x; g = chroma; }
  else if (hue < 180) { g = chroma; b = x; }
  else if (hue < 240) { g = x; b = chroma; }
  else if (hue < 300) { r = x; b = chroma; }
  else { r = chroma; b = x; }

  const toHex = (channel: number) => Math.round((channel + m) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getSeededFraction(seed: number): number {
  const safeSeed = seed >>> 0;
  return (safeSeed % 1000003) / 1000003;
}

function hashArtworkKey(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mapSeededRange(seed: number, min: number, max: number): number {
  return min + (max - min) * getSeededFraction(seed);
}

function getArtworkCardDecor(seedKey: string) {
  const baseSeed = hashArtworkKey(seedKey);
  const rotateDeg = mapSeededRange(baseSeed, -5.4, 5.4);
  const borderAlpha = mapSeededRange(Math.imul(baseSeed, 48271) + 7, 0.2, 0.36);
  return {
    rotateDeg,
    borderAlpha,
  };
}

const AnimatedSongFlatList = Animated.createAnimatedComponent(
  FlatList as React.ComponentType<any>
);

const PlayerPlayButton = memo(
  ({
    isPlaying,
    isLoading,
    buttonSize,
    iconSize,
    onAccentColor,
    onPress,
  }: {
    isPlaying: boolean;
    isLoading: boolean;
    buttonSize: number;
    iconSize: number;
    onAccentColor: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.playButton,
        {
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: "#F7FAFF",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.92)",
        },
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={onAccentColor} />
      ) : (
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={iconSize}
          color={onAccentColor}
          style={!isPlaying ? { marginLeft: 2 } : undefined}
        />
      )}
    </Pressable>
  )
);

PlayerPlayButton.displayName = "PlayerPlayButton";


const QueueSongRow = memo(
  ({
    item,
    index,
    isCurrent,
    isShortScreen,
    isPlaying,
    onPress,
  }: {
    item: Song;
    index: number;
    isCurrent: boolean;
    isShortScreen: boolean;
    isPlaying: boolean;
    onPress: (item: Song) => void;
  }) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const rowStyle = useMemo(
      () => [
        styles.queueRow,
        isCurrent ? styles.queueRowActive : null,
        isShortScreen ? styles.queueRowCompact : null,
      ],
      [isCurrent, isShortScreen]
    );

    return (
      <Pressable style={rowStyle} onPress={handlePress}>
        <View style={styles.queueLead}>
          {isCurrent ? (
            <EqualizerBars isPlaying={isPlaying} size={3} color="#F7FAFF" />
          ) : (
            <Text style={styles.queueIndex}>{index + 1}</Text>
          )}
        </View>

        <Image
          recyclingKey={item.id}
          source={{ uri: item.coverUrl || undefined }}
          style={isShortScreen ? styles.queueThumbCompact : styles.queueThumb}
          contentFit="cover"
          transition={120}
        />

        <View style={styles.queueTextWrap}>
          <Text
            style={isCurrent ? styles.queueTitleActive : styles.queueTitle}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={isCurrent ? styles.queueMetaActive : styles.queueMeta}
            numberOfLines={1}
          >
            {item.artist}
          </Text>
        </View>

        <Text style={isCurrent ? styles.queueDurationActive : styles.queueDuration}>
          {formatDuration(item.duration)}
        </Text>
      </Pressable>
    );
  }
);

QueueSongRow.displayName = "QueueSongRow";

const DEV_PREVIEW_SONGS: Song[] = [
  {
    id: "dev-preview-1",
    title: "Midnight Drive",
    artist: "Mavrixfy Preview",
    album: "UI Preview",
    duration: 214,
    coverUrl: "https://placehold.co/600x600/1b2d4b/f4f7fb?text=Preview+1",
    genre: "Preview",
    audioUrl: "",
    source: "local",
  },
  {
    id: "dev-preview-2",
    title: "Afterglow",
    artist: "Mavrixfy Preview",
    album: "UI Preview",
    duration: 187,
    coverUrl: "https://placehold.co/600x600/3d2748/f4f7fb?text=Preview+2",
    genre: "Preview",
    audioUrl: "",
    source: "local",
  },
  {
    id: "dev-preview-3",
    title: "Blue Avenue",
    artist: "Mavrixfy Preview",
    album: "UI Preview",
    duration: 201,
    coverUrl: "https://placehold.co/600x600/14385a/f4f7fb?text=Preview+3",
    genre: "Preview",
    audioUrl: "",
    source: "local",
  },
];

function LegacyPlayerScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {
    currentSong,
    queue,
    sourceQueue,
    queueIndex,
    isPlaying,
    progress,
    duration,
    positionMillis,
    isShuffled,
    repeatMode,
    isLoading,
    togglePlay,
    playSong,
    nextSong,
    prevSong,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    isLiked,
    removeFromQueue,
    albumColor,
    setAlbumColor,
    setTextColor,
  } = usePlayer();

  // Simple seek state — while dragging we show the drag value, on release we commit.
  const [seekValue, setSeekValue] = useState<number | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isLoadingDevTrack, setIsLoadingDevTrack] = useState(false);
  const [isDevPreviewEnabled, setIsDevPreviewEnabled] = useState(false);
  const [devPreviewIndex, setDevPreviewIndex] = useState(0);
  const [devPreviewIsPlaying, setDevPreviewIsPlaying] = useState(true);
  const [devPreviewProgress, setDevPreviewProgress] = useState(0.18);
  const [devPreviewIsShuffled, setDevPreviewIsShuffled] = useState(false);
  const [devPreviewRepeatMode, setDevPreviewRepeatMode] = useState<"off" | "all" | "one">("off");
  const [devPreviewLikedSongIds, setDevPreviewLikedSongIds] = useState<string[]>([]);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const androidSeekFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipCooldownRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const artScrollX = useRef(new Animated.Value(0)).current;
  const artCarouselRef = useRef<FlatList<Song> | null>(null);
  const hasAlignedArtCarouselRef = useRef(false);
  const pendingArtworkTargetIndexRef = useRef<number | null>(null);
  const didHandleSheetDismissRef = useRef(false);
  const sheetDetentReadyAtRef = useRef(0);
  const isDevPreviewActive = __DEV__ && !currentSong && isDevPreviewEnabled;

  // ── Defer heavy work until after the open animation completes ───────────────
  const [interactionReady, setInteractionReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setInteractionReady(true);
    });
    return () => task.cancel();
  }, []);

  // ── About the artist / Credits state ────────────────────────────────────────
  const [artistInfo, setArtistInfo] = useState<JioSaavnArtist | null>(null);
  const [artistFollowing, setArtistFollowing] = useState(false);
  const artistFetchIdRef = useRef<string>("");
  const devPreviewSong =
    DEV_PREVIEW_SONGS[Math.max(0, Math.min(devPreviewIndex, DEV_PREVIEW_SONGS.length - 1))] ??
    DEV_PREVIEW_SONGS[0];
  const screenSong = currentSong ?? (isDevPreviewActive ? devPreviewSong : null);

  useEffect(() => {
    fadeAnim.setValue(0.3);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [screenSong?.id, screenSong?.coverUrl, fadeAnim]);

  useEffect(() => {
    didHandleSheetDismissRef.current = false;
    sheetDetentReadyAtRef.current = Date.now() + 450;
  }, [screenSong?.id]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const unsubscribe = navigation.addListener("sheetDetentChange" as never, ((event: any) => {
      const index = event?.data?.index;
      const isStable = event?.data?.stable ?? true;
      if (Date.now() < sheetDetentReadyAtRef.current) {
        return;
      }
      if (!isStable || index !== 0) {
        return;
      }
      if (didHandleSheetDismissRef.current) {
        return;
      }
      didHandleSheetDismissRef.current = true;
      safeGoBack();
    }) as never);

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!interactionReady) return;
    let active = true;
    const cover = screenSong?.coverUrl?.trim();
    if (!cover) return () => {};

    extractDominantColor(cover)
      .then((colors) => {
        if (!active) return;
        setAlbumColor(colors.primary);
        setTextColor(colors.text);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [interactionReady, screenSong?.id, screenSong?.coverUrl, setAlbumColor, setTextColor]);

  // Fetch artist info whenever the current song's artist changes
  useEffect(() => {
    if (!interactionReady) return;
    const artistName = currentSong?.artist?.split(",")[0]?.trim();
    if (!artistName) { setArtistInfo(null); return; }

    let cancelled = false;
    const fetchId = artistName;
    artistFetchIdRef.current = fetchId;

    // Try to find artist by name then fetch full details
    searchArtists(artistName)
      .then(async (results) => {
        if (cancelled || artistFetchIdRef.current !== fetchId) return;
        const first = results[0];
        if (!first) return;
        const details = await getArtistDetails(first.id);
        if (cancelled || artistFetchIdRef.current !== fetchId) return;
        setArtistInfo(details);
        const following = await isFollowingArtist(first.id);
        if (!cancelled) setArtistFollowing(following);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [interactionReady, currentSong?.artist]);

  const rawTopInset = Platform.OS === "web" ? 67 : insets.top;
  const topInset = Platform.OS === "ios" ? Math.max(2, rawTopInset - 18) : rawTopInset;
  const bottomInset = Platform.OS === "web" ? 28 : insets.bottom;
  const isShortScreen = screenHeight <= 760;
  const isVeryShortScreen = screenHeight <= 700;
  const topBarHeight = isShortScreen ? 50 : 54;
  const controlButtonSize = isVeryShortScreen ? 34 : isShortScreen ? 38 : 42;
  const prevNextIconSize = isVeryShortScreen ? 20 : isShortScreen ? 22 : 24;
  const shuffleRepeatIconSize = isVeryShortScreen ? 16 : isShortScreen ? 17 : 19;
  const playButtonSize = isVeryShortScreen ? 56 : isShortScreen ? 62 : 74;
  const playIconSize = isVeryShortScreen ? 28 : isShortScreen ? 30 : 34;
  const listBottomPadding = Platform.OS === "web" ? 16 : Math.max(32, bottomInset + 28);
  const defaultArtByWidth = Math.min(screenWidth - 62, 336);
  const defaultArtByHeight = Math.max(192, Math.floor(screenHeight * (isVeryShortScreen ? 0.3 : 0.34)));
  const artSize = Math.min(defaultArtByWidth, defaultArtByHeight);

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const livePlayingQueue = useMemo(() => {
    const hasFullActiveQueue = queue.length > 1;
    const hasFullSourceQueue = sourceQueue.length > 1;
    if (hasFullActiveQueue) {
      return queue.filter((song) => Boolean(song?.id));
    }
    if (hasFullSourceQueue) {
      return sourceQueue.filter((song) => Boolean(song?.id));
    }
    if (queue.length === 1) {
      return queue;
    }
    return currentSong ? [currentSong] : [];
  }, [currentSong, queue, sourceQueue]);
  const liveActiveQueueIndex = useMemo(() => {
    if (livePlayingQueue.length === 0) return 0;
    if (currentSong?.id) {
      const currentIndex = livePlayingQueue.findIndex((song) => song.id === currentSong.id);
      if (currentIndex >= 0) {
        return currentIndex;
      }
    }
    const rawIndex = queue.length > 0 ? queueIndex : 0;
    return Math.max(0, Math.min(rawIndex, livePlayingQueue.length - 1));
  }, [currentSong?.id, livePlayingQueue, queue.length, queueIndex]);
  const playingQueue = isDevPreviewActive ? DEV_PREVIEW_SONGS : livePlayingQueue;
  const activeQueueIndex = isDevPreviewActive ? devPreviewIndex : liveActiveQueueIndex;
  const playerIsPlaying = isDevPreviewActive ? devPreviewIsPlaying : isPlaying;
  const playerProgress = isDevPreviewActive ? devPreviewProgress : progress;
  const playerDuration = isDevPreviewActive ? (devPreviewSong?.duration ?? 0) * 1000 : duration;
  const playerPositionMillis = isDevPreviewActive
    ? Math.round((devPreviewSong?.duration ?? 0) * 1000 * devPreviewProgress)
    : positionMillis;
  const playerIsShuffled = isDevPreviewActive ? devPreviewIsShuffled : isShuffled;
  const playerRepeatMode = isDevPreviewActive ? devPreviewRepeatMode : repeatMode;
  const artistTopSongs = useMemo(() => {
    if (!artistInfo?.topSongs?.length || !screenSong?.id) return [];
    const seen = new Set<string>([screenSong.id]);
    const songs: Song[] = [];
    for (const item of artistInfo.topSongs) {
      const converted = convertJioSaavnSong(item);
      if (!converted.id || seen.has(converted.id)) continue;
      seen.add(converted.id);
      songs.push(converted);
      if (songs.length >= 6) break;
    }
    return songs;
  }, [artistInfo?.topSongs, screenSong?.id]);
  const currentTimeSec = Math.floor(playerPositionMillis / 1000);
  const totalDurationSec = Math.floor(playerDuration / 1000);
  const rawSongDuration = Number(screenSong?.duration ?? 0);
  const safeSongDuration = Number.isFinite(rawSongDuration) ? Math.max(0, rawSongDuration) : 0;
  const effectiveDurationSec = totalDurationSec > 0 ? totalDurationSec : safeSongDuration;
  const canSeek =
    isDevPreviewActive ||
    effectiveDurationSec > 0 ||
    (Platform.OS === "android" && Boolean(screenSong?.id));
  const liked = screenSong
    ? isDevPreviewActive
      ? devPreviewLikedSongIds.includes(screenSong.id)
      : isLiked(screenSong.id)
    : false;
  const displayDuration =
    totalDurationSec > 0 ? formatDuration(totalDurationSec) : formatDuration(safeSongDuration);
  const queueCountLabel = `${playingQueue.length} ${playingQueue.length === 1 ? "song" : "songs"}`;
  const artWrapHorizontalPadding = isShortScreen ? 14 : 20;
  const artCarouselViewportWidth = Math.max(1, screenWidth - artWrapHorizontalPadding * 2);
  const artCarouselPageWidth = artCarouselViewportWidth;
  const artCarouselSnapInterval = artCarouselPageWidth;

  const playerTheme = useMemo(
    () => createSpotifyColorTheme(albumColor || Colors.primary),
    [albumColor]
  );
  const brightAlbumColor = useMemo(
    () => brightenHexColor(playerTheme.accent, 1.5, 1.18),
    [playerTheme.accent]
  );
  const gradientColors = useMemo(
    () => [
      hexToRgba(brightAlbumColor, 0.9),
      hexToRgba(brightAlbumColor, 0.52),
      "#10141A",
      "#070A10",
    ] as const,
    [brightAlbumColor]
  );
  const sheetTextColor = Colors.text;
  const sheetMutedTextColor = "rgba(223,226,235,0.68)";
  const sheetAccentColor = brightAlbumColor;
  // These are all static — define once outside the component (see bottom of file)
  const controlButtonBg = "rgba(223,226,235,0.07)";
  const controlButtonBorder = "rgba(223,226,235,0.14)";
  const controlIconColor = "rgba(236,240,247,0.96)";
  const activeControlIconColor = "#F7FAFF";
  const controlButtonActiveBg = "rgba(247,250,255,0.12)";
  const controlButtonActiveBorder = "rgba(247,250,255,0.22)";
  const progressTrackColor = "rgba(223,226,235,0.16)";
  const progressFillColor = brightAlbumColor;
  const progressThumbColor = "#F7FAFF";
  const usesResponderSeek = Platform.OS === "web" || Platform.OS === "android";
  const showsCustomProgressVisual = usesResponderSeek;

  // Memoize control button base styles to avoid new objects every render
  const ctrlBtnBase = useMemo(
    () => ({
      width: controlButtonSize,
      height: controlButtonSize,
      borderRadius: controlButtonSize / 2,
    }),
    [controlButtonSize]
  );
  const ctrlBtnStyle = useMemo(
    () => ({ ...ctrlBtnBase, backgroundColor: controlButtonBg, borderColor: controlButtonBorder }),
    [ctrlBtnBase]
  );
  const ctrlBtnActiveStyle = useMemo(
    () => ({ ...ctrlBtnBase, backgroundColor: controlButtonActiveBg, borderColor: controlButtonActiveBorder }),
    [ctrlBtnBase, controlButtonActiveBg, controlButtonActiveBorder]
  );

  const artCarouselGetItemLayout = useCallback(
    (_: Song[] | null | undefined, index: number) => ({
      length: artCarouselSnapInterval,
      offset: artCarouselSnapInterval * index,
      index,
    }),
    [artCarouselSnapInterval]
  );

  const clampProgress = useCallback((value: number) => {
    return Math.max(0, Math.min(1, value));
  }, []);

  const clearAndroidSeekFallbackTimer = useCallback(() => {
    if (!androidSeekFallbackTimerRef.current) return;
    clearTimeout(androidSeekFallbackTimerRef.current);
    androidSeekFallbackTimerRef.current = null;
  }, []);

  // While dragging show seekValue; otherwise show live playerProgress.
  const rawVisualProgress = isSeeking && seekValue !== null
    ? seekValue
    : playerProgress;
  const visualProgress = clampProgress(Number.isFinite(rawVisualProgress) ? rawVisualProgress : 0);

  // Reset seek state when song changes.
  useEffect(() => {
    setIsSeeking(false);
    setSeekValue(null);
    clearAndroidSeekFallbackTimer();
  }, [screenSong?.id, clearAndroidSeekFallbackTimer]);

  useEffect(() => {
    return () => { clearAndroidSeekFallbackTimer(); };
  }, [clearAndroidSeekFallbackTimer]);

  const handleSlidingStart = useCallback((value: number) => {
    clearAndroidSeekFallbackTimer();
    if (Platform.OS !== "web") void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setIsSeeking(true);
    setSeekValue(clampProgress(value));
  }, [clearAndroidSeekFallbackTimer, clampProgress]);

  const handleSliderValueChange = useCallback((value: number) => {
    setSeekValue(clampProgress(value));
  }, [clampProgress]);

  const handleSlidingComplete = useCallback((value: number) => {
    clearAndroidSeekFallbackTimer();
    const next = clampProgress(value);
    setSeekValue(next);
    setIsSeeking(false);
    if (isDevPreviewActive) { setDevPreviewProgress(next); return; }
    seekTo(next);
    // Clear override after a short delay so live progress takes over cleanly.
    androidSeekFallbackTimerRef.current = setTimeout(() => {
      setSeekValue(null);
    }, 1500);
  }, [clearAndroidSeekFallbackTimer, clampProgress, isDevPreviewActive, seekTo]);

  const handleProgressLayout = useCallback((event: LayoutChangeEvent) => {
    setProgressTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const getResponderSeekProgress = useCallback((event: GestureResponderEvent) => {
    const nativeX = event.nativeEvent.locationX;
    const safeWidth = progressTrackWidth > 0 ? progressTrackWidth : Math.max(1, screenWidth - 48);
    return clampProgress(nativeX / safeWidth);
  }, [clampProgress, progressTrackWidth, screenWidth]);

  const commitSeekProgress = useCallback((next: number) => {
    setIsSeeking(false);
    setSeekValue(next);
    if (isDevPreviewActive) { setDevPreviewProgress(next); return; }
    seekTo(next);
    clearAndroidSeekFallbackTimer();
    androidSeekFallbackTimerRef.current = setTimeout(() => {
      setSeekValue(null);
    }, 1500);
  }, [clearAndroidSeekFallbackTimer, isDevPreviewActive, seekTo]);

  const handleResponderSeekGrant = useCallback((event: GestureResponderEvent) => {
    if (!usesResponderSeek || !canSeek) return;
    clearAndroidSeekFallbackTimer();
    if (Platform.OS !== "web") void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setIsSeeking(true);
    setSeekValue(getResponderSeekProgress(event));
  }, [canSeek, clearAndroidSeekFallbackTimer, getResponderSeekProgress, usesResponderSeek]);

  const handleResponderSeekMove = useCallback((event: GestureResponderEvent) => {
    if (!usesResponderSeek || !isSeeking) return;
    setSeekValue(getResponderSeekProgress(event));
  }, [getResponderSeekProgress, isSeeking, usesResponderSeek]);

  const handleResponderSeekRelease = useCallback((event: GestureResponderEvent) => {
    if (!usesResponderSeek) return;
    commitSeekProgress(getResponderSeekProgress(event));
  }, [commitSeekProgress, getResponderSeekProgress, usesResponderSeek]);

  const handleQueueSongPress = useCallback(
    (song: Song) => {
      haptic();
      playSong(song, playingQueue);
    },
    [haptic, playSong, playingQueue]
  );

  const handleSkip = useCallback(
    (direction: "next" | "prev") => {
      if (skipCooldownRef.current) return;
      skipCooldownRef.current = true;
      haptic();
      if (direction === "next") {
        void nextSong();
      } else {
        void prevSong();
      }
      setTimeout(() => {
        skipCooldownRef.current = false;
      }, 400);
    },
    [haptic, nextSong, prevSong]
  );


  const showDevLoadMessage = useCallback((message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert("Player Dev Helper", message);
  }, []);

  const normalizePlayableSong = useCallback((source: Partial<Song> | null | undefined): Song | null => {
    if (!source?.id || !source.audioUrl || source.audioUrl.trim().length === 0) {
      return null;
    }

    return {
      id: source.id,
      title: source.title || "Unknown Song",
      artist: source.artist || "Unknown Artist",
      album: source.album || "",
      duration: Number(source.duration) || 0,
      coverUrl: source.coverUrl || "",
      genre: source.genre || "",
      audioUrl: source.audioUrl,
      year: source.year,
      language: source.language,
      hasLyrics: source.hasLyrics,
      source: source.source,
    };
  }, []);

  const handleLoadDevTrack = useCallback(async () => {
    if (isLoadingDevTrack) {
      return;
    }

    setIsLoadingDevTrack(true);
    try {
      const recentItems = await getRecentlyPlayed();
      const recentSongs = recentItems
        .filter((item) => item.type === "song")
        .map((item) => normalizePlayableSong(item.data as Partial<Song> | undefined))
        .filter((song): song is Song => Boolean(song));

      const localPlaylistSongs = (await getUserPlaylists())
        .flatMap((playlist) => playlist.songs || [])
        .map((song) => normalizePlayableSong(song))
        .filter((song): song is Song => Boolean(song));

      const candidateQueue = [recentSongs, localPlaylistSongs].find((songs) => songs.length > 0) || [];

      if (candidateQueue.length === 0) {
        showDevLoadMessage("No saved playable song found yet. Play one song from Home once, then come back here.");
        return;
      }

      playSong(candidateQueue[0], candidateQueue);
    } catch {
      showDevLoadMessage("Could not load a development test song.");
    } finally {
      setIsLoadingDevTrack(false);
    }
  }, [isLoadingDevTrack, normalizePlayableSong, playSong, showDevLoadMessage]);

  const openDevPreview = useCallback(() => {
    setIsDevPreviewEnabled(true);
    setDevPreviewIndex(0);
    setDevPreviewIsPlaying(true);
    setDevPreviewProgress(0.18);
    setDevPreviewIsShuffled(false);
    setDevPreviewRepeatMode("off");
    setDevPreviewLikedSongIds([]);
    setSeekValue(null);
    setIsSeeking(false);
  }, []);

  const handleArtworkSongChange = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= playingQueue.length || targetIndex === activeQueueIndex) {
        return;
      }
      if (skipCooldownRef.current) return;
      skipCooldownRef.current = true;
      setTimeout(() => { skipCooldownRef.current = false; }, 400);

      haptic();

      if (isDevPreviewActive) {
        setDevPreviewIndex(targetIndex);
        setDevPreviewProgress(0.18);
        return;
      }

      if (targetIndex === activeQueueIndex + 1) {
        void nextSong();
        return;
      }

      if (targetIndex === activeQueueIndex - 1) {
        void prevSong();
        return;
      }

      const targetSong = playingQueue[targetIndex];
      if (!targetSong) {
        return;
      }

      playSong(targetSong, playingQueue);
    },
    [activeQueueIndex, haptic, isDevPreviewActive, nextSong, playSong, playingQueue, prevSong]
  );

  useEffect(() => {
    pendingArtworkTargetIndexRef.current = activeQueueIndex;
  }, [activeQueueIndex]);

  const handleArtworkScrollFinished = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (playingQueue.length <= 1 || artCarouselSnapInterval <= 0) {
        return;
      }

      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / artCarouselSnapInterval);
      const targetIndex = Math.max(0, Math.min(rawIndex, playingQueue.length - 1));

      if (
        targetIndex === activeQueueIndex ||
        targetIndex === pendingArtworkTargetIndexRef.current
      ) {
        return;
      }

      pendingArtworkTargetIndexRef.current = targetIndex;
      handleArtworkSongChange(targetIndex);
    },
    [activeQueueIndex, artCarouselSnapInterval, handleArtworkSongChange, playingQueue.length]
  );

  const handleArtworkScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: artScrollX } } }], {
        useNativeDriver: true,
      }),
    [artScrollX]
  );

  useEffect(() => {
    if (!artCarouselRef.current || artCarouselSnapInterval <= 0 || playingQueue.length === 0) {
      return;
    }

    const targetOffset = activeQueueIndex * artCarouselSnapInterval;
    const shouldAnimate = hasAlignedArtCarouselRef.current && playingQueue.length > 1;
    if (!shouldAnimate) {
      artScrollX.setValue(targetOffset);
    }
    const frame = requestAnimationFrame(() => {
      artCarouselRef.current?.scrollToOffset({
        offset: targetOffset,
        animated: shouldAnimate,
      });
      hasAlignedArtCarouselRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [activeQueueIndex, artCarouselSnapInterval, artScrollX, playingQueue.length]);

  const renderArtworkCard = useCallback(
    ({ item, index }: { item: Song; index: number }) => {
      const isActiveCard = index === activeQueueIndex;
      const decor = getArtworkCardDecor(`${item.id || "art"}-${index}`);
      const inputRange = [
        (index - 1) * artCarouselSnapInterval,
        index * artCarouselSnapInterval,
        (index + 1) * artCarouselSnapInterval,
      ];
      const slideScale = artScrollX.interpolate({
        inputRange,
        outputRange: [0.9, 1, 0.9],
        extrapolate: "clamp",
      });
      const slideOpacity = artScrollX.interpolate({
        inputRange,
        outputRange: [0.64, 1, 0.64],
        extrapolate: "clamp",
      });
      const slideTranslateY = artScrollX.interpolate({
        inputRange,
        outputRange: [14, 0, 14],
        extrapolate: "clamp",
      });
      const slideTranslateX = artScrollX.interpolate({
        inputRange,
        outputRange: [16, 0, -16],
        extrapolate: "clamp",
      });
      const slideRotateY = artScrollX.interpolate({
        inputRange,
        outputRange: ["9deg", "0deg", "-9deg"],
        extrapolate: "clamp",
      });
      const slideRotateZ = artScrollX.interpolate({
        inputRange,
        outputRange: [`${decor.rotateDeg * 0.55}deg`, "0deg", `${-decor.rotateDeg * 0.55}deg`],
        extrapolate: "clamp",
      });
      const imageParallaxX = artScrollX.interpolate({
        inputRange,
        outputRange: [-12, 0, 12],
        extrapolate: "clamp",
      });
      const cardOpacity = isActiveCard ? Animated.multiply(slideOpacity, fadeAnim) : slideOpacity;

      return (
        <Pressable
          style={[styles.artCarouselTouch, { width: artCarouselPageWidth, height: artSize }]}
          onPress={() => handleArtworkSongChange(index)}
          disabled={isActiveCard}
        >
          <Animated.View
            style={[
              styles.artFrame,
              styles.artFrameDefault,
              styles.artCarouselCard,
              { width: artSize, height: artSize },
              {
                opacity: cardOpacity,
                borderColor: isActiveCard
                  ? hexToRgba(playerTheme.accent, 0.54)
                  : hexToRgba(playerTheme.accent, decor.borderAlpha),
                shadowColor: isActiveCard ? hexToRgba(playerTheme.accent, 0.74) : "#000",
                transform: [
                  { perspective: 1200 },
                  { translateX: slideTranslateX },
                  { translateY: slideTranslateY },
                  { scale: slideScale },
                  { rotateY: slideRotateY },
                  { rotateZ: slideRotateZ },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.albumArtParallax,
                {
                  transform: [{ translateX: imageParallaxX }],
                },
              ]}
            >
              {item.coverUrl?.trim() ? (
                <Image
                  recyclingKey={item.id}
                  source={{ uri: item.coverUrl }}
                  style={styles.albumArt}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority={isActiveCard ? "high" : "normal"}
                />
              ) : (
                <View style={[styles.albumArt, styles.albumFallback]}>
                  <Ionicons name="musical-notes" size={58} color={Colors.subtext} />
                </View>
              )}
            </Animated.View>
          </Animated.View>
        </Pressable>
      );
    },
    [
      activeQueueIndex,
      artCarouselPageWidth,
      artCarouselSnapInterval,
      artScrollX,
      artSize,
      fadeAnim,
      handleArtworkSongChange,
      playerTheme.accent,
    ]
  );

  const handleQueueItemPress = useCallback(
    (item: Song) => {
      if (isDevPreviewActive) {
        const idx = playingQueue.findIndex((s) => s.id === item.id);
        setDevPreviewIndex(idx >= 0 ? idx : 0);
        setDevPreviewProgress(0.18);
        return;
      }
      handleQueueSongPress(item);
    },
    [isDevPreviewActive, playingQueue, handleQueueSongPress]
  );


  if (!screenSong) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: topInset }]}>
        <View style={styles.emptyState}>
          <Ionicons name="musical-notes-outline" size={64} color={Colors.inactive} />
          <Text style={styles.emptyText}>No song playing</Text>
          {__DEV__ ? (
            <>
              <Text style={styles.emptyHint}>
                Development helper: load a saved recent, liked, or playlist song to test the player quickly.
              </Text>
              <Pressable
                onPress={() => {
                  void handleLoadDevTrack();
                }}
                style={styles.emptyDevButton}
              >
                {isLoadingDevTrack ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <>
                    <Ionicons name="play" size={16} color={Colors.text} />
                    <Text style={styles.emptyDevButtonText}>Load Dev Test Song</Text>
                  </>
                )}
              </Pressable>
              <Pressable onPress={openDevPreview} style={styles.emptyDevSecondaryButton}>
                <Ionicons name="eye-outline" size={16} color={Colors.text} />
                <Text style={styles.emptyDevSecondaryButtonText}>Open UI Preview</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable onPress={safeGoBack} style={styles.emptyBackButton}>
            <Ionicons name="arrow-down" size={26} color={Colors.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.32, 0.68, 1]}
        style={[
          styles.container,
          { paddingTop: topInset, paddingBottom: 0 },
        ]}
      >
      <View style={[styles.topBar, { height: topBarHeight, paddingHorizontal: isShortScreen ? 14 : 18 }]}>
        <Pressable
          style={[styles.headerIconButton, ctrlBtnStyle]}
          onPress={safeGoBack}
          hitSlop={10}
        >
          <Ionicons name="arrow-down" size={22} color={sheetTextColor} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerAlbum, { fontSize: isShortScreen ? 12 : 13 }]} numberOfLines={1}>
            {screenSong.album || "Single"}
          </Text>
        </View>

        <Pressable
          style={[styles.headerIconButton, ctrlBtnStyle]}
          onPress={() => router.push("/queue")}
          hitSlop={10}
        >
          <Ionicons name="list-outline" size={21} color={sheetTextColor} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.playerScroll}
        contentContainerStyle={[styles.playerScrollContent, { paddingBottom: listBottomPadding }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={Platform.OS === "android" ? !isSeeking : true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === "android"}
        bounces={Platform.OS === "ios"}
        alwaysBounceVertical={Platform.OS === "ios"}
        overScrollMode="never"
      >
      <View
        pointerEvents="none"
        style={[
          styles.lowerDarkBackdrop,
          { top: Math.max(360, topInset + topBarHeight + artSize + (isShortScreen ? 92 : 116)) },
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(11,13,16,0)", "rgba(11,13,16,0.88)", "#0B0D10"]}
          style={styles.lowerDarkFade}
        />
      </View>
      <View style={[styles.playerContent, { paddingBottom: isShortScreen ? 10 : 14 }]}>
        <View style={styles.playerPrimaryStack}>
              <View
                style={[
                  styles.artWrap,
                  { marginTop: isShortScreen ? 4 : 8, paddingHorizontal: artWrapHorizontalPadding },
                ]}
              >
                <AnimatedSongFlatList
                  ref={(list: any) => {
                    artCarouselRef.current = list as FlatList<Song> | null;
                  }}
                  data={playingQueue}
                  keyExtractor={(item: Song, index: number) => `${item.id}-${index}`}
                  renderItem={renderArtworkCard}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  bounces={false}
                  scrollEnabled={playingQueue.length > 1 && !isSeeking}
                  decelerationRate="fast"
                  disableIntervalMomentum
                  snapToAlignment="start"
                  snapToInterval={artCarouselSnapInterval}
                  contentContainerStyle={styles.artCarouselContent}
                  style={styles.artCarousel}
                  getItemLayout={artCarouselGetItemLayout}
                  initialNumToRender={3}
                  maxToRenderPerBatch={5}
                  windowSize={5}
                  removeClippedSubviews={false}
                  onScroll={handleArtworkScroll}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={handleArtworkScrollFinished}
                />
              </View>

              <View
                style={[
                  styles.songBlock,
                  { marginTop: isShortScreen ? 10 : 18, marginHorizontal: isShortScreen ? 14 : 20 },
                ]}
              >
                <View style={styles.songTextWrap}>
                  <PingPongScroll
                    text={screenSong.title}
                    style={[
                      styles.songTitle,
                      {
                        color: sheetTextColor,
                        fontSize: isVeryShortScreen ? 24 : isShortScreen ? 26 : 29,
                      },
                    ]}
                    velocity={14}
                    paused={!interactionReady}
                  />
                  <PingPongScroll
                    text={screenSong.artist}
                    style={[
                      styles.songArtist,
                      {
                        color: sheetMutedTextColor,
                        fontSize: isVeryShortScreen ? 12 : 14,
                      },
                    ]}
                    velocity={12}
                    paused={!interactionReady}
                  />
                </View>
                <Pressable
                  onPress={() => {
                    haptic();
                    if (isDevPreviewActive) {
                      setDevPreviewLikedSongIds((prev) =>
                        prev.includes(screenSong.id)
                          ? prev.filter((songId) => songId !== screenSong.id)
                          : [...prev, screenSong.id]
                      );
                      return;
                    }
                    toggleLike(screenSong);
                  }}
                  hitSlop={10}
                  style={styles.likeButton}
                >
                  <Ionicons
                    name={liked ? "heart" : "heart-outline"}
                    size={22}
                  color={controlIconColor}
                />
              </Pressable>
              </View>
            </View>

        <View style={styles.playerActionStack}>
              <View
                style={[
                  styles.progressCard,
                  { marginTop: isShortScreen ? 8 : 14, marginHorizontal: isShortScreen ? 14 : 20 },
                ]}
              >
                <View
                  style={[
                    styles.progressTouch,
                    Platform.OS === "ios" && styles.progressTouchIOS,
                  ]}
                  onLayout={handleProgressLayout}
                >
                  {showsCustomProgressVisual ? (
                    <View pointerEvents="none" style={styles.progressVisual}>
                      <View style={[styles.progressTrack, { backgroundColor: progressTrackColor }]} />
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${visualProgress * 100}%`,
                            backgroundColor: progressFillColor,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.progressThumb,
                          {
                            left: `${visualProgress * 100}%`,
                            backgroundColor: progressThumbColor,
                          },
                        ]}
                      />
                    </View>
                  ) : null}
                  {Platform.OS === "ios" ? (
                    <Slider
                      style={[
                        styles.progressSliderNative,
                        styles.progressSliderIOS,
                      ]}
                      minimumValue={0}
                      maximumValue={1}
                      value={visualProgress}
                      disabled={!canSeek}
                      minimumTrackTintColor={progressFillColor}
                      maximumTrackTintColor={progressTrackColor}
                      thumbTintColor={progressThumbColor}
                      tapToSeek={true}
                      onSlidingStart={handleSlidingStart}
                      onValueChange={handleSliderValueChange}
                      onSlidingComplete={handleSlidingComplete}
                    />
                  ) : usesResponderSeek ? (
                    <View
                      style={[
                        styles.progressGestureResponder,
                        Platform.OS === "web" && styles.progressWebResponder,
                      ]}
                      onStartShouldSetResponder={() => canSeek}
                      onMoveShouldSetResponder={() => canSeek}
                      onResponderTerminationRequest={() => false}
                      onResponderGrant={handleResponderSeekGrant}
                      onResponderMove={handleResponderSeekMove}
                      onResponderRelease={handleResponderSeekRelease}
                      onResponderTerminate={handleResponderSeekRelease}
                    />
                  ) : (
                    <Slider
                      style={styles.progressSliderNative}
                      minimumValue={0}
                      maximumValue={1}
                      value={visualProgress}
                      disabled={!canSeek}
                      minimumTrackTintColor={progressFillColor}
                      maximumTrackTintColor={progressTrackColor}
                      thumbTintColor={progressThumbColor}
                      tapToSeek={false}
                      onSlidingStart={handleSlidingStart}
                      onValueChange={handleSliderValueChange}
                      onSlidingComplete={handleSlidingComplete}
                    />
                  )}
                </View>
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>
                    {formatDuration(
                      seekValue !== null
                        ? Math.floor(Math.max(0, effectiveDurationSec) * visualProgress)
                        : currentTimeSec
                    )}
                  </Text>
                  <Text style={styles.timeText}>{displayDuration}</Text>
                </View>
              </View>

              <View
                style={[
                  styles.controlsRow,
                  {
                    marginTop: isShortScreen ? 6 : 12,
                    marginHorizontal: isShortScreen ? 14 : 20,
                    gap: isShortScreen ? 5 : 8,
                  },
                ]}
              >
          {/* Shuffle Button */}
          <Pressable
            style={[
              styles.roundIconButton,
              ctrlBtnBase,
              playerIsShuffled ? ctrlBtnActiveStyle : ctrlBtnStyle,
            ]}
            onPress={() => {
              haptic();
              if (isDevPreviewActive) {
                setDevPreviewIsShuffled((p) => !p);
              } else {
                toggleShuffle();
              }
            }}
          >
            <Ionicons
              name="shuffle"
              size={shuffleRepeatIconSize}
              color={playerIsShuffled ? activeControlIconColor : controlIconColor}
            />
          </Pressable>

          {/* Previous Button */}
          <Pressable
            style={[styles.roundIconButton, ctrlBtnStyle]}
            onPress={() => {
              if (isDevPreviewActive) {
                setDevPreviewIndex((p) => Math.max(0, p - 1));
                setDevPreviewProgress(0.18);
              } else {
                handleSkip("prev");
              }
            }}
          >
            <Ionicons name="play-skip-back" size={prevNextIconSize} color={controlIconColor} />
          </Pressable>

          {/* Play Button */}
          <PlayerPlayButton
            isPlaying={playerIsPlaying}
            isLoading={isLoading}
            buttonSize={playButtonSize}
            iconSize={playIconSize}
            onAccentColor="#060A0F"
            onPress={() => {
              haptic();
              if (isDevPreviewActive) {
                setDevPreviewIsPlaying((p) => !p);
              } else {
                togglePlay();
              }
            }}
          />

          {/* Next Button */}
          <Pressable
            style={[styles.roundIconButton, ctrlBtnStyle]}
            onPress={() => {
              if (isDevPreviewActive) {
                setDevPreviewIndex((p) => Math.min(DEV_PREVIEW_SONGS.length - 1, p + 1));
                setDevPreviewProgress(0.18);
              } else {
                handleSkip("next");
              }
            }}
          >
            <Ionicons name="play-skip-forward" size={prevNextIconSize} color={controlIconColor} />
          </Pressable>

          {/* Repeat Button */}
          <Pressable
            style={[
              styles.roundIconButton,
              playerRepeatMode !== "off" ? ctrlBtnActiveStyle : ctrlBtnStyle,
            ]}
            onPress={() => {
              haptic();
              if (isDevPreviewActive) {
                setDevPreviewRepeatMode((p) => (p === "off" ? "all" : p === "all" ? "one" : "off"));
              } else {
                toggleRepeat();
              }
            }}
          >
            <Ionicons
              name="repeat"
              size={shuffleRepeatIconSize}
              color={playerRepeatMode !== "off" ? activeControlIconColor : controlIconColor}
            />
            {playerRepeatMode === "one" && <Text style={[styles.repeatOneBadge, { color: activeControlIconColor }]}>1</Text>}
          </Pressable>
          </View>

      </View>
      </View>

      <View
        style={[
          styles.playingListSection,
          {
            marginTop: isShortScreen ? 4 : 8,
            marginHorizontal: isShortScreen ? 14 : 20,
          },
        ]}
      >
        <View style={[styles.playingListHeader, isShortScreen && styles.playingListHeaderCompact]}>
          <Text style={styles.playingListTitle}>Playlist Songs</Text>
          <View style={styles.playingListHeaderRight}>
            <Text style={styles.playingListCount}>{queueCountLabel}</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.queueListContent}
          nestedScrollEnabled
          bounces={false}
          overScrollMode="never"
        >
          {playingQueue.map((item, index) => (
            <QueueSongRow
              key={`${item.id}-${index}`}
              item={item}
              index={index}
              isCurrent={index === activeQueueIndex}
              isShortScreen={isShortScreen}
              isPlaying={playerIsPlaying}
              onPress={handleQueueItemPress}
            />
          ))}
        </ScrollView>
      </View>

      {/* ── About the artist ── */}
      {artistInfo && !isDevPreviewActive ? (
        <View style={styles.spotifyCard}>
          <Pressable
            onPress={() => {
              const img = artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : "";
              router.push(
                { pathname: "/artist/[id]", params: { id: artistInfo.id, name: artistInfo.name, image: img } },
                { withAnchor: true, dangerouslySingular: () => "artist-profile" }
              );
            }}
          >
            <View style={styles.artistHero}>
              <Image
                source={{ uri: artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : screenSong.coverUrl || undefined }}
                style={styles.artistHeroImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.62)"]}
                style={styles.artistHeroShade}
              />
            </View>

            <View style={styles.artistCardBody}>
              <View style={styles.artistRankRow}>
                <Text style={styles.artistRankText}>
                  {artistInfo.dominantLanguage ? `${artistInfo.dominantLanguage} artist` : "Featured artist"}
                </Text>
                <Pressable
                  style={[styles.artistFollowBtn, artistFollowing && styles.artistFollowBtnActive]}
                  onPress={async () => {
                    const img = artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : "";
                    const nowFollowing = await toggleFollowArtist({ id: artistInfo.id, name: artistInfo.name, image: img, followedAt: Date.now() });
                    setArtistFollowing(nowFollowing);
                  }}
                >
                  <Text
                    style={[
                      styles.artistFollowBtnText,
                      artistFollowing && styles.artistFollowBtnTextActive,
                    ]}
                  >
                    {artistFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.artistNameRow}>
                <Text style={styles.artistCardName} numberOfLines={1}>{artistInfo.name}</Text>
                {artistInfo.isVerified ? (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                ) : null}
              </View>
              {artistInfo.followerCount ? (
                <Text style={styles.artistListeners}>
                  {artistInfo.followerCount >= 1_000_000
                    ? `${(artistInfo.followerCount / 1_000_000).toFixed(1)}M followers`
                    : artistInfo.followerCount >= 1_000
                    ? `${(artistInfo.followerCount / 1_000).toFixed(0)}K followers`
                    : `${artistInfo.followerCount} followers`}
                </Text>
              ) : null}
              {artistInfo.bio?.length ? (
                <Text style={styles.artistBio} numberOfLines={3}>
                  {artistInfo.bio[0]?.text?.replace(/<[^>]*>/g, "").trim() ?? ""}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* ── Explore ── */}
      {artistInfo && !isDevPreviewActive && (artistTopSongs.length > 0 || artistInfo.similarArtists?.length > 0) ? (
        <View style={styles.spotifyCard}>
          <View style={styles.exploreHeader}>
            <Text style={styles.exploreTitle}>Explore {artistInfo.name}</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.exploreTileRow}
          >
            {artistTopSongs.slice(0, 5).map((song, index) => (
              <Pressable
                key={`${song.id}-${index}`}
                style={styles.exploreTile}
                onPress={() => {
                  haptic();
                  playSong(song, artistTopSongs);
                }}
              >
                <Image
                  source={{ uri: song.coverUrl || undefined }}
                  style={styles.exploreTileImage}
                  contentFit="cover"
                  transition={120}
                />
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.74)"]} style={styles.exploreTileShade} />
                <Text style={styles.exploreTileEyebrow}>Song</Text>
                <Text style={styles.exploreTileText} numberOfLines={3}>{song.title}</Text>
              </Pressable>
            ))}

            {artistInfo.similarArtists?.slice(0, 2).map((artist) => {
              const image = artist.image?.length ? getBestImageUrl(artist.image) : "";
              return (
                <Pressable
                  key={artist.id}
                  style={styles.exploreTile}
                  onPress={() => {
                    router.push(
                      { pathname: "/artist/[id]", params: { id: artist.id, name: artist.name, image } },
                      { withAnchor: true, dangerouslySingular: () => "artist-profile" }
                    );
                  }}
                >
                  <Image
                    source={{ uri: image || screenSong.coverUrl || undefined }}
                    style={styles.exploreTileImage}
                    contentFit="cover"
                    transition={120}
                  />
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.74)"]} style={styles.exploreTileShade} />
                  <Text style={styles.exploreTileText} numberOfLines={3}>Similar to {artist.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {artistInfo && !isDevPreviewActive ? (
        <View style={styles.spotifyCard}>
          <View style={styles.creditsHeader}>
            <Text style={styles.creditsTitle}>Credits</Text>
            <Text style={styles.creditsShowAll}>Show all</Text>
          </View>
          <View style={styles.creditPersonRow}>
            <View style={styles.creditPersonText}>
              <Text style={styles.creditPersonName}>{artistInfo.name}</Text>
              <Text style={styles.creditPersonRole}>Main Artist</Text>
            </View>
            <Pressable
              style={[styles.artistFollowBtn, artistFollowing && styles.artistFollowBtnActive]}
              onPress={async () => {
                const img = artistInfo.image?.length ? getBestImageUrl(artistInfo.image) : "";
                const nowFollowing = await toggleFollowArtist({ id: artistInfo.id, name: artistInfo.name, image: img, followedAt: Date.now() });
                setArtistFollowing(nowFollowing);
              }}
            >
              <Text
                style={[
                  styles.artistFollowBtnText,
                  artistFollowing && styles.artistFollowBtnTextActive,
                ]}
              >
                {artistFollowing ? "Following" : "Follow"}
              </Text>
            </Pressable>
          </View>
          {screenSong.album ? (
            <View style={styles.creditPersonRow}>
              <View style={styles.creditPersonText}>
                <Text style={styles.creditPersonName}>{screenSong.album}</Text>
                <Text style={styles.creditPersonRole}>Album</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      </ScrollView>

      </LinearGradient>
    </View>
  );
}

export default function PlayerScreen() {
  return <LegacyPlayerScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    height: 54,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  playerScroll: {
    flex: 1,
  },
  playerScrollContent: {
    paddingBottom: 20,
    position: "relative",
  },
  lowerDarkBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0B0D10",
  },
  lowerDarkFade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -132,
    height: 132,
  },
  playerContent: {
    flexGrow: 0,
  },
  playerPrimaryStack: {
    flexGrow: 0,
  },
  playerActionStack: {
    flexGrow: 0,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(223,226,235,0.07)",
    borderWidth: 1,
    borderColor: "rgba(223,226,235,0.14)",
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },

  headerCaption: {
    color: Colors.subtext,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  headerAlbum: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  artWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  artCarousel: {
    width: "100%",
    overflow: "hidden",
  },
  artCarouselContent: {
    alignItems: "center",
  },
  artCarouselTouch: {
    alignItems: "center",
    justifyContent: "center",
  },
  artCarouselCard: {
    alignSelf: "center",
  },
  artFrame: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(247,250,255,0.16)",
    backgroundColor: "rgba(223,226,235,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.34,
    shadowRadius: 26,
    elevation: 12,
  },
  artFrameDefault: {
    borderRadius: 16,
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtParallax: {
    width: "100%",
    height: "100%",
  },
  albumFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  songBlock: {
    marginTop: 18,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  songBlockCompact: {
    marginTop: 10,
  },
  songTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    color: Colors.text,
    fontSize: 29,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  songTitleCompact: {
    fontSize: 23,
  },
  songArtist: {
    marginTop: 3,
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  songArtistCompact: {
    marginTop: 2,
    fontSize: 11,
  },
  likeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(223,226,235,0.07)",
    borderWidth: 1,
    borderColor: "rgba(223,226,235,0.14)",
  },

  progressCard: {
    marginTop: 14,
    marginHorizontal: 20,
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  progressCardCompact: {
    marginTop: 2,
    paddingVertical: 4,
  },
  progressTouch: {
    paddingVertical: 8,
    justifyContent: "center",
    position: "relative",
    height: 28,
  },
  progressTouchIOS: {
    height: 44,
    paddingVertical: 8,
  },
  progressVisual: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: "50%",
    height: 4,
    borderRadius: 999,
    transform: [{ translateY: -2 }],
  },
  progressThumb: {
    position: "absolute",
    top: "50%",
    width: 12,
    height: 12,
    borderRadius: 6,
    transform: [{ translateX: -6 }, { translateY: -6 }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  progressSliderNative: {
    width: "100%",
    height: 28,
  },
  progressSliderIOS: {
    height: 44,
  },
  progressGestureResponder: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  progressWebResponder: {
    cursor: "pointer",
  },
  timeRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeText: {
    color: "rgba(223,226,235,0.58)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  controlsRow: {
    marginTop: 12,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  controlsRowCompact: {
    marginTop: 0,
  },
  playingListSection: {
    overflow: "hidden",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: "#242424",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    maxHeight: 320,
  },

  playingListHeader: {
    height: 46,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playingListHeaderCompact: {
    height: 34,
  },
  playingListHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 72,
    gap: 8,
  },
  playingListTitle: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },

  playingListCount: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },

  queueListContent: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  queueRow: {
    height: 54,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(223,226,235,0.09)",
  },
  queueRowActive: {
    backgroundColor: "rgba(223,226,235,0.055)",
    borderRadius: 10,
    borderBottomColor: "transparent",
  },
  queueRowCompact: {
    height: 48,
    gap: 8,
  },
  queueLead: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  queueIndex: {
    color: Colors.inactive,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  queueThumb: {
    width: 38,
    height: 38,
    borderRadius: 7,
    backgroundColor: Colors.surfaceLight,
  },
  queueThumbCompact: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
  },
  queueTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  queueTitleActive: {
    color: "#F7FAFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  queueMeta: {
    marginTop: 1,
    color: "rgba(223,226,235,0.58)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  queueMetaActive: {
    marginTop: 1,
    color: "rgba(223,226,235,0.75)",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  queueDuration: {
    color: "rgba(223,226,235,0.5)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    width: 34,
    textAlign: "right",
  },
  queueDurationActive: {
    color: "rgba(223,226,235,0.8)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    width: 34,
    textAlign: "right",
  },

  roundIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(223,226,235,0.07)",
    borderWidth: 1,
    borderColor: "rgba(223,226,235,0.14)",
    position: "relative",
  },
  roundIconButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(37, 201, 231, 0.14)",
  },
  playButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  repeatOneBadge: {
    position: "absolute",
    bottom: 5,
    right: 7,
    color: Colors.primary,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 18,
    fontFamily: "Inter_500Medium",
  },
  emptyHint: {
    maxWidth: 280,
    color: Colors.inactive,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  emptyDevButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  emptyDevButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  emptyDevSecondaryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyDevSecondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  emptyBackButton: {
    marginTop: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },

  // ── About the artist / Explore / Credits ────────────────────────────────────
  spotifyCard: {
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(36,36,36,0.94)",
  },
  infoCard: {
    marginHorizontal: 20,
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(223,226,235,0.12)",
  },

  trackDetailsCard: {
    backgroundColor: "transparent",
  },
  trackDetailsHeader: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  trackDetailsTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trackDetailsIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(223,226,235,0.06)",
  },
  trackDetailsTitleText: {
    flex: 1,
    minWidth: 0,
  },
  trackDetailsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  trackDetailsSubtitle: {
    marginTop: 2,
    color: "rgba(223,226,235,0.52)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  trackIdentityPanel: {
    minHeight: 70,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(223,226,235,0.1)",
  },
  trackIdentityArt: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "rgba(223,226,235,0.08)",
  },
  trackIdentityText: {
    flex: 1,
    minWidth: 0,
  },
  trackIdentityTitle: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  trackIdentityArtist: {
    marginTop: 3,
    color: "rgba(223,226,235,0.62)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  trackMetaHeader: {
    marginTop: 18,
    marginBottom: 4,
  },
  infoCardLabel: {
    color: "rgba(223,226,235,0.5)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  trackDetailsLabel: {
    marginBottom: 0,
  },
  // Artist row
  artistInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  artistInfoAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    flexShrink: 0,
  },
  artistInfoAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  artistInfoMeta: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  artistInfoName: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },

  artistInfoSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  artistFollowBtn: {
    height: 30,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  artistFollowBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  artistFollowBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },

  artistFollowBtnTextActive: {
    color: "#000",
  },
  artistBio: {
    marginTop: 18,
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  artistHero: {
    height: 220,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  artistHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  artistHeroShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  artistCardBody: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 28,
  },
  artistRankRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  artistRankText: {
    flex: 1,
    minWidth: 0,
    color: "rgba(255,255,255,0.86)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
  },
  artistNameRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  artistCardName: {
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 31,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
    flexShrink: 1,
  },
  artistListeners: {
    marginTop: 6,
    color: "rgba(255,255,255,0.66)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  exploreHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  exploreTitle: {
    color: Colors.text,
    fontSize: 21,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  exploreTileRow: {
    gap: 16,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 30,
  },
  exploreTile: {
    width: 152,
    height: 216,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  exploreTileImage: {
    width: "100%",
    height: "100%",
  },
  exploreTileShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 112,
  },
  exploreTileText: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 21,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  exploreTileEyebrow: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 60,
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  creditsHeader: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  creditsTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
  },
  creditsShowAll: {
    color: Colors.primary,
    fontSize: 15,
    fontFamily: "Inter_800ExtraBold",
  },
  creditPersonRow: {
    minHeight: 66,
    paddingHorizontal: 28,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  creditPersonText: {
    flex: 1,
    minWidth: 0,
  },
  creditPersonName: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 25,
    fontFamily: "Inter_500Medium",
  },
  creditPersonRole: {
    marginTop: 5,
    color: "rgba(255,255,255,0.62)",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },


  // Credits grid
  creditsGrid: {
    gap: 0,
  },
  creditItem: {
    minHeight: 46,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(223,226,235,0.1)",
  },
  creditLabel: {
    width: 82,
    color: "rgba(223,226,235,0.48)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  creditValueWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  creditValue: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  creditValueCapitalized: {
    textTransform: "capitalize",
  },
});
