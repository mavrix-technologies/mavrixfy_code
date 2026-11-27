import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  type TextInputInstance,
  UIManager,
  View,
} from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";

import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderDownloadButton,
  AppTopHeaderProfileButton,
} from "@/components/AppTopHeader";
import { SearchFilterBar } from "../components/SearchFilterBar";
import { getSearchTabIndex } from "../components/searchTabPagerUtils";
import { MusicArtwork } from "@/components/MusicArtwork";
import { getBestImageUrl } from "@/lib/musicData";
import { searchRepository, type ResultFilter, type SearchResults } from "@/lib/searchRepository";
import { LiquidGlassView } from "@/components/LiquidGlassView";
import OfflineBanner from "@/components/OfflineBanner";
import OfflineScreen from "@/components/OfflineScreen";
import { SearchHeaderField } from "@/components/SearchHeaderField";
import Colors from "@/constants/colors";
import {
  SearchBrowseSection,
  SearchRecentSection,
} from "../components/SearchBrowseSection";
import { SearchResultsSection } from "../components/SearchResultsSection";
import { MainTabSwipeSurface } from "@/features/navigation/MainTabSwipeSurface";
import { useOptionalNavSwipe } from "@/features/navigation/navSwipeContext";
import { useSearchEngine, type SearchSuggestionRow } from "../hooks/useSearchEngine";
import { styles } from "../styles/searchStyles";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SearchScreen() {
  return <SearchScreenView />;
}

export default SearchScreen;

const suggestionKeyExtractor = (item: SearchSuggestionRow, index: number) => {
  const idPart =
    item.kind === "song"
      ? item.song.id
      : item.kind === "artist"
        ? item.artist.id
        : item.kind === "album"
          ? item.album.id
          : item.kind === "playlist"
            ? item.playlist.id
            : item.label;
  return `${item.kind}:${idPart}:${index}`;
};

const SUGGESTION_CONTENT_STYLE = { paddingBottom: 146 };

