import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { getSolidHeaderColor } from "@/lib/colorExtractor";
import { usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { Ionicons } from "@expo/vector-icons";
import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { unescapeHtml } from "@/utils/stringUtils";

// ─── White progress bar — pinned to the very bottom edge of the sticky header ───
const LiveProgressBar = memo(function LiveProgressBar() {
  const { positionMillis, duration } = usePlaybackProgressStore();
  const progress = duration > 0 ? Math.min(1, positionMillis / duration) : 0;

  return (
    <View style={progressStyles.track} pointerEvents="none">
      <View style={[progressStyles.fill, { width: `${progress * 100}%` }]} />
    </View>
  );
});

const progressStyles = StyleSheet.create({
  track: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    minWidth: 4,
  },
});

// ─── Props ───────────────────────────────────────────────────────────────────
export interface PlayerStickyHeaderProps {
  topInset: number;
  topBarHeight: number;
  isShortScreen: boolean;
  scrollY: SharedValue<number>;
  sheetTextColor?: string;
  albumName: string;
  songTitle: string;
  songArtist: string;
  accentColor?: string;
  backgroundColor?: string;
  isScrolled?: boolean;
  /** Whether the song is currently playing — controls the play/pause icon */
  isPlaying: boolean;
  onClose: () => void;
  onOptionsPress: () => void;
  onEnterStandBy: () => void;
  onTogglePlay: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export const PlayerStickyHeader = React.memo(function PlayerStickyHeader({
  topInset,
  topBarHeight,
  isShortScreen,
  scrollY,
  sheetTextColor = "#FFFFFF",
  albumName,
  songTitle,
  songArtist,
  accentColor,
  backgroundColor,
  isScrolled = false,
  isPlaying,
  onClose,
  onOptionsPress,
  onEnterStandBy,
  onTogglePlay,
}: PlayerStickyHeaderProps) {
  // Derive a 100% solid, fully opaque background color from the artwork color extractor
  const solidBgColor = useMemo(() => {
    return getSolidHeaderColor(accentColor, backgroundColor);
  }, [accentColor, backgroundColor]);

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 45, 95], [0, 0.75, 1], Extrapolation.CLAMP),
  }));
  const topTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40, 80], [1, 0.4, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP) }],
  }));
  const scrolledTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [40, 85, 125], [0, 0.5, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [40, 125], [8, 0], Extrapolation.CLAMP) }],
  }));
  const optionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40, 80], [1, 0.4, 0], Extrapolation.CLAMP),
  }));
  const playStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [40, 85, 125], [0, 0.5, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      collapsable={false}
      pointerEvents="box-none"
      style={[
        localStyles.stickyHeaderContainer,
        {
          top: 0,
          height: topInset + topBarHeight,
          paddingTop: topInset,
        },
      ]}
    >
      {/* ── Scroll-driven background: solid static with artwork color, zero transparency ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          backgroundStyle,
        ]}
      >
        {/* Solid static background - 100% opaque (not transparent), artwork-palette tinted */}
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: solidBgColor }]}
        />
        {/* Hairline separator just above the progress bar */}
        <View
          pointerEvents="none"
          style={localStyles.hairline}
        />
      </Animated.View>

      {/* ── White progress bar — absolutely pinned to the very bottom edge ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          localStyles.progressBarAnchor,
          backgroundStyle,
        ]}
      >
        <LiveProgressBar />
      </Animated.View>

      {/* ── Top bar row — buttons always interactive ── */}
      <View
        style={[
          localStyles.topBar,
          {
            height: topBarHeight,
            paddingHorizontal: isShortScreen ? 14 : 18,
          },
        ]}
      >
        {/* Left: dismiss / minimize */}
        <Pressable
          style={({ pressed }) => [
            localStyles.iconBtn,
            pressed && localStyles.iconBtnPressed,
          ]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Minimise player"
        >
          <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
        </Pressable>

        {/* Centre: dual-state title */}
        <View style={localStyles.headerCenter}>
          {/* State A — album context (top of scroll / normal view) */}
          <Animated.View
            pointerEvents="none"
            style={[
              localStyles.titleWrap,
              topTitleStyle,
            ]}
          >
            <Text style={localStyles.caption} numberOfLines={1}>
              PLAYING FROM ALBUM
            </Text>
            <Text
              style={[localStyles.albumText, { fontSize: isShortScreen ? 12 : 13 }]}
              numberOfLines={1}
            >
              {unescapeHtml(albumName || "Single")}
            </Text>
          </Animated.View>

          {/* State B — song + artist (scrolled / sticky header view) */}
          <Animated.View
            pointerEvents="none"
            style={[
              localStyles.titleWrap,
              localStyles.titleAbsolute,
              scrolledTitleStyle,
            ]}
          >
            <Text
              style={[localStyles.songTitle, { fontSize: isShortScreen ? 12.5 : 13.5 }]}
              numberOfLines={1}
            >
              {unescapeHtml(songTitle || "")}
            </Text>
            <Text style={localStyles.artistText} numberOfLines={1}>
              {unescapeHtml(songArtist || "")}
            </Text>
          </Animated.View>
        </View>

        {/* Right: 3-dot (normal without scrolling) / Play button (scrolled sticky header) */}
        <View style={localStyles.headerActions}>
          <Pressable
            style={({ pressed }) => [localStyles.iconBtn, pressed && localStyles.iconBtnPressed]}
            onPress={onEnterStandBy}
            accessibilityRole="button"
            accessibilityLabel="Open StandBy"
            accessibilityHint="Open the landscape player"
          >
            <Ionicons name="phone-landscape-outline" size={24} color={sheetTextColor} />
          </Pressable>
        <View style={localStyles.rightSlot}>
          {/* Normal without scrolling: 3-dot options button */}
          <Animated.View
            pointerEvents={isScrolled ? "none" : "auto"}
            style={[
              localStyles.rightButtonLayer,
              optionsStyle,
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                localStyles.iconBtn,
                pressed && localStyles.iconBtnPressed,
              ]}
              onPress={!isScrolled ? onOptionsPress : undefined}
              hitSlop={{ top: 12, bottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Open song options"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={26}
                color={sheetTextColor}
              />
            </Pressable>
          </Animated.View>

          {/* Sticky header (scrolled): circular Play/Pause button */}
          <Animated.View
            pointerEvents={isScrolled ? "auto" : "none"}
            style={[
              localStyles.rightButtonLayer,
              playStyle,
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                localStyles.playBtn,
                pressed && localStyles.playBtnPressed,
              ]}
              onPress={isScrolled ? onTogglePlay : undefined}
              hitSlop={{ top: 12, bottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={isShortScreen ? 19 : 21}
                color="#000000"
                style={!isPlaying ? { marginLeft: 2 } : undefined}
              />
            </Pressable>
          </Animated.View>
        </View>
        </View>
      </View>
    </Animated.View>
  );
});

PlayerStickyHeader.displayName = "PlayerStickyHeader";

// ─── Styles ──────────────────────────────────────────────────────────────────
const localStyles = StyleSheet.create({
  stickyHeaderContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: "hidden",
  },
  // Absolutely pinned to the bottom edge of the container — 2px tall
  progressBarAnchor: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  hairline: {
    position: "absolute",
    bottom: 2, // just above the 2px progress bar
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: 6,
  },
  titleWrap: {
    alignItems: "center",
    gap: 2,
    width: "100%",
  },
  titleAbsolute: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  caption: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.1,
    textAlign: "center",
  },
  albumText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.1,
  },
  songTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  artistText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  rightSlot: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  rightButtonLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPressed: {
    opacity: 0.55,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  // White circle play/pause — shown when scrolled
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.25)",
  },
  playBtnPressed: {
    opacity: 0.80,
    transform: [{ scale: 0.92 }],
  },
});
