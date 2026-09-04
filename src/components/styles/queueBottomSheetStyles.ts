import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const SHEET_BG = "#1A1A1A";
export const HANDLE_COLOR = "#4A4A4A";

export const s = StyleSheet.create({
  // Sheet
  sheetBg: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  // Handle area
  handleContainer: {
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 4,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 8,
    backgroundColor: HANDLE_COLOR,
    marginBottom: 14,
  },
  handleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  handleTitleLeft: {
    gap: 2,
  },
  handleTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
  },
  handleSubtitle: {
    color: "#8A8A8A",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Now playing section
  nowPlayingWrap: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 4,
  },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  nowArtwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#2A2A2A",
    flexShrink: 0,
  },
  nowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  nowBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  nowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(29,185,84,0.14)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nowBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nowTitle: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  nowArtist: {
    color: "#B0B0B0",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 1,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Shuffle hint
  shuffleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  shuffleText: {
    color: "#9E9E9E",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // Smart Autoplay
  smartWrap: {
    marginHorizontal: 18,
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(29,185,84,0.09)",
    borderWidth: 1,
    borderColor: "rgba(29,185,84,0.20)",
  },
  smartHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  smartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  smartBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  smartModeText: {
    flexShrink: 1,
    color: Colors.primary,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  smartBasisText: {
    marginTop: 5,
    color: "#A9A9A9",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // Section headers
  sectionHeader: {
    paddingTop: 18,
    paddingBottom: 7,
    paddingHorizontal: 18,
  },
  sectionTitle: {
    color: "#8A8A8A",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1.0,
  },

  // Queue row
  swipeWrap: {
    position: "relative",
    overflow: "hidden",
  },
  draggingRow: {
    zIndex: 20,
  },
  rowLayer: {
    backgroundColor: SHEET_BG,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingHorizontal: 18,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  artWrap: {
    position: "relative",
    width: 48,
    height: 48,
    flexShrink: 0,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#2A2A2A",
  },
  artOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  titleActive: {
    color: Colors.primary,
  },
  artist: {
    color: "#8A8A8A",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 2,
  },
  rowRemoveBtn: {
    width: 36,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dragHandle: {
    width: 40,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  listPlaceholder: {
    flex: 1,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 64,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptySubtitle: {
    color: "#8A8A8A",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 18,
    backgroundColor: SHEET_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexShrink: 0,
    zIndex: 10,
  },
  ctrlBtn: {
    flex: 1,
    maxWidth: 160,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctrlBtnPressed: {
    opacity: 0.72,
  },
  ctrlLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  ctrlLabelActive: {
    color: Colors.primary,
  },
});
