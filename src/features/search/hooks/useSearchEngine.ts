import { useFocusEffect,useRouter } from "expo-router";
import { useCallback,useEffect,useMemo,useReducer,useRef,useState } from "react";
import { Keyboard,Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTopHeaderScrollElevation } from "@/components/AppTopHeader";
import { useNetwork,useOnReconnect } from "@/contexts/NetworkContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { getBestImageUrl,type Song } from "@/lib/musicData";
import {
type AlbumResult,
type ArtistResult,
fetchYouTubeSuggestions,
type PlaylistResult,
type ResultFilter,
searchRepository,

} from "@/lib/searchRepository";
import { clearYouTubeSearchCache } from "@/services/youtube/YouTubeMusic";
import { normalizeText } from "@/lib/searchUtils";
import {
addSearchHistoryItem,
addSongSearchHistoryItem,
getSearchHistory,
removeSearchHistoryItem,
} from "@/lib/storage";
import {
getRouteSearchQuery,
normalizeRecentSearchLabel,
normalizeSearchSuggestionList,
type RecentSearchItem,
STITCH_BROWSE_CATEGORIES,
toRecentSearchItems
} from "../types";

import {
createInitialSearchState,
type SearchScreenAction,
searchScreenReducer,
type SearchScreenState,
} from "./searchEngineReducer";

