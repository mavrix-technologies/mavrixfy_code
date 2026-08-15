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
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import type { JioSaavnImage } from "@/lib/musicData";

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

  const imageUrl = item.imageUrl || (Array.isArray(item.image) && item.image.length > 0 ? item.image[item.image.length - 1]?.url || item.image[0]?.url : undefined);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={handlePress}
    >
      <Image
        source={{ uri: imageUrl || undefined }}
        style={styles.cardImage}
        contentFit="cover"
        transition={150}
      />
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.name}
      </Text>
      {item.subtitle ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      ) : item.songCount ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {item.songCount} songs
        </Text>
      ) : null}
    </Pressable>
  );
});

export const HomeHorizontalSection = memo(function HomeHorizontalSection({
  title,
  items,
  isAlbum = false,
  isFirestore = false,
}: {
  title: string;
  items: HomeCardItem[];
  isAlbum?: boolean;
  isFirestore?: boolean;
}) {
  const router = useRouter();

  const handleCardPress = useCallback(
    (item: HomeCardItem) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      const imageUrl = item.imageUrl || (Array.isArray(item.image) && item.image.length > 0 ? item.image[item.image.length - 1]?.url || item.image[0]?.url : "");

      router.push({
        pathname: "/playlist/[id]",
        params: {
          id: item.id,
          jiosaavn: String(!isFirestore),
          album: String(isAlbum || item.type === "album"),
          firestore: String(isFirestore || item.source === "firestore"),
          title: item.name,
          cover: imageUrl || "",
          link: item.url || "",
          songCount: String(item.songCount ?? 0),
        },
      });
    },
    [isAlbum, isFirestore, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: HomeCardItem }) => (
      <HorizontalCard item={item} onPress={handleCardPress} />
    ),
    [handleCardPress]
  );

  const keyExtractor = useCallback((item: HomeCardItem) => `sec-${item.id}`, []);
  const ItemSeparatorComponent = useCallback(() => <View style={styles.separator} />, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={ItemSeparatorComponent}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  separator: {
    width: 14,
  },
  container: {
    marginVertical: 14,
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
    width: 148,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardImage: {
    width: 148,
    height: 148,
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
