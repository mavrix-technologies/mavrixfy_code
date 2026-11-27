import { type ComponentRef, memo, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Keyboard,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import SongRow from "@/components/SongRow";
import { MusicArtwork } from "@/components/MusicArtwork";
import AdMobBanner from "@/components/AdMobBanner";
import Colors from "@/constants/colors";
import { getBestImageUrl, type Song } from "@/lib/musicData";
import type { AlbumResult, ArtistResult, PlaylistResult, ResultFilter } from "@/lib/searchRepository";
import { RESULT_FILTERS } from "../types";
import { styles } from "../styles/searchStyles";
import { SearchResultMenuModal, type SearchMenuTarget } from "./SearchResultMenuModal";
import {
  buildSearchRowAccessibilityLabel,
  getSearchTabFilter,
  getSearchTabIndex,
  resolveSettledPageIndex,
  SEARCH_TAB_FILTERS,
} from "./searchTabPagerUtils";
import { useOptionalNavSwipe } from "@/features/navigation/navSwipeContext";

type TabKey = "songs" | "artists" | "albums" | "playlists";
const TAB_KEYS: readonly TabKey[] = ["songs", "artists", "albums", "playlists"];
const SEARCH_RESULTS_CONTENT_STYLE = [styles.resultsContent, { paddingBottom: 146 }];

interface SearchResultsSectionProps {
  topInset: number;
  headerHeight?: number;
  resultFilter: ResultFilter;
  onSelectFilter: (filter: ResultFilter) => void;
  scrollProgress?: SharedValue<number>;
  searchQuery?: string;
  searchLoading: boolean;
  searchError: boolean;
  searchDisplayQuery: string;
  onRetry: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  songResults: Song[];
  albumResults: AlbumResult[];
  artistResults: ArtistResult[];
  playlistResults: PlaylistResult[];
  onSongPress: (song: Song) => void;
  onArtistPress: (artist: ArtistResult) => void;
  onAlbumPress: (album: AlbumResult, meta: string) => void;
  onPlaylistPress: (playlist: PlaylistResult, meta: string) => void;
  onSearchQuery?: (query: string) => void;
}

interface TabCacheState {
  queryKey: string;
  songs: Song[];
  artists: ArtistResult[];
  albums: AlbumResult[];
  playlists: PlaylistResult[];
  fetched: Record<TabKey, boolean>;
  errors: Record<TabKey, boolean>;
}

const createEmptyCache = (queryKey: string): TabCacheState => ({
  queryKey,
  songs: [],
  artists: [],
  albums: [],
  playlists: [],
  fetched: { songs: false, artists: false, albums: false, playlists: false },
  errors: { songs: false, artists: false, albums: false, playlists: false },
});

function computeNextTabCache(
  prev: TabCacheState,
  params: {
    activeQueryKey: string;
    displayQueryKey: string;
    resultFilter: ResultFilter;
    songResults: Song[];
    artistResults: ArtistResult[];
    albumResults: AlbumResult[];
    playlistResults: PlaylistResult[];
    searchLoading: boolean;
    searchError: boolean;
  }
): TabCacheState {
  const {
    activeQueryKey,
    displayQueryKey,
    resultFilter,
    songResults,
    artistResults,
    albumResults,
    playlistResults,
    searchLoading,
    searchError,
  } = params;

  if (prev.queryKey !== activeQueryKey) {
    return createEmptyCache(activeQueryKey);
  }
  if (!activeQueryKey) return prev;
  if (displayQueryKey !== activeQueryKey && !searchError) {
    return prev;
  }

  const targetSet = new Set<TabKey>(
    resultFilter === "all" ? TAB_KEYS : [resultFilter as TabKey]
  );

  const songs = targetSet.has("songs") && (songResults.length > 0 || !searchLoading) ? songResults : prev.songs;
  const artists = targetSet.has("artists") && (artistResults.length > 0 || !searchLoading) ? artistResults : prev.artists;
  const albums = targetSet.has("albums") && (albumResults.length > 0 || !searchLoading) ? albumResults : prev.albums;
  const playlists = targetSet.has("playlists") && (playlistResults.length > 0 || !searchLoading) ? playlistResults : prev.playlists;

  const nextFetched = Object.fromEntries(
    TAB_KEYS.map((tab) => [
      tab,
      targetSet.has(tab) && (searchError || !searchLoading) ? true : prev.fetched[tab],
    ])
  ) as Record<TabKey, boolean>;
  const nextErrors = Object.fromEntries(
    TAB_KEYS.map((tab) => [
      tab,
      targetSet.has(tab)
        ? searchError
          ? true
          : !searchLoading
            ? false
            : prev.errors[tab]
        : prev.errors[tab],
    ])
  ) as Record<TabKey, boolean>;

  const statusChanged = TAB_KEYS.some(
    (tab) => nextFetched[tab] !== prev.fetched[tab] || nextErrors[tab] !== prev.errors[tab]
  );
  if (
    !statusChanged &&
    songs === prev.songs &&
    artists === prev.artists &&
    albums === prev.albums &&
    playlists === prev.playlists
  ) {
    return prev;
  }

  return {
    ...prev,
    songs,
    artists,
    albums,
    playlists,
    fetched: nextFetched,
    errors: nextErrors,
  };
}

type SearchResultsPageItem = {
  key: TabKey;
  label: string;
  items: any[];
  isLoading: boolean;
  hasError: boolean;
};

const searchPageKeyExtractor = (page: SearchResultsPageItem) => page.key;

interface SearchNonSongRowProps {
  kind: "artists" | "albums" | "playlists";
  item: ArtistResult | AlbumResult | PlaylistResult;
  onArtistPress: (artist: ArtistResult) => void;
  onAlbumPress: (album: AlbumResult, meta: string) => void;
  onPlaylistPress: (playlist: PlaylistResult, meta: string) => void;
  onOpenMenu: (target: SearchMenuTarget) => void;
}

const SearchNonSongRow = memo(function SearchNonSongRow({
  kind,
  item,
  onArtistPress,
  onAlbumPress,
  onPlaylistPress,
  onOpenMenu,
}: SearchNonSongRowProps) {
  const meta =
    kind === "artists"
      ? (item as ArtistResult).subtitle || "Artist"
      : (item as AlbumResult | PlaylistResult).description ||
        (kind === "albums" ? "Album" : "Playlist");
  const kindWord = kind === "artists" ? "artist" : kind === "albums" ? "album" : "playlist";

  const handleOpen = () => {
    Keyboard.dismiss();
    if (kind === "artists") onArtistPress(item as ArtistResult);
    else if (kind === "albums") onAlbumPress(item as AlbumResult, meta);
    else onPlaylistPress(item as PlaylistResult, meta);
  };

  const target: SearchMenuTarget =
    kind === "artists"
      ? { kind: "artists", item: item as ArtistResult, meta }
      : kind === "albums"
        ? { kind: "albums", item: item as AlbumResult, meta }
        : { kind: "playlists", item: item as PlaylistResult, meta };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={buildSearchRowAccessibilityLabel(kind, item.name, meta)}
      accessibilityHint={`Double tap to open ${kindWord}. Long press or use options button for menu.`}
      onPress={handleOpen}
      onLongPress={() => onOpenMenu(target)}
      delayLongPress={450}
      android_ripple={{ color: "rgba(255, 255, 255, 0.08)" }}
      style={({ pressed }) => [styles.artistResultRow, pressed && styles.recentRowPressed]}
    >
      <MusicArtwork
        uri={getBestImageUrl(item.image)}
        size={56}
        style={[styles.artistResultImage, { borderRadius: kind === "artists" ? 28 : 8 }]}
        contentFit="cover"
        transition={0}
      />
      <View style={styles.artistResultInfo}>
        <Text style={styles.artistResultName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.artistResultMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Pressable
        hitSlop={6}
        android_ripple={{ color: "rgba(255, 255, 255, 0.14)", borderless: true, radius: 22 }}
        onPress={(event) => {
          event.stopPropagation();
          onOpenMenu(target);
        }}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${item.name}`}
        accessibilityHint={`Opens menu for this ${kindWord}`}
        style={({ pressed }) => [styles.resultRowMenuBtn, pressed && styles.recentRowPressed]}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.subtext} />
      </Pressable>
    </Pressable>
  );
});

interface SearchResultsPageViewProps {
  page: SearchResultsPageItem;
  pageWidth: number;
  queryDisplayLabel: string;
  onRetry: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onSongPress: (song: Song) => void;
  onArtistPress: (artist: ArtistResult) => void;
  onAlbumPress: (album: AlbumResult, meta: string) => void;
  onPlaylistPress: (playlist: PlaylistResult, meta: string) => void;
  onOpenMenu: (target: SearchMenuTarget) => void;
}

const SearchResultsPageView = memo(function SearchResultsPageView({
  page,
  pageWidth,
  queryDisplayLabel,
  onRetry,
  onScroll,
  onSongPress,
  onArtistPress,
  onAlbumPress,
  onPlaylistPress,
  onOpenMenu,
}: SearchResultsPageViewProps) {
  const isSongsPage = page.key === "songs";
  const songsList = useMemo(
    () => (isSongsPage ? (page.items as Song[]) : []),
    [isSongsPage, page.items]
  );

  const keyExtractor = useCallback((item: { id: string }) => `${page.key}:${item.id}`, [page.key]);

  const renderResultItem = useCallback(
    ({ item }: ListRenderItemInfo<any>) =>
      isSongsPage ? (
        <SongRow
          song={item as Song}
          queue={songsList}
          onSongPress={onSongPress}
          showDownload={false}
          accessibilityHint="Double tap to play song. Long press or use options button for menu."
        />
      ) : (
        <SearchNonSongRow
          kind={page.key as "artists" | "albums" | "playlists"}
          item={item as ArtistResult | AlbumResult | PlaylistResult}
          onArtistPress={onArtistPress}
          onAlbumPress={onAlbumPress}
          onPlaylistPress={onPlaylistPress}
          onOpenMenu={onOpenMenu}
        />
      ),
    [isSongsPage, onAlbumPress, onArtistPress, onOpenMenu, onPlaylistPress, onSongPress, page.key, songsList]
  );

  return (
    <View
      style={{ width: pageWidth, flex: 1 }}
      accessibilityLabel={`${page.label} results tab`}
    >
      {page.isLoading && page.items.length === 0 ? (
        <View
          style={styles.loadingContainer}
          accessibilityRole="progressbar"
          accessibilityLabel={`Loading ${page.label.toLowerCase()}`}
        >
          <ActivityIndicator size="large" color={Colors.text} />
        </View>
      ) : page.hasError && page.items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Could not load {page.label.toLowerCase()}.</Text>
          <Text style={styles.emptySubtext}>Check your connection or swipe to try another category.</Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={`Retry searching ${page.label.toLowerCase()}`}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={page.items}
          keyExtractor={keyExtractor}
          renderItem={renderResultItem}
          nestedScrollEnabled
          contentContainerStyle={SEARCH_RESULTS_CONTENT_STYLE}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={16}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {`No ${page.label.toLowerCase()} for "${queryDisplayLabel}"`}
              </Text>
              <Text style={styles.emptySubtext}>
                Swipe left or right to check other tabs, or refine your search.
              </Text>
            </View>
          }
          ListFooterComponent={
            page.isLoading ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : page.items.length ? (
              <AdMobBanner loadDelayMs={600} />
            ) : undefined
          }
        />
      )}
    </View>
  );
});

function useSearchTabPager(
  pagerRef: RefObject<ComponentRef<typeof Animated.FlatList<SearchResultsPageItem>> | null>,
  resultFilter: ResultFilter,
  onSelectFilter: (filter: ResultFilter) => void,
  scrollProgress?: SharedValue<number>
) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const pageWidth = Math.max(1, measuredWidth > 0 ? measuredWidth : windowWidth);
  const activeIndex = getSearchTabIndex(resultFilter);
  const fallbackProgress = useSharedValue(activeIndex);
  const activeProgress = scrollProgress ?? fallbackProgress;
  const pageWidthShared = useSharedValue(pageWidth);

  const pendingTargetIndexRef = useRef<number | null>(null);
  const lastSwipedIndexRef = useRef<number | null>(null);
  const alignedIndexRef = useRef<number>(-1);
  const alignedWidthRef = useRef<number>(0);
  const didContentAlignRef = useRef(false);
  const dragSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMomentumScrollingRef = useRef(false);
  const navSwipe = useOptionalNavSwipe();

  const handleAnimatedScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const width = pageWidthShared.value;
      if (width > 0) {
        activeProgress.set(event.contentOffset.x / width);
      }
    },
  });

  useEffect(() => {
    navSwipe?.setInnerPagerBoundary("search", {
      blockPrev: activeIndex > 0,
      blockNext: activeIndex < SEARCH_TAB_FILTERS.length - 1,
    });
  }, [activeIndex, navSwipe]);

  useEffect(() => {
    pageWidthShared.set(pageWidth);
  }, [pageWidth, pageWidthShared]);

  const scrollPagerTo = useCallback((targetIndex: number, animated: boolean) => {
    const raw = pagerRef.current as unknown as {
      scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
      getNode?: () => { scrollToOffset?: (options: { offset: number; animated?: boolean }) => void };
    } | null;
    const scroller = raw?.scrollToOffset ? raw : raw?.getNode?.();
    scroller?.scrollToOffset?.({ offset: targetIndex * pageWidth, animated });
  }, [pagerRef, pageWidth]);

  useEffect(() => {
    const needsInstantAlign =
      alignedIndexRef.current === -1 || alignedWidthRef.current !== pageWidth;

    if (needsInstantAlign) {
      pendingTargetIndexRef.current = null;
      scrollPagerTo(activeIndex, false);
      activeProgress.set(activeIndex);
    } else if (alignedIndexRef.current !== activeIndex) {
      if (lastSwipedIndexRef.current === activeIndex) {
        lastSwipedIndexRef.current = null;
      } else {
        pendingTargetIndexRef.current = activeIndex;
        scrollPagerTo(activeIndex, true);
      }
    }

    alignedIndexRef.current = activeIndex;
    alignedWidthRef.current = pageWidth;
  }, [activeIndex, pageWidth, activeProgress, scrollPagerTo]);

  useEffect(() => {
    return () => {
      if (dragSettleTimerRef.current) {
        clearTimeout(dragSettleTimerRef.current);
        dragSettleTimerRef.current = null;
      }
    };
  }, []);

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && Math.abs(nextWidth - measuredWidth) > 0.5) {
      setMeasuredWidth(nextWidth);
    }
  }, [measuredWidth]);

  const handleContentSizeChange = useCallback(() => {
    if (!didContentAlignRef.current && pageWidth > 1) {
      didContentAlignRef.current = true;
      scrollPagerTo(activeIndex, false);
      activeProgress.set(activeIndex);
    }
  }, [activeIndex, activeProgress, pageWidth, scrollPagerTo]);

  const commitPageOffset = useCallback((offsetX: number) => {
    const settledIndex = resolveSettledPageIndex(offsetX, pageWidth, SEARCH_TAB_FILTERS.length);

    if (pendingTargetIndexRef.current !== null) {
      if (settledIndex === pendingTargetIndexRef.current) {
        pendingTargetIndexRef.current = null;
        return;
      }
      pendingTargetIndexRef.current = null;
    }

    if (settledIndex === activeIndex) return;

    lastSwipedIndexRef.current = settledIndex;
    const nextFilter = getSearchTabFilter(settledIndex);
    Keyboard.dismiss();
    onSelectFilter(nextFilter);
    const label = RESULT_FILTERS[settledIndex]?.label ?? "Search";
    AccessibilityInfo.announceForAccessibility?.(`${label} results`);
  }, [activeIndex, onSelectFilter, pageWidth]);

  const handleMomentumScrollBegin = useCallback(() => {
    isMomentumScrollingRef.current = true;
    if (dragSettleTimerRef.current) {
      clearTimeout(dragSettleTimerRef.current);
      dragSettleTimerRef.current = null;
    }
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isMomentumScrollingRef.current = false;
      if (dragSettleTimerRef.current) {
        clearTimeout(dragSettleTimerRef.current);
        dragSettleTimerRef.current = null;
      }
      commitPageOffset(event.nativeEvent.contentOffset.x);
    },
    [commitPageOffset]
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (dragSettleTimerRef.current) {
        clearTimeout(dragSettleTimerRef.current);
      }
      if (Platform.OS === "web" || Math.abs(velocityX) <= 0.05) {
        dragSettleTimerRef.current = setTimeout(() => {
          if (!isMomentumScrollingRef.current) {
            commitPageOffset(offsetX);
          }
        }, 70);
      }
    },
    [commitPageOffset]
  );

  const getPageItemLayout = useCallback(
    (_data: ArrayLike<SearchResultsPageItem> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth]
  );

  return {
    pageWidth,
    handleContainerLayout,
    handleAnimatedScroll,
    handleContentSizeChange,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScrollEndDrag,
    getPageItemLayout,
  };
}

/** Server-ranked, horizontally swipeable tab pages with full row accessibility and action menus. */
export const SearchResultsSection = memo(function SearchResultsSection(props: SearchResultsSectionProps) {
  const {
    resultFilter,
    onSelectFilter,
    scrollProgress,
    searchQuery,
    searchLoading,
    searchError,
    searchDisplayQuery,
    onRetry,
    onScroll,
    songResults,
    albumResults,
    artistResults,
    playlistResults,
    onSongPress,
    onArtistPress,
    onAlbumPress,
    onPlaylistPress,
    onSearchQuery,
  } = props;

  const [menuTarget, setMenuTarget] = useState<SearchMenuTarget | null>(null);
  const pagerRef = useRef<ComponentRef<typeof Animated.FlatList<SearchResultsPageItem>>>(null);
  const {
    pageWidth,
    handleContainerLayout,
    handleAnimatedScroll,
    handleContentSizeChange,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScrollEndDrag,
    getPageItemLayout,
  } = useSearchTabPager(pagerRef, resultFilter, onSelectFilter, scrollProgress);

  const activeQueryKey = (searchQuery ?? searchDisplayQuery).trim().toLowerCase();
  const displayQueryKey = searchDisplayQuery.trim().toLowerCase();
  const [tabCache, setTabCache] = useState<TabCacheState>(() => createEmptyCache(activeQueryKey));

  const effectiveTabCache = computeNextTabCache(tabCache, {
    activeQueryKey,
    displayQueryKey,
    resultFilter,
    songResults,
    artistResults,
    albumResults,
    playlistResults,
    searchLoading,
    searchError,
  });
  if (effectiveTabCache !== tabCache) {
    setTabCache(effectiveTabCache);
  }

  const openNonSongMenu = useCallback((target: SearchMenuTarget) => {
    Keyboard.dismiss();
    setMenuTarget(target);
  }, []);

  const closeMenu = useCallback(() => setMenuTarget(null), []);

  const pagesData = useMemo<SearchResultsPageItem[]>(() => {
    const canUseLive = Boolean(activeQueryKey) && displayQueryKey === activeQueryKey;
    return RESULT_FILTERS.map((tab) => {
      const key = tab.key as TabKey;
      const isCurrentTab = resultFilter === key || resultFilter === "all";
      const liveItems =
        key === "songs"
          ? songResults
          : key === "artists"
            ? artistResults
            : key === "albums"
              ? albumResults
              : playlistResults;
      const cachedItems =
        effectiveTabCache.queryKey === activeQueryKey
          ? key === "songs"
            ? effectiveTabCache.songs
            : key === "artists"
              ? effectiveTabCache.artists
              : key === "albums"
                ? effectiveTabCache.albums
                : effectiveTabCache.playlists
          : [];

      const items =
        isCurrentTab && canUseLive && (!searchLoading || liveItems.length > 0)
          ? liveItems
          : cachedItems;
      const isFetched = effectiveTabCache.queryKey === activeQueryKey && effectiveTabCache.fetched[key];
      const hasError =
        isCurrentTab && searchError
          ? true
          : effectiveTabCache.queryKey === activeQueryKey && effectiveTabCache.errors[key];
      const isLoading = isCurrentTab
        ? searchLoading || (!isFetched && !hasError && Boolean(activeQueryKey))
        : !isFetched && !hasError && Boolean(activeQueryKey);

      return {
        key,
        label: tab.label,
        items,
        isLoading,
        hasError,
      };
    });
  }, [
    activeQueryKey,
    displayQueryKey,
    resultFilter,
    songResults,
    artistResults,
    albumResults,
    playlistResults,
    effectiveTabCache,
    searchLoading,
    searchError,
  ]);

  const queryDisplayLabel = searchDisplayQuery || searchQuery?.trim() || "";

  const renderPageItem = useCallback(
    ({ item: page }: ListRenderItemInfo<SearchResultsPageItem>) => (
      <SearchResultsPageView
        page={page}
        pageWidth={pageWidth}
        queryDisplayLabel={queryDisplayLabel}
        onRetry={onRetry}
        onScroll={onScroll}
        onSongPress={onSongPress}
        onArtistPress={onArtistPress}
        onAlbumPress={onAlbumPress}
        onPlaylistPress={onPlaylistPress}
        onOpenMenu={openNonSongMenu}
      />
    ),
    [
      onAlbumPress,
      onArtistPress,
      onPlaylistPress,
      onRetry,
      onScroll,
      onSongPress,
      openNonSongMenu,
      pageWidth,
      queryDisplayLabel,
    ]
  );

  const resultsWrapStyle = useMemo(
    () => [styles.resultsWrap, { paddingTop: props.headerHeight ?? props.topInset + 108 }],
    [props.headerHeight, props.topInset]
  );

  return (
    <View style={resultsWrapStyle} onLayout={handleContainerLayout}>
      <Animated.FlatList
        ref={pagerRef}
        data={pagesData}
        keyExtractor={searchPageKeyExtractor}
        renderItem={renderPageItem}
        getItemLayout={getPageItemLayout}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        decelerationRate="fast"
        overScrollMode="never"
        bounces={Platform.OS === "ios"}
        scrollEventThrottle={16}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        onScroll={handleAnimatedScroll}
        onContentSizeChange={handleContentSizeChange}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
      />

      <SearchResultMenuModal
        target={menuTarget}
        onClose={closeMenu}
        onOpenArtist={onArtistPress}
        onOpenAlbum={onAlbumPress}
        onOpenPlaylist={onPlaylistPress}
        onSearchQuery={onSearchQuery}
      />
    </View>
  );
});
