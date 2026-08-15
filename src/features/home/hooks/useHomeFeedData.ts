import { useState, useEffect, useCallback, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import { type Song, convertJioSaavnSong } from "@/lib/musicData";
import { getRecentlyPlayed, type RecentlyPlayedItem } from "@/lib/storage";
import { getPublicPlaylists, type FirestorePlaylist } from "@/lib/firestore";
import {
  getCachedHomePublicPlaylists,
  setCachedHomePublicPlaylists,
  clearCachedHomePublicPlaylists,
} from "@/lib/homeCache";
import {
  clearJioSaavnPlaylistCache,
  getHomeJioSaavnCategories,
  type HomeJioSaavnCategoryData,
} from "@/data/providers/JioSaavnProvider";
import {
  getDailyNewReleaseSongs,
  clearDailyNewReleaseSongCache,
} from "@/data/providers/NewReleaseProvider";
import {
  getFeaturedArtists,
  type ArtistCard,
  clearFeaturedArtistsCache,
} from "@/data/providers/ArtistProvider";
import {
  getRecommendationHomeFeed,
  type RecommendationSection,
} from "@/data/providers/RecommendationProvider";
import { useOnReconnect } from "@/contexts/NetworkContext";
import { logger } from "@/lib/logger";

const HOME_ESSENTIAL_CATEGORY_IDS = [
  "new-arrivals",
  "popular",
  "trending",
  "bollywood",
  "party-mix",
  "romance",
  "top-charts",
] as const;

interface HomeSessionCache {
  hydrated: boolean;
  categories: HomeJioSaavnCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  recentlyPlayed: RecentlyPlayedItem[];
  featuredArtists: ArtistCard[];
  newReleaseSongs: Song[];
  recommendations: RecommendationSection[];
}

const HOME_CACHE: HomeSessionCache = {
  hydrated: false,
  categories: [],
  publicPlaylists: [],
  recentlyPlayed: [],
  featuredArtists: [],
  newReleaseSongs: [],
  recommendations: [],
};

export function useHomeFeedData() {
  const [categories, setCategories] = useState<HomeJioSaavnCategoryData[]>(
    HOME_CACHE.hydrated ? HOME_CACHE.categories : []
  );
  const [publicPlaylists, setPublicPlaylists] = useState<FirestorePlaylist[]>(
    HOME_CACHE.hydrated ? HOME_CACHE.publicPlaylists : []
  );
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedItem[]>(
    HOME_CACHE.hydrated ? HOME_CACHE.recentlyPlayed : []
  );
  const [featuredArtists, setFeaturedArtists] = useState<ArtistCard[]>(
    HOME_CACHE.hydrated ? HOME_CACHE.featuredArtists : []
  );
  const [newReleaseSongs, setNewReleaseSongs] = useState<Song[]>(
    HOME_CACHE.hydrated ? HOME_CACHE.newReleaseSongs : []
  );
  const [recommendations, setRecommendations] = useState<RecommendationSection[]>(
    HOME_CACHE.hydrated ? HOME_CACHE.recommendations : []
  );
  const [refreshing, setRefreshing] = useState(false);

  const loadHomeFeed = useCallback(
    async (forceRefresh = false) => {
      try {
        const [
          jioRes,
          playlistsRes,
          artistsRes,
          releasesRes,
          recRes,
          recentRes,
        ] = await Promise.allSettled([
          getHomeJioSaavnCategories({
            forceRefresh,
            limitPerCategory: 15,
            categoryIds: [...HOME_ESSENTIAL_CATEGORY_IDS],
          }),
          getCachedHomePublicPlaylists().then(async (cached) => {
            if (cached && cached.length > 0 && !forceRefresh) return cached;
            const remote = await getPublicPlaylists(8);
            if (remote && remote.length > 0) {
              await setCachedHomePublicPlaylists(remote);
            }
            return remote;
          }),
          getFeaturedArtists(),
          getDailyNewReleaseSongs({ limit: 20, forceRefresh }),
          getRecommendationHomeFeed({ forceRefresh }),
          getRecentlyPlayed().then((r) => r.slice(0, 8)).catch(() => []),
        ]);

        if (recentRes.status === "fulfilled" && recentRes.value) {
          setRecentlyPlayed(recentRes.value);
          HOME_CACHE.recentlyPlayed = recentRes.value;
        }

        if (jioRes.status === "fulfilled" && jioRes.value?.length) {
          // Filter category rows to only show playlists & albums (single songs are dedicated to Quick Picks)
          const filteredCategories: HomeJioSaavnCategoryData[] = [];
          for (const cat of jioRes.value) {
            const results = cat.results.filter((item) => item.type !== "song");
            if (results.length > 0) {
              filteredCategories.push({ ...cat, results });
            }
          }

          setCategories(filteredCategories);
          HOME_CACHE.categories = filteredCategories;
        }

        if (playlistsRes.status === "fulfilled" && playlistsRes.value?.length) {
          setPublicPlaylists(playlistsRes.value);
          HOME_CACHE.publicPlaylists = playlistsRes.value;
        }

        if (artistsRes.status === "fulfilled" && artistsRes.value?.length) {
          setFeaturedArtists(artistsRes.value);
          HOME_CACHE.featuredArtists = artistsRes.value;
        }

        if (releasesRes.status === "fulfilled" && releasesRes.value?.length) {
          setNewReleaseSongs(releasesRes.value);
          HOME_CACHE.newReleaseSongs = releasesRes.value;
        }

        if (recRes.status === "fulfilled" && recRes.value?.sections?.length) {
          setRecommendations(recRes.value.sections);
          HOME_CACHE.recommendations = recRes.value.sections;
        }

        HOME_CACHE.hydrated = true;
      } catch (error) {
        logger.error("[Home] Feed load failed:", error);
      }
    },
    []
  );

  useEffect(() => {
    void loadHomeFeed(false);
  }, [loadHomeFeed]);

  useFocusEffect(
    useCallback(() => {
      getRecentlyPlayed()
        .then((recent) => {
          const trimmed = recent.slice(0, 8);
          setRecentlyPlayed(trimmed);
          HOME_CACHE.recentlyPlayed = trimmed;
        })
        .catch(() => {});
    }, [])
  );

  useOnReconnect(
    useCallback(() => {
      void loadHomeFeed(true);
    }, [loadHomeFeed])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        clearJioSaavnPlaylistCache(),
        clearDailyNewReleaseSongCache(),
        clearCachedHomePublicPlaylists(),
        clearFeaturedArtistsCache(),
      ]);

      const recent = await getRecentlyPlayed().catch(() => []);
      const trimmedRecent = recent.slice(0, 8);
      setRecentlyPlayed(trimmedRecent);
      HOME_CACHE.recentlyPlayed = trimmedRecent;

      await loadHomeFeed(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadHomeFeed]);

  // Quick Picks displays the hottest New Releases & Most Popular tracks
  const quickPickSongs = useMemo(() => {
    const songs: Song[] = [];
    const seen = new Set<string>();

    // 1. Add fresh New Releases
    for (const s of newReleaseSongs) {
      if (s?.id && !seen.has(s.id)) {
        seen.add(s.id);
        songs.push(s);
      }
    }

    // 2. Add top single songs from Most Popular & New Arrivals categories only
    const priorityCategories = categories.filter(
      (c) => c.id === "popular" || c.id === "new-arrivals" || c.id === "trending"
    );

    for (const cat of priorityCategories) {
      for (const item of cat.results) {
        if (item.songData) {
          try {
            const converted = convertJioSaavnSong(item.songData);
            if (converted?.id && !seen.has(converted.id)) {
              seen.add(converted.id);
              songs.push(converted);
            }
          } catch {
            // Ignore
          }
        }
      }
      if (songs.length >= 24) break;
    }

    return songs.slice(0, 24);
  }, [categories, newReleaseSongs]);

  const hasContent =
    categories.length > 0 ||
    publicPlaylists.length > 0 ||
    newReleaseSongs.length > 0 ||
    recentlyPlayed.length > 0;

  return {
    categories,
    publicPlaylists,
    recentlyPlayed,
    featuredArtists,
    quickPickSongs,
    recommendations,
    refreshing,
    hasContent,
    loadHomeFeed,
    handleRefresh,
  };
}
