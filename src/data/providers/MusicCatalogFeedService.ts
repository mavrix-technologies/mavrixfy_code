/**
 * Music Catalog Feed Service.
 * Reads published homepage catalog modules (trending, charts, new releases, editorial picks).
 */

import { convertJioSaavnSong, type JioSaavnSong, type Song } from "@/lib/musicData";
import { fetchWithTimeout } from "@/utils/asyncUtils";
import { getCatalogSearchBaseUrls, mapHomepageItemToPlaylistResult } from "./MusicCatalogNormalizers";
import type { CatalogCategoryData, CatalogPlaylistResult } from "./MusicCatalogTypes";

type HomeModuleItem = {
  id?: string;
  type?: string;
  title?: string | { text?: string; action?: string };
  name?: string;
  perma_url?: string;
  url?: string;
  action?: string;
  image?: any;
  subtitle?: any;
  be_subtitle?: any;
  songCount?: number;
  song_count?: number;
  count?: number;
  language?: string;
};

type HomeModule = {
  key?: string;
  title?: string;
  data?: HomeModuleItem[];
};

export interface OfficialSongRef {
  id: string;
  url?: string;
}

export interface OfficialHomeFeed {
  categories: CatalogCategoryData[];
  songs: OfficialSongRef[];
  songIds: string[];
}

const HOME_URL = "https://www.jiosaavn.com/";
const HOME_CACHE_MS = 10 * 60 * 1000;
const SECTIONS = [
  { id: "trending", title: "Trending Now", key: "new_trending" },
  { id: "charts", title: "Top Charts", key: "charts" },
  { id: "most-viral", title: "Viral Hits", titlePattern: /\b(viral|reels)\b/i },
  { id: "new-releases", title: "New Releases", key: "new_albums" },
  { id: "fresh-hits", title: "Fresh Hits", titleMatch: "Fresh Hits" },
  { id: "editorial", title: "Editorial Picks", key: "top_playlists" },
  { id: "moods", title: "Top Genres & Moods", titleMatch: "Top Genres & Moods" },
] as const;

let cachedFeed: OfficialHomeFeed | null = null;
let cachedAt = 0;

/** Read the JSON homeView object embedded in the server-rendered catalog homepage. */
export function parseOfficialHomeModules(html: string): HomeModule[] {
  const stateAt = html.indexOf("window.__INITIAL_DATA__");
  const markerAt = html.indexOf('"homeView":', stateAt);
  if (stateAt < 0 || markerAt < 0) return [];

  const start = html.indexOf("{", markerAt + '"homeView":'.length);
  if (start < 0) return [];

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) {
      try {
        const rawJson = html.slice(start, index + 1).replace(/:\s*undefined([,\}])/g, ":null$1");
        const home = JSON.parse(rawJson) as { modules?: HomeModule[] };
        return Array.isArray(home.modules) ? home.modules : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}

const VALID_FEED_TYPES = new Set(["song", "album", "album_playlist", "playlist"]);

export function buildOfficialHomeFeed(modules: HomeModule[]): OfficialHomeFeed {
  const usedIds = new Set<string>();
  const categories = SECTIONS.flatMap((section) => {
    const module = modules.find((item) =>
      "key" in section ? item.key === section.key
        : "titlePattern" in section ? section.titlePattern.test(item.title ?? "")
        : item.title === section.titleMatch
    );
    const results: CatalogPlaylistResult[] = [];
    for (const item of module?.data ?? []) {
      if (results.length >= 12) break;
      if (!item || !VALID_FEED_TYPES.has(item.type ?? "")) continue;
      const mapped = mapHomepageItemToPlaylistResult(item);
      const key = `${mapped.type}:${mapped.id}`;
      if (!mapped.id || !mapped.url || usedIds.has(key)) continue;
      usedIds.add(key);
      results.push(mapped);
    }
    return results.length > 0 ? [{ id: section.id, title: section.title, results }] : [];
  });

  const releaseModules = modules.filter((item) =>
    item.key === "new_albums" || /^New Releases Pop/i.test(item.title ?? "")
  );

  const seen = new Set<string>();
  const songs: OfficialSongRef[] = [];
  for (const module of releaseModules) {
    for (const item of module.data ?? []) {
      if (item && item.type === "song" && item.id && !seen.has(String(item.id))) {
        seen.add(String(item.id));
        const rawPath =
          item.perma_url ||
          item.url ||
          (typeof item.title === "object" ? item.title?.action : "") ||
          item.action ||
          "";
        const url = rawPath.startsWith("/") ? `https://www.jiosaavn.com${rawPath}` : rawPath;
        songs.push({ id: String(item.id), url: url || undefined });
      }
    }
  }

  const songIds = songs.map((s) => s.id);
  return { categories, songs, songIds };
}

export async function getOfficialHomeFeed(forceRefresh = false): Promise<OfficialHomeFeed> {
  if (!forceRefresh && cachedFeed && Date.now() - cachedAt < HOME_CACHE_MS) return cachedFeed;

  const response = await fetchWithTimeout(
    HOME_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    },
    10000
  );
  if (!response.ok) throw new Error(`Catalog home returned ${response.status}`);

  const modules = parseOfficialHomeModules(await response.text());
  const feed = buildOfficialHomeFeed(modules);
  if (feed.categories.length < 3) throw new Error("Catalog home modules unavailable");
  cachedFeed = feed;
  cachedAt = Date.now();
  return feed;
}

export const getOfficialJioSaavnHome = getOfficialHomeFeed;

export async function getOfficialHomeSongs(refsOrIds: (string | OfficialSongRef)[]): Promise<Song[]> {
  if (!refsOrIds || refsOrIds.length === 0) return [];
  const baseUrls = getCatalogSearchBaseUrls();
  const base = baseUrls[0]?.replace(/\/+$/, "") || "https://mavrixfy-song-api.vercel.app/api";

  const targets = refsOrIds.slice(0, 16).map((item) => (typeof item === "string" ? { id: item } : item));

  const songPromises = targets.map(async (ref) => {
    try {
      const queryParam = ref.url ? `link=${encodeURIComponent(ref.url)}` : `id=${encodeURIComponent(ref.id)}`;
      const response = await fetchWithTimeout(`${base}/songs?${queryParam}`, { headers: { Accept: "application/json" } }, 5500);
      if (!response.ok) return null;
      const payload = await response.json();
      const rawSongs = Array.isArray(payload?.data) ? (payload.data as JioSaavnSong[]) : [];
      if (rawSongs.length > 0) {
        const song = convertJioSaavnSong(rawSongs[0]);
        if (song && song.audioUrl) return song;
      }
    } catch {
      // Ignore individual song failure
    }
    return null;
  });

  const results = await Promise.all(songPromises);
  return results.filter((s): s is Song => Boolean(s && s.id && s.audioUrl));
}
