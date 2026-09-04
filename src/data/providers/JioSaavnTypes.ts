/**
 * JioSaavn public type definitions and static category data.
 * Extracted from JioSaavnProvider.ts to reduce module size.
 */

import { type JioSaavnImage, JioSaavnSong } from "@/lib/musicData";
import { getApiUrl } from "@/lib/api-config";

export interface JioSaavnPlaylistResult {
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

export interface JioSaavnAlbumResult {
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

export interface HomeJioSaavnCategory {
  id: string;
  title: string;
  searchTerms: string[];
}

export interface HomeJioSaavnCategoryData {
  id: string;
  title: string;
  results: JioSaavnPlaylistResult[];
}

export interface JioSaavnPlaylistDetailsData {
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

export interface JioSaavnPlaylistDetailsResponse {
  status: string;
  data: JioSaavnPlaylistResult;
}

export interface GetJioSaavnPlaylistDetailsOptions {
  loadAllPages?: boolean;
  preferCache?: boolean;
  link?: string;
}

export interface GetJioSaavnAlbumDetailsOptions {
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

const CURRENT_YEAR = new Date().getFullYear();

export const JIOSAAVN_CATEGORY_CACHE_TTL_MS = 30 * 60 * 1000;

export const HOME_JIOSAAVN_CATEGORIES: HomeJioSaavnCategory[] = [
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
