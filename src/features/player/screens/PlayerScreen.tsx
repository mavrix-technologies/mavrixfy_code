import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ToastAndroid,
  ActivityIndicator,
  AppState,
  InteractionManager,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  useWindowDimensions,
  ViewStyle
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector, Pressable as GHPressable, FlatList as GHFlatList } from "react-native-gesture-handler";
import Reanimated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

import { safeGoBack } from "@/utils/navigation";
import { usePlayerActions, usePlayerProgress, usePlayerRow } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/src/services/audio/PlaybackEngine";
import { globalPlayerDetailsVisibleRef } from "@/lib/playerModalRef";
import { formatDuration, Song, getBestImageUrl, convertJioSaavnSong } from "@/lib/musicData";
import { getRecentlyPlayed, getUserPlaylists, getSettings } from "@/lib/storage";
import { PingPongScroll } from "@/components/PingPongScroll";
import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import {
  DEFAULT_ARTWORK_PALETTE,
  extractArtworkColors,
  getImmediateArtworkPalette,
  preloadDominantColors,
  type ArtworkPalette,
} from "@/lib/colorExtractor";
import EqualizerBars from "@/src/components/EqualizerBars";
import DownloadButton from "@/components/DownloadButton";
import { mapFilter } from "@/lib/arrayUtils";
import { globalQueueSheetRef } from "@/lib/queueRef";

import YoutubePlayer from "react-native-youtube-iframe";
import { getYouTubeMusicVisualVideoId } from "@/src/data/providers/YouTubeMusicProvider";
import { searchArtists, getArtistDetails } from "@/src/data/providers/ArtistProvider";

const PLAYER_DETAIL_BOTTOM_OVERLAY_PADDING = 136;
const PLAYER_PRIMARY_DISMISS_START_PX = 8;
const PLAYER_PRIMARY_DISMISS_CLOSE_PX = 62;
const PLAYER_PRIMARY_DISMISS_FAST_VELOCITY = 650;
const PLAYER_PRIMARY_DISMISS_FAIL_X_PX = 34;
const PLAYER_PRIMARY_DISMISS_MAX_DRAG_RATIO = 0.58;
const PLAYER_PRIMARY_DISMISS_SPRING = {
  damping: 24,
  mass: 0.9,
  stiffness: 270,
};

const AnimatedSongFlatList = Animated.createAnimatedComponent(
  FlatList as React.ComponentType<any>
);

type SmoothControlButtonProps = {
  children: React.ReactNode;
  onPress?: () => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  hitSlop?: React.ComponentProps<typeof Pressable>["hitSlop"];
  disabled?: boolean;
};

function SmoothControlButton({
  children,
  onPress,
  onPressIn,
  onPressOut,
  style,
  hitSlop,
  disabled,
}: SmoothControlButtonProps) {
  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      onPressIn?.(event);
    },
    [onPressIn]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      onPressOut?.(event);
    },
    [onPressOut]
  );

  return (
    <Pressable
      android_disableSound
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={({ pressed }) => [style, pressed && styles.quickButtonPressed]}
    >
      {children}
    </Pressable>
  );
}

type ArtworkQueueItem = {
  song: Song;
  artworkKey: string;
};

const CinematicPlayerBackground = memo(function CinematicPlayerBackground() {
  return <View pointerEvents="none" style={styles.backgroundLayer} />;
});

const YOUTUBE_PLAYER_REFERRER_URL = "https://mavrixfy.site/";
const BACKGROUND_YOUTUBE_CHROME_CROP_PX = 260;
const BACKGROUND_YOUTUBE_CHROME_CROP_TOTAL_PX = BACKGROUND_YOUTUBE_CHROME_CROP_PX * 2;
// Injected after DOM is ready (injectedJavaScript only — not Before — so window.innerHeight is valid on Android)
const BACKGROUND_YOUTUBE_CROP_SCRIPT = `
(function () {
  function applyAmbientCrop() {
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) {
      setTimeout(applyAmbientCrop, 16);
      return;
    }

    var viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 220);
    var videoHeight = Math.ceil(viewportHeight + ${BACKGROUND_YOUTUBE_CHROME_CROP_TOTAL_PX});
    var videoWidth = Math.ceil(videoHeight * 16 / 9);
    var style = document.getElementById("mavrixfy-ambient-youtube-crop");
    if (!style) {
      style = document.createElement("style");
      style.id = "mavrixfy-ambient-youtube-crop";
      head.appendChild(style);
    }
    style.textContent = [
      "html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: ${Colors.background}; }",
      ".container { position: relative !important; width: 100% !important; height: 100vh !important; padding-bottom: 0 !important; overflow: hidden !important; background: ${Colors.background}; }",
      "#player, .container iframe { position: absolute !important; top: -${BACKGROUND_YOUTUBE_CHROME_CROP_PX}px !important; left: 50% !important; width: " + videoWidth + "px !important; height: " + videoHeight + "px !important; max-width: none !important; max-height: none !important; transform: translateX(-50%) !important; border: 0 !important; pointer-events: none !important; }"
    ].join("\\n");

    document.documentElement.style.overflow = "hidden";
    if (document.body) {
      document.body.style.overflow = "hidden";
      document.body.style.background = "${Colors.background}";
    }
  }

  applyAmbientCrop();
  setTimeout(applyAmbientCrop, 250);
  setTimeout(applyAmbientCrop, 1000);
  window.addEventListener("resize", applyAmbientCrop);
})();
true;
`;

// Injected BEFORE content loads — patches the YT player hooks so playVideo() is called
// the instant the player is ready, with no postMessage round-trip needed.
const BACKGROUND_YOUTUBE_PRELOAD_HOOK = `
(function () {
  function wrapHooks() {
    // onYouTubeIframeAPIReady is a function declaration in the inline <script> — hoisted.
    // Wrap it so we can intercept onPlayerReady right after the player is constructed.
    var _origAPIReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function() {
      if (_origAPIReady) _origAPIReady();
      // onPlayerReady is also a hoisted function declaration — wrap it after _origAPIReady ran
      var _origPlayerReady = window.onPlayerReady;
      window.onPlayerReady = function(event) {
        if (_origPlayerReady) _origPlayerReady(event);
        try { player.mute(); } catch(e) {}
        try { player.setVolume(0); } catch(e) {}
        try { player.setPlaybackQuality("tiny"); } catch(e) {}
        try { player.playVideo(); } catch(e) {}
      };
    };
  }
  wrapHooks();
  // Fallback: poll for player object in case the hooks already fired before this ran
  var attempts = 0;
  function tryPlayDirect() {
    attempts++;
    if (typeof player !== "undefined" && player && typeof player.playVideo === "function") {
      try { player.mute(); } catch(e) {}
      try { player.setVolume(0); } catch(e) {}
      try { player.setPlaybackQuality("tiny"); } catch(e) {}
      try { player.playVideo(); } catch(e) {}
      return;
    }
    if (attempts < 40) setTimeout(tryPlayDirect, 250);
  }
  setTimeout(tryPlayDirect, 600);
})();
true;
`;

type BackgroundYoutubeVideoProps = {
  videoId: string;
  isPlaying: boolean;
  positionMillis: number;
  containerHeight: number;
  isLowEnd?: boolean;
};

const BackgroundYoutubeVideo = memo(function BackgroundYoutubeVideo({
  videoId,
  isPlaying,
  positionMillis,
  containerHeight,
  isLowEnd = false,
}: BackgroundYoutubeVideoProps) {
  const { width: winW } = useWindowDimensions();
  const playerRef = useRef<any>(null);
  const initialPositionSeconds = Math.max(0, Math.floor(positionMillis / 1000));
  const lastPositionRef = useRef(initialPositionSeconds);
  const [playerReady, setPlayerReady] = useState(false);
  const videoOpacity = useRef<Animated.Value | null>(null);
  if (videoOpacity.current === null) {
    videoOpacity.current = new Animated.Value(0);
  }
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealVideo = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (videoOpacity.current) {
      Animated.timing(videoOpacity.current!, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, []);

  const onReady = useCallback(() => {
    setPlayerReady(true);
    // Fallback reveal at 800ms — video is at minimum loading/buffering by then.
    // If onChangeState fires first, revealVideo() cancels this and fades in immediately.
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(revealVideo, 800);
  }, [revealVideo]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  const handleBackgroundStateChange = useCallback((state: string) => {
    if (state === "playing" || state === "buffering") {
      revealVideo();
    }
  }, [revealVideo]);

  useEffect(() => {
    if (playerReady && playerRef.current) {
      if (isPlaying) {
        playerRef.current.playVideo?.();
      } else {
        playerRef.current.pauseVideo?.();
      }
    }
  }, [isPlaying, playerReady]);

  useEffect(() => {
    // Skip seek sync on low-end — saves a WebView injectJavaScript call on every audio tick
    if (isLowEnd) return;
    const targetSeconds = Math.max(0, Math.floor(positionMillis / 1000));
    if (playerReady && Math.abs(targetSeconds - lastPositionRef.current) > 10) {
      playerRef.current?.seekTo?.(targetSeconds, true);
    }
    lastPositionRef.current = targetSeconds;
  }, [positionMillis, playerReady, isLowEnd]);

  const dimensions = useMemo(() => {
    const frameW = Math.max(winW, 220);
    const frameH = Math.max(containerHeight, 220);

    const containerAspect = frameW / frameH;
    const videoAspect = 16 / 9;

    let videoW = frameW;
    let videoH = frameH;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > containerAspect) {
      videoH = frameH;
      videoW = Math.round(frameH * videoAspect);
      offsetX = Math.round(-(videoW - frameW) / 2);
    } else {
      videoW = frameW;
      videoH = Math.round(frameW / videoAspect);
      offsetY = Math.round(-(videoH - frameH) / 2);
    }

    return {
      frameW: videoW,
      frameH: videoH,
      offsetX,
      offsetY,
    };
  }, [winW, containerHeight]);

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { overflow: "hidden", backgroundColor: Colors.background },
      ]}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: dimensions.offsetY,
          left: dimensions.offsetX,
          width: dimensions.frameW,
          height: dimensions.frameH,
          opacity: videoOpacity.current!,
        }}
      >
        <YoutubePlayer
          key={videoId}
          ref={playerRef}
          height={dimensions.frameH}
          width={dimensions.frameW}
          // Backdrop is muted and decorative — always play while mounted; gated by shouldRenderBackgroundVideo
          play={isPlaying}
          mute={true}
          volume={0}
          videoId={videoId}
          onReady={onReady}
          onChangeState={handleBackgroundStateChange}
          onError={() => undefined}
          forceAndroidAutoplay
          useLocalHTML
          baseUrlOverride={YOUTUBE_PLAYER_REFERRER_URL}
          initialPlayerParams={{
            controls: false,
            modestbranding: true,
            rel: false,
            preventFullScreen: true,
            showClosedCaptions: false,
            iv_load_policy: 3,
            start: initialPositionSeconds,
            disablekb: true,
            fs: false,
            playsinline: true,
            cc_load_policy: 0,
            enablejsapi: 1,
            mute: 1,
          }}
          webViewProps={{
            javaScriptEnabled: true,
            domStorageEnabled: true,
            thirdPartyCookiesEnabled: true,
            // Pre-load hook: patches onYouTubeIframeAPIReady/onPlayerReady before the YT API
            // script loads, so playVideo() fires the instant the player is ready — no postMessage.
            // Safe to use Before because we're only defining functions, not reading layout.
            injectedJavaScriptBeforeContentLoaded: Platform.OS === "android"
              ? BACKGROUND_YOUTUBE_PRELOAD_HOOK
              : undefined,
            // Post-load: crop script runs after layout so window.innerHeight is valid.
            injectedJavaScript: BACKGROUND_YOUTUBE_CROP_SCRIPT,
            setSupportMultipleWindows: false,
            allowsFullscreenVideo: false,
            allowsInlineMediaPlayback: true,
            allowsBackgroundMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            scrollEnabled: false,
            overScrollMode: "never" as const,
            androidLayerType: "hardware" as const,
          }}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "rgba(0, 0, 0, 0.36)" }
          ]}
        />
      </Animated.View>
    </View>
  );
});

