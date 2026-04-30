import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ListRenderItem,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { usePlayer } from "@/contexts/PlayerContext";
import { Song } from "@/lib/musicData";

type QueueItem = {
  type: "header" | "now-playing" | "up-next-header" | "song" | "empty";
  song?: Song;
  index?: number;
};

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { queue, queueIndex, currentSong, playSong, removeFromQueue } = usePlayer();

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const handleSongPress = useCallback((song: Song) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSong(song, queue);
  }, [playSong, queue]);

  const handleRemove = useCallback((index: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeFromQueue(index);
  }, [removeFromQueue]);

  const upNext = queue.slice(queueIndex + 1);

  // Build flat data structure for FlatList
  const data: QueueItem[] = [];
  
  if (currentSong) {
    data.push({ type: "now-playing", song: currentSong });
  }
  
  if (upNext.length > 0) {
    data.push({ type: "up-next-header" });
    upNext.forEach((song, idx) => {
      data.push({ type: "song", song, index: queueIndex + 1 + idx });
    });
  } else if (!currentSong) {
    data.push({ type: "empty" });
  }

  const renderItem: ListRenderItem<QueueItem> = useCallback(({ item }) => {
    if (item.type === "now-playing" && item.song) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Now Playing</Text>
          <Pressable
            style={styles.songRow}
            onPress={() => router.push("/player")}
          >
            <Image
              recyclingKey={item.song.id}
              source={{ uri: item.song.coverUrl }}
              style={styles.songImage}
              contentFit="cover"
            />
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {item.song.title}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {item.song.artist}
              </Text>
            </View>
            <Ionicons name="musical-notes" size={20} color={Colors.primary} />
          </Pressable>
        </View>
      );
    }

    if (item.type === "up-next-header") {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Up Next ({upNext.length})</Text>
        </View>
      );
    }

    if (item.type === "song" && item.song && typeof item.index === "number") {
      return (
        <Pressable
          style={[styles.songRow, styles.songRowPadded]}
          onPress={() => handleSongPress(item.song!)}
        >
          <Image
            recyclingKey={item.song.id}
            source={{ uri: item.song.coverUrl }}
            style={styles.songImage}
            contentFit="cover"
          />
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>
              {item.song.title}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {item.song.artist}
            </Text>
          </View>
          <Pressable
            onPress={() => handleRemove(item.index!)}
            hitSlop={10}
            style={styles.removeBtn}
          >
            <Ionicons name="close-circle" size={24} color={Colors.subtext} />
          </Pressable>
        </Pressable>
      );
    }

    if (item.type === "empty") {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={64} color={Colors.inactive} />
          <Text style={styles.emptyText}>Queue is empty</Text>
          <Text style={styles.emptySubtext}>
            Add songs to your queue to see them here
          </Text>
        </View>
      );
    }

    return null;
  }, [handleSongPress, handleRemove, upNext.length]);

  const keyExtractor = useCallback((item: QueueItem, index: number) => {
    if (item.type === "song" && item.song) {
      return `song-${item.song.id}-${item.index}`;
    }
    return `${item.type}-${index}`;
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#2a2a2a", "#1a1a1a", Colors.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.gradientHeader, { paddingTop: topInset }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerSideSlot}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={28} color={Colors.text} />
            </Pressable>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Queue
          </Text>
          <View style={styles.headerSideSlot} />
        </View>
      </LinearGradient>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={21}
        initialNumToRender={15}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradientHeader: {
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerSideSlot: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  songRowPadded: {
    paddingHorizontal: 16,
  },
  songImage: {
    width: 48,
    height: 48,
    borderRadius: 4,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  songArtist: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
