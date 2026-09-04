import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import Colors from "@/constants/colors";
import { getBestImageUrl, type Song } from "@/lib/musicData";
import SongRow from "@/components/SongRow";
import SearchResultFilterChip from "@/components/SearchResultFilterChip";
import { APP_TOP_HEADER_HEIGHT } from "@/components/AppTopHeader";
import type {
  ResultFilter,
  PlaylistResult,
  AlbumResult,
  ArtistResult,
} from "@/lib/searchRepository";
import { styles } from "../styles/searchStyles";
import {
  RESULT_FILTERS,
  ALBUM_STAGGER_PATTERN,
  ALBUM_TILT_PATTERN,
  PLAYLIST_STAGGER_PATTERN,
  PLAYLIST_TILT_PATTERN,
  APP_BRAND_ICON,
  stableHash,
} from "../types";

export interface SearchResultAlbumCardProps {
  album: AlbumResult;
  index: number;
  onPress: (album: AlbumResult, meta: string) => void;
}

export const SearchResultAlbumCard = React.memo(function SearchResultAlbumCard({
  album,
  index,
  onPress,
}: SearchResultAlbumCardProps) {
  const seed = stableHash(`album-${album.id}-${index}`);
  const staggerOffset = ALBUM_STAGGER_PATTERN[seed % ALBUM_STAGGER_PATTERN.length];
  const tilt = ALBUM_TILT_PATTERN[Math.floor(seed / 7) % ALBUM_TILT_PATTERN.length];
  const metaParts = [album.artist || "Album", album.year, album.language].filter(
    (value): value is string => Boolean(value)
  );
  const meta =
    album.songCount > 0 ? `${album.songCount} songs` : metaParts.join(" · ") || "Album";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.playlistGridCard,
        { marginTop: staggerOffset },
        pressed && styles.playlistClassicCardPressed,
      ]}
      onPress={() => onPress(album, meta)}
    >
      <View style={[styles.playlistGridImageWrap, { transform: [{ rotate: `${tilt}deg` }] }]}>
        <Image
          recyclingKey={`album-${album.id}`}
          source={{ uri: getBestImageUrl(album.image) }}
          style={styles.playlistGridImage}
          contentFit="cover"
          transition={160}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.42)"]}
          start={{ x: 0.5, y: 0.22 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.brandCoverBadge}>
          <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
        </View>
      </View>
      <View style={styles.playlistGridContent}>
        <Text style={styles.playlistGridName} numberOfLines={2}>
          {album.name}
        </Text>
        <Text style={styles.playlistGridMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
});

export interface SearchResultPlaylistCardProps {
  playlist: PlaylistResult;
  index: number;
  onPress: (playlist: PlaylistResult, meta: string) => void;
}

export const SearchResultPlaylistCard = React.memo(function SearchResultPlaylistCard({
  playlist,
  index,
  onPress,
}: SearchResultPlaylistCardProps) {
  const seed = stableHash(`${playlist.id}-${index}`);
  const staggerOffset = PLAYLIST_STAGGER_PATTERN[seed % PLAYLIST_STAGGER_PATTERN.length];
  const tilt = PLAYLIST_TILT_PATTERN[Math.floor(seed / 7) % PLAYLIST_TILT_PATTERN.length];
  const meta =
    playlist.songCount > 0
      ? `${Math.max(0, playlist.songCount || 0)} songs`
      : playlist.language || playlist.description || "Playlist";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.playlistGridCard,
        { marginTop: staggerOffset },
        pressed && styles.playlistClassicCardPressed,
      ]}
      onPress={() => onPress(playlist, meta)}
    >
      <View style={[styles.playlistGridImageWrap, { transform: [{ rotate: `${tilt}deg` }] }]}>
        <Image
          recyclingKey={playlist.id}
          source={{ uri: getBestImageUrl(playlist.image) }}
          style={styles.playlistGridImage}
          contentFit="contain"
          transition={160}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.42)"]}
          start={{ x: 0.5, y: 0.22 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.brandCoverBadge}>
          <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
        </View>
      </View>
      <View style={styles.playlistGridContent}>
        <Text style={styles.playlistGridName} numberOfLines={2}>
          {playlist.name}
        </Text>
        <Text style={styles.playlistGridMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
});

