import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },

  // ── Hero ──
  heroContainer: {
    height: 460,
    justifyContent: "flex-end",
    position: "relative",
  },
  heroInfoSection: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 6,
  },
  appleMusicArtistName: {
    color: "#FFFFFF",
    fontSize: 42,
    fontFamily: "Anton_400Regular",
    letterSpacing: 0.8,
    lineHeight: 48,
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 8,
    textAlign: "center",
    textTransform: "uppercase",
    includeFontPadding: false,
    textShadowColor: "rgba(0, 0, 0, 0.85)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },

  // ── Apple Music 3-Button Action Row ──
  appleMusicActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginTop: 6,
  },
  appleMusicCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  appleMusicCircleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  appleMusicMainPlayBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.35)",
  },

  // ── Featured "Latest Release" Glass Card ──
  latestReleaseCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 20,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    gap: 14,
  },
  latestReleaseThumb: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  latestReleaseMeta: {
    flex: 1,
    gap: 3,
  },
  latestReleaseDate: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
  },
  latestReleaseTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  latestReleaseCount: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  latestReleaseAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Section Headers ──
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitleLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  carouselSectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  section: {
    paddingTop: 24,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
    paddingHorizontal: 16,
    fontFamily: "Inter_400Regular",
  },
  carouselContentPadding: {
    paddingHorizontal: 16,
    gap: 14,
  },

  // ── Albums Carousel ──
  albumCard: {
    width: 136,
    gap: 6,
  },
  albumCover: {
    width: 136,
    height: 136,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  albumName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  albumYear: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },

  // ── Similar Artists Carousel ──
  similarCard: {
    width: 96,
    alignItems: "center",
    gap: 8,
  },
  similarAvatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  similarName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },

  loadMoreBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Top Floating Navigation Bar (Native iOS Style) ──
  floatingNavContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 90,
  },


  // ── Sticky Header ──
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.12)",
    zIndex: 95,
  },
  stickyBackBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  stickyPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stickyRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stickyMoreBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Bio Bottom Sheet Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#161B22",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 16,
    maxHeight: "80%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignSelf: "center",
    marginBottom: 8,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  modalAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  modalHeaderTextGroup: {
    flex: 1,
    gap: 2,
  },
  modalArtistName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  modalFollowers: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  modalBioText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14.5,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
  },
  modalCloseBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
