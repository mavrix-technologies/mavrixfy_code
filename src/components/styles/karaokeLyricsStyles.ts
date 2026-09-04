import { StyleSheet } from "react-native";
import { IS_IOS } from "@/constants/platform";

export const styles = StyleSheet.create({
  // ── 1. Inline Preview Card (Screenshot 1) ──────────────────────────────────
  spotifyCardContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
  },
  spotifyCardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  spotifyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  spotifyCardHeaderIconBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  spotifyCardHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  spotifyCardViewport: {
    height: 132,
    overflow: "hidden",
    marginBottom: 16,
    justifyContent: "flex-start",
  },
  spotifyCardLineWrap: {
    height: 44,
    justifyContent: "center",
  },
  spotifyCardLineText: {
    fontSize: 21,
    lineHeight: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.35,
  },
  spotifyCardLineActive: {
    color: "#FFFFFF",
  },
  spotifyCardLinePassed: {
    color: "rgba(255, 255, 255, 0.78)",
  },
  spotifyCardLineUpcoming: {
    color: "rgba(0, 0, 0, 0.90)",
  },
  spotifyCardFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  spotifyShowLyricsPill: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  spotifyShowLyricsPillPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  spotifyShowLyricsText: {
    color: "#000000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  spotifyCardLoading: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  spotifyCardSubtext: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  // ── 2. Fullscreen Modal (Screenshot 2) ──────────────────────────────────────
  spotifyModalRoot: {
    flex: 1,
  },
  spotifyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: IS_IOS ? 54 : 36,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  spotifyHeaderArtwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  spotifyHeaderArtworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  spotifyHeaderSongInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  spotifyHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 21,
    fontFamily: "Inter_700Bold",
  },
  spotifyHeaderArtist: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  spotifyHeaderCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  spotifyModalListContent: {
    paddingHorizontal: 22,
  },
  spotifyLinePressable: {
    paddingVertical: 12,
  },
  spotifyLinePressed: {
    opacity: 0.75,
  },
  spotifyLineText: {
    fontSize: 25,
    lineHeight: 35,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  spotifyLineActive: {
    color: "#FFFFFF",
  },
  spotifyLinePassed: {
    color: "rgba(255, 255, 255, 0.78)",
  },
  spotifyLineUpcoming: {
    color: "rgba(0, 0, 0, 0.90)",
  },
  spotifyWordActive: {
    color: "#FFFFFF",
  },
  spotifyWordUpcoming: {
    color: "rgba(0, 0, 0, 0.40)",
  },
  spotifyBreakContainer: {
    paddingVertical: 14,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  spotifyBreakContainerCompact: {
    paddingVertical: 4,
  },
  spotifyBreakDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 6,
  },
  spotifyBreakDotsRowCompact: {
    gap: 6,
    paddingVertical: 2,
  },
  spotifyBreakDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spotifyBreakDotCompact: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  spotifyModalCenterState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  spotifyModalLoadingText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  spotifyModalEmptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  spotifyModalEmptySubtext: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  // Bottom Control Bar matching screenshot
  spotifyBottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: IS_IOS ? 38 : 24,
    paddingTop: 12,
    gap: 10,
  },
  spotifyBottomPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  spotifyBottomPlayBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  spotifyBottomSliderWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  spotifyBottomTimeText: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
});
