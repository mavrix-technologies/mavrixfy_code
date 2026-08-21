import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import Colors from "@/constants/colors";
import { getBestImageUrl, Song } from "@/lib/musicData";
import SongRow from "@/components/SongRow";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderDownloadButton,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import SearchHeaderField from "@/components/SearchHeaderField";
import SearchResultFilterChip from "@/components/SearchResultFilterChip";
import { useNetwork, useOnReconnect } from "@/contexts/NetworkContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { filterMap, sortedCopy } from "@/lib/arrayUtils";
import {
  addSongSearchHistoryItem,
  addSearchHistoryItem,
  getSearchHistory,
  removeSearchHistoryItem,
  type SearchHistoryItem,
} from "@/lib/storage";
import AdMobNativeVideo from "@/components/AdMobNativeVideo";
import { normalizeText } from "@/lib/searchUtils";
import {
  searchRepository,
  fetchYouTubeSuggestions,
  ResultFilter,
  PlaylistResult,
  AlbumResult,
  ArtistResult,
  SearchResults,
  EMPTY_RESULTS,
} from "@/lib/searchRepository";

interface RecentSearchItem {
  id: string;
  label: string;
  subtitle?: string;
  imageUrl?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: "song" | "playlist" | "artist" | "query";
  song?: Song;
}

interface BrowseCategory {
  id: string;
  title: string;
  color: string;
  imageUrl: string;
  isHero?: boolean;
}

const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "artists", label: "Artists" },
  { key: "playlists", label: "Playlists" },
];

const CARD_ROTATION_PATTERN = [-11, 8, -7, 10, -5, 6] as const;
const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");
const MAX_SEARCH_SUGGESTIONS = 8;

function getRouteSearchQuery(params: { q?: string | string[]; name?: string | string[] }) {
  const incomingQuery = Array.isArray(params.q)
    ? params.q[0]
    : params.q || (Array.isArray(params.name) ? params.name[0] : params.name);
  return String(incomingQuery || "").trim();
}

function normalizeRecentSearchLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSearchSuggestionList(query: string, items: string[]): string[] {
  const normalizedQuery = normalizeText(query);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const label = normalizeRecentSearchLabel(String(item || ""));
    const key = normalizeText(label);
    if (!key || key.length < 2 || key === normalizedQuery || seen.has(key)) continue;

    seen.add(key);
    out.push(label);
    if (out.length >= MAX_SEARCH_SUGGESTIONS) break;
  }

  return out;
}

function toRecentSearchItem(item: SearchHistoryItem): RecentSearchItem {
  if (item.type === "song" && item.song) {
    return {
      id: item.id,
      label: item.label,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl || item.song.coverUrl,
      type: "song",
      song: item.song,
    };
  }

  return {
    id: item.id,
    label: item.label,
    type: "query",
    icon: "search",
  };
}

function toRecentSearchItems(items: SearchHistoryItem[]): RecentSearchItem[] {
  return items.map(toRecentSearchItem);
}

function BrowseCategoryCard({
  category,
  index,
  onPress,
}: {
  category: BrowseCategory;
  index: number;
  onPress: (title: string) => void;
}) {
  const handlePress = useCallback(() => onPress(category.title), [category.title, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.browseCard,
        { backgroundColor: category.color },
        pressed && styles.browseCardPressed,
      ]}
      onPress={handlePress}
    >
      <Text style={styles.browseCardTitle}>{category.title}</Text>
      <Image
        source={{ uri: category.imageUrl }}
        style={[
          styles.browseCardImage,
          { transform: [{ rotate: `${CARD_ROTATION_PATTERN[index % CARD_ROTATION_PATTERN.length]}deg` }] },
        ]}
        contentFit="cover"
        transition={100}
      />
    </Pressable>
  );
}

