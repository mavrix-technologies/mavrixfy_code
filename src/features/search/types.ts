import { Ionicons } from "@expo/vector-icons";
import type { Song } from "@/lib/musicData";
import type { SearchHistoryItem } from "@/lib/storage";
import type { ResultFilter } from "@/lib/searchRepository";
import { normalizeText } from "@/lib/searchUtils";

export interface RecentSearchItem {
  id: string;
  label: string;
  subtitle?: string;
  imageUrl?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: "song" | "playlist" | "artist" | "query";
  song?: Song;
}

export interface BrowseCategory {
  id: string;
  title: string;
  color: string;
  imageUrl: string;
  isHero?: boolean;
}

export const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "artists", label: "Artists" },
  { key: "playlists", label: "Playlists" },
];

export const CARD_ROTATION_PATTERN = [-11, 8, -7, 10, -5, 6] as const;
export const ALBUM_STAGGER_PATTERN = [0, 7, 3, 9, 2, 5] as const;
export const ALBUM_TILT_PATTERN = [0.8, -1.0, 1.1, -0.7, 0.6, -0.9] as const;
export const PLAYLIST_STAGGER_PATTERN = [0, 8, 4, 10, 2, 6] as const;
export const PLAYLIST_TILT_PATTERN = [-1.1, 0.9, -0.8, 1.2, -0.6, 0.8] as const;
export const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icon.png");
export const MAX_SEARCH_SUGGESTIONS = 8;

export function getRouteSearchQuery(params: { q?: string | string[]; name?: string | string[] }): string {
  const incomingQuery = Array.isArray(params.q)
    ? params.q[0]
    : params.q || (Array.isArray(params.name) ? params.name[0] : params.name);
  return String(incomingQuery || "").trim();
}

export function normalizeRecentSearchLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeSearchSuggestionList(query: string, items: string[]): string[] {
  const normalizedQuery = normalizeText(query);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const label = normalizeRecentSearchLabel(String(item || ""));
    const key = normalizeText(label);
    if (!key || key.length < 2 || key === normalizedQuery || seen.has(key)) continue;

    seen.add(key);
    out.push(label);
    if (out.length >= MAX_SEARCH_SUGGESTIONS) break;
  }

  return out;
}

export function toRecentSearchItem(item: SearchHistoryItem): RecentSearchItem {
  if (item.type === "song" && item.song) {
    return {
      id: item.id,
      label: item.label,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl || item.song.coverUrl,
      type: "song",
      song: item.song,
    };
  }

  return {
    id: item.id,
    label: item.label,
    type: "query",
    icon: "search",
  };
}

export function toRecentSearchItems(items: SearchHistoryItem[]): RecentSearchItem[] {
  return items.map(toRecentSearchItem);
}

export const STITCH_BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: "bollywood",
    title: "Bollywood",
    color: "#5203D5",
    isHero: true,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDF65iTajyxJ3pY_3UEgaEW904AIU2tgjMxR5nFVYA-a4pMW61Kv8YDwfMgptSw3ucmCvM1KahK-8SJ1uh3RB_pXxlJbGvdq6-zw277CJj1UUhPTeUNpmTYkdwKvLKpFcricdxCBw8Z6UTISEL6keZa5GWMv4vjHlGOpMuTw8_GZF-pmQvE3_kEQSk5RIrhD6dB5uDLIPrxgpgh8fBQk2z9ORzDfj1FqWnlXAl9DqmYpuygexks2zhfYCb2Pm8NIgCA8ga2fOz9Tok",
  },
  {
    id: "pop",
    title: "Pop",
    color: "#006450",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCZIhRFtHlrYaSCGix2eKc62r5E2OGJmi4Mr-bozt_oxoy55OJw0TkuTaeteOmFnfFONc7_XzQVPGli7S-7IJKcgBk4TpnK6EWRMHlbrc0trTsyl7hKAHWH4UgU3B7bw1ZrGHjxWQYVi6k_e-fjUyVunPndYiCeaOkaNv0W2J8A4VQpg1ApyKZChtYlKbZozPO6BZ_Hq85UkZYIDUMzlJI_wyklKcbdkvGMTcyFrk8LWKZxphmy3ae1Pqiv92T7icXwqznnLT588ZI",
  },
  {
    id: "hip-hop",
    title: "Hip-Hop",
    color: "#BA5D07",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD2KE4nLxpvF1LiA-NnK3zqUt5OwAyWqDLbv_rY9LGLUo1d3v7KDYVFHZFcdedYGc5vYOG3YsIyk3P_z8S6seI84xHk5lc8gsq6ciHOH319bfM-rLiKhULw3q2ZnAPo0OPNWkqqCqe7n-M6WepbtMG8L15wNXx875FRsHQGf2iZ2kiHID4B38IjGR1YprFRntfDQbkORI0ntzMg2ZtTk6HojgBnBrO_5J4gJSbZrmlqp-H4D6rGADt9vp1Fz_CDmu-OqTYEXqMvAwo",
  },
  {
    id: "rock",
    title: "Rock",
    color: "#E8115B",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBRgyg4EDVFPBmagvQ0AY014mXu54WLUXwlGXxC8n_HEvNhBFgo5hOuMr6J6vRIoWFhrdYTMNA38g4lsukc6ZjN2ajd8D-eXvyhUuAfSjRz-XXRpWVFaIJh3sTVWpxr5XJbg4EEpWZg9R8gAoEntObreXkfAgPald-vwI8sxI4kvO1R3ncM_t-eyK-BKsSaLOUh0nOjBzwMuJq8ycLTpYIabDLhWMjmilC20GzVrQq_JL6IJieFb_AKGwj-6kaKK0CUqtnPVhsC9-A",
  },
  {
    id: "indie",
    title: "Indie",
    color: "#608108",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBMB3olxHY8oMxn-jGk7VtkK2hD6B8iQI4KFypQfJqwp7y2A8bdDsOtVvg5TVl5hy4b3AAw6yEtky0N9OyCyXEfmQl923IQF0J_WjH1-0FmSowMuo6j0FvfuI1t1aAZ6wFi7nHmStnAJEtO5mWqPaQwZQQM4QFy-QnFBu11xQYWsAMnhJBYY6duROuq7te-xhHLZn5Vx15fjXEKwTkFXH1jxLjgc-KiX0_oTl6G84EImZC6gMMKeu6JxDHbuPCnVHtrZD3kO06p7Ko",
  },
  {
    id: "jazz",
    title: "Jazz",
    color: "#1E3264",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD9ZgG99z-1Gv7n0qQ6a1g9h6K8q8Xn5w3-e8q0l8v6l3g2l7w0v5k0w6a8d8q3d3e8q1l3g0k3a4j7l3l8v3d9k0k7w8q2l0d7l3k7a8q6e2k3",
  },
];

export function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
