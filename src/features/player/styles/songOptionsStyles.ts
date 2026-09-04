import { StyleSheet } from "react-native";
import { IS_ANDROID } from "@/constants/platform";
import Colors from "@/constants/colors";

export const SHEET_BACKGROUND = "#1E1E1E";
export const HANDLE_COLOR = "#6D6D6D";

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: IS_ANDROID ? "transparent" : SHEET_BACKGROUND,
    justifyContent: IS_ANDROID ? "flex-end" : "flex-start",
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sheet: {
    ...(IS_ANDROID
      ? {
          height: "75%",
          maxHeight: "85%",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }
      : {
          flex: 1,
        }),
    overflow: "hidden",
    backgroundColor: SHEET_BACKGROUND,
  },

  // Grabber used by SheetWrap (sub-views)
  grabberRow: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  // Container that fills remaining space after grabber in SheetWrap
  subViewContainer: {
    flex: 1,
    minHeight: 0,
  },

  // Grabber used inline in main header
  headerContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: HANDLE_COLOR,
  },
  songHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  artwork: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: "#2A2A2A",
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  songText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  songTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  songSubtitle: {
    marginTop: 2,
    color: "#BDBDBD",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  menu: {
    flex: 1,
    minHeight: 0,
  },
  menuContent: {
    paddingTop: 8,
    paddingHorizontal: 18,
  },
  menuRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
  },
  rowPressed: {
    opacity: 0.62,
  },
  menuIcon: {
    width: 32,
    marginRight: 14,
  },
  menuText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },

  // ── Sub-views ──────────────────────────────────────────────────────────────
  subView: {
    flex: 1,
    minHeight: 0,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 4,
  },
  subHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },

  // Add to playlist
  playlistListContent: {
    paddingTop: 6,
    paddingHorizontal: 16,
  },
  playlistFooter: {
    width: 1,
  },
  playlistList: {
    flex: 1,
    minHeight: 0,
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  playlistThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 14,
    backgroundColor: "#2A2A2A",
  },
  playlistThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  playlistInfo: {
    flex: 1,
    minWidth: 0,
  },
  playlistName: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  playlistCount: {
    color: "#888",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  // Go to artists
  artistIcon: {
    width: 32,
    marginRight: 14,
    alignItems: "center",
  },

  // Song credits
  creditRow: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  creditLabel: {
    color: "#888",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  creditValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  // Mavrixfy Code
  codeBox: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  codeTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  codeId: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    letterSpacing: 0.4,
  },
  codeHint: {
    color: "#666",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // Centered / empty states
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyMsg: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  emptyHint: {
    color: "#888",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  closeButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  closeButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
