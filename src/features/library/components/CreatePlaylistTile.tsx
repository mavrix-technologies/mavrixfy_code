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
      style={({ pressed }) => [styles.gridCard, styles.createGridCard, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
      onPress={onPress}
    >
      <View style={[styles.gridImageWrap, styles.createGridArtwork]}>
        <View style={styles.createGridIconWrap}>
          <Ionicons name="add" size={24} color={Colors.text} />
        </View>
      </View>
      <View style={styles.gridInfo}>
        <Text style={styles.gridName} numberOfLines={1}>
          Add New
        </Text>
        <Text style={styles.gridMeta} numberOfLines={1}>
          Create playlist
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  gridCard: {
    width: "46.5%",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "transparent",
    marginBottom: 14,
  },
  createGridCard: {
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.85,
  },
  gridImageWrap: {
    width: "100%",
    aspectRatio: 0.88,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.surfaceLight,
    position: "relative",
  },
  createGridArtwork: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.cardBorderStrong,
  },
  createGridIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  gridInfo: {
    paddingHorizontal: 2,
    paddingTop: 6,
    paddingBottom: 2,
  },
  gridName: {
    color: Colors.text,
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
  },
  gridMeta: {
    color: Colors.subtext,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
