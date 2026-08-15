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
import { getBestImageUrl } from "@/lib/musicData";
import type { ArtistCard } from "@/data/providers/ArtistProvider";

const ArtistItem = memo(function ArtistItem({
  artist,
  onPress,
}: {
  artist: ArtistCard;
  onPress: (artist: ArtistCard) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(artist);
  }, [artist, onPress]);

  const imageUrl = getBestImageUrl(artist.image);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.artistCard,
        pressed && styles.artistCardPressed,
      ]}
      onPress={handlePress}
    >
      <Image
        source={{ uri: imageUrl || undefined }}
        style={styles.artistImage}
        contentFit="cover"
        transition={150}
      />
      <Text style={styles.artistName} numberOfLines={1}>
        {artist.name}
      </Text>
      <Text style={styles.artistRole} numberOfLines={1}>
        Artist
      </Text>
    </Pressable>
  );
});

export const HomeArtistsSection = memo(function HomeArtistsSection({
  artists,
}: {
  artists: ArtistCard[];
}) {
  const router = useRouter();

  const handleArtistPress = useCallback(
    (artist: ArtistCard) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      const imageUrl = getBestImageUrl(artist.image);
      router.push({
        pathname: "/artist/[id]",
        params: {
          id: artist.id,
          name: artist.name,
          image: imageUrl || "",
        },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: ArtistCard }) => (
      <ArtistItem artist={item} onPress={handleArtistPress} />
    ),
    [handleArtistPress]
  );

  const keyExtractor = useCallback((item: ArtistCard) => `artist-${item.id}`, []);
  const ItemSeparatorComponent = useCallback(() => <View style={{ width: 14 }} />, []);

  if (artists.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Featured Artists</Text>
      </View>

      <FlatList
        data={artists}
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
  artistCard: {
    width: 104,
    alignItems: "center",
  },
  artistCardPressed: {
    opacity: 0.8,
  },
  artistImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#161B22",
  },
  artistName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginTop: 8,
    textAlign: "center",
  },
  artistRole: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
    textAlign: "center",
  },
});