export {
createInitialSearchState,searchScreenReducer,type SearchScreenAction,type SearchScreenState
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
    searchError,
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
  const suggestionsClosedForQueryRef = useRef<string | null>(routeSearchQuery ? normalizeText(routeSearchQuery) : null);
  const appliedRouteSearchQueryRef = useRef(routeSearchQuery);
  const activeSearchAbortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef("");
  const issuedKeyRef = useRef("");
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const browseCategories = STITCH_BROWSE_CATEGORIES;

  const performSearch = useCallback(
    async (searchQuery: string) => {
      const requestId = ++requestSeqRef.current;
      const normalizedQuery = searchQuery.trim();

      if (!normalizedQuery) {
        activeSearchAbortRef.current?.abort();
        activeSearchAbortRef.current = null;
        dispatch({ type: "SEARCH_RESET", displayQuery: "" });
        return;
      }

      activeSearchAbortRef.current?.abort();
      const controller = new AbortController();
      activeSearchAbortRef.current = controller;

      issuedKeyRef.current = `${resultFilter}:${normalizedQuery}`;
      lastQueryRef.current = normalizedQuery;
      dispatch({ type: "SET_SEARCH_LOADING", loading: true });

      try {
        const nextResults = await searchRepository(normalizedQuery, resultFilter, controller.signal);

        if (requestId !== requestSeqRef.current || controller.signal.aborted) {
          return;
        }

        dispatch({ type: "SEARCH_SUCCESS", results: nextResults, displayQuery: normalizedQuery });

        if (activeSearchAbortRef.current === controller) {
          activeSearchAbortRef.current = null;
        }
      } catch {
        if (requestId !== requestSeqRef.current || controller.signal.aborted) {
          return;
        }
        dispatch({ type: "SEARCH_FAILED", displayQuery: normalizedQuery });
        if (activeSearchAbortRef.current === controller) {
          activeSearchAbortRef.current = null;
        }
      }
    },
    [resultFilter]
  );

  const handleChangeText = useCallback((text: string) => {
    if (text === query) return;
    issuedKeyRef.current = "";
    requestSeqRef.current++;
    activeSearchAbortRef.current?.abort();
    suggestionsAbortRef.current?.abort();
    dispatch({ type: "SET_QUERY", query: text });
    suggestionsClosedForQueryRef.current = null;
  }, [query]);

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
      if (trimmed.length > 0) {
        clearYouTubeSearchCache();
        void performSearch(trimmed);
      }
    }, [query, performSearch])
  );

  // Debounced query suggestions
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
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
          if (controller.signal.aborted || suggestionsClosedForQueryRef.current === normalizeText(trimmed)) return;
          const cleanSuggestions = normalizeSearchSuggestionList(rawSuggestions);
          dispatch({ type: "SET_SUGGESTIONS", suggestions: cleanSuggestions });
        })
        .catch(() => {});
    }, 120);

    return () => {
      if (suggestionsTimerRef.current) {
        clearTimeout(suggestionsTimerRef.current);
      }
      suggestionsAbortRef.current?.abort();
    };
  }, [query]);

  const rememberRecentSearch = useCallback((label: string) => {
    const normalized = normalizeRecentSearchLabel(label);
    if (!normalized) return;

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
    if (!next || next === appliedRouteSearchQueryRef.current) return;

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
    [performSearch, playSong, rememberRecentSearch, resetHeaderElevation]
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      const next = normalizeRecentSearchLabel(suggestion);
      if (!next) return;
      resetHeaderElevation();
      dispatch({ type: "SELECT_QUERY", query: next });
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
      if (filter === resultFilter) return;
      issuedKeyRef.current = "";
      suggestionsClosedForQueryRef.current = normalizeText(query);
      suggestionsAbortRef.current?.abort();
      activeSearchAbortRef.current?.abort();
      requestSeqRef.current++;
      resetHeaderElevation();
      dispatch({ type: "SET_RESULT_FILTER", filter });
    },
    [resetHeaderElevation, resultFilter, query]
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
    if (!trimmed) return;
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
    issuedKeyRef.current = "";
    suggestionsAbortRef.current?.abort();
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
    issuedKeyRef.current = "";
    suggestionsAbortRef.current?.abort();
    cancelActiveSearchWork();
    suggestionsClosedForQueryRef.current = null;
    resetHeaderElevation();
    dispatch({ type: "CANCEL_SEARCH_MODE" });
  }, [cancelActiveSearchWork, resetHeaderElevation]);

  // Main search debounce pipeline
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      requestSeqRef.current += 1;
      cancelActiveSearchWork();
      dispatch({ type: "SEARCH_RESET", displayQuery: "" });
      lastQueryRef.current = "";
      issuedKeyRef.current = "";
      return;
    }

    if (`${resultFilter}:${trimmed}` === issuedKeyRef.current) return;
    issuedKeyRef.current = "";
    requestSeqRef.current++;
    activeSearchAbortRef.current?.abort();
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    dispatch({ type: "SET_SEARCH_LOADING", loading: true });
    const searchTimer = setTimeout(() => {
      lastQueryRef.current = trimmed;
      void performSearch(trimmed);
    }, lastQueryRef.current === trimmed ? 0 : 400);
    debounceTimer.current = searchTimer;

    return () => {
      clearTimeout(searchTimer);
    };
  }, [performSearch, query, resultFilter, cancelActiveSearchWork]);

  useEffect(() => {
    return cancelActiveSearchWork;
  }, [cancelActiveSearchWork]);

  const {
    songs: songResults,
    albums: albumResults,
    artists: artistResults,
    playlists: playlistResults,
  } = results;

  const showFocusedRecentSearches = isSearchMode && query.trim().length === 0;
  const showBrowse = !isSearchMode && query.trim().length === 0;
  const handleSongResultPress = useCallback(
    (song: Song) => {
      const activeQueue = songResults.length > 0 ? songResults : [song];
      playSong(song, activeQueue);
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
            jiosaavn: "false",
            youtube: "true",
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
            jiosaavn: "false",
            youtube: "true",
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


  const suggestionRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = recentSearches.filter(item => item.type === "query" && item.label.toLowerCase().includes(q)).slice(0, 3);
    const seen = new Set(matching.map(item => item.label.toLowerCase()));
    return [...matching.map(item => ({ label: item.label, isHistory: true })),
      ...suggestions.filter(label => !seen.has(label.toLowerCase())).map(label => ({ label, isHistory: false }))];
  }, [query, recentSearches, suggestions]);

  return {
    isOnline,
    topInset,
    query,
    isSearchMode,
    isHeaderElevated,
    suggestionsOpen,
    suggestions,
    suggestionRows,
    showFocusedRecentSearches,
    showBrowse,
    recentSearches,
    browseCategories,
    resultFilter,
    searchLoading,
    searchError,
    retrySearch: () => void performSearch(query.trim()),
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
  };
}
