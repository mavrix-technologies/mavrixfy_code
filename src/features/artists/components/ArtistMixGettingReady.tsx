import React, { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Colors from "@/constants/colors";

export interface ArtistMixGettingReadyProps {
  loadingArtists: { id: string; image: string; isStacked: boolean }[];
  loadedCount: number;
  totalCount: number;
  names: string[];
}

export const ArtistMixGettingReady = memo(function ArtistMixGettingReady({
  loadingArtists,
  loadedCount,
  totalCount,
  names,
}: ArtistMixGettingReadyProps) {
  return (
    <View style={styles.gettingReadyContainer}>
      <View style={styles.gettingReadyAvatars}>
        {loadingArtists.map((artist) => (
          <View
            key={`loading-avatar-${artist.id}`}
            style={[
              styles.loadingAvatarWrap,
              artist.isStacked && { marginLeft: -24 },
            ]}
          >
            <Image
              source={{ uri: artist.image || undefined }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </View>
        ))}
      </View>

      <View style={styles.gettingReadySpinnerWrap}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.gettingReadyText}>
          Crafting your mix… ({loadedCount}/{totalCount})
        </Text>
      </View>

      <Text style={styles.gettingReadySubtext}>
        Blending top tracks from {names.slice(0, 2).join(", ")}
        {names.length > 2 ? ` and ${names.length - 2} more` : ""}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  gettingReadyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  gettingReadyAvatars: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  loadingAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#0D0E11",
    overflow: "hidden",
    backgroundColor: "#1C1E26",
  },
  gettingReadySpinnerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  gettingReadyText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  gettingReadySubtext: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 280,
  },
});
