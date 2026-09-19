import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useOptionalPlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { PingPongScroll } from "@/components/PingPongScroll";
import {
  preloadDominantColors,
} from "@/lib/colorExtractor";
import { mapFilter } from "@/lib/arrayUtils";
import { triggerImpact } from "@/lib/haptics";
import { expandPlayer } from "@/lib/playerUIState";
import { styles } from "./layoutStyles";
import { IOSMiniPlayerProgressBar } from "./miniPlayerComponents";
import { noopPlayerAction } from "./layoutUtils";
import { NativeTabs } from "expo-router/unstable-native-tabs";

/**
 * Safely queries the BottomAccessory placement ('regular' | 'inline')
 * when rendered inside a <NativeTabs.BottomAccessory> slot.
 */
function useAccessoryPlacement(): "regular" | "inline" {
  try {
    if (typeof (NativeTabs?.BottomAccessory as any)?.usePlacement === "function") {
      return (NativeTabs.BottomAccessory as any).usePlacement();
    }
  } catch {
    // Fallback if context is not mounted
  }
  return "regular";
}

/**
 * Official Apple iOS native tab bar (UITabBarController + Liquid Glass pill)
 * Keeps all tabs (Home, Search, Library, Liked, Import) in ONE unified floating pill
 * (no isolated search tab), and mounts the Apple-style miniplayer in BottomAccessory.
 */
const TAB_BG = "#10141A";
const SELECTED_CAPSULE = "rgba(255,255,255,0.18)";

/**
 * Official Apple iOS native tab bar (UITabBarController + Liquid Glass pill).
 *
 * On iOS 26, the bar itself is rendered by the system as Liquid Glass —
 * backgroundColor / blurEffect / shadowColor on <NativeTabs> do NOT control
 * the iOS 26 tab-bar background (Expo SDK 54 docs confirm this).
 * The correct approach is:
 *   - contentStyle={{ backgroundColor: TAB_BG }} on each Trigger → makes the
 *     content behind the floating glass bar dark, so the overall bar reads dark.
 *   - tintColor + iconColor/labelStyle → white icons & labels.
 *   - The system draws the selected-tab gray floating capsule automatically.
 *
 * BottomAccessory MiniPlayer stays exactly where it is.
 */
export function IOSNativeTabLayout({ hidden = false }: { hidden?: boolean } = {}) {
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const hasActiveSong = Boolean(currentSong ?? queue[queueIndex] ?? queue[0]);

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      hidden={hidden}
      tintColor="#FFFFFF"
      iconColor={{ default: "rgba(255,255,255,0.65)", selected: "#FFFFFF" }}
      labelStyle={{
        default: { color: "rgba(255,255,255,0.65)", fontSize: 10 },
        selected: { color: "#FFFFFF", fontSize: 10 },
      }}
    >
      {!hidden && hasActiveSong ? (
        <NativeTabs.BottomAccessory>
          <IOSNativeAccessoryMiniPlayer />
        </NativeTabs.BottomAccessory>
      ) : null}

      {/* HOME — selected capsule provided by system on iOS 26 */}
      <NativeTabs.Trigger
        name="index"
        contentStyle={{ backgroundColor: TAB_BG }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* SEARCH */}
      <NativeTabs.Trigger
        name="search"
        contentStyle={{ backgroundColor: TAB_BG }}
      >
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* LIBRARY */}
      <NativeTabs.Trigger
        name="library"
        contentStyle={{ backgroundColor: TAB_BG }}
      >
        <NativeTabs.Trigger.Icon sf="music.note.list" />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* LIKED */}
      <NativeTabs.Trigger
        name="liked-songs"
        contentStyle={{ backgroundColor: TAB_BG }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: "heart", selected: "heart.fill" }} />
        <NativeTabs.Trigger.Label>Liked</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* IMPORT */}
      <NativeTabs.Trigger
        name="import-songs"
        contentStyle={{ backgroundColor: TAB_BG }}
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: "arrow.down.circle", selected: "arrow.down.circle.fill" }}
        />
        <NativeTabs.Trigger.Label>Import</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* Hidden create route */}
      <NativeTabs.Trigger name="create" hidden />
    </NativeTabs>
  );
}


export type IOSMiniPlayerOverlayProps = {
  isAccessory?: boolean;
};

/**
 * Authentic iOS Native Mini Player
 * Features Apple Music HIG layout:
 * - Left: Album artwork (rounded square with subtle border)
 * - Center: Song title & artist with marquee support
 * - Right: Clean iOS Play/Pause and Skip-Forward controls
 * - Bottom: Integrated subtle progress bar
 * - Gestures: Tap to expand, long-press for song options, swipe left/right to skip tracks
 * - Adapts to 'regular' and 'inline' placements in iOS 26+ UITabBarController
 */
