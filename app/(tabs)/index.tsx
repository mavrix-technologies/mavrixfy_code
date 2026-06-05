import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  StyleSheet,
  Platform,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getBestImageUrl, JioSaavnImage, Song } from "@/lib/musicData";
import { getRecentlyPlayed, RecentlyPlayedItem } from "@/lib/storage";
import { getPublicPlaylists, FirestorePlaylist } from "@/lib/firestore";
import { getCachedHomePublicPlaylists, setCachedHomePublicPlaylists } from "@/lib/homeCache";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerRow } from "@/contexts/PlayerContext";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { triggerImpact } from "@/lib/haptics";
import {
  clearJioSaavnPlaylistCache,
  getHomeJioSaavnCategories,
  HomeJioSaavnCategoryData,
  prefetchVisiblePlaylists,
} from "@/lib/jioSaavnService";
import {
  getRecommendationHomeFeed,
  recommendationFeedEnabled,
  RecommendationFeed,
  RecommendationItem,
  RecommendationSection,
} from "@/lib/recommendationService";
import { getFeaturedArtists, ArtistCard, prefetchArtist } from "@/lib/artistService";
import HomeSkeletonLoader from "@/components/HomeSkeletonLoader";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import ShinyText from "@/components/ShinyText";
import { useNetwork } from "@/contexts/NetworkContext";
import { filterMap, forEachFiltered, mapFilter } from "@/lib/arrayUtils";

const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");

type HomeSection =
  | { id: "recents"; type: "recents" }
  | { id: "public-playlists"; type: "public-playlists" }
  | { id: "featured-artists"; type: "featured-artists" }
  | { id: string; type: "recommendation"; data: RecommendationSection }
  | { id: string; type: "category"; data: HomeJioSaavnCategoryData };

type HomeSessionCache = {
  hydrated: boolean;
  categories: HomeJioSaavnCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  recentlyPlayed: RecentlyPlayedItem[];
  featuredArtists: ArtistCard[];
};

type HomeFeedState = "ready" | "empty" | "network";

const HOME_SESSION_CACHE: HomeSessionCache = {
  hydrated: false,
  categories: [],
  publicPlaylists: [],
  recentlyPlayed: [],
  featuredArtists: [],
};

const HOME_JIOSAAVN_SECTION_ORDER = [
  "trending",
  "new-arrivals",
  "most-viral",
  "party-mix",
  "chill-vibes",
  "romance",
  "workout",
  "retro",
] as const;

const HOME_JIOSAAVN_TITLES: Record<string, string> = {
  trending:       "Trending Now",
  "new-arrivals": "New Releases",
  "most-viral":   "Viral Hits",
  "party-mix":    "Party Mix",
  "chill-vibes":  "Chill Vibes",
  romance:        "Love & Romance",
  workout:        "Workout & Energy",
  retro:          "Retro Classics",
};

const BRAND = {
  blue: "#26E19A",
  teal: "#26E19A",
  green: "#00B87B",
  ink900: "#10141A",
  ink800: "#181C22",
  ink700: "#262A31",
  panelStrong: "#262A31",
  panelSoft: "#1C2026",
  chipSurface: "#262A31",
  textPrimary: "#DFE2EB",
  textSecondary: "rgba(223,226,235,0.9)",
  textMuted: "rgba(188,203,185,0.76)",
};

const MIN_PUBLIC_PLAYLIST_ITEMS = 1;
const PUBLIC_PLAYLIST_FETCH_TIMEOUT_MS = 4500;
const HOME_CATEGORY_FETCH_TIMEOUT_MS = 12000;
const HOME_BOOTSTRAP_MAX_WAIT_MS = 15000;
const MAX_ROW_ITEMS = 10;
const HOME_PRIORITY_CATEGORY_IDS = ["trending", "new-arrivals", "most-viral"] as const;
const HOME_PRIORITY_CATEGORY_TIMEOUT_MS = 5500;
const PLACEHOLDER_ROW_ITEMS = [0, 1, 2, 3];
const HORIZONTAL_ROW_GAP = 12;
const RECENT_CARD_SIZE = 90;
const RECT_CARD_WIDTH = 152;
const ARTIST_CARD_WIDTH = 120;

function hasHomeContent(source: {
  categories: HomeJioSaavnCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  recentlyPlayed: RecentlyPlayedItem[];
}): boolean {
  return (
    source.recentlyPlayed.length > 0 ||
    source.categories.length > 0 ||
    source.publicPlaylists.length > 0
  );
}

function hasVisibleHomeSections(source: HomeSessionCache): boolean {
  return hasHomeContent(source) || source.featuredArtists.length > 0;
}

function getThumbImageUrl(images: JioSaavnImage[] | undefined): string {
  if (!Array.isArray(images) || images.length === 0) return "";
  return getBestImageUrl(images);
}

