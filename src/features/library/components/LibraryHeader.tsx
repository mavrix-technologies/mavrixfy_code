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
      {/* Filter Chips & View Mode Toggle Row */}
      <View style={styles.filterAndToggleRow}>
        <View style={styles.filterRow}>
          {/* Playlists chip */}
          <Pressable
            style={[styles.filterChip, filter === "playlists" && styles.filterChipActive]}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}
            onPress={() => onSelectFilter(filter === "playlists" ? null : "playlists")}
          >
            {filter === "playlists" && (
              <Ionicons name="close" size={13} color={Colors.black} style={styles.chipClose} />
            )}
            <Text style={[styles.filterText, filter === "playlists" && styles.filterTextActive]}>
              Playlists
            </Text>
          </Pressable>

          {/* Artists chip */}
          <Pressable
            style={[styles.filterChip, filter === "artists" && styles.filterChipActive]}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}
            onPress={() => onSelectFilter(filter === "artists" ? null : "artists")}
          >
            {filter === "artists" && (
              <Ionicons name="close" size={13} color={Colors.black} style={styles.chipClose} />
            )}
            <Text style={[styles.filterText, filter === "artists" && styles.filterTextActive]}>
              Artists
            </Text>
          </Pressable>

          {/* Liked chip */}
          <Pressable
            style={[styles.filterChip, filter === "favorite" && styles.filterChipActive]}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}
            onPress={() => {
              if (filter === "favorite") {
                onSelectFilter(null);
                return;
              }
              onSelectFilter("favorite");
              onOpenLikedSongs();
            }}
          >
            {filter === "favorite" && (
              <Ionicons name="close" size={13} color={Colors.black} style={styles.chipClose} />
            )}
            <Text style={[styles.filterText, filter === "favorite" && styles.filterTextActive]}>
              Liked
            </Text>
          </Pressable>
        </View>

        {/* List / Grid Toggle */}
        <View style={styles.viewToggleWrap}>
          <Pressable
            style={[styles.viewToggleButton, viewMode === "grid" && styles.viewToggleActive]}
            onPress={() => onChangeViewMode("grid")}
          >
            <Ionicons
              name="grid-outline"
              size={16}
              color={viewMode === "grid" ? Colors.primary : Colors.subtext}
            />
          </Pressable>
          <Pressable
            style={[styles.viewToggleButton, viewMode === "list" && styles.viewToggleActive]}
            onPress={() => onChangeViewMode("list")}
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={viewMode === "list" ? Colors.primary : Colors.subtext}
            />
          </Pressable>
        </View>
      </View>

      {/* Liked Songs Hero Card */}
      <Pressable
        style={styles.likedCard}
        android_ripple={{ color: "rgba(255, 255, 255, 0.15)" }}
        onPress={onOpenLikedSongs}
      >
        <LinearGradient
          colors={[Colors.primary, "#00b87b"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.likedCardGradient}
        >
          <Ionicons
            name="heart"
            size={82}
            color="rgba(223, 226, 235, 0.18)"
            style={styles.likedHeartBackdrop}
          />
          <Text style={styles.likedTitle}>Liked Songs</Text>
          <View style={styles.likedCountPill}>
            <Text style={styles.likedCount}>{likedSongCount.toLocaleString()} total songs</Text>
          </View>
          <View style={styles.likedPlayButton}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </Pressable>

      {/* Followed Artists Section */}
      {showArtistsSection ? (
        <View style={styles.artistsSection}>
          {followedArtists.length === 0 ? (
            <View style={styles.artistsEmpty}>
              <Ionicons name="person-add-outline" size={36} color={Colors.subtext} />
              <Text style={styles.artistsEmptyTitle}>No followed artists yet</Text>
              <Text style={styles.artistsEmptySub}>
                Follow artists from their profile page to see them here.
              </Text>
              <Pressable
                style={styles.artistsEmptyBtn}
                android_ripple={{ color: "rgba(0, 0, 0, 0.12)" }}
                onPress={onBrowseArtists}
              >
                <Text style={styles.artistsEmptyBtnText}>Browse Artists</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.artistsHeader}>
                <Text style={styles.artistsTitle}>Following</Text>
                <Text style={styles.artistsCount}>{followedArtists.length}</Text>
              </View>
              {followedArtists.map((artist) => (
                <ArtistRow key={artist.id} artist={artist} onPress={onOpenArtist} />
              ))}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  filterAndToggleRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 1,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: "rgba(38,225,154,0.7)",
  },
  filterText: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
  },
  filterTextActive: {
    color: Colors.black,
  },
  chipClose: {
    marginRight: 1,
  },
  viewToggleWrap: {
    flexDirection: "row",
    gap: 2,
    flexShrink: 0,
  },
  viewToggleButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  likedCard: {
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  likedCardGradient: {
    minHeight: 112,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "space-between",
  },
  likedHeartBackdrop: {
    position: "absolute",
    right: -8,
    bottom: -16,
    opacity: 0.7,
  },
  likedTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.35,
    fontFamily: "Inter_700Bold",
  },
  likedCount: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_500Medium",
  },
  likedCountPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(6, 36, 26, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  likedPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(6, 36, 26, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  artistsSection: {
    marginTop: 10,
    paddingBottom: 8,
  },
  artistsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  artistsTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  artistsCount: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  artistsEmpty: {
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 16,
    gap: 10,
  },
  artistsEmptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  artistsEmptySub: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 260,
  },
  artistsEmptyBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  artistsEmptyBtnText: {
    color: Colors.black,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
