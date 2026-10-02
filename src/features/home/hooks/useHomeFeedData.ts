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
import { AppState, DeviceEventEmitter } from "react-native";

const HOME_REFRESH_MS = 20 * 60 * 1000;
const RETRY_MS = 60 * 1000;

const DEFAULT_POOL: QuickPicksPool = {
  trending: [],
  bollywood: [],
  latest: [],
  all: [],
};

const session = {
  hydrated: false,
  updatedAt: 0,
  attemptedAt: 0,
  categories: [] as CatalogCategoryData[],
  publicPlaylists: [] as FirestorePlaylist[],
  featuredArtists: [] as ArtistCard[],
  quickPickSongs: [] as Song[],
  quickPicksPool: DEFAULT_POOL,
};

export function useHomeFeedData() {
  const { isOnline, isChecking } = useNetwork();
  const mountedRef = useRef(true);
  const activeLoadRef = useRef<Promise<void> | null>(null);
  const initialLoadRef = useRef(false);
  const [categories, setCategories] = useState(session.categories);
  const [publicPlaylists, setPublicPlaylists] = useState(session.publicPlaylists);
  const [featuredArtists, setFeaturedArtists] = useState(session.featuredArtists);
  const [quickPickSongs, setQuickPickSongs] = useState(session.quickPickSongs);
  const [quickPicksPool, setQuickPicksPool] = useState<QuickPicksPool>(session.quickPicksPool);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedItem[]>([]);
  const [loading, setLoading] = useState(!session.hydrated);
  const [refreshing, setRefreshing] = useState(false);

  const applyCategories = useCallback((items: CatalogCategoryData[]) => {
    if (!mountedRef.current || items.length === 0) return;
    session.categories = items;
    setCategories(items);
  }, []);

  const applySongs = useCallback((items: Song[]) => {
    if (!mountedRef.current || items.length === 0) return;
    session.quickPickSongs = items;
    setQuickPickSongs(items);
  }, []);

  const applyQuickPicksPool = useCallback((pool: QuickPicksPool) => {
    if (!mountedRef.current) return;
    session.quickPicksPool = pool;
    setQuickPicksPool(pool);
  }, []);

  const applyPlaylists = useCallback((items: FirestorePlaylist[]) => {
    if (!mountedRef.current || items.length === 0) return;
    session.publicPlaylists = items;
    setPublicPlaylists(items);
  }, []);

  const applyArtists = useCallback((items: ArtistCard[]) => {
    if (!mountedRef.current || items.length === 0) return;
    session.featuredArtists = items;
    setFeaturedArtists(items);
  }, []);

  const loadRecentlyPlayed = useCallback(async () => {
    const items = await getRecentlyPlayed().catch(() => []);
    if (mountedRef.current) setRecentlyPlayed(items.slice(0, 8));
  }, []);

  const loadHomeFeed = useCallback(
    async (forceRefresh = false) => {
      if (activeLoadRef.current) return activeLoadRef.current;
      const task = (async () => {
        session.attemptedAt = Date.now();
        if (!session.hydrated) {
          const [snapshot, cachedPlaylists] = await Promise.all([
            getCachedHomeFeedSnapshot({ allowStale: true }),
            getCachedHomePublicPlaylists({ allowStale: true }),
          ]);
          if (snapshot) {
            applyCategories(snapshot.categories);
            applyPlaylists(snapshot.publicPlaylists);
            applyArtists(snapshot.featuredArtists);
            applySongs(snapshot.quickPickSongs);
            applyQuickPicksPool(snapshot.quickPicksPool ?? {
              ...DEFAULT_POOL,
              all: snapshot.quickPickSongs,
            });
            session.hydrated = true;
          }
          applyPlaylists(cachedPlaylists);
        }

        void loadRecentlyPlayed();

        const officialTask = getOfficialHomeFeed(forceRefresh)
          .then(async (feed) => {
            applyCategories(feed.categories);
            session.updatedAt = Date.now();
            const freshSongs = await getOfficialHomeSongs(feed.songs || feed.songIds);
            return { categories: feed.categories, songs: freshSongs };
          })
          .catch(async (error) => {
            logger.warn("[Home] Official feed unavailable, using search fallback:", error);
            try {
              const fallbackCats = await getHomeCatalogCategories({ forceRefresh });
              if (fallbackCats.length > 0) {
                applyCategories(fallbackCats);
                session.updatedAt = Date.now();
              }
            } catch (err) {
              logger.warn("[Home] Fallback categories failed:", err);
            }
            return null;
          });

        const quickPicksTask = officialTask.then(feed => feed
          ? fetchQuickPicksFeed({ forceRefresh, categories: feed.categories, newReleaseSongs: feed.songs })
          : null)
          .catch(() => null);

        const playlistsTask = getPublicPlaylists(8).then(async (items) => {
          if (items.length > 0) {
            applyPlaylists(items);
            await setCachedHomePublicPlaylists(items);
          }
        });

        const artistsTask = getFeaturedArtists().then(applyArtists);

        const [, quickPicksResult] = await Promise.allSettled([
          officialTask, quickPicksTask, playlistsTask, artistsTask,
        ]);
        const pool = quickPicksResult.status === "fulfilled" ? quickPicksResult.value : null;
        if (pool?.all.length) {
          applyQuickPicksPool(pool);
          applySongs(pool.all);
        }

        if (session.categories.length > 0 && mountedRef.current) {
          session.hydrated = true;
          await setCachedHomeFeedSnapshot({
            categories: session.categories,
            publicPlaylists: session.publicPlaylists,
            featuredArtists: session.featuredArtists,
            quickPickSongs: session.quickPickSongs,
            quickPicksPool: session.quickPicksPool,
          });
        }
        if (mountedRef.current) setLoading(false);
      })();

      activeLoadRef.current = task;
      try {
        await task;
      } finally {
        if (activeLoadRef.current === task) activeLoadRef.current = null;
      }
    },
    [applyArtists, applyCategories, applyPlaylists, applyQuickPicksPool, applySongs, loadRecentlyPlayed]
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
    void loadHomeFeed(false);
  }, [isChecking, loadHomeFeed]);

  useFocusEffect(
    useCallback(() => {
      void loadRecentlyPlayed();
      const maybeRefresh = () => {
        const now = Date.now();
        if (
          isOnline &&
          !isChecking &&
          initialLoadRef.current &&
          now - session.updatedAt >= HOME_REFRESH_MS &&
          now - session.attemptedAt >= RETRY_MS
        ) {
          void loadHomeFeed(false);
        }
      };
      maybeRefresh();
      const appState = AppState.addEventListener("change", (state) => {
        if (state === "active") maybeRefresh();
      });
      return () => {
        appState.remove();
      };
    }, [isChecking, isOnline, loadHomeFeed, loadRecentlyPlayed])
  );

  useOnReconnect(
    useCallback(() => {
      void loadHomeFeed(false);
    }, [loadHomeFeed])
  );

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(HOME_CACHE_INVALIDATED_EVENT, () => {
      session.updatedAt = 0;
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
      ]);
      await loadHomeFeed(true);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [loadHomeFeed]);

  const hasContent =
    categories.length > 0 ||
    quickPickSongs.length > 0 ||
    publicPlaylists.length > 0 ||
    recentlyPlayed.length > 0;

  return {
    categories,
    publicPlaylists,
    featuredArtists,
    quickPickSongs,
    quickPicksPool,
    recentlyPlayed,
    loading,
    loadingMainContent: loading,
    refreshing,
    hasContent,
    handleRefresh,
  };
}
