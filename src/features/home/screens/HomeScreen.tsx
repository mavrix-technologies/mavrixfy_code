import { useQuery } from "@tanstack/react-query";
import { clearFeaturedArtistsCache, getCachedFeaturedArtists, getFeaturedArtists, type ArtistCard } from "@/data/providers/ArtistProvider";
import React,{ useCallback,useEffect,useMemo,useRef,useState } from "react";

import Colors from "@/constants/colors";
import AdMobBanner from "@/components/AdMobBanner";
import OfflineBanner from "@/components/OfflineBanner";
import OfflineScreen from "@/components/OfflineScreen";
import { useNetwork } from "@/contexts/NetworkContext";
import { usePlayerRowActions } from "@/contexts/PlayerContext";
import { globalHomeScrollRef } from "@/lib/homeScrollRef";
import {
AccessibilityInfo,
FlatList,
Platform,
RefreshControl,
StyleSheet,
View,
useWindowDimensions,
type ListRenderItemInfo,
type LayoutChangeEvent,
type NativeScrollEvent,
type NativeSyntheticEvent,
} from "react-native";
import Animated,{
useAnimatedScrollHandler,
useAnimatedStyle,
useSharedValue,
withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getQuickPicksForCategory } from "@/data/providers/QuickPicksProvider";
import { FestivalHeaderBanner } from "../components/FestivalHeaderBanner";
import { HomeAnnouncementBanner } from "../components/HomeAnnouncementBanner";
import {
getCachedMiniPlayerBannerConfig,
subscribeToMiniPlayerBannerConfig,
} from "@/lib/miniPlayerBannerConfig";
import { HomeAmbientBackdrop } from "../components/HomeAmbientBackdrop";
import { HomeHorizontalSection } from "../components/HomeHorizontalSection";
import { HomeQuickPicks } from "../components/HomeQuickPicks";
import { HomeRecentlyPlayed } from "../components/HomeRecentlyPlayed";
import { HomeArtistsSection } from "../components/HomeArtistsSection";
import {
HomeLoadingSkeleton,
HomeQuickPicksSkeleton,
HomeSectionSkeleton,
} from "../components/HomeSkeletons";
import {
HomeUnifiedTopHeader,
UNIFIED_HEADER_TOTAL_HEIGHT,
} from "../components/HomeUnifiedTopHeader";
import { AppShowcaseModal } from "@/components/AppShowcaseModal";
import { useFestivalTheme } from "../hooks/useFestivalTheme";
import { useHomeFeedData } from "../hooks/useHomeFeedData";
import { useYouTubeHomeFeed } from "../hooks/useYouTubeHomeFeed";
import { HomeYouTubeContent, HomeYouTubeStatus } from "../components/HomeYouTubeContent";
import { clearYouTubeHomeCache } from "@/services/youtube/YouTubeMusic";
import { useAppShowcasePrompt } from "../hooks/useAppShowcasePrompt";
import { useHomeAnnouncement } from "../hooks/useHomeAnnouncement";
import {
HOME_CATEGORY_TITLES,
buildHomeSectionItems,
useHomeSectionData,

} from "../hooks/useHomeSectionData";

import { buildHomeSections, type HomeListItem } from "../hooks/buildHomeSections";
import { rotateDiscovery, varyHomeRows } from "../hooks/homePresentation";
import { MAVRIXFY_MUSIC_CATEGORIES, type MavrixfyCategory } from "../constants/homeNavConstants";
import {
getHomeCategoryId,
getHomeCategoryIndex,
isHomeCategoryPageMounted,
resolveHomeSettledPageIndex,
} from "../utils/homeCategoryPagerUtils";
import { MainTabSwipeSurface } from "@/features/navigation/MainTabSwipeSurface";
import { useOptionalNavSwipe } from "@/features/navigation/navSwipeContext";
const homeSectionKeyExtractor = (item: HomeListItem) => item.id;
const isNativeHome = Platform.OS !== "web";

interface HomeFeedItemProps {
  item: HomeListItem;
  explore: any;
  hasReleases: boolean;
  isOnline: boolean;
  retryExplore: () => void;
  retryYouTube: () => void;
  youtube: any;
  playSong: (song: any, queue?: any[]) => void;
  displayedQuickPicks: any[];
  recentlyPlayed: any[];
  loadingMainContent: boolean;
  publicPlaylists: any[];
  featuredArtists: ArtistCard[];
  refreshRevision: number;
}

