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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { getBestImageUrl, Song } from "@/lib/musicData";
import { getApiUrl } from "@/lib/query-client";
import SongRow from "@/components/SongRow";
import { getCatalogSongs, searchCatalog } from "@/lib/catalogService";
import {
  normalizeText,
  rankSongs,
  parseStructuredQuery
} from "@/lib/searchUtils";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import { useNetwork } from "@/contexts/NetworkContext";
import { filterMap, sortedCopy } from "@/lib/arrayUtils";

interface PlaylistResult {
  id: string;
  name: string;
  image: { quality: string; url: string }[];
  songCount: number;
}

interface RecentSearchItem {
  id: string;
  label: string;
  subtitle?: string;
  imageUrl?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: "song" | "playlist" | "artist" | "query";
}

interface BrowseCategory {
  id: string;
  title: string;
  color: string;
  imageUrl: string;
  isHero?: boolean;
}

type ResultFilter = "all" | "songs" | "playlists";

const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "songs", label: "Songs" },
  { key: "playlists", label: "Playlists" },
];

const CARD_ROTATION_PATTERN = [-11, 8, -7, 10, -5, 6] as const;
const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");

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

function ResultFilterChip({
  filter,
  activeFilter,
  onSelect,
}: {
  filter: { key: ResultFilter; label: string };
  activeFilter: ResultFilter;
  onSelect: (filter: ResultFilter) => void;
}) {
  const active = activeFilter === filter.key;
  const handlePress = useCallback(() => onSelect(filter.key), [filter.key, onSelect]);

  return (
    <Pressable
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={handlePress}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {filter.label}
      </Text>
    </Pressable>
  );
}

