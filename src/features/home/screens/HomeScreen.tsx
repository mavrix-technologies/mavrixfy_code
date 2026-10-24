import { useQuery } from "@tanstack/react-query";
import { getFeaturedArtists } from "@/data/providers/ArtistProvider";
import React,{ useCallback,useEffect,useMemo,useRef,useState } from "react";

import Colors from "@/constants/colors";
import AdMobBanner from "@/components/AdMobBanner";
import OfflineBanner from "@/components/OfflineBanner";
import OfflineScreen from "@/components/OfflineScreen";
import { useNetwork } from "@/contexts/NetworkContext";
import { usePlayerRowActions } from "@/contexts/PlayerContext";
import { globalHomeScrollRef } from "@/lib/homeScrollRef";
import {
FlatList,
Platform,
RefreshControl,
StyleSheet,
View,
type ListRenderItemInfo,
type LayoutChangeEvent,
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
useHomeSectionData,

} from "../hooks/useHomeSectionData";

import { buildHomeSections, type HomeListItem } from "../hooks/buildHomeSections";
import type { MavrixfyCategory } from "../constants/homeNavConstants";
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
}: HomeFeedItemProps) {
  switch (item.type) {
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
        ? youtube.data.songs
        : displayedQuickPicks;
      return quickSongs && quickSongs.length ? (
        <HomeQuickPicks songs={quickSongs} playSong={playSong} />
      ) : (youtube.isFetching && isOnline) ? (
        <HomeQuickPicksSkeleton />
      ) : null;
    }
    case "youtube-section":
      return <HomeYouTubeContent section={item.section} />;
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
    loading,
    loadingMainContent,
    refreshing,
    hasContent,
    handleRefresh,
  } = useHomeFeedData({ compact: isNativeHome });
  const artistsQuery = useQuery({ queryKey: ["home", "youtube-artists-v1"], queryFn: () => getFeaturedArtists(),
    enabled: isOnline && isNativeHome, staleTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const { refetch: refetchArtists } = artistsQuery;
  const featuredArtists = artistsQuery.data || cachedArtists;
  useAppShowcasePrompt((hasContent || Boolean(youtube.data)) && !loadingMainContent && !refreshing && isOnline && !isChecking);

  const [selectedCategory, setSelectedCategory] = useState<MavrixfyCategory>("All");
  const handleSelectCategory = useCallback((category: MavrixfyCategory) => {
    if (category === selectedCategory) return;
    setSelectedCategory(category);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [selectedCategory]);

  const displayedQuickPicks = useMemo(() => {
    const list = getQuickPicksForCategory(quickPicksPool, selectedCategory);
    return selectedCategory === "All" && list.length === 0 ? quickPickSongs : list;
  }, [quickPicksPool, selectedCategory, quickPickSongs]);

  const catalogSections = useHomeSectionData({
    selectedCategory,
    categories,
    quickPickSongs: displayedQuickPicks,
    recentlyPlayed,
    featuredArtists,
    publicPlaylists,
    loadingMainContent,
    includeCatalog: false,
  });
  const sectionData = useMemo(() => buildHomeSections(selectedCategory, isNativeHome,
    youtube.data?.sections || [], catalogSections, explore.data?.sections || [], false), [catalogSections, selectedCategory, youtube.data?.sections, explore.data?.sections]);
  const hasReleases = sectionData.some(row => row.type === "youtube-section" && row.section.category === "new-releases");
  const retryYouTube = useCallback(() => { clearYouTubeHomeCache(); void refetchYouTube(); }, [refetchYouTube]);
  const retryExplore = useCallback(() => { clearYouTubeHomeCache(); void refetchExplore(); }, [refetchExplore]);
  const refreshHome = useCallback(async () => {
    if (!isOnline || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setPullRefreshing(true);
    try {
      if (isNativeHome) clearYouTubeHomeCache();
      await Promise.allSettled([
        // The catalog refresh clears the artist provider cache before refetching.
        handleRefresh().then(() => isNativeHome ? refetchArtists() : undefined),
        ...(isNativeHome ? [refetchYouTube(), refetchExplore()] : []),
      ]);
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
        publicPlaylists={publicPlaylists}
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
    ]
  );

  // Header and banner visibility track scrolling on the UI thread.
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      scrollY.value = event.contentOffset.y;
    },
  });

  const festivalTheme = useFestivalTheme();
  const announcement = useHomeAnnouncement(bannerConfig, scrollY,
    noticeHeight > 0 && isOnline && !isChecking && (hasContent || Boolean(youtube.data)) && !loadingMainContent && !refreshing);
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

  if (!isOnline && !isChecking && !hasContent && !youtube.data && !explore.data && !loading) {
    return <OfflineScreen />;
  }

  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner />}

      {/* ── Ambient Backdrop: Moves naturally with feed on scroll (100% Native Reanimated) ── */}
      <HomeAmbientBackdrop
        themeConfig={festivalTheme}
        scrollY={scrollY}
      />

      {/* ── Unified Header: Notice + Top Bar + Sticky Music Category Nav Rail ── */}
      <HomeUnifiedTopHeader
        topInset={topInset}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
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

      {/* ── Home Content Scroll Layer (Animated FlatList running on UI Thread) ── */}
      <Animated.FlatList
        ref={attachHomeList}
        data={sectionData}
        keyExtractor={homeSectionKeyExtractor}
        renderItem={renderSectionItem}
        ListHeaderComponent={
          <View>
            <Animated.View style={noticeSpacerStyle} pointerEvents="none" />
            {festivalTheme?.enabled ? (
              <View style={styles.listHeaderWrap}>
                {/* Seamless Overscroll Background for Pull-Down Refresh:
                    Fills the space above the banner with themeAccentColor so there is never a black gap */}
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
                  scrollY={scrollY}
                  contentTopOffset={topInset + (announcement.visible ? noticeHeight : 0) + UNIFIED_HEADER_TOTAL_HEIGHT}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={loading ? <HomeLoadingSkeleton /> : undefined}
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
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
            progressViewOffset={topInset + (announcement.visible ? noticeHeight : 0) + UNIFIED_HEADER_TOTAL_HEIGHT}
          />
        }
        scrollEventThrottle={16}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
      />
      <AppShowcaseModal />
    </View>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
