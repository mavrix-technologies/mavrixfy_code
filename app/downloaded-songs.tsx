/**
 * Downloaded Songs — Spotify-style offline library.
 *
 * Shows all fully downloaded tracks grouped by playlist/collection.
 * Accessible from the Downloads screen header.
 */

import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  SectionList,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { useDownloads } from "@/contexts/DownloadContext";
import { onQueueEvent } from "@/lib/downloads/downloadManager";
import { DownloadItem } from "@/types/downloads";
import { Song } from "@/lib/musicData";
import { usePlayerActions } from "@/contexts/PlayerContext";
import SongRow from "@/components/SongRow";

const UI = {
  bg: Colors.background,
  text: Colors.text,
  subtext: Colors.subtext,
  surface: Colors.surface,
  surfaceLight: Colors.surfaceLight,
  primary: Colors.primary,
  error: Colors.error,
  border: Colors.cardBorder,
};

// Convert a DownloadItem to a Song for the player.
// audioUrl must be the REMOTE url — the player resolves the local file
// from the download store automatically via resolvePlaybackUrl.
function downloadItemToSong(item: DownloadItem): Song {
  return {
    id: item.songId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    audioUrl: item.audioUrl,   // remote URL — player will use local file from store
    duration: item.duration,
    genre: "",
  };
}

// ─── Single downloaded song row ───────────────────────────────────────────────

interface DownloadedRowProps {
  item: DownloadItem;
  allSongs: Song[];
  collectionId?: string;
}

function DownloadedRow({ item, allSongs }: DownloadedRowProps) {
  const song = downloadItemToSong(item);

  return <SongRow song={song} queue={allSongs} showDownload={false} />;
}

// Memoize to prevent unnecessary re-renders
const MemoizedDownloadedRow = React.memo(DownloadedRow, (prev, next) => {
  return (
    prev.item.songId === next.item.songId &&
    prev.collectionId === next.collectionId
  );
});

// ─── Playlist/Collection Section ──────────────────────────────────────────────

interface PlaylistSection {
  collectionId: string;
  collectionName: string;
  items: DownloadItem[];
  coverUrl?: string;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DownloadedSongsScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  const { getAllDownloadItems, storageSummary } = useDownloads();
  const { playSong } = usePlayerActions();

  // Load collection metadata
  const [collectionMetadata, setCollectionMetadata] = useState<Record<string, { name: string; imageUrl: string }>>({});

  useEffect(() => {
    async function loadMetadata() {
      const { loadAllCollectionMetadata } = await import("@/lib/downloads/collectionMetadata");
      const metadata = await loadAllCollectionMetadata();
      const mapped: Record<string, { name: string; imageUrl: string }> = {};
      for (const [id, data] of Object.entries(metadata)) {
        mapped[id] = { name: data.name, imageUrl: data.imageUrl };
      }
      setCollectionMetadata(mapped);
    }
    loadMetadata();
  }, []);

