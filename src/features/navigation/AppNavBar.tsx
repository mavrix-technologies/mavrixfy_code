import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { styles } from "./layoutStyles";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useOptionalPlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { PingPongScroll } from "@/components/PingPongScroll";
import { triggerImpact } from "@/lib/haptics";
import {
  getSpotifyMiniPlayerBg,
  useArtworkPalette,
  preloadDominantColors,
} from "@/lib/colorExtractor";
import { useLastMix } from "@/lib/lastMix";
import { compactMap, mapFilter } from "@/lib/arrayUtils";
import { globalHomeScrollRef } from "@/lib/homeScrollRef";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { useMiniPlayerSecondaryControl } from "@/lib/storage";
import { expandPlayer } from "@/lib/playerUIState";
import { IS_ANDROID, IS_IOS, IS_WEB } from "@/constants/platform";
import {
  subscribeToMiniPlayerBannerConfig,
  DEFAULT_MINI_PLAYER_BANNER_CONFIG,
  type MiniPlayerBannerConfig,
} from "@/lib/miniPlayerBannerConfig";
import {
  MiniPlayerSecondaryControlButton,
  MiniPlayerProgressBar,
  MiniPlayerBannerView,
} from "./miniPlayerComponents";
import { useMixChipDrag } from "./useMixChipDrag";

const MINI_SWIPE_THRESHOLD = 26;

import {
  colorToRgba,
  noopLongPress,
  noopPlayerAction,
} from "./layoutUtils";
import {
  NAV_ITEMS,
  getTabHref,
  type VisibleRoute,
} from "./navTabConstants";
import { MemoizedNavTabItem } from "./NavTabItem";

export type AppNavBarProps = {
  hidden?: boolean;
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- navigation bar component
export function AppNavBar({ hidden = false }: AppNavBarProps) {
  const { push: routerPush, navigate: routerNavigate } = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<VisibleRoute>(() => {
    if (!pathname || pathname === "/" || pathname === "/index") return "index";
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

  const isWeb = IS_WEB;
  const isIOS = IS_IOS;
  const safeInsets = useSafeAreaInsets();
  const bottomInset = Math.max(safeInsets.bottom ?? 0, 0);
  const { width } = useWindowDimensions();
  const isAndroid = IS_ANDROID;
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
  const openPlayerLockRef = useRef(0);
  const [bannerConfig, setBannerConfig] = useState<MiniPlayerBannerConfig>(DEFAULT_MINI_PLAYER_BANNER_CONFIG);

  useEffect(() => {
    return subscribeToMiniPlayerBannerConfig(setBannerConfig);
  }, []);

  const handleTabPress = useCallback(
    (route: VisibleRoute, isFocused: boolean) => {
      if (isFocused && route === "index") {
        try {
          globalHomeScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch {
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
  const {
    isDragging,
    overTrash,
    dragX,
    trashOpacity,
    chipScale,
    chipOpacity,
    startMixDrag,
    mixDragGesture,
  } = useMixChipDrag();

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
          const clampedDx = Math.sign(rawDx) * Math.min(50, Math.abs(rawDx) * 0.8);
          miniSwipeX.setValue(clampedDx);
        })
        .onEnd((event) => {
          const dx = event.translationX;
          const vx = event.velocityX;

          if (dx < -MINI_SWIPE_THRESHOLD || (dx < -10 && vx < -240)) {
            if (!IS_WEB) {
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

          if (dx > MINI_SWIPE_THRESHOLD || (dx > 10 && vx > 240)) {
            if (!IS_WEB) {
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
          if (!IS_WEB) {
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

  const TAB_BAR_HEIGHT = 52;
  const resolvedBottomInset = isWeb ? 0 : Math.max(bottomInset, 0);
  const navIconSize = isNarrowMobile ? 20 : 22;
  const navLabelSize = isNarrowMobile ? 9 : 10;
  const navLabelLineHeight = 12;
  const navHorizontalPadding = isNarrowMobile ? 6 : 8;
  const conceptText = "#dfe2eb";
  const conceptSubtext = "#bccbb9";

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
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- textColor is the only reactive value
  }, [textColor]);

  const playerTitleColor = safeTextColor;
  const playerSecondaryColor = useMemo(
    () => colorToRgba(safeTextColor, 0.72, conceptSubtext),
    [safeTextColor]
  );
  const playIconColor = "#060A0F";
  const playerSectionBg = useMemo(
    () => getSpotifyMiniPlayerBg(artworkPalette.accent, artworkPalette.background),
    [artworkPalette.accent, artworkPalette.background]
  );
  const activeNavColor = "#FFFFFF";
  const navInactiveColor = conceptSubtext;
  const navBaseBg = "#0E1016";
  const containerGlassBase = "#0E1016";
  const playerSectionDivider = "rgba(255,255,255,0.06)";
  const playerProgressFillColor = "rgba(255,255,255,0.90)";
  const playerTopEdgeTint = "transparent";
  const miniButtonPrimaryBg = "#FFFFFF";
  const miniButtonPrimaryBorder = "transparent";
  const miniSecondaryButtonBg = "transparent";
  const miniSecondaryButtonBorder = "transparent";
  const miniSecondaryIconColor = "rgba(255, 255, 255, 0.90)";
  const coverUrl = activeSong?.coverUrl?.trim();
  const miniPlayerHeight = 60;
  const miniCoverSlotSize = 48;
  const miniCoverSize = 48;
  const miniControlSize = 40;
  const miniControlRadius = 20;
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
              {bannerConfig.enabled && bannerConfig.items.length > 0 ? (
                <MiniPlayerBannerView config={bannerConfig} />
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
                height: TAB_BAR_HEIGHT + resolvedBottomInset,
                paddingBottom: resolvedBottomInset,
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
