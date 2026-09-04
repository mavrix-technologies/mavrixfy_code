import React, { useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Pressable as GHPressable } from "react-native-gesture-handler";

import { formatDuration, type Song, getBestImageUrl } from "@/lib/musicData";
import { formatFollowers } from "@/utils/stringUtils";
import EqualizerBars from "@/components/EqualizerBars";
import { styles } from "../styles/playerScreenStyles";

export const QueueSongRow = memo(
  ({
    item,
    index,
    isCurrent,
    isShortScreen,
    active,
    onPress,
  }: {
    item: Song;
    index: number;
    isCurrent: boolean;
    isShortScreen: boolean;
    active: boolean;
    onPress: (item: Song) => void;
  }) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const rowStyle = useMemo(
      () => [
        styles.queueRow,
        isCurrent ? styles.queueRowActive : null,
        isShortScreen ? styles.queueRowCompact : null,
      ],
      [isCurrent, isShortScreen]
    );

    return (
      <GHPressable style={rowStyle} onPress={handlePress}>
        <View style={styles.queueLead}>
          {isCurrent ? (
            <EqualizerBars active={active} size={3} color="#F7FAFF" />
          ) : (
            <Text style={styles.queueIndex}>{index + 1}</Text>
          )}
        </View>

        <Image
          recyclingKey={item.id}
          source={{ uri: item.coverUrl || undefined }}
          style={isShortScreen ? styles.queueThumbCompact : styles.queueThumb}
          contentFit="cover"
          transition={120}
        />

        <View style={styles.queueTextWrap}>
          <Text
            style={isCurrent ? styles.queueTitleActive : styles.queueTitle}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={isCurrent ? styles.queueMetaActive : styles.queueMeta}
            numberOfLines={1}
          >
            {item.artist}
          </Text>
        </View>

        <Text style={isCurrent ? styles.queueDurationActive : styles.queueDuration}>
          {formatDuration(item.duration)}
        </Text>
      </GHPressable>
    );
  },
  (prev, next) => {
    if (!prev.isCurrent && !next.isCurrent) {
      return (
        prev.item.id === next.item.id &&
        prev.index === next.index &&
        prev.isShortScreen === next.isShortScreen &&
        prev.item.title === next.item.title &&
        prev.item.artist === next.item.artist
      );
    }
    return (
      prev.item.id === next.item.id &&
      prev.index === next.index &&
      prev.isCurrent === next.isCurrent &&
      prev.isShortScreen === next.isShortScreen &&
      prev.active === next.active &&
      prev.item.title === next.item.title &&
      prev.item.artist === next.item.artist
    );
  }
);

QueueSongRow.displayName = "QueueSongRow";

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
        <View style={styles.artistSpotifyCard}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.35)" />
        </View>
      </View>
    );
  }

  if (!artistDetails) return null;

  const imageUrl = artistDetails.image?.length ? getBestImageUrl(artistDetails.image) : "";
  const followerText = artistDetails.followerCount ? formatFollowers(artistDetails.followerCount) : "";
  const bioText = artistDetails.bio?.[0]?.text || "";
  const dominantType = artistDetails.dominantType || artistDetails.dominantLanguage || "";

  return (
    <View style={styles.artistCardContainer}>
      <View style={styles.artistSectionHeader}>
        <Text style={styles.artistSectionTitle}>About the Artist</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.artistSpotifyCard, pressed && { opacity: 0.88 }]}
        onPress={onPress}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.artistSpotifyBanner}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.artistSpotifyBanner, styles.artistSpotifyBannerFallback]}>
            <Ionicons name="person" size={40} color="rgba(255,255,255,0.2)" />
          </View>
        )}

        <View style={styles.artistSpotifyBody}>
          <View style={styles.artistSpotifyNameRow}>
            <View style={styles.artistSpotifyNameWrap}>
              <Text style={styles.artistSpotifyName} numberOfLines={1}>
                {artistDetails.name}
              </Text>
              {artistDetails.isVerified && (
                <Ionicons name="checkmark-circle" size={16} color="#1ED760" style={{ marginLeft: 5 }} />
              )}
            </View>
            <View style={styles.artistFollowBtn}>
              <Text style={styles.artistFollowBtnText}>Follow</Text>
            </View>
          </View>

          {followerText ? (
            <Text style={styles.artistSpotifyListeners}>
              {followerText} monthly listeners
            </Text>
          ) : null}

          {bioText ? (
            <Text style={styles.artistSpotifyBio} numberOfLines={3}>
              {bioText}
            </Text>
          ) : null}

          {dominantType ? (
            <Text style={styles.artistSpotifyTag}>{dominantType}</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

AboutArtistCard.displayName = "AboutArtistCard";

const RELATED_GRADIENT_COLORS = ["transparent", "rgba(0,0,0,0.75)"] as const;
const RELATED_GRADIENT_LOCATIONS = [0.4, 1] as const;

export const RelatedSongCard = memo(({ song, onPress }: { song: Song; onPress: (song: Song) => void }) => {
  const handlePress = useCallback(() => {
    onPress(song);
  }, [onPress, song]);

  const imageSource = useMemo(() => ({ uri: song.coverUrl || undefined }), [song.coverUrl]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.relatedVideoCard,
        pressed && styles.relatedVideoCardPressed,
      ]}
      onPress={handlePress}
    >
      <Image
        source={imageSource}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        transition={150}
      />
      <LinearGradient
        colors={RELATED_GRADIENT_COLORS}
        locations={RELATED_GRADIENT_LOCATIONS}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.relatedVideoCardInfo}>
        <Text style={styles.relatedVideoCardTitle} numberOfLines={2}>
          {song.title}
        </Text>
        <Text style={styles.relatedVideoCardArtist} numberOfLines={1}>
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
        snapToInterval={148}
        snapToAlignment="start"
      />
    </View>
  );
});

RelatedSongsSection.displayName = "RelatedSongsSection";
