import { useNetwork, useOnReconnect } from "@/contexts/NetworkContext";
import { clearFeaturedArtistsCache, getFeaturedArtists, type ArtistCard } from "@/data/providers/ArtistProvider";
import { getHomeCatalogCategories } from "@/data/providers/MusicCatalogProvider";
import { getOfficialHomeFeed, getOfficialHomeSongs } from "@/data/providers/MusicCatalogFeedService";
import type { CatalogCategoryData } from "@/data/providers/MusicCatalogTypes";
import {
  clearQuickPicksCache,
  fetchQuickPicksFeed,
  type QuickPicksPool,
} from "@/data/providers/QuickPicksProvider";
import { getPublicPlaylists, type FirestorePlaylist } from "@/lib/firestore";
import {
  clearCachedHomePublicPlaylists,
  getCachedHomeFeedSnapshot,
  getCachedHomePublicPlaylists,
  HOME_CACHE_INVALIDATED_EVENT,
  setCachedHomeFeedSnapshot,
  setCachedHomePublicPlaylists,
} from "@/lib/homeCache";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { getRecentlyPlayed, type RecentlyPlayedItem } from "@/lib/storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";

const DEFAULT_POOL: QuickPicksPool = {
  trending: [],
  bollywood: [],
  latest: [],
  all: [],
};

const session = {
  hydrated: false,
  categories: [] as CatalogCategoryData[],
  publicPlaylists: [] as FirestorePlaylist[],
  featuredArtists: [] as ArtistCard[],
  quickPickSongs: [] as Song[],
  quickPicksPool: DEFAULT_POOL,
};

interface HomeFeedState {
  categories: CatalogCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  featuredArtists: ArtistCard[];
  quickPickSongs: Song[];
  quickPicksPool: QuickPicksPool;
  loading: boolean;
}

