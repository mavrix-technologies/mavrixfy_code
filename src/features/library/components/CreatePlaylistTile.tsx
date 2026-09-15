import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface CreatePlaylistTileProps {
  onPress: () => void;
}

export const CreatePlaylistTile = memo(function CreatePlaylistTile({
  onPress,
}: CreatePlaylistTileProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.06)" }}
      onPress={onPress}
    >
      <View style={styles.cardContainer}>
        <View style={styles.createCoverWrapper}>
          <View style={styles.plusIconCircle}>
            <Ionicons name="add" size={32} color={Colors.primary} />
          </View>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.playlistTitle}>Create Playlist</Text>
          <Text style={styles.playlistSubtitle}>Add new playlist</Text>
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
  createCoverWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(38, 225, 154, 0.3)",
  },
  plusIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(38, 225, 154, 0.15)",
    alignItems: "center",
    justifyContent: "center",
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
