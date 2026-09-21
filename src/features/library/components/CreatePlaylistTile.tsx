import React, { memo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";

interface CreatePlaylistTileProps {
  onPress: () => void;
}

export const CreatePlaylistTile = memo(function CreatePlaylistTile({
  onPress,
}: CreatePlaylistTileProps) {
  const handlePress = useCallback(() => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.06)" }}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Create playlist"
    >
      <View style={styles.cardContainer}>
        <View style={styles.createCoverWrapper}>
          <Ionicons name="add" size={36} color="#F8FBF9" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.playlistTitle} numberOfLines={1}>Create Playlist</Text>
          <Text style={styles.playlistSubtitle} numberOfLines={1}>Tap to add</Text>
        </View>
      </View>
    </Pressable>
  );
});

export const CreatePlaylistListItem = memo(function CreatePlaylistListItem({
  onPress,
}: CreatePlaylistTileProps) {
  const handlePress = useCallback(() => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      style={({ pressed }) => [styles.listCard, pressed && styles.listPressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.06)" }}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Create playlist"
    >
      <View style={styles.listContent}>
        <View style={styles.listCover}>
          <Ionicons name="add" size={28} color="#F8FBF9" />
        </View>
        <View style={styles.listInfo}>
          <Text style={styles.listTitle} numberOfLines={1}>
            Create Playlist
          </Text>
          <Text style={styles.listSubtitle} numberOfLines={1}>
            Tap to add
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
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  cardContainer: {
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 12,
  },
  createCoverWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#181C22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
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
  listCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
  listPressed: {
    opacity: 0.72,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  listContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },
  listCover: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#181C22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  listInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
    gap: 4,
  },
  listTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    letterSpacing: -0.2,
  },
  listSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
  },
});
