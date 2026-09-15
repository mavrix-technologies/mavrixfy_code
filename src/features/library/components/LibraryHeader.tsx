import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { type FollowedArtist } from "@/lib/followedArtists";
import { ArtistRow } from "./ArtistRow";

export type Filter = "playlists" | "artists" | "favorite" | null;
export type ViewMode = "list" | "grid";

interface LibraryHeaderProps {
  topPadding: number;
  filter: Filter;
  viewMode: ViewMode;
  likedSongCount: number;
  followedArtists: FollowedArtist[];
  onSelectFilter: (filter: Filter) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onOpenLikedSongs: () => void;
  onOpenArtist: (artist: FollowedArtist) => void;
  onBrowseArtists: () => void;
}

export const LibraryHeader = memo(function LibraryHeader({
  topPadding,
  filter,
  viewMode,
  likedSongCount,
  followedArtists,
  onSelectFilter,
  onChangeViewMode,
  onOpenLikedSongs,
  onOpenArtist,
  onBrowseArtists,
}: LibraryHeaderProps) {
  const showArtistsSection = filter === null || filter === "artists";

  return (
    <View style={[styles.headerBlock, { paddingTop: topPadding }]}>
      {/* Minimalist View Mode Toggle */}
      <View style={styles.controlsRow}>
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.toggleBtn, viewMode === "list" && styles.toggleBtnActive]}
            onPress={() => onChangeViewMode("list")}
          >
            <Ionicons
              name="list"
              size={18}
              color={viewMode === "list" ? Colors.primary : Colors.subtext}
            />
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, viewMode === "grid" && styles.toggleBtnActive]}
            onPress={() => onChangeViewMode("grid")}
          >
            <Ionicons
              name="grid"
              size={18}
              color={viewMode === "grid" ? Colors.primary : Colors.subtext}
            />
          </Pressable>
        </View>
      </View>

      {/* Elegant Liked Songs Card */}
      <Pressable
        style={styles.likedCard}
        android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}
        onPress={onOpenLikedSongs}
      >
        <LinearGradient
          colors={["#26E19A", "#1AB57F"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.likedGradient}
        >
          <View style={styles.likedContent}>
            <View style={styles.likedIconCircle}>
              <Ionicons name="heart" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.likedTextSection}>
              <Text style={styles.likedTitle}>Liked Songs</Text>
              <Text style={styles.likedSubtitle}>{likedSongCount.toLocaleString()} songs</Text>
            </View>
          </View>
          <View style={styles.likedPlayBtn}>
            <Ionicons name="play" size={20} color="#000000" />
          </View>
        </LinearGradient>
      </Pressable>

      {/* Followed Artists Section - Minimalist */}
      {showArtistsSection && followedArtists.length > 0 ? (
        <View style={styles.artistsSection}>
          <Text style={styles.sectionTitle}>Following</Text>
          {followedArtists.map((artist) => (
            <ArtistRow key={artist.id} artist={artist} onPress={onOpenArtist} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  controlsRow: {
    marginTop: 8,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnActive: {
    backgroundColor: "rgba(38, 225, 154, 0.15)",
  },
  likedCard: {
    borderRadius: 20,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  likedGradient: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  likedContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  likedIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  likedTextSection: {
    flex: 1,
  },
  likedTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    fontFamily: "Inter_700Bold",
  },
  likedSubtitle: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13,
    lineHeight: 16,
    marginTop: 2,
    fontFamily: "Inter_500Medium",
  },
  likedPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  artistsSection: {
    marginTop: 28,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    fontFamily: "Inter_700Bold",
    marginBottom: 14,
  },
});
