import * as Animated from "@/lib/nativeAnimated";
import { normalizeHexColor, rgbToHex } from "@/lib/colorMath";
import { usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import { Ionicons } from "@expo/vector-icons";
import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { unescapeHtml } from "@/utils/stringUtils";

// ─── Solid Opaque Color Generator (Artwork Color Extractor Logic) ─────────────
// Produces a 100% solid, fully opaque (non-transparent) background color
// blended from the extracted artwork palette onto a dark base (#0A0C12).
function getSolidHeaderColor(accentHex?: string, bgHex?: string): string {
  const accentNorm = normalizeHexColor(accentHex);
  const bgNorm = normalizeHexColor(bgHex);

  if (accentNorm) {
    const ar = parseInt(accentNorm.slice(1, 3), 16);
    const ag = parseInt(accentNorm.slice(3, 5), 16);
    const ab = parseInt(accentNorm.slice(5, 7), 16);

    // If bgNorm is available, blend accent with it; otherwise use #0A0C12 (10, 12, 18)
    const br = bgNorm ? parseInt(bgNorm.slice(1, 3), 16) : 10;
    const bg = bgNorm ? parseInt(bgNorm.slice(3, 5), 16) : 12;
    const bb = bgNorm ? parseInt(bgNorm.slice(5, 7), 16) : 18;

    // Blend 18% of extracted artwork accent onto dark base for a rich, solid tint
    const ratio = 0.18;
    const r = Math.round(br * (1 - ratio) + ar * ratio);
    const g = Math.round(bg * (1 - ratio) + ag * ratio);
    const b = Math.round(bb * (1 - ratio) + ab * ratio);

    return rgbToHex(r, g, b);
  }

  if (bgNorm) {
    return bgNorm;
  }

  return "#0A0C12";
}

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
  headerScrollY?: Animated.Value;
  /** Controls when the header background fades in (scroll-driven) */
  headerBgOpacity: Animated.AnimatedInterpolation<number>;
  topTitleOpacity: Animated.AnimatedInterpolation<number>;
  topTitleTranslateY: Animated.AnimatedInterpolation<number>;
  scrolledTitleOpacity: Animated.AnimatedInterpolation<number>;
  scrolledTitleTranslateY: Animated.AnimatedInterpolation<number>;
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
  onTogglePlay: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export const PlayerStickyHeader = React.memo(function PlayerStickyHeader({
  topInset,
  topBarHeight,
  isShortScreen,
  headerScrollY,
  headerBgOpacity,
  topTitleOpacity,
  topTitleTranslateY,
  scrolledTitleOpacity,
  scrolledTitleTranslateY,
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
  onTogglePlay,
}: PlayerStickyHeaderProps) {
  // Derive a 100% solid, fully opaque background color from the artwork color extractor
  const solidBgColor = useMemo(() => {
    return getSolidHeaderColor(accentColor, backgroundColor);
  }, [accentColor, backgroundColor]);

  return (
    <Animated.View
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
          { opacity: headerBgOpacity },
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
          { opacity: headerBgOpacity },
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
              {
                opacity: topTitleOpacity,
                transform: [{ translateY: topTitleTranslateY }],
              },
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
              {
                opacity: scrolledTitleOpacity,
                transform: [{ translateY: scrolledTitleTranslateY }],
              },
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
        <View style={localStyles.rightSlot}>
          {/* Normal without scrolling: 3-dot options button */}
          <Animated.View
            pointerEvents={isScrolled ? "none" : "auto"}
            style={[
              localStyles.rightButtonLayer,
              { opacity: topTitleOpacity },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                localStyles.iconBtn,
                pressed && localStyles.iconBtnPressed,
              ]}
              onPress={!isScrolled ? onOptionsPress : undefined}
              hitSlop={12}
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
              { opacity: scrolledTitleOpacity },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                localStyles.playBtn,
                pressed && localStyles.playBtnPressed,
              ]}
              onPress={isScrolled ? onTogglePlay : undefined}
              hitSlop={12}
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
