import { NavLikedIcon } from "@/components/OfficialNavIcons";
import Colors from "@/constants/colors";
import { type FollowedArtist } from "@/lib/followedArtists";
import type { SavedCollection } from "@/lib/savedCollections";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable,StyleSheet,Text,View } from "react-native";
import { ArtistRow } from "./ArtistRow";
import { SavedCollectionRow } from "./SavedCollectionRow";

export type Filter = "playlists" | "artists" | "favorite" | null;
export type ViewMode = "list" | "grid";

interface LibraryHeaderProps {
  topPadding: number;
  filter: Filter;
  viewMode: ViewMode;
  likedSongCount: number;
  followedArtists: FollowedArtist[];
  savedCollections: SavedCollection[];
  onSelectFilter: (filter: Filter) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onOpenLikedSongs: () => void;
  onOpenArtist: (artist: FollowedArtist) => void;
  onBrowseArtists: () => void;
  onOpenSavedCollection: (collection: SavedCollection) => void;
}

export const LibraryHeader = memo(function LibraryHeader({
  topPadding,
  filter,
  viewMode,
  likedSongCount,
  followedArtists,
  savedCollections,
  onSelectFilter,
  onChangeViewMode,
  onOpenLikedSongs,
  onOpenArtist,
  onBrowseArtists,
  onOpenSavedCollection,
}: LibraryHeaderProps) {
  const showArtistsSection = filter === null || filter === "artists";
  const showSavedSection = filter !== "artists";

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
        style={({ pressed }) => [styles.likedCard, pressed && styles.likedCardPressed]}
        android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
        onPress={onOpenLikedSongs}
      >
        <View style={styles.likedContent}>
          <NavLikedIcon size={28} color={Colors.primary} isFocused />
          <View style={styles.likedTextSection}>
            <Text style={styles.likedTitle}>Liked Songs</Text>
            <Text style={styles.likedSubtitle}>{likedSongCount.toLocaleString()} songs</Text>
          </View>
        </View>
        <View style={styles.likedPlayBtn}>
          <Ionicons name="play" size={18} color="#06241A" style={{ marginLeft: 2 }} />
        </View>
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

      {showSavedSection && savedCollections.length > 0 ? (
        <View style={styles.artistsSection}>
          <Text style={styles.sectionTitle}>Saved Collections</Text>
          {savedCollections.map((collection) => (
            <SavedCollectionRow key={collection.id} collection={collection} onPress={onOpenSavedCollection} />
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
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  likedCard: {
    borderRadius: 16,
    backgroundColor: "#191D24",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  likedCardPressed: {
    backgroundColor: "#20252E",
    transform: [{ scale: 0.99 }],
  },
  likedContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  likedTextSection: {
    flex: 1,
  },
  likedTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.3,
    fontFamily: "Inter_700Bold",
  },
  likedSubtitle: {
    color: "#8E99A8",
    fontSize: 12.5,
    lineHeight: 16,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
  likedPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
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
