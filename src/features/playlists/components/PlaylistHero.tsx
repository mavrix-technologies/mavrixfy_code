import React from "react";
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
  playlistTitleSize: number;
  effectiveSongCount: number;
  totalMinutes: number;
  totalDurationLabel: string;
  stateFlags: PlaylistHeroStateFlags;
  songs: Song[];
  downloadCollectionId: string;
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
  playlistTitleSize,
  effectiveSongCount,
  totalMinutes,
  stateFlags,
  songs,
  downloadCollectionId,
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
  const displayName = playlistName || `${collectionKind} Details`;
  const heroHeight = Math.max(340, topInset + 280);

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
        colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.15)", "transparent"]}
        locations={[0, 0.45, 1]}
        style={styles.topVignette}
      />

      {/* Ambient Artwork Color Glow */}
      {palette?.accent ? (
        <LinearGradient
          pointerEvents="none"
          colors={[
            colorWithAlpha(palette.accent, 0.28),
            colorWithAlpha(palette.accent, 0.08),
            "transparent",
          ]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.85 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Deep bottom fade seamlessly merging into screen background */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          "transparent",
          "rgba(16,20,26,0.45)",
          "rgba(16,20,26,0.85)",
          Colors.background,
        ]}
        locations={[0.15, 0.5, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Hero Content Section */}
      <View style={styles.heroInfo}>
        {/* Kind badge & Visibility */}
        <View style={styles.badgeRow}>
          <View style={styles.kindBadge}>
            <Ionicons name="musical-notes" size={12} color={Colors.primary} />
            <Text style={styles.kindBadgeText}>{collectionKind.toUpperCase()}</Text>
          </View>

          {isFirestoreSource && (
            <View
              style={[
                styles.visibilityBadge,
                playlistIsPublic ? styles.visibilityBadgePublic : styles.visibilityBadgePrivate,
              ]}
            >
              <Ionicons
                name={playlistIsPublic ? "globe-outline" : "lock-closed-outline"}
                size={11}
                color={playlistIsPublic ? "#8A7CF8" : "#FF6B6B"}
              />
              <Text
                style={[
                  styles.visibilityBadgeText,
                  { color: playlistIsPublic ? "#8A7CF8" : "#FF6B6B" },
                ]}
              >
                {playlistIsPublic ? "Public" : "Private"}
              </Text>
            </View>
          )}
        </View>

        {/* Dynamic Responsive Title */}
        <Text
          style={[
            styles.playlistTitle,
            {
              fontSize: playlistTitleSize,
              lineHeight: Math.round(playlistTitleSize * 1.15),
            },
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

        {/* Track Count & Duration Meta Line (Always visible) */}
        <View style={styles.metaRow}>
          <Ionicons name="disc-outline" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={styles.metaText}>
            {effectiveSongCount} {effectiveSongCount === 1 ? "track" : "tracks"}
            {totalMinutes > 0 ? ` • ${totalMinutes} min` : ""}
          </Text>
        </View>

        {/* Action Controls Row */}
        <View style={styles.heroActions}>
          {/* Play / Pause Pill Button */}
          <Pressable
            style={({ pressed }) => [
              styles.playAllBtn,
              pressed && styles.playAllBtnPressed,
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
              size={17}
              color="#000000"
              style={
                !isPlayingFromThisPlaylist || !isPlaying
                  ? { marginLeft: 1 }
                  : undefined
              }
            />
            <Text style={styles.playAllText}>
              {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play"}
            </Text>
          </Pressable>

          {/* Shuffle Icon Button */}
          <Pressable
            style={({ pressed }) => [
              styles.iconCircleBtn,
              pressed && styles.iconCircleBtnPressed,
            ]}
            onPress={onShufflePlay}
            disabled={loading || songs.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Shuffle playlist"
            hitSlop={6}
          >
            <Ionicons name="shuffle" size={19} color="#FFFFFF" />
          </Pressable>

          {/* Download Collection Button */}
          {songs.length > 0 && (
            <DownloadCollectionButton
              collectionId={downloadCollectionId}
              collectionName={displayName}
              collectionImage={playlistCover}
              collectionType={collectionKindLower as "playlist" | "album"}
              songs={songs}
              compact
            />
          )}

          {/* Edit Playlist Button */}
          {canEdit && (
            <Pressable
              style={({ pressed }) => [
                styles.iconCircleBtn,
                pressed && styles.iconCircleBtnPressed,
              ]}
              onPress={onOpenEdit}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Edit playlist"
            >
              <Ionicons name="pencil" size={16} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    justifyContent: "flex-end",
    overflow: "hidden",
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
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 7,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kindBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(38, 225, 154, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(38, 225, 154, 0.28)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kindBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  visibilityBadgePublic: {
    backgroundColor: "rgba(108, 92, 231, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(108, 92, 231, 0.4)",
  },
  visibilityBadgePrivate: {
    backgroundColor: "rgba(255, 107, 107, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.4)",
  },
  visibilityBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  playlistTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
    marginTop: 2,
  },
  description: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  metaText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 22,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  playAllBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  playAllText: {
    color: "#000000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  iconCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
