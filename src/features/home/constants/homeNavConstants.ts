import Ionicons from "@expo/vector-icons/Ionicons";
import { type ComponentProps } from "react";

export type IoniconsName = ComponentProps<typeof Ionicons>["name"];

export interface MusicCategoryItem {
  id: string;
  label: string;
  focusedIcon: IoniconsName;
  unfocusedIcon: IoniconsName;
}

export const MAVRIXFY_MUSIC_CATEGORIES: readonly MusicCategoryItem[] = [
  { id: "All", label: "All", focusedIcon: "musical-notes", unfocusedIcon: "musical-notes-outline" },
  { id: "Songs", label: "Songs", focusedIcon: "musical-note", unfocusedIcon: "musical-note-outline" },
  { id: "Playlists", label: "Playlists", focusedIcon: "list", unfocusedIcon: "list-outline" },
  { id: "Albums", label: "Albums", focusedIcon: "disc", unfocusedIcon: "disc-outline" },
  { id: "New Releases", label: "New Releases", focusedIcon: "sparkles", unfocusedIcon: "sparkles-outline" },
  { id: "Recently Played", label: "Recent", focusedIcon: "time", unfocusedIcon: "time-outline" },
] as const;

export type MavrixfyCategory = string;
