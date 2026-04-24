import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { getBestImageUrl, Song } from "@/lib/musicData";
import { getApiUrl } from "@/lib/query-client";
import {
  createSearchPlan,
  extractSongResults,
  rankSongsTopK,
} from "@/lib/searchPipeline";
import SongRow from "@/components/SongRow";

interface PlaylistResult {
  id: string;
  name: string;
  image: { quality: string; url: string }[];
  songCount: number;
}

interface RecentSearchItem {
  id: string;
  label: string;
  imageUrl?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface BrowseCategory {
  id: string;
  title: string;
  color: string;
  imageUrl: string;
  isHero?: boolean;
}

type ResultFilter = "all" | "songs" | "playlists";
const RESULTS_HEADER_BASE_HEIGHT = 46;
const RESULTS_CONTROLS_FULL_HEIGHT = 92;

const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "songs", label: "Songs" },
  { key: "playlists", label: "Playlists" },
];

const CARD_ROTATION_PATTERN = [-11, 8, -7, 10, -5, 6] as const;
const APP_BRAND_ICON = require("@/assets/images/icon.png");

const STITCH_RECENT_SEARCHES: RecentSearchItem[] = [
  {
    id: "midnight-city",
    label: "Midnight City",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCqB9ybv3HO8eHYX6bQVSEyicyS_SlOfwKehM-c1kpTsDSV_5n4MoNQKRuiLVqFKvl2ZG5cLdNV-cCJFBXinik9HqbxpeRZrt7lXngNX-5TGleoJYrumblrEw0tacOx7eLVQ8p9g9BcyWFRUPZIl9VR0NDUf1HF3cwjfVayM8TF6WSKSdOvu-ENf_z8FpFsOAlwNIvBB4LOGds41GdDZRAfm6LGWNCRFuxpnSc6WBHo9QuzulYUqG2oqzMOwvxggwk12uT0FOft_Wk",
  },
  {
    id: "techno-bloom",
    label: "Techno Bloom",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuChTYl4xH3ZLJ4ARFgn-rbApfKx9tJbZROrKLiLUdfQiUDfWNAQkFvf4geu4s_aOHEIhe35l0Ohs0QovMiD9sXnnLsGEGxoe6S1gvgj9MwmJZNQC84g13alq3Nq_NlbifmxN654WcJC-YPxnjQVhu59HB9RHT5QZiQrEG_P2JSWmccfT6Y21RdKCurdSNKeU0Vhp2vaO6zSjJGrXEa6xPMWP9XtXjXM-bXcnautbSLYBTmKZfnS-cJVReNH9HoclyFpocsBZsGk72Y",
  },
  { id: "the-weeknd", label: "The Weeknd", icon: "person" },
  {
    id: "coffee-jazz",
    label: "Coffee & Jazz",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDF65iTajyxJ3pY_3UEgaEW904AIU2tgjMxR5nFVYA-a4pMW61Kv8YDwfMgptSw3ucmCvM1KahK-8SJ1uh3RB_pXxlJbGvdq6-zw277CJj1UUhPTeUNpmTYkdwKvLKpFcricdxCBw8Z6UTISEL6keZa5GWMv4vjHlGOpMuTw8_GZF-pmQvE3_kEQSk5RIrhD6dB5uDLIPrxgpgh8fBQk2z9ORzDfj1FqWnlXAl9DqmYpuygexks2zhfYCb2Pm8NIgCA8ga2fOz9Tok",
  },
];

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
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBG-LmEIH-auFtgbVhJU73l9PSsvQ3lQsH7CDcsIQ_5IUE2i3bR82PnkMIUoR37XyDn1nlx_EAeVZ1LtMFzQwIa9Zvfv94kl3j-KfXFa8Lis18YO6bFs6Nj8lvcGQSzNcFug2Vn6uY3rBrkTYX-mYWswADQRQfn5h-QKIconMYiS4y8GZQVdpXaQiJ6RLbNGh_naYEqLE6Ym9VXn6iLfKp9cOcgJMHEoevEp6uScdjC9gWlJjwqylTvtmYi78K3Lwmj9UZP40Ns_VE",
  },
  {
    id: "dance",
    title: "Dance",
    color: "#503750",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDvY_BiFuyPneuEyFqRGoTUMqqC4YJ_LdJ8hXSG5x_d9U27bOx0K98LPve9M-VEVp8OfAqsquOXR96D0cyusyydD97seGMAzgIfbKmd5tMDiXVfCQug6nxvSOrIXFOPcBue5EyOpszvTPrGtid7h0FjMMJP7KfM9pZ9wnYoWDgMKY3ifDxe0vMg12bFc4nVXi-zKW_6q-qzl40lFlox5ysVRvFmtkS1ocZgBcrvn0wLALW0EJJUjcshReBPOzfJ_4o_Oviadl7b5_8",
  },
  {
    id: "mood",
    title: "Mood",
    color: "#D84000",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBNixTEXxcJsE5uNrpVwKtCRVff9IaLYnG3lz_dkBXw6WcCF0iEDgM8K2vFT_ZwiHG2c_A3xfFY3NhCUKSqOAXKb6441vtXI4D0_WqtQS5R2lIco6Ux_7vbny49Z0SWpriw4ZbuaIVjuvnU1Hn8dJV_7-vzvutrYooqNODyg3rX9DnnfMC6YUojNCTlHRuMK36Ed7MoPoxkoOf_hGB-vprCpZvpLrvEo1KVUYru2yvmr0XoeUU8XihIsQYeMW-LB04keedcDLfS6aA",
  },
  {
    id: "focus",
    title: "Focus",
    color: "#477D95",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCNW5owpFqXCvk3pVLdFElyHHs_laywpufifloYeOWae-AhwI6a8tR8-CQ_wVF5Az7kxbGon2CHFqkT-McNucibd3okQaSW07f9w5UBLJcyHUDF0VL-uVoGXRFU2W7kBHs0_Az7prwPQHPnSRanUD08wNUkGhPnanwz6SLwuWBSiUSFEO2pQyPARCgZUtNWpL9tKPVm_OLuRof4bsUnTEnvaMfpbgKz2tkmI72un4_uWHd9Hn1l8t5jnNzlU7fCQ21ZC0B5Vx45v_E",
  },
  {
    id: "classical",
    title: "Classical",
    color: "#7D4B32",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCqB9ybv3HO8eHYX6bQVSEyicyS_SlOfwKehM-c1kpTsDSV_5n4MoNQKRuiLVqFKvl2ZG5cLdNV-cCJFBXinik9HqbxpeRZrt7lXngNX-5TGleoJYrumblrEw0tacOx7eLVQ8p9g9BcyWFRUPZIl9VR0NDUf1HF3cwjfVayM8TF6WSKSdOvu-ENf_z8FpFsOAlwNIvBB4LOGds41GdDZRAfm6LGWNCRFuxpnSc6WBHo9QuzulYUqG2oqzMOwvxggwk12uT0FOft_Wk",
  },
];

