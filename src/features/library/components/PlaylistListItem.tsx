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
  const trackCount = item.songs?.length || 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.playlistCard, pressed && styles.pressed]}
      android_ripple={{ color: "rgba(255, 255, 255, 0.06)" }}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      <View style={styles.playlistContent}>
        {item.coverUrl ? (
          <Image
            recyclingKey={item.id}
            source={{ uri: item.coverUrl }}
            style={styles.playlistCover}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.playlistCover, styles.playlistCoverPlaceholder]}>
            <Ionicons name="musical-notes" size={28} color={Colors.subtext} />
          </View>
        )}

        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.playlistMetaRow}>
            <Text style={styles.playlistMeta}>
              {trackCount} {trackCount === 1 ? "song" : "songs"}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  playlistCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  playlistContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },
  playlistCover: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
  },
  playlistCoverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  playlistName: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  playlistMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  playlistMeta: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
  },
});
