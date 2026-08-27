import { type Ionicons } from "@expo/vector-icons";
import { type AppSettings } from "@/lib/storage";

export const QUALITY_OPTIONS: { label: string; value: "low" | "medium" | "high" }[] = [
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