export function IOSNativeAccessoryMiniPlayer() {
  const { push: overlayRouterPush } = useRouter();
  const { currentSong, queue, queueIndex } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const playerActions = useOptionalPlayerActions();
  const togglePlay = playerActions?.togglePlay ?? noopPlayerAction;
  const nextSong = playerActions?.nextSong ?? noopPlayerAction;
  const prevSong = playerActions?.prevSong ?? noopPlayerAction;

  const placement = useAccessoryPlacement();
  const isInline = placement === "inline";

  const activeSong = currentSong ?? queue[queueIndex] ?? queue[0] ?? null;
  const [coverFailed, setCoverFailed] = useState(false);
  const openPlayerLockRef = useRef(0);

  const openPlayer = useCallback(() => {
    const now = Date.now();
    if (now - openPlayerLockRef.current < 240) return;
    openPlayerLockRef.current = now;
    expandPlayer();
  }, []);

  const openMiniPlayerSongOptions = useCallback(() => {
    if (!activeSong) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
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

  // Horizontal swipe gesture for track skipping (Apple Music native gesture)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dy) < 16;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -36) {
            void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
            nextSong();
          } else if (gestureState.dx > 36) {
            void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
            prevSong();
          }
        },
      }),
    [nextSong, prevSong]
  );

  // Artwork prefetching and color palette extraction
  useEffect(() => {
    const urls = mapFilter(
      [
        queue[queueIndex - 1]?.coverUrl,
        activeSong?.coverUrl,
        queue[queueIndex + 1]?.coverUrl,
      ],
      (url) => url?.trim(),
      (url): url is string => Boolean(url)
    );

    if (urls.length === 0) return;
    void Image.prefetch(urls, "memory-disk").catch(() => { });
    preloadDominantColors(urls);
  }, [activeSong?.coverUrl, queue, queueIndex]);

  if (!activeSong) {
    return null;
  }

  const progressFillColor = "rgba(255,255,255,0.92)";

  const accessoryHeight = isInline ? 44 : 56;

  // Single direct native accessory view that fits 100% transparently in UITabAccessory
  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.iosNativeAccessoryContainer,
        {
          height: accessoryHeight,
        },
      ]}
    >
      <View style={[styles.iosMiniPlayerRow, { height: accessoryHeight }]}>
        {/* Main tappable metadata area (artwork + title + artist) */}
        <Pressable
          style={styles.iosMiniPlayerMain}
          onPress={openPlayer}
          onLongPress={openMiniPlayerSongOptions}
          android_disableSound
        >
          <View style={isInline ? styles.iosMiniPlayerArtworkShellInline : styles.iosMiniPlayerArtworkShell}>
            {activeSong.coverUrl && !coverFailed ? (
              <Image
                key={activeSong.id}
                source={{ uri: activeSong.coverUrl }}
                style={isInline ? styles.iosMiniPlayerCoverInline : styles.iosMiniPlayerCover}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={80}
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <View
                style={[
                  isInline ? styles.iosMiniPlayerCoverInline : styles.iosMiniPlayerCover,
                  styles.iosMiniPlayerCoverFallback,
                ]}
              >
                <Ionicons name="musical-notes" size={isInline ? 14 : 20} color="rgba(255,255,255,0.72)" />
              </View>
            )}
          </View>

          <View style={styles.iosMiniPlayerText}>
            <PingPongScroll
              text={activeSong.title}
              style={[styles.iosMiniPlayerTitle, { color: "#FFFFFF", fontSize: isInline ? 12.5 : 13.5 }]}
              velocity={14}
            />
            {!isInline && (
              <PingPongScroll
                text={activeSong.artist}
                style={[styles.iosMiniPlayerArtist, { color: "rgba(235, 235, 245, 0.68)" }]}
                velocity={11}
              />
            )}
          </View>
        </Pressable>

        {/* Clean Apple Music style native media controls */}
        <View style={styles.iosMiniPlayerNativeControls}>
          <Pressable
            android_disableSound
            onPress={() => {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
              togglePlay();
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iosMiniPlayerNativeControlBtn,
              pressed && styles.iosMiniPlayerNativeControlBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={isInline ? 20 : 22}
              color="#FFFFFF"
              style={!isPlaying ? { marginLeft: 2 } : undefined}
            />
          </Pressable>

          {!isInline && (
            <Pressable
              android_disableSound
              onPress={() => {
                void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                nextSong();
              }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iosMiniPlayerNativeControlBtn,
                pressed && styles.iosMiniPlayerNativeControlBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Next track"
            >
              <Ionicons
                name="play-skip-forward"
                size={20}
                color="rgba(255, 255, 255, 0.88)"
              />
            </Pressable>
          )}
        </View>
      </View>

      <IOSMiniPlayerProgressBar fillColor={progressFillColor} />
    </View>
  );
}

/**
 * Backward compatibility export
 */
export function IOSMiniPlayerOverlay(_props: IOSMiniPlayerOverlayProps = {}) {
  return <IOSNativeAccessoryMiniPlayer />;
}
