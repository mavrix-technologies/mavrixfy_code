import Colors from "@/constants/colors";
import { StyleSheet } from "react-native";

export const DOWNLOADS_UI = {
  bg: Colors.background,
  card: "#181c22",
  cardHover: "#20242b",
  border: "rgba(255, 255, 255, 0.08)",
  text: "#FFFFFF",
  subtext: "#8e99a8",
  lowSurface: "#181c22",
  highSurface: "#22262E",
  primaryA: "#26e19a",
  primaryB: "#00b87b",
  error: "#ff5449",
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DOWNLOADS_UI.bg,
  },
  mainWrap: {
    flex: 1,
  },
  headerRightContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  stickyPlayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: DOWNLOADS_UI.primaryA,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyPlayButtonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DOWNLOADS_UI.lowSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  searchPlaceholderText: {
    color: DOWNLOADS_UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginLeft: 8,
  },
  songListSpacer: {
    height: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: DOWNLOADS_UI.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtitle: {
    color: DOWNLOADS_UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  browseBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: DOWNLOADS_UI.primaryA,
  },
  browseBtnText: {
    color: "#042115",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  searchModeContainer: {
    flex: 1,
    backgroundColor: DOWNLOADS_UI.bg,
  },
  searchModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  searchModeInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DOWNLOADS_UI.lowSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  searchModeInput: {
    flex: 1,
    color: DOWNLOADS_UI.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginLeft: 8,
    paddingVertical: 0,
  },
  searchModeCancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  searchModeCancelText: {
    color: DOWNLOADS_UI.subtext,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  searchModeListContent: {
    paddingTop: 8,
    paddingBottom: 120,
  },
  searchModeEmptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  searchModeEmptyTitle: {
    color: DOWNLOADS_UI.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  searchModeEmptySubtitle: {
    color: DOWNLOADS_UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
