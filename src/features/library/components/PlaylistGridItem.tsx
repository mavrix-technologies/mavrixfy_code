import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { type DisplayPlaylist } from "./PlaylistListItem";

interface PlaylistGridItemProps {
  item: DisplayPlaylist;
  onPress: (playlist: DisplayPlaylist) => void;
  onLongPress: (playlist: DisplayPlaylist) => void;
}

export const PlaylistGridItem = memo(function PlaylistGridItem({
  item,
  onPress,
  onLongPress,
}: PlaylistGridItemProps) {
  const trackCount = item.songs?.length || 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.06)" }}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      <View style={styles.cardContainer}>
        {item.coverUrl ? (
          <View style={styles.coverWrapper}>
            <Image
              recyclingKey={item.id}
              source={{ uri: item.coverUrl }}
              style={styles.coverImage}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
            <View style={styles.playIconCircle}>
              <Ionicons name="play" size={18} color="#000000" />
            </View>
          </View>
        ) : (
          <View style={[styles.coverWrapper, styles.coverPlaceholder]}>
            <Ionicons name="musical-notes" size={32} color={Colors.subtext} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.playlistTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.playlistSubtitle} numberOfLines={1}>
            {trackCount} {trackCount === 1 ? "song" : "songs"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  gridCard: {
    width: "48%",
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  cardContainer: {
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 12,
  },
  coverWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    position: "relative",
    marginBottom: 10,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  playIconCircle: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  cardInfo: {
    gap: 2,
  },
  playlistTitle: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.2,
    fontFamily: "Inter_600SemiBold",
  },
  playlistSubtitle: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
  },
});
