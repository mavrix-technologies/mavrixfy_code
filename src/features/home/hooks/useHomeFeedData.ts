import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { type Song, convertJioSaavnSong } from "@/lib/musicData";
import { getRecentlyPlayed, type RecentlyPlayedItem } from "@/lib/storage";
import { getPublicPlaylists, type FirestorePlaylist } from "@/lib/firestore";
import {
  getCachedHomePublicPlaylists,
  setCachedHomePublicPlaylists,
  clearCachedHomePublicPlaylists,
  getCachedHomeFeedSnapshot,
  setCachedHomeFeedSnapshot,
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

const HOME_SECTION_TIMEOUT_MS = 8000;
const HOME_SECONDARY_TIMEOUT_MS = 6000;

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

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      logger.warn(`[Home] ${label} timed out after ${ms}ms`);
      resolve(fallback);
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export function useHomeFeedData() {
  const loadRunRef = useRef(0);
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
  const [loading, setLoading] = useState(!HOME_CACHE.hydrated);
  const [loadingMainContent, setLoadingMainContent] = useState(!HOME_CACHE.hydrated);
  const [refreshing, setRefreshing] = useState(false);

  const loadHomeFeed = useCallback(
    async (forceRefresh = false) => {
      const runId = ++loadRunRef.current;
      const isActiveRun = () => loadRunRef.current === runId;

      const applyRecentlyPlayed = (items: RecentlyPlayedItem[]) => {
        if (!isActiveRun()) return;
        setRecentlyPlayed(items);
        HOME_CACHE.recentlyPlayed = items;
      };

      const applyPublicPlaylists = (items: FirestorePlaylist[]) => {
        if (!isActiveRun() || items.length === 0) return;
        setPublicPlaylists(items);
        HOME_CACHE.publicPlaylists = items;
      };

      const applyCategories = (items: HomeJioSaavnCategoryData[]) => {
        if (!isActiveRun() || items.length === 0) return;
        setCategories(items);
        HOME_CACHE.categories = items;
      };

      const applyArtists = (items: ArtistCard[]) => {
        if (!isActiveRun() || items.length === 0) return;
        setFeaturedArtists(items);
        HOME_CACHE.featuredArtists = items;
      };

      const applyNewReleaseSongs = (items: Song[]) => {
        if (!isActiveRun() || items.length === 0) return;
        setNewReleaseSongs(items);
        HOME_CACHE.newReleaseSongs = items;
      };

      const applyRecommendations = (items: RecommendationSection[]) => {
        if (!isActiveRun() || items.length === 0) return;
        setRecommendations(items);
        HOME_CACHE.recommendations = items;
      };

      const applyHomeSnapshot = (snapshot: {
        categories: HomeJioSaavnCategoryData[];
        publicPlaylists: FirestorePlaylist[];
        featuredArtists: ArtistCard[];
        newReleaseSongs: Song[];
        recommendations: RecommendationSection[];
      }) => {
        applyCategories(snapshot.categories);
        applyPublicPlaylists(snapshot.publicPlaylists);
        applyArtists(snapshot.featuredArtists);
        applyNewReleaseSongs(snapshot.newReleaseSongs);
        applyRecommendations(snapshot.recommendations);
      };

      try {
        if (!HOME_CACHE.hydrated) setLoading(true);
        setLoadingMainContent(true);

        await Promise.allSettled([
          getRecentlyPlayed()
            .then((recent) => applyRecentlyPlayed(recent.slice(0, 8)))
            .catch(() => applyRecentlyPlayed([])),
          !forceRefresh
            ? getCachedHomePublicPlaylists({ allowStale: true }).then(applyPublicPlaylists)
            : Promise.resolve(),
          !forceRefresh
            ? getCachedHomeFeedSnapshot({ allowStale: true }).then((snapshot) => {
                if (snapshot) applyHomeSnapshot(snapshot);
              })
            : Promise.resolve(),
        ]);

        const jioTask = withTimeout(
          getHomeJioSaavnCategories({
            forceRefresh,
            limitPerCategory: 15,
            categoryIds: [...HOME_ESSENTIAL_CATEGORY_IDS],
          }),
          HOME_SECTION_TIMEOUT_MS,
          [] as HomeJioSaavnCategoryData[],
          "JioSaavn home categories"
        ).then((homeCategories) => {
          applyCategories(homeCategories.filter((cat) => cat.results.length > 0));
        });

        const playlistsTask = withTimeout(
          getCachedHomePublicPlaylists().then(async (cached) => {
          if (cached && cached.length > 0 && !forceRefresh) {
            applyPublicPlaylists(cached);
            return cached;
          }

          const remote = await getPublicPlaylists(8);
          if (remote && remote.length > 0) {
            applyPublicPlaylists(remote);
            await setCachedHomePublicPlaylists(remote);
          }
          return remote;
          }),
          HOME_SECONDARY_TIMEOUT_MS,
          [] as FirestorePlaylist[],
          "public playlists"
        );

        const artistsTask = withTimeout(
          getFeaturedArtists(),
          HOME_SECONDARY_TIMEOUT_MS,
          [] as ArtistCard[],
          "featured artists"
        ).then(applyArtists);
        const releasesTask = withTimeout(
          getDailyNewReleaseSongs({ limit: 24, forceRefresh }),
          HOME_SECTION_TIMEOUT_MS,
          [] as Song[],
          "new releases"
        ).then(applyNewReleaseSongs);
        const recommendationsTask = withTimeout(
          getRecommendationHomeFeed({ forceRefresh }).then((feed) => feed.sections),
          HOME_SECONDARY_TIMEOUT_MS,
          [] as RecommendationSection[],
          "recommendations"
        ).then(applyRecommendations);

        await Promise.allSettled([
          jioTask,
          playlistsTask,
          artistsTask,
          releasesTask,
          recommendationsTask,
        ]);

        if (isActiveRun()) {
          HOME_CACHE.hydrated = true;
          void setCachedHomeFeedSnapshot({
            categories: HOME_CACHE.categories,
            publicPlaylists: HOME_CACHE.publicPlaylists,
            featuredArtists: HOME_CACHE.featuredArtists,
            newReleaseSongs: HOME_CACHE.newReleaseSongs,
            recommendations: HOME_CACHE.recommendations,
          });
        }
      } catch (error) {
        logger.error("[Home] Feed load failed:", error);
      } finally {
        setLoading(false);
        setLoadingMainContent(false);
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

    // 2. Add top single songs from Most Popular, New Arrivals, Trending & Bollywood categories
    const priorityCategories = categories.filter(
      (c) => c.id === "popular" || c.id === "new-arrivals" || c.id === "trending" || c.id === "bollywood"
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
    loading,
    loadingMainContent,
    refreshing,
    hasContent,
    loadHomeFeed,
    handleRefresh,
  };
}
