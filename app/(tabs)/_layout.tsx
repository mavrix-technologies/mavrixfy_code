import { Tabs, router, usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, InteractionManager, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type DimensionValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs"; // kept for type compat
import Colors from "@/constants/colors";
import { usePlayerLite } from "@/contexts/PlayerContext";
import { PingPongScroll } from "@/components/PingPongScroll";
import { createSpotifyColorTheme, extractDominantColor } from "@/lib/colorExtractor";
import { triggerImpact } from "@/lib/haptics";
import { useLastMix, clearLastMix } from "@/lib/lastMix";

const TAB_BOTTOM = 0;
const MIX_DELETE_THRESHOLD = -72;

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

type VisibleRoute = "index" | "search" | "library" | "liked-songs";

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
];

type NavTabItemProps = {
  item: NavItem;
  isFocused: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  onPress: () => void;
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
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = React.useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.965,
      speed: 35,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = React.useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      speed: 25,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={[styles.navItemAnimWrap, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        onLongPress={onLongPress}
        hitSlop={6}
        style={[
          styles.navItem,
          isIOS && styles.navItemIOS,
          { paddingTop: navItemPaddingTop, paddingBottom: navItemPaddingBottom },
          isFocused && styles.navItemActive,
          isFocused && isIOS && styles.navItemIOSActive,
        ]}
      >
        <View style={styles.navIconWrap}>
          <Ionicons
            name={(isFocused ? item.iconActive : item.icon) as any}
            size={navIconSize}
            color={isFocused ? activeNavColor : navInactiveColor}
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
              marginTop: isAndroid ? 2 : 2,
              textAlignVertical: "center",
            },
            isIOS && styles.navLabelIOS,
            isFocused && styles.navLabelActive,
            isFocused && { color: activeNavColor },
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// Memoize NavTabItem to prevent unnecessary re-renders
const MemoizedNavTabItem = React.memo(NavTabItem, (prev, next) => {
  return (
    prev.isFocused === next.isFocused &&
    prev.item.route === next.item.route &&
    prev.navIconSize === next.navIconSize &&
    prev.activeNavColor === next.activeNavColor &&
    prev.navInactiveColor === next.navInactiveColor
  );
});

export function AppNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const safeInsets = useSafeAreaInsets();
  const bottomInset = Math.max(safeInsets.bottom ?? 0, 0);
  const { width } = useWindowDimensions();
  const isAndroid = Platform.OS === "android";
  const isNarrowMobile = !isWeb && width <= 380;
  const {
    currentSong,
    queue,
    queueIndex,
    isPlaying,
    progress,
    textColor,
    togglePlay,
    albumColor,
    setAlbumColor,
    setTextColor,
  } = usePlayerLite();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const activeSongId = activeSong?.id ?? "";
  const hasActiveMiniPlayer = Boolean(activeSong);
  const [coverFailed, setCoverFailed] = useState(false);
  const lastMix = useLastMix();
  const lastMixSongIds = useMemo(() => {
    const raw = lastMix?.songIds ?? "";
    if (!raw) return [] as string[];
    return raw.split(",").map((id) => id.trim()).filter(Boolean);
  }, [lastMix?.songIds]);
  const mixChipImages = useMemo(() => {
    const raw = lastMix?.images ?? "";
    if (!raw) return [] as string[];
    return raw.split(",").map((image) => image.trim()).filter(Boolean);
  }, [lastMix?.images]);
  const isPlayingFromLastMix = useMemo(() => {
    if (!isPlaying || !activeSongId || lastMixSongIds.length === 0) return false;
    if (!lastMixSongIds.includes(activeSongId)) return false;
    if (queue.length !== lastMixSongIds.length) return false;
    const mixSet = new Set(lastMixSongIds);
    return queue.every((song) => mixSet.has(song.id));
  }, [activeSongId, isPlaying, lastMixSongIds, queue]);
  const openLastMix = useCallback(() => {
    if (!lastMix) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/artist-mix", params: lastMix });
  }, [lastMix, router]);

  // ── Mix chip drag-to-delete ───────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const dragX = useRef(new Animated.Value(0)).current;
  const trashOpacity = useRef(new Animated.Value(0)).current;
  const chipScale = useRef(new Animated.Value(1)).current;
  const chipOpacity = useRef(new Animated.Value(1)).current;

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
    void triggerImpact(Haptics.ImpactFeedbackStyle.Heavy);
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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => isDragging && Math.abs(g.dx) > 4,
        onPanResponderMove: (_, g) => {
          const nextDx = Math.max(-170, Math.min(12, g.dx));
          dragX.setValue(nextDx);
          const nextOverTrash = nextDx <= MIX_DELETE_THRESHOLD;
          setOverTrash((prev) => (prev === nextOverTrash ? prev : nextOverTrash));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx <= MIX_DELETE_THRESHOLD) {
            deleteMixWithAnimation();
            return;
          }
          resetMixChip();
        },
        onPanResponderTerminate: () => {
          resetMixChip();
        },
      }),
    [deleteMixWithAnimation, dragX, isDragging, resetMixChip]
  );

  useEffect(() => {
    if (!activeSong?.coverUrl) return;
    extractDominantColor(activeSong.coverUrl)
      .then((colors) => {
        setAlbumColor(colors.primary);
        setTextColor(colors.text);
      })
      .catch(() => {});
  }, [activeSong?.id, activeSong?.coverUrl, setAlbumColor, setTextColor]);

  useEffect(() => {
    setCoverFailed(false);
  }, [activeSong?.id, activeSong?.coverUrl]);

  const resolvedBottomInset = isWeb ? 0 : Math.max(bottomInset, 0);
  const floatingBottom = 0;
  const containerBottomPadding = 0;
  const containerWidth: DimensionValue = isIOS && !isWeb
    ? Math.min(width - 14, 560)
    : "96%";
  const navIconSize = isIOS
    ? (isNarrowMobile ? 20 : 22)
    : (isNarrowMobile ? 19 : 21);
  const navLabelSize = isIOS ? 10 : (isNarrowMobile ? 9 : 10);
  const navLabelLineHeight = isIOS ? 12 : (isNarrowMobile ? 12 : 13);
  const navTopPadding = 0;
  const navBottomSafePadding = 0;
  const navBaseHeight = 54;
  const navHeight = navBaseHeight;
  const navHorizontalPadding = isIOS ? 12 : (isNarrowMobile ? 8 : 10);
  const navItemPaddingTop = isIOS ? 4 : (isNarrowMobile ? 2 : 3);
  const navItemPaddingBottom = isIOS ? 3 : 1;
  const conceptText = "#dfe2eb";
  const conceptSubtext = "#bccbb9";
  const miniPlayerTheme = createSpotifyColorTheme(albumColor || Colors.primary);

  // Ensure title is always readable — if extracted textColor is too dark, use white
  const safeTextColor = (() => {
    const raw = textColor || conceptText;
    // Parse hex brightness — if < 100 (out of 255) it's too dark for the dark bg
    const hex = raw.replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      // Perceived brightness (ITU-R BT.601)
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 100) return conceptText; // too dark — use light fallback
    }
    return raw;
  })();

  const playerTitleColor = safeTextColor;
  const playerSecondaryColor = colorToRgba(safeTextColor, 0.72, conceptSubtext);
  const playIconColor = isIOS ? "#111317" : miniPlayerTheme.onAccent;
  const activeNavColor = isIOS ? "#F7F7FA" : "#FFFFFF";
  const navInactiveColor = isIOS ? "rgba(235,235,245,0.62)" : conceptSubtext;
  const navBaseBg = isIOS ? "rgba(22,24,29,0.32)" : Colors.surface;
  const containerGlassBase = isIOS ? "rgba(15,17,22,0.28)" : Colors.background;
  const playerSectionBg = isIOS ? "rgba(22,24,29,0.38)" : Colors.surface;
  const playerSectionDivider = colorToRgba(miniPlayerTheme.accent, 0.14, "rgba(223,226,235,0.08)");
  const playerProgressFillColor = Colors.primary;
  const navGlassTintColors: readonly [string, string, string] = isIOS
    ? [
        "rgba(255,255,255,0.14)",
        "rgba(255,255,255,0.05)",
        "rgba(255,255,255,0.08)",
      ]
    : [
        "rgba(255,255,255,0.05)",
        "rgba(255,255,255,0.02)",
        "rgba(255,255,255,0.03)",
      ];
  const navGlowFillColors: readonly [string, string, string] = isIOS
    ? [
        colorToRgba(albumColor, 0.04, "rgba(255,255,255,0.08)"),
        colorToRgba(albumColor, 0.02, "rgba(255,255,255,0.04)"),
        "rgba(255,255,255,0.015)",
      ]
    : [
        colorToRgba(albumColor, 0.07, "rgba(16,20,26,0.1)"),
        colorToRgba(albumColor, 0.035, "rgba(16,20,26,0.07)"),
        "rgba(16,20,26,0.015)",
      ];
  const coverAlbumTint = colorToRgba(albumColor, 0.26, "rgba(255,255,255,0.12)");
  const coverAlbumTintBorder = colorToRgba(albumColor, 0.52, "rgba(255,255,255,0.24)");
  const playerGradientStrong = colorToRgba(albumColor, 0.2, "rgba(255,255,255,0.08)");
  const playerGradientSoft = colorToRgba(albumColor, 0.08, "rgba(255,255,255,0.03)");
  const playerTopEdgeTint = colorToRgba(
    miniPlayerTheme.accent,
    0.14,
    "rgba(255,255,255,0.12)"
  );
  const miniButtonPrimaryBg = isIOS ? "rgba(255,255,255,0.96)" : miniPlayerTheme.accent;
  const miniButtonPrimaryBorder = isIOS
    ? "rgba(255,255,255,0.16)"
    : colorToRgba(miniPlayerTheme.accent, 0.72, "rgba(38, 225, 154, 0.72)");
  const miniSecondaryButtonBg = isIOS ? "rgba(255,255,255,0.08)" : miniPlayerTheme.accent;
  const miniSecondaryButtonBorder = isIOS
    ? "rgba(255,255,255,0.08)"
    : colorToRgba(miniPlayerTheme.accent, 0.72, "rgba(38, 225, 154, 0.72)");
  const miniSecondaryIconColor = isIOS ? "rgba(255,255,255,0.88)" : playIconColor;
  const coverUrl = activeSong?.coverUrl?.trim();
  const miniPlayerHeight = 60;
  const miniCoverSize = 60;
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
  const miniProgressPercent: DimensionValue = `${Math.max(
    0,
    Math.min(100, (Number.isFinite(progress) ? progress : 0) * 100)
  )}%`;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.wrapper, { bottom: resolvedBottomInset }]}
      >
      <View
        style={[
          styles.container,
          isIOS && styles.containerIOS,
          { paddingBottom: containerBottomPadding, width: containerWidth },
          !hasActiveMiniPlayer && styles.containerNavOnly,
          !hasActiveMiniPlayer && isIOS && styles.containerNavOnlyIOS,
        ]}
      >
        <View pointerEvents="none" style={styles.glassLayer}>
          {isIOS ? (
            <BlurView
              tint="dark"
              intensity={42}
              style={styles.containerBlur}
            />
          ) : null}
          <View style={[styles.glassBaseLayer, { backgroundColor: containerGlassBase }]} />
          <LinearGradient
            colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.glassTint}
          />
          <View
            style={[
              styles.glassOutline,
              isIOS && styles.glassOutlineIOS,
              !hasActiveMiniPlayer && styles.glassOutlineNavOnly,
              !hasActiveMiniPlayer && isIOS && styles.glassOutlineNavOnlyIOS,
            ]}
          />
        </View>

        {hasActiveMiniPlayer && activeSong ? (
          <View
            style={[
              styles.playerSection,
              isIOS && styles.playerSectionIOS,
              { backgroundColor: playerSectionBg, borderBottomColor: playerSectionDivider },
            ]}
          >
            {isIOS ? (
              <BlurView
                pointerEvents="none"
                tint="dark"
                intensity={34}
                style={styles.playerBlur}
              />
            ) : null}
            <LinearGradient
              pointerEvents="none"
              colors={[playerGradientStrong, playerGradientSoft, "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.playerGradient}
            />
            <View pointerEvents="none" style={[styles.playerTopEdge, { backgroundColor: playerTopEdgeTint }]} />
            <View
              pointerEvents="none"
              style={[styles.playerCornerAccentLeft, { borderColor: playerTopEdgeTint }]}
            />
            <View
              pointerEvents="none"
              style={[styles.playerCornerAccentRight, { borderColor: playerTopEdgeTint }]}
            />
            <Pressable
              style={[styles.playerRow, { height: miniPlayerHeight }]}
              onPress={() => router.push("/player")}
            >
              <View style={styles.playerLeft}>
                <View style={[styles.coverWrap, { width: miniCoverSize }]}>
                  <View
                    pointerEvents="none"
                    style={[
                      styles.coverAlbumTint,
                      { backgroundColor: coverAlbumTint, borderColor: coverAlbumTintBorder },
                    ]}
                  />
                  {coverUrl && !coverFailed ? (
                    <Image
                      source={{ uri: coverUrl }}
                      style={[styles.cover, { width: miniCoverSize, height: miniCoverSize }]}
                      contentFit="cover"
                      decodeFormat="argb"
                      transition={120}
                      onError={() => setCoverFailed(true)}
                    />
                  ) : (
                    <View style={[styles.cover, styles.coverFallback, { width: miniCoverSize, height: miniCoverSize }]}>
                      <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.72)" />
                    </View>
                  )}
                </View>
                <View style={[styles.songInfo, isDragging && styles.songInfoDuringMixDrag]}>
                  <PingPongScroll
                    key={`mini-title-${activeSong.id}`}
                    text={activeSong.title}
                    style={[styles.songTitle, { color: playerTitleColor }]}
                    velocity={15}
                  />
                  <PingPongScroll
                    key={`mini-artist-${activeSong.id}`}
                    text={activeSong.artist}
                    style={[styles.songArtist, { color: playerSecondaryColor }]}
                    velocity={12}
                  />
                </View>
              </View>

              <View style={styles.playerControls}>
                {lastMix ? (
                  <Animated.View
                    style={[
                      styles.mixChipWrap,
                      {
                        opacity: chipOpacity,
                        transform: [{ translateX: dragX }, { scale: chipScale }],
                      },
                    ]}
                    {...panResponder.panHandlers}
                  >
                    <Pressable
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
                            key={`${image}-${index}`}
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
                ) : null}
                <Pressable
                  onPress={() => {
                    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                    togglePlay();
                  }}
                  hitSlop={14}
                  style={[
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
                  ]}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={25}
                    color={playIconColor}
                    style={!isPlaying ? { marginLeft: 1 } : undefined}
                  />
                </Pressable>
                <Pressable
                  onPress={() => router.push("/queue")}
                  hitSlop={14}
                  style={[
                    styles.iconButton,
                    { width: miniControlSize, height: miniControlSize, borderRadius: miniControlRadius },
                    !isIOS && styles.iconButtonPrimary,
                    {
                      backgroundColor: miniSecondaryButtonBg,
                      borderColor: miniSecondaryButtonBorder,
                    },
                  ]}
                >
                  <Ionicons name="list" size={24} color={miniSecondaryIconColor} />
                </Pressable>
              </View>
            </Pressable>

            <View pointerEvents="none" style={styles.playerProgressTrack}>
              <View
                style={[
                  styles.playerProgressFill,
                  {
                    width: miniProgressPercent,
                    backgroundColor: playerProgressFillColor,
                  },
                ]}
              />
            </View>

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
              height: navHeight,
              paddingHorizontal: navHorizontalPadding,
              paddingTop: navTopPadding,
              paddingBottom: navBottomSafePadding,
              borderTopWidth: hasActiveMiniPlayer ? 1 : 0,
            },
            !hasActiveMiniPlayer && styles.navContentNavOnly,
          ]}
        >
          {isIOS ? (
            <BlurView
              pointerEvents="none"
              tint="dark"
              intensity={56}
              style={styles.navGlassBlur}
            />
          ) : null}
          <LinearGradient
            pointerEvents="none"
            colors={navGlassTintColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.navGlassTint}
          />
          <LinearGradient
            pointerEvents="none"
            colors={navGlowFillColors}
            start={{ x: 0.5, y: 0.05 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.navGlowFill}
          />
          {NAV_ITEMS.map((item) => {
            const isFocused =
              item.route === "index"
                ? pathname === "/" || pathname === "/index"
                : pathname === `/${item.route}` || pathname?.startsWith(`/${item.route}/`);

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
                onPress={() => {
                  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                  if (!isFocused) {
                    router.push(item.route === "index" ? "/" : `/${item.route}` as any);
                  }
                }}
                onLongPress={() => {}}
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
  const insets = useSafeAreaInsets();
  const {
    currentSong,
    queue,
    queueIndex,
    isPlaying,
    progress,
    togglePlay,
    textColor,
    setAlbumColor,
    setTextColor,
  } = usePlayerLite();
  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const [coverFailed, setCoverFailed] = useState(false);
  const lastMix = useLastMix();
  const mixBarOne = useRef(new Animated.Value(0.32)).current;
  const mixBarTwo = useRef(new Animated.Value(0.58)).current;
  const mixBarThree = useRef(new Animated.Value(0.44)).current;
  const mixImage = useMemo(() => {
    const first = (lastMix?.images ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)[0];
    return first ?? "";
  }, [lastMix?.images]);
  const mixImages = useMemo(() => {
    const all = (lastMix?.images ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return all;
  }, [lastMix?.images]);
  const mixNames = useMemo(() => {
    const all = (lastMix?.names ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return all;
  }, [lastMix?.names]);
  const mixSongIds = useMemo(() => {
    const raw = lastMix?.songIds ?? "";
    if (!raw) return [] as string[];
    return raw.split(",").map((id) => id.trim()).filter(Boolean);
  }, [lastMix?.songIds]);
  const activeSongId = activeSong?.id ?? "";
  const isPlayingFromLastMix = useMemo(() => {
    if (!isPlaying || !activeSongId || mixSongIds.length === 0) return false;
    if (!mixSongIds.includes(activeSongId)) return false;
    if (queue.length !== mixSongIds.length) return false;
    const mixSet = new Set(mixSongIds);
    return queue.every((song) => mixSet.has(song.id));
  }, [activeSongId, isPlaying, mixSongIds, queue]);

  useEffect(() => {
    if (!activeSong?.coverUrl) return;
    extractDominantColor(activeSong.coverUrl)
      .then((colors) => {
        setAlbumColor(colors.primary);
        setTextColor(colors.text);
      })
      .catch(() => {});
  }, [activeSong?.id, activeSong?.coverUrl, setAlbumColor, setTextColor]);

  useEffect(() => {
    setCoverFailed(false);
  }, [activeSong?.id, activeSong?.coverUrl]);

  useEffect(() => {
    const resetBars = () => {
      Animated.parallel([
        Animated.timing(mixBarOne, { toValue: 0.32, duration: 180, useNativeDriver: true }),
        Animated.timing(mixBarTwo, { toValue: 0.58, duration: 180, useNativeDriver: true }),
        Animated.timing(mixBarThree, { toValue: 0.44, duration: 180, useNativeDriver: true }),
      ]).start();
    };

    if (!lastMix || !isPlayingFromLastMix) {
      resetBars();
      return;
    }

    const loopOne = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarOne, { toValue: 0.96, duration: 230, useNativeDriver: true }),
        Animated.timing(mixBarOne, { toValue: 0.24, duration: 280, useNativeDriver: true }),
      ])
    );
    const loopTwo = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarTwo, { toValue: 0.84, duration: 180, useNativeDriver: true }),
        Animated.timing(mixBarTwo, { toValue: 0.3, duration: 240, useNativeDriver: true }),
      ])
    );
    const loopThree = Animated.loop(
      Animated.sequence([
        Animated.timing(mixBarThree, { toValue: 0.9, duration: 260, useNativeDriver: true }),
        Animated.timing(mixBarThree, { toValue: 0.22, duration: 210, useNativeDriver: true }),
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
  const progressFillColor = Colors.primary;
  const progressWidth: DimensionValue = `${Math.max(
    0,
    Math.min(100, (Number.isFinite(progress) ? progress : 0) * 100)
  )}%`;
  const tabBarVisualHeight = 49;
  const tabBarGap = 6;
  const bottomOffset = Math.max(insets.bottom + tabBarVisualHeight + tabBarGap, 80);

  return (
    <View pointerEvents="box-none" style={[styles.iosMiniPlayerRoot, { bottom: bottomOffset }]}>
      <View style={styles.iosMiniPlayerShell}>
        <BlurView tint="systemChromeMaterialDark" intensity={85} style={styles.iosMiniPlayerBlur} />
        <View pointerEvents="none" style={styles.iosMiniPlayerTopHairline} />

        <View style={styles.iosMiniPlayerRow}>
          <Pressable style={styles.iosMiniPlayerMain} onPress={() => router.push("/player")}>
            <View style={styles.iosMiniPlayerArtworkShell}>
              {activeSong.coverUrl && !coverFailed ? (
                <Image
                  source={{ uri: activeSong.coverUrl }}
                  style={styles.iosMiniPlayerCover}
                  contentFit="cover"
                  transition={120}
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <View style={[styles.iosMiniPlayerCover, styles.iosMiniPlayerCoverFallback]}>
                  <Ionicons name="musical-notes" size={20} color="rgba(255,255,255,0.72)" />
                </View>
              )}
            </View>

            <View style={styles.iosMiniPlayerText}>
              <PingPongScroll
                key={`ios-mini-title-${activeSong.id}`}
                text={activeSong.title}
                style={[styles.iosMiniPlayerTitle, { color: resolvedTextColor }]}
                velocity={14}
              />
              <PingPongScroll
                key={`ios-mini-artist-${activeSong.id}`}
                text={activeSong.artist}
                style={[styles.iosMiniPlayerArtist, { color: secondaryColor }]}
                velocity={11}
              />
            </View>
          </Pressable>

          {lastMix ? (
            <Pressable
              onPress={() => {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/artist-mix", params: lastMix });
              }}
              hitSlop={8}
              style={styles.iosMiniPlayerInlineMixBtn}
            >
              <BlurView tint="systemChromeMaterialDark" intensity={85} style={styles.iosMiniPlayerSideActionBlur} />
              <View style={styles.iosMiniPlayerMixCard}>
                {/* Show multiple artist images in a grid for multi-artist mixes */}
                {mixImages.length > 1 ? (
                  <View style={styles.iosMiniPlayerMixGrid}>
                    {mixImages.slice(0, 4).map((img, idx) => (
                      <View key={idx} style={styles.iosMiniPlayerMixGridCell}>
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
              onPress={() => {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                togglePlay();
              }}
              hitSlop={14}
              style={[styles.iosMiniPlayerButton, styles.iosMiniPlayerPrimaryButton]}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={25}
                color="rgba(255,255,255,0.96)"
                style={!isPlaying ? { marginLeft: 2 } : undefined}
              />
            </Pressable>
            <Pressable
              onPress={() => router.push("/queue")}
              hitSlop={14}
              style={[styles.iosMiniPlayerButton, styles.iosMiniPlayerSecondaryButton]}
            >
              <Ionicons name="list" size={24} color="rgba(255,255,255,0.88)" />
            </Pressable>
          </View>
        </View>

        <View pointerEvents="none" style={styles.iosMiniPlayerProgressTrack}>
          <View
            style={[
              styles.iosMiniPlayerProgressFill,
              { width: progressWidth, backgroundColor: progressFillColor },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const pathname = usePathname();
  const tabsNavigationRef = React.useRef<any>(null);
  const preloadTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const shouldHideTabBar = pathname?.startsWith("/import-songs");

  // NativeTabs only work correctly when distributed via App Store or TestFlight.
  // Sideloaded / unsigned IPAs run with __DEV__ = false but lack the required
  // entitlements, causing an immediate crash. Disable NativeTabs entirely until
  // the app is properly signed and distributed through Apple channels.
  const isProductionBuild = false; // TODO: re-enable when distributing via App Store

  useEffect(() => {
    if (isWeb) {
      return;
    }

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      const nav = tabsNavigationRef.current;
      if (!nav || typeof nav.preload !== "function") {
        return;
      }

      const timer = setTimeout(() => {
        try {
          nav.preload("search");
        } catch {
          // Silent fail
        }
      }, 1800);
      preloadTimersRef.current = [timer];
    });

    return () => {
      interactionTask.cancel();
      preloadTimersRef.current.forEach((timer) => clearTimeout(timer));
      preloadTimersRef.current = [];
    };
  }, [isWeb]);

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
        detachInactiveScreens
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          sceneStyle: { backgroundColor: Colors.background },
        }}
        tabBar={() => null}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="liked-songs" options={{ title: "Liked" }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(37,37,37,0.18)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
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
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  iosMiniPlayerCover: {
    width: "100%",
    height: "100%",
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
    backgroundColor: "rgba(24,24,26,0.9)",
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
    left: 50,
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
    zIndex: 999,
    alignItems: "center",
  },
  container: {
    width: "96%",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 0,
  },
  containerIOS: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
  },
  containerNavOnly: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  containerNavOnlyIOS: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  containerBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  glassBaseLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9, 12, 18, 0.58)",
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
  },
  glassOutline: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  glassOutlineIOS: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.09)",
  },
  glassOutlineNavOnly: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  glassOutlineNavOnlyIOS: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  playerSection: {
    backgroundColor: "#0A0A0C",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(61, 74, 61, 0.4)",
    overflow: "hidden",
  },
  playerSectionIOS: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  playerBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  playerGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.52,
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
    left: 60,
    right: 10,
    bottom: 0,
    height: 2,
    borderRadius: 999,
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
    elevation: 12,
  },
  mixTrashDockActive: {
    borderColor: "rgba(255, 92, 92, 0.9)",
    backgroundColor: "rgba(82, 16, 16, 0.95)",
  },
  playerRow: {
    height: 60,
    paddingLeft: 0,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  playerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  coverWrap: {
    width: 60,
    height: "100%",
    overflow: "hidden",
    borderRightWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  coverAlbumTint: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 0,
    borderWidth: 0,
  },
  cover: {
    width: 60,
    height: 60,
    borderRadius: 0,
    backgroundColor: "#111111",
  },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 6,
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
    height: 54,
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
  navContentNavOnly: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  navGlassBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  navGlassTint: {
    ...StyleSheet.absoluteFillObject,
  },
  navGlowFill: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
  },
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
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    zIndex: 1,
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
