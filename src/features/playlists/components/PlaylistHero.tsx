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
import { safeGoBack } from "@/utils/navigation";
import { type Song } from "@/lib/musicData";
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

  const displayName = playlistName || `${collectionKind} Details`;

  return (
    <View style={[styles.hero, { paddingTop: topInset + 8 }]}>
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
          <Ionicons name="musical-notes" size={72} color="rgba(255,255,255,0.2)" />
        </View>
      )}

      {/* Gradient matching ArtistDetailScreen */}
      <LinearGradient
        colors={["transparent", "rgba(16,20,26,0.7)", Colors.background]}
        locations={[0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating Circular Back Button */}
      <Pressable
        style={[styles.heroBack, { top: topInset + 8 }]}
        onPress={safeGoBack}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </Pressable>

      {/* Hero Info */}
      <View style={styles.heroInfo}>
        {/* Kind badge / visibility */}
        <View style={styles.verifiedBadge}>
          <Ionicons name="musical-notes" size={14} color={Colors.primary} />
          <Text style={styles.verifiedText}>{collectionKind.toUpperCase()}</Text>
          {isFirestoreSource && (
            <View
              style={[
                styles.visibilityBadge,
                playlistIsPublic ? styles.visibilityBadgePublic : styles.visibilityBadgePrivate,
              ]}
            >
              <Ionicons
                name={playlistIsPublic ? "globe-outline" : "lock-closed-outline"}
                size={10}
                color={playlistIsPublic ? "#6C5CE7" : "#FF6B6B"}
              />
              <Text
                style={[
                  styles.visibilityBadgeText,
                  { color: playlistIsPublic ? "#6C5CE7" : "#FF6B6B" },
                ]}
              >
                {playlistIsPublic ? "Public" : "Private"}
              </Text>
            </View>
          )}
        </View>

        {/* Playlist / Album Name */}
        <Text style={styles.artistName} numberOfLines={2}>
          {displayName}
        </Text>

        {/* Description & Meta info */}
        {playlistDescription ? (
          <Text style={styles.followers} numberOfLines={2}>
            {playlistDescription}
          </Text>
        ) : (
          <Text style={styles.followers}>
            {effectiveSongCount} {effectiveSongCount === 1 ? "track" : "tracks"}
            {totalMinutes > 0 ? ` • ${totalMinutes} min` : ""}
          </Text>
        )}

        {/* Actions Row */}
        <View style={styles.heroActions}>
          {/* Play All button */}
          <Pressable
            style={styles.playAllBtn}
            onPress={onPlayAll}
            disabled={loading || songs.length === 0}
          >
            <Ionicons
              name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
              size={16}
              color="#000"
            />
            <Text style={styles.playAllText}>
              {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play"}
            </Text>
          </Pressable>

          {/* Shuffle icon-only circle button */}
          <Pressable
            style={styles.iconCircleBtn}
            onPress={onShufflePlay}
            disabled={loading || songs.length === 0}
          >
            <Ionicons name="shuffle" size={18} color="rgba(255,255,255,0.85)" />
          </Pressable>

          {/* Download button */}
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

          {/* Edit button */}
          {canEdit && (
            <Pressable style={styles.iconCircleBtn} onPress={onOpenEdit} hitSlop={8}>
              <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    height: 320,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroFallback: {
    backgroundColor: "#111820",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBack: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 6,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  verifiedText: {
    color: Colors.primary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  artistName: {
    color: "#fff",
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  followers: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  playAllText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  visibilityBadgePublic: {
    backgroundColor: "rgba(108, 92, 231, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(108, 92, 231, 0.4)",
  },
  visibilityBadgePrivate: {
    backgroundColor: "rgba(255, 107, 107, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.4)",
  },
  visibilityBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});
