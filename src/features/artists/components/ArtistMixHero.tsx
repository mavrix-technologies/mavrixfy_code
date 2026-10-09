import { displayArtworkUrl } from "@/lib/artworkDisplay";
import Colors from "@/constants/colors";
import { CollectionActionRow } from "@/components/CollectionActionRow";
import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet,Text,View } from "react-native";

export interface ArtistMixHeroProps {
  ids: string[];
  names: string[];
  images: string[];
  title: string;
  songsCount: number;
  totalDurationMin: string;
  isPlayingFromMix: boolean;
  isPlaying: boolean;
  backgroundColor?: string;
  onShuffle: () => void;
  onPlayAll: () => void;
  onLike: () => void;
  isLiked: boolean;
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
  backgroundColor,
  onShuffle,
  onPlayAll,
  onLike,
  isLiked,
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
              { borderColor: backgroundColor || Colors.background },
              i > 0 && { marginLeft: -28 },
            ]}
          >
            <Image
              recyclingKey={`mix-art-${id}`}
              source={{ uri: displayArtworkUrl(images[i], 96) || undefined }}
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

      {/* Shared Shuffle / Play / Like actions */}
      <CollectionActionRow
        onShuffle={onShuffle}
        onPlay={onPlayAll}
        onLike={onLike}
        isPlaying={isPlayingFromMix && isPlaying}
        isLiked={isLiked}
        disabled={songsCount === 0}
        playLabel="Play"
        likedLabel="mix"
      />

    </View>
  );
});

const styles = StyleSheet.create({
  heroSection: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 18,
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
    borderColor: Colors.background,
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
    marginBottom: 12,
  },

});
