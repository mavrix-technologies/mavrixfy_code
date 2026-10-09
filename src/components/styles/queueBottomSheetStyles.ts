import Colors from "@/constants/colors";
import { StyleSheet } from "react-native";

export const SHEET_BG = "#1A1A1A";
export const HANDLE_COLOR = "#4A4A4A";
export const QUEUE_ROW_HEIGHT = 60;

export const s = StyleSheet.create({
  // Sheet
  sheetLayer: { zIndex: 999 },
  sheetBg: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetContent: {
    // BottomSheetView is absolutely positioned; flex alone does not bound it.
    height: "100%",
  },
  contentPage: { flex: 1, minHeight: 0 },
  hiddenPage: { opacity: 0 },

  // Handle area
  handleContainer: {
    paddingTop: 10,
    paddingBottom: 14,
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
  },
  queueHeader: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  handleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  handleTitleLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerControls: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 8,
    marginLeft: 12,
  },
  headerButton: {
    width: 60,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerButtonActive: {
    backgroundColor: "rgba(29,185,84,0.14)",
  },
  headerButtonLabel: {
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 12,
    fontFamily: "Inter_500Medium",
    maxWidth: 54,
  },
  headerButtonLabelActive: {
    color: Colors.primary,
  },
  handleTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    lineHeight: 26,
  },
  handleSubtitle: {
    color: "#8A8A8A",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // Now playing section
  nowPlayingWrap: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 2,
  },
  nowLabel: {
    color: "#8A8A8A",
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderRadius: 16,
    backgroundColor: "#252525",
  },
  nowArtwork: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#2A2A2A",
    flexShrink: 0,
  },
  nowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  nowTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  nowArtist: {
    color: "#B0B0B0",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 4,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(29,185,84,0.12)",
    borderWidth: 0,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  reorderHint: {
    color: "#8A8A8A",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },

  // Queue row
  rowLayer: {
    backgroundColor: SHEET_BG,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: QUEUE_ROW_HEIGHT,
    paddingHorizontal: 18,
    gap: 12,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
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
  artist: {
    color: "#8A8A8A",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 2,
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
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
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

});
