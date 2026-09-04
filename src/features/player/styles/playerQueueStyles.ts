import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const playerQueueStyles = StyleSheet.create({
  queueListContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 24,
  },
  queueListViewport: {
    flexGrow: 0,
  },

  playingListHeader: {
    height: 44,
    paddingHorizontal: 16,
    paddingTop: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playingListHeaderCompact: {
    height: 38,
  },
  playingListHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 72,
    gap: 8,
  },
  playingListTitle: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    opacity: 0.7,
  },

  playingListCount: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },

  queueRow: {
    height: 54,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(223,226,235,0.09)",
  },
  queueRowActive: {
    backgroundColor: "rgba(223,226,235,0.055)",
    borderBottomColor: "transparent",
  },
  queueRowCompact: {
    height: 48,
    gap: 8,
  },
  queueLead: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  queueIndex: {
    color: Colors.inactive,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  queueThumb: {
    width: 38,
    height: 38,
    borderRadius: 7,
    backgroundColor: Colors.surfaceLight,
  },
  queueThumbCompact: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
  },
  queueTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  queueTitleActive: {
    color: "#F7FAFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  queueMeta: {
    marginTop: 1,
    color: "rgba(223,226,235,0.58)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  queueMetaActive: {
    marginTop: 1,
    color: "rgba(223,226,235,0.75)",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  queueDuration: {
    color: "rgba(223,226,235,0.5)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    width: 34,
    textAlign: "right",
  },
  queueDurationActive: {
    color: "rgba(223,226,235,0.8)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    width: 34,
    textAlign: "right",
  },
});
