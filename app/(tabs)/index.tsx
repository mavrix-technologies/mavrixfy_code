import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
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
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import {
  clearJioSaavnPlaylistCache,
  getHomeJioSaavnCategories,
  HomeJioSaavnCategoryData,
} from "@/lib/jioSaavnService";

const APP_BRAND_ICON = require("@/assets/images/icon.png");

type HomeSection =
  | { id: "recents"; type: "recents" }
  | { id: "public-playlists"; type: "public-playlists" }
  | { id: "trending"; type: "trending" }
  | { id: "new-releases"; type: "new-releases" }
  | { id: string; type: "category"; data: HomeJioSaavnCategoryData };

type HomeSessionCache = {
  hydrated: boolean;
  categories: HomeJioSaavnCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  recentlyPlayed: RecentlyPlayedItem[];
};

const HOME_SESSION_CACHE: HomeSessionCache = {
  hydrated: false,
  categories: [],
  publicPlaylists: [],
  recentlyPlayed: [],
};

const HOME_JIOSAAVN_SECTION_ORDER = [
  "trending",
  "most-viral",
  "most-played",
  "new-arrivals",
] as const;

const HOME_JIOSAAVN_TITLES: Record<(typeof HOME_JIOSAAVN_SECTION_ORDER)[number], string> = {
  trending: "New & Trending",
  "most-viral": "Most Viral",
  "most-played": "Most Played",
  "new-arrivals": "New Arrivals",
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
const MAX_ROW_ITEMS = 8;
const MAX_EXTRA_CATEGORY_ROWS = 2;

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
  useScreenTracking("Home");

  const insets = useSafeAreaInsets();
  const router = useRouter();
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
  const [loading, setLoading] = useState(!HOME_SESSION_CACHE.hydrated);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const latestLoadIdRef = useRef(0);
  const hasHydratedRef = useRef(HOME_SESSION_CACHE.hydrated);

  const INITIAL_CATEGORY_LIMIT = 10;
  const REFRESH_CATEGORY_LIMIT = 12;
  const INITIAL_PUBLIC_LIMIT = 10;

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

      try {
        const [publicPlaylistsResult, categoryResult] = await Promise.allSettled([
          refreshPublicPlaylists
            ? withPromiseTimeout(
                getPublicPlaylists(publicLimit),
                PUBLIC_PLAYLIST_FETCH_TIMEOUT_MS,
                "Home public playlists timeout"
              )
            : Promise.resolve<FirestorePlaylist[]>(HOME_SESSION_CACHE.publicPlaylists.slice(0, publicLimit)),
          withPromiseTimeout(
            getHomeJioSaavnCategories({
              forceRefresh,
              limitPerCategory,
              realtime: realtimeRefresh,
            }),
            HOME_CATEGORY_FETCH_TIMEOUT_MS,
            "Home categories timeout"
          ),
        ]);

        if (loadId !== latestLoadIdRef.current) {
          return;
        }

        if (refreshPublicPlaylists && publicPlaylistsResult.status === "fulfilled") {
          const nextPublicPlaylists = publicPlaylistsResult.value;
          const hasPreviousPublicPlaylists = HOME_SESSION_CACHE.publicPlaylists.length > 0;
          const shouldReplacePublicPlaylists = nextPublicPlaylists.length > 0 || !hasPreviousPublicPlaylists;

          if (shouldReplacePublicPlaylists) {
            setPublicPlaylists(nextPublicPlaylists);
            HOME_SESSION_CACHE.publicPlaylists = nextPublicPlaylists;
          }

          if (nextPublicPlaylists.length > 0) {
            void setCachedHomePublicPlaylists(nextPublicPlaylists);
          }
        }

        if (categoryResult.status === "fulfilled") {
          const validCategories = categoryResult.value.filter((cat) => cat.results.length > 0);
          const hasPreviousCategories = HOME_SESSION_CACHE.categories.length > 0;
          const shouldReplaceCategories = validCategories.length > 0 || !hasPreviousCategories;

          if (shouldReplaceCategories) {
            setCategories(validCategories);
            HOME_SESSION_CACHE.categories = validCategories;
          }

          if (validCategories.length > 0) {
            hasHydratedRef.current = true;
            HOME_SESSION_CACHE.hydrated = true;
          }
        }

        if (refreshPublicPlaylists && publicPlaylistsResult.status === "fulfilled") {
          if (publicPlaylistsResult.value.length > 0) {
            hasHydratedRef.current = true;
            HOME_SESSION_CACHE.hydrated = true;
          }
        }

        if (
          HOME_SESSION_CACHE.recentlyPlayed.length > 0 ||
          HOME_SESSION_CACHE.categories.length > 0 ||
          HOME_SESSION_CACHE.publicPlaylists.length > 0
        ) {
          hasHydratedRef.current = true;
          HOME_SESSION_CACHE.hydrated = true;
        }

        // Mark bootstrapped even on empty/offline response to avoid repeated heavy reloads.
        if (!HOME_SESSION_CACHE.hydrated) {
          HOME_SESSION_CACHE.hydrated = true;
          hasHydratedRef.current = true;
        }
      } finally {
        if (shouldShowLoader && loadId === latestLoadIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
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
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      resetHomeState();
      await clearJioSaavnPlaylistCache();
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
    } finally {
      setRefreshing(false);
    }
  }, [INITIAL_PUBLIC_LIMIT, REFRESH_CATEGORY_LIMIT, loadHomeData, resetHomeState]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (HOME_SESSION_CACHE.hydrated) {
        setRecentlyPlayed(HOME_SESSION_CACHE.recentlyPlayed);
        setCategories(HOME_SESSION_CACHE.categories);
        setPublicPlaylists(HOME_SESSION_CACHE.publicPlaylists);
        setLoading(false);
        return;
      }

      const [recentResult, cachedPublicResult] = await Promise.allSettled([
        getRecentlyPlayed(),
        getCachedHomePublicPlaylists({ allowStale: true }),
      ]);

      let hasWarmContent = false;

      if (!cancelled) {
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
            hasWarmContent = true;
          }
        }

        if (hasWarmContent) {
          hasHydratedRef.current = true;
          HOME_SESSION_CACHE.hydrated = true;
          setLoading(false);
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
          setLoading(false);
          hasHydratedRef.current = true;
          HOME_SESSION_CACHE.hydrated = true;
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      latestLoadIdRef.current += 1;
    };
  }, [loadHomeData]);

  const orderedHomeCategories = useMemo<HomeJioSaavnCategoryData[]>(() => {
    const categoryById = new Map<string, HomeJioSaavnCategoryData>();
    categories.forEach((category) => {
      categoryById.set(category.id, category);
    });

    const preferred = HOME_JIOSAAVN_SECTION_ORDER
      .map((categoryId) => {
        const category = categoryById.get(categoryId);
        if (!category || category.results.length === 0) return null;
        return {
          ...category,
          title: category.title || HOME_JIOSAAVN_TITLES[categoryId],
        };
      })
      .filter((category): category is HomeJioSaavnCategoryData => Boolean(category));

    const preferredIds = new Set(preferred.map((category) => category.id));
    const extras = categories
      .filter((category) => !preferredIds.has(category.id) && category.results.length > 0)
      .map((category) => ({
        ...category,
        title: category.title || category.id,
      }));

    return [...preferred, ...extras];
  }, [categories]);

  const weekdayLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", { weekday: "long" });
  }, []);

  const categoryById = useMemo(() => {
    const map = new Map<string, HomeJioSaavnCategoryData>();
    orderedHomeCategories.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [orderedHomeCategories]);

  const trendingItems = useMemo(
    () => dedupeJioPlaylistsById(categoryById.get("trending")?.results ?? [], MAX_ROW_ITEMS),
    [categoryById]
  );

  const newReleaseItems = useMemo(() => {
    const primary = dedupeJioPlaylistsById(categoryById.get("new-arrivals")?.results ?? [], MAX_ROW_ITEMS);
    if (primary.length > 0) return primary;
    return dedupeJioPlaylistsById(categoryById.get("most-viral")?.results ?? [], MAX_ROW_ITEMS);
  }, [categoryById]);

  const publicPlaylistsForSection = useMemo(
    () => dedupeFirestorePlaylistsById(publicPlaylists, MAX_ROW_ITEMS),
    [publicPlaylists]
  );

  const extraCategoryRows = useMemo(() => {
    const reserved = new Set(["trending", "new-arrivals", "most-viral"]);

    return orderedHomeCategories
      .filter((category) => !reserved.has(category.id))
      .map((category) => ({
        ...category,
        results: dedupeJioPlaylistsById(category.results, MAX_ROW_ITEMS),
      }))
      .filter((category) => category.results.length > 0)
      .slice(0, MAX_EXTRA_CATEGORY_ROWS);
  }, [orderedHomeCategories]);

  const sections = useMemo<HomeSection[]>(() => {
    const data: HomeSection[] = [];

    if (recentlyPlayed.length > 0) {
      data.push({ id: "recents", type: "recents" });
    }

    if (publicPlaylistsForSection.length >= MIN_PUBLIC_PLAYLIST_ITEMS) {
      data.push({ id: "public-playlists", type: "public-playlists" });
    }

    if (trendingItems.length > 0) {
      data.push({ id: "trending", type: "trending" });
    }

    if (newReleaseItems.length > 0) {
      data.push({ id: "new-releases", type: "new-releases" });
    }

    extraCategoryRows.forEach((cat) =>
      data.push({ id: `category-${cat.id}`, type: "category", data: cat })
    );

    return data;
  }, [
    recentlyPlayed,
    publicPlaylistsForSection,
    trendingItems,
    newReleaseItems,
    extraCategoryRows,
  ]);

  const openJioSaavnPlaylist = useCallback(
    (playlistId: string) => {
      router.push({
        pathname: "/playlist/[id]",
        params: { id: playlistId, jiosaavn: "true", firestore: "false" },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [router]
  );

  const openFirestorePlaylist = useCallback(
    (playlistId: string) => {
      router.push({
        pathname: "/playlist/[id]",
        params: { id: playlistId, firestore: "true", jiosaavn: "false" },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [router]
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
            router.push("/player");
            return;
          }
        }
        if (currentSongId) {
          router.push("/player");
        }
        return;
      }

      if (item.type === "jiosaavn-playlist") {
        openJioSaavnPlaylist(itemId);
        return;
      }

      const maybePlaylistData =
        item.data && typeof item.data === "object" ? (item.data as Record<string, unknown>) : null;
      if (maybePlaylistData && "createdBy" in maybePlaylistData) {
        openFirestorePlaylist(itemId);
        return;
      }

      if (itemId.startsWith("user_")) {
        router.push({
          pathname: "/playlist/[id]",
          params: { id: itemId, jiosaavn: "false", firestore: "false" },
        }, {
          withAnchor: true,
          dangerouslySingular: () => "playlist-details",
        });
        return;
      }

      // Legacy fallback: non-local playlist recents are usually JioSaavn ids.
      openJioSaavnPlaylist(itemId);
    },
    [currentSongId, openFirestorePlaylist, openJioSaavnPlaylist, playSong, router]
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
        onPress={() => openFirestorePlaylist(item.id)}
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
          {`${item.createdBy?.name || "Community"} • ${Math.max(0, item.songs?.length || 0)} songs`}
        </Text>
      </Pressable>
    ),
    [openFirestorePlaylist]
  );

  const renderCategoryPlaylist = useCallback(
    (categoryId: string, categoryTitle: string) =>
      function CategoryPlaylistCard({ item }: { item: HomeJioSaavnCategoryData["results"][number] }) {
        return (
          <Pressable
            style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
            onPress={() => openJioSaavnPlaylist(item.id)}
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
              {categoryTitle}
            </Text>
          </Pressable>
        );
      },
    [openJioSaavnPlaylist]
  );

  const renderHeader = useCallback(() => {
    const firstName =
      isAuthenticated && typeof user?.name === "string" && user.name.trim().length > 0
        ? user.name.trim().split(" ")[0]
        : "Listener";

    return (
      <View style={styles.header}>
        <View style={styles.topMenuRow}>
          <Pressable style={styles.topProfileButton} onPress={() => setShowProfileDropdown(true)}>
            {isAuthenticated && user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={16} color={Colors.black} />
              </View>
            )}
          </Pressable>
        </View>

        <LinearGradient
          colors={["rgba(38,225,154,0.22)", "rgba(0,184,123,0.1)", "rgba(24,28,34,0.9)"]}
          locations={[0, 0.56, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          <Text style={styles.heroEyebrow}>Mavrixfy Picks</Text>
          <Text style={styles.heroTitle}>
            {isAuthenticated ? `${firstName}, find your next vibe` : "Find your next vibe"}
          </Text>
          <Text style={styles.heroSubtitle}>
            Fresh playlists, trending hits, and your recent favorites in one place.
          </Text>
          <View style={styles.heroActionRow}>
            <Pressable style={styles.heroPrimaryButton} onPress={() => router.push("/(tabs)/search")}>
              <Ionicons name="search" size={15} color={Colors.black} />
              <Text style={styles.heroPrimaryText}>Search</Text>
            </Pressable>
            <Pressable style={styles.heroGhostButton} onPress={() => router.push("/(tabs)/liked-songs")}>
              <Ionicons name="heart" size={14} color={Colors.text} />
              <Text style={styles.heroGhostText}>Liked Songs</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    );
  }, [isAuthenticated, router, user?.name, user?.picture]);

  const renderSectionHeader = useCallback((title: string) => {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    );
  }, []);

  const renderSection = useCallback(
    ({ item: section }: { item: HomeSection }) => {
      switch (section.type) {
        case "recents":
          return (
            <View style={styles.section}>
              {renderSectionHeader("Jump Back In")}
              <FlatList
                data={recentlyPlayed}
                renderItem={renderRecentCard}
                keyExtractor={(item, index) => `recent-${item.id}-${index}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "public-playlists":
          return (
            <View style={styles.section}>
              {renderSectionHeader("Made for You")}
              <FlatList
                data={publicPlaylistsForSection}
                renderItem={renderPublicPlaylist}
                keyExtractor={(item, index) => `public-${item.id}-${index}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "trending":
          return (
            <View style={styles.section}>
              {renderSectionHeader("Trending Now")}
              <FlatList
                data={trendingItems}
                renderItem={renderCategoryPlaylist("trending", "Trending Now")}
                keyExtractor={(item, index) => `trending-${item.id}-${index}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "new-releases":
          return (
            <View style={styles.section}>
              {renderSectionHeader(`New Releases ${weekdayLabel}`)}
              <FlatList
                data={newReleaseItems}
                renderItem={renderCategoryPlaylist("new-arrivals", "New Releases")}
                keyExtractor={(item, index) => `new-releases-${item.id}-${index}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "category":
          return (
            <View style={styles.section}>
              {renderSectionHeader(section.data.title)}
              <FlatList
                data={section.data.results}
                renderItem={renderCategoryPlaylist(section.data.id, section.data.title)}
                keyExtractor={(item, index) => `${section.data.id}-${item.id}-${index}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
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
      trendingItems,
      newReleaseItems,
      renderCategoryPlaylist,
      renderSectionHeader,
      weekdayLabel,
    ]
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={BRAND.teal} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        updateCellsBatchingPeriod={60}
        removeClippedSubviews={Platform.OS === "android"}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16,20,26,0)", "rgba(16,20,26,0.52)", "rgba(16,20,26,0.84)", Colors.background]}
        locations={[0, 0.58, 0.86, 1]}
        style={styles.bottomVisibilityOverlay}
      />
      <ProfileDropdown
        visible={showProfileDropdown}
        onClose={() => setShowProfileDropdown(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 156,
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
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
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
  heroBanner: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: "hidden",
  },
  heroEyebrow: {
    color: "rgba(223,226,235,0.86)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: 6,
    color: Colors.text,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.4,
    fontFamily: "Inter_700Bold",
  },
  heroSubtitle: {
    marginTop: 6,
    color: BRAND.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
    maxWidth: "95%",
  },
  heroActionRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroPrimaryButton: {
    height: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.55)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  heroPrimaryText: {
    color: Colors.black,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  heroGhostButton: {
    height: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  heroGhostText: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  sectionTitle: {
    fontSize: 19,
    color: BRAND.textPrimary,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.18,
  },
  rowContent: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 12,
  },
  recentCard: {
    width: 134,
    height: 134,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  rectCard: {
    width: 152,
  },
  rectCardImageWrap: {
    width: 152,
    height: 152,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  rectCardImage: {
    width: 152,
    height: 152,
    borderRadius: 16,
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
  cardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
});
