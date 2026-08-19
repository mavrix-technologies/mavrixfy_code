import { Redirect, Tabs, usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { Easing, InteractionManager, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type DimensionValue } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { useOptionalPlayerActions, useOptionalPlayerProgress } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/lib/playbackEngine";
import { PingPongScroll } from "@/components/PingPongScroll";
import { triggerImpact } from "@/lib/haptics";
import {
  DEFAULT_ARTWORK_PALETTE,
  ensureDarkHexColor,
  getSpotifyMiniPlayerBg,
  useArtworkPalette,
  extractArtworkColors,
  getImmediateArtworkPalette,
  preloadDominantColors,
  type ArtworkPalette,
} from "@/lib/colorExtractor";
import { useLastMix, clearLastMix } from "@/lib/lastMix";
import { compactMap, mapFilter } from "@/lib/arrayUtils";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { useMiniPlayerSecondaryControl } from "@/lib/miniPlayerControls";
import type { MiniPlayerSecondaryControl } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { expandPlayer } from "@/lib/playerUIState";
import {
  subscribeToMiniPlayerBannerConfig,
  DEFAULT_MINI_PLAYER_BANNER_CONFIG,
  openMiniPlayerBannerLink,
  type MiniPlayerBannerConfig,
} from "@/lib/miniPlayerBannerConfig";

const MIX_DELETE_THRESHOLD = -72;
const MINI_SWIPE_THRESHOLD = 26;

type NativeTabsModule = typeof import("expo-router/unstable-native-tabs");

let nativeTabsModule: NativeTabsModule | null = null;

function getNativeTabsModule(): NativeTabsModule {
  if (!nativeTabsModule) {
    // Native tabs can terminate sideloaded iOS builds during startup, so only
    // resolve the module when the fallback is intentionally disabled.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeTabsModule = require("expo-router/unstable-native-tabs") as NativeTabsModule;
  }

  return nativeTabsModule;
}

function colorToRgba(input: string | undefined, alpha: number, fallback: string): string {
  if (!input) return fallback;
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const value = input.trim();
  const hex = value.replace("#", "");

  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  const rgb = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (rgb) {
    const r = Number.parseInt(rgb[1], 10);
    const g = Number.parseInt(rgb[2], 10);
    const b = Number.parseInt(rgb[3], 10);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r},${g},${b},${safeAlpha})`;
    }
  }

  return fallback;
}

function toProgressWidth(progress: number): DimensionValue {
  return `${Math.max(0, Math.min(100, (Number.isFinite(progress) ? progress : 0) * 100))}%`;
}

type MiniPlayerSecondaryControlButtonProps = {
  control: MiniPlayerSecondaryControl;
  size: number;
  radius: number;
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  shellStyle?: object | object[];
  onQueue: () => void;
  onNext: () => void;
  onPrev: () => void;
  onMore: () => void;
};

function MiniPlayerSecondaryControlButton({
  control,
  size,
  radius,
  backgroundColor,
  borderColor,
  iconColor,
  shellStyle,
  onQueue,
  onNext,
  onPrev,
  onMore,
}: MiniPlayerSecondaryControlButtonProps) {
  const buttonRef = useRef<View>(null);
  const action = (() => {
    switch (control) {
      case "next":
        return { icon: "play-skip-forward" as const, onPress: onNext, label: "Next track" };
      case "prev":
        return { icon: "play-skip-back" as const, onPress: onPrev, label: "Previous track" };
      case "more":
        return { icon: "ellipsis-horizontal" as const, onPress: onMore, label: "More options" };
      default:
        return { icon: "list" as const, onPress: onQueue, label: "Open queue" };
    }
  })();

  return (
    <View ref={buttonRef} collapsable={false}>
      <Pressable
        android_disableSound
        onPress={action.onPress}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={({ pressed }) => [
          shellStyle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor,
            borderColor,
          },
          pressed && styles.miniButtonPressed,
        ]}
      >
        <Ionicons
          name={action.icon}
          size={control === "more" ? 22 : 24}
          color={iconColor}
        />
      </Pressable>
    </View>
  );
}

const MiniPlayerProgressBar = React.memo(function MiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const playerProgress = useOptionalPlayerProgress();
  const progress = playerProgress?.progress ?? 0;
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- `progress` is the destructured reactive value from playerProgress.progress
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.playerProgressTrack}>
      <View
        style={[
          styles.playerProgressFill,
          {
            width: progressWidth,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
});

const IOSMiniPlayerProgressBar = React.memo(function IOSMiniPlayerProgressBar({
  fillColor,
}: {
  fillColor: string;
}) {
  const playerProgress = useOptionalPlayerProgress();
  const progress = playerProgress?.progress ?? 0;
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- `progress` is the destructured reactive value from playerProgress.progress
  const progressWidth = useMemo(() => toProgressWidth(progress), [progress]);

  return (
    <View pointerEvents="none" style={styles.iosMiniPlayerProgressTrack}>
      <View
        style={[
          styles.iosMiniPlayerProgressFill,
          { width: progressWidth, backgroundColor: fillColor },
        ]}
      />
    </View>
  );
});

type VisibleRoute = "index" | "search" | "library" | "liked-songs" | "import-songs";

type NavItem = {
  route: VisibleRoute;
  label: string;
  icon: string;
  iconActive: string;
};

const NAV_ITEMS: NavItem[] = [
  { route: "index", label: "Home", icon: "home-outline", iconActive: "home-sharp" },
  { route: "search", label: "Search", icon: "search-outline", iconActive: "search-sharp" },
  { route: "library", label: "Library", icon: "library-outline", iconActive: "library-sharp" },
  { route: "liked-songs", label: "Liked", icon: "heart-outline", iconActive: "heart-sharp" },
  { route: "import-songs", label: "Import", icon: "cloud-upload-outline", iconActive: "cloud-upload" },
];
const noopLongPress = () => { };
const noopPlayerAction = () => { };

function getTabHref(route: VisibleRoute) {
  return route === "index" ? "/" : `/${route}`;
}

function TabIcon({ route, name, size, color }: { route: VisibleRoute; name: string; size: number; color: string }) {
  if (route === "liked-songs") {
    const iconName = name.includes("sharp") || name.includes("heart") || name.includes("Active") || name === "heart-sharp"
      ? "favorite"
      : "favorite-border";
    return <MaterialIcons name={iconName as any} size={size} color={color} />;
  }
  if (route === "library") {
    const iconName = name.includes("sharp") || name.includes("library") || name.includes("Active") || name === "library-sharp"
      ? "music-box-multiple"
      : "music-box-multiple-outline";
    return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
  }
  if (route === "import-songs") {
    const iconName = name.includes("sharp") || name.includes("Active") || name === "cloud-upload"
      ? "cloud-upload"
      : "cloud-upload-outline";
    return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

type NavTabItemProps = {
  item: NavItem;
  isFocused: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  onPress: (route: VisibleRoute, isFocused: boolean) => void;
  onLongPress: () => void;
  navIconSize: number;
  navLabelSize: number;
  navLabelLineHeight: number;
  navItemPaddingTop: number;
  navItemPaddingBottom: number;
  activeNavColor: string;
  navInactiveColor: string;
};

function NavTabItem({
  item,
  isFocused,
  isAndroid,
  isIOS,
  onPress,
  onLongPress,
  navIconSize,
  navLabelSize,
  navLabelLineHeight,
  navItemPaddingTop,
  navItemPaddingBottom,
  activeNavColor,
  navInactiveColor,
}: NavTabItemProps) {
  const handlePress = React.useCallback(() => {
    onPress(item.route, isFocused);
  }, [isFocused, item.route, onPress]);

  const iconName = isFocused ? item.iconActive : item.icon;
  const itemColor = isFocused ? activeNavColor : navInactiveColor;

  return (
    <View style={styles.navItemAnimWrap}>
      <Pressable
        android_disableSound
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        onPress={handlePress}
        onLongPress={onLongPress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.navItem,
          isIOS && styles.navItemIOS,
          { paddingTop: navItemPaddingTop, paddingBottom: navItemPaddingBottom },
          pressed && styles.navItemPressed,
        ]}
      >
        <View style={styles.navIconWrap}>
          <TabIcon
            route={item.route}
            name={iconName}
            size={navIconSize}
            color={itemColor}
          />
        </View>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={[
            styles.navLabel,
            {
              fontSize: navLabelSize,
              lineHeight: navLabelLineHeight,
              marginTop: isAndroid ? 3 : 2,
              color: itemColor,
              fontFamily: isFocused ? "Inter_700Bold" : "Inter_500Medium",
            },
            isIOS && styles.navLabelIOS,
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    </View>
  );
}

// Memoize NavTabItem to prevent unnecessary re-renders
const MemoizedNavTabItem = React.memo(NavTabItem, (prev, next) => {
  return (
    prev.isFocused === next.isFocused &&
    prev.item.route === next.item.route &&
    prev.isAndroid === next.isAndroid &&
    prev.isIOS === next.isIOS &&
    prev.navIconSize === next.navIconSize &&
    prev.navLabelSize === next.navLabelSize &&
    prev.navLabelLineHeight === next.navLabelLineHeight &&
    prev.navItemPaddingTop === next.navItemPaddingTop &&
    prev.navItemPaddingBottom === next.navItemPaddingBottom &&
    prev.activeNavColor === next.activeNavColor &&
    prev.navInactiveColor === next.navInactiveColor
  );
});

type AppNavBarProps = {
  hidden?: boolean;
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this app
export function AppNavBar({ hidden = false }: AppNavBarProps) {
  const { push: routerPush, navigate: routerNavigate } = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<VisibleRoute>(() => {
    if (!pathname) return "index";
    if (pathname === "/" || pathname === "/index") return "index";
    if (pathname === "/search" || pathname.startsWith("/search/")) return "search";
    if (pathname === "/library" || pathname.startsWith("/library/")) return "library";
    if (pathname === "/liked-songs" || pathname.startsWith("/liked-songs/")) return "liked-songs";
    if (pathname === "/import-songs" || pathname.startsWith("/import-songs/") || pathname === "/import-songs-file" || pathname.startsWith("/import-songs-file")) return "import-songs";
    return "index";
  });

  useEffect(() => {
    if (!pathname) return;
    let nextTab: VisibleRoute = "index";
    if (pathname === "/" || pathname === "/index") {
      nextTab = "index";
    } else if (pathname === "/search" || pathname.startsWith("/search/")) {
      nextTab = "search";
    } else if (pathname === "/library" || pathname.startsWith("/library/")) {
      nextTab = "library";
    } else if (pathname === "/liked-songs" || pathname.startsWith("/liked-songs/")) {
      nextTab = "liked-songs";
    } else if (pathname === "/import-songs" || pathname.startsWith("/import-songs/") || pathname === "/import-songs-file" || pathname.startsWith("/import-songs-file")) {
      nextTab = "import-songs";
    }
    setActiveTab(nextTab);
  }, [pathname]);
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const safeInsets = useSafeAreaInsets();
  const bottomInset = Math.max(safeInsets.bottom ?? 0, 0);
  const { width } = useWindowDimensions();
  const isAndroid = Platform.OS === "android";
  const isNarrowMobile = !isWeb && width <= 380;
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const playbackState = usePlaybackPlayState();
  const playerActions = useOptionalPlayerActions();
  const textColor = playerActions?.textColor ?? "#FFFFFF";
  const togglePlay = playerActions?.togglePlay ?? noopPlayerAction;
  const nextSong = playerActions?.nextSong ?? noopPlayerAction;
  const prevSong = playerActions?.prevSong ?? noopPlayerAction;
  const setAlbumColor = playerActions?.setAlbumColor ?? noopPlayerAction;
  const setTextColor = playerActions?.setTextColor ?? noopPlayerAction;
  const miniPlayerSecondaryControl = useMiniPlayerSecondaryControl();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const hasActiveMiniPlayer = Boolean(activeSong);
  const miniPlayerRef = useRef<View>(null);
  const handleMiniPlayerLayout = useCallback(() => {
    // no-op — tour removed
  }, []);
  const [coverFailed, setCoverFailed] = useState(false);
  const artworkPalette = useArtworkPalette(activeSong?.coverUrl);
  const routePressLockRef = useRef({ href: "", time: 0 });
  const openPlayerLockRef = useRef(0);
  const [bannerConfig, setBannerConfig] = useState<MiniPlayerBannerConfig>(DEFAULT_MINI_PLAYER_BANNER_CONFIG);

  useEffect(() => {
    return subscribeToMiniPlayerBannerConfig(setBannerConfig);
  }, []);

  const handleTabPress = useCallback(
    (route: VisibleRoute, isFocused: boolean) => {
      // If home tab is pressed while already on home, scroll to top
      if (isFocused && route === "index") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy import prevents a navigation-time circular dependency.
          const { globalHomeScrollRef } = require("@/lib/homeScrollRef");
          globalHomeScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch {
          // Fallback: navigate to reset scroll position
          routerNavigate("/" as any);
        }
        return;
      }
      
      const href = getTabHref(route);
      setActiveTab(route);
      routerNavigate(href as any);
    },
    [routerNavigate]
  );

  const openPlayer = useCallback(() => {
    const now = Date.now();
    if (now - openPlayerLockRef.current < 240) return;
    openPlayerLockRef.current = now;
    expandPlayer();
  }, []);

  const openMiniPlayerQueue = useCallback(() => {
    globalQueueSheetRef.current?.expand();
  }, []);

  const openMiniPlayerSongOptions = useCallback(() => {
    if (!activeSong) return;
    routerPush(
      {
        pathname: "/song-options",
        params: {
          song: JSON.stringify(activeSong),
          showDownload: "1",
          canRemove: "0",
          optionContext: "",
          playlistId: "",
          playlistSource: "",
          playlistName: "",
        },
      },
      { dangerouslySingular: () => "song-options" }
    );
  }, [activeSong, routerPush]);

  useEffect(() => {
    const urls = mapFilter([
      queue[queueIndex - 1]?.coverUrl,
      activeSong?.coverUrl,
      queue[queueIndex + 1]?.coverUrl,
    ], (url) => url?.trim(), (url): url is string => Boolean(url));

    if (urls.length === 0) return;
    void Image.prefetch(urls, "memory-disk").catch(() => { });
    preloadDominantColors(urls);
  }, [activeSong?.coverUrl, queue, queueIndex]);

  const lastMix = useLastMix();
  const mixChipImages = useMemo(() => {
    const raw = lastMix?.images ?? "";
    if (!raw) return [] as string[];
    return compactMap(raw.split(","), (image) => image.trim());
  }, [lastMix?.images]);
  const openLastMix = useCallback(() => {
    if (!lastMix) return;
    routerPush({ pathname: "/artist-mix", params: lastMix });
  }, [lastMix, routerPush]);

  // ── Mix chip drag-to-delete ───────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const dragXRef = useRef<Animated.Value | null>(null);
  if (dragXRef.current === null) dragXRef.current = new Animated.Value(0);
  const dragX = dragXRef.current;
  const trashOpacityRef = useRef<Animated.Value | null>(null);
  if (trashOpacityRef.current === null) trashOpacityRef.current = new Animated.Value(0);
  const trashOpacity = trashOpacityRef.current;
  const chipScaleRef = useRef<Animated.Value | null>(null);
  if (chipScaleRef.current === null) chipScaleRef.current = new Animated.Value(1);
  const chipScale = chipScaleRef.current;
  const chipOpacityRef = useRef<Animated.Value | null>(null);
  if (chipOpacityRef.current === null) chipOpacityRef.current = new Animated.Value(1);
  const chipOpacity = chipOpacityRef.current;
  // Remove cover opacity animation - it's causing unnecessary re-renders
  // Cover is always visible, no need to animate opacity

  const resetMixChip = useCallback(() => {
    Animated.parallel([
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }),
      Animated.spring(chipScale, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 5 }),
      Animated.timing(chipOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(trashOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setIsDragging(false);
      setOverTrash(false);
    });
  }, [chipOpacity, chipScale, dragX, trashOpacity]);

  const startMixDrag = useCallback(() => {
    if (isDragging) return;
    dragX.setValue(0);
    chipOpacity.setValue(1);
    setOverTrash(false);
    setIsDragging(true);
    Animated.parallel([
      Animated.spring(chipScale, { toValue: 0.96, useNativeDriver: true, speed: 28, bounciness: 0 }),
      Animated.timing(trashOpacity, { toValue: 1, duration: 170, useNativeDriver: true }),
    ]).start();
  }, [chipOpacity, chipScale, dragX, isDragging, trashOpacity]);

  const deleteMixWithAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(dragX, { toValue: -150, duration: 170, useNativeDriver: true }),
      Animated.timing(chipScale, { toValue: 0.8, duration: 170, useNativeDriver: true }),
      Animated.timing(chipOpacity, { toValue: 0, duration: 170, useNativeDriver: true }),
      Animated.timing(trashOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setIsDragging(false);
      setOverTrash(false);
      dragX.setValue(0);
      chipScale.setValue(1);
      chipOpacity.setValue(1);
      clearLastMix();
    });
  }, [chipOpacity, chipScale, dragX, trashOpacity]);

  const mixDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isDragging)
        .runOnJS(true)
        .onUpdate((event) => {
          const nextDx = Math.max(-170, Math.min(12, event.translationX));
          dragX.setValue(nextDx);
          const nextOverTrash = nextDx <= MIX_DELETE_THRESHOLD;
          setOverTrash((prev) => (prev === nextOverTrash ? prev : nextOverTrash));
        })
        .onEnd((event) => {
          if (event.translationX <= MIX_DELETE_THRESHOLD) {
            deleteMixWithAnimation();
            return;
          }
          resetMixChip();
        }),
    [deleteMixWithAnimation, dragX, isDragging, resetMixChip]
  );

  // ── Mini Player Swipe Gestures (Skip next / previous) ──────────────────────
  const miniSwipeXRef = useRef<Animated.Value | null>(null);
  if (miniSwipeXRef.current === null) miniSwipeXRef.current = new Animated.Value(0);
  const miniSwipeX = miniSwipeXRef.current;

  const miniSwipeOpacity = useMemo(
    () =>
      miniSwipeX.interpolate({
        inputRange: [-60, 0, 60],
        outputRange: [0.75, 1, 0.75],
        extrapolate: "clamp",
      }),
    [miniSwipeX]
  );

  const miniSwipeScale = useMemo(
    () =>
      miniSwipeX.interpolate({
        inputRange: [-60, 0, 60],
        outputRange: [0.99, 1, 0.99],
        extrapolate: "clamp",
      }),
    [miniSwipeX]
  );

  const miniPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-4, 4])
        .failOffsetY([-12, 12])
        .runOnJS(true)
        .onUpdate((event) => {
          const rawDx = event.translationX;
          // Apply subtle elastic tension curve for a tight, high-end feel
          const clampedDx = Math.sign(rawDx) * Math.min(50, Math.abs(rawDx) * 0.8);
          miniSwipeX.setValue(clampedDx);
        })
        .onEnd((event) => {
          const dx = event.translationX;
          const vx = event.velocityX;

          // Swipe Left -> Skip to Next Track (clean continuous spring, zero jump)
          if (dx < -MINI_SWIPE_THRESHOLD || (dx < -10 && vx < -240)) {
            if (Platform.OS !== "web") {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
            }
            nextSong();
            Animated.spring(miniSwipeX, {
              toValue: 0,
              useNativeDriver: true,
              speed: 28,
              bounciness: 4,
            }).start();
            return;
          }

          // Swipe Right -> Skip to Previous Track (clean continuous spring, zero jump)
          if (dx > MINI_SWIPE_THRESHOLD || (dx > 10 && vx > 240)) {
            if (Platform.OS !== "web") {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
            }
            prevSong();
            Animated.spring(miniSwipeX, {
              toValue: 0,
              useNativeDriver: true,
              speed: 28,
              bounciness: 4,
            }).start();
            return;
          }

          // Incomplete swipe -> snap back instantly and smoothly
          Animated.spring(miniSwipeX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 30,
            bounciness: 2,
          }).start();
        }),
    [miniSwipeX, nextSong, prevSong]
  );

  const miniTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
          if (Platform.OS !== "web") {
            void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
          }
          openPlayer();
        }),
    [openPlayer]
  );

  const miniSwipeGesture = useMemo(
    () => Gesture.Exclusive(miniPanGesture, miniTapGesture),
    [miniPanGesture, miniTapGesture]
  );

  useEffect(() => {
    setCoverFailed(false);
    setAlbumColor(artworkPalette.accent);
    setTextColor(artworkPalette.text);
  }, [activeSong?.id, artworkPalette.accent, artworkPalette.text, setAlbumColor, setTextColor]);

  const resolvedBottomInset = isWeb ? 0 : Math.max(bottomInset, 0);
  const navIconSize = isNarrowMobile ? 20 : 22;
  const navLabelSize = isNarrowMobile ? 9 : 10;
  const navLabelLineHeight = 12;
  const navHorizontalPadding = isNarrowMobile ? 6 : 8;
  const navItemPaddingTop = 6;
  const navItemPaddingBottom = 4;
  const conceptText = "#dfe2eb";
  const conceptSubtext = "#bccbb9";

  // Ensure title is always readable — if extracted textColor is too dark, use white
  const safeTextColor = useMemo(() => {
    const raw = textColor || conceptText;
    const hex = raw.replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 120) return "#FFFFFF";
    }
    return raw;
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- textColor is the only reactive value; static string constants are excluded intentionally
  }, [textColor]);

  const playerTitleColor = safeTextColor;
  const playerSecondaryColor = useMemo(
    () => colorToRgba(safeTextColor, 0.72, conceptSubtext),
    [safeTextColor]
  );
  const playIconColor = "#FFFFFF";
  const playerSectionBg = useMemo(
    () => getSpotifyMiniPlayerBg(artworkPalette.accent, artworkPalette.background),
    [artworkPalette.accent, artworkPalette.background]
  );
  const activeNavColor = "#FFFFFF";
  const navInactiveColor = conceptSubtext;
  const navBaseBg = "#0E1016";
  const containerGlassBase = "#0E1016";
  // Solid neutral divider — no accent bleed on load
  const playerSectionDivider = "rgba(255,255,255,0.06)";
  const playerProgressFillColor = "rgba(255,255,255,0.90)";
  const playerTopEdgeTint = "transparent";
  const miniButtonPrimaryBg = "rgba(255, 255, 255, 0.1)";
  const miniButtonPrimaryBorder = "rgba(255, 255, 255, 0.14)";
  const miniSecondaryButtonBg = "rgba(255, 255, 255, 0.06)";
  const miniSecondaryButtonBorder = "rgba(255, 255, 255, 0.12)";
  const miniSecondaryIconColor = "rgba(255, 255, 255, 0.88)";
  const coverUrl = activeSong?.coverUrl?.trim();
  const miniPlayerHeight = 60;
  const miniCoverSlotSize = 48;
  const miniCoverSize = 48;
  const miniControlSize = 42;
  const miniControlRadius = Math.round(miniControlSize / 2);
  const trashShiftX = trashOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
    extrapolate: "clamp",
  });
  const trashShiftY = trashOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
    extrapolate: "clamp",
  });
  const trashScale = trashOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1],
    extrapolate: "clamp",
  });
  return (
    <>
      <View
        pointerEvents={hidden ? "none" : "box-none"}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
        style={[
          styles.wrapper,
          { bottom: 0 },
          hidden && styles.wrapperHidden,
        ]}
      >
        <View
          style={[
            styles.container,
            isIOS && styles.containerIOS,
            { width: "100%" },
            !hasActiveMiniPlayer && styles.containerNavOnly,
            !hasActiveMiniPlayer && isIOS && styles.containerNavOnlyIOS,
          ]}
        >
          <View pointerEvents="none" style={[styles.glassLayer, { backgroundColor: containerGlassBase }]} />

          {hasActiveMiniPlayer && activeSong ? (
            <View
              ref={miniPlayerRef}
              onLayout={handleMiniPlayerLayout}
              collapsable={false}
              style={[
                styles.playerSection,
                isIOS && styles.playerSectionIOS,
                { backgroundColor: playerSectionBg, borderBottomColor: playerSectionDivider },
              ]}
            >

              {bannerConfig.enabled && bannerConfig.text ? (
                <Pressable
                  android_disableSound
                  onPress={() => openMiniPlayerBannerLink(bannerConfig.linkUrl)}
                  style={({ pressed }) => [
                    styles.miniBannerRow,
                    bannerConfig.backgroundColor ? { backgroundColor: bannerConfig.backgroundColor } : null,
                    pressed && styles.miniBannerRowPressed,
                  ]}
                  hitSlop={{ top: 4, bottom: 4 }}
                >
                  <Ionicons
                    name={(bannerConfig.iconName as any) || "paper-plane"}
                    size={13}
                    color={bannerConfig.iconColor || "#38BDF8"}
                    style={styles.miniBannerIcon}
                  />
                  <Text
                    style={[
                      styles.miniBannerText,
                      bannerConfig.textColor ? { color: bannerConfig.textColor } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {bannerConfig.text}
                  </Text>
                  <Ionicons name="chevron-forward" size={11} color="rgba(255,255,255,0.4)" style={styles.miniBannerChevron} />
                </Pressable>
              ) : (
                <>
                  <View pointerEvents="none" style={[styles.playerTopEdge, { backgroundColor: playerTopEdgeTint }]} />
                  <View
                    pointerEvents="none"
                    style={[styles.playerCornerAccentLeft, { borderColor: playerTopEdgeTint }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[styles.playerCornerAccentRight, { borderColor: playerTopEdgeTint }]}
                  />
                </>
              )}

              <View style={[styles.playerRow, { height: miniPlayerHeight }]}>
                <GestureDetector gesture={miniSwipeGesture}>
                  <Animated.View
                    style={[
                      styles.playerLeft,
                      {
                        opacity: miniSwipeOpacity,
                        transform: [
                          { translateX: miniSwipeX },
                          { scale: miniSwipeScale },
                        ],
                      },
                    ]}
                  >
                    <View style={[styles.coverWrap, { width: miniCoverSlotSize }]}>
                      {coverUrl && !coverFailed ? (
                        <Image
                          source={{ uri: coverUrl }}
                          style={[
                            styles.cover,
                            { width: miniCoverSize, height: miniCoverSize },
                          ]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          priority="high"
                          decodeFormat="argb"
                          transition={100}
                          onError={() => setCoverFailed(true)}
                        />
                      ) : (
                        <View
                          style={[
                            styles.cover,
                            styles.coverFallback,
                            { width: miniCoverSize, height: miniCoverSize },
                          ]}
                        >
                          <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.72)" />
                        </View>
                      )}
                    </View>
                    <View style={[styles.songInfo, isDragging && styles.songInfoDuringMixDrag]}>
                      <PingPongScroll
                        text={activeSong.title}
                        style={[styles.songTitle, { color: playerTitleColor }]}
                        velocity={15}
                      />
                      <PingPongScroll
                        text={activeSong.artist}
                        style={[styles.songArtist, { color: playerSecondaryColor }]}
                        velocity={12}
                      />
                    </View>
                  </Animated.View>
                </GestureDetector>

                <View style={styles.playerControls}>
                  {lastMix ? (
                    <GestureDetector gesture={mixDragGesture}>
                      <Animated.View
                        style={[
                          styles.mixChipWrap,
                          {
                            opacity: chipOpacity,
                            transform: [{ translateX: dragX }, { scale: chipScale }],
                          },
                        ]}
                      >
                        <Pressable
                          android_disableSound
                          onPress={openLastMix}
                          onLongPress={startMixDrag}
                          delayLongPress={280}
                          hitSlop={8}
                          style={[
                            styles.mixChip,
                            isDragging && styles.mixChipDragging,
                            overTrash && styles.mixChipDeleteReady,
                          ]}
                        >
                          <View style={styles.mixChipAvatars}>
                            {mixChipImages.slice(0, 3).map((image, index) => (
                              <Image
                                key={image}
                                source={{ uri: image }}
                                style={[
                                  styles.mixChipAvatar,
                                  index > 0 ? { marginLeft: -8 } : null,
                                ]}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                            ))}
                            {mixChipImages.length === 0 ? (
                              <View style={styles.mixChipAvatar}>
                                <Ionicons name="people" size={12} color="rgba(255,255,255,0.82)" />
                              </View>
                            ) : null}
                          </View>
                          <Ionicons
                            name={overTrash ? "trash" : "albums"}
                            size={16}
                            color={overTrash ? "#ff6b6b" : "rgba(255,255,255,0.9)"}
                          />
                        </Pressable>
                      </Animated.View>
                    </GestureDetector>
                  ) : null}
                  <Pressable
                    android_disableSound
                    onPress={() => {
                      togglePlay();
                    }}
                    hitSlop={14}
                    style={({ pressed }) => [
                      styles.iconButton,
                      {
                        width: miniControlSize,
                        height: miniControlSize,
                        borderRadius: miniControlRadius,
                      },
                      styles.iconButtonPrimary,
                      {
                        backgroundColor: miniButtonPrimaryBg,
                        borderColor: miniButtonPrimaryBorder,
                      },
                      pressed && styles.miniButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name={playbackState.isPlaying ? "pause" : "play"}
                      size={25}
                      color={playIconColor}
                      style={!playbackState.isPlaying ? { marginLeft: 1 } : undefined}
                    />
                  </Pressable>
                  <MiniPlayerSecondaryControlButton
                    control={miniPlayerSecondaryControl}
                    size={miniControlSize}
                    radius={miniControlRadius}
                    backgroundColor={miniSecondaryButtonBg}
                    borderColor={miniSecondaryButtonBorder}
                    iconColor={miniSecondaryIconColor}
                    shellStyle={styles.iconButton}
                    onQueue={openMiniPlayerQueue}
                    onNext={nextSong}
                    onPrev={prevSong}
                    onMore={openMiniPlayerSongOptions}
                  />
                </View>
              </View>

              <MiniPlayerProgressBar fillColor={playerProgressFillColor} />

              <Animated.View
                pointerEvents={isDragging ? "auto" : "none"}
                style={[
                  styles.mixTrashDock,
                  overTrash && styles.mixTrashDockActive,
                  {
                    opacity: trashOpacity,
                    transform: [
                      { translateX: trashShiftX },
                      { translateY: trashShiftY },
                      { scale: trashScale },
                    ],
                  },
                ]}
              >
                <Ionicons
                  name={overTrash ? "trash" : "trash-outline"}
                  size={17}
                  color={overTrash ? "#ff6b6b" : "rgba(255,255,255,0.84)"}
                />
              </Animated.View>
            </View>
          ) : null}

          <View
            style={[
              styles.navContent,
              isIOS && styles.navContentIOS,
              {
                backgroundColor: navBaseBg,
                paddingHorizontal: navHorizontalPadding,
                paddingTop: 4,
                paddingBottom: isAndroid ? Math.max(resolvedBottomInset, 10) : Math.min(resolvedBottomInset, 10),
                borderTopWidth: hasActiveMiniPlayer ? StyleSheet.hairlineWidth : 0,
                borderTopColor: "rgba(255, 255, 255, 0.08)",
              },
              !hasActiveMiniPlayer && styles.navContentNavOnly,
            ]}
          >

            {NAV_ITEMS.map((item) => {
              const isFocused = item.route === activeTab;

              return (
                <MemoizedNavTabItem
                  key={item.route}
                  item={item}
                  isFocused={isFocused}
                  isAndroid={isAndroid}
                  isIOS={isIOS}
                  navIconSize={navIconSize}
                  navLabelSize={navLabelSize}
                  navLabelLineHeight={navLabelLineHeight}
                  navItemPaddingTop={navItemPaddingTop}
                  navItemPaddingBottom={navItemPaddingBottom}
                  activeNavColor={activeNavColor}
                  navInactiveColor={navInactiveColor}
                  onPress={handleTabPress}
                  onLongPress={noopLongPress}
                />
              );
            })}
          </View>
        </View>
      </View>

    </>
  );
}

function IOSNativeTabLayout() {
  const { Icon, Label, NativeTabs } = getNativeTabsModule();

  return (
    <NativeTabs
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      tintColor={Colors.primary}
      iconColor={{ default: "rgba(235,235,245,0.6)", selected: Colors.primary }}
      labelStyle={{
        default: {
          color: "rgba(235,235,245,0.6)",
          fontSize: 10,
          fontWeight: "500",
        },
        selected: {
          color: Colors.primary,
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search" />

      <NativeTabs.Trigger name="library">
        <Icon sf={{ default: "square.stack", selected: "square.stack.fill" }} />
        <Label>Library</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="liked-songs">
        <Icon sf={{ default: "heart", selected: "heart.fill" }} />
        <Label>Liked</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function IOSMiniPlayerOverlay() {
  return useIOSMiniPlayerOverlayView();
}

function useIOSMiniPlayerOverlayView() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  
  // Remove unnecessary cover opacity animation
  // Cover visibility is handled by CSS, no need for extra animations

  const { push: overlayRouterPush } = useRouter();
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const playbackState = usePlaybackPlayState();
  const playerActions = useOptionalPlayerActions();
  const togglePlay = playerActions?.togglePlay ?? noopPlayerAction;
  const nextSong = playerActions?.nextSong ?? noopPlayerAction;
  const prevSong = playerActions?.prevSong ?? noopPlayerAction;
  const textColor = playerActions?.textColor ?? "#FFFFFF";
  const setAlbumColor = playerActions?.setAlbumColor ?? noopPlayerAction;
  const setTextColor = playerActions?.setTextColor ?? noopPlayerAction;
  const miniPlayerSecondaryControl = useMiniPlayerSecondaryControl();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const [coverFailed, setCoverFailed] = useState(false);
  const openPlayerLockRef = useRef(0);

  const openPlayer = useCallback(() => {
    const now = Date.now();
    if (now - openPlayerLockRef.current < 240) return;
    openPlayerLockRef.current = now;
    expandPlayer();
  }, []);

  const openMiniPlayerQueue = useCallback(() => {
    globalQueueSheetRef.current?.expand();
  }, []);

  const openMiniPlayerSongOptions = useCallback(() => {
    if (!activeSong) return;
    overlayRouterPush(
      {
        pathname: "/song-options",
        params: {
          song: JSON.stringify(activeSong),
          showDownload: "1",
          canRemove: "0",
          optionContext: "",
          playlistId: "",
          playlistSource: "",
          playlistName: "",
        },
      },
      { dangerouslySingular: () => "song-options" }
    );
  }, [activeSong, overlayRouterPush]);

  useEffect(() => {
    const urls = mapFilter([
      queue[queueIndex - 1]?.coverUrl,
      activeSong?.coverUrl,
      queue[queueIndex + 1]?.coverUrl,
    ], (url) => url?.trim(), (url): url is string => Boolean(url));

    if (urls.length === 0) return;
    void Image.prefetch(urls, "memory-disk").catch(() => { });
    preloadDominantColors(urls);
  }, [activeSong?.coverUrl, queue, queueIndex]);

  const lastMix = useLastMix();
  const mixBarOneRef = useRef<Animated.Value | null>(null);
  if (mixBarOneRef.current === null) mixBarOneRef.current = new Animated.Value(0.32);
  const mixBarOne = mixBarOneRef.current;
  const mixBarTwoRef = useRef<Animated.Value | null>(null);
  if (mixBarTwoRef.current === null) mixBarTwoRef.current = new Animated.Value(0.58);
  const mixBarTwo = mixBarTwoRef.current;
  const mixBarThreeRef = useRef<Animated.Value | null>(null);
  if (mixBarThreeRef.current === null) mixBarThreeRef.current = new Animated.Value(0.44);
  const mixBarThree = mixBarThreeRef.current;
  const mixImage = useMemo(() => {
    const first = compactMap((lastMix?.images ?? "")
      .split(","), (value) => value.trim())[0];
    return first ?? "";
  }, [lastMix?.images]);
  const mixImages = useMemo(() => {
    const all = compactMap((lastMix?.images ?? "")
      .split(","), (value) => value.trim());
    return all;
  }, [lastMix?.images]);
  const mixSongIds = useMemo(() => {
    const raw = lastMix?.songIds ?? "";
    if (!raw) return [] as string[];
    return compactMap(raw.split(","), (id) => id.trim());
  }, [lastMix?.songIds]);
  const activeSongId = activeSong?.id ?? "";
  const isPlayingFromLastMix = useMemo(() => {
    if (!playbackState.isPlaying || !activeSongId || mixSongIds.length === 0) return false;
    if (!mixSongIds.includes(activeSongId)) return false;
    if (queue.length !== mixSongIds.length) return false;
    const mixSet = new Set(mixSongIds);
    return queue.every((song) => mixSet.has(song.id));
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive values (activeSongId, playbackState.isPlaying, mixSongIds, queue) are listed
  }, [activeSongId, playbackState.isPlaying, mixSongIds, queue]);
  const iosArtworkPalette = useArtworkPalette(activeSong?.coverUrl);

  useEffect(() => {
    setCoverFailed(false);
    setAlbumColor(iosArtworkPalette.accent);
    setTextColor(iosArtworkPalette.text);
  }, [activeSong?.id, iosArtworkPalette.accent, iosArtworkPalette.text, setAlbumColor, setTextColor]);

  useEffect(() => {
    const resetBars = () => {
      Animated.parallel([
        Animated.timing(mixBarOne, { toValue: 0.32, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarTwo, { toValue: 0.58, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarThree, { toValue: 0.44, duration: 180, useNativeDriver: true, isInteraction: false }),
      ]).start();
    };

    if (!lastMix || !isPlayingFromLastMix) {
      resetBars();
      return;
    }

    const loopOne = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarOne, { toValue: 0.96, duration: 230, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarOne, { toValue: 0.24, duration: 280, useNativeDriver: true, isInteraction: false }),
      ])
    );
    const loopTwo = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarTwo, { toValue: 0.84, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarTwo, { toValue: 0.3, duration: 240, useNativeDriver: true, isInteraction: false }),
      ])
    );
    const loopThree = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarThree, { toValue: 0.9, duration: 260, useNativeDriver: true, isInteraction: false }),
        Animated.timing(mixBarThree, { toValue: 0.22, duration: 210, useNativeDriver: true, isInteraction: false }),
      ])
    );

    loopOne.start();
    loopTwo.start();
    loopThree.start();

    return () => {
      loopOne.stop();
      loopTwo.stop();
      loopThree.stop();
    };
  }, [isPlayingFromLastMix, lastMix, mixBarOne, mixBarThree, mixBarTwo]);

  const shellBgColor = useMemo(
    () => getSpotifyMiniPlayerBg(iosArtworkPalette.accent, iosArtworkPalette.background),
    [iosArtworkPalette.accent, iosArtworkPalette.background]
  );

  if (!activeSong) {
    return null;
  }

  const resolvedTextColor = (() => {
    const raw = textColor || "#F5F5F7";
    const hex = raw.replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 100) return "#F5F5F7";
    }
    return raw;
  })();
  const secondaryColor = colorToRgba(resolvedTextColor, 0.7, "rgba(235,235,245,0.7)");
  const progressFillColor = "rgba(255,255,255,0.90)";
  const tabBarVisualHeight = 49;
  const tabBarGap = 6;
  const bottomOffset = Math.max(insets.bottom + tabBarVisualHeight + tabBarGap, 80);

  // Solid neutral border — no accent bleed on load
  const shellBorderColor = "rgba(255,255,255,0.08)";

  return (
    <View pointerEvents="box-none" style={[styles.iosMiniPlayerRoot, { bottom: bottomOffset }]}>
      <View style={[styles.iosMiniPlayerShell, { backgroundColor: shellBgColor, borderColor: shellBorderColor }]}>
        <View style={styles.iosMiniPlayerRow}>
          <Pressable style={styles.iosMiniPlayerMain} onPress={openPlayer} android_disableSound>
            <View style={styles.iosMiniPlayerArtworkShell}>
              {activeSong.coverUrl && !coverFailed ? (
                <Image
                  source={{ uri: activeSong.coverUrl }}
                  style={styles.iosMiniPlayerCover}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority="high"
                  transition={100}
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <View
                  style={[
                    styles.iosMiniPlayerCover,
                    styles.iosMiniPlayerCoverFallback,
                  ]}
                >
                  <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.72)" />
                </View>
              )}
            </View>

            <View style={styles.iosMiniPlayerText}>
              <PingPongScroll
                text={activeSong.title}
                style={[styles.iosMiniPlayerTitle, { color: "#FFFFFF" }]}
                velocity={14}
              />
              <PingPongScroll
                text={activeSong.artist}
                style={[styles.iosMiniPlayerArtist, { color: "rgba(255, 255, 255, 0.70)" }]}
                velocity={11}
              />
            </View>
          </Pressable>

          {lastMix ? (
            <Pressable
              android_disableSound
              onPress={() => {
                overlayRouterPush({ pathname: "/artist-mix", params: lastMix });
              }}
              hitSlop={8}
              style={styles.iosMiniPlayerInlineMixBtn}
            >
              <View style={styles.iosMiniPlayerMixCard}>
                {mixImages.length > 1 ? (
                  <View style={styles.iosMiniPlayerMixGrid}>
                    {mixImages.slice(0, 4).map((img) => (
                      <View key={img} style={styles.iosMiniPlayerMixGridCell}>
                        {img ? (
                          <Image
                            source={{ uri: img }}
                            style={styles.iosMiniPlayerMixGridImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={[styles.iosMiniPlayerMixGridImage, styles.iosMiniPlayerMixGridFallback]}>
                            <Ionicons name="person" size={8} color="rgba(255,255,255,0.88)" />
                          </View>
                        )}
                      </View>
                    ))}
                    {mixImages.length > 4 && (
                      <View style={[styles.iosMiniPlayerMixGridCell, styles.iosMiniPlayerMixGridMore]}>
                        <Text style={styles.iosMiniPlayerMixGridMoreText}>+{mixImages.length - 4}</Text>
                      </View>
                    )}
                  </View>
                ) : mixImage ? (
                  <Image
                    source={{ uri: mixImage }}
                    style={[styles.iosMiniPlayerMixFullImage, styles.iosMiniPlayerMixFullImageMuted]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={[
                      styles.iosMiniPlayerMixFullImage,
                      styles.iosMiniPlayerMixHeroFallback,
                      styles.iosMiniPlayerMixFullImageMuted,
                    ]}
                  >
                    <Ionicons name="person" size={14} color="rgba(255,255,255,0.88)" />
                  </View>
                )}
                <View style={styles.iosMiniPlayerMixEqOverlay}>
                  <Animated.View
                    style={[
                      styles.iosMiniPlayerMixEqBar,
                      { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarOne }] },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.iosMiniPlayerMixEqBar,
                      { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarTwo }] },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.iosMiniPlayerMixEqBar,
                      { opacity: isPlayingFromLastMix ? 0.95 : 0.42, transform: [{ scaleY: mixBarThree }] },
                    ]}
                  />
                </View>
              </View>
            </Pressable>
          ) : null}

          <View style={styles.iosMiniPlayerControls}>
            <Pressable
              android_disableSound
              onPress={() => {
                togglePlay();
              }}
              hitSlop={14}
              style={({ pressed }) => [
                styles.iosMiniPlayerButton,
                pressed && styles.miniButtonPressed,
              ]}
            >
              <Ionicons
                name={playbackState.isPlaying ? "pause" : "play"}
                size={26}
                color="#FFFFFF"
                style={!playbackState.isPlaying ? { marginLeft: 2 } : undefined}
              />
            </Pressable>
            <MiniPlayerSecondaryControlButton
              control={miniPlayerSecondaryControl}
              size={40}
              radius={20}
              backgroundColor="transparent"
              borderColor="transparent"
              iconColor="rgba(255,255,255,0.80)"
              shellStyle={styles.iosMiniPlayerButton}
              onQueue={openMiniPlayerQueue}
              onNext={nextSong}
              onPrev={prevSong}
              onMore={openMiniPlayerSongOptions}
            />
          </View>
        </View>

        <IOSMiniPlayerProgressBar fillColor={progressFillColor} />
      </View>
    </View>
  );
}

function AuthRouteFallback() {
  return <View style={styles.authRouteFallback} />;
}

export default function TabLayout() {
  const pathname = usePathname();
  const { loading, isAuthenticated, isGuest } = useAuth();

  const shouldHideTabBar = pathname === "/import-songs-file" || pathname?.startsWith("/import-songs-file");

  if (loading) {
    return <AuthRouteFallback />;
  }

  if (!isAuthenticated && !isGuest) {
    return <Redirect href="/login" />;
  }

  // NativeTabs only work correctly when distributed via App Store or TestFlight.
  // Sideloaded / unsigned IPAs run with __DEV__ = false but lack the required
  // entitlements, causing an immediate crash. Disable NativeTabs entirely until
  // the app is properly signed and distributed through Apple channels.
  const isProductionBuild = false; // TODO: re-enable when distributing via App Store

  if (isProductionBuild) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <IOSNativeTabLayout />
        {!shouldHideTabBar ? <IOSMiniPlayerOverlay /> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          lazy: true,
          animation: "none",
          sceneStyle: { backgroundColor: Colors.background },
        }}
        tabBar={() => null}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="liked-songs" options={{ title: "Liked" }} />
        <Tabs.Screen name="import-songs" options={{ title: "Import" }} />
      </Tabs>
      <AppNavBar hidden={shouldHideTabBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  authRouteFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  iosMiniPlayerRoot: {
    position: "absolute",
    left: 19,
    right: 19,
    zIndex: 30,
  },
  iosMiniPlayerDockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iosMiniPlayerShell: {
    flex: 1,
    height: 50,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#111317",
    boxShadow: "none",
  },
  iosMiniPlayerBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  iosMiniPlayerTopHairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  iosMiniPlayerRow: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
    paddingVertical: 0,
  },
  iosMiniPlayerMain: {
    flex: 1,
    height: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  iosMiniPlayerArtworkShell: {
    width: 50,
    height: "100%",
    padding: 5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  iosMiniPlayerCover: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  iosMiniPlayerCoverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  iosMiniPlayerText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 9,
    marginRight: 6,
    justifyContent: "center",
  },
  iosMiniPlayerTitle: {
    fontSize: 13.5,
    lineHeight: 17,
    fontFamily: "Inter_700Bold",
  },
  iosMiniPlayerArtist: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_500Medium",
  },
  iosMiniPlayerMixSimpleContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iosMiniPlayerMixCard: {
    width: "100%",
    height: "100%",
    borderRadius: 28,
    overflow: "hidden",
  },
  iosMiniPlayerMixFullImage: {
    width: "100%",
    height: "100%",
  },
  iosMiniPlayerMixFullImageMuted: {
    opacity: 0.74,
  },
  iosMiniPlayerMixHeroFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  iosMiniPlayerMixEqOverlay: {
    position: "absolute",
    right: 5,
    bottom: 5,
    height: 15,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    borderRadius: 9,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: "rgba(8,8,10,0.42)",
  },
  iosMiniPlayerMixEqBar: {
    width: 2.4,
    height: 10,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    transform: [{ scaleY: 0.4 }],
  },
  iosMiniPlayerMixGrid: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#1a1a1a",
  },
  iosMiniPlayerMixGridCell: {
    width: "50%",
    height: "50%",
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iosMiniPlayerMixGridImage: {
    width: "100%",
    height: "100%",
    opacity: 0.8,
  },
  iosMiniPlayerMixGridFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  iosMiniPlayerMixGridMore: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosMiniPlayerMixGridMoreText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  iosMiniPlayerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 0,
    flexShrink: 0,
  },
  iosMiniPlayerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iosMiniPlayerPrimaryButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  iosMiniPlayerSecondaryButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  miniButtonPressed: {
    opacity: 0.9,
  },
  iosMiniPlayerInlineMixBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    marginRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "transparent",
  },
  iosMiniPlayerSideActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    marginLeft: 0,
  },
  iosMiniPlayerSideActionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  iosMiniPlayerSideActionBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  iosMiniPlayerProgressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1.5,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  iosMiniPlayerProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: "center",
  },
  wrapperHidden: {
    opacity: 0,
  },
  container: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  containerIOS: {},
  containerNavOnly: {},
  containerNavOnlyIOS: {},
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
  },

  playerSection: {
    backgroundColor: "#0A0A0C",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(61, 74, 61, 0.4)",
    overflow: "hidden",
  },
  playerSectionIOS: {
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  miniBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#162838",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  miniBannerRowPressed: {
    opacity: 0.75,
  },
  miniBannerIcon: {
    marginRight: 7,
  },
  miniBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
    color: "#E2E8F0",
    letterSpacing: -0.2,
  },
  miniBannerChevron: {
    marginLeft: 4,
  },

  playerTopEdge: {
    position: "absolute",
    top: 0,
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: "rgba(38,225,154,0.28)",
    opacity: 0.32,
  },
  playerCornerAccentLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 10,
    height: 7,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopLeftRadius: 10,
    opacity: 0.36,
  },
  playerCornerAccentRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 10,
    height: 7,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderTopRightRadius: 10,
    opacity: 0.36,
  },
  playerProgressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "rgba(223, 226, 235, 0.18)",
  },
  playerProgressFill: {
    height: 2,
    backgroundColor: "#FFFFFF",
  },

  // Mix chip — compact black pill, right of song title
  mixChipWrap: {
    flexShrink: 0,
  },
  mixChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexShrink: 0,
    marginRight: 6,
    overflow: "hidden",
    paddingHorizontal: 8,
  },
  mixChipDragging: {
    borderColor: "rgba(255,255,255,0.42)",
  },
  mixChipDeleteReady: {
    borderColor: "rgba(255, 92, 92, 0.85)",
    backgroundColor: "rgba(35, 2, 2, 0.94)",
  },
  mixChipAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  mixChipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#000",
    backgroundColor: "#1a1a1a",
  },
  mixTrashDock: {
    position: "absolute",
    left: 60,
    top: "50%",
    width: 32,
    height: 32,
    marginTop: -16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(15,15,15,0.96)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
  },
  mixTrashDockActive: {
    borderColor: "rgba(255, 92, 92, 0.9)",
    backgroundColor: "rgba(82, 16, 16, 0.95)",
  },
  playerRow: {
    height: 60,
    paddingLeft: 10,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  coverWrap: {
    width: 48,
    height: 48,
    overflow: "hidden",
    borderRightWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  coverFallback: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 8,
    justifyContent: "center",
  },
  songInfoDuringMixDrag: {
    opacity: 0.38,
  },
  songTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 17,
  },
  songArtist: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 14,
    marginTop: 1,
  },
  playerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
    marginRight: 2,
    flexShrink: 0,
  },
  iconButton: {
    minWidth: 42,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "rgba(38, 42, 49, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(61, 74, 61, 0.38)",
  },
  iconButtonPrimary: {
    backgroundColor: "#26e19a",
    borderColor: "rgba(38, 225, 154, 0.72)",
  },
  navContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    backgroundColor: "transparent",
    overflow: "hidden",
    position: "relative",
    borderTopWidth: 0,
    borderTopColor: "rgba(255, 255, 255, 0.09)",
  },
  navContentIOS: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  navContentNavOnly: {},

  navItemAnimWrap: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  navIconWrap: {
    width: 44,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  navIconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    zIndex: 1,
  },
  navItemPressed: {
    opacity: 0.9,
  },
  navItemIOS: {
    borderRadius: 18,
    marginHorizontal: 2,
  },
  navItemActive: {
    backgroundColor: "transparent",
  },
  navItemIOSActive: {
    backgroundColor: "transparent",
  },
  navLabel: {
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    color: "rgba(255, 255, 255, 0.62)",
    letterSpacing: 0.1,
  },
  navLabelIOS: {
    fontFamily: "Inter_600SemiBold",
    color: "rgba(235,235,245,0.6)",
    letterSpacing: -0.1,
  },
  navLabelActive: {
    color: Colors.text,
  },
});