function normalizeId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function dedupeJioPlaylistsById(
  items: HomeJioSaavnCategoryData["results"],
  limit: number
): HomeJioSaavnCategoryData["results"] {
  const seen = new Set<string>();
  const unique: HomeJioSaavnCategoryData["results"] = [];

  for (const item of items) {
    const id = normalizeId(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

function dedupeFirestorePlaylistsById(items: FirestorePlaylist[], limit: number): FirestorePlaylist[] {
  const seen = new Set<string>();
  const unique: FirestorePlaylist[] = [];

  for (const item of items) {
    const id = normalizeId(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

function canonicalPlaylistKey(item: Pick<RecommendationItem, "contentId" | "title" | "source">): string {
  const title = String(item.title || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return title ? `playlist:${title}` : `playlist:${item.source}:${item.contentId}`;
}

function dedupeRecommendationFeed(feed: RecommendationFeed | null): RecommendationFeed | null {
  if (!feed) return null;
  const shown = new Set<string>();
  const sections = feed.sections.flatMap((section) => {
    const items = section.items.filter((item) => {
      if (item.kind !== "playlist") return false;
      const key = canonicalPlaylistKey(item);
      if (shown.has(key)) return false;
      shown.add(key);
      return true;
    });

    return items.length > 0 ? [{ ...section, items }] : [];
  });

  return { ...feed, sections, sectionOrder: sections.map((section) => section.id) };
}

function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export default function HomeScreen() {
  return (
    <ErrorBoundary>
      <HomeScreenInner />
    </ErrorBoundary>
  );
}

function HomeScreenInner() {
  return useHomeScreenInnerView();
}

function useHomeScreenInnerView() {
  useScreenTracking("Home");

  const { isOnline, isChecking } = useNetwork();
  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { playSong, currentSongId } = usePlayerRow();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedItem[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.recentlyPlayed : []
  );
  const [categories, setCategories] = useState<HomeJioSaavnCategoryData[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.categories : []
  );
  const [publicPlaylists, setPublicPlaylists] = useState<FirestorePlaylist[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.publicPlaylists : []
  );
  const [featuredArtists, setFeaturedArtists] = useState<ArtistCard[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.featuredArtists : []
  );
  const [loading, setLoading] = useState(!HOME_SESSION_CACHE.hydrated);
  const [homeFeedState, setHomeFeedState] = useState<HomeFeedState>(
    hasHomeContent(HOME_SESSION_CACHE) ? "ready" : "empty"
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(
    !HOME_SESSION_CACHE.hydrated && HOME_SESSION_CACHE.categories.length === 0
  );
  const [isLoadingPublicPlaylists, setIsLoadingPublicPlaylists] = useState(
    !HOME_SESSION_CACHE.hydrated && HOME_SESSION_CACHE.publicPlaylists.length === 0
  );
  const [recommendationFeed, setRecommendationFeed] = useState<RecommendationFeed | null>(null);
  const [isRecommendationFeedLoading, setIsRecommendationFeedLoading] = useState(false);
  const [hasRecommendationFeedFailed, setHasRecommendationFeedFailed] = useState(false);
  const latestLoadIdRef = useRef(0);
  const latestRecommendationLoadIdRef = useRef(0);
  const hasHydratedRef = useRef(HOME_SESSION_CACHE.hydrated);
  const prefetchStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPlaylistPrefetchRef = useRef<(() => void) | null>(null);

  const INITIAL_CATEGORY_LIMIT = 10;
  const REFRESH_CATEGORY_LIMIT = 12;
  const INITIAL_PUBLIC_LIMIT = 100; // Increased to show all playlists
  const shouldUseRecommendationFeed = isAuthenticated && recommendationFeedEnabled();

  const loadRecommendationFeed = useCallback(async () => {
    const recommendationLoadId = ++latestRecommendationLoadIdRef.current;

    if (!shouldUseRecommendationFeed) {
      setRecommendationFeed(null);
      setHasRecommendationFeedFailed(false);
      setIsRecommendationFeedLoading(false);
      return;
    }

    setIsRecommendationFeedLoading(true);
    setHasRecommendationFeedFailed(false);
    try {
      const feed = await getRecommendationHomeFeed();
      if (recommendationLoadId !== latestRecommendationLoadIdRef.current) return;
      setRecommendationFeed(dedupeRecommendationFeed(feed));
    } catch {
      if (recommendationLoadId !== latestRecommendationLoadIdRef.current) return;
      setRecommendationFeed(null);
      setHasRecommendationFeedFailed(true);
    } finally {
      if (recommendationLoadId === latestRecommendationLoadIdRef.current) {
        setIsRecommendationFeedLoading(false);
      }
    }
  }, [shouldUseRecommendationFeed]);

  useEffect(() => {
    void loadRecommendationFeed();
  }, [loadRecommendationFeed]);

  const schedulePlaylistPrefetch = useCallback((categoryData: HomeJioSaavnCategoryData[], delayMs: number) => {
    if (prefetchStartTimerRef.current) {
      clearTimeout(prefetchStartTimerRef.current);
      prefetchStartTimerRef.current = null;
    }
    cancelPlaylistPrefetchRef.current?.();
    cancelPlaylistPrefetchRef.current = null;

    prefetchStartTimerRef.current = setTimeout(() => {
      prefetchStartTimerRef.current = null;
      cancelPlaylistPrefetchRef.current = prefetchVisiblePlaylists(categoryData, 3);
    }, delayMs);
  }, []);

  const loadHomeData = useCallback(
    async (options?: {
      forceRefresh?: boolean;
      showLoader?: boolean;
      refreshPublicPlaylists?: boolean;
      realtimeRefresh?: boolean;
      limitPerCategory?: number;
      publicLimit?: number;
    }) => {
      const forceRefresh = options?.forceRefresh ?? false;
      const showLoader = options?.showLoader ?? true;
      const refreshPublicPlaylists = options?.refreshPublicPlaylists ?? true;
      const realtimeRefresh = options?.realtimeRefresh ?? false;
      const limitPerCategory = options?.limitPerCategory ?? INITIAL_CATEGORY_LIMIT;
      const publicLimit = options?.publicLimit ?? INITIAL_PUBLIC_LIMIT;

      const loadId = ++latestLoadIdRef.current;
      const shouldShowLoader = showLoader && !hasHydratedRef.current;

      if (shouldShowLoader) {
        setLoading(true);
      }
      if (HOME_SESSION_CACHE.categories.length === 0) {
        setIsLoadingCategories(true);
      }
      if (refreshPublicPlaylists && HOME_SESSION_CACHE.publicPlaylists.length === 0) {
        setIsLoadingPublicPlaylists(true);
      }

      try {
        const markReadyIfContentVisible = () => {
          if (loadId !== latestLoadIdRef.current) return;
          if (hasVisibleHomeSections(HOME_SESSION_CACHE)) {
            hasHydratedRef.current = true;
            HOME_SESSION_CACHE.hydrated = true;
            setHomeFeedState("ready");
            setLoading(false);
          }
        };

        const publicPlaylistsPromise = refreshPublicPlaylists
          ? withPromiseTimeout(
              getPublicPlaylists(publicLimit),
              PUBLIC_PLAYLIST_FETCH_TIMEOUT_MS,
              "Home public playlists timeout"
            )
          : Promise.resolve<FirestorePlaylist[]>(HOME_SESSION_CACHE.publicPlaylists.slice(0, publicLimit));

        // Load artists in parallel — no separate timeout, it's fast from cache
        const artistsPromise = getFeaturedArtists().catch(() => [] as ArtistCard[]);

        const publicPlaylistsResultPromise = publicPlaylistsPromise
          .then((nextPublicPlaylists) => {
            if (loadId !== latestLoadIdRef.current) {
              return { status: "fulfilled" as const, value: nextPublicPlaylists };
            }

            if (refreshPublicPlaylists) {
              const hasPreviousPublicPlaylists = HOME_SESSION_CACHE.publicPlaylists.length > 0;
              const shouldReplacePublicPlaylists =
                nextPublicPlaylists.length > 0 || !hasPreviousPublicPlaylists;

              if (shouldReplacePublicPlaylists) {
                setPublicPlaylists(nextPublicPlaylists);
                HOME_SESSION_CACHE.publicPlaylists = nextPublicPlaylists;
              }

              if (nextPublicPlaylists.length > 0) {
                void setCachedHomePublicPlaylists(nextPublicPlaylists);
              }
            }

            if (nextPublicPlaylists.length > 0) {
              markReadyIfContentVisible();
            }

            return { status: "fulfilled" as const, value: nextPublicPlaylists };
          })
          .catch((reason) => ({ status: "rejected" as const, reason }));

        const applyCategorySnapshot = (categoryData: HomeJioSaavnCategoryData[]) => {
          const validCategories = categoryData.filter((cat) => cat.results.length > 0);
          const hasPreviousCategories = HOME_SESSION_CACHE.categories.length > 0;
          const shouldReplaceCategories = validCategories.length > 0 || !hasPreviousCategories;

          if (shouldReplaceCategories) {
            setCategories(validCategories);
            HOME_SESSION_CACHE.categories = validCategories;
            if (validCategories.length > 0) {
              schedulePlaylistPrefetch(validCategories, 1200);
            }
          }

          if (validCategories.length > 0) {
            markReadyIfContentVisible();
          }
        };

        const categoryResultPromise = (async () => {
          let partialCategories: HomeJioSaavnCategoryData[] = [];
          let hasPartialCategories = false;

          try {
            const priorityCategoryData = await withPromiseTimeout(
              getHomeJioSaavnCategories({
                forceRefresh,
                limitPerCategory: Math.min(limitPerCategory, 8),
                realtime: realtimeRefresh,
                categoryIds: [...HOME_PRIORITY_CATEGORY_IDS],
              }),
              HOME_PRIORITY_CATEGORY_TIMEOUT_MS,
              "Home priority categories timeout"
            );

            if (loadId === latestLoadIdRef.current) {
              applyCategorySnapshot(priorityCategoryData);
            }

            partialCategories = priorityCategoryData;
            hasPartialCategories = priorityCategoryData.some((cat) => cat.results.length > 0);
          } catch {
            // Continue to full fetch fallback below.
          }

          try {
            const fullCategoryData = await withPromiseTimeout(
              getHomeJioSaavnCategories({
                forceRefresh,
                limitPerCategory,
                realtime: realtimeRefresh,
              }),
              HOME_CATEGORY_FETCH_TIMEOUT_MS,
              "Home categories timeout"
            );

            if (loadId === latestLoadIdRef.current) {
              applyCategorySnapshot(fullCategoryData);
            }

            return { status: "fulfilled" as const, value: fullCategoryData };
          } catch (reason) {
            if (hasPartialCategories) {
              return { status: "fulfilled" as const, value: partialCategories };
            }

            return { status: "rejected" as const, reason };
          }
        })();

        const artistsResultPromise = artistsPromise
          .then((artists) => {
            if (loadId !== latestLoadIdRef.current) {
              return { status: "fulfilled" as const, value: artists };
            }

            if (artists.length > 0) {
              setFeaturedArtists(artists);
              HOME_SESSION_CACHE.featuredArtists = artists;
              artists.slice(0, 4).forEach((a) => prefetchArtist(a.id));
              markReadyIfContentVisible();
            }

            return { status: "fulfilled" as const, value: artists };
          })
          .catch((reason) => ({ status: "rejected" as const, reason }));

        const [publicPlaylistsResult, categoryResult] = await Promise.all([
          publicPlaylistsResultPromise,
          categoryResultPromise,
        ]);

        if (loadId === latestLoadIdRef.current) {
          await artistsResultPromise;

          if (hasVisibleHomeSections(HOME_SESSION_CACHE)) {
            hasHydratedRef.current = true;
            HOME_SESSION_CACHE.hydrated = true;
          }

          const nextFeedState = hasHomeContent(HOME_SESSION_CACHE)
            ? "ready"
            : publicPlaylistsResult.status === "rejected" || categoryResult.status === "rejected"
              ? "network"
              : "empty";
          setHomeFeedState(nextFeedState);

          // Mark bootstrapped even on empty/offline response to avoid repeated heavy reloads.
          if (!HOME_SESSION_CACHE.hydrated) {
            HOME_SESSION_CACHE.hydrated = true;
            hasHydratedRef.current = true;
          }
        }
      } finally {
        // Always clear loading — whether we set it or it was already true from bootstrap
        if (loadId === latestLoadIdRef.current) {
          setLoading(false);
          setIsLoadingCategories(false);
          if (refreshPublicPlaylists) {
            setIsLoadingPublicPlaylists(false);
          }
        }
      }
    },
    [schedulePlaylistPrefetch]
  );

  const resetHomeState = useCallback((options?: { clearUi?: boolean }) => {
    const clearUi = options?.clearUi ?? false;
    latestLoadIdRef.current += 1;
    hasHydratedRef.current = false;
    HOME_SESSION_CACHE.hydrated = false;
    HOME_SESSION_CACHE.categories = [];
    HOME_SESSION_CACHE.publicPlaylists = [];
    HOME_SESSION_CACHE.recentlyPlayed = [];

    if (clearUi) {
      setCategories([]);
      setPublicPlaylists([]);
      setRecentlyPlayed([]);
      setLoading(true);
      setIsLoadingCategories(true);
      setIsLoadingPublicPlaylists(true);
    }

    setHomeFeedState("empty");
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      resetHomeState();
      await clearJioSaavnPlaylistCache();
      const recommendationPromise = shouldUseRecommendationFeed ? loadRecommendationFeed() : Promise.resolve();
      if (shouldUseRecommendationFeed) {
        setHasRecommendationFeedFailed(false);
      }
      try {
        const recent = await getRecentlyPlayed();
        const trimmedRecent = recent.slice(0, 8);
        setRecentlyPlayed(trimmedRecent);
        HOME_SESSION_CACHE.recentlyPlayed = trimmedRecent;
      } catch {
        setRecentlyPlayed([]);
        HOME_SESSION_CACHE.recentlyPlayed = [];
      }
      await loadHomeData({
        forceRefresh: true,
        showLoader: false,
        refreshPublicPlaylists: true,
        realtimeRefresh: false,
        limitPerCategory: REFRESH_CATEGORY_LIMIT,
        publicLimit: INITIAL_PUBLIC_LIMIT,
      });
      await recommendationPromise;
    } finally {
      setRefreshing(false);
    }
  }, [INITIAL_PUBLIC_LIMIT, REFRESH_CATEGORY_LIMIT, loadHomeData, loadRecommendationFeed, resetHomeState, shouldUseRecommendationFeed]);

  const applyHomeCacheSnapshot = useCallback(() => {
    setRecentlyPlayed(HOME_SESSION_CACHE.recentlyPlayed);
    setCategories(HOME_SESSION_CACHE.categories);
    setPublicPlaylists(HOME_SESSION_CACHE.publicPlaylists);
    setFeaturedArtists(HOME_SESSION_CACHE.featuredArtists);
    setIsLoadingCategories(HOME_SESSION_CACHE.categories.length === 0);
    setIsLoadingPublicPlaylists(HOME_SESSION_CACHE.publicPlaylists.length === 0);
    setHomeFeedState(hasHomeContent(HOME_SESSION_CACHE) ? "ready" : "empty");
    const hasVisibleFeed =
      hasHomeContent(HOME_SESSION_CACHE) || HOME_SESSION_CACHE.featuredArtists.length > 0;
    setLoading(!hasVisibleFeed);
    if (HOME_SESSION_CACHE.categories.length > 0) {
      schedulePlaylistPrefetch(HOME_SESSION_CACHE.categories, 800);
    }
    return HOME_SESSION_CACHE.categories.length > 0 &&
      HOME_SESSION_CACHE.featuredArtists.length > 0;
  }, [schedulePlaylistPrefetch]);

  const applyWarmBootstrapResults = useCallback((
    recentResult: PromiseSettledResult<RecentlyPlayedItem[]>,
    cachedPublicResult: PromiseSettledResult<FirestorePlaylist[]>
  ) => {
    let hasWarmContent = false;
    if (recentResult.status === "fulfilled") {
      const trimmedRecent = recentResult.value.slice(0, 8);
      setRecentlyPlayed(trimmedRecent);
      HOME_SESSION_CACHE.recentlyPlayed = trimmedRecent;
      hasWarmContent = hasWarmContent || trimmedRecent.length > 0;
    } else {
      setRecentlyPlayed([]);
      HOME_SESSION_CACHE.recentlyPlayed = [];
    }

    if (cachedPublicResult.status === "fulfilled") {
      const cachedPublic = cachedPublicResult.value.slice(0, INITIAL_PUBLIC_LIMIT);
      if (cachedPublic.length > 0) {
        setPublicPlaylists(cachedPublic);
        HOME_SESSION_CACHE.publicPlaylists = cachedPublic;
        setIsLoadingPublicPlaylists(false);
        hasWarmContent = true;
      }
    }
    return hasWarmContent;
  }, [INITIAL_PUBLIC_LIMIT]);

  const revealWarmHomeContent = useCallback(() => {
    hasHydratedRef.current = true;
    HOME_SESSION_CACHE.hydrated = true;
    setLoading(false);
    setHomeFeedState("ready");
  }, []);

  const applyHomeBootstrapFailure = useCallback((hasWarmContent: boolean) => {
    setLoading(false);
    setHomeFeedState(hasWarmContent ? "ready" : "network");
    hasHydratedRef.current = true;
    HOME_SESSION_CACHE.hydrated = true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (HOME_SESSION_CACHE.hydrated) {
        const hasFullFeed = applyHomeCacheSnapshot();
        if (hasFullFeed) return;
        // Fall through to load missing data
      }

      const [recentResult, cachedPublicResult] = await Promise.allSettled([
        getRecentlyPlayed(),
        getCachedHomePublicPlaylists({ allowStale: true }),
      ]);

      let hasWarmContent = false;

      if (!cancelled) {
        hasWarmContent = applyWarmBootstrapResults(recentResult, cachedPublicResult);

        if (hasWarmContent) {
          // Show warm content immediately while live categories refresh in background.
          revealWarmHomeContent();
        }
      }

      if (cancelled) return;

      try {
        await withPromiseTimeout(
          loadHomeData({
            forceRefresh: false,
            showLoader: !hasWarmContent,
            refreshPublicPlaylists: true,
            realtimeRefresh: false,
            limitPerCategory: INITIAL_CATEGORY_LIMIT,
            publicLimit: INITIAL_PUBLIC_LIMIT,
          }),
          HOME_BOOTSTRAP_MAX_WAIT_MS,
          "Home bootstrap timeout"
        );
      } catch {
        if (!cancelled) {
          applyHomeBootstrapFailure(hasWarmContent);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      latestLoadIdRef.current += 1;
    };
  }, [
    applyHomeBootstrapFailure,
    applyHomeCacheSnapshot,
    applyWarmBootstrapResults,
    loadHomeData,
    revealWarmHomeContent,
  ]);

  useEffect(() => {
    return () => {
      if (prefetchStartTimerRef.current) {
        clearTimeout(prefetchStartTimerRef.current);
        prefetchStartTimerRef.current = null;
      }
      cancelPlaylistPrefetchRef.current?.();
      cancelPlaylistPrefetchRef.current = null;
    };
  }, []);

  const orderedHomeCategories = useMemo<HomeJioSaavnCategoryData[]>(() => {
    const categoryById = new Map<string, HomeJioSaavnCategoryData>();
    categories.forEach((cat) => categoryById.set(cat.id, cat));

    // Preferred order first, then any extras the service returned
    const preferred = mapFilter(HOME_JIOSAAVN_SECTION_ORDER, (id) => {
        const cat = categoryById.get(id);
        if (!cat || cat.results.length === 0) return null;
        return { ...cat, title: HOME_JIOSAAVN_TITLES[id] ?? cat.title };
      }, (cat): cat is HomeJioSaavnCategoryData => Boolean(cat));

    const preferredIds = new Set(preferred.map((c) => c.id));
    const extras = filterMap(categories, (c) => !preferredIds.has(c.id) && c.results.length > 0, (c) => ({ ...c, title: HOME_JIOSAAVN_TITLES[c.id] ?? c.title }));

    return [...preferred, ...extras];
  }, [categories]);

  const allCategoryRows = useMemo(() => {
    return mapFilter(orderedHomeCategories, (cat) => ({
        ...cat,
        results: dedupeJioPlaylistsById(cat.results, MAX_ROW_ITEMS),
      }), (cat) => cat.results.length > 0);
  }, [orderedHomeCategories]);

  const publicPlaylistsForSection = useMemo(
    () => dedupeFirestorePlaylistsById(publicPlaylists, publicPlaylists.length),
    [publicPlaylists]
  );

  const recommendationSections = useMemo(
    () => recommendationFeed?.sections.filter((section) => section.items.length > 0) ?? [],
    [recommendationFeed]
  );

  const sections = useMemo<HomeSection[]>(() => {
    const data: HomeSection[] = [];

    if (shouldUseRecommendationFeed && recommendationSections.length > 0) {
      if (featuredArtists.length > 0) {
        data.push({ id: "featured-artists", type: "featured-artists" });
      }
      if (recentlyPlayed.length > 0) {
        data.push({ id: "recents", type: "recents" });
      }
      recommendationSections.forEach((section) => {
        data.push({ id: `recommendation-${section.id}`, type: "recommendation", data: section });
      });
      return data;
    }

    const hasFallbackContent =
      featuredArtists.length > 0 ||
      recentlyPlayed.length > 0 ||
      allCategoryRows.length > 0 ||
      publicPlaylistsForSection.length >= MIN_PUBLIC_PLAYLIST_ITEMS;

    if (shouldUseRecommendationFeed && isRecommendationFeedLoading && !hasRecommendationFeedFailed && !hasFallbackContent) {
      return data;
    }

    // 1. Featured Artists — very top
    if (featuredArtists.length > 0) {
      data.push({ id: "featured-artists", type: "featured-artists" });
    }

    // 2. Jump Back In (recents)
    if (recentlyPlayed.length > 0) {
      data.push({ id: "recents", type: "recents" });
    }

    // 3. Stable category slots: priority rows are always reserved while loading.
    const rowById = new Map(allCategoryRows.map((cat) => [cat.id, cat]));

    HOME_PRIORITY_CATEGORY_IDS.forEach((priorityId) => {
      const existing = rowById.get(priorityId);
      if (existing) {
        data.push({ id: `category-${existing.id}`, type: "category", data: existing });
        return;
      }
      if (isLoadingCategories) {
        data.push({
          id: `category-loading-${priorityId}`,
          type: "category",
          data: {
            id: priorityId,
            title: HOME_JIOSAAVN_TITLES[priorityId] ?? priorityId,
            results: [],
          },
        });
      }
    });

    forEachFiltered(allCategoryRows, (cat) => !HOME_PRIORITY_CATEGORY_IDS.includes(cat.id as (typeof HOME_PRIORITY_CATEGORY_IDS)[number]), (cat) => data.push({ id: `category-${cat.id}`, type: "category", data: cat }));

    // 4. Made for You — bottom
    if (publicPlaylistsForSection.length >= MIN_PUBLIC_PLAYLIST_ITEMS || isLoadingPublicPlaylists) {
      data.push({ id: "public-playlists", type: "public-playlists" });
    }

    return data;
  }, [
    recentlyPlayed,
    publicPlaylistsForSection,
    featuredArtists,
    allCategoryRows,
    isLoadingCategories,
    isLoadingPublicPlaylists,
    recommendationSections,
    shouldUseRecommendationFeed,
    isRecommendationFeedLoading,
    hasRecommendationFeedFailed,
  ]);

  const openJioSaavnPlaylist = useCallback(
    (playlist: { id: string; name?: string; imageUrl?: string; songCount?: number }) => {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: playlist.id,
          jiosaavn: "true",
          firestore: "false",
          title: playlist.name || "",
          cover: playlist.imageUrl || "",
          songCount: playlist.songCount ? String(playlist.songCount) : "",
        },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [routerPush]
  );

  const openFirestorePlaylist = useCallback(
    (playlist: { id: string; name?: string; imageUrl?: string; description?: string; songCount?: number }) => {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: playlist.id,
          firestore: "true",
          jiosaavn: "false",
          title: playlist.name || "",
          description: playlist.description || "",
          cover: playlist.imageUrl || "",
          songCount: playlist.songCount ? String(playlist.songCount) : "",
        },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [routerPush]
  );

  const openRecommendationPlaylist = useCallback(
    (item: RecommendationItem) => {
      const isJioSaavn =
        item.source === "jiosaavn" ||
        item.source === "trending" ||
        item.source === "fresh" ||
        item.source === "regional" ||
        item.playlist?.type === "jiosaavn-playlist";

      if (isJioSaavn) {
        openJioSaavnPlaylist({
          id: item.contentId,
          name: item.title,
          imageUrl: item.imageUrl,
          songCount: Number(item.playlist?.songCount || 0),
        });
        return;
      }

      openFirestorePlaylist({
        id: item.contentId,
        name: item.title,
        imageUrl: item.imageUrl,
        description: item.subtitle,
        songCount: Number(item.playlist?.songCount || 0),
      });
    },
    [openFirestorePlaylist, openJioSaavnPlaylist]
  );

  const handleRecentPress = useCallback(
    (item: RecentlyPlayedItem) => {
      const itemId = item?.id?.trim();
      if (!itemId) {
        return;
      }

      if (item.type === "song") {
        const sourceSong = item.data as Partial<Song> | undefined;
        if (sourceSong && typeof sourceSong.id === "string") {
          const legacySource = sourceSong as Partial<Song> & {
            url?: string;
            uri?: string;
            streamUrl?: string;
            downloadUrl?: string | { url?: string; link?: string };
          };
          const downloadUrlCandidate =
            typeof legacySource.downloadUrl === "string"
              ? legacySource.downloadUrl
              : legacySource.downloadUrl?.url || legacySource.downloadUrl?.link || "";
          const resolvedAudioUrl = [
            sourceSong.audioUrl,
            legacySource.url,
            legacySource.uri,
            legacySource.streamUrl,
            downloadUrlCandidate,
          ].find((candidate) => typeof candidate === "string" && candidate.trim().length > 0)?.trim() || "";

          const hydratedSong: Song = {
            id: sourceSong.id,
            title: sourceSong.title || item.name || "Unknown Song",
            artist: sourceSong.artist || "Unknown Artist",
            album: sourceSong.album || "",
            duration: Number(sourceSong.duration) || 0,
            coverUrl: sourceSong.coverUrl || item.imageUrl || "",
            genre: sourceSong.genre || "",
            audioUrl: resolvedAudioUrl,
            year: sourceSong.year,
            language: sourceSong.language,
            hasLyrics: sourceSong.hasLyrics,
            source: sourceSong.source,
          };
          if (hydratedSong.audioUrl.trim().length > 0) {
            playSong(hydratedSong, [hydratedSong]);
            routerPush("/player");
            return;
          }
        }
        if (currentSongId) {
          routerPush("/player");
        }
        return;
      }

      if (item.type === "jiosaavn-playlist") {
        openJioSaavnPlaylist({
          id: itemId,
          name: item.name,
          imageUrl: item.imageUrl,
        });
        return;
      }

      const maybePlaylistData =
        item.data && typeof item.data === "object" ? (item.data as Record<string, unknown>) : null;
      if (maybePlaylistData && "createdBy" in maybePlaylistData) {
        openFirestorePlaylist({
          id: itemId,
          name: item.name,
          imageUrl: item.imageUrl,
          description:
            typeof maybePlaylistData.description === "string" ? maybePlaylistData.description : "",
          songCount: Array.isArray(maybePlaylistData.songs) ? maybePlaylistData.songs.length : 0,
        });
        return;
      }

      if (itemId.startsWith("user_")) {
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: itemId,
            jiosaavn: "false",
            firestore: "false",
            title: item.name,
            cover: item.imageUrl,
          },
        }, {
          withAnchor: true,
          dangerouslySingular: () => "playlist-details",
        });
        return;
      }

      // Legacy fallback: non-local playlist recents are usually JioSaavn ids.
      openJioSaavnPlaylist({
        id: itemId,
        name: item.name,
        imageUrl: item.imageUrl,
      });
    },
    [currentSongId, openFirestorePlaylist, openJioSaavnPlaylist, playSong, routerPush]
  );

  const renderRecentCard = useCallback(
    ({ item }: { item: RecentlyPlayedItem }) => (
      <Pressable
        style={({ pressed }) => [styles.recentCard, pressed && styles.cardPressed]}
        onPress={() => handleRecentPress(item)}
      >
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.recentImage}
          contentFit="cover"
          transition={80}
          cachePolicy="memory-disk"
          recyclingKey={`recent-${item.id}`}
        />
        <LinearGradient
          colors={["transparent", "rgba(38,42,49,0.36)", "rgba(16,20,26,0.9)"]}
          locations={[0, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.recentLabelWrap}>
          <Text style={styles.recentLabel} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      </Pressable>
    ),
    [handleRecentPress]
  );

  const renderPublicPlaylist = useCallback(
    ({ item }: { item: FirestorePlaylist }) => (
      <Pressable
        style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
        onPress={() =>
          openFirestorePlaylist({
            id: item.id,
            name: item.name,
            imageUrl: item.imageUrl,
            description: item.description,
            songCount: item.songs?.length || 0,
          })
        }
      >
        <View style={styles.rectCardImageWrap}>
          <Image
            source={{ uri: item.imageUrl || undefined }}
            style={[styles.rectCardImage, { borderColor: Colors.cardBorder }]}
            contentFit="contain"
            transition={80}
            cachePolicy="memory-disk"
            recyclingKey={`public-${item.id}`}
          />
          <View pointerEvents="none" style={styles.brandCoverBadge}>
            <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
          </View>
        </View>
        <Text style={styles.rectCardTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.rectCardMeta} numberOfLines={1}>
          {item.createdBy?.name || item.createdBy?.fullName || "Community"}
        </Text>
      </Pressable>
    ),
    [openFirestorePlaylist]
  );

  const renderArtistCard = useCallback(
    ({ item }: { item: ArtistCard }) => {
      const img = item.image?.length ? getBestImageUrl(item.image) : "";
      return (
        <Pressable
          style={({ pressed }) => [styles.artistCard, pressed && styles.cardPressed]}
          onPress={() =>
            routerPush(
              { pathname: "/artist/[id]", params: { id: item.id, name: item.name, image: img } },
              { withAnchor: true, dangerouslySingular: () => "artist-profile" }
            )
          }
        >
          <View style={styles.artistAvatarWrap}>
            <Image
              source={{ uri: img || undefined }}
              style={styles.artistAvatar}
              contentFit="cover"
              transition={80}
              cachePolicy="memory-disk"
              recyclingKey={`artist-${item.id}`}
            />
          </View>
          <Text style={styles.artistCardName} numberOfLines={2}>{item.name}</Text>
          {item.dominantLanguage ? (
            <Text style={styles.artistCardLang} numberOfLines={1}>
              {item.dominantLanguage}
            </Text>
          ) : null}
        </Pressable>
      );
    },
    [routerPush]
  );

  const getCategoryPlaylistElement = useCallback(
    (categoryId: string, categoryTitle: string) =>
      function CategoryPlaylistCard({ item }: { item: HomeJioSaavnCategoryData["results"][number] }) {
        return (
          <Pressable
            style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
            onPress={() =>
              openJioSaavnPlaylist({
                id: item.id,
                name: item.name,
                imageUrl: getThumbImageUrl(item.image),
                songCount: Number(item.songCount || 0),
              })
            }
          >
            <View style={styles.rectCardImageWrap}>
              <Image
                source={{ uri: getThumbImageUrl(item.image) }}
                style={[styles.rectCardImage, { borderColor: Colors.cardBorder }]}
                contentFit="contain"
                transition={80}
                cachePolicy="memory-disk"
                recyclingKey={`${categoryId}-${item.id}`}
              />
              <View pointerEvents="none" style={styles.brandCoverBadge}>
                <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
              </View>
            </View>
            <Text style={styles.rectCardTitle} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.rectCardMeta} numberOfLines={1}>
              {item.songCount > 0 ? `${item.songCount} songs` : categoryTitle}
            </Text>
          </Pressable>
        );
      },
    [openJioSaavnPlaylist]
  );

  const renderRecommendationPlaylist = useCallback(
    ({ item }: { item: RecommendationItem }) => (
      <Pressable
        style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
        onPress={() => openRecommendationPlaylist(item)}
      >
        <View style={styles.rectCardImageWrap}>
          <Image
            source={{ uri: item.imageUrl || undefined }}
            style={[styles.rectCardImage, { borderColor: Colors.cardBorder }]}
            contentFit="contain"
            transition={80}
            cachePolicy="memory-disk"
            recyclingKey={`recommendation-${item.id}`}
          />
          <View pointerEvents="none" style={styles.brandCoverBadge}>
            <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
          </View>
        </View>
        <Text style={styles.rectCardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rectCardMeta} numberOfLines={1}>
          {item.subtitle || "Playlist"}
        </Text>
      </Pressable>
    ),
    [openRecommendationPlaylist]
  );

  const renderRectPlaceholder = useCallback(
    ({ item }: { item: number }) => (
      <View style={styles.rectCard}>
        <View style={styles.rectCardImageWrap}>
          <View style={[styles.rectCardImage, styles.placeholderBlock]} />
        </View>
        <View style={[styles.placeholderLine, styles.placeholderLineTitle]} />
        <View style={[styles.placeholderLine, styles.placeholderLineMeta]} />
      </View>
    ),
    []
  );

  const getHeaderElement = useCallback(() => {
    return (
      <View style={styles.header}>
        <View style={styles.topMenuRow}>
          <Pressable
            style={styles.topProfileButton}
            onPress={() => {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
              routerPush("/profile");
            }}
          >
            {isAuthenticated && user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={16} color={Colors.black} />
              </View>
            )}
          </Pressable>

          <View pointerEvents="none" style={styles.headerBrandCenter}>
            <ShinyText
              text="MAVRIXFY"
              speed={2.4}
              delay={0.6}
              color="#DDE7E3"
              shineColor="#FFFFFF"
              spread={130}
              direction="left"
              style={styles.headerBrandTitle}
            />
          </View>

          <View style={{ flex: 1 }} />

          <Pressable
            style={styles.topDownloadButton}
            onPress={() => {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
              routerPush("/downloaded-songs");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-down-circle-outline" size={20} color={Colors.subtext} />
          </Pressable>
        </View>
      </View>
    );
  }, [isAuthenticated, routerPush, user?.picture]);

  const renderEmptyState = useCallback(() => {
    const isNetworkIssue = homeFeedState === "network";
    const title = isNetworkIssue ? "Fresh content is taking longer than expected" : "Start listening right away";
    const subtitle = isNetworkIssue
      ? "We could not refresh live recommendations right now. You can retry, import songs, or browse search instead."
      : "Your Home feed is still warming up. You can retry, import songs, or jump into search while live recommendations load.";

    return (
      <View style={styles.emptyStateWrap}>
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyStateIcon}>
            <Ionicons
              name={isNetworkIssue ? "cloud-offline-outline" : "musical-notes-outline"}
              size={22}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.emptyStateTitle}>{title}</Text>
          <Text style={styles.emptyStateText}>{subtitle}</Text>

          <View style={styles.emptyActionRow}>
            <Pressable
              style={[styles.emptyActionButton, styles.emptyActionPrimary]}
              onPress={() => {
                void handleRefresh();
              }}
            >
              <Ionicons name="refresh" size={16} color={Colors.black} />
              <Text style={styles.emptyActionPrimaryText}>Try Again</Text>
            </Pressable>

            <Pressable
              style={[styles.emptyActionButton, styles.emptyActionSecondary]}
              onPress={() => routerPush("/(tabs)/search")}
            >
              <Ionicons name="search" size={16} color={Colors.text} />
              <Text style={styles.emptyActionSecondaryText}>Search</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.emptyActionButton, styles.emptyActionTertiary]}
            onPress={() => routerPush("/import-songs")}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={Colors.text} />
            <Text style={styles.emptyActionSecondaryText}>Import Songs</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [handleRefresh, homeFeedState, routerPush]);

  const getSectionHeaderElement = useCallback((title: string, onViewAll?: () => void) => {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onViewAll ? (
          <Pressable onPress={onViewAll} hitSlop={8}>
            <Text style={styles.viewAllText}>View All</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }, []);

  const renderRowSeparator = useCallback(() => <View style={styles.rowSeparator} />, []);

  const getSectionElement = useCallback(
    ({ item: section }: { item: HomeSection }) => {
      switch (section.type) {
        case "recents":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("Jump Back In")}
              <FlatList
                horizontal
                data={recentlyPlayed}
                keyExtractor={(item) => `recent-${item.id}`}
                renderItem={renderRecentCard}
                ItemSeparatorComponent={renderRowSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={5}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "public-playlists":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("Made for You")}
              {publicPlaylistsForSection.length > 0 ? (
                <FlatList
                  horizontal
                  data={publicPlaylistsForSection}
                  keyExtractor={(item) => `public-${item.id}`}
                  renderItem={renderPublicPlaylist}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews={Platform.OS === "android"}
                />
              ) : (
                <FlatList
                  horizontal
                  data={PLACEHOLDER_ROW_ITEMS}
                  keyExtractor={(item) => `public-loading-${item}`}
                  renderItem={renderRectPlaceholder}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  scrollEnabled={false}
                />
              )}
            </View>
          );

        case "featured-artists":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("Featured Artists", () => routerPush("/artists", { withAnchor: true }))}
              <FlatList
                horizontal
                data={featuredArtists}
                keyExtractor={(item) => `artist-${item.id}`}
                renderItem={renderArtistCard}
                ItemSeparatorComponent={renderRowSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={5}
                maxToRenderPerBatch={5}
                windowSize={5}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "category":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement(section.data.title)}
              {section.data.results.length > 0 ? (
                <FlatList
                  horizontal
                  data={section.data.results}
                  keyExtractor={(item) => `${section.data.id}-${item.id}`}
                  renderItem={getCategoryPlaylistElement(section.data.id, section.data.title)}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews={Platform.OS === "android"}
                />
              ) : (
                <FlatList
                  horizontal
                  data={PLACEHOLDER_ROW_ITEMS}
                  keyExtractor={(item) => `${section.data.id}-loading-${item}`}
                  renderItem={renderRectPlaceholder}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  scrollEnabled={false}
                />
              )}
            </View>
          );

        case "recommendation":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement(section.data.title)}
              <FlatList
                horizontal
                data={section.data.items}
                keyExtractor={(item) => `recommendation-${section.data.id}-${item.id}`}
                renderItem={renderRecommendationPlaylist}
                ItemSeparatorComponent={renderRowSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={5}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        default:
          return null;
      }
    },
    [
      recentlyPlayed,
      renderRecentCard,
      publicPlaylistsForSection,
      renderPublicPlaylist,
      renderRectPlaceholder,
      featuredArtists,
      renderArtistCard,
      getCategoryPlaylistElement,
      renderRecommendationPlaylist,
      getSectionHeaderElement,
      renderRowSeparator,
      routerPush,
    ]
  );

  const shouldShowSkeleton = (loading || isRecommendationFeedLoading) && sections.length === 0;

  // Show full offline screen only when there's no cached content to display
  if (!isOnline && !isChecking && sections.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <OfflineScreen message="Connect to the internet to discover music." />
      </View>
    );
  }

  if (shouldShowSkeleton) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <HomeSkeletonLoader />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Slim banner when offline but cached content is available */}
      {!isOnline && <OfflineBanner />}
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={BRAND.teal}
            colors={[BRAND.teal]}
            progressBackgroundColor="rgba(255,255,255,0.12)"
          />
        }
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, sections.length === 0 && styles.scrollContentEmpty]}
        showsVerticalScrollIndicator={false}
      >
        {getHeaderElement()}
        {sections.length === 0
          ? renderEmptyState()
          : sections.map((section) => (
              <React.Fragment key={section.id}>{getSectionElement({ item: section })}</React.Fragment>
            ))}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16,20,26,0)", "rgba(16,20,26,0.52)", "rgba(16,20,26,0.84)", Colors.background]}
        locations={[0, 0.58, 0.86, 1]}
        style={styles.bottomVisibilityOverlay}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 156,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  bottomVisibilityOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 176,
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
  },
  topMenuRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    position: "relative",
  },
  headerBrandCenter: {
    position: "absolute",
    left: 58,
    right: 58,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBrandTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  topProfileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  topDownloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(38,42,49,0.45)",
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.green,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  section: {
    marginTop: 20,
  },
  emptyStateWrap: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  emptyStateCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyStateIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(38,225,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyStateTitle: {
    color: Colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: "Inter_700Bold",
  },
  emptyStateText: {
    marginTop: 8,
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  emptyActionRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  emptyActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
  },
  emptyActionPrimary: {
    backgroundColor: Colors.primary,
  },
  emptyActionPrimaryText: {
    color: Colors.black,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  emptyActionSecondary: {
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyActionSecondaryText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyActionTertiary: {
    marginTop: 10,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 19,
    color: BRAND.textPrimary,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.18,
  },
  viewAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  rowContent: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  rowSeparator: {
    width: HORIZONTAL_ROW_GAP,
  },
  recentCard: {
    width: RECENT_CARD_SIZE,
    height: RECENT_CARD_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  recentImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  recentLabelWrap: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
  },
  recentLabel: {
    color: BRAND.textPrimary,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  rectCard: {
    width: RECT_CARD_WIDTH,
  },
  artistCard: {
    width: ARTIST_CARD_WIDTH,
    alignItems: "center",
    gap: 6,
  },
  artistAvatarWrap: {
    position: "relative",
  },
  artistAvatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#1e2228",
  },
  artistCardName: {
    color: "#DFE2EB",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  artistCardLang: {
    color: "rgba(188,203,185,0.76)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    textTransform: "capitalize",
  },
  rectCardImageWrap: {
    width: RECT_CARD_WIDTH,
    height: RECT_CARD_WIDTH,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  rectCardImage: {
    width: RECT_CARD_WIDTH,
    height: RECT_CARD_WIDTH,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  rectCardTitle: {
    color: BRAND.textPrimary,
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
    paddingRight: 4,
  },
  rectCardMeta: {
    color: BRAND.textMuted,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 3,
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
  placeholderBlock: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.cardBorder,
  },
  placeholderLine: {
    marginTop: 8,
    marginLeft: 1,
    borderRadius: 4,
    backgroundColor: "rgba(223,226,235,0.2)",
  },
  placeholderLineTitle: {
    width: 124,
    height: 11,
  },
  placeholderLineMeta: {
    width: 84,
    height: 9,
    marginTop: 6,
    opacity: 0.75,
  },
  cardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
});

