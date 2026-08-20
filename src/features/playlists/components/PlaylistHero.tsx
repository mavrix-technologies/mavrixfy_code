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
import { Song } from "@/lib/musicData";
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
  totalDurationLabel,
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

  return (
    <View style={styles.hero}>
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

      <LinearGradient
        colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.5)", "#0B0F14"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Pressable style={[styles.heroBack, { top: topInset + 10 }]} onPress={safeGoBack} hitSlop={8}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </Pressable>

      {canEdit && (
        <Pressable style={[styles.heroEdit, { top: topInset + 10 }]} onPress={onOpenEdit} hitSlop={8}>
          <Ionicons name="pencil" size={18} color="#fff" />
        </Pressable>
      )}

      <View style={styles.heroInfo}>
        <View style={styles.heroKindRow}>
          <Text style={styles.heroKind}>{collectionKind.toUpperCase()}</Text>
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

        <Text style={[styles.heroTitle, { fontSize: playlistTitleSize }]} numberOfLines={2}>
          {playlistName || `${collectionKind} Details`}
        </Text>

        {playlistDescription ? (
          <Text style={styles.heroSub} numberOfLines={2}>
            {playlistDescription}
          </Text>
        ) : null}

        <Text style={styles.heroMeta}>
          {effectiveSongCount} songs
          {totalMinutes > 0 ? ` • ${totalMinutes} min` : ""}
          {totalDurationLabel ? ` (${totalDurationLabel})` : ""}
        </Text>

        <View style={styles.heroActions}>
          <Pressable style={styles.playBtn} onPress={onPlayAll} disabled={loading || songs.length === 0}>
            <Ionicons
              name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
              size={20}
              color="#000"
            />
            <Text style={styles.playBtnText}>
              {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play"}
            </Text>
          </Pressable>

          <Pressable style={styles.shuffleBtn} onPress={onShufflePlay} disabled={loading || songs.length === 0}>
            <Ionicons name="shuffle" size={18} color={Colors.text} />
            <Text style={styles.shuffleBtnText}>Shuffle</Text>
          </Pressable>

          {songs.length > 0 && (
            <DownloadCollectionButton
              collectionId={downloadCollectionId}
              collectionName={playlistName || `${collectionKind} Tracks`}
              collectionImage={playlistCover}
              collectionType={collectionKindLower as "playlist" | "album"}
              songs={songs}
              compact
            />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    height: 340,
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
  heroEdit: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroKindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  heroKind: {
    color: Colors.primary,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "Inter_800ExtraBold",
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  shuffleBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: Colors.primary,
  },
  playBtnText: {
    color: "#000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  visibilityBadgePublic: {
    backgroundColor: "rgba(108, 92, 231, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(108, 92, 231, 0.5)",
  },
  visibilityBadgePrivate: {
    backgroundColor: "rgba(255, 107, 107, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.5)",
  },
  visibilityBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