function useLiveSearchSuggestions(
  isSearchMode: boolean,
  suggestionsOpen: boolean,
  isOnline: boolean,
  trimmedQuery: string,
  normalizedSuggestionKey: string,
  preferredLanguages: ReturnType<typeof useSearchEngine>["preferredLanguages"],
  suggestionRows: SearchSuggestionRow[]
) {
  const [liveCatalog, setLiveCatalog] = useState<{ queryKey: string; results: SearchResults } | null>(null);

  useEffect(() => {
    if (!isSearchMode || !suggestionsOpen || !isOnline || trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchRepository(
        trimmedQuery,
        "all",
        controller.signal,
        (partial) => {
          if (!controller.signal.aborted) {
            setLiveCatalog({ queryKey: normalizedSuggestionKey, results: partial });
          }
        },
        preferredLanguages ? { preferredLanguages } : undefined
      )
        .then((full) => {
          if (!controller.signal.aborted) {
            setLiveCatalog({ queryKey: normalizedSuggestionKey, results: full });
          }
        })
        .catch(() => { });
    }, 160);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isSearchMode, suggestionsOpen, isOnline, trimmedQuery, normalizedSuggestionKey, preferredLanguages]);

  return useMemo<SearchSuggestionRow[]>(() => {
    if (!normalizedSuggestionKey) return [];
    const activeCatalog = liveCatalog?.queryKey === normalizedSuggestionKey ? liveCatalog.results : null;
    if (!activeCatalog) return suggestionRows;

    const merged: SearchSuggestionRow[] = [];
    const seen = new Set<string>();
    const addRow = (row: SearchSuggestionRow) => {
      const labelKey = row.label.trim().toLowerCase();
      if (!labelKey) return;
      const dedupeKey = `${row.kind}:${labelKey}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      merged.push(row);
    };

    const allEntities: SearchSuggestionRow[] = [
      ...activeCatalog.songs.slice(0, 2).map((song) => ({ kind: "song" as const, label: song.title, song, isHistory: false })),
      ...activeCatalog.artists.slice(0, 2).map((artist) => ({ kind: "artist" as const, label: artist.name, artist, isHistory: false })),
      ...activeCatalog.albums.slice(0, 2).map((album) => ({ kind: "album" as const, label: album.name, album, isHistory: false })),
      ...activeCatalog.playlists.slice(0, 2).map((playlist) => ({ kind: "playlist" as const, label: playlist.name, playlist, isHistory: false })),
    ];

    const exactOrPrefix = allEntities.find((item) => item.label.trim().toLowerCase() === normalizedSuggestionKey) ??
      allEntities.find((item) => item.label.trim().toLowerCase().startsWith(`${normalizedSuggestionKey} `));
    if (exactOrPrefix) addRow(exactOrPrefix);

    const maxRounds = 2;
    const buckets: SearchSuggestionRow[][] = [
      activeCatalog.songs.slice(0, maxRounds).map((song) => ({ kind: "song", label: song.title, song, isHistory: false })),
      activeCatalog.artists.slice(0, maxRounds).map((artist) => ({ kind: "artist", label: artist.name, artist, isHistory: false })),
      activeCatalog.albums.slice(0, maxRounds).map((album) => ({ kind: "album", label: album.name, album, isHistory: false })),
      activeCatalog.playlists.slice(0, maxRounds).map((playlist) => ({ kind: "playlist", label: playlist.name, playlist, isHistory: false })),
    ];
    for (let round = 0; round < maxRounds; round += 1) {
      for (const bucket of buckets) {
        if (bucket[round]) addRow(bucket[round]);
      }
    }

    suggestionRows.forEach(addRow);
    return merged.slice(0, 12);
  }, [liveCatalog, normalizedSuggestionKey, suggestionRows]);
}

interface SearchSuggestionRowItemProps {
  item: SearchSuggestionRow;
  query: string;
  onSuggestionPress: (label: string) => void;
  onChangeText: (text: string) => void;
  onFocusInput: () => void;
  onSongResultPress: ReturnType<typeof useSearchEngine>["handleSongResultPress"];
  onArtistPress: ReturnType<typeof useSearchEngine>["handleArtistPress"];
  onAlbumPress: ReturnType<typeof useSearchEngine>["handleAlbumPress"];
  onPlaylistPress: ReturnType<typeof useSearchEngine>["handlePlaylistPress"];
}

function SearchSuggestionRowItem({
  item,
  query,
  onSuggestionPress,
  onChangeText,
  onFocusInput,
  onSongResultPress,
  onArtistPress,
  onAlbumPress,
  onPlaylistPress,
}: SearchSuggestionRowItemProps) {
  const index = item.label.toLowerCase().indexOf(query.trim().toLowerCase());
  const length = query.trim().length;
  const onPress = () => {
    if (item.kind === "query") return onSuggestionPress(item.label);
    Keyboard.dismiss();
    if (item.kind === "song") return onSongResultPress(item.song);
    if (item.kind === "artist") return onArtistPress(item.artist);
    if (item.kind === "album") return onAlbumPress(item.album, item.album.artist || "");
    onPlaylistPress(item.playlist, "");
  };
  const icon = {
    query: item.isHistory ? "time-outline" : "search-outline",
    song: "musical-note-outline",
    artist: "person-outline",
    album: "disc-outline",
    playlist: "list-outline",
  } as const;

  const highlightedTitle = (
    <Text style={styles.suggestionText} numberOfLines={1}>
      {index < 0 ? (
        item.label
      ) : (
        <>
          {item.label.slice(0, index)}
          <Text style={{ fontFamily: "Inter_700Bold" }}>{item.label.slice(index, index + length)}</Text>
          {item.label.slice(index + length)}
        </>
      )}
    </Text>
  );

  if (item.kind === "query") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.label}
        style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionRowPressed]}
        onPress={onPress}
      >
        <Ionicons name={icon[item.kind]} size={18} color={Colors.subtext} style={styles.suggestionIcon} />
        <View style={styles.suggestionContent}>{highlightedTitle}</View>
        <Pressable
          style={styles.suggestionInsertButton}
          accessibilityLabel={`Insert ${item.label}`}
          onPress={(event) => {
            event.stopPropagation();
            onChangeText(item.label);
            onFocusInput();
          }}
        >
          <Ionicons name="arrow-up-outline" size={20} color={Colors.subtext} style={{ transform: [{ rotate: "-45deg" }] }} />
        </Pressable>
      </Pressable>
    );
  }

  const artworkUri =
    item.kind === "song"
      ? item.song.coverUrl
      : item.kind === "artist"
        ? getBestImageUrl(item.artist.image)
        : item.kind === "album"
          ? getBestImageUrl(item.album.image)
          : getBestImageUrl(item.playlist.image);

  const subtitle =
    item.kind === "song"
      ? `Song · ${item.song.artist || "Mavrixfy"}`
      : item.kind === "artist"
        ? "Artist"
        : item.kind === "album"
          ? [item.album.artist || "Album", item.album.year].filter(Boolean).join(" · ")
          : item.playlist.songCount > 0
            ? `Playlist · ${item.playlist.songCount} songs`
            : "Playlist";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.label}, ${subtitle}`}
      style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionRowPressed]}
      onPress={onPress}
    >
      <View style={[styles.suggestionThumbWrap, item.kind === "artist" && styles.suggestionThumbRound]}>
        {artworkUri ? (
          <MusicArtwork
            uri={artworkUri}
            size={42}
            style={styles.suggestionThumbImage}
          />
        ) : (
          <Ionicons name={icon[item.kind]} size={18} color={Colors.subtext} />
        )}
      </View>
      <View style={styles.suggestionContent}>
        {highlightedTitle}
        <Text style={styles.suggestionSubtext} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

