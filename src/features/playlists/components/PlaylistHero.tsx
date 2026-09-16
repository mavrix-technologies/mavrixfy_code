import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { type Song } from "@/lib/musicData";
import { useArtworkPalette, colorWithAlpha } from "@/lib/colorExtractor";
import DownloadCollectionButton from "@/components/DownloadCollectionButton";

export interface PlaylistHeroStateFlags {
  isFirestoreSource: boolean;
  playlistIsPublic: boolean;
  canEdit: boolean;
  loading: boolean;
  isPlayingFromThisPlaylist: boolean;
  isPlaying: boolean;
}

interface PlaylistHeroProps {
  topInset: number;
  playlistCover: string;
  playlistName: string;
  playlistDescription: string;
  collectionKind: string;
  collectionKindLower: string;
  effectiveSongCount: number;
  totalMinutes: number;
  stateFlags: PlaylistHeroStateFlags;
  songs: Song[];
  downloadCollectionId: string;
  backgroundColor?: string;
  onOpenEdit: () => void;
  onPlayAll: () => void;
  onShufflePlay: () => void;
}

export const PlaylistHero: React.FC<PlaylistHeroProps> = ({
  topInset,
  playlistCover,
  playlistName,
  playlistDescription,
  collectionKind,
  collectionKindLower,
  effectiveSongCount,
  totalMinutes,
  stateFlags,
  songs,
  downloadCollectionId,
  backgroundColor,
  onOpenEdit,
  onPlayAll,
  onShufflePlay,
}) => {
  const {
    isFirestoreSource,
    playlistIsPublic,
    canEdit,
    loading,
    isPlayingFromThisPlaylist,
    isPlaying,
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
        <Image
          source={{ uri: playlistCover }}
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

        {/* Optional Description */}
        {playlistDescription ? (
          <Text style={styles.description} numberOfLines={2}>
            {playlistDescription}
          </Text>
        ) : null}

        {/* ── Signature 3-Button Action Row (Shuffle, Play, Download/Edit) ── */}
        <View style={styles.heroActions}>
          {/* Left: Shuffle Button */}
          <Pressable
            style={({ pressed }) => [
              styles.appleMusicCircleBtn,
              pressed && styles.circleBtnPressed,
            ]}
            onPress={onShufflePlay}
            disabled={loading || songs.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Shuffle playlist"
          >
            <Ionicons name="shuffle" size={18} color="#FFFFFF" />
          </Pressable>

          {/* Center: Prominent White Play Button */}
          <Pressable
            style={({ pressed }) => [
              styles.appleMusicMainPlayBtn,
              pressed && styles.mainPlayBtnPressed,
            ]}
            onPress={onPlayAll}
            disabled={loading || songs.length === 0}
            accessibilityRole="button"
            accessibilityLabel={
              isPlayingFromThisPlaylist && isPlaying
                ? "Pause playlist"
                : "Play playlist"
            }
          >
            <Ionicons
              name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
              size={23}
              color="#000000"
              style={
                !isPlayingFromThisPlaylist || !isPlaying
                  ? { marginLeft: 2 }
                  : undefined
              }
            />
          </Pressable>

          {/* Right: Download Collection or Edit Button */}
          {songs.length > 0 ? (
            <View style={styles.appleMusicCircleBtn}>
              <DownloadCollectionButton
                collectionId={downloadCollectionId}
                collectionName={displayName}
                collectionImage={playlistCover}
                collectionType={collectionKindLower as "playlist" | "album"}
                songs={songs}
                compact
              />
            </View>
          ) : canEdit ? (
            <Pressable
              style={({ pressed }) => [
                styles.appleMusicCircleBtn,
                pressed && styles.circleBtnPressed,
              ]}
              onPress={onOpenEdit}
              accessibilityRole="button"
              accessibilityLabel="Edit playlist"
            >
              <Ionicons name="pencil" size={16} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={{ width: 38, height: 38 }} />
          )}
        </View>
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
  description: {
    color: "rgba(255, 255, 255, 0.68)",
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 24,
  },

  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 6,
  },
  appleMusicCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
  appleMusicMainPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.35)",
  },
  mainPlayBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
});
