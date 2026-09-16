import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface ArtistMixHeroProps {
  ids: string[];
  names: string[];
  images: string[];
  title: string;
  songsCount: number;
  totalDurationMin: string;
  isPlayingFromMix: boolean;
  isPlaying: boolean;
  onShuffle: () => void;
  onPlayAll: () => void;
}

export const ArtistMixHero = memo(function ArtistMixHero({
  ids,
  names,
  images,
  title,
  songsCount,
  totalDurationMin,
  isPlayingFromMix,
  isPlaying,
  onShuffle,
  onPlayAll,
}: ArtistMixHeroProps) {
  return (
    <View style={styles.heroSection}>
      {/* Overlapping Artist Avatars */}
      <View style={styles.avatarRow}>
        {ids.map((id, i) => (
          <View
            key={id}
            style={[
              styles.avatarWrap,
              i > 0 && { marginLeft: -28 },
            ]}
          >
            <Image
              recyclingKey={`mix-art-${id}`}
              source={{ uri: images[i] || undefined }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </View>
        ))}
      </View>

      {/* Artist Name Badges */}
      {names.length > 0 && (
        <View style={styles.artistBadgesRow}>
          {names.map((name) => (
            <View key={name} style={styles.artistBadge}>
              <Text style={styles.artistBadgeText} numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Title & Metadata */}
      <Text style={styles.mixTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.mixMeta}>
        {songsCount} Tracks • {totalDurationMin}
      </Text>

      {/* Minimal 2-Button Action Bar */}
      {songsCount > 0 && (
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.shuffleBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={onShuffle}
          >
            <Ionicons name="shuffle" size={18} color="#FFFFFF" />
            <Text style={styles.shuffleBtnText}>Shuffle</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.playBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={onPlayAll}
          >
            <Ionicons
              name={isPlayingFromMix && isPlaying ? "pause" : "play"}
              size={18}
              color="#000000"
            />
            <Text style={styles.playBtnText}>
              {isPlayingFromMix && isPlaying ? "Pause" : "Play All"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  heroSection: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 24,
  },
  avatarRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3.5,
    borderColor: "#0D0E11",
    overflow: "hidden",
    backgroundColor: "#1C1E26",
  },

  artistBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  artistBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  artistBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  mixTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
    letterSpacing: -0.4,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  mixMeta: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginBottom: 20,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    paddingHorizontal: 4,
  },
  shuffleBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shuffleBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  playBtn: {
    flex: 1.2,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  playBtnText: {
    color: "#000000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