interface SearchScreenHeaderProps {
  isSearchMode: boolean;
  topInset: number;
  isHeaderElevated: boolean;
  inputRef: RefObject<TextInputInstance | null>;
  query: string;
  resultFilter: ResultFilter;
  scrollProgress: ReturnType<typeof useSharedValue<number>>;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onCancel: () => void;
  onFocusSearch: () => void;
  onFilterSelect: (filter: ResultFilter) => void;
}

function SearchScreenHeader({
  isSearchMode,
  topInset,
  isHeaderElevated,
  inputRef,
  query,
  resultFilter,
  scrollProgress,
  onChangeText,
  onSubmit,
  onClear,
  onCancel,
  onFocusSearch,
  onFilterSelect,
}: SearchScreenHeaderProps) {
  if (isSearchMode) {
    return (
      <View
        style={[
          styles.activeSearchHeader,
          { paddingTop: topInset + 6 },
          isHeaderElevated && styles.activeSearchHeaderElevated,
        ]}
      >
        <View style={styles.activeSearchBarRow}>
          <View style={styles.activeSearchFieldWrap}>
            <SearchHeaderField
              ref={inputRef}
              value={query}
              onChangeText={onChangeText}
              onSubmit={onSubmit}
              onClear={onClear}
              autoFocus={true}
              placeholder="Search songs, artists, albums..."
              theme="dark"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel search"
            onPress={onCancel}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            style={({ pressed }) => [styles.searchCancelButton, pressed && styles.searchCancelButtonPressed]}
          >
            <Text style={styles.searchCancelText}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.headerScopeBarWrap}>
          <SearchFilterBar
            activeKey={resultFilter}
            onSelect={onFilterSelect}
            scrollProgress={scrollProgress}
          />
        </View>
      </View>
    );
  }

  return (
    <>
      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Search"
        left={<AppTopHeaderProfileButton />}
        right={<AppTopHeaderDownloadButton />}
      />
      <View style={[styles.searchBarRow, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search songs, albums, artists, playlists"
          style={({ pressed }) => [styles.searchGlassButton, pressed && styles.searchGlassButtonPressed]}
          onPress={onFocusSearch}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <LiquidGlassView
            style={styles.liquidGlassBar}
            intensity={55}
            tint="systemMaterialDark"
            borderRadius={24}
          >
            <Ionicons name="search" size={19} color="rgba(255, 255, 255, 0.70)" style={styles.searchIcon} />
            <Text style={styles.inactiveSearchText} numberOfLines={1}>
              Search songs, artists, albums...
            </Text>
          </LiquidGlassView>
        </Pressable>
      </View>
    </>
  );
}

function SearchScreenView() {
  const params = useLocalSearchParams<{ q?: string | string[]; name?: string | string[] }>();
  const searchEngine = useSearchEngine(params);
  const inputRef = useRef<TextInputInstance>(null);
  const navSwipe = useOptionalNavSwipe();

  const {
    isOnline,
    preferredLanguages,
    topInset,
    query,
    isSearchMode,
    isHeaderElevated,
    suggestionsOpen,
    suggestionRows,
    showFocusedRecentSearches,
    showBrowse,
    recentSearches,
    browseCategories,
    resultFilter,
    searchLoading,
    searchError,
    retrySearch,
    searchDisplayQuery,
    songResults,
    albumResults,
    artistResults,
    playlistResults,
    handleHeaderScroll,
    handleChangeText,
    handleSubmitSearch,
    handleClear,
    handleActivateSearchMode,
    handleCancelSearchMode,
    handleGenrePress,
    handleRecentSearchPress,
    handleSuggestionPress,
    handleRemoveRecentSearch,
    handleClearRecentSearches,
    handleResultFilterSelect,
    handleSongResultPress,
    handleArtistPress,
    handleAlbumPress,
    handlePlaylistPress,
  } = searchEngine;

  const onFocusSearch = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    handleActivateSearchMode();
  }, [handleActivateSearchMode]);

  const scrollProgress = useSharedValue(getSearchTabIndex(resultFilter));
  const trimmedQuery = query.trim();
  const normalizedSuggestionKey = trimmedQuery.toLowerCase();
  const displayedSuggestionRows = useLiveSearchSuggestions(
    isSearchMode,
    suggestionsOpen,
    isOnline,
    trimmedQuery,
    normalizedSuggestionKey,
    preferredLanguages,
    suggestionRows
  );

  const showResultsView =
    !(isSearchMode && suggestionsOpen && displayedSuggestionRows.length > 0 && trimmedQuery) &&
    !showFocusedRecentSearches &&
    !showBrowse;

  useEffect(() => {
    if (!showResultsView) {
      scrollProgress.value = withTiming(getSearchTabIndex(resultFilter), { duration: 180 });
      navSwipe?.setInnerPagerBoundary("search", { blockPrev: false, blockNext: false });
    }
  }, [navSwipe, resultFilter, scrollProgress, showResultsView]);

  const handleFilterSelect = useCallback(
    (filter: ResultFilter) => {
      Keyboard.dismiss();
      handleResultFilterSelect(filter);
    },
    [handleResultFilterSelect]
  );

  const handleMenuSearchQuery = useCallback(
    (nextQuery: string) => {
      handleResultFilterSelect("songs");
      handleSuggestionPress(nextQuery);
    },
    [handleResultFilterSelect, handleSuggestionPress]
  );

  const onCancelSearch = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Keyboard.dismiss();
    inputRef.current?.blur();
    handleCancelSearchMode();
  }, [handleCancelSearchMode]);

  const focusSearchInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const renderSuggestion = useCallback(
    ({ item }: { item: SearchSuggestionRow }) => (
      <SearchSuggestionRowItem
        item={item}
        query={query}
        onSuggestionPress={handleSuggestionPress}
        onChangeText={handleChangeText}
        onFocusInput={focusSearchInput}
        onSongResultPress={handleSongResultPress}
        onArtistPress={handleArtistPress}
        onAlbumPress={handleAlbumPress}
        onPlaylistPress={handlePlaylistPress}
      />
    ),
    [
      query,
      handleSuggestionPress,
      handleChangeText,
      focusSearchInput,
      handleSongResultPress,
      handleArtistPress,
      handleAlbumPress,
      handlePlaylistPress,
    ]
  );

  if (!isOnline && query.length === 0) {
    return (
      <MainTabSwipeSurface route="search">
        <View style={styles.container}>
          <AppTopHeader
            topInset={topInset}
            elevated={false}
            title="Search"
            left={<AppTopHeaderProfileButton />}
            right={<AppTopHeaderDownloadButton />}
          />
          <OfflineScreen
            message="Search requires an internet connection."
            hideDownloadsButton={false}
          />
        </View>
      </MainTabSwipeSurface>
    );
  }

  return (
    <MainTabSwipeSurface route="search" disabled={isSearchMode && suggestionsOpen && displayedSuggestionRows.length > 0 && Boolean(trimmedQuery)}>
      <View style={styles.container}>
        {!isOnline && <OfflineBanner />}

        <SearchScreenHeader
          isSearchMode={isSearchMode}
          topInset={topInset}
          isHeaderElevated={isHeaderElevated}
          inputRef={inputRef}
          query={query}
          resultFilter={resultFilter}
          scrollProgress={scrollProgress}
          onChangeText={handleChangeText}
          onSubmit={handleSubmitSearch}
          onClear={handleClear}
          onCancel={onCancelSearch}
          onFocusSearch={onFocusSearch}
          onFilterSelect={handleFilterSelect}
        />

        {isSearchMode && suggestionsOpen && displayedSuggestionRows.length > 0 && trimmedQuery ? (
          <View style={styles.resultsWrap}>
            <FlatList
              data={displayedSuggestionRows}
              automaticallyAdjustKeyboardInsets
              keyboardDismissMode="none"
              keyboardShouldPersistTaps="always"
              keyExtractor={suggestionKeyExtractor}
              renderItem={renderSuggestion}
              contentContainerStyle={SUGGESTION_CONTENT_STYLE}
              initialNumToRender={12}
            />
          </View>
        ) : showFocusedRecentSearches ? (
          <SearchRecentSection
            topInset={topInset}
            headerHeight={isSearchMode ? 0 : undefined}
            recentSearches={recentSearches}
            onScroll={handleHeaderScroll}
            onRecentSearchPress={handleRecentSearchPress}
            onRemoveRecentSearch={handleRemoveRecentSearch}
            onClearRecentSearches={handleClearRecentSearches}
          />
        ) : showBrowse ? (
          <SearchBrowseSection
            browseCategories={browseCategories}
            onScroll={handleHeaderScroll}
            onGenrePress={handleGenrePress}
          />
        ) : (
          <SearchResultsSection
            topInset={topInset}
            headerHeight={isSearchMode ? 0 : undefined}
            resultFilter={resultFilter}
            onSelectFilter={handleFilterSelect}
            scrollProgress={scrollProgress}
            searchQuery={query}
            searchLoading={searchLoading}
            searchError={searchError}
            onRetry={retrySearch}
            searchDisplayQuery={searchDisplayQuery}
            songResults={songResults}
            albumResults={albumResults}
            artistResults={artistResults}
            playlistResults={playlistResults}
            onScroll={handleHeaderScroll}
            onSongPress={handleSongResultPress}
            onArtistPress={handleArtistPress}
            onAlbumPress={handleAlbumPress}
            onPlaylistPress={handlePlaylistPress}
            onSearchQuery={handleMenuSearchQuery}
          />
        )}
      </View>
    </MainTabSwipeSurface>
  );
}
