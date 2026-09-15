import React, { useCallback, useMemo, useRef, useState } from "react";

import {
  View,
  StyleSheet,
  Platform,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  runOnJS,
} from "react-native-reanimated";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { useNetwork } from "@/contexts/NetworkContext";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import AdMobBanner from "@/components/AdMobBanner";
import * as Haptics from "expo-haptics";
import { triggerImpact } from "@/lib/haptics";

import { HomeQuickPicks } from "../components/HomeQuickPicks";
import { HomeRecentlyPlayed } from "../components/HomeRecentlyPlayed";
import { HomeArtistsSection } from "../components/HomeArtistsSection";
import { HomeAmbientBackdrop } from "../components/HomeAmbientBackdrop";
import { FestivalHeaderBanner } from "../components/FestivalHeaderBanner";
import {
  HomeUnifiedTopHeader,
  UNIFIED_HEADER_TOTAL_HEIGHT,
} from "../components/HomeUnifiedTopHeader";
import { MavrixfyRefreshIndicator } from "../components/MavrixfyRefreshIndicator";
import {
  HomeHorizontalSection,
  type HomeCardItem,
} from "../components/HomeHorizontalSection";
import {
  HomeQuickPicksSkeleton,
  HomeSectionSkeleton,
  HomeLoadingSkeleton,
} from "../components/HomeSkeletons";
import { useHomeFeedData } from "../hooks/useHomeFeedData";
import { useFestivalTheme } from "../hooks/useFestivalTheme";
import { getQuickPicksForCategory } from "@/data/providers/QuickPicksProvider";
import {
  useHomeSectionData,
  HOME_CATEGORY_TITLES,
  type HomeSectionItem,
} from "../hooks/useHomeSectionData";

const homeSectionKeyExtractor = (item: HomeSectionItem) => item.id;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { isOnline, isChecking } = useNetwork();
  const { playSong, currentSong } = usePlayerBrowse();
  const currentSongId = currentSong?.id || null;
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const flatListRef = useRef<FlatList<HomeSectionItem> | null>(null);

  const {
    categories,
    publicPlaylists,
    recentlyPlayed,
    featuredArtists,
    quickPickSongs,
    quickPicksPool,
    loading,
    loadingMainContent,
    refreshing,
    hasContent,
    handleRefresh,
  } = useHomeFeedData();

  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const handleSelectCategory = useCallback((category: string) => {
    setSelectedCategory(category);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const displayedQuickPicks = useMemo(() => {
    const list = getQuickPicksForCategory(quickPicksPool, selectedCategory);
    return list.length > 0 ? list : quickPickSongs;
  }, [quickPicksPool, selectedCategory, quickPickSongs]);

  const sectionData = useHomeSectionData({
    selectedCategory,
    categories,
    quickPickSongs: displayedQuickPicks,
    recentlyPlayed,
    featuredArtists,
    publicPlaylists,
    loadingMainContent,
  });

  const renderSectionItem = useCallback(
    ({ item }: ListRenderItemInfo<HomeSectionItem>) => {
      switch (item.type) {
        case "quick-picks":
          return (
            <HomeQuickPicks
              songs={displayedQuickPicks}
              currentSongId={currentSongId}
              currentSong={currentSong}
              playSong={playSong}
            />
          );
        case "loading-quick":
          return <HomeQuickPicksSkeleton />;
        case "recently-played":
          return <HomeRecentlyPlayed items={recentlyPlayed} playSong={playSong} />;
        case "category":
          return (
            <React.Fragment>
              <HomeHorizontalSection
                title={HOME_CATEGORY_TITLES[item.category.id] || item.category.title}
                items={item.category.results as unknown as HomeCardItem[]}
              />
              {item.showAd && !loadingMainContent ? (
                <AdMobBanner loadDelayMs={1200} />
              ) : null}
            </React.Fragment>
          );
        case "artists":
          return <HomeArtistsSection artists={featuredArtists} />;
        case "public-playlists":
          return (
            <HomeHorizontalSection
              title="Featured Playlists"
              items={publicPlaylists as unknown as HomeCardItem[]}
              isFirestore
            />
          );
        case "loading-main":
          return <HomeSectionSkeleton />;
        default:
          return null;
      }
    },
    [
      currentSong,
      currentSongId,
      featuredArtists,
      loadingMainContent,
      playSong,
      publicPlaylists,
      quickPickSongs,
      recentlyPlayed,
    ]
  );

  const keyExtractor = homeSectionKeyExtractor;

  // 100% UI-Thread Reanimated SharedValues for 60/120 FPS native scrolling
  const scrollY = useSharedValue(0);
  const pullProgress = useSharedValue(0);
  const hasTriggeredPullHapticRef = useRef(false);

  const triggerHaptic = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      const offsetY = event.contentOffset.y;
      scrollY.value = offsetY;

      if (offsetY < 0) {
        const progress = Math.min(1, Math.max(0, -offsetY / 68));
        pullProgress.value = progress;

        // Tactile haptic tick when reaching full pull stretch threshold
        if (progress >= 0.95 && !hasTriggeredPullHapticRef.current) {
          hasTriggeredPullHapticRef.current = true;
          runOnJS(triggerHaptic)();
        } else if (progress < 0.5) {
          hasTriggeredPullHapticRef.current = false;
        }
      } else if (pullProgress.value > 0) {
        pullProgress.value = 0;
        hasTriggeredPullHapticRef.current = false;
      }
    },
  });

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (event.nativeEvent.contentOffset.y < -55 && !refreshing) {
        void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
        void handleRefresh();
      }
    },
    [handleRefresh, refreshing]
  );

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

  if (!isOnline && !isChecking && !hasContent) {
    return <OfflineScreen />;
  }

  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner />}

      {/* ── Ambient Backdrop: Moves naturally with feed on scroll (100% Native Reanimated) ── */}
      <HomeAmbientBackdrop
        currentSong={currentSong}
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

      {/* ── Dedicated Mavrixfy Reanimated Refresh Indicator (Top Visual Overlay) ── */}
      <MavrixfyRefreshIndicator
        progress={pullProgress}
        refreshing={refreshing}
        topOffset={topInset + UNIFIED_HEADER_TOTAL_HEIGHT + 6}
        color={festivalTheme?.enabled ? (festivalTheme.activeColor || "#FFFFFF") : undefined}
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
              <FestivalHeaderBanner themeConfig={festivalTheme} />
            </View>
          ) : null
        }
        ListEmptyComponent={loading ? <HomeLoadingSkeleton /> : null}
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={16}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
      />
    </View>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F14",
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
