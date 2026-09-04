import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { IS_ANDROID } from "@/constants/platform";
import { showGlobalToast } from "@/utils/globalToast";
import { Song, getBestImageUrl, formatDuration } from "@/lib/musicData";
import { addSongToPlaylist, getUserPlaylists } from "@/lib/storage";
import {
  getUserFirestorePlaylists,
  addSongToFirestorePlaylist,
  type FirestorePlaylist,
} from "@/lib/firestore";
import { searchArtists } from "@/data/providers/ArtistProvider";
import { compactMap } from "@/lib/arrayUtils";
import { styles } from "../styles/songOptionsStyles";
import {
  MergedPlaylist,
  SubHeader,
  AddToPlaylistRow,
  ArtistNameOptionRow,
  SongCreditRow,
} from "./SongOptionsSubComponents";
import { dismissOptions } from "../utils/songOptionsUtils";

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
    void loadPlaylists();
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
      const results = await searchArtists(artistName);
      const artist = results[0];
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
  }, []);

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
