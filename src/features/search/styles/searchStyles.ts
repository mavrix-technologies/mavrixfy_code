import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Search entry ────────────────────────────────────────────────────────────
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.15)",
  } as any,


  searchBarPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  searchIcon: {
    marginRight: 9,
  },
  inactiveSearchText: {
    flex: 1,
    minWidth: 0,
    color: "#64748B",
    fontSize: 14.5,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.1,
  },
  rightSearchGroup: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 6,
  },
  searchDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(0, 0, 0, 0.12)",
    marginRight: 10,
  },

  searchCancelButton: {
    minHeight: 40,
    minWidth: 58,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  searchCancelButtonPressed: {
    opacity: 0.72,
  },
  searchCancelText: {
    color: "#F8FBF9",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },

  // ── Scroll / shared ─────────────────────────────────────────────────────────
  scrollView: { flex: 1 },
  content: {},

  // ── Recent searches ─────────────────────────────────────────────────────────
  recentSection: {
    paddingBottom: 24,
  },
  recentTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 14,
  },
  recentRowPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  recentThumb: {
    width: 56,
    height: 56,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  recentThumbRound: { borderRadius: 28 },
  recentThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  recentInfo: { flex: 1, gap: 3 },
  recentLabel: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  recentSubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  recentActionBtn: { padding: 8 },
  recentEmpty: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  recentEmptyText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },

  // ── Browse All ───────────────────────────────────────────────────────────────
  browseSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  browseTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 14,
  },
  browseGridList: {
    gap: 8,
  },
  browseGridRow: {
    gap: 8,
  },
  browseCard: {
    width: "48%",
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    padding: 12,
    justifyContent: "flex-end",
  },
  browseCardPressed: { opacity: 0.85 },
  browseCardTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  browseCardImage: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 64,
    height: 64,
    borderRadius: 6,
    transform: [{ rotate: "25deg" }],
  },

  // ── Results ──────────────────────────────────────────────────────────────────
  resultsWrap: { flex: 1 },
  filterRow: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  filterRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  resultsContent: { paddingTop: 8 },

  // ── Top Result Card ────────────────────────────────────────────────────────
  topResultSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
    marginTop: 4,
  },
  topResultSectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 10,
  },
  topResultCard: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  topResultCardPressed: {
    opacity: 0.85,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  topResultImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  topResultImageRound: {
    borderRadius: 32,
  },
  topResultInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  topResultTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  topResultMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topResultBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  topResultBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  topResultSubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  topResultPlayButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#26e19a",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
  } as any,

  sectionBlock: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sectionActionText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  // ── Artist results ─────────────────────────────────────────────────────────
  artistListContentContainer: {
    paddingTop: 6,
    paddingBottom: 8,
  },
  artistSectionList: {
    marginHorizontal: -16,
  },
  artistResultRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 13,
  },
  artistResultImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
  },
  artistResultImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  artistResultInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  artistResultName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  artistResultMeta: {
    color: Colors.subtext,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },

  // ── Playlist grid ────────────────────────────────────────────────────────────
  playlistGridContentContainer: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  playlistGridRow: {
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  playlistGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  playlistGridItemWrap: {
    width: "48.5%",
    marginBottom: 16,
  },
  playlistGridCard: {
    width: "100%",
    backgroundColor: "transparent",
  },
  playlistClassicCardPressed: { opacity: 0.8 },
  playlistGridImageWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  playlistGridImage: { width: "100%", height: "100%" },
  brandCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: Colors.background,
  },
  brandCoverBadgeImage: { width: "100%", height: "100%" },
  playlistGridContent: { marginTop: 8 },
  playlistGridName: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
  },
  playlistGridMeta: {
    marginTop: 3,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // ── States ───────────────────────────────────────────────────────────────────
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtext: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  emptyInline: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyInlineText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  // ── Suggestions Dropdown ─────────────────────────────────────────────────────
  suggestionsDropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    maxHeight: 360,
    backgroundColor: "rgba(18, 22, 28, 0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    zIndex: 999,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  suggestionRowPressed: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  suggestionIcon: {
    marginRight: 14,
    opacity: 0.6,
  },
  suggestionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
