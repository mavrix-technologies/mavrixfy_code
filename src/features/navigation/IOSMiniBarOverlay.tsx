import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useOptionalPlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { PingPongScroll } from "@/components/PingPongScroll";
import {
  getSpotifyMiniPlayerBg,
  useArtworkPalette,
  preloadDominantColors,
} from "@/lib/colorExtractor";
import { useLastMix } from "@/lib/lastMix";
import { compactMap, mapFilter } from "@/lib/arrayUtils";
import { globalQueueSheetRef } from "@/lib/queueRef";
import { useMiniPlayerSecondaryControl } from "@/lib/storage";
import { expandPlayer } from "@/lib/playerUIState";
import { styles } from "./layoutStyles";
import {
  MiniPlayerSecondaryControlButton,
  IOSMiniPlayerProgressBar,
} from "./miniPlayerComponents";
import { noopPlayerAction } from "./layoutUtils";

type NativeTabsModule = typeof import("expo-router/unstable-native-tabs");
let nativeTabsModule: NativeTabsModule | null = null;

function getNativeTabsModule(): NativeTabsModule {
  if (!nativeTabsModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeTabsModule = require("expo-router/unstable-native-tabs") as NativeTabsModule;
  }
  return nativeTabsModule;
}

export function IOSNativeTabLayout() {
  const { Icon, Label, NativeTabs } = getNativeTabsModule() as any;

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

export function IOSMiniPlayerOverlay() {
  return useIOSMiniPlayerOverlayView();
}

function useIOSMiniPlayerOverlayView() {
  const insets = useSafeAreaInsets();
  const { push: overlayRouterPush } = useRouter();
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
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
    return compactMap(
      (lastMix?.images ?? "").split(","),
      (value) => value.trim()
    );
  }, [lastMix?.images]);
  const mixSongIds = useMemo(() => {
    const raw = lastMix?.songIds ?? "";
    if (!raw) return [] as string[];
    return compactMap(raw.split(","), (id) => id.trim());
  }, [lastMix?.songIds]);
  const activeSongId = activeSong?.id ?? "";
  const isPlayingFromLastMix = useMemo(() => {
    if (!isPlaying || !activeSongId || mixSongIds.length === 0) return false;
    if (!mixSongIds.includes(activeSongId)) return false;
    if (queue.length !== mixSongIds.length) return false;
    const mixSet = new Set(mixSongIds);
    return queue.every((song) => mixSet.has(song.id));
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive values are listed
  }, [activeSongId, isPlaying, mixSongIds, queue]);
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

  const progressFillColor = "rgba(255,255,255,0.90)";
  const tabBarVisualHeight = 49;
  const tabBarGap = 6;
  const bottomOffset = Math.max(insets.bottom + tabBarVisualHeight + tabBarGap, 80);
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
                styles.iosMiniPlayerPrimaryButton,
                pressed && styles.miniButtonPressed,
              ]}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={22}
                color="#060A0F"
                style={!isPlaying ? { marginLeft: 2 } : undefined}
              />
            </Pressable>
            <MiniPlayerSecondaryControlButton
              control={miniPlayerSecondaryControl}
              size={40}
              radius={20}
              backgroundColor="transparent"
              borderColor="transparent"
              iconColor="rgba(255,255,255,0.90)"
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