export interface SearchResultArtistRowProps {
  artist: ArtistResult;
  onPress: (artist: ArtistResult) => void;
}

export const SearchResultArtistRow = React.memo(function SearchResultArtistRow({
  artist,
  onPress,
}: SearchResultArtistRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.artistResultRow, pressed && styles.recentRowPressed]}
      onPress={() => onPress(artist)}
    >
      {getBestImageUrl(artist.image) ? (
        <Image
          recyclingKey={`artist-search-${artist.id}`}
          source={{ uri: getBestImageUrl(artist.image) }}
          style={styles.artistResultImage}
          contentFit="cover"
          transition={100}
        />
      ) : (
        <View style={[styles.artistResultImage, styles.artistResultImageFallback]}>
          <Ionicons name="person" size={25} color={Colors.subtext} />
        </View>
      )}
      <View style={styles.artistResultInfo}>
        <Text style={styles.artistResultName} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text style={styles.artistResultMeta} numberOfLines={1}>
          {artist.subtitle || artist.dominantLanguage || "Artist"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.subtext} />
    </Pressable>
  );
});

export interface SearchTopResultCardProps {
  song?: Song;
  artist?: ArtistResult;
  onSongPress: (song: Song) => void;
  onArtistPress: (artist: ArtistResult) => void;
}