export function useHomeFeedData({ compact = false }: { compact?: boolean } = {}) {
  const { isChecking, isOnline } = useNetwork();
  const mountedRef = useRef(true);
  const activeLoadRef = useRef<{ promise: Promise<void>; forceRefresh: boolean; online: boolean } | null>(null);
  const initialLoadRef = useRef(false);

  const [feedState, setFeedState] = useState<HomeFeedState>(() => ({
    categories: session.categories,
    publicPlaylists: session.publicPlaylists,
    featuredArtists: session.featuredArtists,
    quickPickSongs: session.quickPickSongs,
    quickPicksPool: session.quickPicksPool,
    loading: !session.hydrated,
  }));

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecentlyPlayed = useCallback(async () => {
    try {
      const items = await getRecentlyPlayed();
      const topItems = items.slice(0, 16);
      if (!mountedRef.current) return;
      setRecentlyPlayed(topItems);
    } catch {
      // ignore storage read failures
    }
  }, []);

  const loadHomeFeed = useCallback(
    async function loadFeed(forceRefresh = false): Promise<void> {
      const active = activeLoadRef.current;
      if (active) {
        await active.promise.catch(() => {}); // The owning load reports failures.
        // Join equivalent loads; queue one fresh request when a normal load
        // overlaps an explicit refresh or reconnects during disk hydration.
        if (mountedRef.current && ((forceRefresh && !active.forceRefresh) || (isOnline && !active.online))) {
          return loadFeed(forceRefresh);
        }
        return;
      }
      const task = (async () => {
        // 1. Instant Cache Hydration: Single batched state update
        if (!session.hydrated) {
          const [snapshot, cachedPlaylists] = await Promise.all([
            getCachedHomeFeedSnapshot({ allowStale: true }),
            getCachedHomePublicPlaylists({ allowStale: true }),
          ]);
          if (snapshot && mountedRef.current) {
            const playlists =
              cachedPlaylists.length > 0 ? cachedPlaylists : snapshot.publicPlaylists;
            const pool = snapshot.quickPicksPool ?? {
              ...DEFAULT_POOL,
              all: snapshot.quickPickSongs,
            };
            session.categories = snapshot.categories;
            session.publicPlaylists = playlists;
            session.featuredArtists = snapshot.featuredArtists;
            session.quickPickSongs = snapshot.quickPickSongs;
            session.quickPicksPool = pool;
            session.hydrated = true;

            setFeedState({
              categories: snapshot.categories,
              publicPlaylists: playlists,
              featuredArtists: snapshot.featuredArtists,
              quickPickSongs: snapshot.quickPickSongs,
              quickPicksPool: pool,
              loading: false, // Instant feed ready from cache
            });
          } else if (cachedPlaylists.length > 0 && mountedRef.current) {
            session.publicPlaylists = cachedPlaylists;
            setFeedState((prev) => ({
              ...prev,
              publicPlaylists: cachedPlaylists,
            }));
          }
        }

        if (!mountedRef.current || !isOnline) return;

        // 2. Network Fetching: Concurrent fetch without staggered UI re-renders
        const officialTask = getOfficialHomeFeed(forceRefresh)
          .then(async (feed) => {
            const freshSongs = compact ? [] : await getOfficialHomeSongs(feed.songs || feed.songIds);
            return { categories: feed.categories, songs: freshSongs };
          })
          .catch(async (error) => {
            logger.warn("[Home] Official feed unavailable, using search fallback:", error);
            try {
              const fallbackCats = await getHomeCatalogCategories({ forceRefresh });
              return fallbackCats.length > 0 ? { categories: fallbackCats, songs: [] } : null;
            } catch (err) {
              logger.warn("[Home] Fallback categories failed:", err);
              return null;
            }
          });

        const quickPicksTask = compact ? Promise.resolve(null) : officialTask
          .then((feed) =>
            feed
              ? fetchQuickPicksFeed({
                  forceRefresh,
                  categories: feed.categories,
                  newReleaseSongs: feed.songs,
                })
              : null
          )
          .catch(() => null);

        const playlistsTask = compact ? Promise.resolve([] as FirestorePlaylist[]) : getPublicPlaylists(8)
          .then(async (items) => {
            if (items.length > 0) {
              await setCachedHomePublicPlaylists(items);
            }
            return items;
          })
          .catch(() => [] as FirestorePlaylist[]);

        const artistsTask = compact ? Promise.resolve([] as ArtistCard[]) : getFeaturedArtists().catch(() => [] as ArtistCard[]);

        const [officialFeed, quickPicksFeed, playlists, artists] =
          await Promise.all([
            officialTask,
            quickPicksTask,
            playlistsTask,
            artistsTask,
          ]);

        if (!mountedRef.current) return;

        let newCategories = session.categories;
        let newPlaylists = session.publicPlaylists;
        let newArtists = session.featuredArtists;
        let newQuickSongs = session.quickPickSongs;
        let newPool = session.quickPicksPool;

        if (officialFeed?.categories.length) {
          newCategories = officialFeed.categories;
        }

        if (playlists.length > 0) {
          newPlaylists = playlists;
        }

        if (artists.length > 0) {
          newArtists = artists;
        }

        if (quickPicksFeed?.all.length) {
          newPool = quickPicksFeed;
          newQuickSongs = quickPicksFeed.all;
        }

        session.categories = newCategories;
        session.publicPlaylists = newPlaylists;
        session.featuredArtists = newArtists;
        session.quickPickSongs = newQuickSongs;
        session.quickPicksPool = newPool;

        if (newCategories.length || newPlaylists.length || newArtists.length || newQuickSongs.length) {
          session.hydrated = true;
          void setCachedHomeFeedSnapshot({
            categories: newCategories,
            publicPlaylists: newPlaylists,
            featuredArtists: newArtists,
            quickPickSongs: newQuickSongs,
            quickPicksPool: newPool,
          });
        }

        // Commit single batched update to UI
        setFeedState({
          categories: newCategories,
          publicPlaylists: newPlaylists,
          featuredArtists: newArtists,
          quickPickSongs: newQuickSongs,
          quickPicksPool: newPool,
          loading: false,
        });
      })();

      activeLoadRef.current = { promise: task, forceRefresh, online: isOnline };
      try {
        await task;
      } catch (error) {
        logger.warn("[Home] Feed load failed:", error);
      } finally {
        if (activeLoadRef.current?.promise === task) activeLoadRef.current = null;
        if (mountedRef.current) setFeedState(previous => previous.loading ? { ...previous, loading: false } : previous);
      }
    },
    [compact, isOnline]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isChecking || initialLoadRef.current) return;
    initialLoadRef.current = true;
    if (!session.hydrated) void loadHomeFeed(false);
  }, [isChecking, loadHomeFeed]);

  useFocusEffect(
    useCallback(() => {
      void loadRecentlyPlayed();
    }, [loadRecentlyPlayed])
  );

  useOnReconnect(
    useCallback(() => {
      void loadHomeFeed(false);
    }, [loadHomeFeed])
  );

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(HOME_CACHE_INVALIDATED_EVENT, () => {
      void loadHomeFeed(true);
    });
    return () => listener.remove();
  }, [loadHomeFeed]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        clearCachedHomePublicPlaylists(),
        clearFeaturedArtistsCache(),
        clearQuickPicksCache(),
        loadRecentlyPlayed(),
      ]);
      await loadHomeFeed(true);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [loadHomeFeed, loadRecentlyPlayed]);

  const hasContent =
    feedState.categories.length > 0 ||
    feedState.quickPickSongs.length > 0 ||
    feedState.featuredArtists.length > 0 ||
    feedState.publicPlaylists.length > 0 ||
    recentlyPlayed.length > 0;

  return {
    categories: feedState.categories,
    publicPlaylists: feedState.publicPlaylists,
    featuredArtists: feedState.featuredArtists,
    quickPickSongs: feedState.quickPickSongs,
    quickPicksPool: feedState.quickPicksPool,
    recentlyPlayed,
    loading: feedState.loading,
    loadingMainContent: feedState.loading,
    refreshing,
    hasContent,
    handleRefresh,
  };
}
