import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback,useRef } from "react";
import {
FlatList,
Keyboard,
LayoutAnimation,
Platform,
Pressable,
Text,
TextInput,
UIManager,
View,
} from "react-native";

import AppTopHeader,{
APP_TOP_HEADER_HEIGHT,
AppTopHeaderDownloadButton,
AppTopHeaderProfileButton,
} from "@/components/AppTopHeader";
import { SearchFilterBar } from "../components/SearchFilterBar";
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
import { useSearchEngine } from "../hooks/useSearchEngine";
import { styles } from "../styles/searchStyles";

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

  const renderSuggestion = useCallback(({ item }: { item: { label: string; isHistory: boolean } }) => {
    const index = item.label.toLowerCase().indexOf(query.trim().toLowerCase());
    const length = query.trim().length;
    return (
      <Pressable style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionRowPressed]} onPress={() => handleSuggestionPress(item.label)}>
        <Ionicons name={item.isHistory ? "time-outline" : "search-outline"} size={18} color={Colors.subtext} style={styles.suggestionIcon} />
        <Text style={styles.suggestionText} numberOfLines={1}>
          {index < 0 ? item.label : <>{item.label.slice(0, index)}<Text style={{ fontFamily: "Inter_700Bold" }}>{item.label.slice(index, index + length)}</Text>{item.label.slice(index + length)}</>}
        </Text>
        <Pressable style={styles.suggestionInsertButton} accessibilityLabel={`Insert ${item.label}`} onPress={event => { event.stopPropagation(); handleChangeText(item.label); inputRef.current?.focus(); }}>
          <Ionicons name="arrow-up-outline" size={20} color={Colors.subtext} style={{ transform: [{ rotate: "-45deg" }] }} />
        </Pressable>
      </Pressable>
    );
  }, [query, handleSuggestionPress, handleChangeText]);


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

          {/* Search filters share the header width on compact devices. */}
          <View style={styles.headerScopeBarWrap}>
            <SearchFilterBar
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
      )}

      {isSearchMode && suggestionsOpen && suggestionRows.length > 0 && query.trim() ? (
        <View style={styles.resultsWrap}>
          <FlatList data={suggestionRows} automaticallyAdjustKeyboardInsets keyboardDismissMode="none" keyboardShouldPersistTaps="always"
            keyExtractor={item => `${item.isHistory ? "history" : "suggestion"}:${item.label}`}
            renderItem={renderSuggestion} contentContainerStyle={{ paddingBottom: 146 }} initialNumToRender={10} />
        </View>
      ) : showFocusedRecentSearches ? (
        <SearchRecentSection
          topInset={topInset}
          headerHeight={isSearchMode ? 0 : undefined}
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
          headerHeight={isSearchMode ? 0 : undefined}
          resultFilter={resultFilter}
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
        />
      )}
    </View>
  );
}
