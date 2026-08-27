import { useMemo } from "react";
import { type HomeJioSaavnCategoryData } from "@/data/providers/JioSaavnProvider";
import { type Song } from "@/lib/musicData";
import { type RecentlyPlayedItem } from "@/lib/storage";
import { type ArtistCard } from "@/data/providers/ArtistProvider";
import { type FirestorePlaylist } from "@/lib/firestore";

export const HOME_CATEGORY_TITLES: Record<string, string> = {
  "new-arrivals": "New Releases",
  popular: "Most Popular",
  trending: "Trending Now",
  bollywood: "Bollywood Hits",
  "party-mix": "Party Mix",
  romance: "Love & Romance",
  "top-charts": "Official Biggest Hits",
  festive: "Festive Special",
  "lo-fi": "Lo-Fi & Chill",
};

export type HomeSectionItem =
  | { id: "quick-picks"; type: "quick-picks" }
  | { id: "recently-played"; type: "recently-played" }
  | { id: string; type: "category"; category: HomeJioSaavnCategoryData; showAd: boolean }
  | { id: "artists"; type: "artists" }
  | { id: "public-playlists"; type: "public-playlists" }
  | { id: "loading-quick"; type: "loading-quick" }
  | { id: "loading-main"; type: "loading-main" };

interface UseHomeSectionDataParams {
  selectedCategory: string;
  categories: HomeJioSaavnCategoryData[];
  quickPickSongs: Song[];
  recentlyPlayed: RecentlyPlayedItem[];
  featuredArtists: ArtistCard[];
  publicPlaylists: FirestorePlaylist[];
  loadingMainContent: boolean;
}

export function useHomeSectionData({
  selectedCategory,
  categories,
  quickPickSongs,
  recentlyPlayed,
  featuredArtists,
  publicPlaylists,
  loadingMainContent,
}: UseHomeSectionDataParams): HomeSectionItem[] {
  return useMemo<HomeSectionItem[]>(() => {
    const items: HomeSectionItem[] = [];

    // 1. RECENTLY PLAYED TAB
    if (selectedCategory === "Recently Played") {
      if (recentlyPlayed.length > 0) {
        items.push({ id: "recently-played", type: "recently-played" });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      if (featuredArtists.length > 0) {
        items.push({ id: "artists", type: "artists" });
      }
      return items;
    }

    // 2. TRENDING TAB
    if (selectedCategory === "Trending") {
      const trendingCat = categories.find((c) => c.id === "trending");
      const popularCat = categories.find((c) => c.id === "popular");
      if (trendingCat) {
        items.push({ id: `cat-${trendingCat.id}`, type: "category", category: trendingCat, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      if (popularCat && popularCat.id !== trendingCat?.id) {
        items.push({ id: `cat-${popularCat.id}`, type: "category", category: popularCat, showAd: false });
      }
      if (featuredArtists.length > 0) {
        items.push({ id: "artists", type: "artists" });
      }
      return items;
    }

    // 3. NEW RELEASES TAB
    if (selectedCategory === "New Releases") {
      const newArrivals = categories.find((c) => c.id === "new-arrivals");
      if (newArrivals) {
        items.push({ id: `cat-${newArrivals.id}`, type: "category", category: newArrivals, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      if (publicPlaylists.length > 0) {
        items.push({ id: "public-playlists", type: "public-playlists" });
      }
      return items;
    }

    // 4. CHARTS TAB
    if (selectedCategory === "Charts") {
      const chartsCat = categories.find((c) => c.id === "top-charts" || c.id === "popular");
      if (chartsCat) {
        items.push({ id: `cat-${chartsCat.id}`, type: "category", category: chartsCat, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      const trendingCat = categories.find((c) => c.id === "trending");
      if (trendingCat) {
        items.push({ id: `cat-${trendingCat.id}`, type: "category", category: trendingCat, showAd: false });
      }
      return items;
    }

    // 5. BOLLYWOOD TAB
    if (selectedCategory === "Bollywood") {
      const bCat = categories.find((c) => c.id === "bollywood");
      if (bCat) {
        items.push({ id: `cat-${bCat.id}`, type: "category", category: bCat, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      if (featuredArtists.length > 0) {
        items.push({ id: "artists", type: "artists" });
      }
      const romanceCat = categories.find((c) => c.id === "romance");
      if (romanceCat) {
        items.push({ id: `cat-${romanceCat.id}`, type: "category", category: romanceCat, showAd: false });
      }
      return items;
    }

    // 6. ROMANTIC TAB
    if (selectedCategory === "Romantic") {
      const rCat = categories.find((c) => c.id === "romance");
      if (rCat) {
        items.push({ id: `cat-${rCat.id}`, type: "category", category: rCat, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      if (publicPlaylists.length > 0) {
        items.push({ id: "public-playlists", type: "public-playlists" });
      }
      return items;
    }

    // 7. PARTY MIX TAB
    if (selectedCategory === "Party Mix") {
      const pCat = categories.find((c) => c.id === "party-mix");
      if (pCat) {
        items.push({ id: `cat-${pCat.id}`, type: "category", category: pCat, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      const bCat = categories.find((c) => c.id === "bollywood");
      if (bCat) {
        items.push({ id: `cat-${bCat.id}`, type: "category", category: bCat, showAd: false });
      }
      return items;
    }

    // 8. FESTIVE TAB
    if (selectedCategory === "Festive") {
      const pCat = categories.find((c) => c.id === "party-mix" || c.id === "bollywood");
      if (pCat) {
        items.push({ id: `cat-${pCat.id}`, type: "category", category: pCat, showAd: false });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      if (publicPlaylists.length > 0) {
        items.push({ id: "public-playlists", type: "public-playlists" });
      }
      return items;
    }

    // 9. LO-FI TAB
    if (selectedCategory === "Lo-Fi") {
      const lCat = categories.find((c) => c.id === "romance" || c.id === "new-arrivals");
      if (lCat) {
        items.push({ id: `cat-${lCat.id}`, type: "category", category: lCat, showAd: false });
      }
      if (publicPlaylists.length > 0) {
        items.push({ id: "public-playlists", type: "public-playlists" });
      }
      if (quickPickSongs.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      }
      return items;
    }

    // 10. DEFAULT "ALL" TAB (Full Rich Curation)
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
    featuredArtists,
    loadingMainContent,
    publicPlaylists,
    quickPickSongs,
    recentlyPlayed,
    selectedCategory,
  ]);
}