const STITCH_BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: "bollywood",
    title: "Bollywood",
    color: "#5203D5",
    isHero: true,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDF65iTajyxJ3pY_3UEgaEW904AIU2tgjMxR5nFVYA-a4pMW61Kv8YDwfMgptSw3ucmCvM1KahK-8SJ1uh3RB_pXxlJbGvdq6-zw277CJj1UUhPTeUNpmTYkdwKvLKpFcricdxCBw8Z6UTISEL6keZa5GWMv4vjHlGOpMuTw8_GZF-pmQvE3_kEQSk5RIrhD6dB5uDLIPrxgpgh8fBQk2z9ORzDfj1FqWnlXAl9DqmYpuygexks2zhfYCb2Pm8NIgCA8ga2fOz9Tok",
  },
  {
    id: "pop",
    title: "Pop",
    color: "#006450",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCZIhRFtHlrYaSCGix2eKc62r5E2OGJmi4Mr-bozt_oxoy55OJw0TkuTaeteOmFnfFONc7_XzQVPGli7S-7IJKcgBk4TpnK6EWRMHlbrc0trTsyl7hKAHWH4UgU3B7bw1ZrGHjxWQYVi6k_e-fjUyVunPndYiCeaOkaNv0W2J8A4VQpg1ApyKZChtYlKbZozPO6BZ_Hq85UkZYIDUMzlJI_wyklKcbdkvGMTcyFrk8LWKZxphmy3ae1Pqiv92T7icXwqznnLT588ZI",
  },
  {
    id: "hip-hop",
    title: "Hip-Hop",
    color: "#BA5D07",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD2KE4nLxpvF1LiA-NnK3zqUt5OwAyWqDLbv_rY9LGLUo1d3v7KDYVFHZFcdedYGc5vYOG3YsIyk3P_z8S6seI84xHk5lc8gsq6ciHOH319bfM-rLiKhULw3q2ZnAPo0OPNWkqqCqe7n-M6WepbtMG8L15wNXx875FRsHQGf2iZ2kiHID4B38IjGR1YprFRntfDQbkORI0ntzMg2ZtTk6HojgBnBrO_5J4gJSbZrmlqp-H4D6rGADt9vp1Fz_CDmu-OqTYEXqMvAwo",
  },
  {
    id: "rock",
    title: "Rock",
    color: "#E8115B",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBRgyg4EDVFPBmagvQ0AY014mXu54WLUXwlGXxC8n_HEvNhBFgo5hOuMr6J6vRIoWFhrdYTMNA38g4lsukc6ZjN2ajd8D-eXvyhUuAfSjRz-XXRpWVFaIJh3sTVWpxr5XJbg4EEpWZg9R8gAoEntObreXkfAgPald-vwI8sxI4kvO1R3ncM_t-eyK-BKsSaLOUh0nOjBzwMuJq8ycLTpYIabDLhWMjmilC20GzVrQq_JL6IJieFb_AKGwj-6kaKK0CUqtnPVhsC9-A",
  },
  {
    id: "indie",
    title: "Indie",
    color: "#608108",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBMB3olxHY8oMxn-jGk7VtkK2hD6B8iQI4KFypQfJqwp7y2A8bdDsOtVvg5TVl5hy4b3AAw6yEtky0N9OyCyXEfmQl923IQF0J_WjH1-0FmSowMuo6j0FvfuI1t1aAZ6wFi7nHmStnAJEtO5mWqPaQwZQQM4QFy-QnFBu11xQYWsAMnhJBYY6duROuq7te-xhHLZn5Vx15fjXEKwTkFXH1jxLjgc-KiX0_oTl6G84EImZC6gMMKeu6JxDHbuPCnVHtrZD3kO06p7Ko",
  },
  {
    id: "jazz",
    title: "Jazz",
    color: "#1E3264",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD9ZgG99z-1Gv7n0qQ6a1g9h6K8q8Xn5w3-e8q0l8v6l3g2l7w0v5k0w6a8d8q3d3e8q1l3g0k3a4j7l3l8v3d9k0k7w8q2l0d7l3k7a8q6e2k3",
  },
];

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function SearchScreen() {
  return <SearchScreenView />;
}

