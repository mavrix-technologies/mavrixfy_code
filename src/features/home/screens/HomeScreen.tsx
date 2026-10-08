import { useQuery } from "@tanstack/react-query";
import { getFeaturedArtists } from "@/data/providers/ArtistProvider";
import React,{ useCallback,useMemo,useRef,useState } from "react";

import Colors from "@/constants/colors";
import AdMobBanner from "@/components/AdMobBanner";
import OfflineBanner from "@/components/OfflineBanner";
import OfflineScreen from "@/components/OfflineScreen";
import { useNetwork } from "@/contexts/NetworkContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import {
FlatList,
Platform,
RefreshControl,
StyleSheet,
View,
type ListRenderItemInfo,
} from "react-native";
import Animated,{
useAnimatedScrollHandler,
useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getQuickPicksForCategory } from "@/data/providers/QuickPicksProvider";
import { FestivalHeaderBanner } from "../components/FestivalHeaderBanner";
import { HomeAmbientBackdrop } from "../components/HomeAmbientBackdrop";
import { HomeArtistsSection } from "../components/HomeArtistsSection";
import {
HomeHorizontalSection,
type HomeCardItem,
} from "../components/HomeHorizontalSection";
import { homeDisplayText } from "../components/homeDisplayText";
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
import {
HOME_CATEGORY_TITLES,
useHomeSectionData,

} from "../hooks/useHomeSectionData";

