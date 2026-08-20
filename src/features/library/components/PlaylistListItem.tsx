import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { UserPlaylist } from "@/lib/storage";

export type DisplayPlaylist = UserPlaylist & { isFirestore?: boolean };

interface PlaylistListItemProps {
  item: DisplayPlaylist;
  onPress: (playlist: DisplayPlaylist) => void;
  onLongPress: (playlist: DisplayPlaylist) => void;
}

export const PlaylistListItem = memo(function PlaylistListItem({
  item,
  onPress,
  onLongPress,
}: PlaylistListItemProps) {
  const subtitle =
    item.description?.trim() ||
    `${item.songs?.length || 0} track${(item.songs?.length || 0) === 1 ? "" : "s"}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.playlistCard, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      {item.coverUrl ? (
        <Image
          recyclingKey={item.id}
          source={{ uri: item.coverUrl }}
          style={styles.playlistCover}
          contentFit="cover"
          transition={100}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.playlistCover, styles.playlistCoverPlaceholder]}>
          <Ionicons name="musical-notes" size={22} color={Colors.subtext} />
        </View>
      )}

      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.playlistMeta} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={Colors.subtext}
        style={styles.playlistActionIcon}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  playlistCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.85,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  playlistCover: {
    width: 60,
    height: 60,
    borderRadius: 9,
    backgroundColor: Colors.surfaceLight,
  },
  playlistCoverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 10,
  },
  playlistName: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
  },
  playlistMeta: {
    marginTop: 3,
    color: Colors.subtext,
    fontSize: 11.5,
    lineHeight: 14,
    fontFamily: "Inter_400Regular",
  },
  playlistActionIcon: {
    marginLeft: 8,
    marginRight: 2,
    opacity: 0.8,
  },
});