const HomeFeedSectionRow = React.memo(function HomeFeedSectionRow({
  item,
  explore,
  hasReleases,
  isOnline,
  retryExplore,
  retryYouTube,
  youtube,
  playSong,
  displayedQuickPicks,
  recentlyPlayed,
  loadingMainContent,
  publicPlaylists,
  featuredArtists,
  refreshRevision,
}: HomeFeedItemProps) {
  switch (item.type) {
    case "trending-status":
      return (
        <HomeYouTubeStatus
          hasFeed={Boolean(explore.data || youtube.data)}
          loading={explore.isFetching || youtube.isFetching || (explore.isPending && isOnline)}
          failed={explore.isError || youtube.isError}
          online={isOnline}
          onRetry={() => { retryExplore(); retryYouTube(); }}
          emptyMessage="No charts available right now. Pull to refresh."
        />
      );
    case "releases-status":
      return (
        <HomeYouTubeStatus
          hasFeed={Boolean(explore.data)}
          loading={explore.isFetching || (explore.isPending && isOnline)}
          failed={explore.isError}
          online={isOnline}
          onRetry={retryExplore}
          emptyMessage={explore.data && !hasReleases ? "Nothing to show yet. Pull to refresh." : undefined}
        />
      );
    case "youtube-quick-picks": {
      const quickSongs = (youtube.data?.songs && youtube.data.songs.length > 0)
        ? rotateDiscovery(youtube.data.songs, refreshRevision)
        : displayedQuickPicks;
      return quickSongs && quickSongs.length ? (
        <HomeQuickPicks songs={quickSongs} playSong={playSong} />
      ) : (youtube.isFetching && isOnline) ? (
        <HomeQuickPicksSkeleton />
      ) : null;
    }
    case "youtube-section": {
      const category = item.section.category;
      const regional = category === "new-releases"
        ? explore.data?.sections?.some((section: { category?: string }) => section.category === "new-releases")
        : item.section.id.startsWith("youtube-regional-");
      const updatedAt = category === "new-releases" || category === "trending"
        ? (regional ? explore.dataUpdatedAt : youtube.dataUpdatedAt)
        : undefined;
      return <HomeYouTubeContent section={item.section} updatedAt={updatedAt} />;
    }
    case "youtube-status":
      return (
        <HomeYouTubeStatus
          hasFeed={Boolean(youtube.data)}
          loading={youtube.isFetching || (youtube.isPending && isOnline)}
          failed={youtube.isError}
          online={isOnline}
          onRetry={retryYouTube}
        />
      );
    case "quick-picks":
      return <HomeQuickPicks songs={displayedQuickPicks} playSong={playSong} />;
    case "loading-quick":
      return <HomeQuickPicksSkeleton />;
    case "recently-played":
      return <HomeRecentlyPlayed items={recentlyPlayed} playSong={playSong} />;
    case "artists":
      return <HomeArtistsSection artists={featuredArtists} />;
    case "category":
      return (
        <View>
          <HomeHorizontalSection
            title={HOME_CATEGORY_TITLES[item.category.id] || item.category.title}
            items={item.category.results}
          />
          {item.showAd && !loadingMainContent ? <AdMobBanner loadDelayMs={1200} /> : null}
        </View>
      );
    case "public-playlists":
      return (
        <HomeHorizontalSection
          title="Featured Playlists"
          items={publicPlaylists}
          isFirestore
        />
      );
    case "loading-main":
      return <HomeSectionSkeleton />;
    default:
      return null;
  }
});

interface HomeNeighborCategoryPageProps {
  pageWidth: number;
  label: string;
  sections: HomeListItem[];
  explore: any;
  hasReleases: boolean;
  isOnline: boolean;
  retryExplore: () => void;
  retryYouTube: () => void;
  youtube: any;
  playSong: (song: any, queue?: any[]) => void;
  displayedQuickPicks: any[];
  recentlyPlayed: any[];
  loadingMainContent: boolean;
  publicPlaylists: any[];
  featuredArtists: ArtistCard[];
  refreshRevision: number;
  listHeader: React.ReactElement;
  loading: boolean;
  contentContainerStyle: any;
}

