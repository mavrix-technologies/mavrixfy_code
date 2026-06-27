export type SmartAutoplayMode =
  | "similar-trending"
  | "similar-only"
  | "artist-radio"
  | "mood-radio";

const MODE_LABELS: Record<SmartAutoplayMode, string> = {
  "similar-trending": "Mix Similar + Trending",
  "similar-only": "Similar Songs Only",
  "artist-radio": "Artist Radio Mode",
  "mood-radio": "Mood Radio Mode",
};

export function normalizeSmartAutoplayMode(value: unknown): SmartAutoplayMode {
  return value === "similar-only" ||
    value === "artist-radio" ||
    value === "mood-radio" ||
    value === "similar-trending"
    ? value
    : "similar-trending";
}

export function getSmartAutoplayModeLabel(mode: SmartAutoplayMode): string {
  return MODE_LABELS[mode];
}
