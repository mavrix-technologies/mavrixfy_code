import { CollectionActionRow } from "@/components/CollectionActionRow";
import Colors from "@/constants/colors";
import { colorWithAlpha,useArtworkPalette } from "@/lib/colorExtractor";
import { type Song } from "@/lib/musicData";
import { Ionicons } from "@expo/vector-icons";
import { MusicArtwork } from "@/components/MusicArtwork";
import { LinearGradient } from "expo-linear-gradient";
import React,{ useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

export interface PlaylistHeroStateFlags {
  isFirestoreSource: boolean;
  playlistIsPublic: boolean;
  loading: boolean;
  isPlayingFromThisPlaylist: boolean;
  isPlaying: boolean;
  isLiked: boolean;
}

interface PlaylistHeroProps {
  topInset: number;
  playlistCover: string;
  playlistName: string;
  collectionKind: string;
  effectiveSongCount: number;
  totalMinutes: number;
  stateFlags: PlaylistHeroStateFlags;
  songs: Song[];
  backgroundColor?: string;
  onPlayAll: () => void;
  onShufflePlay: () => void;
  onLike: () => void;
}

export const PlaylistHero: React.FC<PlaylistHeroProps> = ({
  topInset,
  playlistCover,
  playlistName,
  collectionKind,
  effectiveSongCount,
  totalMinutes,
  stateFlags,
  songs,
  backgroundColor,
  onPlayAll,
  onShufflePlay,
  onLike,
}) => {
  const {
    isFirestoreSource,
    playlistIsPublic,
    loading,
    isPlayingFromThisPlaylist,
    isPlaying,
    isLiked,
  } = stateFlags;

  const palette = useArtworkPalette(playlistCover);
  const bg = backgroundColor || palette?.background || Colors.background;
  const displayName = playlistName || `${collectionKind} Details`;
  const heroHeight = Math.max(450, topInset + 370);

  const titleFontSize = useMemo(() => {
    const len = displayName.trim().length;
    if (len <= 16) return 30;
    if (len <= 30) return 25;
    return 21;
  }, [displayName]);

  const titleLineHeight = useMemo(() => {
    return Math.round(titleFontSize * 1.18);
  }, [titleFontSize]);

  return (
    <View style={[styles.hero, { height: heroHeight, paddingTop: topInset + 48 }]}>
      {/* Artwork Background Image or Fallback */}
      {playlistCover ? (
        <MusicArtwork
          uri={playlistCover}
          size={heroHeight}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          recyclingKey={playlistCover}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
          <Ionicons name="musical-notes" size={76} color="rgba(255,255,255,0.18)" />
        </View>
      )}

      {/* Top vignette for clean status bar and top navigation contrast */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.32)", "transparent"]}
        locations={[0, 1]}
        style={styles.topVignette}
      />

      {/* Deep bottom fade seamlessly merging into screen background */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(0,0,0,0.28)",
          "transparent",
          "transparent",
          colorWithAlpha(bg, 0.38),
          colorWithAlpha(bg, 0.88),
          bg,
        ]}
        locations={[0, 0.25, 0.56, 0.8, 0.93, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Hero Content Section */}
      <View style={styles.heroInfo}>
        {/* Kind / Visibility Capsule */}
        <View style={styles.kindCapsule}>
          <Ionicons name="disc" size={10} color="rgba(255,255,255,0.75)" />
          <Text style={styles.kindCapsuleText}>
            {isFirestoreSource
              ? playlistIsPublic
                ? "PUBLIC PLAYLIST"
                : "PRIVATE PLAYLIST"
              : collectionKind.toUpperCase()}
          </Text>
        </View>

        {/* Dynamic Responsive Title */}
        <Text
          style={[
            styles.playlistTitle,
            { fontSize: titleFontSize, lineHeight: titleLineHeight },
          ]}
          numberOfLines={2}
        >
          {displayName}
        </Text>

        <CollectionActionRow
          onShuffle={onShufflePlay}
          onPlay={onPlayAll}
          onLike={onLike}
          isPlaying={isPlayingFromThisPlaylist && isPlaying}
          isLiked={isLiked}
          disabled={loading || songs.length === 0}
          playLabel="Play"
          likedLabel="playlist"
        />

      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    justifyContent: "flex-end",
    position: "relative",
  },
  heroFallback: {
    backgroundColor: "#121720",
    alignItems: "center",
    justifyContent: "center",
  },
  topVignette: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  heroInfo: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 4,
  },
  kindCapsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
    marginBottom: 2,
  },
  kindCapsuleText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.7,
  },
  playlistTitle: {
    color: "#FFFFFF",
    fontFamily: "Anton_400Regular",
    letterSpacing: 0.6,
    paddingHorizontal: 8,
    textAlign: "center",
    textTransform: "uppercase",
    includeFontPadding: false,
    textShadowColor: "rgba(0, 0, 0, 0.85)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
