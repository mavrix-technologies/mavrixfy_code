import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { convertJioSaavnSong, Song } from "@/lib/musicData";
import { getArtistDetails } from "@/lib/artistService";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/lib/playbackEngine";
import { triggerImpact } from "@/lib/haptics";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import { setLastMix } from "@/lib/lastMix";
import { mapFilter, sortedCopy } from "@/lib/arrayUtils";

function pickFirst(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

// Interleave songs from multiple artists in round-robin order
function interleave(allSongs: Song[], artistCount: number): Song[] {
  if (artistCount <= 1) return allSongs;
  const perArtist = Math.ceil(allSongs.length / artistCount);
  const buckets: Song[][] = Array.from({ length: artistCount }, (_, i) =>
    allSongs.slice(i * perArtist, (i + 1) * perArtist)
  );
  const result: Song[] = [];
  let hasMore = true;
  let i = 0;
  while (hasMore) {
    hasMore = false;
    for (const bucket of buckets) {
      if (i < bucket.length) { result.push(bucket[i]); hasMore = true; }
    }
    i++;
  }
  return result;
}

export default function ArtistMixScreen() {
  const params = useLocalSearchParams<{
    ids?: string | string[];
    names?: string | string[];
    images?: string | string[];
    songIds?: string;
  }>();

  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Math.max(140, insets.bottom + 120);

  const ids = useMemo(() => pickFirst(params.ids).split(",").filter(Boolean), [params.ids]);
  const names = useMemo(() => pickFirst(params.names).split(",").filter(Boolean), [params.names]);
  const images = useMemo(() => pickFirst(params.images).split(",").filter(Boolean), [params.images]);

  const { currentSong, queue } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, togglePlay } = usePlayerActions();

  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const mixIds = useMemo(() => ids.join(","), [ids]);
  const mixNames = useMemo(() => names.join(","), [names]);
  const mixImages = useMemo(() => images.join(","), [images]);
  const startMixLoad = useCallback(() => {
    setLoading(true);
    setLoadedCount(0);
  }, []);
  const incrementLoadedCount = useCallback(() => {
    setLoadedCount((count) => count + 1);
  }, []);
  const finishMixLoad = useCallback((nextSongs: Song[]) => {
    setLoading(false);
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
    setSongs(nextSongs);
  }, []);
  const finishEmptyMixLoad = useCallback(() => {
    setLoading(false);
  }, []);

  // Persist so mini player can re-open this mix and accurately detect active mix playback.
  useEffect(() => {
    if (!mixIds) return;
    setLastMix({
      ids: mixIds,
      names: mixNames,
      images: mixImages,
      songIds: songs.map((song) => song.id).join(","),
    });
  }, [mixIds, mixNames, mixImages, songs]);

  // Fetch and filter songs - only include songs where the artist ID matches the selected artist
  useEffect(() => {
    if (ids.length === 0) { finishEmptyMixLoad(); return; }
    let cancelled = false;

    const fetchAll = async () => {
      startMixLoad();

      if (cancelled) return;

      const results = await Promise.allSettled(
        ids.map((id) => getArtistDetails(id))
      );

      const seen = new Set<string>();
      const merged: Song[] = [];
      results.forEach((r, idx) => {
        if (r.status !== "fulfilled" || !r.value) return;
        const artist = r.value;
        const selectedId = ids[idx];
        
        // Only include songs where the primary artist ID matches the selected artist ID
        const artistSongs = mapFilter((artist.topSongs ?? []), convertJioSaavnSong, (s) => {
            // Only include if:
            // 1. Song has audio URL
            // 2. Song hasn't been added yet
            // 3. Song's primary artist ID matches this selected artist (or is undefined, show all)
            const songArtistId = (s as Song & { artistId?: string }).artistId;
            return s.audioUrl?.trim() && !seen.has(s.id) && (!songArtistId || songArtistId === selectedId);
          });
        
        artistSongs.forEach((s) => { seen.add(s.id); merged.push(s); });
        if (!cancelled) incrementLoadedCount();
      });

      if (!cancelled) {
        // Don't interleave for single artist - just show their songs directly
        const finalSongs = ids.length === 1 ? merged : interleave(merged, ids.length);
        finishMixLoad(finalSongs);
      }
    };

    void fetchAll();
    return () => { cancelled = true; };
  }, [finishEmptyMixLoad, finishMixLoad, ids, incrementLoadedCount, startMixLoad]);

  const isPlayingFromMix = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return (
      songs.some((s) => s.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((queuedSong, index) => queuedSong.id === songs[index]?.id)
    );
  }, [currentSong, queue, songs]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromMix) { togglePlay(); return; }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromMix, togglePlay, playSong]);

  const handleShuffle = useCallback(() => {
    if (!songs.length) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    const shuffled = sortedCopy(songs, () => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  }, [songs, playSong]);

  const title = names.length > 0
    ? names.length === 1 ? names[0] : `${names.slice(0, 2).join(" & ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`
    : "Artist Mix";
  const songsQueueKey = useMemo(() => songs.map((song) => song.id).join("|"), [songs]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentInset={{ bottom: bottomPad }}
        scrollIndicatorInsets={{ bottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* Artist avatars row */}
        <View style={styles.avatarRow}>
          {ids.map((id, i) => (
            <View key={id} style={[styles.avatarWrap, i > 0 && { marginLeft: -24 }]}>
              <Image
                recyclingKey={id}
                source={{ uri: images[i] || undefined }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </View>
          ))}
        </View>

        {/* Artist names row - show all selected artists */}
        {ids.length > 1 && (
          <View style={styles.artistNamesContainer}>
            {names.map((name) => (
              <View key={name} style={styles.artistNameBadge}>
                <Text style={styles.artistNameText} numberOfLines={1}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Mix title + meta */}
        <Text style={styles.mixTitle}>{title}</Text>
        <Text style={styles.mixMeta}>
          {loading
            ? `Loading songs… (${loadedCount}/${ids.length} artists)`
            : `${songs.length} songs · ${ids.length} artist${ids.length > 1 ? "s" : ""}`}
        </Text>

        {/* Action buttons */}
        {!loading && songs.length > 0 ? (
          <View style={styles.actions}>
            <Pressable style={styles.shuffleBtn} onPress={handleShuffle}>
              <Ionicons name="shuffle" size={17} color={Colors.text} />
              <Text style={styles.shuffleBtnText}>Shuffle</Text>
            </Pressable>
            <Pressable style={styles.playBtn} onPress={handlePlayAll}>
              <Ionicons
                name={isPlayingFromMix && isPlaying ? "pause" : "play"}
                size={18}
                color="#000"
              />
              <Text style={styles.playBtnText}>
                {isPlayingFromMix && isPlaying ? "Pause" : "Play All"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Song list */}
        {loading ? (
          <SongRowSkeleton count={10} />
        ) : songs.length > 0 ? (
          songs.map((song, i) => (
            <SongRow key={song.id} song={song} index={i} queue={songs} queueKey={songsQueueKey} />
          ))
        ) : (
          <View style={styles.empty}>
            <Ionicons name="musical-notes-outline" size={40} color={Colors.subtext} />
            <Text style={styles.emptyText}>No songs found for these artists.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },

  // Artist avatars
  avatarRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#000",
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    boxShadow: "none",
  },
  avatar: { width: "100%", height: "100%" },

  // Artist names container
  artistNamesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  artistNameBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  artistNameText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // Mix info
  mixTitle: {
    color: "#fff",
    fontSize: 28,
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
    paddingHorizontal: 16,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  mixMeta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 24,
    letterSpacing: 0.2,
  },

  // Actions
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  shuffleBtnText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  playBtnText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },

  // Empty
  empty: {
    alignItems: "center",
    paddingTop: 48,
    gap: 12,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