const STITCH_RECENT_SEARCHES: RecentSearchItem[] = [
  {
    id: "midnight-city",
    label: "Midnight City",
    subtitle: "Song • M83",
    type: "song",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCqB9ybv3HO8eHYX6bQVSEyicyS_SlOfwKehM-c1kpTsDSV_5n4MoNQKRuiLVqFKvl2ZG5cLdNV-cCJFBXinik9HqbxpeRZrt7lXngNX-5TGleoJYrumblrEw0tacOx7eLVQ8p9g9BcyWFRUPZIl9VR0NDUf1HF3cwjfVayM8TF6WSKSdOvu-ENf_z8FpFsOAlwNIvBB4LOGds41GdDZRAfm6LGWNCRFuxpnSc6WBHo9QuzulYUqG2oqzMOwvxggwk12uT0FOft_Wk",
  },
  {
    id: "techno-bloom",
    label: "Techno Bloom",
    subtitle: "Playlist",
    type: "playlist",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuChTYl4xH3ZLJ4ARFgn-rbApfKx9tJbZROrKLiLUdfQiUDfWNAQkFvf4geu4s_aOHEIhe35l0Ohs0QovMiD9sXnnLsGEGxoe6S1gvgj9MwmJZNQC84g13alq3Nq_NlbifmxN654WcJC-YPxnjQVhu59HB9RHT5QZiQrEG_P2JSWmccfT6Y21RdKCurdSNKeU0Vhp2vaO6zSjJGrXEa6xPMWP9XtXjXM-bXcnautbSLYBTmKZfnS-cJVReNH9HoclyFpocsBZsGk72Y",
  },
  {
    id: "the-weeknd",
    label: "The Weeknd",
    subtitle: "Artist",
    type: "artist",
    icon: "person",
  },
  {
    id: "coffee-jazz",
    label: "Coffee & Jazz",
    subtitle: "Playlist",
    type: "playlist",
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
  return useSearchScreenView();
}

function useSearchScreenView() {
  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[]; name?: string | string[] }>();
  const { isOnline } = useNetwork();
  const [query, setQuery] = useState("");
  const [songResults, setSongResults] = useState<Song[]>([]);
  const [playlistResults, setPlaylistResults] = useState<PlaylistResult[]>([]);
  const [searchDisplayQuery, setSearchDisplayQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(
    STITCH_RECENT_SEARCHES
  );
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const activeSearchAbortRef = useRef<AbortController | null>(null);
  const resultsPlaylistsListRef = useRef<FlatList<PlaylistResult> | null>(null);
  const resultsSongsListRef = useRef<FlatList<Song> | null>(null);
  const searchCacheRef = useRef<Map<string, { songs: Song[]; playlists: PlaylistResult[]; timestamp: number }> | null>(null);
  if (searchCacheRef.current === null) {
    searchCacheRef.current = new Map();
  }

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

  const performSearch = useCallback(async (searchQuery: string) => {
    const requestId = ++requestSeqRef.current;
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      activeSearchAbortRef.current?.abort();
      activeSearchAbortRef.current = null;
      setSongResults([]);
      setPlaylistResults([]);
      setSearchDisplayQuery("");
      setSearchLoading(false);
      return;
    }

    activeSearchAbortRef.current?.abort();
    const controller = new AbortController();
    activeSearchAbortRef.current = controller;

    // Check cache first (5 minute TTL)
    const cacheKey = normalizedQuery.toLowerCase();
    const cached = searchCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < 300000) { // 5 minutes
      setSongResults(cached.songs);
      setPlaylistResults(cached.playlists);
      setSearchDisplayQuery(normalizedQuery);
      setSearchLoading(false);
      if (activeSearchAbortRef.current === controller) {
        activeSearchAbortRef.current = null;
      }
      return;
    }

    setSearchLoading(true);
    const apiUrl = getApiUrl();
    const parsedQuery = parseStructuredQuery(normalizedQuery);
    const searchTerm = parsedQuery.freeText || normalizedQuery;

    // Safe fetch — returns parsed JSON or null, never throws
    const safeFetch = (url: string) =>
      fetch(url, { signal: controller.signal })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);

    // Deduplication key: normalized title + first artist
    const mkKey = (title: string, artist: string) => {
      const t = normalizeText(title);
      const a = artist === 'Unknown Artist'
        ? 'unknown'
        : normalizeText(artist.split(',')[0].trim());
      return `${t}|||${a}`;
    };

    // Which version of a song is better?
    const isBetter = (n: Song, e: Song): boolean => {
      if (n.artist === 'Unknown Artist' && e.artist !== 'Unknown Artist') return false;
      if (n.artist !== 'Unknown Artist' && e.artist === 'Unknown Artist') return true;
      const remix = /\b(remix|lofi|slowed|cover|live|acoustic|instrumental|8d|nightcore)\b/i;
      const nR = remix.test(n.title), eR = remix.test(e.title);
      if (!nR && eR) return true;
      if (nR && !eR) return false;
      return (n.playCount || 0) > (e.playCount || 0);
    };

    // Parse song results that may use .link or .url media fields.
    const parseBackup = (s: any): Song | null => {
      if (!s?.id) return null;
      const dl: any[] = Array.isArray(s.downloadUrl) ? s.downloadUrl : [];
      const audioUrl =
        dl.find(d => d.quality === '320kbps')?.link ||
        dl.find(d => d.quality === '320kbps')?.url ||
        dl.find(d => d.quality === '160kbps')?.link ||
        dl.find(d => d.quality === '160kbps')?.url ||
        dl[dl.length - 1]?.link || dl[dl.length - 1]?.url || '';
      if (!audioUrl) return null;
      const imgs: any[] = Array.isArray(s.image) ? s.image : [];
      const coverUrl =
        imgs.find(i => i.quality === '500x500')?.link ||
        imgs.find(i => i.quality === '500x500')?.url ||
        imgs.find(i => i.quality === '150x150')?.link ||
        imgs[imgs.length - 1]?.link || imgs[imgs.length - 1]?.url || '';
      const artist = (typeof s.primaryArtists === 'string' && s.primaryArtists.trim())
        ? s.primaryArtists.trim()
        : (s.artists?.primary || []).map((a: any) => a.name).join(', ') || 'Unknown Artist';
      const sec = Number(s.duration) || 0;
      return {
        id: s.id, title: s.name || s.title || '', artist,
        album: s.album?.name || '', duration: sec,
        coverUrl, genre: s.language || '', audioUrl,
        year: s.year ? String(s.year) : '', source: 'jiosaavn',
        playCount: Number(s.playCount) || 0,
      };
    };

    const mergeInto = (map: Map<string, Song>, song: Song) => {
      const k = mkKey(song.title, song.artist);
      const ex = map.get(k);
      if (!ex || isBetter(song, ex)) map.set(k, song);
    };

    const toFinalList = (map: Map<string, Song>) => {
      const ts = Date.now();
      return Array.from(map.values()).map((s, i) => ({ ...s, id: `${s.id}-${i}-${ts}` }));
    };

    // Fast rank using JioSaavn playCount only — no network wait
    const fastRank = (songs: Song[]) =>
      rankSongs(songs, normalizedQuery, 5).map(r => r.song).slice(0, 15);
    const requestIsActive = () =>
      requestId === requestSeqRef.current && !controller.signal.aborted;

    try {
      if (!requestIsActive()) return;

      // OPTIMIZATION: Fetch catalog songs first (instant, local)
      const catalogSongs = await getCatalogSongs().catch(() => [] as Song[]);

      if (requestIsActive()) {
        // Show catalog results immediately
        const songsMap = new Map<string, Song>();
        for (const s of searchCatalog(catalogSongs, normalizedQuery)) {
          mergeInto(songsMap, s);
        }

        const catalogResults = toFinalList(songsMap);
        if (catalogResults.length > 0) {
          setSongResults(fastRank(catalogResults));
          setSearchDisplayQuery(normalizedQuery);
        }

        // OPTIMIZATION: Fetch songs and playlists in parallel (network)
        const [songsData, playlistsData] = await Promise.all([
          safeFetch(`${apiUrl}api/search/songs?query=${encodeURIComponent(searchTerm)}&limit=12`),
          safeFetch(`${apiUrl}api/search/playlists?query=${encodeURIComponent(searchTerm)}&limit=6`),
        ]);

        if (requestIsActive()) {
          // Merge network results with catalog results
          for (const s of (songsData?.data?.results || songsData?.results || [])) {
            const song = parseBackup(s);
            if (song) mergeInto(songsMap, song);
          }

          const playlists = playlistsData?.success
            ? normalizePlaylistResults(playlistsData.data?.results)
            : Array.isArray(playlistsData?.results)
              ? normalizePlaylistResults(playlistsData.results)
              : [];

          const songs = toFinalList(songsMap);
          const rankedSongs = fastRank(songs);

          // Cache results
          searchCacheRef.current.set(cacheKey, {
            songs: rankedSongs,
            playlists,
            timestamp: now
          });

          // Limit cache size to 20 entries
          if (searchCacheRef.current.size > 20) {
            const firstKey = searchCacheRef.current.keys().next().value;
            if (firstKey) searchCacheRef.current.delete(firstKey);
          }

          // Show final results with network data
          setSongResults(rankedSongs);
          setPlaylistResults(playlists);
          setSearchDisplayQuery(normalizedQuery);
          setSearchLoading(false);
          if (activeSearchAbortRef.current === controller) {
            activeSearchAbortRef.current = null;
          }
        }
      }

    } catch {
      if (!requestIsActive()) return;
      setSongResults([]);
      setPlaylistResults([]);
      setSearchDisplayQuery(normalizedQuery);
      setSearchLoading(false);
      if (activeSearchAbortRef.current === controller) {
        activeSearchAbortRef.current = null;
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
        type: "query",
      };
      const filtered = prev.filter(
        (item) => item.label.toLowerCase() !== normalized.toLowerCase()
      );
      return [nextItem, ...filtered].slice(0, 8);
    });
  }, []);

  useEffect(() => {
    const incomingQuery = Array.isArray(params.q)
      ? params.q[0]
      : params.q || (Array.isArray(params.name) ? params.name[0] : params.name);
    const next = String(incomingQuery || "").trim();
    if (next.length < 2 || next === query.trim()) return;

    setQuery(next);
    rememberRecentSearch(next);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    void performSearch(next);
  }, [params.name, params.q, performSearch, query, rememberRecentSearch]);

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

  const renderBrowseCategory = useCallback(
    ({ item, index }: { item: BrowseCategory; index: number }) => (
      <BrowseCategoryCard category={item} index={index} onPress={handleGenrePress} />
    ),
    [handleGenrePress]
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

  const handleResultFilterSelect = useCallback((filter: ResultFilter) => {
    setResultFilter(filter);
  }, []);

  const renderResultFilter = useCallback(
    ({ item }: { item: { key: ResultFilter; label: string } }) => (
      <ResultFilterChip
        filter={item}
        activeFilter={resultFilter}
        onSelect={handleResultFilterSelect}
      />
    ),
    [handleResultFilterSelect, resultFilter]
  );

  const applyEmptySearchState = useCallback((displayQuery = "") => {
    setSongResults([]);
    setPlaylistResults([]);
    setSearchDisplayQuery(displayQuery);
    setSearchLoading(false);
  }, []);

  const startSearchLoading = useCallback(() => {
    setSearchLoading(true);
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
    activeSearchAbortRef.current?.abort();
    activeSearchAbortRef.current = null;
    setQuery("");
    applyEmptySearchState();
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
  }, [applyEmptySearchState]);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestSeqRef.current += 1;
      activeSearchAbortRef.current?.abort();
      activeSearchAbortRef.current = null;
      applyEmptySearchState();
      return;
    }

    startSearchLoading();
    debounceTimer.current = setTimeout(() => {
      void performSearch(trimmed);
    }, 300); // Increased from 150ms to 300ms for better performance

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [applyEmptySearchState, performSearch, query, startSearchLoading]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      activeSearchAbortRef.current?.abort();
      activeSearchAbortRef.current = null;
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
  const resultDataKey =
    `${query.trim()}-${resultFilter}-${songResults.length}-${playlistResults.length}-${searchLoading ? 1 : 0}`;

  useEffect(() => {
    if (showBrowse || searchLoading) return;

    requestAnimationFrame(() => {
      if (resultFilter === "playlists") {
        resultsPlaylistsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else {
        resultsSongsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    });
  }, [searchLoading, resultFilter, showBrowse, songResults.length, playlistResults.length]);

  const showPlaylistResults = resultFilter !== "songs" && playlistResults.length > 0;
  const showSongResults = resultFilter !== "playlists" && songResults.length > 0;
  const displayedSongs = showSongResults ? songResults : [];
  const featuredPlaylists = useMemo(() => playlistResults.slice(0, 6), [playlistResults]);

  const renderSong = useCallback(
    ({ item }: { item: Song; index: number }) => {
      // Queue = tapped song first, then other results that have a DIFFERENT title.
      // This means "next song" will be a related but differently-named track,
      // not another "Starter Boy" variant from the same search.
      const normalizedItemTitle = normalizeText(item.title);
      const relatedQueue = [
        item,
        ...songResults.filter(
          s => s.id !== item.id && normalizeText(s.title) !== normalizedItemTitle
        ),
      ];
      return <SongRow song={item} queue={relatedQueue} />;
    },
    [songResults]
  );

  const getPlaylistCardElement = useCallback(
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
            routerPush({
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
            <Text style={styles.playlistGridMeta}>
              {Math.max(0, playlist.songCount || 0)} songs
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

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Offline: show banner when searching, full screen when idle */}
      {!isOnline && query.length === 0 && (
        <OfflineScreen
          message="Search requires an internet connection."
          hideDownloadsButton={false}
        />
      )}
      {!isOnline && query.length > 0 && <OfflineBanner />}
      {/* ── Search bar ── */}
      <View style={styles.searchBarRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#6A6A6A" />
          <TextInput
            style={styles.input}
            placeholder="What do you want to listen to?"
            placeholderTextColor="#6A6A6A"
            value={query}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmitSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable onPress={handleClear} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#6A6A6A" />
            </Pressable>
          ) : null}
        </View>
        {query.length > 0 ? (
          <Pressable onPress={handleClear} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
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
          {/* ── Recent searches ── */}
          {recentSearches.length > 0 ? (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Recent searches</Text>
              {recentSearches.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.recentRow, pressed && styles.recentRowPressed]}
                  onPress={() => handleRecentSearchPress(item.label)}
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
                      <Ionicons name={item.icon ?? "person"} size={24} color={Colors.subtext} />
                    </View>
                  )}
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentLabel} numberOfLines={1}>{item.label}</Text>
                    {item.subtitle ? (
                      <Text style={styles.recentSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  <View style={styles.recentActions}>
                    {item.type !== "artist" && item.type !== "query" ? (
                      <Pressable hitSlop={10} style={styles.recentActionBtn} onPress={(e) => e.stopPropagation()}>
                        <Ionicons name="add-circle-outline" size={22} color={Colors.subtext} />
                      </Pressable>
                    ) : null}
                    <Pressable
                      hitSlop={10}
                      style={styles.recentActionBtn}
                      onPress={(e) => { e.stopPropagation(); handleRemoveRecentSearch(item.id); }}
                    >
                      <Ionicons name="close" size={18} color={Colors.subtext} />
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* ── Browse All ── */}
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
        /* ── Results ── */
        <View style={styles.resultsWrap}>
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
              numColumns={2}
              columnWrapperStyle={styles.playlistGridRow}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              ListEmptyComponent={<View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No playlists found.</Text></View>}
            />
          ) : !showSongResults && resultFilter === "songs" ? (
            <View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No songs found.</Text></View>
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
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={11}
              ListFooterComponent={
                showPlaylistResults ? (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>Playlists</Text>
                      {resultFilter === "all" ? (
                        <Pressable onPress={() => setResultFilter("playlists")}>
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

  // ── Search bar ──────────────────────────────────────────────────────────────
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  input: {
    flex: 1,
    color: "#000000",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  clearButton: { padding: 2 },
  clearButtonPressed: { opacity: 0.6 },
  cancelBtn: { paddingVertical: 4 },
  cancelText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // ── Scroll / shared ─────────────────────────────────────────────────────────
  scrollView: { flex: 1 },
  content: { paddingTop: 4 },

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
  recentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  recentActionBtn: { padding: 8 },

  // legacy stubs (unused but referenced nowhere — safe to keep empty)
  recentHeaderRow: {},
  recentClearText: {},
  recentChipWrap: {},
  recentChip: {},
  recentChipPressed: {},
  recentChipImage: {},
  recentChipIconWrap: {},
  recentChipLabel: {},
  recentChipCloseBtn: {},
  topBar: {},
  header: {},

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
  browseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  // unused hero styles kept as stubs
  browseHeroCard: {},
  browseSmallCard: {},
  browseHeroCardTitle: {},
  browseHeroCardImage: {},

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
  filterChip: {
    height: 32,
    borderRadius: 4,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  filterChipTextActive: {
    color: Colors.background,
    fontFamily: "Inter_700Bold",
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

  // ── Unused stubs ─────────────────────────────────────────────────────────────
  resultsControlsWrap: {},
  resultsHeaderPlain: {},
  resultsPillText: {},
  filterTabsWrap: {},
  filterTabsRow: {},
  filterTabChip: {},
  filterTabChipActive: {},
  filterTabChipPressed: {},
  filterTabChipText: {},
  filterTabChipTextActive: {},
});
