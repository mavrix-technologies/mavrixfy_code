import { Dimensions, Platform, StyleSheet } from "react-native";
import { type ShareSheetData } from "@/utils/shareSheet";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
export const CARD_WIDTH = Math.min(290, SCREEN_WIDTH * 0.74);
export const ARTWORK_SIZE = CARD_WIDTH - 36;

export const DEFAULT_CARD_PALETTES = [
  "#281418", // Deep Wine
  "#14221E", // Emerald Forest
  "#111A28", // Sapphire Navy
  "#261828", // Royal Plum
  "#18191E", // Obsidian Slate
];

export function buildShareMessage(data: ShareSheetData): string {
  const url = data.url?.trim() || "https://mavrixfy-git-main-team-mavrix.vercel.app";

  if (data.type === "artist") {
    return `Listen to ${data.title} on Mavrixfy:\n${url}`;
  }
  if (data.type === "playlist") {
    return `Check out the playlist "${data.title}" on Mavrixfy:\n${url}`;
  }
  if (data.type === "mix") {
    return `Listen to the ${data.title} on Mavrixfy:\n${url}`;
  }
  const artistText =
    data.subtitle && data.subtitle !== "Song" && data.subtitle !== "Artist"
      ? ` by ${data.subtitle}`
      : "";
  return `Listen to "${data.title}"${artistText} on Mavrixfy:\n${url}`;
}

export const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.76)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#121316",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 36 : 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    alignSelf: "center",
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sheetHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Centered Spotify Card Area
  cardWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  cardOuterShadow: {
    borderRadius: 24,
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.65)",
    overflow: "hidden",
  },
  spotifyPosterCard: {
    width: CARD_WIDTH,
    borderRadius: 24,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },

  // Poster Top Header
  posterTopHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  posterHeaderBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  posterHeaderLogo: {
    width: 18,
    height: 18,
  },
  posterHeaderBrandText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  categoryBadgeText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },

  posterArtFrame: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#16181D",
    marginBottom: 14,
  },
  cardFallbackImage: {
    alignItems: "center",
    justifyContent: "center",
  },

  posterInfo: {
    width: "100%",
    alignItems: "flex-start",
  },
  posterTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  posterSubtitle: {
    color: "rgba(255, 255, 255, 0.70)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 14,
  },

  // Soundwave and Wordmark Footer Bar
  posterFooterBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.10)",
  },
  soundwaves: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
  footerBrandRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerBrandLogo: {
    width: 14,
    height: 14,
  },
  footerBrandName: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  // Palette Dots Row
  paletteSwatchesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 14,
  },
  swatchWrap: {
    padding: 3,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchWrapSelected: {
    borderColor: "#FFFFFF",
  },
  swatchPressed: {
    opacity: 0.7,
  },
  swatchDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },

  // Bottom Social Actions Row
  socialActionsScroll: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 16,
  },
  socialBtn: {
    alignItems: "center",
    width: 64,
  },
  btnPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.96 }],
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  socialLabel: {
    color: "#E1E3E8",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },

  // App Colors
  copyLinkBg: {
    backgroundColor: "#2B2D33",
  },
  whatsappBg: {
    backgroundColor: "#25D366",
  },
  storiesBg: {
    backgroundColor: "#E1306C",
  },
  telegramBg: {
    backgroundColor: "#0088CC",
  },
  messagesBg: {
    backgroundColor: "#34C759",
  },
  moreBg: {
    backgroundColor: "#3A3D45",
  },
});
