export const MAVRIXFY_TOP_CATEGORIES = [
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
] as const;

export type MavrixfyCategory = (typeof MAVRIXFY_TOP_CATEGORIES)[number] | string;

export const HOME_TOP_MENU_HEIGHT = 44;
