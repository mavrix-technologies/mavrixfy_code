import { logger } from "@/lib/logger";
import { getApiUrl } from "@/lib/api-config";
import { withTimeout } from "@/utils/asyncUtils";
import { unescapeHtml } from "@/utils/stringUtils";
import { mapHomepageItemToPlaylistResult, consumeResponseBody } from "./JioSaavnNormalizers";
import type { JioSaavnPlaylistResult, AutoRefreshContext } from "./JioSaavnTypes";

interface ScrapedHomepageData {
  modules: any[];
  timestamp: number;
}

let cachedScrapedHomeData: ScrapedHomepageData | null = null;
let activeScrapedHomePromise: Promise<any[]> | null = null;
const SCRAPED_HOME_CACHE_DURATION = 15 * 60 * 1000;

const JIOSAAVN_SEARCH_BASE_URLS = [
  `${getApiUrl().replace(/\/+$/, "")}/api`,
];


export function getScrapedJioSaavnHomeModules(forceRefresh: boolean): Promise<any[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedScrapedHomeData &&
    now - cachedScrapedHomeData.timestamp < SCRAPED_HOME_CACHE_DURATION
  ) {
    return Promise.resolve(cachedScrapedHomeData.modules);
  }

  if (activeScrapedHomePromise) {
    return activeScrapedHomePromise;
  }

  activeScrapedHomePromise = (async () => {
    try {
      const apiUrls = JIOSAAVN_SEARCH_BASE_URLS.map((base) =>
        `${base.replace(/\/+$/, "")}/modules?language=hindi`
      );

      let modules: any[] = [];

      for (const url of apiUrls) {
        try {
          const res = await withTimeout(
            fetch(url, { headers: { Accept: "application/json" } }),
            6500
          );
          if (!res.ok) {
            await consumeResponseBody(res);
            continue;
          }
          const json = await res.json();
          const data = json?.data ?? json;
          if (data && typeof data === "object" && Object.keys(data).length > 0) {
            modules = Object.entries(data).reduce((acc: any[], [key, value]: [string, any]) => {
              const dataArray = Array.isArray(value?.data)
                ? value.data
                : Array.isArray(value)
                ? value
                : [];
              if (dataArray.length > 0) {
                acc.push({ key, data: dataArray });
              }
              return acc;
            }, []);
            break;
          }
        } catch {
          continue;
        }
      }

      cachedScrapedHomeData = { modules, timestamp: Date.now() };
      return modules;
    } catch (err) {
      logger.warn("[JioSaavn] Failed to fetch home modules:", err);
      return [];
    } finally {
      activeScrapedHomePromise = null;
    }
  })();

  return activeScrapedHomePromise;
}

const HOMEPAGE_MODULE_MAP: Record<string, string[]> = {
  trending: ["trending", "new_trending"],
  "top-charts": ["charts"],
  "new-arrivals": ["new_albums", "new-arrivals"],
  bollywood: ["top_playlists", "playlists"],
  "most-viral": ["viral", "most_viral"],
  popular: ["top_songs", "popular"],
  retro: ["retro"],
};

export async function fetchScrapedCategoryFromHomepage(
  categoryId: string,
  limit: number,
  forceRefresh: boolean
): Promise<JioSaavnPlaylistResult[] | null> {
  const moduleKeys = HOMEPAGE_MODULE_MAP[categoryId];
  if (!moduleKeys || moduleKeys.length === 0) return null;

  try {
    const modules = await getScrapedJioSaavnHomeModules(forceRefresh);
    const targetModule = moduleKeys
      .map((key) => modules.find((m) => m.key === key))
      .find((m) => m && Array.isArray(m.data) && m.data.length > 0);

    if (!targetModule || !Array.isArray(targetModule.data) || targetModule.data.length === 0) {
      return null;
    }

    const mapped = targetModule.data.map(mapHomepageItemToPlaylistResult);

    return mapped
      .filter((item: JioSaavnPlaylistResult) => {
        const titleLower = item.name.toLowerCase();
        const descLower = (item.description || "").toLowerCase();
        const isUrdu =
          titleLower.includes("urdu") ||
          descLower.includes("urdu") ||
          titleLower.includes("pakistani") ||
          descLower.includes("pakistani");
        return !isUrdu;
      })
      .slice(0, limit);
  } catch (err) {
    logger.warn(`[JioSaavn] fetchScrapedCategoryFromHomepage failed for ${categoryId}:`, err);
    return null;
  }
}

export async function fetchJioSaavnDetailsByLink(path: string, type: "song" | "album"): Promise<any | null> {
  const isSong = type === "song";
  const endpoint = isSong ? "songs" : "albums";

  for (const endpointBase of JIOSAAVN_SEARCH_BASE_URLS) {
    const trimmed = endpointBase.replace(/\/+$/, "");
    const requestUrl = `${trimmed}/${endpoint}?link=${encodeURIComponent(path)}`;
    try {
      const response = await withTimeout(
        fetch(requestUrl, { headers: { Accept: "application/json" } }),
        4500
      );
      if (response.ok) {
        const json = await response.json();
        const data = isSong
          ? json.data?.[0] || json?.[0] || json.data || json
          : json.data || json;
        if (data && data.id) {
          return data;
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function fetchNewArrivalPlaylists(
  limit: number,
  _forceRefresh: boolean,
  _context?: AutoRefreshContext
): Promise<JioSaavnPlaylistResult[]> {
  try {
    const url = "https://www.jiosaavn.com/new-releases";
    const response = await withTimeout(
      fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }),
      6500
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch new arrivals HTML: ${response.status}`);
    }

    const html = await response.text();
    const regex = /href="(\/(song|album)\/[^"]+)"/g;
    let match;
    const items: { path: string; type: "song" | "album" }[] = [];
    const seen = new Set<string>();

    while ((match = regex.exec(html)) !== null) {
      const fullPath = match[1];
      if (seen.has(fullPath)) continue;
      seen.add(fullPath);
      items.push({
        path: `https://www.jiosaavn.com${fullPath}`,
        type: fullPath.includes("/song/") ? "song" : "album",
      });
    }

    if (items.length === 0) return [];

    const resolvedItems = await Promise.all(
      items.slice(0, 20).map(async (item) => {
        try {
          const data = await fetchJioSaavnDetailsByLink(item.path, item.type);
          if (!data || !data.id) return null;

          const isSong = item.type === "song";
          const lang = String(data.language || "").trim().toLowerCase();

          if (
            lang === "urdu" ||
            String(data.name || "").toLowerCase().includes("urdu") ||
            String(data.name || "").toLowerCase().includes("pakistani")
          ) {
            return null;
          }

          const name = unescapeHtml(data.name || "Unknown Title");
          const description = isSong
            ? unescapeHtml(
                data.artists?.primary?.map((a: any) => a.name).join(", ") ||
                  data.album?.name ||
                  "New Release Song"
              )
            : unescapeHtml(
                data.description ||
                  data.artists?.map((a: any) => a.name).join(", ") ||
                  "New Release Album"
              );

          return {
            id: data.id,
            name,
            image: data.image,
            songCount: isSong ? 1 : data.songCount || data.songs?.length || 5,
            url: data.url || item.path,
            description,
            language: data.language,
            type: item.type,
            songData: isSong ? data : undefined,
          } as JioSaavnPlaylistResult;
        } catch {
          return null;
        }
      })
    );

    const filtered = resolvedItems.filter((x): x is JioSaavnPlaylistResult => x !== null);
    return filtered.slice(0, limit);
  } catch {
    return [];
  }
}
