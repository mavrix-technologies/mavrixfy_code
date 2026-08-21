import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  RefreshControl,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { type HomeJioSaavnCategoryData } from "@/data/providers/JioSaavnProvider";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderProfileButton,
  AppTopHeaderDownloadButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import AdMobBanner from "@/components/AdMobBanner";
import AppPromotionModal from "@/components/AppPromotionModal";
import { useNetwork } from "@/contexts/NetworkContext";
import {
  HomeLiquidGlassNav,
  HOME_TOP_MENU_HEIGHT,
} from "../components/HomeLiquidGlassNav";
import { HomeQuickPicks } from "../components/HomeQuickPicks";
import { HomeRecentlyPlayed } from "../components/HomeRecentlyPlayed";
import { HomeArtistsSection } from "../components/HomeArtistsSection";
import { HomeAmbientBackdrop } from "../components/HomeAmbientBackdrop";
import {
  HomeHorizontalSection,
  type HomeCardItem,
} from "../components/HomeHorizontalSection";
import { useHomeFeedData } from "../hooks/useHomeFeedData";
import { useArtworkPalette } from "@/lib/colorExtractor";

const HOME_CATEGORY_TITLES: Record<string, string> = {
  "new-arrivals": "New Releases",
  popular: "Most Popular",
  trending: "Trending Now",
  bollywood: "Bollywood Hits",
  "party-mix": "Party Mix",
  romance: "Love & Romance",
  "top-charts": "Official Biggest Hits",
};

type HomeSectionItem =
  | { id: "quick-picks"; type: "quick-picks" }
  | { id: "recently-played"; type: "recently-played" }
  | { id: string; type: "category"; category: HomeJioSaavnCategoryData; showAd: boolean }
  | { id: "artists"; type: "artists" }
  | { id: "public-playlists"; type: "public-playlists" }
  | { id: "loading-quick"; type: "loading-quick" }
  | { id: "loading-main"; type: "loading-main" };

function HomeQuickPicksSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonTitle} />
      <View style={styles.quickSkeletonGrid}>
        {[0, 1].map((column) => (
          <View key={`quick-skeleton-${column}`} style={styles.quickSkeletonColumn}>
            {[0, 1, 2, 3].map((row) => (
              <View key={`quick-skeleton-${column}-${row}`} style={styles.quickSkeletonRow}>
                <View style={styles.quickSkeletonCover} />
                <View style={styles.quickSkeletonTextBlock}>
                  <View style={styles.quickSkeletonLineWide} />
                  <View style={styles.quickSkeletonLineShort} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function HomeSectionSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[0, 1, 2].map((section) => (
        <View key={`section-skeleton-${section}`} style={styles.skeletonSection}>
          <View style={styles.skeletonTitle} />
          <View style={styles.cardSkeletonRow}>
            {[0, 1, 2].map((card) => (
              <View key={`section-skeleton-${section}-${card}`} style={styles.cardSkeleton}>
                <View style={styles.cardSkeletonImage} />
                <View style={styles.cardSkeletonLineWide} />
                <View style={styles.cardSkeletonLineShort} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function HomeLoadingSkeleton() {
  return (
    <>
      <HomeQuickPicksSkeleton />
      <HomeSectionSkeleton />
    </>
  );
}
export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetwork();
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
    loading,
    loadingMainContent,
    refreshing,
    hasContent,
    handleRefresh,
  } = useHomeFeedData();

  const { isHeaderElevated, elevationProgress, handleHeaderScroll } = useAppTopHeaderScrollElevation();
  const artworkPalette = useArtworkPalette(currentSong?.coverUrl);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const handleSelectCategory = useCallback((category: string) => {
    setSelectedCategory(category);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const sectionData = useMemo<HomeSectionItem[]>(() => {
    const items: HomeSectionItem[] = [];

    if (selectedCategory === "Recently Played") {
      if (recentlyPlayed.length > 0) items.push({ id: "recently-played", type: "recently-played" });
      return items;
    }

    if (selectedCategory === "Trending") {
      const trendingCat = categories.find((c) => c.id === "trending" || c.id === "popular");
      if (trendingCat) {
        items.push({ id: `cat-${trendingCat.id}`, type: "category", category: trendingCat, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      return items;
    }

    if (selectedCategory === "New Releases") {
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      const newArrivals = categories.find((c) => c.id === "new-arrivals");
      if (newArrivals) {
        items.push({ id: `cat-${newArrivals.id}`, type: "category", category: newArrivals, showAd: false });
      }
      return items;
    }

    if (selectedCategory === "Charts") {
      const chartsCat = categories.find((c) => c.id === "top-charts" || c.id === "popular");
      if (chartsCat) {
        items.push({ id: `cat-${chartsCat.id}`, type: "category", category: chartsCat, showAd: false });
      }
      return items;
    }

    if (selectedCategory === "Bollywood") {
      const bCat = categories.find((c) => c.id === "bollywood");
      if (bCat) {
        items.push({ id: `cat-${bCat.id}`, type: "category", category: bCat, showAd: false });
      }
      return items;
    }

    if (selectedCategory === "Romantic") {
      const rCat = categories.find((c) => c.id === "romance" || c.id === "party-mix");
      if (rCat) {
        items.push({ id: `cat-${rCat.id}`, type: "category", category: rCat, showAd: false });
      }
      return items;
    }

    // Default "All"
    if (quickPickSongs.length > 0) {
      items.push({ id: "quick-picks", type: "quick-picks" });
    } else if (loadingMainContent) {
      items.push({ id: "loading-quick", type: "loading-quick" });
    }
    if (recentlyPlayed.length > 0) items.push({ id: "recently-played", type: "recently-played" });
    if (featuredArtists.length > 0) items.push({ id: "artists", type: "artists" });

    categories.forEach((cat, idx) => {
      items.push({
        id: `cat-${cat.id}`,
        type: "category",
        category: cat,
        showAd: idx === 1,
      });
    });

    if (publicPlaylists.length > 0) items.push({ id: "public-playlists", type: "public-playlists" });
    const hasBelowRecentContent =
      featuredArtists.length > 0 ||
      categories.length > 0 ||
      publicPlaylists.length > 0;
    if (loadingMainContent && !hasBelowRecentContent) {
      items.push({ id: "loading-main", type: "loading-main" });
    }

    return items;
  }, [
    categories,
    featuredArtists.length,
    loadingMainContent,
    publicPlaylists.length,
    quickPickSongs.length,
    recentlyPlayed.length,
    selectedCategory,
  ]);

  const renderSectionItem = useCallback(
    ({ item }: ListRenderItemInfo<HomeSectionItem>) => {
      switch (item.type) {
        case "quick-picks":
          return (
            <HomeQuickPicks
              songs={quickPickSongs}
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

  const keyExtractor = useCallback((item: HomeSectionItem) => item.id, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleHeaderScroll(event);
    },
    [handleHeaderScroll]
  );

  const contentContainerStyle = useMemo(
    () => [
      styles.scrollContent,
      {
        paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 6,
        paddingBottom: 120,
      },
    ],
    [topInset]
  );

  if (!isOnline && !hasContent) {
    return <OfflineScreen />;
  }

  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner />}

      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        elevationProgress={elevationProgress}
        ambientColor={artworkPalette.accent}
        titleNode={
          <Text style={styles.appNameTitle}>MAVRIXFY</Text>
        }
        left={<AppTopHeaderProfileButton />}
        right={<AppTopHeaderDownloadButton />}
        rightWidth={44}
      />

      <FlatList
        ref={flatListRef}
        data={sectionData}
        keyExtractor={keyExtractor}
        renderItem={renderSectionItem}
        ListHeaderComponent={
          <View style={styles.listHeaderWrap}>
            <HomeAmbientBackdrop currentSong={currentSong} />
            <View style={styles.menuHeaderRow}>
              <HomeLiquidGlassNav
                selectedCategory={selectedCategory}
                onSelectCategory={handleSelectCategory}
                ambientColor={artworkPalette.accent}
              />
            </View>
          </View>
        }
        ListEmptyComponent={loading ? <HomeLoadingSkeleton /> : null}
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      />

      <AppPromotionModal />
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
    paddingBottom: 4,
  },
  menuHeaderRow: {
    marginBottom: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  appNameTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  skeletonContainer: {
    paddingBottom: 24,
  },
  skeletonSection: {
    marginTop: 20,
  },
  skeletonTitle: {
    width: 152,
    height: 22,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  quickSkeletonGrid: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  quickSkeletonColumn: {
    width: 340,
    gap: 8,
  },
  quickSkeletonRow: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    padding: 7,
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  quickSkeletonCover: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  quickSkeletonTextBlock: {
    flex: 1,
    gap: 8,
  },
  quickSkeletonLineWide: {
    width: "74%",
    height: 13,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  quickSkeletonLineShort: {
    width: "48%",
    height: 11,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cardSkeletonRow: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  cardSkeleton: {
    width: 148,
  },
  cardSkeletonImage: {
    width: 148,
    height: 148,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardSkeletonLineWide: {
    width: 118,
    height: 13,
    borderRadius: 5,
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardSkeletonLineShort: {
    width: 82,
    height: 11,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
