import { type ArtistCard } from "@/data/providers/ArtistProvider";
import { type CatalogCategoryData } from "@/data/providers/MusicCatalogProvider";
import { type FirestorePlaylist } from "@/lib/firestore";
import { type Song } from "@/lib/musicData";
import { type RecentlyPlayedItem } from "@/lib/storage";
import { useMemo } from "react";
import type { MavrixfyCategory } from "../constants/homeNavConstants";

export const HOME_CATEGORY_TITLES: Record<string, string> = {
  spotify: "Top Hits & Trending",
  "spotify-mixes": "Made For You & Daily Mixes",
  "spotify-moods": "Moods & Party Anthems",
  "new-arrivals": "New Releases",
  "new-releases": "New Releases",
  popular: "Most Popular",
  trending: "Trending Now",
  charts: "Top Charts",
  "top-charts": "Official Biggest Hits",
  "fresh-hits": "Fresh Hits",
  editorial: "Editorial Picks",
  moods: "Top Genres & Moods",
  bollywood: "Bollywood Hits",
  "party-mix": "Party Mix",
  romance: "Love & Romance",
  "chill-vibes": "Lo-Fi & Chill",
  festive: "Festive Special",
  "lo-fi": "Lo-Fi & Chill",
};

export type HomeSectionItem =
  | { id: "quick-picks"; type: "quick-picks" }
  | { id: "recently-played"; type: "recently-played" }
  | { id: string; type: "category"; category: CatalogCategoryData; showAd: boolean }
  | { id: "artists"; type: "artists" }
  | { id: "public-playlists"; type: "public-playlists" }
  | { id: "loading-quick"; type: "loading-quick" }
  | { id: "loading-main"; type: "loading-main" };

interface UseHomeSectionDataParams {
  selectedCategory: MavrixfyCategory;
  categories: CatalogCategoryData[];
  quickPickSongs: Song[];
  recentlyPlayed: RecentlyPlayedItem[];
  featuredArtists: ArtistCard[];
  publicPlaylists: FirestorePlaylist[];
  loadingMainContent: boolean;
  includeCatalog?: boolean;
}

export function useHomeSectionData({
  selectedCategory,
  categories,
  quickPickSongs,
  recentlyPlayed,
  featuredArtists,
  publicPlaylists,
  loadingMainContent,
  includeCatalog,
}: UseHomeSectionDataParams): HomeSectionItem[] {
  return useMemo<HomeSectionItem[]>(() => {
    const hasSpotify = categories.some((c) => c.id?.startsWith("spotify"));
    const showCatalog = includeCatalog ?? !hasSpotify;
    const filteredCategories = categories.filter(cat => cat.id?.startsWith("spotify") || showCatalog);
    const filteredQuickPicks = showCatalog ? quickPickSongs : [];
    const filteredArtists = featuredArtists;
    const filteredRecent = recentlyPlayed;
    const filteredPublicPlaylists = publicPlaylists;
    const items: HomeSectionItem[] = [];

    if (selectedCategory === "Recently Played") {
      if (filteredRecent.length > 0) {
        items.push({ id: "recently-played", type: "recently-played" });
      }
      if (filteredArtists.length > 0) {
        items.push({ id: "artists", type: "artists" });
      }
      return items;
    }

    if (selectedCategory === "New Releases") {
      const newArrivals = filteredCategories.find((c) => c.id === "new-releases" || c.id === "new-arrivals");
      if (newArrivals) {
        items.push({ id: `cat-${newArrivals.id}`, type: "category", category: newArrivals, showAd: false });
      }
      if (filteredQuickPicks.length > 0) {
        items.push({ id: "quick-picks", type: "quick-picks" });
      } else if (loadingMainContent) {
        items.push({ id: "loading-quick", type: "loading-quick" });
      }
      if (filteredPublicPlaylists.length > 0) {
        items.push({ id: "public-playlists", type: "public-playlists" });
      }
      return items;
    }

    if (filteredQuickPicks.length > 0) {
      items.push({ id: "quick-picks", type: "quick-picks" });
    } else if (loadingMainContent) {
      items.push({ id: "loading-quick", type: "loading-quick" });
    }
    if (filteredRecent.length > 0) items.push({ id: "recently-played", type: "recently-played" });
    if (selectedCategory === "All" && filteredArtists.length > 0) items.push({ id: "artists", type: "artists" });

    filteredCategories.forEach((cat, idx) => {
      items.push({
        id: `cat-${cat.id}`,
        type: "category",
        category: cat,
        showAd: idx === 1,
      });
    });

    if (filteredPublicPlaylists.length > 0) items.push({ id: "public-playlists", type: "public-playlists" });
    const hasBelowRecentContent =
      featuredArtists.length > 0 ||
      filteredCategories.length > 0 ||
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
    includeCatalog,
  ]);
}
