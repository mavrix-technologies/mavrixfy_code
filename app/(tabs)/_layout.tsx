import { Tabs, router, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { Animated, InteractionManager, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type DimensionValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Colors from "@/constants/colors";
import { usePlayerLite } from "@/contexts/PlayerContext";
import { PingPongScroll } from "@/components/PingPongScroll";
import { createSpotifyColorTheme, extractDominantColor } from "@/lib/colorExtractor";
import { triggerImpact } from "@/lib/haptics";

const TAB_BOTTOM = 1;

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

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.965,
      speed: 35,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      speed: 25,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  };

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
          { paddingTop: navItemPaddingTop, paddingBottom: navItemPaddingBottom },
          isFocused && styles.navItemActive,
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

function MergedTabBar({
  state,
  navigation,
  insets,
}: BottomTabBarProps) {
  const isWeb = Platform.OS === "web";
  const safeInsets = useSafeAreaInsets();
  const bottomInset = Math.max(safeInsets.bottom ?? insets?.bottom ?? 0, 0);
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
  const hasActiveMiniPlayer = Boolean(activeSong);
  const [coverFailed, setCoverFailed] = useState(false);

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
  const floatingBottom = isWeb
    ? TAB_BOTTOM
    : 0;
  const containerBottomPadding = 0;
  const navIconSize = isNarrowMobile ? 19 : 21;
  const navLabelSize = isNarrowMobile ? 9 : 10;
  const navLabelLineHeight = isNarrowMobile ? 12 : 13;
  const navTopPadding = 0;
  const navBottomSafePadding = isWeb
    ? 0
    : Math.max(6, Math.min(10, Math.round(resolvedBottomInset * 0.5)));
  const navBaseHeight = isNarrowMobile
    ? 46
    : 50;
  const navHeight = navBaseHeight + navTopPadding + navBottomSafePadding;
  const navHorizontalPadding = isNarrowMobile ? 8 : 10;
  const navItemPaddingTop = isNarrowMobile ? 2 : 3;
  const navItemPaddingBottom = 1;
  const conceptText = "#dfe2eb";
  const conceptSubtext = "#bccbb9";
  const miniPlayerTheme = createSpotifyColorTheme(albumColor || Colors.primary);
  const conceptAccent = miniPlayerTheme.accent;
  const playerTitleColor = textColor || conceptText;
  const playerSecondaryColor = colorToRgba(textColor || conceptText, 0.78, conceptSubtext);
  const playIconColor = miniPlayerTheme.onAccent;
  const activeNavColor = "#FFFFFF";
  const navInactiveColor = conceptSubtext;
  const navBaseBg = Colors.surface;
  const containerGlassBase = Colors.background;
  const playerSectionBg = Colors.surface;
  const playerSectionDivider = colorToRgba(miniPlayerTheme.accent, 0.14, "rgba(223,226,235,0.08)");
  const playerProgressFillColor = conceptAccent;
  const navGlassTintColors: readonly [string, string, string] = [
    "rgba(255,255,255,0.05)",
    "rgba(255,255,255,0.02)",
    "rgba(255,255,255,0.03)",
  ];
  const navGlowFillColors: readonly [string, string, string] = [
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
  const miniButtonPrimaryBg = miniPlayerTheme.accent;
  const miniButtonPrimaryBorder = colorToRgba(miniPlayerTheme.accent, 0.72, "rgba(38, 225, 154, 0.72)");
  const coverUrl = activeSong?.coverUrl?.trim();
  const miniPlayerHeight = 50;
  const miniCoverSize = 52;
  const miniControlSize = 32;
  const miniControlRadius = Math.round(miniControlSize / 2);
  const miniProgressPercent: DimensionValue = `${Math.max(
    0,
    Math.min(100, (Number.isFinite(progress) ? progress : 0) * 100)
  )}%`;

  return (
    <>
      <SafeAreaView
        pointerEvents="box-none"
        edges={["bottom"]}
        style={[styles.wrapper, { bottom: floatingBottom }]}
      >
      <View
        style={[
          styles.container,
          { paddingBottom: containerBottomPadding },
          !hasActiveMiniPlayer && styles.containerNavOnly,
        ]}
      >
        <View pointerEvents="none" style={styles.glassLayer}>
          <View style={[styles.glassBaseLayer, { backgroundColor: containerGlassBase }]} />
          <LinearGradient
            colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.glassTint}
          />
          <View style={[styles.glassOutline, !hasActiveMiniPlayer && styles.glassOutlineNavOnly]} />
        </View>

        {hasActiveMiniPlayer && activeSong ? (
          <View style={[styles.playerSection, { backgroundColor: playerSectionBg, borderBottomColor: playerSectionDivider }]}>
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
                <View style={styles.songInfo}>
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
                <Pressable
                  onPress={() => {
                    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                    togglePlay();
                  }}
                  hitSlop={10}
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
                    size={22}
                    color={playIconColor}
                    style={!isPlaying ? { marginLeft: 1 } : undefined}
                  />
                </Pressable>
                <Pressable
                  onPress={() => router.push("/queue")}
                  hitSlop={10}
                  style={[
                    styles.iconButton,
                    { width: miniControlSize, height: miniControlSize, borderRadius: miniControlRadius },
                    styles.iconButtonPrimary,
                    {
                      backgroundColor: miniButtonPrimaryBg,
                      borderColor: miniButtonPrimaryBorder,
                    },
                  ]}
                >
                  <Ionicons name="list" size={21} color={playIconColor} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/bluetooth");
                  }}
                  hitSlop={10}
                  style={[
                    styles.iconButton,
                    { width: miniControlSize, height: miniControlSize, borderRadius: miniControlRadius },
                    styles.iconButtonPrimary,
                    {
                      backgroundColor: miniButtonPrimaryBg,
                      borderColor: miniButtonPrimaryBorder,
                    },
                  ]}
                >
                  <Ionicons name="bluetooth" size={19} color={playIconColor} />
                </Pressable>
              </View>
            </Pressable>
            <View pointerEvents="none" style={[styles.playerProgressTrack, { left: miniCoverSize }]}>
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

          </View>
        ) : null}

        <View
          style={[
            styles.navContent,
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
            const route = state.routes.find((r) => r.name === item.route);
            if (!route) return null;
            const routeIndex = state.routes.findIndex((r) => r.key === route.key);
            const isFocused = state.index === routeIndex;

            return (
              <NavTabItem
                key={item.route}
                item={item}
                isFocused={isFocused}
                isAndroid={isAndroid}
                navIconSize={navIconSize}
                navLabelSize={navLabelSize}
                navLabelLineHeight={navLabelLineHeight}
                navItemPaddingTop={navItemPaddingTop}
                navItemPaddingBottom={navItemPaddingBottom}
                activeNavColor={activeNavColor}
                navInactiveColor={navInactiveColor}
                onPress={() => {
                  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });

                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                onLongPress={() => {
                  navigation.emit({
                    type: "tabLongPress",
                    target: route.key,
                  });
                }}
              />
            );
          })}
        </View>
      </View>
      </SafeAreaView>

    </>
  );
}

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const pathname = usePathname();
  const tabsNavigationRef = React.useRef<any>(null);
  const preloadTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const shouldHideTabBar = pathname?.includes("/import-songs/file");

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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        detachInactiveScreens
        screenOptions={{
          headerShown: false,
          animation: "fade",
          lazy: true,
          freezeOnBlur: true,
          sceneStyle: { backgroundColor: Colors.background },
        }}
        tabBar={(props) => {
          tabsNavigationRef.current = props.navigation;
          return shouldHideTabBar ? null : (
            <MergedTabBar {...props} />
          );
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="liked-songs" options={{ title: "Liked" }} />
        <Tabs.Screen
          name="playlist"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: "center",
  },
  container: {
    width: "93%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: "hidden",
    borderWidth: 0,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 0,
  },
  containerNavOnly: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  glassOutlineNavOnly: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  playerSection: {
    backgroundColor: "#0A0A0C",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(61, 74, 61, 0.4)",
    overflow: "hidden",
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
    left: 52,
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
  playerRow: {
    height: 50,
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
    width: 52,
    height: "100%",
    overflow: "visible",
    borderRightWidth: 1,
    borderRightColor: "rgba(61, 74, 61, 0.42)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  coverAlbumTint: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
  },
  cover: {
    width: 52,
    height: 52,
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
  songTitle: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  songArtist: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
    marginTop: 0,
  },
  playerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginLeft: 2,
    flexShrink: 0,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(38, 42, 49, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(61, 74, 61, 0.38)",
  },
  iconButtonPrimary: {
    backgroundColor: "#26e19a",
    borderColor: "rgba(38, 225, 154, 0.72)",
  },
  navContent: {
    height: 48,
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
    width: 24,
    height: 24,
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
  navItemActive: {
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
  navLabelActive: {
    color: Colors.text,
  },
});
