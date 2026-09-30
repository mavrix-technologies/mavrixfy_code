/**
 * Music Catalog domain type definitions and static category metadata.
 * Clean, provider-agnostic catalog models for Mavrixfy App.
 */

import { type JioSaavnImage, type JioSaavnSong } from "@/lib/musicData";

export interface CatalogPlaylistResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
  url?: string;
  description?: string;
  language?: string;
  type?: string;
  songData?: any;
}

export interface CatalogAlbumResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
  year?: string;
  language?: string;
  url?: string;
  artist?: string;
  description?: string;
}

export interface CatalogCategory {
  id: string;
  title: string;
  searchTerms: string[];
}

export interface CatalogCategoryData {
  id: string;
  title: string;
  results: CatalogPlaylistResult[];
  isFresh?: boolean;
}

export interface CatalogPlaylistDetailsData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  year?: string;
  playCount?: number;
  language?: string;
  explicitContent?: boolean;
  songCount: number;
  url?: string;
  image: JioSaavnImage[] | string;
  songs: JioSaavnSong[];
}

export interface CatalogPlaylistDetailsResponse {
  status: string;
  data: CatalogPlaylistResult;
}

export interface GetCatalogPlaylistDetailsOptions {
  loadAllPages?: boolean;
  preferCache?: boolean;
  link?: string;
}

export interface GetCatalogAlbumDetailsOptions {
  link?: string;
  preferCache?: boolean;
}

export type AutoRefreshTimeSlot = "morning" | "afternoon" | "evening" | "night";

export interface AutoRefreshContext {
  timestamp: number;
  slot: AutoRefreshTimeSlot;
  isWeekend: boolean;
  languageBias: "hindi" | "punjabi" | "english";
  cacheFingerprint: string;
}

// Backward-compatibility aliases
export type JioSaavnPlaylistResult = CatalogPlaylistResult;
export type JioSaavnAlbumResult = CatalogAlbumResult;
export type HomeJioSaavnCategory = CatalogCategory;
export type HomeJioSaavnCategoryData = CatalogCategoryData;
export type JioSaavnPlaylistDetailsData = CatalogPlaylistDetailsData;
export type JioSaavnPlaylistDetailsResponse = CatalogPlaylistDetailsResponse;
export type GetJioSaavnPlaylistDetailsOptions = GetCatalogPlaylistDetailsOptions;
export type GetJioSaavnAlbumDetailsOptions = GetCatalogAlbumDetailsOptions;

const CURRENT_YEAR = new Date().getFullYear();

export const CATALOG_CATEGORY_CACHE_TTL_MS = 30 * 60 * 1000;
export const JIOSAAVN_CATEGORY_CACHE_TTL_MS = CATALOG_CATEGORY_CACHE_TTL_MS;

export const DEFAULT_CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    id: "trending",
    title: "Trending Now",
    searchTerms: [
      "trending hindi songs",
      "trending now bollywood",
      "popular songs india",
      "chartbusters hindi",
    ],
  },
  {
    id: "top-charts",
    title: "Official Biggest Hits",
    searchTerms: [
      `Chartbusters ${CURRENT_YEAR} Hindi`,
      `Pop Hits ${CURRENT_YEAR} Hindi`,
      `Dance Hits ${CURRENT_YEAR} Hindi`,
      `Romantic Hits ${CURRENT_YEAR} Hindi`,
      `Top Charts ${CURRENT_YEAR}`,
    ],
  },
  {
    id: "bollywood",
    title: "Bollywood Hits",
    searchTerms: [
      `Latest Bollywood ${CURRENT_YEAR}`,
      "Bollywood Central",
      `New Bollywood Songs ${CURRENT_YEAR}`,
      "Bollywood Top Hits",
    ],
  },
  {
    id: "new-arrivals",
    title: "New Releases",
    searchTerms: [
      `New Releases ${CURRENT_YEAR} Hindi`,
      `Latest Songs ${CURRENT_YEAR}`,
      `Chartbusters ${CURRENT_YEAR} Hindi`,
      `Trending Songs India ${CURRENT_YEAR}`,
    ],
  },
  {
    id: "most-viral",
    title: "Viral Hits",
    searchTerms: [
      "instagram reels songs",
      "youtube shorts trending songs",
      "reels viral songs",
      "social media hits",
    ],
  },
  {
    id: "popular",
    title: "Most Popular",
    searchTerms: [
      "most popular hindi songs",
      "popular bollywood hits",
      "top played indian songs",
      "hit songs bollywood",
    ],
  },
  {
    id: "party-mix",
    title: "Party Mix",
    searchTerms: [
      `Dance Hits ${CURRENT_YEAR} Hindi`,
      `Party Anthems ${CURRENT_YEAR}`,
      "Dance Party Hindi",
      "Party Songs Bollywood",
      "DJ Party Hits Hindi",
    ],
  },
  {
    id: "chill-vibes",
    title: "Chill Vibes",
    searchTerms: [
      "chill hindi songs",
      "lo-fi bollywood",
      "relaxing songs hindi",
      "soft hindi songs",
    ],
  },
  {
    id: "romance",
    title: "Love & Romance",
    searchTerms: [
      `Romantic Hits ${CURRENT_YEAR} Hindi`,
      "Love Songs Bollywood",
      `Valentine Songs ${CURRENT_YEAR}`,
      "Hindi Romantic Hits",
      "Best Love Songs Hindi",
    ],
  },
  {
    id: "workout",
    title: "Workout & Energy",
    searchTerms: [
      "workout songs hindi",
      "gym motivation songs",
      "high energy songs",
      "power songs",
    ],
  },
  {
    id: "retro",
    title: "Retro Classics",
    searchTerms: [
      "old hindi songs",
      "classic bollywood hits",
      "retro hindi songs",
      "evergreen songs",
    ],
  },
];

export const HOME_JIOSAAVN_CATEGORIES = DEFAULT_CATALOG_CATEGORIES;
