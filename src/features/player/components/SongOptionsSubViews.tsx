import Colors from "@/constants/colors";
import { IS_ANDROID } from "@/constants/platform";
import { searchArtists } from "@/data/providers/ArtistProvider";
import { compactMap } from "@/lib/arrayUtils";
import {
addSongToFirestorePlaylist,
getUserFirestorePlaylists,
type FirestorePlaylist,
} from "@/lib/firestore";
import { formatDuration,getBestImageUrl,type Song } from "@/lib/musicData";
import { searchYouTubeMusic } from "@/services/youtube/YouTubeMusic";
import { addSongToPlaylist,getUserPlaylists } from "@/lib/storage";
import { showGlobalToast } from "@/utils/globalToast";
import { Ionicons } from "@expo/vector-icons";
import { MusicArtwork } from "@/components/MusicArtwork";
import { router } from "expo-router";
import React,{ useCallback,useEffect,useMemo,useState } from "react";
import {
ActivityIndicator,
FlatList,
Pressable,
Text,
View,
} from "react-native";
import { styles } from "../styles/songOptionsStyles";
import { dismissOptions } from "../utils/songOptionsUtils";
import {
AddToPlaylistRow,
ArtistNameOptionRow,
MergedPlaylist,
SongCreditRow,
SubHeader,
} from "./SongOptionsSubComponents";

// ─── Shared sheet wrapper ─────────────────────────────────────────────────────
export function SheetWrap({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      {IS_ANDROID && (
        <Pressable
          style={styles.backdrop}
          onPress={dismissOptions}
          accessibilityRole="button"
          accessibilityLabel="Dismiss options"
        >
          <View pointerEvents="none" />
        </Pressable>
      )}
      <View style={styles.sheet}>
        <View style={styles.grabberRow}>
          <View style={styles.grabber} />
        </View>
        <View style={styles.subViewContainer}>
          {children}
        </View>
      </View>
    </View>
  );
}

// ─── Sub-view: Add to playlist ────────────────────────────────────────────────
export function AddToPlaylistView({
  song,
  onBack,
  bottomPad,
  userId,
}: {
  song: Song;
  onBack: () => void;
  bottomPad: number;
  userId: string | null;
}) {
  const [playlists, setPlaylists] = useState<MergedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const playlistBottomPad = Math.max(bottomPad + 72, 104);
  const startPlaylistLoad = useCallback(() => {
    setLoading(true);
  }, []);
  const finishPlaylistLoad = useCallback((items: MergedPlaylist[]) => {
    setLoading(false);
    setPlaylists(items);
  }, []);

  const loadPlaylists = useCallback(async () => {
    startPlaylistLoad();
    try {
      const local = await getUserPlaylists();
      const localMerged: MergedPlaylist[] = local.map((p) => ({
        ...p,
        isFirestore: false,
        coverUrl: p.coverUrl || p.songs?.[0]?.coverUrl || "",
      }));

      if (!userId) {
        finishPlaylistLoad(localMerged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        return;
      }

      const firestoreRaw = await getUserFirestorePlaylists(userId);
      const firestoreIds = new Set(firestoreRaw.map((fp: FirestorePlaylist) => fp.id));

      const firestoreMerged: MergedPlaylist[] = firestoreRaw.map(
        (fp: FirestorePlaylist): MergedPlaylist => ({
          id: fp.id,
          name: fp.name,
          description: fp.description || "",
          coverUrl: fp.imageUrl || (fp.songs?.[0] as any)?.imageUrl || "",
          songs: (fp.songs || []).map((fs: any) => ({
            id: fs.id,
            title: fs.title,
            artist: fs.artist,
            coverUrl: fs.imageUrl || "",
            audioUrl: fs.audioUrl || "",
            duration: fs.duration || 0,
            album: fs.album || "",
            genre: "",
          })),
          createdAt: 0,
          updatedAt: 0,
          isFirestore: true,
        })
      );

      const localOnly = localMerged.filter((p) => !firestoreIds.has(p.id));
      const merged = [...firestoreMerged, ...localOnly].sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );
      finishPlaylistLoad(merged);
    } catch {
      try {
        const local = await getUserPlaylists();
        finishPlaylistLoad(local.map((p) => ({ ...p, isFirestore: false })));
      } catch {
        finishPlaylistLoad([]);
      }
    }
  }, [finishPlaylistLoad, startPlaylistLoad, userId]);

  useEffect(() => {
    void Promise.resolve().then(loadPlaylists);
  }, [loadPlaylists]);

  const handleAdd = useCallback(
    async (playlist: MergedPlaylist) => {
      setAdding(playlist.id);
      try {
        let added: boolean;
        if (playlist.isFirestore) {
          added = await addSongToFirestorePlaylist(playlist.id, song);
        } else {
          added = await addSongToPlaylist(playlist.id, song);
        }
        showGlobalToast(added ? `Added to ${playlist.name}` : "Already in this playlist");
        onBack();
      } catch {
        showGlobalToast("Failed to add to playlist");
      } finally {
        setAdding(null);
      }
    },
    [song, onBack]
  );

  const renderPlaylist = useCallback(
    ({ item }: { item: MergedPlaylist }) => (
      <AddToPlaylistRow playlist={item} addingId={adding} onAdd={handleAdd} />
    ),
    [adding, handleAdd]
  );

  return (
    <View style={styles.subView}>
      <SubHeader title="Add to playlist" onBack={onBack} />
      <View style={styles.divider} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : playlists.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="musical-notes-outline" size={40} color="#555" />
          <Text style={styles.emptyMsg}>No playlists yet</Text>
          <Text style={styles.emptyHint}>Create a playlist from Library first</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          style={styles.playlistList}
          contentContainerStyle={styles.playlistListContent}
          showsVerticalScrollIndicator
          scrollIndicatorInsets={{ bottom: bottomPad }}
          contentInsetAdjustmentBehavior="never"
          nestedScrollEnabled
          bounces={false}
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          ListFooterComponent={<View style={[styles.playlistFooter, { height: playlistBottomPad }]} />}
          renderItem={renderPlaylist}
        />
      )}
    </View>
  );
}

