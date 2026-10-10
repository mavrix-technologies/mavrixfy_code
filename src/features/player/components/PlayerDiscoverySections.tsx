import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { MusicArtwork } from "@/components/MusicArtwork";
import { memo,useCallback } from "react";
import {
ActivityIndicator,
FlatList,
Pressable,
Text,
View,
} from "react-native";

import { getBestImageUrl,type Song } from "@/lib/musicData";
import { styles } from "../styles/playerScreenStyles";

export const AboutArtistCard = memo(({
  artistDetails,
  loading,
  onPress,
}: {
  artistDetails: any;
  loading: boolean;
  onPress: () => void;
}) => {
  if (loading) {
    return (
      <View style={styles.artistCardContainer}>
        <View style={styles.artistSectionHeader}>
          <Text style={styles.artistSectionTitle}>About the Artist</Text>
        </View>
        <View style={styles.artistProfileCard}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.35)" />
          <Text style={styles.artistLoadingText}>Loading artist</Text>
        </View>
      </View>
    );
  }

  if (!artistDetails) return null;

  const imageUrl = artistDetails.image?.length ? getBestImageUrl(artistDetails.image) : "";
  const bioText = artistDetails.bio?.[0]?.text || "";

  return (
    <View style={styles.artistCardContainer}>
      <View style={styles.artistSectionHeader}>
        <Text style={styles.artistSectionTitle}>About the Artist</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.artistProfileCard, pressed && styles.artistProfilePressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`View ${artistDetails.name}`}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.artistAvatar}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={[styles.artistAvatar, styles.artistAvatarFallback]}>
            <Ionicons name="person" size={28} color="rgba(255,255,255,0.5)" />
          </View>
        )}

        <View style={styles.artistProfileBody}>
          <Text style={styles.artistProfileName} numberOfLines={1}>
            {artistDetails.name}
          </Text>
          {bioText ? (
            <Text style={styles.artistProfileBio} numberOfLines={2}>
              {bioText}
            </Text>
          ) : (
            <Text style={styles.artistProfileSubtext} numberOfLines={1}>Artist profile</Text>
          )}
          <View style={styles.artistViewLink}>
            <Text style={styles.artistViewLinkText}>View artist</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.78)" />
          </View>
        </View>
      </Pressable>
    </View>
  );
});

AboutArtistCard.displayName = "AboutArtistCard";

const RELATED_CARD_SNAP_INTERVAL = 170;

export const RelatedSongCard = memo(({ song, onPress }: { song: Song; onPress: (song: Song) => void }) => {
  const handlePress = useCallback(() => {
    onPress(song);
  }, [onPress, song]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.relatedSongCard,
        pressed && styles.relatedSongCardPressed,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${song.title} by ${song.artist}`}
    >
      <MusicArtwork
        uri={song.coverUrl}
        size={154}
        recyclingKey={song.id}
        style={styles.relatedSongArtwork}
        contentFit="cover"
        transition={0}
      />
      <View style={styles.relatedSongInfo}>
        <Text style={styles.relatedSongTitle} numberOfLines={2}>
          {song.title}
        </Text>
        <Text style={styles.relatedSongArtist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
    </Pressable>
  );
});

RelatedSongCard.displayName = "RelatedSongCard";

export const RelatedSongsSection = memo(({
  songs,
  onSongPress,
}: {
  songs: Song[];
  onSongPress: (song: Song) => void;
}) => {
  const renderItem = useCallback(
    ({ item }: { item: Song }) => (
      <RelatedSongCard song={item} onPress={onSongPress} />
    ),
    [onSongPress]
  );

  if (songs.length === 0) return null;

  return (
    <View style={styles.relatedSongsContainer}>
      <View style={styles.artistSectionHeader}>
        <Text style={styles.artistSectionTitle}>You Might Also Like</Text>
      </View>
      <FlatList
        data={songs}
        keyExtractor={(song) => song.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.relatedCardsScroll}
        decelerationRate="fast"
        snapToInterval={RELATED_CARD_SNAP_INTERVAL}
        snapToAlignment="start"
      />
    </View>
  );
});

RelatedSongsSection.displayName = "RelatedSongsSection";