export default SearchScreen;

function SearchScreenView() {
  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[]; name?: string | string[] }>();
  const { isOnline } = useNetwork();
  const { playSong } = usePlayerActions();

  const routeSearchQuery = getRouteSearchQuery(params);
  const [query, setQuery] = useState(routeSearchQuery);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searchDisplayQuery, setSearchDisplayQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(routeSearchQuery.length > 0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

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
        setResults(EMPTY_RESULTS);
        setSearchDisplayQuery("");
        setSearchLoading(false);
        return;
      }

      activeSearchAbortRef.current?.abort();
      const controller = new AbortController();
      activeSearchAbortRef.current = controller;

      const cacheKey = `${resultFilter}:${normalizedQuery.toLowerCase()}`;
      const cached = searchCache.get(cacheKey);
      if (cached) {
        setResults(cached);
        setSearchDisplayQuery(normalizedQuery);
        setSearchLoading(false);
        if (activeSearchAbortRef.current === controller) {
          activeSearchAbortRef.current = null;
        }
        return;
      }

      setSearchLoading(true);

      try {
        const nextResults = await searchRepository(normalizedQuery, resultFilter, controller.signal);

        if (requestId !== requestSeqRef.current || controller.signal.aborted) {
          return;
        }

        setResults(nextResults);
        setSearchDisplayQuery(normalizedQuery);
        setSearchLoading(false);

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
        setResults(EMPTY_RESULTS);
        setSearchDisplayQuery(normalizedQuery);
        setSearchLoading(false);
        if (activeSearchAbortRef.current === controller) {
          activeSearchAbortRef.current = null;
        }
      }
    },
    [resultFilter, searchCache]
  );

  const handleChangeText = useCallback((text: string) => {
    const trimmedText = text.trim();
    setQuery(text);
    if (trimmedText.length < 2) {
      setResultFilter("all");
      setSuggestions([]);
      setSuggestionsOpen(false);
      suggestionsClosedForQueryRef.current = null;
      return;
    }
    suggestionsClosedForQueryRef.current = null;
    setSuggestionsOpen(true);
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
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    if (suggestionsClosedForQueryRef.current === normalizeText(trimmed)) {
      setSuggestionsOpen(false);
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
          setSuggestions(cleanSuggestions);
          setSuggestionsOpen(cleanSuggestions.length > 0);
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
    setIsSearchMode(true);
    setSuggestionsOpen(false);
    setQuery(next);
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
      setIsSearchMode(true);
      setQuery(next);
      suggestionsClosedForQueryRef.current = normalizeText(next);
      setSuggestionsOpen(false);
      setSuggestions([]);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, rememberRecentSearch, resetHeaderElevation]
  );

  const renderBrowseCategory = useCallback(
    ({ item, index }: { item: BrowseCategory; index: number }) => (
      <BrowseCategoryCard category={item} index={index} onPress={handleGenrePress} />
    ),
    [handleGenrePress]
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
      setIsSearchMode(true);
      setQuery(next);
      suggestionsClosedForQueryRef.current = normalizeText(next);
      setSuggestionsOpen(false);
      setSuggestions([]);
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
      setIsSearchMode(true);
      setResultFilter("all");
      suggestionsClosedForQueryRef.current = normalizeText(next);
      setSuggestionsOpen(false);
      setQuery(next);
      setSuggestions([]);
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

  const handleRemoveRecentSearch = useCallback((id: string) => {
    setRecentSearches((prev) => prev.filter((item) => item.id !== id));
    void removeSearchHistoryItem(id)
      .then((items) => setRecentSearches(toRecentSearchItems(items)))
      .catch(() => undefined);
  }, []);

  const handleResultFilterSelect = useCallback(
    (filter: ResultFilter) => {
      resetHeaderElevation();
      setResultFilter(query.trim().length < 2 ? "all" : filter);
    },
    [query, resetHeaderElevation]
  );

  const renderResultFilter = useCallback(
    ({ item }: { item: { key: ResultFilter; label: string } }) => (
      <SearchResultFilterChip
        filter={item}
        activeFilter={resultFilter}
        onSelect={handleResultFilterSelect}
      />
    ),
    [handleResultFilterSelect, resultFilter]
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
    setSuggestionsOpen(false);
    setSuggestions([]);
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
    setQuery("");
    suggestionsClosedForQueryRef.current = null;
    setSuggestionsOpen(false);
    setSuggestions([]);
    setResults(EMPTY_RESULTS);
    setSearchDisplayQuery("");
    setSearchLoading(false);
  }, [cancelActiveSearchWork]);

  const handleActivateSearchMode = useCallback(() => {
    resetHeaderElevation();
    setIsSearchMode(true);
  }, [resetHeaderElevation]);

  const handleCancelSearchMode = useCallback(() => {
    handleClear();
    resetHeaderElevation();
    setIsSearchMode(false);
  }, [handleClear, resetHeaderElevation]);

  // Main search debounce pipeline
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestSeqRef.current += 1;
      cancelActiveSearchWork();
      setResults(EMPTY_RESULTS);
      setSearchDisplayQuery("");
      setSearchLoading(false);
      lastQueryRef.current = "";
      return;
    }

    if (trimmed === lastQueryRef.current) {
      setSearchLoading(true);
      void performSearch(trimmed);
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    setSearchLoading(true);
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

  const displayedSongs = useMemo(() => (showSongResults ? songResults : []), [showSongResults, songResults]);
  const featuredAlbums = useMemo(() => albumResults.slice(0, 6), [albumResults]);
  const featuredArtists = useMemo(() => artistResults.slice(0, 5), [artistResults]);
  const featuredPlaylists = useMemo(() => playlistResults.slice(0, 6), [playlistResults]);

  const handleSongResultPress = useCallback((song: Song) => {
    void addSongSearchHistoryItem(song)
      .then((items) => setRecentSearches(toRecentSearchItems(items)))
      .catch(() => undefined);
  }, []);

  const renderSong = useCallback(
    ({ item }: { item: Song }) => {
      return (
        <SongRow
          song={item}
          onSongPress={handleSongResultPress}
          showSearchSourceMeta
        />
      );
    },
    [handleSongResultPress]
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

  const getArtistRowElement = useCallback(
    (artist: ArtistResult) => (
      <Pressable
        style={({ pressed }) => [styles.artistResultRow, pressed && styles.recentRowPressed]}
        onPress={() => handleArtistPress(artist)}
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
    ),
    [handleArtistPress]
  );

  const renderArtistResult = useCallback(
    ({ item }: { item: ArtistResult }) => getArtistRowElement(item),
    [getArtistRowElement]
  );

  const getAlbumCardElement = useCallback(
    (album: AlbumResult, index: number) => {
      const seed = stableHash(`album-${album.id}-${index}`);
      const staggerPattern = [0, 7, 3, 9, 2, 5] as const;
      const tiltPattern = [0.8, -1.0, 1.1, -0.7, 0.6, -0.9] as const;
      const staggerOffset = staggerPattern[seed % staggerPattern.length];
      const tilt = tiltPattern[Math.floor(seed / 7) % tiltPattern.length];
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
          onPress={() => {
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
          }}
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
    },
    [routerPush]
  );

  const renderAlbumResult = useCallback(
    ({ item, index }: { item: AlbumResult; index: number }) => (
      <View style={styles.playlistGridItemWrap}>{getAlbumCardElement(item, index)}</View>
    ),
    [getAlbumCardElement]
  );

  const getPlaylistCardElement = useCallback(
    (playlist: PlaylistResult, index: number) => {
      const seed = stableHash(`${playlist.id}-${index}`);
      const staggerPattern = [0, 8, 4, 10, 2, 6] as const;
      const tiltPattern = [-1.1, 0.9, -0.8, 1.2, -0.6, 0.8] as const;
      const staggerOffset = staggerPattern[seed % staggerPattern.length];
      const tilt = tiltPattern[Math.floor(seed / 7) % tiltPattern.length];
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
          onPress={() => {
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
          }}
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
    },
    [routerPush]
  );

  const renderPlaylistResult = useCallback(
    ({ item, index }: { item: PlaylistResult; index: number }) => (
      <View style={styles.playlistGridItemWrap}>{getPlaylistCardElement(item, index)}</View>
    ),
    [getPlaylistCardElement]
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
          right={<AppTopHeaderDownloadButton />}
        />
      )}
      {!isSearchMode ? (
        <View style={[styles.searchBarRow, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 10 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search songs, albums, artists, playlists"
            style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}
            onPress={handleActivateSearchMode}
          >
            <Ionicons name="search" size={17} color="#6A6A6A" />
            <Text style={styles.inactiveSearchText} numberOfLines={1}>
              What do you want to listen to?
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
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 14, paddingBottom: 146 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={handleHeaderScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Recent searches</Text>
            {recentSearches.length > 0 ? (
              recentSearches.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.recentRow, pressed && styles.recentRowPressed]}
                  onPress={() => handleRecentSearchPress(item)}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={[styles.recentThumb, item.type === "artist" && styles.recentThumbRound]}
                      contentFit="cover"
                      transition={100}
                    />
                  ) : (
                    <View style={[styles.recentThumb, styles.recentThumbRound, styles.recentThumbFallback]}>
                      <Ionicons name={item.icon ?? "search"} size={24} color={Colors.subtext} />
                    </View>
                  )}
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentLabel} numberOfLines={1}>{item.label}</Text>
                    {item.subtitle ? (
                      <Text style={styles.recentSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    hitSlop={10}
                    style={styles.recentActionBtn}
                    onPress={(e) => { e.stopPropagation(); handleRemoveRecentSearch(item.id); }}
                  >
                    <Ionicons name="close" size={18} color={Colors.subtext} />
                  </Pressable>
                </Pressable>
              ))
            ) : (
              <View style={styles.recentEmpty}>
                <Ionicons name="search-outline" size={34} color={Colors.subtext} />
                <Text style={styles.recentEmptyText}>No recent searches</Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : showBrowse ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 146 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={handleHeaderScroll}
          scrollEventThrottle={16}
        >
          <AdMobNativeVideo />

          <View style={styles.browseSection}>
            <Text style={styles.browseTitle}>Browse all</Text>
            <FlatList
              data={browseCategories}
              keyExtractor={(category) => category.id}
              renderItem={renderBrowseCategory}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.browseGridList}
              columnWrapperStyle={styles.browseGridRow}
            />
          </View>
        </ScrollView>
      ) : (
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
              onScroll={handleHeaderScroll}
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
              onScroll={handleHeaderScroll}
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
              onScroll={handleHeaderScroll}
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
              onScroll={handleHeaderScroll}
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
              onScroll={handleHeaderScroll}
              scrollEventThrottle={16}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={7}
              ListFooterComponent={
                showAlbumResults || showArtistResults || showPlaylistResults ? (
                  <>
                    {showAlbumResults ? (
                      <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>Albums</Text>
                          {resultFilter === "all" ? (
                            <Pressable onPress={() => handleResultFilterSelect("albums")}>
                              <Text style={styles.sectionActionText}>See all</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.playlistGridWrap}>
                          {featuredAlbums.map((album, index) => (
                            <View key={album.id} style={styles.playlistGridItemWrap}>
                              {getAlbumCardElement(album, index)}
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
                            <Pressable onPress={() => handleResultFilterSelect("artists")}>
                              <Text style={styles.sectionActionText}>See all</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.artistSectionList}>
                          {featuredArtists.map((artist) => (
                            <View key={artist.id}>{getArtistRowElement(artist)}</View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                    {showPlaylistResults ? (
                      <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>Playlists</Text>
                          {resultFilter === "all" ? (
                            <Pressable onPress={() => handleResultFilterSelect("playlists")}>
                              <Text style={styles.sectionActionText}>See all</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.playlistGridWrap}>
                          {featuredPlaylists.map((playlist, index) => (
                            <View key={playlist.id} style={styles.playlistGridItemWrap}>
                              {getPlaylistCardElement(playlist, index)}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Search entry ────────────────────────────────────────────────────────────
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    paddingHorizontal: 12,
    gap: 9,
  },
  searchBarPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  inactiveSearchText: {
    flex: 1,
    minWidth: 0,
    color: "#121212",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  searchCancelButton: {
    minHeight: 40,
    minWidth: 58,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  searchCancelButtonPressed: {
    opacity: 0.72,
  },
  searchCancelText: {
    color: "#F8FBF9",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },

  // ── Scroll / shared ─────────────────────────────────────────────────────────
  scrollView: { flex: 1 },
  content: {},

  // ── Recent searches ─────────────────────────────────────────────────────────
  recentSection: {
    paddingBottom: 24,
  },
  recentTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 14,
  },
  recentRowPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  recentThumb: {
    width: 56,
    height: 56,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  recentThumbRound: { borderRadius: 28 },
  recentThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  recentInfo: { flex: 1, gap: 3 },
  recentLabel: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  recentSubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  recentActionBtn: { padding: 8 },
  recentEmpty: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  recentEmptyText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },

  // ── Browse All ───────────────────────────────────────────────────────────────
  browseSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  browseTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 14,
  },
  browseGridList: {
    gap: 8,
  },
  browseGridRow: {
    gap: 8,
  },
  browseCard: {
    width: "48%",
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    padding: 12,
    justifyContent: "flex-end",
  },
  browseCardPressed: { opacity: 0.85 },
  browseCardTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  browseCardImage: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 64,
    height: 64,
    borderRadius: 6,
    transform: [{ rotate: "25deg" }],
  },

  // ── Results ──────────────────────────────────────────────────────────────────
  resultsWrap: { flex: 1 },
  filterRow: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  filterRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  resultsContent: { paddingTop: 8 },
  sectionBlock: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sectionActionText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  // ── Artist results ─────────────────────────────────────────────────────────
  artistListContentContainer: {
    paddingTop: 6,
    paddingBottom: 8,
  },
  artistSectionList: {
    marginHorizontal: -16,
  },
  artistResultRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 13,
  },
  artistResultImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
  },
  artistResultImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  artistResultInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  artistResultName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  artistResultMeta: {
    color: Colors.subtext,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },

  // ── Playlist grid ────────────────────────────────────────────────────────────
  playlistGridContentContainer: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  playlistGridRow: {
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  playlistGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  playlistGridItemWrap: {
    width: "48.5%",
    marginBottom: 16,
  },
  playlistGridCard: {
    width: "100%",
    backgroundColor: "transparent",
  },
  playlistClassicCardPressed: { opacity: 0.8 },
  playlistGridImageWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  playlistGridImage: { width: "100%", height: "100%" },
  brandCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: Colors.background,
  },
  brandCoverBadgeImage: { width: "100%", height: "100%" },
  playlistGridContent: { marginTop: 8 },
  playlistGridName: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
  },
  playlistGridMeta: {
    marginTop: 3,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // ── States ───────────────────────────────────────────────────────────────────
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtext: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  emptyInline: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyInlineText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  // ── Suggestions Dropdown ─────────────────────────────────────────────────────
  suggestionsDropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    maxHeight: 360,
    backgroundColor: "rgba(18, 22, 28, 0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    zIndex: 999,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  suggestionRowPressed: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  suggestionIcon: {
    marginRight: 14,
    opacity: 0.6,
  },
  suggestionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
