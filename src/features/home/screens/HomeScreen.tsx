import React, { useCallback, useMemo, useRef } from "react";
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
  AppTopHeaderProfileButton,
  AppTopHeaderDownloadButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import AdMobBanner from "@/components/AdMobBanner";
import AppPromotionModal from "@/components/AppPromotionModal";
import { useNetwork } from "@/contexts/NetworkContext";
import { HomeQuickPicks } from "../components/HomeQuickPicks";
import { HomeRecentlyPlayed } from "../components/HomeRecentlyPlayed";
import { HomeArtistsSection } from "../components/HomeArtistsSection";
import { HomeAmbientBackdrop } from "../components/HomeAmbientBackdrop";
import {
  HomeHorizontalSection,
  type HomeCardItem,
} from "../components/HomeHorizontalSection";
import { useHomeFeedData } from "../hooks/useHomeFeedData";

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
  | { id: "public-playlists"; type: "public-playlists" };

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
    refreshing,
    hasContent,
    handleRefresh,
  } = useHomeFeedData();

  const { isHeaderElevated, handleHeaderScroll } = useAppTopHeaderScrollElevation();

  const sectionData = useMemo<HomeSectionItem[]>(() => {
    const items: HomeSectionItem[] = [];

    if (quickPickSongs.length > 0) items.push({ id: "quick-picks", type: "quick-picks" });
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

    return items;
  }, [categories, featuredArtists.length, publicPlaylists.length, quickPickSongs.length, recentlyPlayed.length]);

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
        case "recently-played":
          return <HomeRecentlyPlayed items={recentlyPlayed} playSong={playSong} />;
        case "category":
          return (
            <React.Fragment>
              <HomeHorizontalSection
                title={HOME_CATEGORY_TITLES[item.category.id] || item.category.title}
                items={item.category.results as unknown as HomeCardItem[]}
              />
              {item.showAd ? <AdMobBanner /> : null}
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
        default:
          return null;
      }
    },
    [
      currentSong,
      currentSongId,
      featuredArtists,
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
      { paddingTop: topInset + 60, paddingBottom: 120 },
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
        ListHeaderComponent={<HomeAmbientBackdrop currentSong={currentSong} />}
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
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
});