BackgroundYoutubeVideo.displayName = "BackgroundYoutubeVideo";

const StableArtworkImage = memo(function StableArtworkImage({
  uri,
  recyclingKey,
  priority,
}: {
  uri: string;
  recyclingKey: string;
  priority: "high" | "normal";
}) {
  const initialUriRef = useRef(uri);
  const [visibleUri, setVisibleUri] = useState(initialUriRef.current);
  const loadingUri = uri === visibleUri ? null : uri;
  const incomingOpacityRef = useRef<Animated.Value | null>(null);
  if (incomingOpacityRef.current === null) {
    incomingOpacityRef.current = new Animated.Value(1);
  }
  const incomingOpacity = incomingOpacityRef.current!;

  useEffect(() => {
    if (!loadingUri) {
      incomingOpacity.setValue(1);
      return;
    }

    incomingOpacity.stopAnimation();
    incomingOpacity.setValue(0);
  }, [incomingOpacity, loadingUri]);

  const handleIncomingLoad = useCallback(() => {
    Animated.timing(incomingOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setVisibleUri(uri);
    });
  }, [incomingOpacity, uri]);

  const handleIncomingError = useCallback(() => {
    incomingOpacity.setValue(1);
    setVisibleUri(uri);
  }, [incomingOpacity, uri]);

  return (
    <View style={styles.albumArtLayer}>
      <Image
        recyclingKey={`visible-${recyclingKey}-${visibleUri}`}
        source={{ uri: visibleUri }}
        style={styles.albumArt}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={priority}
        transition={0}
      />
      {loadingUri ? (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: incomingOpacity }]}>
          <Image
            recyclingKey={`incoming-${recyclingKey}-${loadingUri}`}
            source={{ uri: loadingUri }}
            style={styles.albumArt}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority={priority}
            transition={0}
            onLoad={handleIncomingLoad}
            onError={handleIncomingError}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});






function PlayerPlayButton({
  isPlayingOverride,
  isLoadingOverride,
  buttonSize,
  iconSize,
  onAccentColor,
  onPress,
}: {
  isPlayingOverride?: boolean;
  isLoadingOverride?: boolean;
  buttonSize: number;
  iconSize: number;
  onAccentColor: string;
  onPress: () => void;
}) {
  const playbackState = usePlaybackPlayState();
  const isPlaying = isPlayingOverride ?? playbackState.isPlaying;
  const isLoading = isLoadingOverride ?? (playbackState.isBuffering || playbackState.isLoading);
  const [showSpinner, setShowSpinner] = useState(false);

  if (!isLoading && showSpinner) {
    setShowSpinner(false);
  }

  useEffect(() => {
    if (!isLoading) return;

    const timer = setTimeout(() => {
      setShowSpinner(true);
    }, 180);

    return () => clearTimeout(timer);
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- isLoading is the only reactive dep needed
  }, [isLoading]);

  return (
    <SmoothControlButton
      onPress={onPress}
      style={[
        styles.playButton,
        {
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.92)",
        },
      ]}
    >
      {showSpinner ? (
        <ActivityIndicator size="small" color={onAccentColor} />
      ) : (
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={iconSize}
          color={onAccentColor}
          style={!isPlaying ? { marginLeft: 2 } : undefined}
        />
      )}
    </SmoothControlButton>
  );
}

PlayerPlayButton.displayName = "PlayerPlayButton";

// ─── PlayerSlider ────────────────────────────────────────────────────────────
// Custom Spotify-style scrubber. The visual fill/thumb stay in-app, while the
// gesture runs on the UI thread so dragging remains smooth.

const PLAYER_SLIDER_MINIMUM_TRACK_COLOR = "#F7FAFF";
const PLAYER_SLIDER_MAXIMUM_TRACK_COLOR = "rgba(247,250,255,0.28)";
const PLAYER_SLIDER_THUMB_COLOR = "#F7FAFF";
const PLAYER_SLIDER_TOUCH_HEIGHT = 36;
const PLAYER_SLIDER_THUMB_SIZE = 10;

function clampUnit(value: number): number {
  "worklet";
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function progressFromGestureX(x: number, width: number): number {
  "worklet";
  const safeWidth = Math.max(1, width);
  return clampUnit(x / safeWidth);
}

type PlayerSliderProps = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  disabled?: boolean;
  onSlidingStart?: () => void;
  onValueChange?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  onSlidingCancel?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: React.ComponentProps<typeof View>["accessibilityRole"];
  accessibilityValue?: React.ComponentProps<typeof View>["accessibilityValue"];
};

