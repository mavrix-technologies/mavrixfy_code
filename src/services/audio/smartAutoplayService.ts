import type { Song } from "@/lib/musicData";
import { parseApiSong } from "@/lib/searchRepository";
import { deduplicateSongs } from "@/lib/searchUtils";
import { getApiUrl } from "@/lib/api-config";
import { fetchJson } from "@/utils/asyncUtils";
import { logger } from "@/lib/logger";
import { getSettings } from "@/lib/storage";
import type { SmartAutoplayMode } from "@/lib/smartAutoplayConfig";

const RECENT_AUTOPLAY_IDS = new Set<string>();
const MAX_RECENT_AUTOPLAY_CACHE = 60;

function rememberAutoplaySong(id: string) {
  if (!id) return;
  if (RECENT_AUTOPLAY_IDS.size >= MAX_RECENT_AUTOPLAY_CACHE) {
    const first = RECENT_AUTOPLAY_IDS.values().next().value;
    if (first) RECENT_AUTOPLAY_IDS.delete(first);
  }
  RECENT_AUTOPLAY_IDS.add(id);
}

/**
 * Cleans a song title down to its core root name, stripping parentheses,
 * version qualifiers (Remix, Lofi, From Film, Acoustic, etc.), and punctuation.
 */
export function cleanCoreTitle(title?: string | null): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/&quot;/gi, "")
    .replace(/&#039;/gi, "")
    .replace(/&amp;/gi, "&")
    .replace(/\(.*?\)/g, "") // remove (From "...") or (Lofi)
    .replace(/\[.*?\]/g, "") // remove [Official Audio]
    .replace(/[-–—]\s*(new version|remix|lofi|lo-fi|acoustic|reprise|version|slowed|reverb|cover|unplugged|mashup|edit|mix|dance mix|audio).*$/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArtistNames(artistStr?: string | null): { primary: string; secondary?: string } {
  if (!artistStr) return { primary: "" };
  const parts = artistStr
    .split(/[,&/|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    primary: parts[0] || "",
    secondary: parts[1] || undefined,
  };
}

function isFuzzySameSongTitle(candTitle: string, seedTitle: string): boolean {
  if (!candTitle || !seedTitle || seedTitle.length < 3) return false;
  if (candTitle === seedTitle) return true;
  return candTitle.indexOf(seedTitle) !== -1 || seedTitle.indexOf(candTitle) !== -1;
}

export interface FetchAutoplayRecommendationsOptions {
  seedSong: Song;
  currentQueue?: Song[];
  mode?: SmartAutoplayMode;
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Generates continuous, Spotify-style song recommendations based on the seed song.
 * Guaranteed to exclude the searched song and any of its variants/remixes,
 * returning distinct, related songs by similar artists and genres.
 */
export async function fetchAutoplayRecommendations({
  seedSong,
  currentQueue = [],
  mode: explicitMode,
  limit = 15,
  signal,
}: FetchAutoplayRecommendationsOptions): Promise<Song[]> {
  if (!seedSong) return [];

  let mode = explicitMode;
  if (!mode) {
    try {
      const settings = await getSettings();
      mode = settings.smartAutoplayMode || "similar-trending";
    } catch {
      mode = "similar-trending";
    }
  }

  const apiUrl = getApiUrl();
  const rawCandidates: Song[] = [];
  const { primary: primaryArtist, secondary: secondaryArtist } = extractArtistNames(seedSong.artist);
  const seedCoreTitle = cleanCoreTitle(seedSong.title);

  // Array of asynchronous queries to discover rich, diverse related songs
  const queryPromises: Promise<Song[]>[] = [];

  // 1. Suggestions API (if available for seed song ID)
  if (seedSong.id && (mode === "similar-only" || mode === "similar-trending" || mode === "mood-radio")) {
    queryPromises.push(
      fetchJson<any>(
        `${apiUrl}/api/songs/${encodeURIComponent(seedSong.id)}/suggestions?limit=${Math.max(limit, 15)}`,
        signal
      )
        .then((res) => {
          const items = res?.data || res?.results || [];
          return Array.isArray(items) ? items.map(parseApiSong).filter((s): s is Song => Boolean(s)) : [];
        })
        .catch(() => [])
    );
  }

  // 2. Primary Artist hits (e.g. "Arijit Singh hits")
  if (primaryArtist) {
    queryPromises.push(
      fetchJson<any>(
        `${apiUrl}/api/search/songs?query=${encodeURIComponent(`${primaryArtist} hits`)}&limit=15`,
        signal
      )
        .then((res) => {
          const items = res?.data?.results || res?.data || [];
          return Array.isArray(items) ? items.map(parseApiSong).filter((s): s is Song => Boolean(s)) : [];
        })
        .catch(() => [])
    );
  }

  // 3. Secondary/Collaborating Artist or Composer hits (e.g. "Pritam hits")
  if (secondaryArtist && secondaryArtist.toLowerCase() !== primaryArtist.toLowerCase()) {
    queryPromises.push(
      fetchJson<any>(
        `${apiUrl}/api/search/songs?query=${encodeURIComponent(`${secondaryArtist} hits`)}&limit=10`,
        signal
      )
        .then((res) => {
          const items = res?.data?.results || res?.data || [];
          return Array.isArray(items) ? items.map(parseApiSong).filter((s): s is Song => Boolean(s)) : [];
        })
        .catch(() => [])
    );
  }

  // 4. Genre / Mood-based hits (e.g. "hindi hits" or "bollywood popular")
  const genreQuery = seedSong.genre ? `${seedSong.genre} top hits` : "bollywood hits";
  queryPromises.push(
    fetchJson<any>(
      `${apiUrl}/api/search/songs?query=${encodeURIComponent(genreQuery)}&limit=10`,
      signal
    )
      .then((res) => {
        const items = res?.data?.results || res?.data || [];
        return Array.isArray(items) ? items.map(parseApiSong).filter((s): s is Song => Boolean(s)) : [];
      })
      .catch(() => [])
  );

  // Await all discovery queries concurrently
  const queryResults = await Promise.allSettled(queryPromises);
  for (const result of queryResults) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      rawCandidates.push(...result.value);
    }
  }

  // 5. Strict Deduplication & Same-Song Filtering
  // - Exclude the seed song itself by ID
  // - Exclude existing songs in the active queue by ID
  // - Exclude ANY song whose title is the same or a variant/remix of the seed song
  // - Deduplicate candidate songs against each other so no two songs share the same root title
  const existingQueueIds = new Set(currentQueue.map((s) => s.id));
  existingQueueIds.add(seedSong.id);

  const existingQueueTitles = new Set(
    currentQueue.map((s) => cleanCoreTitle(s.title)).filter(Boolean)
  );
  if (seedCoreTitle) {
    existingQueueTitles.add(seedCoreTitle);
  }

  const seenTitlesInBatch = new Set<string>();
  if (seedCoreTitle) {
    seenTitlesInBatch.add(seedCoreTitle);
  }

  const filteredRecommendations: Song[] = [];
  const dedupedRaw = deduplicateSongs(rawCandidates);

  for (const song of dedupedRaw) {
    if (!song || !song.id) continue;

    // Reject if ID is already in queue or matches seed
    if (existingQueueIds.has(song.id)) continue;

    const candCoreTitle = cleanCoreTitle(song.title);
    if (!candCoreTitle) continue;

    // Strict same-song check: Never play another version/remix of the searched song
    if (isFuzzySameSongTitle(candCoreTitle, seedCoreTitle)) {
      continue;
    }

    // Reject if this title is already present in queue
    if (existingQueueTitles.has(candCoreTitle)) continue;

    // Reject duplicates within this recommendation batch (e.g. only keep 1 version of a recommended song)
    if (seenTitlesInBatch.has(candCoreTitle)) continue;

    // Avoid repeating songs played recently in this autoplay session if we have enough
    if (RECENT_AUTOPLAY_IDS.has(song.id) && dedupedRaw.length > 8) {
      continue;
    }

    seenTitlesInBatch.add(candCoreTitle);
    rememberAutoplaySong(song.id);
    filteredRecommendations.push(song);

    if (filteredRecommendations.length >= limit) {
      break;
    }
  }

  return filteredRecommendations;
}
