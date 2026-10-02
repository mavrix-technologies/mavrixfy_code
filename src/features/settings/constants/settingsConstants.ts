import { type AppSettings } from "@/lib/storage";
import { type Ionicons } from "@expo/vector-icons";

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

export const EQUALIZER_BANDS = ["60Hz", "150Hz", "400Hz", "1KHz", "2.4KHz", "15KHz"] as const;

export interface EqualizerPreset {
  id: string;
  name: string;
  bands: Record<string, number>;
}

const preset = (id: string, name: string, gains: number[]): EqualizerPreset => ({
  id,
  name,
  bands: Object.fromEntries(EQUALIZER_BANDS.map((band, index) => [band, gains[index]])),
});

export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  preset("acoustic", "Acoustic", [3, 2, 1, 1, 2, 2]),
  preset("bass-booster", "Bass Booster", [5, 3, 1, 0, 0, 0]),
  preset("bass-reducer", "Bass Reducer", [-5, -3, -1, 0, 0, 0]),
  preset("classical", "Classical", [3, 2, -1, 1, 2, 2]),
  preset("dance", "Dance", [4, 3, 1, 0, 2, 3]),
  preset("deep", "Deep", [4, 2, 0, 1, 1, -2]),
  preset("electronic", "Electronic", [3, 2, -1, 1, 2, 3]),
  preset("flat", "Flat", [0, 0, 0, 0, 0, 0]),
  preset("hip-hop", "Hip-Hop", [4, 2, 0, 1, 2, 2]),
  preset("jazz", "Jazz", [2, 2, -1, 1, 2, 2]),
  preset("latin", "Latin", [3, 2, 0, -1, 2, 3]),
  preset("loudness", "Loudness", [4, 2, -1, 0, 1, 3]),
  preset("lounge", "Lounge", [-2, 1, 2, 1, 0, -1]),
  preset("piano", "Piano", [2, 2, 0, 1, 2, 2]),
  preset("pop", "Pop", [-1, 1, 2, 2, 1, -1]),
  preset("r-and-b", "R&B", [3, 3, -1, 1, 2, 3]),
  preset("rock", "Rock", [4, 2, -1, 1, 2, 3]),
  preset("small-speakers", "Small Speakers", [4, 3, 1, 1, 0, -1]),
  preset("spoken-word", "Spoken Word", [-2, 0, 2, 3, 1, 0]),
  preset("treble-booster", "Treble Booster", [0, 0, 0, 1, 3, 5]),
  preset("treble-reducer", "Treble Reducer", [0, 0, 0, -1, -3, -5]),
  preset("vocal-booster", "Vocal Booster", [-1, 1, 2, 3, 2, 1]),
];

export function detectMatchingPreset(bands: Record<string, number>): string | null {
  return EQUALIZER_PRESETS.find((item) =>
    EQUALIZER_BANDS.every((band) => (bands[band] ?? 0) === item.bands[band])
  )?.id ?? null;
}
