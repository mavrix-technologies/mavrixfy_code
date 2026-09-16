import React, { memo, useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getBestImageUrl } from "@/lib/musicData";
import type { ArtistCard } from "@/data/providers/ArtistProvider";

export interface ArtistProfileCardProps {
  artist: ArtistCard;
  cardWidth: number;
  isSelected?: boolean;
  selectMode?: boolean;
  onPress: (artist: ArtistCard) => void;
  onLongPress?: (artist: ArtistCard) => void;
}

export const ArtistProfileCard = memo(function ArtistProfileCard({
  artist,
  cardWidth,
  isSelected = false,
  selectMode = false,
  onPress,
  onLongPress,
}: ArtistProfileCardProps) {
  const handlePress = useCallback(() => {
    onPress(artist);
  }, [artist, onPress]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      onLongPress(artist);
    }
  }, [artist, onLongPress]);

  const imageUrl = artist.image?.length ? getBestImageUrl(artist.image) : "";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { width: cardWidth },
        pressed && styles.cardPressed,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={300}
    >
      <View style={[styles.avatarWrap, { width: cardWidth, height: cardWidth }]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={`artist-grid-${artist.id}`}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.avatarFallback]}>
            <Ionicons name="person" size={cardWidth * 0.38} color="rgba(255,255,255,0.25)" />
          </View>
        )}

        {/* Outer subtle ring border */}
        <View style={styles.avatarRing} />

        {/* Selection State Overlays */}
        {isSelected ? (
          <>
            <View style={styles.selectedOverlay}>
              <View style={styles.checkBadge}>
                <Ionicons name="checkmark" size={16} color="#000000" />
              </View>
            </View>
            <View style={styles.selectedBorder} />
          </>
        ) : selectMode ? (
          <View style={styles.dimOverlay}>
            <View style={styles.unselectedBadge} />
          </View>
        ) : null}

        {/* Verified Badge */}
        {artist.isVerified && !selectMode && (
          <View style={styles.verifiedDot}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
          </View>
        )}
      </View>

      <Text
        style={[
          styles.cardName,
          isSelected && { color: Colors.primary },
        ]}
        numberOfLines={2}
      >
        {artist.name}
      </Text>

      <Text style={styles.cardSub} numberOfLines={1}>
        {artist.dominantLanguage ? artist.dominantLanguage : "Artist"}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: 6,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  avatarWrap: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#16181F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  avatarRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C1E26",
    borderRadius: 999,
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: 999,
    alignItems: "flex-end",
    padding: 6,
  },
  unselectedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.6)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  selectedBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: Colors.primary,
  },
  verifiedDot: {
    position: "absolute",
    bottom: 3,
    right: 3,
    backgroundColor: "#0D0E11",
    borderRadius: 999,
    padding: 1,
  },
  cardName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 17,
    marginTop: 2,
  },
  cardSub: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    textTransform: "capitalize",
    marginTop: -2,
  },
});
