import type { Song } from "@/lib/musicData";
import type { ResultFilter } from "@/lib/searchRepository";
import type { SearchHistoryItem } from "@/lib/storage";
import type Ionicons from "@expo/vector-icons/Ionicons";

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
  { key: "songs", label: "Songs" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
  { key: "playlists", label: "Playlists" },
];

export const CARD_ROTATION_PATTERN = [-11, 8, -7, 10, -5, 6] as const;

export function getRouteSearchQuery(params: { q?: string | string[]; name?: string | string[] }): string {
  const incomingQuery = Array.isArray(params.q)
    ? params.q[0]
    : params.q || (Array.isArray(params.name) ? params.name[0] : params.name);
  return String(incomingQuery || "").trim();
}

export function normalizeRecentSearchLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeSearchSuggestionList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const label = normalizeRecentSearchLabel(String(item || ""));
    const key = label.toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(label);
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
    color: "#8400e7",
    isHero: true,
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/9f/13/ca/9f13ca3b-e533-03e0-f19a-f0aaa774581d/196589311191.jpg/600x600bb.jpg",
  },
  {
    id: "punjabi",
    title: "Punjabi",
    color: "#e91429",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d3/08/bc/d308bc6a-20e1-6532-d933-35d1b429210e/5054197755538.jpg/600x600bb.jpg",
  },
  {
    id: "podcasts",
    title: "Podcasts",
    color: "#006450",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Podcasts116/v4/58/6e/a9/586ea984-3bf8-302e-a8fd-2e7b002044d2/mza_2944927475341717105.jpg/600x600bb.jpg",
  },
  {
    id: "indian_pop",
    title: "Indian Pop",
    color: "#148a08",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/8a/89/e4/8a89e445-d2c6-f8ac-a828-27818b0c1afe/859749638209_cover.jpg/600x600bb.jpg",
  },
  {
    id: "south_cinema",
    title: "South Cinema",
    color: "#bc5900",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/db/ad/5e/dbad5e8b-0bee-d962-92d4-021c90e375ac/8902894362092_cover.jpg/600x600bb.jpg",
  },
  {
    id: "desi_hiphop",
    title: "Desi Hip-Hop",
    color: "#e1118c",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d3/08/bc/d308bc6a-20e1-6532-d933-35d1b429210e/5054197755538.jpg/600x600bb.jpg",
  },
  {
    id: "romance",
    title: "Romance",
    color: "#dc148c",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/9f/13/ca/9f13ca3b-e533-03e0-f19a-f0aaa774581d/196589311191.jpg/600x600bb.jpg",
  },
  {
    id: "lofi_chill",
    title: "Lo-Fi Chill",
    color: "#503750",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/2e/0b/c0/2e0bc070-112f-a827-6ad8-6bc64f7caaff/840214460180.png/600x600bb.jpg",
  },
  {
    id: "devotional",
    title: "Devotional",
    color: "#27856a",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/ca/8f/1a/ca8f1a18-5a41-325f-2fc1-460395ee58fb/8902894356459_cover.jpg/600x600bb.jpg",
  },
  {
    id: "workout",
    title: "Workout",
    color: "#777777",
    imageUrl:
      "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/db/ad/5e/dbad5e8b-0bee-d962-92d4-021c90e375ac/8902894362092_cover.jpg/600x600bb.jpg",
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
