import { homeDisplayText } from "./homeDisplayText";
import { triggerImpact } from "@/lib/haptics";
import type { JioSaavnImage } from "@/lib/musicData";
import * as Haptics from "expo-haptics";
import { MusicArtwork } from "@/components/MusicArtwork";
import { getBestImageUrl } from "@/lib/musicData";
import { useRouter } from "expo-router";
import { memo,useCallback } from "react";
import {
FlatList,
Pressable,
StyleSheet,
Text,
View,
useWindowDimensions,
} from "react-native";

const CARD_WIDTH = 148;
const CARD_GAP = 14;

export interface HomeCardItem {
  id: string;
  name: string;
  imageUrl?: string;
  image?: JioSaavnImage[];
  subtitle?: string;
  songCount?: number;
  type?: string;
  source?: string;
  url?: string;
}

const HorizontalCard = memo(function HorizontalCard({
  item,
  onPress,
}: {
  item: HomeCardItem;
  onPress: (item: HomeCardItem) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  const imageUrl = item.imageUrl || getBestImageUrl(item.image || []);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={handlePress}
    >
      <MusicArtwork
        uri={imageUrl}
        size={CARD_WIDTH}
        recyclingKey={item.id}
        style={styles.cardImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
      <Text style={styles.cardTitle} numberOfLines={1}>
        {homeDisplayText(item.name, "Playlist")}
      </Text>
      {item.subtitle ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {homeDisplayText(item.subtitle, "Playlist")}
        </Text>
      ) : item.songCount && item.songCount > 0 ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {item.songCount} {item.songCount === 1 ? "song" : "songs"}
        </Text>
      ) : (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {item.type === "album" ? "Album" : item.type === "song" ? "Song" : "Playlist"}
        </Text>
      )}
    </Pressable>
  );
});

export const HomeHorizontalSection = memo(function HomeHorizontalSection({
  title,
  items,
  isAlbum = false,
  isFirestore = false,
  onItemPress,
  onSongPress,
}: {
  title: string;
  items: HomeCardItem[];
  isAlbum?: boolean;
  isFirestore?: boolean;
  onItemPress?: (item: HomeCardItem) => void;
  onSongPress?: (item: HomeCardItem) => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const handleCardPress = useCallback(
    (item: HomeCardItem) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      if (onItemPress) { onItemPress(item); return; }
      const imageUrl = item.imageUrl || getBestImageUrl(item.image || []);
      const isSong = item.type === "song" || Boolean(item.url?.includes("/song/"));
      if (isSong && onSongPress) { onSongPress(item); return; }
      const isAlbumItem = isAlbum || item.type === "album" || Boolean(item.url?.includes("/album/"));

      router.push({
        pathname: "/playlist/[id]",
        params: {
          id: item.id,
          jiosaavn: String(!isFirestore && item.source !== "youtube"),
          youtube: String(item.source === "youtube"),
          album: String(isAlbumItem),
          song: String(isSong),
          type: item.type || (isSong ? "song" : isAlbumItem ? "album" : "playlist"),
          firestore: String(isFirestore || item.source === "firestore"),
          title: item.name,
          cover: imageUrl || "",
          link: item.url || "",
          songCount: String(item.songCount ?? 0),
        },
      });
    },
    [isAlbum, isFirestore, router, onItemPress, onSongPress]
  );

  const renderItem = useCallback(
    ({ item }: { item: HomeCardItem }) => (
      <HorizontalCard item={item} onPress={handleCardPress} />
    ),
    [handleCardPress]
  );

  const keyExtractor = useCallback((item: HomeCardItem) => `sec-${item.id}`, []);
  const ItemSeparatorComponent = useCallback(() => <View style={styles.separator} />, []);
  const getItemLayout = useCallback(
    (_: ArrayLike<HomeCardItem> | null | undefined, index: number) => ({
      length: CARD_WIDTH + CARD_GAP,
      offset: (CARD_WIDTH + CARD_GAP) * index,
      index,
    }),
    []
  );

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{homeDisplayText(title)}</Text>
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
        initialNumToRender={Math.max(1, Math.ceil(width / (CARD_WIDTH + CARD_GAP)))}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
      />
    </View>
  );
});

const styles = StyleSheet.create({
  separator: {
    width: CARD_GAP,
  },
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
  card: {
    width: CARD_WIDTH,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardImage: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 10,
    backgroundColor: "#161B22",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginTop: 8,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
});