  // Re-render when download statuses change
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubs = [
      onQueueEvent("completed", () => setTick((n) => n + 1)),
      onQueueEvent("status", () => setTick((n) => n + 1)),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const completedItems = getAllDownloadItems()
    .filter((item) => item.status === "completed")
    .sort((a, b) => {
      // Sort by completedAt descending (newest first)
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

  // Group songs by collection/playlist
  const playlistSections = useMemo<PlaylistSection[]>(() => {
    const collectionMap = new Map<string, DownloadItem[]>();
    const uncategorized: DownloadItem[] = [];

    for (const item of completedItems) {
      if (item.collectionRefs && item.collectionRefs.length > 0) {
        // Add to each collection it belongs to
        for (const collectionId of item.collectionRefs) {
          if (!collectionMap.has(collectionId)) {
            collectionMap.set(collectionId, []);
          }
          collectionMap.get(collectionId)!.push(item);
        }
      } else {
        // No collection reference
        uncategorized.push(item);
      }
    }

    const sections: PlaylistSection[] = [];

    // Add collection sections
    for (const [collectionId, items] of collectionMap.entries()) {
      // Get metadata for this collection
      const metadata = collectionMetadata[collectionId];
      const collectionName = metadata?.name || `Playlist ${collectionId.slice(0, 8)}`;
      const coverUrl = metadata?.imageUrl || items[0]?.coverUrl;

      sections.push({
        collectionId,
        collectionName,
        items,
        coverUrl,
      });
    }

    // Add uncategorized section if any
    if (uncategorized.length > 0) {
      sections.push({
        collectionId: "uncategorized",
        collectionName: "Individual Downloads",
        items: uncategorized,
      });
    }

    return sections;
  }, [completedItems, collectionMetadata]);

  const allSongs = completedItems.map(downloadItemToSong);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.backgroundGradientStart, Colors.background, Colors.background]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={UI.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Downloaded Songs</Text>
          <Text style={styles.headerSub}>
            {completedItems.length} song{completedItems.length !== 1 ? "s" : ""} · offline
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/downloads")}
          style={styles.manageBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="settings-outline" size={20} color={UI.subtext} />
        </Pressable>
      </View>

      {/* Hero banner */}
      {completedItems.length > 0 && (
        <View style={styles.heroBanner}>
          {/* Mini cover grid */}
          <View style={styles.coverGrid}>
            {completedItems.slice(0, 4).map((item, i) =>
              item.coverUrl ? (
                <Image
                  recyclingKey={item.songId}
                  key={item.songId}
                  source={{ uri: item.coverUrl }}
                  style={styles.coverGridItem}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View key={i} style={[styles.coverGridItem, styles.coverGridPlaceholder]}>
                  <Ionicons name="musical-note" size={14} color={UI.subtext} />
                </View>
              )
            )}
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroTitle}>Downloads</Text>
            <Text style={styles.heroSub}>
              {storageSummary.completedTracks} songs saved offline
            </Text>
          </View>
          <DownloadedPlayAllButton songs={allSongs} />
        </View>
      )}

      {/* Song list */}
      <SectionList
        sections={playlistSections.map((section) => ({
          title: section.collectionName,
          data: section.items,
          collectionId: section.collectionId,
          coverUrl: section.coverUrl,
        }))}
        keyExtractor={(item) => item.songId}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {section.coverUrl ? (
              <Image
                recyclingKey={section.collectionId}
                source={{ uri: section.coverUrl }}
                style={styles.sectionCover}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.sectionCover, styles.sectionCoverPlaceholder]}>
                <Ionicons name="musical-notes" size={20} color={UI.subtext} />
              </View>
            )}
            <View style={styles.sectionInfo}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>
                {section.data.length} song{section.data.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <Pressable
              style={styles.sectionPlayBtn}
              onPress={() => {
                if (section.data.length > 0) {
                  void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
                  const songs = section.data.map(downloadItemToSong);
                  playSong(songs[0], songs);
                }
              }}
            >
              <Ionicons name="play-circle" size={32} color={UI.primary} />
            </Pressable>
          </View>
        )}
        renderItem={({ item, section }) => (
          <MemoizedDownloadedRow
            item={item}
            allSongs={section.data.map(downloadItemToSong)}
            collectionId={section.collectionId}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="arrow-down-circle-outline" size={56} color={UI.subtext} />
            <Text style={styles.emptyTitle}>No downloaded songs</Text>
            <Text style={styles.emptySub}>
              Tap the{" "}
              <Ionicons name="arrow-down-circle-outline" size={14} color={UI.subtext} />
              {" "}icon on any song to save it for offline playback.
            </Text>
            <Pressable
              style={styles.browseBtn}
              onPress={() => router.push("/(tabs)/search")}
            >
              <Text style={styles.browseBtnText}>Browse Songs</Text>
            </Pressable>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          completedItems.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        removeClippedSubviews={Platform.OS === "android"}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={21}
        initialNumToRender={10}
      />
    </View>
  );
}

// ─── Play All button (needs player context) ───────────────────────────────────

function DownloadedPlayAllButton({ songs }: { songs: Song[] }) {
  const { playSong } = usePlayerActions();

  if (songs.length === 0) return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.playAllBtn, pressed && { opacity: 0.8 }]}
      onPress={() => {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
        playSong(songs[0], songs);
      }}
    >
      <Ionicons name="play" size={18} color={Colors.black} />
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bg },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    color: UI.text,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  manageBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  // Hero banner
  heroBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: UI.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  coverGrid: {
    width: 56,
    height: 56,
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 6,
    overflow: "hidden",
  },
  coverGridItem: {
    width: 28,
    height: 28,
  },
  coverGridPlaceholder: {
    backgroundColor: UI.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: { flex: 1 },
  heroTitle: {
    color: UI.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  heroSub: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  playAllBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  // Section headers (playlist groups)
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: UI.bg,
    marginTop: 8,
    gap: 12,
  },
  sectionCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  sectionCoverPlaceholder: {
    backgroundColor: UI.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionInfo: {
    flex: 1,
  },
  sectionTitle: {
    color: UI.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  sectionCount: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  sectionPlayBtn: {
    padding: 4,
  },

  // Song rows
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
  },
  rowPressed: {
    opacity: 0.65,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  cover: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  coverPlaceholder: {
    backgroundColor: UI.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, minWidth: 0 },
  title: {
    color: UI.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  titleActive: { color: UI.primary },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  artist: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  duration: {
    color: UI.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    width: 36,
    textAlign: "right",
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: UI.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySub: {
    color: UI.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  browseBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: UI.primary,
  },
  browseBtnText: {
    color: Colors.black,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
