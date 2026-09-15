import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { type FollowedArtist } from "@/lib/followedArtists";

interface ArtistRowProps {
  artist: FollowedArtist;
  onPress: (artist: FollowedArtist) => void;
}

export const ArtistRow = memo(function ArtistRow({ artist, onPress }: ArtistRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.artistRow, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.06)" }}
      onPress={() => onPress(artist)}
    >
      <Image
        recyclingKey={artist.id}
        source={{ uri: artist.image || undefined }}
        style={styles.artistAvatar}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
      <View style={styles.artistInfo}>
        <Text style={styles.artistName} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text style={styles.artistLabel}>Artist</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  artistAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceLight,
  },
  artistInfo: {
    flex: 1,
    marginLeft: 14,
  },
  artistName: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
    fontFamily: "Inter_600SemiBold",
  },
  artistLabel: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 16,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
});
