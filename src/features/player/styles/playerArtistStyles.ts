import { StyleSheet } from "react-native";

export const playerArtistStyles = StyleSheet.create({
  artistCardContainer: {
    marginTop: 24,
    marginBottom: 4,
  },
  artistSectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  artistSectionTitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },

  artistProfileCard: {
    marginHorizontal: 16,
    minHeight: 100,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  artistProfilePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  artistAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.10)",
    flexShrink: 0,
  },
  artistAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  artistProfileBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4,
  },
  artistProfileName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  artistProfileBio: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  artistProfileSubtext: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  artistViewLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  artistViewLinkText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  artistLoadingText: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  relatedSongsContainer: {
    marginTop: 26,
    marginBottom: 40,
  },
  relatedCardsScroll: {
    paddingHorizontal: 16,
    gap: 16,
    paddingBottom: 4,
  },
  relatedSongCard: {
    width: 154,
    height: 218,
    borderRadius: 14,
  },
  relatedSongArtwork: {
    width: 154,
    height: 154,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  relatedSongCardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  relatedSongInfo: {
    paddingTop: 9,
    paddingHorizontal: 2,
  },
  relatedSongTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 17,
  },
  relatedSongArtist: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
