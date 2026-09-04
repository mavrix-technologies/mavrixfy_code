import { useState, useReducer, useRef, useCallback, useEffect, useMemo } from "react";
import { Platform, Keyboard, type FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";

import { getBestImageUrl, type Song } from "@/lib/musicData";
import { useAppTopHeaderScrollElevation } from "@/components/AppTopHeader";
import { useNetwork, useOnReconnect } from "@/contexts/NetworkContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { filterMap, sortedCopy } from "@/lib/arrayUtils";
import {
  addSongSearchHistoryItem,
  addSearchHistoryItem,
  getSearchHistory,
  removeSearchHistoryItem,
} from "@/lib/storage";
import { normalizeText } from "@/lib/searchUtils";
import {
  searchRepository,
  fetchYouTubeSuggestions,
  type ResultFilter,
  type PlaylistResult,
  type AlbumResult,
  type ArtistResult,
  type SearchResults,
  EMPTY_RESULTS,
} from "@/lib/searchRepository";
import {
  type RecentSearchItem,
  type BrowseCategory,
  getRouteSearchQuery,
  normalizeRecentSearchLabel,
  normalizeSearchSuggestionList,
  toRecentSearchItems,
  STITCH_BROWSE_CATEGORIES,
} from "../types";

import {
  type SearchScreenState,
  type SearchScreenAction,
  searchScreenReducer,
  createInitialSearchState,
} from "./searchEngineReducer";

export {
  type SearchScreenState,
  type SearchScreenAction,
  searchScreenReducer,
  createInitialSearchState,
};

export function useSearchEngine(params: { q?: string | string[]; name?: string | string[] }) {
  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const { isOnline } = useNetwork();
  const { playSong } = usePlayerActions();

  const routeSearchQuery = getRouteSearchQuery(params);
  const [state, dispatch] = useReducer(
    searchScreenReducer,
    routeSearchQuery,
    createInitialSearchState
  );
  const {
    query,
    results,
    searchDisplayQuery,
    resultFilter,
    searchLoading,
    isSearchMode,
    suggestions,
    suggestionsOpen,
  } = state;
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

  const {
    isHeaderElevated,
    handleHeaderScroll,
    resetHeaderElevation,
  } = useAppTopHeaderScrollElevation();

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const suggestionsClosedForQueryRef = useRef<string | null>(null);
  const appliedRouteSearchQueryRef = useRef(routeSearchQuery);
  const activeSearchAbortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef("");
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);

  const resultsPlaylistsListRef = useRef<FlatList<PlaylistResult> | null>(null);
  const resultsAlbumsListRef = useRef<FlatList<AlbumResult> | null>(null);
  const resultsArtistsListRef = useRef<FlatList<ArtistResult> | null>(null);
  const resultsSongsListRef = useRef<FlatList<Song> | null>(null);

  const searchCacheRef = useRef<Map<string, SearchResults>>(new Map());
  const searchCache = searchCacheRef.current;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const shuffledBrowseCategories = useMemo(() => {
    const hero = STITCH_BROWSE_CATEGORIES.find((item) => item.isHero);
    const rest = STITCH_BROWSE_CATEGORIES.filter((item) => !item.isHero);
    const randomized = sortedCopy(rest, () => Math.random() - 0.5);
    return hero ? [hero, ...randomized] : randomized;
  }, []);
  const browseCategories = useMemo(
    () => filterMap(shuffledBrowseCategories, (category) => !category.isHero, (category) => category),
    [shuffledBrowseCategories]
  );

  const performSearch = useCallback(
    async (searchQuery: string) => {
      const requestId = ++requestSeqRef.current;
      const normalizedQuery = searchQuery.trim();

      if (normalizedQuery.length < 2) {
        activeSearchAbortRef.current?.abort();
        activeSearchAbortRef.current = null;
        dispatch({ type: "SEARCH_RESET", displayQuery: "" });
        return;
      }

      activeSearchAbortRef.current?.abort();
      const controller = new AbortController();
      activeSearchAbortRef.current = controller;

      const cacheKey = `${resultFilter}:${normalizedQuery.toLowerCase()}`;
      const cached = searchCache.get(cacheKey);
      if (cached) {
        dispatch({ type: "SEARCH_SUCCESS", results: cached, displayQuery: normalizedQuery });
        if (activeSearchAbortRef.current === controller) {
          activeSearchAbortRef.current = null;
        }
        return;
      }

      dispatch({ type: "SET_SEARCH_LOADING", loading: true });

      try {
        const nextResults = await searchRepository(normalizedQuery, resultFilter, controller.signal);

        if (requestId !== requestSeqRef.current || controller.signal.aborted) {
          return;
        }

        dispatch({ type: "SEARCH_SUCCESS", results: nextResults, displayQuery: normalizedQuery });

        searchCache.set(cacheKey, nextResults);
        if (searchCache.size > 25) {
          const firstKey = searchCache.keys().next().value;
          if (firstKey) searchCache.delete(firstKey);
        }

        if (activeSearchAbortRef.current === controller) {
          activeSearchAbortRef.current = null;
        }
      } catch {
        if (requestId !== requestSeqRef.current || controller.signal.aborted) {
          return;
        }
        dispatch({ type: "SEARCH_RESET", displayQuery: normalizedQuery });
        if (activeSearchAbortRef.current === controller) {
          activeSearchAbortRef.current = null;
        }
      }
    },
    [resultFilter, searchCache]
  );

  const handleChangeText = useCallback((text: string) => {
    dispatch({ type: "SET_QUERY", query: text });
    suggestionsClosedForQueryRef.current = null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      void getSearchHistory()
        .then((items) => {
          if (isActive) {
            setRecentSearches(toRecentSearchItems(items));
          }
        })
        .catch(() => undefined);

      return () => {
        isActive = false;
      };
    }, [])
  );

  useOnReconnect(
    useCallback(() => {
      const trimmed = query.trim();
      if (trimmed.length >= 2) {
        searchCache.clear();
        void performSearch(trimmed);
      }
    }, [query, searchCache, performSearch])
  );

  // Debounced query suggestions
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      dispatch({ type: "CLOSE_SUGGESTIONS" });
      return;
    }

    if (suggestionsClosedForQueryRef.current === normalizeText(trimmed)) {
      dispatch({ type: "SET_SUGGESTIONS_OPEN", open: false });
      return;
    }

    if (suggestionsTimerRef.current) {
      clearTimeout(suggestionsTimerRef.current);
    }

    suggestionsTimerRef.current = setTimeout(() => {
      suggestionsAbortRef.current?.abort();
      const controller = new AbortController();
      suggestionsAbortRef.current = controller;

      void fetchYouTubeSuggestions(trimmed, controller.signal)
        .then((rawSuggestions) => {
          if (controller.signal.aborted) return;
          const cleanSuggestions = normalizeSearchSuggestionList(trimmed, rawSuggestions);
          dispatch({ type: "SET_SUGGESTIONS", suggestions: cleanSuggestions });
        })
        .catch(() => {});
    }, 150);

    return () => {
      if (suggestionsTimerRef.current) {
        clearTimeout(suggestionsTimerRef.current);
      }
      suggestionsAbortRef.current?.abort();
    };
  }, [query]);

  const rememberRecentSearch = useCallback((label: string) => {
    const normalized = normalizeRecentSearchLabel(label);
    if (normalized.length < 2) return;

    setRecentSearches((prev) => {
      const nextItem: RecentSearchItem = {
        id: `q_${encodeURIComponent(normalized.toLowerCase()).slice(0, 100)}`,
        label: normalized,
        type: "query",
        icon: "time-outline",
      };
      const filtered = prev.filter(
        (item) => item.label.toLowerCase() !== normalized.toLowerCase()
      );
      return [nextItem, ...filtered].slice(0, 12);
    });

    void addSearchHistoryItem(normalized)
      .then((items) => setRecentSearches(toRecentSearchItems(items)))
      .catch(() => undefined);
  }, []);

  const applyProgrammaticSearchQuery = useCallback((next: string) => {
    dispatch({ type: "APPLY_PROGRAMMATIC_QUERY", query: next });
  }, []);

  useEffect(() => {
    const next = routeSearchQuery;
    if (next.length < 2 || next === appliedRouteSearchQueryRef.current) return;

    appliedRouteSearchQueryRef.current = next;
    applyProgrammaticSearchQuery(next);
    suggestionsClosedForQueryRef.current = normalizeText(next);
    rememberRecentSearch(next);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    void performSearch(next);
  }, [applyProgrammaticSearchQuery, performSearch, rememberRecentSearch, routeSearchQuery]);

  const handleGenrePress = useCallback(
    (genreName: string) => {
      const next = genreName.trim();
      if (!next) return;
      resetHeaderElevation();
      dispatch({ type: "SELECT_QUERY", query: next });
      suggestionsClosedForQueryRef.current = normalizeText(next);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, rememberRecentSearch, resetHeaderElevation]
  );

  const handleRecentSearchPress = useCallback(
    (item: RecentSearchItem) => {
      if (item.type === "song" && item.song) {
        playSong(item.song, [item.song]);
        void addSongSearchHistoryItem(item.song)
          .then((items) => setRecentSearches(toRecentSearchItems(items)))
          .catch(() => undefined);
        return;
      }

      const next = item.label.trim();
      if (next.length < 2) return;
      resetHeaderElevation();
      dispatch({ type: "SELECT_QUERY", query: next });
      suggestionsClosedForQueryRef.current = normalizeText(next);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, playSong, rememberRecentSearch, resetHeaderElevation]
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      const next = normalizeRecentSearchLabel(suggestion);
      if (next.length < 2) return;
      resetHeaderElevation();
      dispatch({ type: "SELECT_QUERY", query: next, resetFilter: true });
      suggestionsClosedForQueryRef.current = normalizeText(next);
      Keyboard.dismiss();
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      void performSearch(next);
    },
    [performSearch, rememberRecentSearch, resetHeaderElevation]
  );

  const handleRemoveRecentSearch = useCallback((id: string) => {
    setRecentSearches((prev) => prev.filter((item) => item.id !== id));
    void removeSearchHistoryItem(id)
      .then((items) => setRecentSearches(toRecentSearchItems(items)))
      .catch(() => undefined);
  }, []);

  const handleResultFilterSelect = useCallback(
    (filter: ResultFilter) => {
      resetHeaderElevation();
      dispatch({ type: "SET_RESULT_FILTER", filter });
    },
    [resetHeaderElevation]
  );

  const cancelActiveSearchWork = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    activeSearchAbortRef.current?.abort();
    activeSearchAbortRef.current = null;
  }, []);

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    suggestionsClosedForQueryRef.current = normalizeText(trimmed);
    dispatch({ type: "CLOSE_SUGGESTIONS" });
    Keyboard.dismiss();
    rememberRecentSearch(trimmed);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    void performSearch(trimmed);
  }, [performSearch, query, rememberRecentSearch]);

  const handleClear = useCallback(() => {
    requestSeqRef.current += 1;
    cancelActiveSearchWork();
    suggestionsClosedForQueryRef.current = null;
    dispatch({ type: "CLEAR_SEARCH" });
  }, [cancelActiveSearchWork]);

  const handleActivateSearchMode = useCallback(() => {
    resetHeaderElevation();
    dispatch({ type: "ACTIVATE_SEARCH_MODE" });
  }, [resetHeaderElevation]);

  const handleCancelSearchMode = useCallback(() => {
    requestSeqRef.current += 1;
    cancelActiveSearchWork();
    suggestionsClosedForQueryRef.current = null;
    resetHeaderElevation();
    dispatch({ type: "CANCEL_SEARCH_MODE" });
  }, [cancelActiveSearchWork, resetHeaderElevation]);

  // Main search debounce pipeline
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestSeqRef.current += 1;
      cancelActiveSearchWork();
      dispatch({ type: "SEARCH_RESET", displayQuery: "" });
      lastQueryRef.current = "";
      return;
    }

    if (trimmed === lastQueryRef.current) {
      dispatch({ type: "SET_SEARCH_LOADING", loading: true });
      void performSearch(trimmed);
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    dispatch({ type: "SET_SEARCH_LOADING", loading: true });
    const searchTimer = setTimeout(() => {
      lastQueryRef.current = trimmed;
      void performSearch(trimmed);
    }, 300);
    debounceTimer.current = searchTimer;

    return () => {
      clearTimeout(searchTimer);
    };
  }, [performSearch, query, resultFilter, cancelActiveSearchWork]);

  useEffect(() => {
    return cancelActiveSearchWork;
  }, [cancelActiveSearchWork]);

  const { songs: songResults, albums: albumResults, artists: artistResults, playlists: playlistResults } = results;

  const hasResults =
    songResults.length > 0 ||
    albumResults.length > 0 ||
    artistResults.length > 0 ||
    playlistResults.length > 0;

  const showFocusedRecentSearches = isSearchMode && query.trim().length < 2;
  const showBrowse = !isSearchMode && query.trim().length < 2;
  const resultDataKey = `${query.trim()}-${resultFilter}-${songResults.length}-${albumResults.length}-${artistResults.length}-${playlistResults.length}-${searchLoading ? 1 : 0}`;

  const showAlbumResults = (resultFilter === "all" || resultFilter === "albums") && albumResults.length > 0;
  const showArtistResults = (resultFilter === "all" || resultFilter === "artists") && artistResults.length > 0;
  const showPlaylistResults = (resultFilter === "all" || resultFilter === "playlists") && playlistResults.length > 0;
  const showSongResults = (resultFilter === "all" || resultFilter === "songs") && songResults.length > 0;

  const topSong = songResults[0];
  const topArtist = artistResults[0];

  const displayedSongs = useMemo(() => (showSongResults ? songResults : []), [showSongResults, songResults]);
  const featuredAlbums = useMemo(() => albumResults.slice(0, 6), [albumResults]);
  const featuredArtists = useMemo(() => artistResults.slice(0, 5), [artistResults]);
  const featuredPlaylists = useMemo(() => playlistResults.slice(0, 6), [playlistResults]);

  const handleSongResultPress = useCallback(
    (song: Song) => {
      playSong(song, songResults);
      void addSongSearchHistoryItem(song)
        .then((items) => setRecentSearches(toRecentSearchItems(items)))
        .catch(() => undefined);
    },
    [playSong, songResults]
  );

  const handleArtistPress = useCallback(
    (artist: ArtistResult) => {
      routerPush(
        {
          pathname: "/artist/[id]",
          params: {
            id: artist.id,
            name: artist.name,
            image: getBestImageUrl(artist.image),
          },
        },
        {
          withAnchor: true,
          dangerouslySingular: () => "artist-profile",
        }
      );
    },
    [routerPush]
  );

  const handleAlbumPress = useCallback(
    (album: AlbumResult, meta: string) => {
      routerPush(
        {
          pathname: "/playlist/[id]",
          params: {
            id: String(album.id).trim(),
            jiosaavn: "true",
            youtube: "false",
            album: "true",
            firestore: "false",
            link: album.url || "",
            title: album.name,
            description: album.description || meta,
            cover: getBestImageUrl(album.image),
            songCount: String(Math.max(0, album.songCount || 0)),
          },
        },
        {
          withAnchor: true,
          dangerouslySingular: () => "playlist-details",
        }
      );
    },
    [routerPush]
  );

  const handlePlaylistPress = useCallback(
    (playlist: PlaylistResult, meta: string) => {
      routerPush(
        {
          pathname: "/playlist/[id]",
          params: {
            id: String(playlist.id).trim(),
            jiosaavn: "true",
            youtube: "false",
            firestore: "false",
            link: playlist.url || "",
            title: playlist.name,
            description: playlist.description || meta,
            cover: getBestImageUrl(playlist.image),
            songCount: String(Math.max(0, playlist.songCount || 0)),
          },
        },
        {
          withAnchor: true,
          dangerouslySingular: () => "playlist-details",
        }
      );
    },
    [routerPush]
  );

  return {
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
    showAlbumResults,
    showArtistResults,
    showPlaylistResults,
    showSongResults,
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
  };
}