// ─── Sub-view: Go to artists ──────────────────────────────────────────────────
export function GoToArtistsView({
  song,
  onBack,
  bottomPad,
}: {
  song: Song;
  onBack: () => void;
  bottomPad: number;
}) {
  const [searching, setSearching] = useState<string | null>(null);

  const artists = useMemo(
    () => compactMap((song.artist || "").split(","), (a) => a.trim()),
    [song.artist]
  );

  const handleArtist = useCallback(async (artistName: string) => {
    setSearching(artistName);
    try {
      const reference = song.artistRefs?.find(item => item.name.trim().toLowerCase() === artistName.trim().toLowerCase());
      const results = reference ? [{ ...reference, image: [] }] : await searchArtists(artistName);
      const artist = results.find(item => item.name.trim().toLowerCase() === artistName.trim().toLowerCase());
      if (!artist?.id) {
        showGlobalToast("Could not find this artist");
        return;
      }
      const image = artist.image?.length ? getBestImageUrl(artist.image) : "";
      dismissOptions();
      setTimeout(() => {
        router.push({
          pathname: "/artist/[id]",
          params: { id: artist.id, name: artist.name || artistName, image },
        });
      }, 180);
    } catch {
      showGlobalToast("Could not find this artist");
    } finally {
      setSearching(null);
    }
  }, [song.artistRefs]);

  const renderArtistName = useCallback(
    ({ item }: { item: string }) => (
      <ArtistNameOptionRow name={item} searching={searching} onPress={handleArtist} />
    ),
    [handleArtist, searching]
  );

  return (
    <View style={styles.subView}>
      <SubHeader title="Go to artists" onBack={onBack} />
      <View style={styles.divider} />
      <FlatList
        data={artists}
        keyExtractor={(name) => name}
        renderItem={renderArtistName}
        style={styles.menu}
        contentContainerStyle={[styles.menuContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyMsg}>No artist info available</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Sub-view: Song credits ───────────────────────────────────────────────────
export function SongCreditsView({
  song,
  onBack,
  bottomPad,
}: {
  song: Song;
  onBack: () => void;
  bottomPad: number;
}) {
  const rows = useMemo(() => [
    { label: "Title",    value: song.title || "Unknown" },
    { label: "Artist",   value: song.artist || "Unknown Artist" },
    song.album    ? { label: "Album",    value: song.album }           : null,
    song.year     ? { label: "Year",     value: String(song.year) }    : null,
    song.genre    ? { label: "Genre",    value: song.genre }           : null,
    song.language ? { label: "Language", value: song.language }        : null,
    song.duration ? { label: "Duration", value: formatDuration(song.duration) } : null,
  ].filter(Boolean) as { label: string; value: string }[], [song]);

  const renderCredit = useCallback(
    ({ item }: { item: { label: string; value: string } }) => <SongCreditRow row={item} />,
    []
  );

  return (
    <View style={styles.subView}>
      <SubHeader title="Song credits" onBack={onBack} />
      <View style={styles.divider} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.label}
        renderItem={renderCredit}
        style={styles.menu}
        contentContainerStyle={[styles.menuContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Sub-view: Mavrixfy Code ──────────────────────────────────────────────────
export function MavrixfyCodeView({ song, onBack }: { song: Song; onBack: () => void }) {
  return (
    <View style={styles.subView}>
      <SubHeader title="Mavrixfy Code" onBack={onBack} />
      <View style={styles.divider} />
      <View style={styles.centered}>
        <View style={styles.codeBox}>
          <Ionicons name="barcode-outline" size={72} color={Colors.primary} />
          <Text style={styles.codeTitle}>{song.title}</Text>
          <Text style={styles.codeId} selectable>{song.id}</Text>
          <Text style={styles.codeHint}>Long-press the ID to copy</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Sub-view: Choose a saved song's YouTube version ─────────────────────────
export function LikedSongMatchesView({
  song,
  onBack,
  onSelect,
  selectingId,
  bottomPad,
}: {
  song: Song;
  onBack: () => void;
  onSelect: (match: Song) => void;
  selectingId: string | null;
  bottomPad: number;
}) {
  const [result, setResult] = useState<{ key: string; matches: Song[]; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queryKey = `${song.title}\u0000${song.artist}\u0000${attempt}`;
  const loading = result?.key !== queryKey;
  const failed = result?.key === queryKey && result.failed;
  const matches = result?.key === queryKey ? result.matches : [];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void searchYouTubeMusic([song.title, song.artist].filter(Boolean).join(" "), "songs", controller.signal)
      .then(result => {
        if (active) setResult({ key: queryKey, matches: result.songs, failed: false });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setResult({ key: queryKey, matches: [], failed: true });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryKey, song.artist, song.title]);

  const renderMatch = useCallback(({ item }: { item: Song }) => {
    const isSelecting = selectingId === item.id;
    return (
      <Pressable
        style={({ pressed }) => [styles.playlistRow, pressed && styles.rowPressed]}
        onPress={() => onSelect(item)}
        disabled={Boolean(selectingId)}
        accessibilityRole="button"
        accessibilityLabel={`Replace this saved song with ${item.title} by ${item.artist}`}
      >
        {item.coverUrl ? (
          <MusicArtwork recyclingKey={`liked-match-${item.id}`} uri={item.coverUrl} size={48}
            style={styles.playlistThumb} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.playlistThumb, styles.playlistThumbFallback]}>
            <Ionicons name="musical-notes" size={18} color="#777" />
          </View>
        )}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.playlistCount} numberOfLines={1}>
            {[item.artist, item.duration ? formatDuration(item.duration) : ""].filter(Boolean).join(" • ")}
          </Text>
        </View>
        {isSelecting ? <ActivityIndicator size="small" color={Colors.primary} /> :
          <Ionicons name="checkmark-circle-outline" size={22} color={Colors.primary} />}
      </Pressable>
    );
  }, [onSelect, selectingId]);

  return (
    <View style={styles.subView}>
      <SubHeader title="Choose song version" onBack={onBack} />
      <View style={styles.divider} />
      <View style={{ paddingHorizontal: 18, paddingVertical: 10 }}>
        <Text style={styles.emptyHint}>
          Tap a match to replace this exact Liked Songs entry for “{song.title}”. Your original saved record and JioSaavn URL stay preserved.
        </Text>
      </View>
      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.primary} /><Text style={styles.emptyHint}>Finding song versions…</Text></View>
      ) : failed ? (
        <View style={styles.centered}>
          <Text style={styles.emptyMsg}>Could not load song versions</Text>
          <Pressable style={styles.closeButton} onPress={() => setAttempt(value => value + 1)}>
            <Text style={styles.closeButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={item => item.id}
          renderItem={renderMatch}
          style={styles.playlistList}
          contentContainerStyle={[styles.playlistListContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={styles.centered}><Text style={styles.emptyMsg}>No song versions found</Text></View>}
        />
      )}
    </View>
  );
}
