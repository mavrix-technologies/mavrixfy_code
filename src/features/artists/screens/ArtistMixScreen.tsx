import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { safeGoBack } from "@/utils/navigation";
import { convertJioSaavnSong, Song } from "@/lib/musicData";
import { getArtistDetails } from "@/data/providers/ArtistProvider";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { triggerImpact } from "@/lib/haptics";
import SongRow from "@/components/SongRow";
import { setLastMix } from "@/lib/lastMix";
import { mapFilter } from "@/lib/arrayUtils";
import { pickFirst } from "@/utils/stringUtils";
import { shareArtistMix } from "@/utils/shareUtils";
import { ArtistMixGettingReady } from "../components/ArtistMixGettingReady";
import { ArtistMixHero } from "../components/ArtistMixHero";

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
      if (i < bucket.length) {
        result.push(bucket[i]);
        hasMore = true;
      }
    }
    i++;
  }
  return result;
}

export function ArtistMixScreen() {
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

  const { currentSong } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, shufflePlay, togglePlay } = usePlayerActions();

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

  // Fetch and filter songs
  useEffect(() => {
    if (ids.length === 0) {
      finishEmptyMixLoad();
      return;
    }
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

        const artistSongs = mapFilter(artist.topSongs ?? [], convertJioSaavnSong, (s) => {
          const songArtistId = (s as Song & { artistId?: string }).artistId;
          return !!s.audioUrl?.trim() && !seen.has(s.id) && (!songArtistId || songArtistId === selectedId);
        });

        artistSongs.forEach((s) => {
          seen.add(s.id);
          merged.push(s);
        });
        if (!cancelled) incrementLoadedCount();
      });

      if (!cancelled) {
        const finalSongs = ids.length === 1 ? merged : interleave(merged, ids.length);
        finishMixLoad(finalSongs);
      }
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [finishEmptyMixLoad, finishMixLoad, ids, incrementLoadedCount, startMixLoad]);

  const isPlayingFromMix = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return songs.some((s) => s.id === currentSong.id);
  }, [currentSong, songs]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromMix) {
      togglePlay();
      return;
    }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromMix, togglePlay, playSong]);

  const handleShuffle = useCallback(() => {
    if (!songs.length) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    shufflePlay(songs);
  }, [songs, shufflePlay]);

  const title = names.length > 0
    ? names.length === 1
      ? `${names[0]} Mix`
      : `${names.slice(0, 2).join(" & ")}${names.length > 2 ? ` +${names.length - 2}` : ""} Mix`
    : "Artist Mix";

  const totalDurationMin = useMemo(() => {
    const totalSec = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hrs > 0) return `${hrs} hr ${mins} min`;
    return `${mins} min`;
  }, [songs]);

  const songsQueueKey = useMemo(() => songs.map((song) => song.id).join("|"), [songs]);

  const renderSong = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow song={item} index={index} queue={songs} queueKey={songsQueueKey} />
    ),
    [songs, songsQueueKey]
  );

  const listContentStyle = useMemo(
    () => ({ paddingBottom: bottomPad, paddingHorizontal: 16 }),
    [bottomPad]
  );

  const loadingArtists = useMemo(() => {
    return ids.slice(0, 3).map((id, index) => ({
      id,
      image: images[index] || "",
      isStacked: index > 0,
    }));
  }, [ids, images]);

  const handleShare = useCallback(async () => {
    await shareArtistMix(names, ids, images);
  }, [names, ids, images]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Top Navigation Bar */}
      <View style={styles.header}>
        <Pressable
          onPress={safeGoBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <Pressable
          onPress={handleShare}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Share artist mix"
        >
          <Ionicons name="share-outline" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {loading ? (
        <ArtistMixGettingReady
          loadingArtists={loadingArtists}
          loadedCount={loadedCount}
          totalCount={ids.length}
          names={names}
        />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(song) => `mix-song-${song.id}`}
          renderItem={renderSong}
          contentContainerStyle={listContentStyle}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <ArtistMixHero
              ids={ids}
              names={names}
              images={images}
              title={title}
              songsCount={songs.length}
              totalDurationMin={totalDurationMin}
              isPlayingFromMix={isPlayingFromMix}
              isPlaying={isPlaying}
              onShuffle={handleShuffle}
              onPlayAll={handlePlayAll}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={44} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No songs available for these artists</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0E11",
  },

  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    paddingHorizontal: 8,
  },

  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});

export default ArtistMixScreen;
