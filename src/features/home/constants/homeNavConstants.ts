import { type ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";

export type IoniconsName = ComponentProps<typeof Ionicons>["name"];

export interface MusicCategoryItem {
  id: string;
  label: string;
  focusedIcon: IoniconsName;
  unfocusedIcon: IoniconsName;
}

export const MAVRIXFY_MUSIC_CATEGORIES: readonly MusicCategoryItem[] = [
  { id: "All", label: "All", focusedIcon: "musical-notes", unfocusedIcon: "musical-notes-outline" },
  { id: "Trending", label: "Trending", focusedIcon: "flame", unfocusedIcon: "flame-outline" },
  { id: "New Releases", label: "New Hits", focusedIcon: "sparkles", unfocusedIcon: "sparkles-outline" },
  { id: "Bollywood", label: "Bollywood", focusedIcon: "film", unfocusedIcon: "film-outline" },
  { id: "Romantic", label: "Romance", focusedIcon: "heart", unfocusedIcon: "heart-outline" },
  { id: "Charts", label: "Top Charts", focusedIcon: "trophy", unfocusedIcon: "trophy-outline" },
  { id: "Party Mix", label: "Party", focusedIcon: "disc", unfocusedIcon: "disc-outline" },
  { id: "Festive", label: "Festive Hits", focusedIcon: "bonfire", unfocusedIcon: "bonfire-outline" },
  { id: "Lo-Fi", label: "Lo-Fi", focusedIcon: "radio", unfocusedIcon: "radio-outline" },
  { id: "Recently Played", label: "Recent", focusedIcon: "time", unfocusedIcon: "time-outline" },
] as const;

const TOP_CATEGORIES = [
  "All",
  "Trending",
  "New Releases",
  "Made For You",
  "Recently Played",
  "Charts",
  "Hindi",
  "Bollywood",
  "Punjabi",
  "English",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Lo-Fi",
  "Romantic",
  "Festive",
] as const;

export type MavrixfyCategory = (typeof TOP_CATEGORIES)[number] | string;