import { buildHomeSections, type HomeListItem } from "../hooks/buildHomeSections";
const homeSectionKeyExtractor = (item: HomeListItem) => item.id;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { playSong } = usePlayerActions();
  const { isOnline, isChecking } = useNetwork();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const flatListRef = useRef<FlatList<HomeListItem> | null>(null);
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
  } = useHomeFeedData({ compact: Platform.OS !== "web" });
  const artistsQuery = useQuery({ queryKey: ["home", "youtube-artists-v1"], queryFn: () => getFeaturedArtists(),
    enabled: isOnline && Platform.OS !== "web", staleTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const { refetch: refetchArtists } = artistsQuery;
  const featuredArtists = artistsQuery.data || cachedArtists;
  useAppShowcasePrompt((hasContent || Boolean(youtube.data)) && !loadingMainContent && !refreshing && isOnline && !isChecking);

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const prevCategoryRef = useRef<string>("All");

  const handleSelectCategory = useCallback((category: string) => {
    if (category === prevCategoryRef.current) return;
    prevCategoryRef.current = category;
    setSelectedCategory(category);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const displayedQuickPicks = useMemo(() => {
    const list = getQuickPicksForCategory(quickPicksPool, selectedCategory);
    return selectedCategory === "All" && list.length === 0 ? quickPickSongs : list;
  }, [quickPicksPool, selectedCategory, quickPickSongs]);

  const jioSectionData = useHomeSectionData({
    selectedCategory,
    categories,
    quickPickSongs: displayedQuickPicks,
    recentlyPlayed,
    featuredArtists,
    publicPlaylists,
    loadingMainContent,
  });
  const sectionData = useMemo(() => buildHomeSections(selectedCategory, Platform.OS !== "web",
    youtube.data?.sections || [], jioSectionData, explore.data?.sections || []), [jioSectionData, selectedCategory, youtube.data?.sections, explore.data?.sections]);
  const retryYouTube = useCallback(() => { clearYouTubeHomeCache(); void refetchYouTube(); }, [refetchYouTube]);
  const retryExplore = useCallback(() => { clearYouTubeHomeCache(); void refetchExplore(); }, [refetchExplore]);
  const refreshHome = useCallback(async () => {
    if (!isOnline || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setPullRefreshing(true);
    try {
      clearYouTubeHomeCache();
      await handleRefresh();
      await Promise.allSettled([refetchArtists(), ...(Platform.OS !== "web" ? [refetchYouTube(), refetchExplore()] : [])]);
    } finally {
      refreshInFlightRef.current = false;
      setPullRefreshing(false);
    }
  }, [handleRefresh, isOnline, refetchYouTube, refetchExplore, refetchArtists]);

  const renderSectionItem = useCallback(
    ({ item }: ListRenderItemInfo<HomeListItem>) => {
      let content: React.ReactNode = null;

      switch (item.type) {
        case "releases-status":
          content = <HomeYouTubeStatus hasFeed={Boolean(explore.data)} loading={explore.isFetching || (explore.isPending && isOnline)} failed={explore.isError} online={isOnline} onRetry={retryExplore} emptyMessage={explore.data && !sectionData.some(row => row.type === "youtube-section") ? "Nothing to show yet. Pull to refresh." : undefined} />;
          break;
        case "youtube-quick-picks":
          content = youtube.data?.songs.length
            ? <HomeQuickPicks songs={youtube.data.songs} playSong={playSong} />
            : youtube.isFetching && isOnline ? <HomeQuickPicksSkeleton /> : null;
          break;
        case "youtube-section":
          content = <HomeYouTubeContent section={item.section} />;
          break;
        case "youtube-status":
          content = <HomeYouTubeStatus hasFeed={Boolean(youtube.data)} loading={youtube.isFetching || (youtube.isPending && isOnline)} failed={youtube.isError} online={isOnline} onRetry={retryYouTube} />;
          break;
        case "quick-picks":
          content = (
            <HomeQuickPicks
              songs={displayedQuickPicks}
              playSong={playSong}
            />
          );
          break;
        case "loading-quick":
          content = <HomeQuickPicksSkeleton />;
          break;
        case "recently-played":
          content = <HomeRecentlyPlayed items={recentlyPlayed} playSong={playSong} />;
          break;
        case "category":
          content = (
            <React.Fragment>
              <HomeHorizontalSection
                title={homeDisplayText(HOME_CATEGORY_TITLES[item.category.id] || item.category.title)}
                items={item.category.results as unknown as HomeCardItem[]}
              />
              {item.showAd && !loadingMainContent ? (
                <AdMobBanner loadDelayMs={1200} />
              ) : null}
            </React.Fragment>
          );
          break;
        case "artists":
          content = <HomeArtistsSection artists={featuredArtists} />;
          break;
        case "public-playlists":
          content = (
            <HomeHorizontalSection
              title="Featured Playlists"
              items={publicPlaylists as unknown as HomeCardItem[]}
              isFirestore
            />
          );
          break;
        case "loading-main":
          content = <HomeSectionSkeleton />;
          break;
        default:
          content = null;
      }

      if (!content) return null;

      return <View key={item.id}>{content}</View>;
    },
    [
      displayedQuickPicks,
      featuredArtists,
      loadingMainContent,
      playSong,
      publicPlaylists,
      recentlyPlayed,
      youtube.data, youtube.isFetching, youtube.isPending, youtube.isError, isOnline, retryYouTube, explore.data, explore.isFetching, explore.isPending, explore.isError, retryExplore, sectionData,
    ]
  );

  const keyExtractor = homeSectionKeyExtractor;

  // Header and banner visibility track scrolling on the UI thread.
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      scrollY.value = event.contentOffset.y;
    },
  });

  const festivalTheme = useFestivalTheme();

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
        topInset={topInset}
        themeConfig={festivalTheme}
        scrollY={scrollY}
      />

      {/* ── Unified Header: Top Bar + Sticky Music Category Nav Rail ── */}
      <HomeUnifiedTopHeader
        topInset={topInset}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        scrollY={scrollY}
        themeConfig={festivalTheme}
      />

      {/* ── Home Content Scroll Layer (Animated FlatList running on UI Thread) ── */}
      <Animated.FlatList
        ref={flatListRef as any}
        data={sectionData}
        keyExtractor={keyExtractor}
        renderItem={renderSectionItem}
        ListHeaderComponent={
          festivalTheme?.enabled ? (
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
                contentTopOffset={topInset + UNIFIED_HEADER_TOTAL_HEIGHT}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={loading ? <HomeLoadingSkeleton /> : null}
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
            progressViewOffset={topInset + UNIFIED_HEADER_TOTAL_HEIGHT}
          />
        }
        scrollEventThrottle={16}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        windowSize={3}
        removeClippedSubviews={Platform.OS === "android"}
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
