import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Keyboard,
  LayoutAnimation,
  Platform,
  UIManager,
  TextInput,
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
import LiquidGlassView from "@/components/LiquidGlassView";
import LiquidGlassScopeBar from "@/components/LiquidGlassScopeBar";
import { styles } from "../styles/searchStyles";
import { RESULT_FILTERS } from "../types";
import { useSearchEngine } from "../hooks/useSearchEngine";
import {
  SearchBrowseSection,
  SearchRecentSection,
} from "../components/SearchBrowseSection";
import { SearchResultsSection } from "../components/SearchResultsSection";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SearchScreen() {
  return <SearchScreenView />;
}

export default SearchScreen;

function SearchScreenView() {
  const params = useLocalSearchParams<{ q?: string | string[]; name?: string | string[] }>();
  const searchEngine = useSearchEngine(params);
  const inputRef = useRef<TextInput>(null);

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

  const onFocusSearch = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    handleActivateSearchMode();
  }, [handleActivateSearchMode]);

  const onCancelSearch = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Keyboard.dismiss();
    inputRef.current?.blur();
    handleCancelSearchMode();
  }, [handleCancelSearchMode]);

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

      {/* ── Header ── */}
      {isSearchMode ? (
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
                onChangeText={handleChangeText}
                onSubmit={handleSubmitSearch}
                onClear={handleClear}
                autoFocus={true}
                placeholder="Search songs, artists, albums..."
                theme="dark"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel search"
              onPress={onCancelSearch}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              style={({ pressed }) => [styles.searchCancelButton, pressed && styles.searchCancelButtonPressed]}
            >
              <Text style={styles.searchCancelText}>Cancel</Text>
            </Pressable>
          </View>

          {/* Liquid Glass Scope Bar integrated directly in header */}
          <View style={styles.headerScopeBarWrap}>
            <LiquidGlassScopeBar
              options={RESULT_FILTERS}
              activeKey={resultFilter}
              onSelect={handleResultFilterSelect}
            />
          </View>
        </View>
      ) : (
        <AppTopHeader
          topInset={topInset}
          elevated={isHeaderElevated}
          title="Search"
          left={<AppTopHeaderProfileButton />}
          right={<AppTopHeaderDownloadButton />}
        />
      )}

      {/* ── Native Liquid Glass Search Button ── */}
      {!isSearchMode && (
        <View style={[styles.searchBarRow, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search songs, albums, artists, playlists"
            style={({ pressed }) => [styles.searchGlassButton, pressed && styles.searchGlassButtonPressed]}
            onPress={onFocusSearch}
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
      )}

      {/* Inline suggestions below search header */}
      {isSearchMode && suggestionsOpen && suggestions.length > 0 && query.trim().length >= 2 && (
        <View style={[styles.suggestionsDropdown, { top: topInset + 104 }]}>
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
