import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import Colors from "@/constants/colors";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderDownloadButton,
  AppTopHeaderProfileButton,
} from "@/components/AppTopHeader";
import SearchHeaderField from "@/components/SearchHeaderField";
import { styles } from "../styles/searchStyles";
import { useSearchEngine } from "../hooks/useSearchEngine";
import {
  SearchBrowseSection,
  SearchRecentSection,
} from "../components/SearchBrowseSection";
import { SearchResultsSection } from "../components/SearchResultsSection";

export function SearchScreen() {
  return <SearchScreenView />;
}

export default SearchScreen;

function SearchScreenView() {
  const params = useLocalSearchParams<{ q?: string | string[]; name?: string | string[] }>();
  const searchEngine = useSearchEngine(params);

  const {
    isOnline,
    topInset,
    query,
    isSearchMode,
    isHeaderElevated,
    suggestionsOpen,
    suggestions,
    showFocusedRecentSearches,
    showBrowse,
    recentSearches,
    browseCategories,
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
    resultsPlaylistsListRef,
    resultsAlbumsListRef,
    resultsArtistsListRef,
    resultsSongsListRef,
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
    handleResultFilterSelect,
    handleSongResultPress,
    handleArtistPress,
    handleAlbumPress,
    handlePlaylistPress,
  } = searchEngine;

  const renderSuggestion = useCallback(
    ({ item: suggestion }: { item: string }) => (
      <Pressable
        style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionRowPressed]}
        onPressIn={() => handleSuggestionPress(suggestion)}
      >
        <Ionicons name="search-outline" size={18} color={Colors.subtext} style={styles.suggestionIcon} />
        <Text style={styles.suggestionText} numberOfLines={1}>
          {suggestion}
        </Text>
      </Pressable>
    ),
    [handleSuggestionPress]
  );

  // Early return for offline idle state
  if (!isOnline && query.length === 0) {
    return (
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
    );
  }

  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner />}
      {isSearchMode ? (
        <AppTopHeader
          topInset={topInset}
          elevated={isHeaderElevated}
          titleNode={
            <SearchHeaderField
              value={query}
              onChangeText={handleChangeText}
              onSubmit={handleSubmitSearch}
              onClear={handleClear}
              autoFocus={isSearchMode}
            />
          }
          leftWidth={0}
          rightWidth={68}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel search"
              onPress={handleCancelSearchMode}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={({ pressed }) => [styles.searchCancelButton, pressed && styles.searchCancelButtonPressed]}
            >
              <Text style={styles.searchCancelText}>Cancel</Text>
            </Pressable>
          }
        />
      ) : (
        <AppTopHeader
          topInset={topInset}
          elevated={isHeaderElevated}
          title="Search"
          left={<AppTopHeaderProfileButton />}
        />
      )}
      {!isSearchMode ? (
        <View style={[styles.searchBarRow, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search songs, albums, artists, playlists"
            style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}
            onPress={handleActivateSearchMode}
          >
            <Ionicons name="search" size={20} color="#1E293B" style={styles.searchIcon} />
            <Text style={styles.inactiveSearchText} numberOfLines={1}>
              Search "songs, artists, albums..."
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Inline suggestions below search bar */}
      {isSearchMode && suggestionsOpen && suggestions.length > 0 && query.trim().length >= 2 && (
        <View style={[styles.suggestionsDropdown, { top: topInset + APP_TOP_HEADER_HEIGHT }]}>
          <FlatList
            data={suggestions}
            keyboardDismissMode="none"
            keyboardShouldPersistTaps="always"
            keyExtractor={(suggestion) => `suggestion-${suggestion}`}
            renderItem={renderSuggestion}
          />
        </View>
      )}

      {showFocusedRecentSearches ? (
        <SearchRecentSection
          topInset={topInset}
          recentSearches={recentSearches}
          onScroll={handleHeaderScroll}
          onRecentSearchPress={handleRecentSearchPress}
          onRemoveRecentSearch={handleRemoveRecentSearch}
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
          resultFilter={resultFilter}
          searchLoading={searchLoading}
          hasResults={hasResults}
          searchDisplayQuery={searchDisplayQuery}
          resultDataKey={resultDataKey}
          displayedSongs={displayedSongs}
          songResults={songResults}
          albumResults={albumResults}
          artistResults={artistResults}
          playlistResults={playlistResults}
          topSong={topSong}
          topArtist={topArtist}
          featuredAlbums={featuredAlbums}
          featuredArtists={featuredArtists}
          featuredPlaylists={featuredPlaylists}
          onScroll={handleHeaderScroll}
          onFilterSelect={handleResultFilterSelect}
          onSongPress={handleSongResultPress}
          onArtistPress={handleArtistPress}
          onAlbumPress={handleAlbumPress}
          onPlaylistPress={handlePlaylistPress}
          resultsPlaylistsListRef={resultsPlaylistsListRef}
          resultsAlbumsListRef={resultsAlbumsListRef}
          resultsArtistsListRef={resultsArtistsListRef}
          resultsSongsListRef={resultsSongsListRef}
        />
      )}
    </View>
  );
}
