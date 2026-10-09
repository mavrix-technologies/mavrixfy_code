import SongRow from "@/components/SongRow";
import { CircularShareButton } from "@/components/navigation/CircularNavButton";
import { StandardTopHeader } from "@/components/navigation/StandardTopHeader";
import Colors from "@/constants/colors";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { getArtistDetails } from "@/data/providers/ArtistProvider";
import { triggerImpact } from "@/lib/haptics";
import { setLastMix } from "@/lib/lastMix";
import { getSavedCollections, toggleSavedCollection } from "@/lib/savedCollections";
import { showGlobalToast } from "@/utils/globalToast";
import { Song } from "@/lib/musicData";
import { usePlaybackNowPlaying,usePlaybackPlayState } from "@/services/audio/PlaybackEngine";
import { shareArtistMix } from "@/utils/shareUtils";
import { pickFirst } from "@/utils/stringUtils";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useCallback,useEffect,useMemo,useState } from "react";
import {
FlatList,
Platform,
StyleSheet,
Text,
View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const [isLiked, setIsLiked] = useState(false);

  const mixIds = useMemo(() => ids.join(","), [ids]);
  const mixNames = useMemo(() => names.join(","), [names]);
  const mixImages = useMemo(() => images.join(","), [images]);
  const title = names.length > 0
    ? names.length === 1
      ? `${names[0]} Mix`
      : `${names.slice(0, 2).join(" & ")}${names.length > 2 ? ` +${names.length - 2}` : ""} Mix`
    : "Artist Mix";
  const mixSavedId = `artist-mix:${mixIds}`;

  useEffect(() => {
    let active = true;
    void getSavedCollections().then((items) => {
      if (active) setIsLiked(items.some((item) => item.id === mixSavedId));
    }).catch(() => { if (active) setIsLiked(false); });
    return () => { active = false; };
  }, [mixSavedId]);

  const handleLike = useCallback(async () => {
    try {
      const saved = await toggleSavedCollection({
        id: mixSavedId,
        kind: "artist-mix",
        title,
        image: images[0] || "",
        description: names.length ? `A personalized mix featuring ${names.join(", ")}.` : "A personalized artist mix.",
        subtitle: `${ids.length} ${ids.length === 1 ? "artist" : "artists"}`,
        route: "artist-mix",
        params: { ids: mixIds, names: mixNames, images: mixImages },
      });
      setIsLiked(saved);
    } catch {
      showGlobalToast("Couldn't update your Library. Try again.");
    }
  }, [mixSavedId, title, images, names, ids.length, mixIds, mixNames, mixImages]);

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
      // An empty mix has no remote request to deliver the initial state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finishEmptyMixLoad();
      return;
    }
    let cancelled = false;

    const fetchAll = async () => {
      startMixLoad();

      if (cancelled) return;

      const results: PromiseSettledResult<Awaited<ReturnType<typeof getArtistDetails>>>[] = [];
      for (let offset = 0; offset < ids.length && !cancelled; offset += 2) {
        results.push(...await Promise.allSettled(ids.slice(offset, offset + 2).map((id, index) => getArtistDetails(id, names[offset + index] || ""))));
      }

      const seen = new Set<string>();
      const merged: Song[] = [];
      results.forEach((r, idx) => {
        if (r.status !== "fulfilled" || !r.value) return;
        const artist = r.value;
        const selectedId = ids[idx];

        const artistSongs = (artist.topSongs ?? []).filter((s) => {
          const songArtistId = (s as Song & { artistId?: string }).artistId;
          return !seen.has(s.id) && (!songArtistId || songArtistId === selectedId);
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
  }, [finishEmptyMixLoad, finishMixLoad, ids, incrementLoadedCount, startMixLoad, names]);

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
      {/* Unified Top Navigation Bar */}
      <StandardTopHeader
        title={title}
        topInset={0}
        rightElement={
          <CircularShareButton
            onPress={handleShare}
            accessibilityLabel="Share artist mix"
          />
        }
      />

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
              onLike={handleLike}
              isLiked={isLiked}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
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
    backgroundColor: Colors.background,
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
