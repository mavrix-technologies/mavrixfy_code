import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import SongRow from "@/components/SongRow";
import { MusicArtwork } from "@/components/MusicArtwork";
import AdMobBanner from "@/components/AdMobBanner";
import Colors from "@/constants/colors";
import { getBestImageUrl, type Song } from "@/lib/musicData";
import type { AlbumResult, ArtistResult, PlaylistResult, ResultFilter } from "@/lib/searchRepository";
import { styles } from "../styles/searchStyles";

interface SearchResultsSectionProps {
  topInset: number; headerHeight?: number; resultFilter: ResultFilter;
  searchLoading: boolean; searchError: boolean; searchDisplayQuery: string;
  onRetry: () => void; onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  songResults: Song[]; albumResults: AlbumResult[]; artistResults: ArtistResult[]; playlistResults: PlaylistResult[];
  onSongPress: (song: Song) => void; onArtistPress: (artist: ArtistResult) => void;
  onAlbumPress: (album: AlbumResult, meta: string) => void;
  onPlaylistPress: (playlist: PlaylistResult, meta: string) => void;
}
type Row = { kind: "songs"; item: Song } | { kind: "albums"; item: AlbumResult }
  | { kind: "artists"; item: ArtistResult } | { kind: "playlists"; item: PlaylistResult };

/** Server-ranked, virtualized rows share the app's normal playback and navigation models. */
export const SearchResultsSection = memo(function SearchResultsSection(props: SearchResultsSectionProps) {
  const { resultFilter, songResults, albumResults, artistResults, playlistResults } = props;
  const rows = useMemo<Row[]>(() => [
    ...(resultFilter === "songs" || resultFilter === "all" ? songResults.map(item => ({ kind: "songs" as const, item })) : []),
    ...(resultFilter === "artists" || resultFilter === "all" ? artistResults.map(item => ({ kind: "artists" as const, item })) : []),
    ...(resultFilter === "albums" || resultFilter === "all" ? albumResults.map(item => ({ kind: "albums" as const, item })) : []),
    ...(resultFilter === "playlists" || resultFilter === "all" ? playlistResults.map(item => ({ kind: "playlists" as const, item })) : []),
  ], [resultFilter, songResults, albumResults, artistResults, playlistResults]);
  const { onSongPress, onArtistPress, onAlbumPress, onPlaylistPress } = props;
  const renderItem = useCallback(({ item: row }: { item: Row }) => {
    if (row.kind === "songs") return <SongRow song={row.item} queue={songResults} onSongPress={onSongPress} showDownload={false} />;
    const item = row.item;
    const meta = row.kind === "artists" ? row.item.subtitle || "Artist" : row.item.description || (row.kind === "albums" ? "Album" : "Playlist");
    const onPress = () => {
      if (row.kind === "artists") onArtistPress(row.item);
      else if (row.kind === "albums") onAlbumPress(row.item, meta);
      else onPlaylistPress(row.item, meta);
    };
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.artistResultRow, pressed && styles.recentRowPressed]}>
      <MusicArtwork uri={getBestImageUrl(item.image)} size={56} style={[styles.artistResultImage, { borderRadius: row.kind === "artists" ? 28 : 8 }]} contentFit="cover" transition={0} />
      <View style={styles.artistResultInfo}>
        <Text style={styles.artistResultName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.artistResultMeta} numberOfLines={1}>{meta}</Text>
      </View>
    </Pressable>;
  }, [songResults, onSongPress, onArtistPress, onAlbumPress, onPlaylistPress]);
  return <View style={[styles.resultsWrap, { paddingTop: props.headerHeight ?? props.topInset + 108 }]}>
    {props.searchLoading ? <View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.text} /></View>
      : props.searchError ? <View style={styles.empty}><Text style={styles.emptyText}>Could not load search results.</Text><Pressable onPress={props.onRetry}><Text style={styles.emptySubtext}>Try again</Text></Pressable></View>
      : <FlatList data={rows} keyExtractor={row => `${row.kind}:${row.item.id}`} renderItem={renderItem}
        contentContainerStyle={[styles.resultsContent, { paddingBottom: 146 }]} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled"
        onScroll={props.onScroll} scrollEventThrottle={16} initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{`No results for "${props.searchDisplayQuery}"`}</Text><Text style={styles.emptySubtext}>Check the spelling, or search for something else.</Text></View>}
        ListFooterComponent={rows.length ? <AdMobBanner loadDelayMs={600} /> : null} />}
  </View>;
});
