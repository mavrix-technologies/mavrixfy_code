import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type ShareSheetData } from "@/utils/shareSheet";
import { styles } from "./shareModalStyles";

export interface PosterCardProps {
  data: ShareSheetData;
  selectedBgColor: string;
  cardColorOptions: string[];
  onSelectColor: (color: string) => void;
}

export const SpotifyPosterCard = memo(function SpotifyPosterCard({
  data,
  selectedBgColor,
  cardColorOptions,
  onSelectColor,
}: PosterCardProps) {
  const typeLabel =
    data.type === "playlist"
      ? "PLAYLIST"
      : data.type === "artist"
      ? "ARTIST"
      : data.type === "mix"
      ? "ARTIST MIX"
      : "TRACK";

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.cardOuterShadow}>
        <LinearGradient
          colors={[selectedBgColor, "#080A0E"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.spotifyPosterCard}
        >
          {/* Top Brand & Category Header */}
          <View style={styles.posterTopHeader}>
            <View style={styles.posterHeaderBrand}>
              <Image
                source={require("@/assets/images/mavrixfy_transparent_master.png")}
                style={styles.posterHeaderLogo}
                contentFit="contain"
              />
              <Text style={styles.posterHeaderBrandText}>MAVRIXFY</Text>
            </View>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{typeLabel}</Text>
            </View>
          </View>

          {/* High-Resolution Artwork Frame */}
          <View style={styles.posterArtFrame}>
            {data.imageUrl ? (
              <Image
                source={{ uri: data.imageUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.cardFallbackImage]}>
                <Ionicons name="musical-notes" size={48} color="rgba(255,255,255,0.3)" />
              </View>
            )}
          </View>

          {/* Title & Artist */}
          <View style={styles.posterInfo}>
            <Text style={styles.posterTitle} numberOfLines={1}>
              {data.title}
            </Text>
            <Text style={styles.posterSubtitle} numberOfLines={1}>
              {data.subtitle || "Song"}
            </Text>

            {/* Bottom Footer Bar with Soundwaves & Mavrixfy Wordmark */}
            <View style={styles.posterFooterBar}>
              <View style={styles.soundwaves}>
                <View style={[styles.waveBar, { height: 8 }]} />
                <View style={[styles.waveBar, { height: 16 }]} />
                <View style={[styles.waveBar, { height: 10 }]} />
                <View style={[styles.waveBar, { height: 18 }]} />
                <View style={[styles.waveBar, { height: 12 }]} />
                <View style={[styles.waveBar, { height: 7 }]} />
              </View>

              <View style={styles.footerBrandRight}>
                <Image
                  source={require("@/assets/images/mavrixfy_transparent_master.png")}
                  style={styles.footerBrandLogo}
                  contentFit="contain"
                />
                <Text style={styles.footerBrandName}>Mavrixfy</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Palette Swatches */}
      <View style={styles.paletteSwatchesRow}>
        {cardColorOptions.map((color) => {
          const isSelected = selectedBgColor === color;
          return (
            <Pressable
              key={`palette-${color}`}
              style={({ pressed }) => [
                styles.swatchWrap,
                isSelected && styles.swatchWrapSelected,
                pressed && styles.swatchPressed,
              ]}
              onPress={() => onSelectColor(color)}
            >
              <View style={[styles.swatchDot, { backgroundColor: color }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});