function PlayerSlider({
  value,
  minimumValue,
  maximumValue,
  disabled = false,
  onSlidingStart,
  onValueChange,
  onSlidingComplete,
  onSlidingCancel,
  accessible,
  accessibilityLabel,
  accessibilityRole,
  accessibilityValue,
}: PlayerSliderProps) {
  const trackWidth = useSharedValue(0);
  const visualProgress = useSharedValue(0);
  const isSlidingShared = useSharedValue(0);
  const didCompleteGesture = useSharedValue(0);
  const isSlidingRef = useRef(false);
  const range = maximumValue - minimumValue;
  const normalizedValue = range > 0 ? clampUnit((value - minimumValue) / range) : 0;

  useEffect(() => {
    if (!isSlidingRef.current) {
      visualProgress.value = normalizedValue;
    }
  }, [normalizedValue, visualProgress]);

  useEffect(() => {
    if (!disabled) return;
    isSlidingRef.current = false;
    isSlidingShared.value = 0;
  }, [disabled, isSlidingShared]);

  const emitValue = useCallback(
    (nextProgress: number, shouldComplete: boolean) => {
      const nextValue = minimumValue + clampUnit(nextProgress) * range;
      onValueChange?.(nextValue);
      if (!shouldComplete) return;

      isSlidingRef.current = false;
      onSlidingComplete?.(nextValue);
    },
    [minimumValue, onSlidingComplete, onValueChange, range]
  );

  const beginSliding = useCallback(() => {
    if (isSlidingRef.current) return;
    isSlidingRef.current = true;
    onSlidingStart?.();
  }, [onSlidingStart]);

  const cancelSliding = useCallback(() => {
    if (!isSlidingRef.current) return;
    isSlidingRef.current = false;
    onSlidingCancel?.();
  }, [onSlidingCancel]);

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (disabled || range <= 0) return;
      const step = range / 20;
      const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
      const nextValue = Math.min(maximumValue, Math.max(minimumValue, value + step * direction));
      onSlidingStart?.();
      onValueChange?.(nextValue);
      onSlidingComplete?.(nextValue);
    },
    [disabled, maximumValue, minimumValue, onSlidingComplete, onSlidingStart, onValueChange, range, value]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .minDistance(0)
        .onTouchesDown((event) => {
          const touch = event.allTouches[0] ?? event.changedTouches[0];
          if (!touch) return;

          didCompleteGesture.value = 0;
          isSlidingShared.value = 1;
          const nextProgress = progressFromGestureX(touch.x, trackWidth.value);
          visualProgress.value = nextProgress;
          scheduleOnRN(beginSliding);
          scheduleOnRN(emitValue, nextProgress, false);
        })
        .onBegin((event) => {
          if (isSlidingShared.value > 0) return;

          didCompleteGesture.value = 0;
          isSlidingShared.value = 1;
          const nextProgress = progressFromGestureX(event.x, trackWidth.value);
          visualProgress.value = nextProgress;
          scheduleOnRN(beginSliding);
          scheduleOnRN(emitValue, nextProgress, false);
        })
        .onUpdate((event) => {
          const nextProgress = progressFromGestureX(event.x, trackWidth.value);
          visualProgress.value = nextProgress;
          scheduleOnRN(emitValue, nextProgress, false);
        })
        .onEnd(() => {
          if (didCompleteGesture.value === 1) return;

          didCompleteGesture.value = 1;
          scheduleOnRN(emitValue, visualProgress.value, true);
        })
        .onTouchesUp((event) => {
          if (didCompleteGesture.value === 1) return;

          const touch = event.changedTouches[0] ?? event.allTouches[0];
          if (!touch) return;

          const nextProgress = progressFromGestureX(touch.x, trackWidth.value);
          visualProgress.value = nextProgress;
          didCompleteGesture.value = 1;
          scheduleOnRN(emitValue, nextProgress, true);
        })
        .onFinalize(() => {
          isSlidingShared.value = 0;
          if (didCompleteGesture.value === 0) {
            scheduleOnRN(cancelSliding);
          }
        }),
    [beginSliding, cancelSliding, didCompleteGesture, disabled, emitValue, isSlidingShared, trackWidth, visualProgress]
  );

  const fillAnimatedStyle = useAnimatedStyle(() => ({
    width: Math.max(0, trackWidth.value * visualProgress.value),
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.45 : 1,
    transform: [
      {
        translateX: Math.max(0, trackWidth.value * visualProgress.value) - PLAYER_SLIDER_THUMB_SIZE / 2,
      },
      { scale: isSlidingShared.value ? 1.16 : 1 },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View
        accessible={accessible}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityValue={accessibilityValue}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={(event) => {
          trackWidth.value = Math.max(1, event.nativeEvent.layout.width);
        }}
        style={[styles.playerSlider, disabled && styles.playerSliderDisabled]}
      >
        <View style={styles.playerSliderTrack}>
          <Reanimated.View style={[styles.playerSliderFill, fillAnimatedStyle]} />
        </View>
        <Reanimated.View pointerEvents="none" style={[styles.playerSliderThumb, thumbAnimatedStyle]} />
      </View>
    </GestureDetector>
  );
}

type PlayerSpotifyProgressProps = {
  screenSongId: string;
  songDurationSeconds: number;
  isShortScreen: boolean;
  seekTo: (progress: number) => void;
  onSeekingChange: (isSeeking: boolean) => void;
};

const PlayerSpotifyProgress = memo(function PlayerSpotifyProgress({
  screenSongId,
  songDurationSeconds,
  isShortScreen,
  seekTo,
  onSeekingChange,
}: PlayerSpotifyProgressProps) {
  const { progress, duration } = usePlayerProgress();
  const { isPlaying } = usePlayerRow();
  const { isBuffering, isLoading } = usePlaybackPlayState();

  const [localProgress, setLocalProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const lastSyncRef = useRef({ progress: 0, timestamp: Date.now() });
  const ignoreStaleProgressRef = useRef(false);

  // Sync with global progress changes during render phase
  const [prevProgress, setPrevProgress] = useState(progress);
  const [trackedSongId, setTrackedSongId] = useState(screenSongId);

  // Sync state inline during render
  if (screenSongId !== trackedSongId) {
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setTrackedSongId(screenSongId);
    setPrevProgress(0);
    setLocalProgress(0);
    setIsScrubbing(false);
  } else if (progress !== prevProgress) {
    setPrevProgress(progress);
    if (!isScrubbing) {
      if (ignoreStaleProgressRef.current) {
        if (progress <= 0.05) {
          setLocalProgress(progress);
        }
      } else {
        setLocalProgress(progress);
      }
    }
  }

  useEffect(() => {
    lastSyncRef.current = { progress: 0, timestamp: Date.now() };
    ignoreStaleProgressRef.current = true;
  }, [screenSongId]);

  useEffect(() => {
    if (!isScrubbing) {
      if (ignoreStaleProgressRef.current) {
        if (progress <= 0.05) {
          ignoreStaleProgressRef.current = false;
          lastSyncRef.current = { progress, timestamp: Date.now() };
        }
      } else {
        lastSyncRef.current = { progress, timestamp: Date.now() };
      }
    }
  }, [progress, isScrubbing]);

  // A song progress bar moves by less than a pixel per sample at 4 Hz on a
  // phone. Updating React state every animation frame needlessly rerendered
  // the player around 60 times per second and kept multiple CPU cores busy.
  useEffect(() => {
    if (!isPlaying || isBuffering || isLoading || isScrubbing) return;

    // Reset the reference point to prevent jumping after pause/resume or buffering
    lastSyncRef.current = { progress, timestamp: Date.now() };

    const updateInterpolatedProgress = () => {
      const elapsedSec = (Date.now() - lastSyncRef.current.timestamp) / 1000;
      const durationSec = duration / 1000;
      if (durationSec > 0) {
        const addedProgress = elapsedSec / durationSec;
        const nextProgress = Math.min(1.0, lastSyncRef.current.progress + addedProgress);
        setLocalProgress(nextProgress);
      }
    };

    updateInterpolatedProgress();
    const interval = setInterval(updateInterpolatedProgress, 250);
    return () => clearInterval(interval);
  }, [isPlaying, isBuffering, isLoading, duration, isScrubbing, progress]);

  const liveProgress = isPlaying && !isScrubbing ? localProgress : progress;
  const playerProgress = liveProgress;
  const safeSongDuration = Number.isFinite(songDurationSeconds) ? Math.max(0, songDurationSeconds) : 0;
  const playerDuration = duration;
  const playerPositionMillis = Math.round(playerDuration * playerProgress);
  const currentTimeSec = Math.floor(playerPositionMillis / 1000);
  const totalDurationSec = Math.floor(playerDuration / 1000);
  const effectiveDurationSec = totalDurationSec > 0 ? totalDurationSec : safeSongDuration;
  const canSeek =
    effectiveDurationSec > 0 ||
    (Platform.OS === "android" && Boolean(screenSongId));
  const displayDuration =
    totalDurationSec > 0 ? formatDuration(totalDurationSec) : formatDuration(safeSongDuration);

  const updateSeeking = useCallback(
    (next: boolean) => onSeekingChange(next),
    [onSeekingChange]
  );



  // Slider works on a fixed 0..1000 scale. Convert normalized progress to/from it.
  const SLIDER_MAX = 1000;
  const sliderValue = Math.round(playerProgress * SLIDER_MAX);
  const currentDisplayTime = formatDuration(
    Math.min(effectiveDurationSec, currentTimeSec)
  );

  // While the user is dragging, don't sync from playback; let the custom
  // scrubber follow the finger and only commit the seek when the gesture ends.
  const handleSlidingStart = useCallback(() => {
    setIsScrubbing(true);
    updateSeeking(true);
  }, [updateSeeking]);

  const handleValueChange = useCallback((value: number) => {
    const normalized = clampUnit(value / SLIDER_MAX);
    setLocalProgress(normalized);
  }, []);

  const handleSlidingComplete = useCallback((value: number) => {
    const normalized = clampUnit(value / SLIDER_MAX);
    setIsScrubbing(false);
    updateSeeking(false);
    setLocalProgress(normalized);
    seekTo(normalized);
  }, [seekTo, updateSeeking]);

  const handleSlidingCancel = useCallback(() => {
    setIsScrubbing(false);
    updateSeeking(false);
    setLocalProgress(progress);
  }, [progress, updateSeeking]);

  return (
    <View
      style={[
        styles.spotifyProgressWrap,
        { marginTop: isShortScreen ? 8 : 10, marginHorizontal: isShortScreen ? 14 : 20 },
      ]}
    >
      <PlayerSlider
        value={sliderValue}
        minimumValue={0}
        maximumValue={SLIDER_MAX}
        onSlidingStart={handleSlidingStart}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        onSlidingCancel={handleSlidingCancel}
        disabled={!canSeek}
        accessible
        accessibilityLabel="Playback position"
        accessibilityRole="adjustable"
        accessibilityValue={{
          text: `${currentDisplayTime} of ${displayDuration}`,
        }}
      />
      <View style={styles.spotifyTimeRow}>
        <Text style={styles.spotifyTimeText}>{currentDisplayTime}</Text>
        <Text style={styles.spotifyTimeText}>{displayDuration}</Text>
      </View>
    </View>
  );
});

PlayerSpotifyProgress.displayName = "PlayerSpotifyProgress";


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
      <GHPressable style={rowStyle} onPress={handlePress}>
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
      </GHPressable>
    );
  }
);

QueueSongRow.displayName = "QueueSongRow";