export const SearchTopResultCard = React.memo(function SearchTopResultCard({
  song,
  artist,
  onSongPress,
  onArtistPress,
}: SearchTopResultCardProps) {
  if (!song && !artist) return null;

  const isSong = Boolean(song);
  const title = isSong ? song!.title : artist!.name;
  const subtitle = isSong ? song!.artist : (artist!.subtitle || "Artist");
  const imageUrl = isSong ? song!.coverUrl : getBestImageUrl(artist!.image);

  const handleTopResultPress = () => {
    if (isSong && song) {
      onSongPress(song);
    } else if (artist) {
      onArtistPress(artist);
    }
  };

  return (
    <View style={styles.topResultSection}>
      <Text style={styles.topResultSectionTitle}>Top result</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Top result: ${title}`}
        style={({ pressed }) => [styles.topResultCard, pressed && styles.topResultCardPressed]}
        onPress={handleTopResultPress}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.topResultImage, !isSong && styles.topResultImageRound]}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.topResultImage, styles.artistResultImageFallback, !isSong && styles.topResultImageRound]}>
            <Ionicons name={isSong ? "musical-notes" : "person"} size={28} color={Colors.subtext} />
          </View>
        )}
        <View style={styles.topResultInfo}>
          <Text style={styles.topResultTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.topResultMetaRow}>
            <View style={styles.topResultBadge}>
              <Text style={styles.topResultBadgeText}>{isSong ? "Song" : "Artist"}</Text>
            </View>
            <Text style={styles.topResultSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
        {isSong && (
          <View style={styles.topResultPlayButton}>
            <Ionicons name="play" size={20} color="#080B11" style={{ marginLeft: 2 }} />
          </View>
        )}
      </Pressable>
    </View>
  );
});

export interface SearchResultsSectionProps {
  topInset: number;
  resultFilter: ResultFilter;
  searchLoading: boolean;
  hasResults: boolean;
  searchDisplayQuery: string;
  resultDataKey: string;
  displayedSongs: Song[];
  songResults: Song[];
  albumResults: AlbumResult[];
  artistResults: ArtistResult[];
  playlistResults: PlaylistResult[];
  topSong?: Song;
  topArtist?: ArtistResult;
  featuredAlbums: AlbumResult[];
  featuredArtists: ArtistResult[];
  featuredPlaylists: PlaylistResult[];
  onScroll: (event: any) => void;
  onFilterSelect: (filter: ResultFilter) => void;
  onSongPress: (song: Song) => void;
  onArtistPress: (artist: ArtistResult) => void;
  onAlbumPress: (album: AlbumResult, meta: string) => void;
  onPlaylistPress: (playlist: PlaylistResult, meta: string) => void;
  resultsPlaylistsListRef: React.RefObject<FlatList<PlaylistResult> | null>;
  resultsAlbumsListRef: React.RefObject<FlatList<AlbumResult> | null>;
  resultsArtistsListRef: React.RefObject<FlatList<ArtistResult> | null>;
  resultsSongsListRef: React.RefObject<FlatList<Song> | null>;
}

export const SearchResultsSection = React.memo(function SearchResultsSection({
  topInset,
  resultFilter,
  searchLoading,
  hasResults,
  searchDisplayQuery,
  resultDataKey,
  displayedSongs,
  songResults,
  albumResults,
  artistResults,
  playlistResults,
  topSong,
  topArtist,
  featuredAlbums,
  featuredArtists,
  featuredPlaylists,
  onScroll,
  onFilterSelect,
  onSongPress,
  onArtistPress,
  onAlbumPress,
  onPlaylistPress,
  resultsPlaylistsListRef,
  resultsAlbumsListRef,
  resultsArtistsListRef,
  resultsSongsListRef,
}: SearchResultsSectionProps) {
  const showAlbumResults = (resultFilter === "all" || resultFilter === "albums") && albumResults.length > 0;
  const showArtistResults = (resultFilter === "all" || resultFilter === "artists") && artistResults.length > 0;
  const showPlaylistResults = (resultFilter === "all" || resultFilter === "playlists") && playlistResults.length > 0;
  const showSongResults = (resultFilter === "all" || resultFilter === "songs") && songResults.length > 0;

  const renderResultFilter = useCallback(
    ({ item }: { item: { key: ResultFilter; label: string } }) => (
      <SearchResultFilterChip
        filter={item}
        activeFilter={resultFilter}
        onSelect={onFilterSelect}
      />
    ),
    [onFilterSelect, resultFilter]
  );

  const renderSong = useCallback(
    ({ item }: { item: Song }) => (
      <SongRow
        song={item}
        queue={songResults}
        onSongPress={onSongPress}
        showSearchSourceMeta
        showDownload={false}
      />
    ),
    [onSongPress, songResults]
  );

  const renderArtistResult = useCallback(
    ({ item }: { item: ArtistResult }) => (
      <SearchResultArtistRow artist={item} onPress={onArtistPress} />
    ),
    [onArtistPress]
  );

  const renderAlbumResult = useCallback(
    ({ item, index }: { item: AlbumResult; index: number }) => (
      <View style={styles.playlistGridItemWrap}>
        <SearchResultAlbumCard album={item} index={index} onPress={onAlbumPress} />
      </View>
    ),
    [onAlbumPress]
  );

  const renderPlaylistResult = useCallback(
    ({ item, index }: { item: PlaylistResult; index: number }) => (
      <View style={styles.playlistGridItemWrap}>
        <SearchResultPlaylistCard playlist={item} index={index} onPress={onPlaylistPress} />
      </View>
    ),
    [onPlaylistPress]
  );

  return (
    <View style={[styles.resultsWrap, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 8 }]}>
      {/* Filter chips */}
      <View style={styles.filterRow}>
        <FlatList
          data={RESULT_FILTERS}
          keyExtractor={(filter) => filter.key}
          renderItem={renderResultFilter}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRowContent}
        />
      </View>

      {searchLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : !hasResults ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{`No results for "${searchDisplayQuery}"`}</Text>
          <Text style={styles.emptySubtext}>Check the spelling, or search for something else.</Text>
        </View>
      ) : resultFilter === "playlists" ? (
        <FlatList
          ref={resultsPlaylistsListRef}
          key={`pl-${resultDataKey}`}
          data={showPlaylistResults ? playlistResults : []}
          keyExtractor={(item) => item.id}
          renderItem={renderPlaylistResult}
          style={styles.scrollView}
          contentContainerStyle={[styles.playlistGridContentContainer, { paddingBottom: 146 }]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          numColumns={2}
          columnWrapperStyle={styles.playlistGridRow}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          ListEmptyComponent={<View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No playlists found.</Text></View>}
        />
      ) : resultFilter === "albums" ? (
        <FlatList
          ref={resultsAlbumsListRef}
          key={`al-${resultDataKey}`}
          data={showAlbumResults ? albumResults : []}
          keyExtractor={(item) => item.id}
          renderItem={renderAlbumResult}
          style={styles.scrollView}
          contentContainerStyle={[styles.playlistGridContentContainer, { paddingBottom: 146 }]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          numColumns={2}
          columnWrapperStyle={styles.playlistGridRow}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          ListEmptyComponent={<View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No albums found.</Text></View>}
        />
      ) : resultFilter === "artists" ? (
        <FlatList
          ref={resultsArtistsListRef}
          key={`ar-${resultDataKey}`}
          data={showArtistResults ? artistResults : []}
          keyExtractor={(item) => item.id}
          renderItem={renderArtistResult}
          style={styles.scrollView}
          contentContainerStyle={[styles.artistListContentContainer, { paddingBottom: 146 }]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          ListEmptyComponent={<View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No artists found.</Text></View>}
        />
      ) : !showSongResults && resultFilter === "songs" ? (
        <View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No songs found.</Text></View>
      ) : resultFilter === "all" &&
          !showSongResults &&
          !showAlbumResults &&
          !showArtistResults &&
          !showPlaylistResults ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.resultsContent, { paddingBottom: 146 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.emptyInline}>
            <Text style={styles.emptyInlineText}>No app results found.</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={resultsSongsListRef}
          key={`sg-${resultDataKey}`}
          data={displayedSongs}
          keyExtractor={(item) => item.id}
          renderItem={renderSong}
          style={styles.scrollView}
          contentContainerStyle={[styles.resultsContent, { paddingBottom: 146 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListHeaderComponent={
            resultFilter === "all" ? (
              <>
                <SearchTopResultCard
                  song={topSong}
                  artist={topArtist}
                  onSongPress={onSongPress}
                  onArtistPress={onArtistPress}
                />
                {showSongResults ? (
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Songs</Text>
                    <Pressable onPress={() => onFilterSelect("songs")}>
                      <Text style={styles.sectionActionText}>See all</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null
          }
          ListFooterComponent={
            showAlbumResults || showArtistResults || showPlaylistResults ? (
              <>
                {showAlbumResults ? (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>Albums</Text>
                      {resultFilter === "all" ? (
                        <Pressable onPress={() => onFilterSelect("albums")}>
                          <Text style={styles.sectionActionText}>See all</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.playlistGridWrap}>
                      {featuredAlbums.map((album, index) => (
                        <View key={album.id} style={styles.playlistGridItemWrap}>
                          <SearchResultAlbumCard album={album} index={index} onPress={onAlbumPress} />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
                {showArtistResults ? (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>Artists</Text>
                      {resultFilter === "all" ? (
                        <Pressable onPress={() => onFilterSelect("artists")}>
                          <Text style={styles.sectionActionText}>See all</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.artistSectionList}>
                      {featuredArtists.map((artist) => (
                        <View key={artist.id}>
                          <SearchResultArtistRow artist={artist} onPress={onArtistPress} />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
                {showPlaylistResults ? (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>Playlists</Text>
                      {resultFilter === "all" ? (
                        <Pressable onPress={() => onFilterSelect("playlists")}>
                          <Text style={styles.sectionActionText}>See all</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.playlistGridWrap}>
                      {featuredPlaylists.map((playlist, index) => (
                        <View key={playlist.id} style={styles.playlistGridItemWrap}>
                          <SearchResultPlaylistCard playlist={playlist} index={index} onPress={onPlaylistPress} />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            ) : null
          }
        />
      )}
    </View>
  );
});
