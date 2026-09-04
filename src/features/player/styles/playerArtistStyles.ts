import { StyleSheet } from "react-native";

export const playerArtistStyles = StyleSheet.create({
  artistCardContainer: {
    marginTop: 28,
    marginBottom: 8,
  },
  artistSectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  artistSectionTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },

  // ── Spotify-style artist card ──────────────────────────────────────────────
  artistSpotifyCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1A1E27",
  },
  artistSpotifyBanner: {
    width: "100%",
    height: 180,
  },
  artistSpotifyBannerFallback: {
    backgroundColor: "#1E2330",
    alignItems: "center",
    justifyContent: "center",
  },
  artistSpotifyBody: {
    padding: 16,
    paddingTop: 14,
  },
  artistSpotifyNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 5,
  },
  artistSpotifyNameWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  artistSpotifyName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    flexShrink: 1,
  },
  artistFollowBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  artistFollowBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  artistSpotifyListeners: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 10,
  },
  artistSpotifyBio: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 8,
  },
  artistSpotifyTag: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
    marginTop: 4,
  },

  // ── You Might Also Like ── horizontal video cards ──────────────────────────
  relatedSongsContainer: {
    marginTop: 28,
    marginBottom: 48,
  },
  relatedCardsScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  relatedVideoCard: {
    width: 140,
    height: 190,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1A1E27",
  },
  relatedVideoCardPressed: {
    opacity: 0.82,
  },
  relatedVideoCardInfo: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    paddingBottom: 11,
  },
  relatedVideoCardTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 17,
  },
  relatedVideoCardArtist: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
