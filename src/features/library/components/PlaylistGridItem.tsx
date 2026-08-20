import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { DisplayPlaylist } from "./PlaylistListItem";

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
  const subtitle = item.description?.trim() || "Playlist • Mavrixfy";

  return (
    <Pressable
      style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      {item.coverUrl ? (
        <View style={styles.gridImageWrap}>
          <Image
            recyclingKey={item.id}
            source={{ uri: item.coverUrl }}
            style={styles.gridImage}
            contentFit="cover"
            transition={100}
            cachePolicy="memory-disk"
          />
          <View style={styles.gridFloatingPlay}>
            <Ionicons name="play" size={13} color={Colors.black} />
          </View>
        </View>
      ) : (
        <View style={[styles.gridImageWrap, styles.gridPlaceholder]}>
          <Ionicons name="musical-notes" size={24} color={Colors.subtext} />
        </View>
      )}
      <View style={styles.gridInfo}>
        <Text style={styles.gridName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.gridMeta} numberOfLines={1}>
          {subtitle}
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
  pressed: {
    opacity: 0.85,
  },
  gridImageWrap: {
    width: "100%",
    aspectRatio: 0.88,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    position: "relative",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  gridFloatingPlay: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
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
