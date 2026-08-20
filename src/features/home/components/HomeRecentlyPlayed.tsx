import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ImpactFeedbackStyle } from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import type { Song } from "@/lib/musicData";
import type { RecentlyPlayedItem } from "@/lib/storage";

const RECENT_CARD_WIDTH = 100;
const RECENT_CARD_GAP = 12;

const RecentCard = memo(function RecentCard({
  item,
  onPress,
}: {
  item: RecentlyPlayedItem;
  onPress: (item: RecentlyPlayedItem) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.recentCard,
        pressed && styles.recentCardPressed,
      ]}
      onPress={handlePress}
    >
      <Image
        source={{ uri: item.imageUrl || undefined }}
        style={styles.recentImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
      <Text style={styles.recentTitle} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.recentSubtitle} numberOfLines={1}>
        {item.type === "song" ? "Song" : "Playlist"}
      </Text>
    </Pressable>
  );
});

export const HomeRecentlyPlayed = memo(function HomeRecentlyPlayed({
  items,
  playSong,
}: {
  items: RecentlyPlayedItem[];
  playSong: (song: Song, queue?: Song[]) => void;
}) {
  const router = useRouter();

  const handleRecentPress = useCallback(
    (item: RecentlyPlayedItem) => {
      void triggerImpact(ImpactFeedbackStyle.Light);

      if (item.type === "song") {
        let song: Song | null = null;
        if (item.data && typeof item.data === "object" && item.data.id) {
          song = item.data as Song;
        } else {
          song = {
            id: item.id,
            title: item.name || "Unknown Song",
            artist: (item as any).artist || "Unknown Artist",
            coverUrl: item.imageUrl || "",
            audioUrl: (item as any).audioUrl || "",
            duration: (item as any).duration || 0,
            album: (item as any).album || "",
            genre: (item as any).genre || "",
          };
        }

        if (song?.id) {
          playSong(song, [song]);
          return;
        }
      }

      const isJioSaavn = item.type === "jiosaavn-playlist";
      router.push({
        pathname: "/playlist/[id]",
        params: {
          id: item.id,
          jiosaavn: String(isJioSaavn),
          album: "false",
          firestore: String(!isJioSaavn),
          title: item.name,
          cover: item.imageUrl || "",
        },
      });
    },
    [playSong, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: RecentlyPlayedItem }) => (
      <RecentCard item={item} onPress={handleRecentPress} />
    ),
    [handleRecentPress]
  );

  const keyExtractor = useCallback((item: RecentlyPlayedItem) => `recent-${item.id}-${item.type}`, []);
  const ItemSeparatorComponent = useCallback(() => <View style={{ width: RECENT_CARD_GAP }} />, []);
  const getItemLayout = useCallback(
    (_: ArrayLike<RecentlyPlayedItem> | null | undefined, index: number) => ({
      length: RECENT_CARD_WIDTH + RECENT_CARD_GAP,
      offset: (RECENT_CARD_WIDTH + RECENT_CARD_GAP) * index,
      index,
    }),
    []
  );

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recently Played</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={ItemSeparatorComponent}
        getItemLayout={getItemLayout}
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  recentCard: {
    width: RECENT_CARD_WIDTH,
  },
  recentCardPressed: {
    opacity: 0.8,
  },
  recentImage: {
    width: RECENT_CARD_WIDTH,
    height: RECENT_CARD_WIDTH,
    borderRadius: 8,
    backgroundColor: "#161B22",
  },
  recentTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginTop: 6,
  },
  recentSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
});