async function parseJsonResponse(response: Response): Promise<any | null> {
  if (!response.ok) {
    try {
      await response.text();
    } catch {
      // Best effort only
    }
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizePlaylistResults(raw: unknown): PlaylistResult[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const normalized: PlaylistResult[] = [];

  for (const item of raw as any[]) {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || "").trim();
    if (!id || !name || seen.has(id)) continue;

    seen.add(id);
    normalized.push({
      id,
      name,
      image: Array.isArray(item?.image) ? item.image : [],
      songCount: Number(item?.songCount || 0),
    });
  }

  return normalized;
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [songResults, setSongResults] = useState<Song[]>([]);
  const [playlistResults, setPlaylistResults] = useState<PlaylistResult[]>([]);
  const [searchDisplayQuery, setSearchDisplayQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(
    STITCH_RECENT_SEARCHES
  );
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const resultsPlaylistsListRef = useRef<FlatList<PlaylistResult> | null>(null);
  const resultsSongsListRef = useRef<FlatList<Song> | null>(null);
  const resultsControlsAnim = useRef(new Animated.Value(0)).current;
  const controlsHiddenRef = useRef(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const shuffledBrowseCategories = useMemo(() => {
    const hero = STITCH_BROWSE_CATEGORIES.find((item) => item.isHero);
    const rest = STITCH_BROWSE_CATEGORIES.filter((item) => !item.isHero);
    const randomized = [...rest].sort(() => Math.random() - 0.5);
    return hero ? [hero, ...randomized] : randomized;
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    const requestId = ++requestSeqRef.current;
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setSongResults([]);
      setPlaylistResults([]);
      setSearchDisplayQuery("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const apiUrl = getApiUrl();
    const freshnessKey = Math.floor(Date.now() / 60000);
    const searchPlan = createSearchPlan(normalizedQuery);
    const songRequests = searchPlan.retrievalQueries.map((candidate, index) =>
      fetch(
        `${apiUrl}api/jiosaavn/search/songs?query=${encodeURIComponent(candidate)}&limit=${index === 0 ? 50 : 25}&fresh=${freshnessKey}`
      )
    );

    try {
      const [playlistsRes, ...songResponses] = await Promise.all([
        fetch(
          `${apiUrl}api/jiosaavn/search/playlists?query=${encodeURIComponent(normalizedQuery)}&limit=10&fresh=${freshnessKey}`
        ),
        ...songRequests,
      ]);

      const [playlistsData, ...songPayloads] = await Promise.all([
        parseJsonResponse(playlistsRes),
        ...songResponses.map((response) => parseJsonResponse(response)),
      ]);

      if (requestId !== requestSeqRef.current) {
        return;
      }

      const rawSongResults = songPayloads.flatMap((payload) =>
        extractSongResults(payload)
      );
      const rankedSongs = rankSongsTopK(normalizedQuery, rawSongResults, 20);
      setSongResults(rankedSongs.songs);
      setSearchDisplayQuery(rankedSongs.correctedQuery || normalizedQuery);

      if (playlistsData?.success && playlistsData.data?.results) {
        setPlaylistResults(normalizePlaylistResults(playlistsData.data.results));
      } else if (playlistsData?.data?.results) {
        setPlaylistResults(normalizePlaylistResults(playlistsData.data.results));
      } else if (Array.isArray(playlistsData?.results)) {
        setPlaylistResults(normalizePlaylistResults(playlistsData.results));
      } else {
        setPlaylistResults([]);
      }
    } catch {
      if (requestId !== requestSeqRef.current) {
        return;
      }
      setSongResults([]);
      setPlaylistResults([]);
      setSearchDisplayQuery(normalizedQuery);
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleChangeText = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const rememberRecentSearch = useCallback((label: string) => {
    const normalized = label.trim();
    if (normalized.length < 2) return;

    setRecentSearches((prev) => {
      const nextItem: RecentSearchItem = {
        id: `q-${normalized.toLowerCase().replace(/\s+/g, "-")}`,
        label: normalized,
      };
      const filtered = prev.filter(
        (item) => item.label.toLowerCase() !== normalized.toLowerCase()
      );
      return [nextItem, ...filtered].slice(0, 8);
    });
  }, []);

  const handleGenrePress = useCallback(
    (genreName: string) => {
      const next = genreName.trim();
      if (!next) return;
      setQuery(next);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, rememberRecentSearch]
  );

  const handleRecentSearchPress = useCallback(
    (label: string) => {
      const next = label.trim();
      if (next.length < 2) return;
      setQuery(next);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, rememberRecentSearch]
  );

  const handleRemoveRecentSearch = useCallback((id: string) => {
    setRecentSearches((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearRecentSearches = useCallback(() => {
    setRecentSearches([]);
  }, []);

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    rememberRecentSearch(trimmed);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    void performSearch(trimmed);
  }, [performSearch, query, rememberRecentSearch]);

  const handleClear = useCallback(() => {
    requestSeqRef.current += 1;
    setQuery("");
    setSongResults([]);
    setPlaylistResults([]);
    setSearchDisplayQuery("");
    setIsLoading(false);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
  }, []);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestSeqRef.current += 1;
      setSongResults([]);
      setPlaylistResults([]);
      setSearchDisplayQuery("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimer.current = setTimeout(() => {
      void performSearch(trimmed);
    }, 260);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [performSearch, query]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 && resultFilter !== "all") {
      setResultFilter("all");
    }
  }, [query, resultFilter]);

  useEffect(() => {
    if (query.trim().length < 2) return;

    requestAnimationFrame(() => {
      if (resultFilter === "playlists") {
        resultsPlaylistsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else {
        resultsSongsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    });
  }, [query, resultFilter]);

  const hasResults = songResults.length > 0 || playlistResults.length > 0;
  const showBrowse = query.length < 2;
  const resultDataKey = useMemo(
    () =>
      `${query.trim()}-${resultFilter}-${songResults.length}-${playlistResults.length}-${isLoading ? 1 : 0}`,
    [isLoading, playlistResults.length, query, resultFilter, songResults.length]
  );

  useEffect(() => {
    if (showBrowse || isLoading) return;

    requestAnimationFrame(() => {
      if (resultFilter === "playlists") {
        resultsPlaylistsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else {
        resultsSongsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    });
  }, [isLoading, resultFilter, showBrowse, songResults.length, playlistResults.length]);

  const suggestionTerms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2) return [];

    const candidates = [
      ...recentSearches.map((item) => item.label),
      ...playlistResults.slice(0, 4).map((item) => item.name),
      ...songResults.slice(0, 4).map((item) => item.title),
    ];

    const seen = new Set<string>();
    const filtered: string[] = [];

    for (const raw of candidates) {
      const label = String(raw || "").trim();
      if (label.length < 2) continue;
      const normalized = label.toLowerCase();
      if (!normalized.includes(normalizedQuery)) continue;
      if (normalized === normalizedQuery) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      filtered.push(label);
      if (filtered.length >= 8) break;
    }

    return filtered;
  }, [playlistResults, query, recentSearches, songResults]);
  const showPlaylistResults = resultFilter !== "songs" && playlistResults.length > 0;
  const showSongResults = resultFilter !== "playlists" && songResults.length > 0;
  const displayedSongs = showSongResults ? songResults : [];
  const topSongId = displayedSongs[0]?.id ?? null;
  const featuredPlaylists = useMemo(() => playlistResults.slice(0, 6), [playlistResults]);
  const controlsOpacity = resultsControlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const controlsHeight = resultsControlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RESULTS_CONTROLS_FULL_HEIGHT, 0],
    extrapolate: "clamp",
  });
  const controlsTranslateY = resultsControlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
    extrapolate: "clamp",
  });
  const controlsMarginBottom = resultsControlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 2],
    extrapolate: "clamp",
  });

  const handleResultsScroll = useCallback(
    (event: any) => {
      const offsetY = Number(event?.nativeEvent?.contentOffset?.y || 0);
      const shouldHide = offsetY > 24;
      if (shouldHide === controlsHiddenRef.current) return;
      controlsHiddenRef.current = shouldHide;

      Animated.timing(resultsControlsAnim, {
        toValue: shouldHide ? 1 : 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
    },
    [resultsControlsAnim]
  );

  useEffect(() => {
    controlsHiddenRef.current = false;
    resultsControlsAnim.setValue(0);
  }, [query, resultFilter, resultsControlsAnim]);

  const renderSong = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow
        song={item}
        queue={songResults}
        topResult={Boolean(topSongId && item.id === topSongId && index === 0)}
      />
    ),
    [songResults, topSongId]
  );

  const renderPlaylistCard = useCallback(
    (playlist: PlaylistResult, index: number) => {
      const seed = stableHash(`${playlist.id}-${index}`);
      const staggerPattern = [0, 8, 4, 10, 2, 6] as const;
      const tiltPattern = [-1.1, 0.9, -0.8, 1.2, -0.6, 0.8] as const;
      const staggerOffset = staggerPattern[seed % staggerPattern.length];
      const tilt = tiltPattern[(Math.floor(seed / 7)) % tiltPattern.length];

      return (
        <Pressable
          style={({ pressed }) => [
            styles.playlistGridCard,
            { marginTop: staggerOffset },
            pressed && styles.playlistClassicCardPressed,
          ]}
          onPress={() =>
            router.push({
              pathname: "/playlist/[id]",
              params: {
                id: String(playlist.id).trim(),
                jiosaavn: "true",
                firestore: "false",
                title: playlist.name,
                cover: getBestImageUrl(playlist.image),
                songCount: String(Math.max(0, playlist.songCount || 0)),
              },
            }, {
              withAnchor: true,
              dangerouslySingular: () => "playlist-details",
            })
          }
        >
          <View style={[styles.playlistGridImageWrap, { transform: [{ rotate: `${tilt}deg` }] }]}>
            <Image
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
            <Text style={styles.playlistGridMeta}>
              {Math.max(0, playlist.songCount || 0)} songs
            </Text>
          </View>
        </Pressable>
      );
    },
    [router]
  );

  const handleSuggestionPress = useCallback(
    (term: string) => {
      const next = term.trim();
      if (next.length < 2) return;
      setQuery(next);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, rememberRecentSearch]
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.topBar}>
        <Text style={styles.header}>Search</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={22} color="#BCCBB9" />
        <TextInput
          style={styles.input}
          placeholder="Artists, songs, or podcasts"
          placeholderTextColor="#7E8A99"
          value={query}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmitSearch}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={handleClear} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color="#7E8A99" />
          </Pressable>
        ) : null}
      </View>

      {showBrowse ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: 146 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.recentSection}>
            <View style={styles.recentHeaderRow}>
              <Text style={styles.recentTitle}>Recent Searches</Text>
              {recentSearches.length > 0 ? (
                <Pressable onPress={handleClearRecentSearches}>
                  <Text style={styles.recentClearText}>Clear all</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.recentChipWrap}>
              {recentSearches.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.recentChip,
                    pressed && styles.recentChipPressed,
                  ]}
                  onPress={() => handleRecentSearchPress(item.label)}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.recentChipImage}
                      contentFit="cover"
                      transition={120}
                    />
                  ) : (
                    <View style={styles.recentChipIconWrap}>
                      <Ionicons
                        name={item.icon || "search"}
                        size={14}
                        color={Colors.primary}
                      />
                    </View>
                  )}

                  <Text style={styles.recentChipLabel} numberOfLines={1}>
                    {item.label}
                  </Text>

                  <Pressable
                    hitSlop={6}
                    style={styles.recentChipCloseBtn}
                    onPress={(event) => {
                      event.stopPropagation();
                      handleRemoveRecentSearch(item.id);
                    }}
                  >
                    <Ionicons name="close" size={13} color="#BCCBB9" />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.browseSection}>
            <Text style={styles.browseTitle}>Browse All</Text>
            <View style={styles.browseGrid}>
              {shuffledBrowseCategories.map((category, index) => (
                <Pressable
                  key={category.id}
                  style={({ pressed }) => [
                    styles.browseCard,
                    category.isHero ? styles.browseHeroCard : styles.browseSmallCard,
                    {
                      backgroundColor: category.color,
                      marginBottom: category.isHero ? 12 : 10,
                    },
                    pressed && styles.browseCardPressed,
                  ]}
                  onPress={() => handleGenrePress(category.title)}
                >
                  <LinearGradient
                    colors={
                      category.isHero
                        ? ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.22)"]
                        : ["rgba(0,0,0,0.06)", "rgba(0,0,0,0.20)"]
                    }
                    style={StyleSheet.absoluteFill}
                  />
                  <Text
                    style={[
                      styles.browseCardTitle,
                      category.isHero && styles.browseHeroCardTitle,
                    ]}
                  >
                    {category.title}
                  </Text>
                  <Image
                    source={{ uri: category.imageUrl }}
                    style={[
                      styles.browseCardImage,
                      category.isHero && styles.browseHeroCardImage,
                      { transform: [{ rotate: `${CARD_ROTATION_PATTERN[index % CARD_ROTATION_PATTERN.length]}deg` }] },
                    ]}
                    contentFit="cover"
                    transition={120}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.resultsWrap}>
          <Animated.View
            style={[
              styles.resultsControlsWrap,
              {
                height: controlsHeight,
                opacity: controlsOpacity,
                marginBottom: controlsMarginBottom,
                transform: [{ translateY: controlsTranslateY }],
              },
            ]}
          >
            <View style={styles.resultsHeaderPlain}>
              <Ionicons name="search" size={15} color={Colors.primary} />
              <Text style={styles.resultsPillText} numberOfLines={1}>
                Results for: {searchDisplayQuery || query.trim()}
              </Text>
            </View>
            <View style={styles.filterTabsWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterTabsRow}
              >
                {RESULT_FILTERS.map((filter) => (
                  <Pressable
                    key={filter.key}
                    style={({ pressed }) => [
                      styles.filterTabChip,
                      resultFilter === filter.key && styles.filterTabChipActive,
                      pressed && styles.filterTabChipPressed,
                    ]}
                    onPress={() => setResultFilter(filter.key)}
                  >
                    <Text
                      style={[
                        styles.filterTabChipText,
                        resultFilter === filter.key && styles.filterTabChipTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Animated.View>

          {suggestionTerms.length > 0 ? (
            <View style={styles.suggestionStripWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionStripContent}
              >
                {suggestionTerms.map((term) => (
                  <Pressable
                    key={term}
                    style={({ pressed }) => [
                      styles.suggestionChip,
                      pressed && styles.suggestionChipPressed,
                    ]}
                    onPress={() => handleSuggestionPress(term)}
                  >
                    <Ionicons name="sparkles-outline" size={13} color={Colors.primary} />
                    <Text style={styles.suggestionChipText} numberOfLines={1}>
                      {term}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : null}

          {!isLoading && !hasResults ? (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={Colors.inactive} />
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={styles.emptySubtext}>Try a different keyword.</Text>
            </View>
          ) : null}

          {!isLoading && hasResults ? (
            resultFilter === "playlists" ? (
              <FlatList
                ref={resultsPlaylistsListRef}
                key={`playlist-results-${resultDataKey}`}
                data={showPlaylistResults ? playlistResults : []}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                  <View style={styles.playlistGridItemWrap}>{renderPlaylistCard(item, index)}</View>
                )}
                style={styles.scrollView}
                contentContainerStyle={[styles.playlistGridContentContainer, { paddingBottom: 146 }]}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={7}
                onScroll={handleResultsScroll}
                scrollEventThrottle={16}
                numColumns={2}
                columnWrapperStyle={styles.playlistGridRow}
                ListHeaderComponent={
                  showPlaylistResults ? (
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>Playlists</Text>
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyInline}>
                    <Text style={styles.emptyInlineText}>No playlists found for this search.</Text>
                  </View>
                }
              />
            ) : (
              !showSongResults && resultFilter === "songs" ? (
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyInlineText}>No songs found for this search.</Text>
                </View>
              ) : (
                <FlatList
                  ref={resultsSongsListRef}
                  key={`song-results-${resultDataKey}`}
                  data={displayedSongs}
                  keyExtractor={(item) => item.id}
                  renderItem={renderSong}
                  style={styles.scrollView}
                  contentContainerStyle={[styles.resultsContent, { paddingBottom: 146 }]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews={false}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={7}
                  onScroll={handleResultsScroll}
                  scrollEventThrottle={16}
                  ListHeaderComponent={
                    <View>
                      {showPlaylistResults ? (
                        <View style={styles.sectionBlock}>
                          <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionTitle}>Featured Playlists</Text>
                            {resultFilter === "all" ? (
                              <Pressable onPress={() => setResultFilter("playlists")}>
                                <Text style={styles.sectionActionText}>View all</Text>
                              </Pressable>
                            ) : null}
                          </View>
                          <View style={styles.playlistGridWrap}>
                            {featuredPlaylists.map((playlist, index) => (
                              <View key={playlist.id} style={styles.playlistGridItemWrap}>
                                {renderPlaylistCard(playlist, index)}
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}
                      {showSongResults ? (
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>
                            {resultFilter === "songs" ? "Songs" : "Top Songs"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  }
                />
              )
            )
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 4,
  },
  header: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: "Inter_800ExtraBold",
    color: Colors.text,
    letterSpacing: -0.6,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 18,
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    padding: 0,
  },
  scrollView: {
    flex: 1,
  },
  resultsWrap: {
    flex: 1,
    backgroundColor: "transparent",
    paddingTop: 6,
  },
  resultsControlsWrap: {
    marginHorizontal: 18,
    marginBottom: 6,
    overflow: "hidden",
  },
  resultsHeaderPlain: {
    minHeight: RESULTS_HEADER_BASE_HEIGHT,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(84,103,123,0.28)",
    backgroundColor: "rgba(20,29,40,0.72)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
  },
  resultsPillText: {
    flex: 1,
    color: "rgba(223,226,235,0.92)",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.22,
  },
  filterTabsWrap: {
    marginTop: 4,
  },
  filterTabsRow: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 8,
  },
  filterTabChip: {
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: "rgba(21,28,37,0.72)",
  },
  filterTabChipActive: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(38,225,154,0.2)",
  },
  filterTabChipPressed: {
    opacity: 0.92,
  },
  filterTabChipText: {
    color: Colors.subtext,
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  filterTabChipTextActive: {
    color: Colors.text,
  },
  suggestionStripWrap: {
    marginTop: 6,
  },
  suggestionStripContent: {
    paddingHorizontal: 18,
    gap: 8,
  },
  suggestionChip: {
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  suggestionChipPressed: {
    opacity: 0.9,
  },
  suggestionChipText: {
    color: Colors.text,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },
  content: {
    paddingTop: 16,
  },
  resultsContent: {
    paddingTop: 16,
  },
  sectionBlock: {
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    paddingHorizontal: 18,
    marginBottom: 8,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionActionText: {
    color: Colors.primary,
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  recentSection: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
  },
  recentHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  recentTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.2,
  },
  recentClearText: {
    color: Colors.primary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  recentChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  recentChip: {
    flexBasis: "48%",
    maxWidth: "48%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 10,
    minHeight: 42,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(134,149,133,0.2)",
  },
  recentChipPressed: {
    opacity: 0.9,
  },
  recentChipImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  recentChipIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,225,154,0.16)",
  },
  recentChipLabel: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  recentChipCloseBtn: {
    marginLeft: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  browseSection: {
    paddingHorizontal: 20,
  },
  browseTitle: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    color: Colors.text,
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  browseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  browseCard: {
    overflow: "hidden",
    borderRadius: 12,
    position: "relative",
  },
  browseHeroCard: {
    width: "100%",
    minHeight: 178,
    padding: 16,
  },
  browseSmallCard: {
    width: "48%",
    minHeight: 112,
    padding: 14,
  },
  browseCardPressed: {
    transform: [{ scale: 0.988 }],
    opacity: 0.93,
  },
  browseCardTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.35,
  },
  browseHeroCardTitle: {
    fontSize: 34,
    letterSpacing: -0.8,
  },
  browseCardImage: {
    position: "absolute",
    right: -8,
    bottom: -7,
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  browseHeroCardImage: {
    width: 126,
    height: 126,
    right: -6,
    bottom: -14,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.2,
  },
  playlistGridContentContainer: {
    paddingTop: 16,
    paddingHorizontal: 18,
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
    width: "48.3%",
    marginBottom: 12,
  },
  playlistGridCard: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 12,
  },
  playlistClassicCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  playlistGridImageWrap: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "rgba(18,24,33,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  playlistGridImage: {
    width: "100%",
    height: "100%",
  },
  brandCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.45)",
    backgroundColor: "#0E131A",
  },
  brandCoverBadgeImage: {
    width: "100%",
    height: "100%",
    opacity: 0.82,
  },
  playlistGridContent: {
    marginTop: 9,
    paddingHorizontal: 1,
  },
  playlistGridName: {
    color: Colors.text,
    fontSize: 17,
    lineHeight: 21,
    fontFamily: "Inter_700Bold",
  },
  playlistGridMeta: {
    marginTop: 5,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 96,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 96,
    gap: 8,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  emptyInline: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyInlineText: {
    color: Colors.subtext,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