function formatFollowers(n: number | null | undefined): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`;
  return `${n} followers`;
}

// About Artist Card Component
const AboutArtistCard = memo(({
  artistDetails,
  loading,
  onPress,
}: {
  artistDetails: any;
  loading: boolean;
  onPress: () => void;
}) => {
  if (loading) {
    return (
      <View style={styles.artistCardContainer}>
        <Text style={styles.artistSectionTitle}>About the Artist</Text>
        <View style={[styles.artistCard, { height: 120, justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator size="small" color="#F7FAFF" />
        </View>
      </View>
    );
  }

  if (!artistDetails) return null;

  const imageUrl = artistDetails.image?.length ? getBestImageUrl(artistDetails.image) : "";
  const followerText = artistDetails.followerCount ? formatFollowers(artistDetails.followerCount) : "";
  const bioText = artistDetails.bio?.[0]?.text || "";

  return (
    <View style={styles.artistCardContainer}>
      <Text style={styles.artistSectionTitle}>About the Artist</Text>
      <Pressable style={styles.artistCard} onPress={onPress}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : null}
        <LinearGradient
          colors={["rgba(7,10,16,0.2)", "rgba(7,10,16,0.65)", "#070A10"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.artistCardContent}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {artistDetails.isVerified && (
              <Ionicons name="checkmark-circle" size={16} color="#F7FAFF" />
            )}
            <Text style={styles.artistCardName}>{artistDetails.name}</Text>
          </View>
          {followerText ? <Text style={styles.artistCardFollowers}>{followerText}</Text> : null}
          {bioText ? (
            <Text style={styles.artistCardBio} numberOfLines={2}>
              {bioText}
            </Text>
          ) : null}
          <View style={styles.artistCardButton}>
            <Text style={styles.artistCardButtonText}>View Profile</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
});

AboutArtistCard.displayName = "AboutArtistCard";

// Related Songs Component
const RelatedSongsSection = memo(({
  songs,
  onSongPress,
}: {
  songs: Song[];
  onSongPress: (song: Song) => void;
}) => {
  if (songs.length === 0) return null;

  return (
    <View style={styles.relatedSongsContainer}>
      <Text style={styles.artistSectionTitle}>You Might Also Like</Text>
      <View style={styles.relatedSongsList}>
        {songs.map((song) => (
          <Pressable
            key={song.id}
            style={styles.relatedSongRow}
            onPress={() => onSongPress(song)}
          >
            <Image
              source={{ uri: song.coverUrl || undefined }}
              style={styles.relatedSongThumb}
              contentFit="cover"
              transition={120}
            />
            <View style={styles.relatedSongTextWrap}>
              <Text style={styles.relatedSongTitle} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={styles.relatedSongArtist} numberOfLines={1}>
                {song.artist}
              </Text>
            </View>
            <Ionicons name="play-circle-outline" size={24} color="rgba(255,255,255,0.6)" />
          </Pressable>
        ))}
      </View>
    </View>
  );
});

RelatedSongsSection.displayName = "RelatedSongsSection";

const EMPTY_PLAYER_SCROLL_SONGS: Song[] = [];

// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this app
function LegacyPlayerScreenView() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [ambientBackdropEnabled, setAmbientBackdropEnabled] = useState(false);
  const [isNavigationFocused, setIsNavigationFocused] = useState(() => navigation.isFocused());
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === "active");
  const isScreenFocused = isNavigationFocused && isAppActive;

  const [isLowEnd, setIsLowEnd] = useState(false);

  useEffect(() => {
    let mounted = true;

    void getDevicePerformanceProfile().then((profile) => {
      if (mounted) {
        setIsLowEnd(profile.isLowEndDevice);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchSettings = () => {
      getSettings().then((s) => {
        if (mounted) {
          setAmbientBackdropEnabled(s.ambientBackdropEnabled);
        }
      });
    };
    fetchSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const fetchSettings = () => {
      getSettings().then((s) => {
        setAmbientBackdropEnabled(s.ambientBackdropEnabled);
      });
    };
    const handler = () => {
      fetchSettings();
      setIsNavigationFocused(true);
    };
    navigation.addListener("focus", handler);
    return () => {
      navigation.removeListener("focus", handler);
    };
  }, [navigation]);

  useEffect(() => {
    const handler = () => {
      setIsNavigationFocused(false);
    };
    navigation.addListener("blur", handler);
    return () => {
      navigation.removeListener("blur", handler);
    };
  }, [navigation]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);
  
  // ALL HOOKS - must be called unconditionally at top level
  const {
    currentSong,
    queue,
    sourceQueue,
    queueIndex,
    repeatMode,
  } = usePlaybackNowPlaying();
  const playbackState = usePlaybackPlayState();

  const [isProgressSeeking, setIsProgressSeeking] = useState(false);
  const [prevTrackedSongId, setPrevTrackedSongId] = useState(currentSong?.id);
  const [, setArtworkPalette] = useState<ArtworkPalette>(DEFAULT_ARTWORK_PALETTE);
  const [isLoadingDevTrack, setIsLoadingDevTrack] = useState(false);
  const [interactionReady, setInteractionReady] = useState(false);
  const [backgroundVideoId, setBackgroundVideoId] = useState<string | null>(null);
  const skipCooldownRef = useRef(false);
  const skipCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artScrollXRef = useRef<Animated.Value | null>(null);
  if (artScrollXRef.current === null) {
    artScrollXRef.current = new Animated.Value(0);
  }
  const artCarouselRef = useRef<FlatList<ArtworkQueueItem> | null>(null);
  const hasAlignedArtCarouselRef = useRef(false);
  const prevSongIdRef = useRef(currentSong?.id);
  const pendingArtworkTargetIndexRef = useRef<number | null>(null);
  const didHandleSheetDismissRef = useRef(false);
  const sheetDetentReadyAtRef = useRef(0);
  const playerDismissGestureEnabledRef = useRef(true);
  const playerDismissGestureEnabledShared = useSharedValue(1);
  const playerDismissTranslateY = useSharedValue(0);
  const optionsPressLockRef = useRef(false);
  const { positionMillis } = usePlayerProgress();
  
  const {
    togglePlay,
    playSong,
    nextSong,
    prevSong,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    isLiked,
    setAlbumColor,
    setTextColor,
  } = usePlayerActions();
  
  if (currentSong?.id !== prevTrackedSongId) {
    setPrevTrackedSongId(currentSong?.id);
    setIsProgressSeeking(false);
  }
  const artScrollX = artScrollXRef.current!;

  const clearSkipCooldownTimer = useCallback(() => {
    if (!skipCooldownTimerRef.current) return;
    clearTimeout(skipCooldownTimerRef.current);
    skipCooldownTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearSkipCooldownTimer();
    };
  }, [clearSkipCooldownTimer]);

  const setPlayerDismissGestureEnabled = useCallback((enabled: boolean) => {
    if (playerDismissGestureEnabledRef.current === enabled) return;

    playerDismissGestureEnabledRef.current = enabled;
    playerDismissGestureEnabledShared.value = enabled ? 1 : 0;
    if (!enabled) {
      playerDismissTranslateY.value = withSpring(0, PLAYER_PRIMARY_DISMISS_SPRING);
    }
    if (Platform.OS !== "ios") return;

    navigation.setOptions({ gestureEnabled: enabled });
  }, [navigation, playerDismissGestureEnabledShared, playerDismissTranslateY]);

  useEffect(() => {
    playerDismissGestureEnabledRef.current = true;
    playerDismissGestureEnabledShared.value = 1;
    playerDismissTranslateY.value = 0;
    if (Platform.OS === "ios") {
      navigation.setOptions({ gestureEnabled: true });
    }

    return () => {
      if (Platform.OS === "ios") {
        navigation.setOptions({ gestureEnabled: true });
      }
    };
  }, [navigation, playerDismissGestureEnabledShared, playerDismissTranslateY]);

  useEffect(() => {
    const handler = () => {
      didHandleSheetDismissRef.current = false;
      sheetDetentReadyAtRef.current = Date.now() + 450;
      playerDismissGestureEnabledRef.current = true;
      playerDismissGestureEnabledShared.value = 1;
      playerDismissTranslateY.value = 0;
      if (Platform.OS === "ios") {
        navigation.setOptions({ gestureEnabled: true });
      }
    };
    navigation.addListener("focus", handler);
    return () => {
      navigation.removeListener("focus", handler);
    };
  }, [navigation, playerDismissGestureEnabledShared, playerDismissTranslateY]);

  // ── Defer heavy work until after the open animation completes ───────────────
  useEffect(() => {
    globalPlayerDetailsVisibleRef.setVisible(true);
    const task = InteractionManager.runAfterInteractions(() => {
      setInteractionReady(true);
    });
    const fallbackTimer = setTimeout(() => {
      setInteractionReady(true);
    }, 300);
    return () => {
      globalPlayerDetailsVisibleRef.setVisible(false);
      task.cancel();
      clearTimeout(fallbackTimer);
    };
  }, []);

  const screenSong = currentSong ?? null;
  const screenSongIsYouTube = Boolean(screenSong?.source === "youtube" || screenSong?.id?.startsWith("youtube_"));

  // Use only screenSong?.id as dep — the whole screenSong object changes reference
  // on every queue update even when the song hasn't changed, which would flash
  // backgroundVideoId to null and remount BackgroundYoutubeVideo unnecessarily.
  const screenSongIdForVideo = screenSong?.id ?? null;
  useEffect(() => {
    if (!screenSongIdForVideo || !screenSong) {
      setBackgroundVideoId(null);
      return;
    }

    setBackgroundVideoId(null);

    let cancelled = false;
    void getYouTubeMusicVisualVideoId(screenSong)
      .then((visualVideoId) => {
        if (cancelled) return;
        setBackgroundVideoId(visualVideoId || null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenSongIdForVideo]); // intentionally excludes screenSong object — only song ID change should retrigger

  const ambientVideoLayoutActive = useMemo(() => Boolean(
    ambientBackdropEnabled &&
    backgroundVideoId &&
    !isLowEnd
  ), [ambientBackdropEnabled, backgroundVideoId, isLowEnd]);

  // Delay mounting the backdrop WebView until after interaction settles.
  // On low-end Android, add an extra 2 s so the audio WebView fully claims resources first.
  const [backdropMountReady, setBackdropMountReady] = useState(false);
  useEffect(() => {
    if (!interactionReady || backdropMountReady) return;
    const delay = isLowEnd ? 2000 : 0;
    const t = setTimeout(() => setBackdropMountReady(true), delay);
    return () => clearTimeout(t);
  }, [interactionReady, backdropMountReady, isLowEnd]);

  const shouldRenderBackgroundVideo = useMemo(() => Boolean(
    ambientVideoLayoutActive && interactionReady && backdropMountReady
  ), [ambientVideoLayoutActive, interactionReady, backdropMountReady]);



  useEffect(() => {
    didHandleSheetDismissRef.current = false;
    sheetDetentReadyAtRef.current = Date.now() + 450;
  }, [screenSong?.id]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const handler = (event: any) => {
      const index = event?.data?.index;
      const isStable = event?.data?.stable ?? true;
      if (Date.now() < sheetDetentReadyAtRef.current) {
        return;
      }
      if (!isStable || index !== 0) {
        return;
      }
      if (!playerDismissGestureEnabledRef.current) {
        return;
      }
      if (didHandleSheetDismissRef.current) {
        return;
      }
      didHandleSheetDismissRef.current = true;
      safeGoBack();
    };

    navigation.addListener("sheetDetentChange" as never, handler as never);
    return () => {
      navigation.removeListener("sheetDetentChange" as never, handler as never);
    };
  }, [navigation]);

  const applyPlayerArtworkColors = useCallback((palette: ArtworkPalette) => {
    // React automatically batches these updates
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setArtworkPalette(palette);
    setAlbumColor(palette.accent);
    setTextColor(palette.text);
  }, [setAlbumColor, setTextColor]);

  const handleSongOptionsPress = useCallback(() => {
    if (!screenSong || optionsPressLockRef.current) return;

    optionsPressLockRef.current = true;
    router.push(
      {
        pathname: "/song-options",
        params: {
          song: JSON.stringify(screenSong),
          showDownload: "1",
          canRemove: "0",
          optionContext: "",
          playlistSource: "",
          playlistName: "",
        },
      },
      { dangerouslySingular: () => "song-options" }
    );

    setTimeout(() => {
      optionsPressLockRef.current = false;
    }, 600);
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- optionsPressLockRef is a stable ref; screenSong is the only reactive dep
  }, [screenSong]);

  useEffect(() => {
    if (!interactionReady) return;
    let active = true;
    const cover = screenSong?.coverUrl?.trim();
    if (!cover) {
      applyPlayerArtworkColors(DEFAULT_ARTWORK_PALETTE);
      return () => { };
    }

    const immediatePalette = getImmediateArtworkPalette(cover);
    applyPlayerArtworkColors(immediatePalette);

    extractArtworkColors(cover)
      .then((palette) => {
        if (!active) return;
        if (screenSong?.coverUrl?.trim() !== cover) return;
        // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
        applyPlayerArtworkColors(palette);
      })
      .catch(() => { });

    return () => {
      active = false;
    };
  }, [applyPlayerArtworkColors, interactionReady, screenSong?.id, screenSong?.coverUrl]);

  const rawTopInset = Platform.OS === "web" ? 67 : insets.top;
  const topInset = rawTopInset;
  const bottomInset = Platform.OS === "web" ? 28 : insets.bottom;
  const isShortScreen = screenHeight <= 760;
  const isVeryShortScreen = screenHeight <= 700;
  const topBarHeight = isShortScreen ? 50 : 54;
  const controlButtonSize = isVeryShortScreen ? 38 : isShortScreen ? 40 : 42;
  const prevNextButtonSize = isVeryShortScreen ? 46 : isShortScreen ? 50 : 54;
  const prevNextIconSize = isVeryShortScreen ? 24 : isShortScreen ? 27 : 30;
  const shuffleRepeatIconSize = isVeryShortScreen ? 18 : isShortScreen ? 19 : 20;
  const playButtonSize = isVeryShortScreen ? 60 : isShortScreen ? 64 : 68;
  const playIconSize = isVeryShortScreen ? 28 : isShortScreen ? 31 : 34;
  const controlsRowGap = isVeryShortScreen ? 8 : isShortScreen ? 10 : 12;
  const songDetailActionSize = isVeryShortScreen ? 38 : 42;
  const songDetailIconSize = isVeryShortScreen ? 21 : 23;
  const listBottomPadding =
    Platform.OS === "web"
      ? 16
      : Math.max(PLAYER_DETAIL_BOTTOM_OVERLAY_PADDING, bottomInset + PLAYER_DETAIL_BOTTOM_OVERLAY_PADDING);
  const largeArtworkByWidth = Math.min(screenWidth - (isShortScreen ? 44 : 38), isShortScreen ? 348 : 388);
  const largeArtworkByHeight = Math.max(
    isVeryShortScreen ? 220 : 240,
    Math.floor(screenHeight * (isVeryShortScreen ? 0.34 : isShortScreen ? 0.38 : 0.42))
  );
  const artSize = Math.min(largeArtworkByWidth, largeArtworkByHeight);

  const playerDismissAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    return {
      transform: [{ translateY }],
    };
  }, []);

  const targetScale = (Platform.OS === "ios" ? 40 : 48) / artSize;
  const targetCenterX = Platform.OS === "ios" ? 40 : 48;
  const cardTop = topInset + 54 + (isVeryShortScreen ? 8 : isShortScreen ? 12 : 18);
  const cardCenterY = cardTop + artSize / 2;
  const targetCenterY = screenHeight - bottomInset - 30;
  const targetTranslateYRelative = targetCenterY - screenHeight - cardCenterY;

  const artworkDismissAnimatedStyle = useAnimatedStyle(() => {
    const translateYVal = Math.max(0, playerDismissTranslateY.value);

    const scaleVal = interpolate(
      translateYVal,
      [0, screenHeight],
      [1, targetScale],
      Extrapolation.CLAMP
    );

    const translateXVal = interpolate(
      translateYVal,
      [0, screenHeight],
      [0, targetCenterX - screenWidth / 2],
      Extrapolation.CLAMP
    );

    const translateYValRelative = interpolate(
      translateYVal,
      [0, screenHeight],
      [0, targetTranslateYRelative],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateXVal },
        { translateY: translateYValRelative },
        { scale: scaleVal },
      ],
    };
  }, [screenHeight, screenWidth, targetScale, targetCenterX, targetTranslateYRelative]);

  const controlsDismissAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    const opacity = interpolate(
      translateY,
      [0, screenHeight * 0.22],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
    };
  }, [screenHeight]);

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    const opacity = interpolate(
      translateY,
      [0, screenHeight],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
    };
  }, [screenHeight]);

  const bgOpacityAnimatedStyle = useAnimatedStyle(() => {
    const translateY = Math.max(0, playerDismissTranslateY.value);
    const opacity = interpolate(
      translateY,
      [0, screenHeight * 0.45],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
    };
  }, [screenHeight]);

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
    // currentSong only needed as fallback when both queues are empty (single song)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, sourceQueue, currentSong?.id]);
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
  const playingQueue = livePlayingQueue;
  const activeQueueIndex = liveActiveQueueIndex;

  const [artistDetails, setArtistDetails] = useState<any>(null);
  const [artistLoading, setArtistLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!screenSong?.artist) {
      setArtistDetails(null);
      return;
    }

    async function loadArtist() {
      if (!active) return;
      setArtistLoading(true);
      try {
        const currentArtist = screenSong?.artist;
        if (!currentArtist) return;
        const query = currentArtist.split(",")[0].trim();
        const artists = await searchArtists(query);
        if (!active) return;
        if (artists.length > 0) {
          const details = await getArtistDetails(artists[0].id);
          if (!active) return;
          setArtistDetails(details);
        } else {
          setArtistDetails(null);
        }
      } catch {
      } finally {
        if (active) setArtistLoading(false);
      }
    }

    void loadArtist();
    return () => {
      active = false;
    };
  }, [screenSong?.artist]);

  const relatedSongs = useMemo<Song[]>(() => {
    if (!artistDetails?.topSongs) return [];
    const filtered = artistDetails.topSongs.flatMap((item: any) => {
      const s = convertJioSaavnSong(item);
      return s.id !== screenSong?.id ? [s] : [];
    });
    return filtered.slice(0, 5);
  }, [artistDetails, screenSong?.id]);

  const handleViewArtistProfile = useCallback(() => {
    if (!artistDetails) return;
    safeGoBack();
    setTimeout(() => {
      router.push({
        pathname: "/artist/[id]",
        params: {
          id: artistDetails.id,
          name: artistDetails.name,
          image: artistDetails.image?.length ? getBestImageUrl(artistDetails.image) : "",
        },
      });
    }, 120);
  }, [artistDetails]);

  const handlePlayRelatedSong = useCallback((song: Song) => {
    playSong(song, [song, ...playingQueue.slice(activeQueueIndex + 1)]);
  },
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- activeQueueIndex is the normalized liveActiveQueueIndex used by this handler.
    [playingQueue, activeQueueIndex, playSong]);

  const artworkQueue = useMemo<ArtworkQueueItem[]>(() => {
    const occurrenceByKey = new Map<string, number>();
    return playingQueue.map((song) => {
      const baseKey = String(song.id || song.audioUrl || song.coverUrl || song.title || "artwork");
      const occurrence = occurrenceByKey.get(baseKey) ?? 0;
      occurrenceByKey.set(baseKey, occurrence + 1);
      return {
        song,
        artworkKey: occurrence === 0 ? baseKey : `${baseKey}-${occurrence}`,
      };
    });
  }, [playingQueue]);
  const playerIsPlaying = playbackState.isPlaying;
  const playerRepeatMode = repeatMode;


  useEffect(() => {
    const urls = mapFilter([
      playingQueue[activeQueueIndex - 1]?.coverUrl,
      playingQueue[activeQueueIndex]?.coverUrl,
      playingQueue[activeQueueIndex + 1]?.coverUrl,
    ], (url) => url?.trim(), (url): url is string => Boolean(url));

    if (urls.length === 0) return;
    void Image.prefetch(urls, "memory-disk").catch(() => { });
    preloadDominantColors(urls);
  }, [activeQueueIndex, liveActiveQueueIndex, playingQueue]);

  const liked = screenSong ? isLiked(screenSong.id) : false;
  const queueRowHeight = isShortScreen ? 48 : 54;
  const queueViewportHeight = Math.min(
    playingQueue.length * queueRowHeight + 16,
    Math.round(screenHeight * 0.55)
  );
  const queueViewportStyle = useMemo(
    () => ({ height: queueViewportHeight }),
    [queueViewportHeight]
  );
  const artCarouselViewportWidth = screenWidth;
  const artCarouselPageWidth = artCarouselViewportWidth;
  const artCarouselSnapInterval = artCarouselPageWidth;

  const sheetTextColor = Colors.text;
  const sheetMutedTextColor = "rgba(223,226,235,0.68)";
  // These are all static — define once outside the component (see bottom of file)
  const activeControlIconColor = "#FFFFFF";
  const sideControlIconColor = "#FFFFFF";
  const selectedControlIconColor = Colors.primary;

  // Memoize control button base styles to avoid new objects every render
  const ctrlBtnBase = useMemo(
    () => ({
      width: controlButtonSize,
      height: controlButtonSize,
      borderRadius: controlButtonSize / 2,
    }),
    // React Doctor tracks the source values behind controlButtonSize, while ESLint correctly sees the derived value as sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controlButtonSize, isVeryShortScreen, isShortScreen]
  );
  const playerIconBtnStyle = useMemo(
    () => ({ ...ctrlBtnBase, backgroundColor: "transparent", borderColor: "transparent" }),
    [ctrlBtnBase]
  );
  const songDetailActionBtnStyle = useMemo(
    () => ({
      width: songDetailActionSize,
      height: songDetailActionSize,
      borderRadius: songDetailActionSize / 2,
      backgroundColor: "transparent",
      borderColor: "transparent",
    }),
    // React Doctor tracks the source value behind songDetailActionSize, while ESLint correctly sees the derived value as sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songDetailActionSize, isVeryShortScreen]
  );
  const songDetailDownloadBtnStyle = useMemo(
    () => ({
      width: songDetailActionSize,
      height: songDetailActionSize,
      borderRadius: songDetailActionSize / 2,
      padding: 0,
    }),
    // React Doctor tracks the source value behind songDetailActionSize, while ESLint correctly sees the derived value as sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songDetailActionSize, isVeryShortScreen]
  );
  const prevNextBtnSizeStyle = useMemo(
    () => ({
      width: prevNextButtonSize,
      height: prevNextButtonSize,
      borderRadius: prevNextButtonSize / 2,
    }),
    // React Doctor tracks the source values behind prevNextButtonSize, while ESLint correctly sees the derived value as sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prevNextButtonSize, isVeryShortScreen, isShortScreen]
  );

  const artCarouselGetItemLayout = useCallback(
    (_: ArtworkQueueItem[] | null | undefined, index: number) => ({
      length: artCarouselSnapInterval,
      offset: artCarouselSnapInterval * index,
      index,
    }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- artCarouselSnapInterval is derived directly from screenWidth.
    [artCarouselSnapInterval]
  );

  const handleQueueSongPress = useCallback(
    (song: Song) => {
      playSong(song, playingQueue);
    },
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- playingQueue is the livePlayingQueue alias consumed by this callback.
    [playSong, playingQueue]
  );

  const handleSkip = useCallback(
    (direction: "next" | "prev") => {
      if (direction === "next") {
        void nextSong();
      } else {
        void prevSong();
      }
    },
    [nextSong, prevSong]
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
      const recentSongs = mapFilter(recentItems
        .filter((item) => item.type === "song"), (item) => normalizePlayableSong(item.data as Partial<Song> | undefined), (song): song is Song => Boolean(song));

      const localPlaylistSongs = mapFilter((await getUserPlaylists())
        .flatMap((playlist) => playlist.songs || []), (song) => normalizePlayableSong(song), (song): song is Song => Boolean(song));

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

  const handleArtworkSongChange = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= playingQueue.length || targetIndex === activeQueueIndex) {
        return;
      }
      if (skipCooldownRef.current) return;
      skipCooldownRef.current = true;
      clearSkipCooldownTimer();
      skipCooldownTimerRef.current = setTimeout(() => {
        skipCooldownRef.current = false;
        skipCooldownTimerRef.current = null;
      }, 400);

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
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- skipCooldown/timer refs are stable; all reactive deps are listed
    [activeQueueIndex, clearSkipCooldownTimer, nextSong, playSong, playingQueue, prevSong]
  );


  useEffect(() => {
    pendingArtworkTargetIndexRef.current = activeQueueIndex;
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- pendingArtworkTargetIndexRef is a stable ref; activeQueueIndex is the only reactive dep
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
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- activeQueueIndex and artCarouselSnapInterval are normalized aliases of the reported live values.
    [activeQueueIndex, artCarouselSnapInterval, handleArtworkSongChange, playingQueue.length]
  );

  const handleArtworkScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: artScrollX } } }], {
        useNativeDriver: true,
      }),
    [artScrollX]
  );

  const handlePlayerScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
    setPlayerDismissGestureEnabled(offsetY <= 2);
  }, [setPlayerDismissGestureEnabled]);

  const finishPlayerGestureDismiss = useCallback(() => {
    if (didHandleSheetDismissRef.current) {
      return;
    }
    didHandleSheetDismissRef.current = true;
    safeGoBack();
  }, []);


  const playerPrimaryDismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isProgressSeeking)
        .activeOffsetY([-100000, PLAYER_PRIMARY_DISMISS_START_PX])
        .failOffsetX([-PLAYER_PRIMARY_DISMISS_FAIL_X_PX, PLAYER_PRIMARY_DISMISS_FAIL_X_PX])
        .onBegin(() => {
          if (playerDismissGestureEnabledShared.value <= 0) {
            playerDismissTranslateY.value = 0;
          }
        })
        .onUpdate((event) => {
          if (playerDismissGestureEnabledShared.value <= 0) {
            playerDismissTranslateY.value = 0;
            return;
          }

          const rawTranslateY = Math.max(0, event.translationY);
          const maxDrag = Math.max(120, screenHeight * PLAYER_PRIMARY_DISMISS_MAX_DRAG_RATIO);
          const resistedTranslateY =
            rawTranslateY > maxDrag
              ? maxDrag + (rawTranslateY - maxDrag) * 0.18
              : rawTranslateY;

          playerDismissTranslateY.value = resistedTranslateY;
        })
        .onEnd((event) => {
          if (playerDismissGestureEnabledShared.value <= 0) {
            playerDismissTranslateY.value = withSpring(0, PLAYER_PRIMARY_DISMISS_SPRING);
            return;
          }

          const horizontalDistance = Math.abs(event.translationX);
          const mostlyVertical = event.translationY > horizontalDistance * 1.08;
          const draggedFarEnough = event.translationY > PLAYER_PRIMARY_DISMISS_CLOSE_PX;
          const flickedDown =
            event.translationY > 28 &&
            event.velocityY > PLAYER_PRIMARY_DISMISS_FAST_VELOCITY;

          if (mostlyVertical && (draggedFarEnough || flickedDown)) {
            playerDismissGestureEnabledShared.value = 0;
            playerDismissTranslateY.value = withSpring(
              screenHeight + 40,
              {
                damping: 26,
                mass: 0.8,
                stiffness: 220,
                velocity: Math.max(0, event.velocityY || 0),
              },
              (finished) => {
                if (finished) {
                  scheduleOnRN(finishPlayerGestureDismiss);
                }
              }
            );
            return;
          }

          playerDismissTranslateY.value = withSpring(0, PLAYER_PRIMARY_DISMISS_SPRING);
        }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive deps (gesture state and screen dimensions) are listed
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- activeQueueIndex and artCarouselPageWidth are normalized aliases of the reported live values.
    [
      finishPlayerGestureDismiss,
      isProgressSeeking,
      playerDismissGestureEnabledShared,
      playerDismissTranslateY,
      screenHeight,
    ]
  );

  useEffect(() => {
    if (!artCarouselRef.current || artCarouselSnapInterval <= 0 || playingQueue.length === 0) {
      return;
    }

    const songChanged = currentSong?.id !== prevSongIdRef.current;
    prevSongIdRef.current = currentSong?.id;

    if (songChanged) {
      hasAlignedArtCarouselRef.current = false;
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
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- hasAlignedArtCarouselRef and prevSongIdRef are stable refs; all reactive deps listed
  }, [activeQueueIndex, artCarouselSnapInterval, artScrollX, playingQueue.length, currentSong?.id]);

  const renderArtworkCard = useCallback(
    ({ item, index }: { item: ArtworkQueueItem; index: number }) => {
      const song = item.song;
      const isActiveCard = index === activeQueueIndex;

      if (isActiveCard && ambientVideoLayoutActive) {
        return (
          <View
            key={item.artworkKey}
            style={{ width: artCarouselPageWidth, height: artSize }}
          />
        );
      }
      const inputRange = [
        (index - 1) * artCarouselSnapInterval,
        index * artCarouselSnapInterval,
        (index + 1) * artCarouselSnapInterval,
      ];
      const slideScale = artScrollX.interpolate({
        inputRange,
        outputRange: [0.96, 1, 0.96],
        extrapolate: "clamp",
      });
      const slideOpacity = artScrollX.interpolate({
        inputRange,
        outputRange: [0.78, 1, 0.78],
        extrapolate: "clamp",
      });
      const slideTranslateY = artScrollX.interpolate({
        inputRange,
        outputRange: [4, 0, 4],
        extrapolate: "clamp",
      });
      const cardContent = (
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
                opacity: slideOpacity,
                transform: [
                  { translateY: slideTranslateY },
                  { scale: slideScale },
                ],
              },
            ]}
          >
            <View style={styles.albumArtParallax}>
              {song.coverUrl?.trim() ? (
                <StableArtworkImage
                  uri={song.coverUrl.trim()}
                  recyclingKey={item.artworkKey}
                  priority={isActiveCard ? "high" : "normal"}
                />
              ) : (
                <View style={[styles.albumArt, styles.albumFallback]}>
                  <Ionicons name="musical-notes" size={58} color={Colors.subtext} />
                </View>
              )}
            </View>

          </Animated.View>
        </Pressable>
      );

      if (isActiveCard) {
        return (
          <Reanimated.View style={[styles.activeCardReanimatedContainer, artworkDismissAnimatedStyle]}>
            {cardContent}
          </Reanimated.View>
        );
      }

      return cardContent;
    },
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- activeQueueIndex and artCarouselPageWidth are normalized aliases of liveActiveQueueIndex and screenWidth.
    [
      activeQueueIndex,
      artCarouselPageWidth,
      artCarouselSnapInterval,
      artScrollX,
      artSize,
      handleArtworkSongChange,
      artworkDismissAnimatedStyle,
      ambientVideoLayoutActive,
    ]
  );

  const handleQueueItemPress = useCallback(
    (item: Song) => {
      handleQueueSongPress(item);
    },
    [handleQueueSongPress]
  );
  const renderQueueItem = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <QueueSongRow
        item={item}
        index={index}
        isCurrent={index === activeQueueIndex}
        isShortScreen={isShortScreen}
        isPlaying={playerIsPlaying}
        onPress={handleQueueItemPress}
      />
    ),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- activeQueueIndex and playerIsPlaying are the normalized values rendered by each row.
    [activeQueueIndex, handleQueueItemPress, isShortScreen, playerIsPlaying]
  );

  const queueKeyExtractor = useCallback((item: Song, index: number) => {
    const baseKey = String(item.id || item.audioUrl || item.title || "queue-song");
    return `${baseKey}-${index}`;
  }, []);

  // Optimize queue FlatList performance with getItemLayout
  const getQueueItemLayout = useCallback(
    (_data: ArrayLike<Song> | null | undefined, index: number) => {
      const rowH = isShortScreen ? 48 : 54;
      return {
        length: rowH,
        offset: rowH * index,
        index,
      };
    },
    [isShortScreen]
  );

  const renderPlayerScrollItem = useCallback(() => null, []);

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
              <Pressable onPress={safeGoBack} style={styles.emptyBackButton}>
                <Ionicons name="arrow-down" size={26} color={Colors.text} />
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
      <Reanimated.View
        style={[
          styles.backdropOverlay,
          backdropAnimatedStyle,
        ]}
      />
      <Reanimated.View style={[styles.playerSheetSurface, playerDismissAnimatedStyle]}>
        <Reanimated.View style={[StyleSheet.absoluteFillObject, bgOpacityAnimatedStyle]}>
          <CinematicPlayerBackground />
        </Reanimated.View>

        {!shouldRenderBackgroundVideo ? (
          <View
            pointerEvents="none"
            style={[
              styles.lowerDarkBackdrop,
              { top: Math.max(200, topInset + topBarHeight + artSize + (isShortScreen ? 92 : 116) - 160) },
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.58)", "rgba(0,0,0,0.82)"]}
              style={{ height: 160, width: "100%" }}
            />
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.82)" }} />
          </View>
        ) : null}

        <View style={[styles.playerForeground, { paddingBottom: 0 }]}>
          <Reanimated.View
            style={[
              styles.topBar,
              {
                position: "absolute",
                top: topInset,
                left: 0,
                right: 0,
                height: topBarHeight,
                paddingHorizontal: isShortScreen ? 14 : 18,
                zIndex: 10,
              },
              controlsDismissAnimatedStyle,
            ]}
          >
            <View style={styles.headerSideGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed && styles.headerIconButtonPressed,
                ]}
                onPress={safeGoBack}
                hitSlop={10}
              >
                <Ionicons name="chevron-down" size={30} color={sheetTextColor} />
              </Pressable>
            </View>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerAlbum, { fontSize: isShortScreen ? 12 : 13 }]} numberOfLines={1}>
                {screenSong.album || "Single"}
              </Text>
            </View>

            <View style={[styles.headerSideGroup, styles.headerRightGroup]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open song options"
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed && styles.headerIconButtonPressed,
                ]}
                onPress={handleSongOptionsPress}
                hitSlop={10}
              >
                <Ionicons name="ellipsis-horizontal" size={26} color={sheetTextColor} />
              </Pressable>
            </View>
          </Reanimated.View>

          <FlatList
            style={styles.playerScroll}
            data={EMPTY_PLAYER_SCROLL_SONGS}
            keyExtractor={(item) => item.id}
            renderItem={renderPlayerScrollItem}
            contentContainerStyle={[styles.playerScrollContent, { paddingBottom: listBottomPadding }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={Platform.OS === "android" ? !isProgressSeeking : true}
            keyboardShouldPersistTaps="handled"
            bounces={Platform.OS === "ios"}
            alwaysBounceVertical={Platform.OS === "ios"}
            overScrollMode="never"
            onScroll={handlePlayerScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={
              <>
                {shouldRenderBackgroundVideo ? (() => {
                  // Low-end: use a smaller WebView surface (half height) to reduce GPU compositing load.
                  // The gradient still fills to black so the smaller frame is invisible at the seam.
                  const containerH = Math.max(
                    Math.round(screenHeight * 0.90),
                    Math.round(screenWidth * (16 / 9))
                  ) * (isLowEnd ? 0.6 : 1);
                  return (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.backgroundYoutubeContainer,
                        {
                          height: containerH,
                          opacity: artScrollX.interpolate({
                            inputRange: [
                              (activeQueueIndex - 1) * artCarouselSnapInterval,
                              activeQueueIndex * artCarouselSnapInterval,
                              (activeQueueIndex + 1) * artCarouselSnapInterval,
                            ],
                            outputRange: [0, 1, 0],
                            extrapolate: "clamp",
                          }),
                        },
                      ]}
                    >
                      <BackgroundYoutubeVideo
                        key={`bg-video-${backgroundVideoId}`}
                        videoId={backgroundVideoId!}
                        isPlaying={isScreenFocused && playerIsPlaying}
                        positionMillis={positionMillis}
                        containerHeight={containerH}
                        isLowEnd={isLowEnd}
                      />
                      <LinearGradient
                        pointerEvents="none"
                        colors={[
                          "rgba(0,0,0,0)",
                          "rgba(0,0,0,0.06)",
                          "rgba(0,0,0,0.18)",
                          "rgba(0,0,0,0.45)",
                          "rgba(0,0,0,0.85)",
                          "#000000",
                        ]}
                        locations={[0, 0.25, 0.50, 0.75, 0.90, 1.0]}
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: -1,
                          height: 280,
                        }}
                      />
                    </Animated.View>
                  );
                })() : null}
                <View
                  style={[
                    styles.playerContent,
                    {
                      paddingTop: topInset + topBarHeight,
                      paddingBottom: isShortScreen ? 10 : 14,
                    },
                    ambientVideoLayoutActive && {
                      minHeight: screenHeight - topInset - (isShortScreen ? 110 : 130),
                      paddingBottom: 0,
                    },
                  ]}
                >
                  <GestureDetector gesture={playerPrimaryDismissGesture}>
                    <View
                      style={[
                        styles.playerPrimaryStack,
                        ambientVideoLayoutActive && { flex: 1 },
                      ]}
                    >
                      <View
                        style={[
                          styles.artWrap,
                          {
                            marginTop: ambientVideoLayoutActive
                              ? isShortScreen ? 4 : 8
                              : isVeryShortScreen ? 8 : isShortScreen ? 12 : 18,
                            paddingHorizontal: 0,
                          },
                        ]}
                      >
                        <AnimatedSongFlatList
                          ref={(list: any) => {
                            artCarouselRef.current = list as FlatList<ArtworkQueueItem> | null;
                          }}
                          data={artworkQueue}
                          keyExtractor={(item: ArtworkQueueItem) => item.artworkKey}
                          renderItem={renderArtworkCard}
                          horizontal
                          pagingEnabled={Platform.OS === "ios"}
                          showsHorizontalScrollIndicator={false}
                          bounces={false}
                          scrollEnabled={playingQueue.length > 1 && !isProgressSeeking}
                          decelerationRate="fast"
                          disableIntervalMomentum
                          snapToAlignment="start"
                          snapToInterval={artCarouselSnapInterval}
                          contentContainerStyle={styles.artCarouselContent}
                          style={styles.artCarousel}
                          getItemLayout={artCarouselGetItemLayout}
                          initialNumToRender={3}
                          maxToRenderPerBatch={2}
                          windowSize={3}
                          updateCellsBatchingPeriod={80}
                          removeClippedSubviews={Platform.OS === "android"}
                          onScroll={handleArtworkScroll}
                          scrollEventThrottle={16}
                          onMomentumScrollEnd={handleArtworkScrollFinished}
                        />
                      </View>

                      {ambientVideoLayoutActive ? (
                        <View style={{ flex: 1 }} />
                      ) : null}

                      <Reanimated.View style={[{ flexGrow: 0 }, controlsDismissAnimatedStyle]}>
                        <View
                          style={[
                            styles.songBlock,
                            {
                              marginTop: ambientVideoLayoutActive
                                ? isShortScreen ? 75 : 95
                                : isVeryShortScreen ? 22 : isShortScreen ? 26 : 34,
                              marginHorizontal: isShortScreen ? 14 : 20,
                            },
                          ]}
                        >
                          {/* Small album artwork on the left */}
                          <Image
                            source={{ uri: screenSong.coverUrl || "" }}
                            style={styles.songBlockArtwork}
                            contentFit="cover"
                            transition={200}
                            cachePolicy="memory-disk"
                          />
                          <View style={styles.songTextWrap}>
                            <PingPongScroll
                              text={screenSong.title}
                              style={[
                                styles.songTitle,
                                {
                                  color: sheetTextColor,
                                  fontSize: isVeryShortScreen ? 21 : isShortScreen ? 23 : 25,
                                  lineHeight: isVeryShortScreen ? 25 : isShortScreen ? 27 : 30,
                                },
                              ]}
                              velocity={12}
                              paused={!interactionReady}
                            />
                            <PingPongScroll
                              text={screenSong.artist}
                              style={[
                                styles.songArtist,
                                {
                                  color: sheetMutedTextColor,
                                  fontSize: isVeryShortScreen ? 12 : 13,
                                  lineHeight: isVeryShortScreen ? 16 : 18,
                                },
                              ]}
                              velocity={10}
                              paused={!interactionReady}
                            />
                          </View>
                          <View style={styles.songDetailActions}>
                            <SmoothControlButton
                              style={[styles.songDetailActionButton, songDetailActionBtnStyle]}
                              onPress={() => {
                                toggleLike(screenSong);
                              }}
                            >
                              <Ionicons
                                name={liked ? "heart" : "heart-outline"}
                                size={songDetailIconSize}
                                color={liked ? selectedControlIconColor : "#FFFFFF"}
                              />
                            </SmoothControlButton>

                            {!screenSongIsYouTube ? (
                              <View style={[styles.songDetailActionButton, songDetailActionBtnStyle]}>
                                <DownloadButton
                                  song={screenSong}
                                  size={songDetailIconSize}
                                  color="#FFFFFF"
                                  style={[styles.playerDownloadButton, songDetailDownloadBtnStyle]}
                                />
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </Reanimated.View>
                    </View>
                  </GestureDetector>

                  <Reanimated.View style={controlsDismissAnimatedStyle}>
                    <View style={styles.playerActionStack}>
                      <PlayerSpotifyProgress
                        key={screenSong.id}
                        screenSongId={screenSong.id}
                        songDurationSeconds={screenSong.duration}
                        isShortScreen={isShortScreen}
                        seekTo={seekTo}
                        onSeekingChange={setIsProgressSeeking}
                      />

                      <View
                        style={[
                          styles.controlsRow,
                          {
                            marginTop: isShortScreen ? 6 : 8,
                            marginHorizontal: isShortScreen ? 14 : 20,
                            marginBottom: isShortScreen ? 6 : 8,
                            gap: controlsRowGap,
                          },
                        ]}
                      >
                        <SmoothControlButton
                          style={[
                            styles.roundIconButton,
                            playerIconBtnStyle,
                          ]}
                          onPress={() => {
                            toggleShuffle();
                          }}
                        >
                          <Ionicons
                            name="shuffle"
                            size={shuffleRepeatIconSize}
                            color={sideControlIconColor}
                          />
                        </SmoothControlButton>

                        <SmoothControlButton
                          style={[styles.prevNextButton, prevNextBtnSizeStyle]}
                          onPressIn={() => {
                            handleSkip("prev");
                          }}
                        >
                          <Ionicons name="play-skip-back" size={prevNextIconSize} color={activeControlIconColor} />
                        </SmoothControlButton>

                        <PlayerPlayButton
                          buttonSize={playButtonSize}
                          iconSize={playIconSize}
                          onAccentColor="#060A0F"
                          onPress={() => {
                            togglePlay();
                          }}
                        />

                        <SmoothControlButton
                          style={[styles.prevNextButton, prevNextBtnSizeStyle]}
                          onPressIn={() => {
                            handleSkip("next");
                          }}
                        >
                          <Ionicons name="play-skip-forward" size={prevNextIconSize} color={activeControlIconColor} />
                        </SmoothControlButton>

                        <SmoothControlButton
                          style={[
                            styles.roundIconButton,
                            playerIconBtnStyle,
                          ]}
                          onPress={() => {
                            toggleRepeat();
                          }}
                        >
                          <Ionicons
                            name="repeat"
                            size={shuffleRepeatIconSize}
                            color={sideControlIconColor}
                          />
                          {playerRepeatMode === "one" && (
                            <Text style={[styles.repeatOneBadge, { color: sideControlIconColor }]}>1</Text>
                          )}
                        </SmoothControlButton>
                      </View>

                    </View>
                  </Reanimated.View>
                </View>

                <Reanimated.View style={controlsDismissAnimatedStyle}>
                  <View
                    style={[
                      styles.playingListSection,
                      ambientVideoLayoutActive && styles.playingListSectionAmbient,
                    ]}
                  >
                    <View style={[styles.playingListHeader, isShortScreen && styles.playingListHeaderCompact]}>
                      <Text style={styles.playingListTitle}>Queue</Text>
                    </View>
                    <View style={[styles.queueListViewport, queueViewportStyle]}>
                      <GHFlatList
                        data={playingQueue}
                        keyExtractor={queueKeyExtractor}
                        renderItem={renderQueueItem}
                        getItemLayout={getQueueItemLayout}
                        contentContainerStyle={styles.queueListContent}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        bounces={false}
                        overScrollMode="never"
                        removeClippedSubviews={false}
                        initialNumToRender={5}
                        maxToRenderPerBatch={5}
                        windowSize={5}
                        updateCellsBatchingPeriod={50}
                      />
                    </View>
                  </View>

                  <AboutArtistCard
                    artistDetails={artistDetails}
                    loading={artistLoading}
                    onPress={handleViewArtistProfile}
                  />

                  <RelatedSongsSection
                    songs={relatedSongs}
                    onSongPress={handlePlayRelatedSong}
                  />
                </Reanimated.View>
              </>
            }
          />

        </View>
      </Reanimated.View>
    </View>
  );
}

export function PlayerScreen() {
  const { fromQueue } = useLocalSearchParams<{ fromQueue?: string }>();

  useEffect(() => {
    if (fromQueue !== "true") {
      globalQueueSheetRef.current?.close();
    }
  }, [fromQueue]);

  return <LegacyPlayerScreenView />;
}

export default PlayerScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  playerSheetSurface: {
    flex: 1,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.54)",
  },
  backgroundYoutubeContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: Platform.OS === "android" ? 0 : -1,
  },
  activeCardReanimatedContainer: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  backgroundColorWash: {
    opacity: 0.2,
  },
  lowerDarkBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  lowerDarkFade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -132,
    height: 132,
  },

  playerForeground: {
    flex: 1,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  headerIconButtonPressed: {
    opacity: 0.58,
  },
  headerSideGroup: {
    width: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRightGroup: {
    justifyContent: "flex-end",
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
    paddingHorizontal: 0,
    marginTop: 8,
  },
  artCarousel: {
    width: "100%",
    overflow: "visible",
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
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  artFrameDefault: {
    borderRadius: 22,
  },
  youtubeArtFrame: {
    borderRadius: 22,
    backgroundColor: "#000000",
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtLayer: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(10,14,20,0.92)",
  },
  albumArtParallax: {
    width: "100%",
    height: "100%",
  },
  albumFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  youtubeVideoFrame: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  youtubeDetailPlayer: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  youtubeDetailIframe: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
  },
  youtubeDetailShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  youtubeDetailLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  adCardContainer: {
    backgroundColor: "#11141a",
    overflow: "hidden",
    position: "relative",
  },
  adCardMedia: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
  },
  adCardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(17, 20, 26, 0.82)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  adCardTextWrap: {
    flex: 1,
    gap: 2,
  },
  adCardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  adCardBadge: {
    backgroundColor: "rgba(38, 225, 154, 0.15)",
    borderWidth: 0.5,
    borderColor: "#26e19a",
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  adCardBadgeText: {
    color: "#26e19a",
    fontSize: 7.5,
    fontFamily: "Inter_700Bold",
  },
  adCardHeadline: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  adCardBody: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  adCardCtaButton: {
    color: "#10141a",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    backgroundColor: "#26e19a",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    overflow: "hidden",
    textAlign: "center",
  },
  adBadgeOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  adBadgeText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
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
  songBlockArtwork: {
    width: 48,
    height: 48,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  songTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  songDetailActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  songDetailActionButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  songTitle: {
    color: Colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
  },
  songTitleCompact: {
    fontSize: 23,
    lineHeight: 27,
  },
  songArtist: {
    marginTop: 2,
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  songArtistCompact: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  likeButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    flexShrink: 0,
    overflow: "hidden",
  },

  spotifyProgressWrap: {
    marginTop: 14,
    marginHorizontal: 20,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  playerSlider: {
    width: "100%",
    height: PLAYER_SLIDER_TOUCH_HEIGHT,
    marginVertical: 4,
    justifyContent: "center",
    position: "relative",
  },
  playerSliderDisabled: {
    opacity: 0.7,
  },
  playerSliderTrack: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    backgroundColor: PLAYER_SLIDER_MAXIMUM_TRACK_COLOR,
    overflow: "hidden",
  },
  playerSliderFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: PLAYER_SLIDER_MINIMUM_TRACK_COLOR,
  },
  playerSliderThumb: {
    position: "absolute",
    left: 0,
    top: (PLAYER_SLIDER_TOUCH_HEIGHT - PLAYER_SLIDER_THUMB_SIZE) / 2,
    width: PLAYER_SLIDER_THUMB_SIZE,
    height: PLAYER_SLIDER_THUMB_SIZE,
    borderRadius: PLAYER_SLIDER_THUMB_SIZE / 2,
    backgroundColor: PLAYER_SLIDER_THUMB_COLOR,
  },
  spotifyTimeRow: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  spotifyTimeText: {
    color: "rgba(247,250,255,0.62)",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0,
  },

  controlsRow: {
    marginTop: 12,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  controlsRowCompact: {
    marginTop: 0,
  },
  utilityControlButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  bottomUtilityRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomUtilityButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  playerDownloadButton: {
    width: 38,
    height: 38,
    padding: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playingListSection: {
    alignSelf: "stretch",
    marginTop: 0,
    marginHorizontal: 16,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "#14171E",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  playingListSectionAmbient: {
    marginHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "#191C23",
  },
  queueListContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 16,
  },
  queueListViewport: {
    flexGrow: 0,
  },

  playingListHeader: {
    height: 48,
    paddingHorizontal: 16,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playingListHeaderCompact: {
    height: 40,
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
    fontSize: 25,
    lineHeight: 30,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
  },

  playingListCount: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },

  queueRow: {
    height: 54,
    paddingHorizontal: 4,
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
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
  },
  quickButtonPressed: {
    opacity: 0.58,
  },
  prevNextButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
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
    boxShadow: "none",
    flexShrink: 0,
    overflow: "hidden",
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
  artistCardContainer: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },
  artistSectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  artistCard: {
    height: 180,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#14171E",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  artistCardContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  artistCardName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  artistCardFollowers: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  artistCardBio: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    lineHeight: 16,
  },
  artistCardButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  artistCardButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  relatedSongsContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 48,
  },
  relatedSongsList: {
    backgroundColor: "#14171E",
    borderRadius: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  relatedSongRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  relatedSongThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  relatedSongTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  relatedSongTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  relatedSongArtist: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

});
