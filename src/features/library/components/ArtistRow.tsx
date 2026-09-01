import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
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
      android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
      onPress={() => onPress(artist)}
    >
      <Image
        recyclingKey={artist.id}
        source={{ uri: artist.image || undefined }}
        style={styles.artistRowAvatar}
        contentFit="cover"
        transition={100}
        cachePolicy="memory-disk"
      />
      <View style={styles.artistRowInfo}>
        <Text style={styles.artistRowName} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text style={styles.artistRowSub}>Artist</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.subtext} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  pressed: {
    opacity: 0.85,
  },
  artistRowAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surfaceLight,
  },
  artistRowInfo: {
    flex: 1,
    gap: 2,
  },
  artistRowName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  artistRowSub: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
