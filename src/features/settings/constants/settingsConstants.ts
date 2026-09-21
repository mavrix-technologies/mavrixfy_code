import { type Ionicons } from "@expo/vector-icons";
import { type AppSettings } from "@/lib/storage";

export const QUALITY_OPTIONS: { label: string; value: "auto" | "low" | "medium" | "high" }[] = [
  { label: "Auto", value: "auto" },
  { label: "96 kbps", value: "low" },
  { label: "160 kbps", value: "medium" },
  { label: "320 kbps", value: "high" },
];

export const SMART_AUTOPLAY_OPTIONS: { label: string; value: AppSettings["smartAutoplayMode"] }[] = [
  { label: "Auto Mix", value: "similar-trending" },
  { label: "Similar", value: "similar-only" },
  { label: "Artist", value: "artist-radio" },
  { label: "Mood", value: "mood-radio" },
];

export const MINI_PLAYER_OPTIONS: {
  label: string;
  value: AppSettings["miniPlayerSecondaryControl"];
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { label: "Queue", value: "queue", icon: "list" },
  { label: "Next", value: "next", icon: "play-skip-forward" },
  { label: "Prev", value: "prev", icon: "play-skip-back" },
  { label: "More", value: "more", icon: "ellipsis-horizontal" },
];

export const VIDEO_QUALITY_OPTIONS: {
  label: string;
  value: AppSettings["videoBackgroundQuality"];
}[] = [
  { label: "Auto", value: "auto" },
  { label: "360p", value: "low" },
  { label: "480p", value: "medium" },
  { label: "720p", value: "high" },
];

export const DOWNLOAD_QUALITY_OPTIONS: {
  label: string;
  value: AppSettings["downloadQuality"];
}[] = [
  { label: "96 kbps", value: "low" },
  { label: "160 kbps", value: "medium" },
  { label: "320 kbps", value: "high" },
];

export const CROSSFADE_OPTIONS: {
  label: string;
  value: number;
}[] = [
  { label: "Off", value: 0 },
  { label: "3s", value: 3 },
  { label: "5s", value: 5 },
  { label: "8s", value: 8 },
];