const HomeNeighborCategoryPage = React.memo(function HomeNeighborCategoryPage({
  pageWidth,
  label,
  sections,
  explore,
  hasReleases,
  isOnline,
  retryExplore,
  retryYouTube,
  youtube,
  playSong,
  displayedQuickPicks,
  recentlyPlayed,
  loadingMainContent,
  publicPlaylists,
  featuredArtists,
  refreshRevision,
  listHeader,
  loading,
  contentContainerStyle,
}: HomeNeighborCategoryPageProps) {
  const renderNeighborItem = useCallback(
    ({ item }: ListRenderItemInfo<HomeListItem>) => (
      <HomeFeedSectionRow
        item={item}
        explore={explore}
        hasReleases={hasReleases}
        isOnline={isOnline}
        retryExplore={retryExplore}
        retryYouTube={retryYouTube}
        youtube={youtube}
        playSong={playSong}
        displayedQuickPicks={displayedQuickPicks}
        recentlyPlayed={recentlyPlayed}
        loadingMainContent={loadingMainContent}
        publicPlaylists={publicPlaylists}
        featuredArtists={featuredArtists}
        refreshRevision={refreshRevision}
      />
    ),
    [
      explore,
      hasReleases,
      isOnline,
      retryExplore,
      retryYouTube,
      youtube,
      playSong,
      displayedQuickPicks,
      recentlyPlayed,
      loadingMainContent,
      publicPlaylists,
      featuredArtists,
      refreshRevision,
    ]
  );

  return (
    <View style={{ width: pageWidth, flex: 1 }} accessibilityLabel={`${label} category feed`}>
      <FlatList
        data={sections}
        keyExtractor={homeSectionKeyExtractor}
        renderItem={renderNeighborItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={loading ? <HomeLoadingSkeleton /> : undefined}
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        windowSize={3}
        removeClippedSubviews={Platform.OS !== "web"}
      />
    </View>
  );
});

type HomeCategoryPageItem = {
  category: MavrixfyCategory;
  label: string;
  mounted: boolean;
  sections: HomeListItem[];
  quickPicks: any[];
  hasReleases: boolean;
};

const homeCategoryPageKeyExtractor = (page: HomeCategoryPageItem) => page.category;

interface HomeCategoryPagerViewProps {
  pagerRef: React.RefObject<any>;
  pages: HomeCategoryPageItem[];
  activeCategoryIndex: number;
  pageWidth: number;
  extraData: unknown;
  onLayout: (event: LayoutChangeEvent) => void;
  onScroll: any;
  onContentSizeChange: () => void;
  onMomentumScrollBegin: () => void;
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  attachHomeList: (list: FlatList<HomeListItem> | null) => void;
  sectionData: HomeListItem[];
  renderSectionItem: (info: ListRenderItemInfo<HomeListItem>) => React.ReactElement | null;
  scrollHandler: any;
  pullRefreshing: boolean;
  refreshHome: () => Promise<void>;
  isOnline: boolean;
  topInset: number;
  noticeVisible: boolean;
  noticeHeight: number;
  noticeSpacerStyle: any;
  festivalTheme: ReturnType<typeof useFestivalTheme>;
  scrollY: ReturnType<typeof useSharedValue<number>>;
  loading: boolean;
  loadingMainContent: boolean;
  contentContainerStyle: any;
  explore: any;
  retryExplore: () => void;
  retryYouTube: () => void;
  youtube: any;
  playSong: (song: any, queue?: any[]) => void;
  recentlyPlayed: any[];
  variedPublicPlaylists: any[];
  variedArtists: ArtistCard[];
  refreshRevision: number;
}

const HomeCategoryPagerView = React.memo(function HomeCategoryPagerView({
  pagerRef,
  pages,
  activeCategoryIndex,
  pageWidth,
  extraData,
  onLayout,
  onScroll,
  onContentSizeChange,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  onScrollEndDrag,
  attachHomeList,
  sectionData,
  renderSectionItem,
  scrollHandler,
  pullRefreshing,
  refreshHome,
  isOnline,
  topInset,
  noticeVisible,
  noticeHeight,
  noticeSpacerStyle,
  festivalTheme,
  scrollY,
  loading,
  loadingMainContent,
  contentContainerStyle,
  explore,
  retryExplore,
  retryYouTube,
  youtube,
  playSong,
  recentlyPlayed,
  variedPublicPlaylists,
  variedArtists,
  refreshRevision,
}: HomeCategoryPagerViewProps) {
  const getItemLayout = useCallback(
    (_data: ArrayLike<HomeCategoryPageItem> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth]
  );

  const renderCategoryPage = useCallback(
    ({ item: page, index: pageIndex }: ListRenderItemInfo<HomeCategoryPageItem>) => {
      if (!page.mounted) {
        return <View style={{ width: pageWidth, flex: 1 }} />;
      }

      const isCurrent = pageIndex === activeCategoryIndex;
      const listHeader = (
        <View>
          <Animated.View style={noticeSpacerStyle} pointerEvents="none" />
          {festivalTheme?.enabled ? (
            <View style={styles.listHeaderWrap}>
              <View
                style={[
                  styles.overscrollFill,
                  {
                    backgroundColor: festivalTheme.themeAccentColor || "#ffb900",
                  },
                ]}
                pointerEvents="none"
              />
              <FestivalHeaderBanner
                themeConfig={festivalTheme}
                scrollY={isCurrent ? scrollY : undefined}
                contentTopOffset={topInset + (noticeVisible ? noticeHeight : 0) + UNIFIED_HEADER_TOTAL_HEIGHT}
              />
            </View>
          ) : null}
        </View>
      );

      if (isCurrent) {
        return (
          <View
            style={{ width: pageWidth, flex: 1 }}
            accessibilityLabel={`${page.label} category feed`}
          >
            <Animated.FlatList
              ref={attachHomeList}
              testID="home-vertical-feed"
              data={sectionData}
              keyExtractor={homeSectionKeyExtractor}
              renderItem={renderSectionItem}
              ListHeaderComponent={listHeader}
              ListEmptyComponent={loading ? <HomeLoadingSkeleton /> : undefined}
              style={styles.scroll}
              contentContainerStyle={contentContainerStyle}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              onScroll={scrollHandler}
              refreshControl={
                <RefreshControl
                  refreshing={pullRefreshing}
                  onRefresh={refreshHome}
                  enabled={isOnline}
                  tintColor={Colors.primary}
                  colors={[Colors.primary]}
                  progressBackgroundColor={Colors.surface}
                  progressViewOffset={topInset + (noticeVisible ? noticeHeight : 0) + UNIFIED_HEADER_TOTAL_HEIGHT}
                />
              }
              scrollEventThrottle={16}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              updateCellsBatchingPeriod={50}
              windowSize={5}
              removeClippedSubviews={Platform.OS !== "web"}
            />
          </View>
        );
      }

      return (
        <HomeNeighborCategoryPage
          pageWidth={pageWidth}
          label={page.label}
          sections={page.sections}
          explore={explore}
          hasReleases={page.hasReleases}
          isOnline={isOnline}
          retryExplore={retryExplore}
          retryYouTube={retryYouTube}
          youtube={youtube}
          playSong={playSong}
          displayedQuickPicks={page.quickPicks}
          recentlyPlayed={recentlyPlayed}
          loadingMainContent={loadingMainContent}
          publicPlaylists={variedPublicPlaylists}
          featuredArtists={variedArtists}
          refreshRevision={refreshRevision}
          listHeader={listHeader}
          loading={loading}
          contentContainerStyle={contentContainerStyle}
        />
      );
    },
    [
      activeCategoryIndex,
      attachHomeList,
      contentContainerStyle,
      explore,
      festivalTheme,
      isOnline,
      loading,
      loadingMainContent,
      noticeHeight,
      noticeSpacerStyle,
      noticeVisible,
      pageWidth,
      playSong,
      pullRefreshing,
      recentlyPlayed,
      refreshHome,
      refreshRevision,
      renderSectionItem,
      retryExplore,
      retryYouTube,
      scrollHandler,
      scrollY,
      sectionData,
      topInset,
      variedArtists,
      variedPublicPlaylists,
      youtube,
    ]
  );

  return (
    <View style={styles.pagerWrap} onLayout={onLayout}>
      <Animated.FlatList
        ref={pagerRef}
        testID="home-category-pager"
        data={pages}
        extraData={extraData}
        keyExtractor={homeCategoryPageKeyExtractor}
        renderItem={renderCategoryPage}
        getItemLayout={getItemLayout}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        overScrollMode="never"
        bounces={Platform.OS === "ios"}
        scrollEventThrottle={16}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
      />
    </View>
  );
});

function useHomeCategoryPager(
  scrollY: ReturnType<typeof useSharedValue<number>>,
  flatListRef: React.RefObject<FlatList<HomeListItem> | null>
) {
  const [selectedCategory, setSelectedCategory] = useState<MavrixfyCategory>("All");
  const navSwipe = useOptionalNavSwipe();
  const windowWidth = useWindowDimensions?.()?.width ?? 390;
  const [measuredPagerWidth, setMeasuredPagerWidth] = useState(0);
  const pageWidth = Math.max(1, measuredPagerWidth || windowWidth || 390);
  const activeCategoryIndex = getHomeCategoryIndex(MAVRIXFY_MUSIC_CATEGORIES, selectedCategory);
  const categoryProgress = useSharedValue(activeCategoryIndex);
  const pageWidthShared = useSharedValue(pageWidth);
  const pagerRef = useRef<any>(null);
  const lastSwipedIndexRef = useRef<number | null>(null);
  const pendingTargetIndexRef = useRef<number | null>(null);
  const isMomentumScrollingRef = useRef(false);
  const didContentAlignRef = useRef(false);
  const dragSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageScrollOffsetsRef = useRef<Record<string, number>>({});

  const handleCategoryPagerScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const width = pageWidthShared.value;
      if (width > 0) {
        categoryProgress.value = event.contentOffset.x / width;
      }
    },
  });

  const handleSelectCategory = useCallback(
    (category: MavrixfyCategory) => {
      if (category === selectedCategory) return;
      pageScrollOffsetsRef.current[selectedCategory] = scrollY.get();
      setSelectedCategory(category);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      pageScrollOffsetsRef.current[category] = 0;
      scrollY.set(0);
    },
    [flatListRef, scrollY, selectedCategory]
  );

  useEffect(() => {
    pageWidthShared.set(pageWidth);
  }, [pageWidth, pageWidthShared]);

  useEffect(() => {
    navSwipe?.setInnerPagerBoundary("index", {
      blockPrev: true,
      blockNext: activeCategoryIndex < MAVRIXFY_MUSIC_CATEGORIES.length - 1,
    });
  }, [navSwipe, activeCategoryIndex]);

  const scrollPagerTo = useCallback(
    (targetIndex: number, animated: boolean) => {
      if (pageWidth <= 1) return;
      pendingTargetIndexRef.current = animated ? targetIndex : null;
      const node = pagerRef.current;
      const scroller = node?.scrollToOffset ? node : node?.getNode?.();
      scroller?.scrollToOffset?.({
        offset: targetIndex * pageWidth,
        animated,
      });
    },
    [pageWidth]
  );

  useEffect(() => {
    if (lastSwipedIndexRef.current === activeCategoryIndex) {
      lastSwipedIndexRef.current = null;
      return;
    }
    const animate = didContentAlignRef.current;
    scrollPagerTo(activeCategoryIndex, animate);
    if (animate) {
      categoryProgress.set(withTiming(activeCategoryIndex, { duration: 220 }));
    } else {
      categoryProgress.set(activeCategoryIndex);
    }
  }, [activeCategoryIndex, pageWidth, categoryProgress, scrollPagerTo]);

  useEffect(() => {
    return () => {
      if (dragSettleTimerRef.current) {
        clearTimeout(dragSettleTimerRef.current);
        dragSettleTimerRef.current = null;
      }
    };
  }, []);

  const handlePagerContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      if (nextWidth > 0 && Math.abs(nextWidth - measuredPagerWidth) > 0.5) {
        setMeasuredPagerWidth(nextWidth);
      }
    },
    [measuredPagerWidth]
  );

  const handlePagerContentSizeChange = useCallback(() => {
    if (!didContentAlignRef.current && pageWidth > 1) {
      didContentAlignRef.current = true;
      scrollPagerTo(activeCategoryIndex, false);
      categoryProgress.set(activeCategoryIndex);
    }
  }, [activeCategoryIndex, categoryProgress, pageWidth, scrollPagerTo]);

  const commitPageOffset = useCallback(
    (offsetX: number) => {
      const settledIndex = resolveHomeSettledPageIndex(
        offsetX,
        pageWidth,
        MAVRIXFY_MUSIC_CATEGORIES.length
      );

      if (pendingTargetIndexRef.current !== null) {
        if (settledIndex === pendingTargetIndexRef.current) {
          pendingTargetIndexRef.current = null;
          return;
        }
        pendingTargetIndexRef.current = null;
      }

      if (settledIndex === activeCategoryIndex) return;

      lastSwipedIndexRef.current = settledIndex;
      const nextCategory = getHomeCategoryId(MAVRIXFY_MUSIC_CATEGORIES, settledIndex);
      setSelectedCategory(nextCategory);
      scrollY.set(0);
      const nextLabel = MAVRIXFY_MUSIC_CATEGORIES[settledIndex]?.label ?? nextCategory;
      AccessibilityInfo?.announceForAccessibility?.(`${nextLabel} category`);
    },
    [activeCategoryIndex, pageWidth, scrollY]
  );

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

  return {
    selectedCategory,
    setSelectedCategory,
    pageWidth,
    activeCategoryIndex,
    categoryProgress,
    pagerRef,
    handleSelectCategory,
    handleCategoryPagerScroll,
    handlePagerContainerLayout,
    handlePagerContentSizeChange,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScrollEndDrag,
  };
}

function useHomeCategoryPagesData(params: {
  activeCategoryIndex: number;
  catalogSections: ReturnType<typeof useHomeSectionData>;
  categories: any[];
  displayedQuickPicks: any[];
  exploreSections: any[];
  featuredArtists: ArtistCard[];
  loadingMainContent: boolean;
  preferredLanguages: any;
  publicPlaylists: any[];
  quickPickSongs: any[];
  quickPicksPool: any;
  recentlyPlayed: any[];
  refreshRevision: number;
  sectionData: HomeListItem[];
  youtubeSections: any[];
}) {
  const {
    activeCategoryIndex,
    catalogSections,
    categories,
    displayedQuickPicks,
    exploreSections,
    featuredArtists,
    loadingMainContent,
    preferredLanguages,
    publicPlaylists,
    quickPickSongs,
    quickPicksPool,
    recentlyPlayed,
    refreshRevision,
    sectionData,
    youtubeSections,
  } = params;

  return useMemo<HomeCategoryPageItem[]>(
    () =>
      MAVRIXFY_MUSIC_CATEGORIES.map((categoryItem, pageIndex) => {
        const mounted = isHomeCategoryPageMounted(pageIndex, activeCategoryIndex);
        if (!mounted) {
          return {
            category: categoryItem.id,
            label: categoryItem.label,
            mounted: false,
            sections: [],
            quickPicks: quickPickSongs,
            hasReleases: false,
          };
        }
        const isCurrent = pageIndex === activeCategoryIndex;
        const pageQuickPicks = isCurrent
          ? displayedQuickPicks
          : rotateDiscovery(
              (() => {
                const list = getQuickPicksForCategory(quickPicksPool, categoryItem.id);
                return categoryItem.id === "All" && list.length === 0 ? quickPickSongs : list;
              })(),
              refreshRevision
            );
        const pageCatalogSections = isCurrent
          ? catalogSections
          : buildHomeSectionItems({
              selectedCategory: categoryItem.id,
              categories,
              quickPickSongs: pageQuickPicks,
              recentlyPlayed,
              featuredArtists,
              publicPlaylists,
              loadingMainContent,
              includeCatalog: false,
            });
        const pageSections = isCurrent
          ? sectionData
          : varyHomeRows(
              buildHomeSections(
                categoryItem.id,
                isNativeHome,
                youtubeSections,
                pageCatalogSections,
                exploreSections,
                false,
                preferredLanguages
              ),
              refreshRevision
            );
        return {
          category: categoryItem.id,
          label: categoryItem.label,
          mounted: true,
          sections: pageSections,
          quickPicks: pageQuickPicks,
          hasReleases: pageSections.some(
            (row) => row.type === "youtube-section" && row.section.category === "new-releases"
          ),
        };
      }),
    [
      activeCategoryIndex,
      catalogSections,
      categories,
      displayedQuickPicks,
      exploreSections,
      featuredArtists,
      loadingMainContent,
      preferredLanguages,
      publicPlaylists,
      quickPickSongs,
      quickPicksPool,
      recentlyPlayed,
      refreshRevision,
      sectionData,
      youtubeSections,
    ]
  );
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { playSong } = usePlayerRowActions();
  const { isOnline, isChecking } = useNetwork();
  const [bannerConfig, setBannerConfig] = useState(getCachedMiniPlayerBannerConfig);
  useEffect(() => subscribeToMiniPlayerBannerConfig(setBannerConfig), []);
  const hasTopBanner = bannerConfig.enabled && bannerConfig.items.length > 0;
  const topInset = Math.max(0, insets.top);
  const [measuredNoticeHeight, setMeasuredNoticeHeight] = useState(0);
  const noticeHeight = hasTopBanner ? measuredNoticeHeight : 0;
  const handleNoticeLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height);
    if (height > 0) setMeasuredNoticeHeight(height);
  }, []);
  const flatListRef = useRef<FlatList<HomeListItem> | null>(null);
  const attachHomeList = useCallback((list: FlatList<HomeListItem> | null) => {
    flatListRef.current = list;
    globalHomeScrollRef.current = list;
  }, []);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const refreshInFlightRef = useRef(false);
  const youtube = useYouTubeHomeFeed();
  const { refetch: refetchYouTube, explore } = youtube;
  const { refetch: refetchExplore } = explore;

  const {
    categories,
    publicPlaylists,
    recentlyPlayed,
    featuredArtists: cachedArtists,
    quickPickSongs,
    quickPicksPool,
    preferredLanguages,
    loading,
    loadingMainContent,
    refreshing,
    hasContent,
    handleRefresh,
  } = useHomeFeedData({ compact: isNativeHome });
  const artistsQuery = useQuery({ queryKey: ["home", "youtube-artists-v1", ...(preferredLanguages || [])], queryFn: () => getFeaturedArtists({ preferredLanguages }),
    enabled: isOnline && isNativeHome, staleTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const { refetch: refetchArtists } = artistsQuery;
  const [storedArtists, setStoredArtists] = useState<ArtistCard[]>([]);
  useEffect(() => {
    if (!isNativeHome) return;
    let active = true;
    void getCachedFeaturedArtists().then(artists => { if (active) setStoredArtists(artists); });
    return () => { active = false; };
  }, []);
  const featuredArtists = useMemo(() => artistsQuery.data?.length ? artistsQuery.data :
    storedArtists.length ? storedArtists : cachedArtists || [], [artistsQuery.data, storedArtists, cachedArtists]);
  const hasVisibleContent = hasContent || featuredArtists.length > 0 || Boolean(youtube.data) || Boolean(explore.data);
  useAppShowcasePrompt(hasVisibleContent && !loadingMainContent && !refreshing && isOnline && !isChecking);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      scrollY.value = event.contentOffset.y;
    },
  });

  const pager = useHomeCategoryPager(scrollY, flatListRef);

  const displayedQuickPicks = useMemo(() => {
    const list = getQuickPicksForCategory(quickPicksPool, pager.selectedCategory);
    return rotateDiscovery(pager.selectedCategory === "All" && list.length === 0 ? quickPickSongs : list, refreshRevision);
  }, [quickPicksPool, pager.selectedCategory, quickPickSongs, refreshRevision]);

  const catalogSections = useHomeSectionData({
    selectedCategory: pager.selectedCategory,
    categories,
    quickPickSongs: displayedQuickPicks,
    recentlyPlayed,
    featuredArtists,
    publicPlaylists,
    loadingMainContent,
    includeCatalog: false,
  });
  const sectionData = useMemo(() => varyHomeRows(buildHomeSections(pager.selectedCategory, isNativeHome,
    youtube.data?.sections || [], catalogSections, explore.data?.sections || [], false, preferredLanguages), refreshRevision), [catalogSections, pager.selectedCategory, youtube.data?.sections, explore.data?.sections, refreshRevision, preferredLanguages]);
  const variedArtists = useMemo(() => rotateDiscovery(featuredArtists, refreshRevision), [featuredArtists, refreshRevision]);
  const variedPublicPlaylists = useMemo(() => rotateDiscovery(publicPlaylists, refreshRevision), [publicPlaylists, refreshRevision]);
  const hasReleases = sectionData.some(row => row.type === "youtube-section" && row.section.category === "new-releases");

  const homeCategoryPages = useHomeCategoryPagesData({
    activeCategoryIndex: pager.activeCategoryIndex,
    catalogSections,
    categories,
    displayedQuickPicks,
    exploreSections: explore.data?.sections || [],
    featuredArtists,
    loadingMainContent,
    preferredLanguages,
    publicPlaylists,
    quickPickSongs,
    quickPicksPool,
    recentlyPlayed,
    refreshRevision,
    sectionData,
    youtubeSections: youtube.data?.sections || [],
  });
  const retryYouTube = useCallback(() => { clearYouTubeHomeCache(); void refetchYouTube(); }, [refetchYouTube]);
  const retryExplore = useCallback(() => { clearYouTubeHomeCache(); void refetchExplore(); }, [refetchExplore]);
  const refreshHome = useCallback(async () => {
    if (!isOnline || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setPullRefreshing(true);
    try {
      if (isNativeHome) clearYouTubeHomeCache();
      await Promise.allSettled([
        handleRefresh(),
        ...(isNativeHome ? [
          clearFeaturedArtistsCache().then(() => refetchArtists()),
          refetchYouTube(), refetchExplore(),
        ] : []),
      ]);
      setRefreshRevision(value => value + 1);
    } finally {
      refreshInFlightRef.current = false;
      setPullRefreshing(false);
    }
  }, [handleRefresh, isOnline, refetchYouTube, refetchExplore, refetchArtists]);

  const renderSectionItem = useCallback(
    ({ item }: ListRenderItemInfo<HomeListItem>) => (
      <HomeFeedSectionRow
        item={item}
        explore={explore}
        hasReleases={hasReleases}
        isOnline={isOnline}
        retryExplore={retryExplore}
        retryYouTube={retryYouTube}
        youtube={youtube}
        playSong={playSong}
        displayedQuickPicks={displayedQuickPicks}
        recentlyPlayed={recentlyPlayed}
        loadingMainContent={loadingMainContent}
        publicPlaylists={variedPublicPlaylists}
        featuredArtists={variedArtists}
        refreshRevision={refreshRevision}
      />
    ),
    [
      explore,
      hasReleases,
      isOnline,
      retryExplore,
      retryYouTube,
      youtube,
      playSong,
      displayedQuickPicks,
      recentlyPlayed,
      loadingMainContent,
      variedPublicPlaylists,
      variedArtists,
      refreshRevision,
    ]
  );

  const festivalTheme = useFestivalTheme();
  const announcement = useHomeAnnouncement(bannerConfig, scrollY,
    noticeHeight > 0 && isOnline && !isChecking && hasVisibleContent && !loadingMainContent && !refreshing);
  const animatedNoticeHeight = useSharedValue(0);
  useEffect(() => {
    animatedNoticeHeight.value = withTiming(announcement.visible ? noticeHeight : 0, { duration: 260 });
  }, [announcement.visible, noticeHeight, animatedNoticeHeight]);
  const noticeSpacerStyle = useAnimatedStyle(() => ({ height: animatedNoticeHeight.value }));
  const noticeSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: animatedNoticeHeight.value - noticeHeight }],
  }));

  const contentContainerStyle = useMemo(
    () => [
      styles.scrollContent,
      {
        paddingTop: topInset + UNIFIED_HEADER_TOTAL_HEIGHT,
        paddingBottom: Math.max(insets.bottom, 0) + 140,
      },
    ],
    [insets.bottom, topInset]
  );

  if (!isOnline && !isChecking && !hasVisibleContent && !loading) {
    return <OfflineScreen />;
  }

  return (
    <MainTabSwipeSurface route="index" headerSwipeMaxY={topInset + (announcement.visible ? noticeHeight : 0) + 48}>
      <View style={styles.container}>
      {!isOnline && <OfflineBanner />}

      <HomeAmbientBackdrop
        themeConfig={festivalTheme}
        scrollY={scrollY}
      />

      <HomeUnifiedTopHeader
        topInset={topInset}
        selectedCategory={pager.selectedCategory}
        onSelectCategory={pager.handleSelectCategory}
        categoryProgress={pager.categoryProgress}
        scrollY={scrollY}
        themeConfig={festivalTheme}
        announcementHeight={animatedNoticeHeight}
        announcement={hasTopBanner ? (
          <Animated.View style={[styles.noticeClip, noticeSpacerStyle]} pointerEvents={announcement.visible ? "auto" : "none"}>
            <Animated.View style={noticeSlideStyle}>
              <View onLayout={handleNoticeLayout}>
                <HomeAnnouncementBanner
                  config={bannerConfig}
                  scrollY={scrollY}
                  hiddenAfter={noticeHeight}
                  presented={announcement.visible}
                  onDismiss={announcement.dismiss}
                  edgeBackgroundColor={festivalTheme?.enabled ? festivalTheme.themeAccentColor : undefined}
                />
              </View>
            </Animated.View>
          </Animated.View>
        ) : undefined}
      />

      <HomeCategoryPagerView
        pagerRef={pager.pagerRef}
        pages={homeCategoryPages}
        activeCategoryIndex={pager.activeCategoryIndex}
        pageWidth={pager.pageWidth}
        extraData={sectionData}
        onLayout={pager.handlePagerContainerLayout}
        onScroll={pager.handleCategoryPagerScroll}
        onContentSizeChange={pager.handlePagerContentSizeChange}
        onMomentumScrollBegin={pager.handleMomentumScrollBegin}
        onMomentumScrollEnd={pager.handleMomentumScrollEnd}
        onScrollEndDrag={pager.handleScrollEndDrag}
        attachHomeList={attachHomeList}
        sectionData={sectionData}
        renderSectionItem={renderSectionItem}
        scrollHandler={scrollHandler}
        pullRefreshing={pullRefreshing}
        refreshHome={refreshHome}
        isOnline={isOnline}
        topInset={topInset}
        noticeVisible={announcement.visible}
        noticeHeight={noticeHeight}
        noticeSpacerStyle={noticeSpacerStyle}
        festivalTheme={festivalTheme}
        scrollY={scrollY}
        loading={loading}
        loadingMainContent={loadingMainContent}
        contentContainerStyle={contentContainerStyle}
        explore={explore}
        retryExplore={retryExplore}
        retryYouTube={retryYouTube}
        youtube={youtube}
        playSong={playSong}
        recentlyPlayed={recentlyPlayed}
        variedPublicPlaylists={variedPublicPlaylists}
        variedArtists={variedArtists}
        refreshRevision={refreshRevision}
      />
      <AppShowcaseModal />
      </View>
    </MainTabSwipeSurface>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pagerWrap: {
    flex: 1,
  },
  listHeaderWrap: {
    position: "relative",
  },
  noticeClip: { overflow: "hidden" },
  overscrollFill: {
    position: "absolute",
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    zIndex: -1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
