import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeMusicLanguages, type MusicLanguageId } from "@/lib/musicLanguages";
import { clearYouTubeSearchCache, loadYouTubeArtist, loadYouTubeArtistSongs, searchYouTubeMusic } from "@/services/youtube/YouTubeMusic";
import { artistChannelId, validArtistChannelId, type ArtistCard, type ArtistDetails } from "@/services/youtube/YouTubeArtists";
export type { ArtistCard, ArtistDetails, ArtistAlbum } from "@/services/youtube/YouTubeArtists";

const PREFIX = "@mavrixfy_youtube_artists_v1";
const TTL = 4 * 60 * 60 * 1000;
const memory = new Map<string, { at: number; data: ArtistDetails }>();
const pending = new Map<string, Promise<ArtistDetails | null>>();
let featured: { at: number; key: string; data: ArtistCard[] } | undefined;
let featuredRequest: Promise<ArtistCard[]> | undefined;
let generation = 0;

const LANGUAGE_ARTIST_SEEDS: Record<MusicLanguageId, readonly string[]> = {
  hindi: ["Arijit Singh", "Shreya Ghoshal", "Pritam", "Jubin Nautiyal"],
  punjabi: ["Diljit Dosanjh", "Karan Aujla", "AP Dhillon", "Shubh"],
  english: ["A.R. Rahman", "Prateek Kuhad", "Anuv Jain", "Ed Sheeran"],
  tamil: ["Anirudh Ravichander", "A.R. Rahman", "Yuvan Shankar Raja", "Sid Sriram"],
  telugu: ["Thaman S", "Devi Sri Prasad", "Sid Sriram", "Anirudh Ravichander"],
  marathi: ["Ajay-Atul", "Avadhoot Gupte", "Shreya Ghoshal", "Bela Shende"],
  bengali: ["Arijit Singh", "Anupam Roy", "Shreya Ghoshal", "Anjan Dutt"],
  malayalam: ["Vineeth Sreenivasan", "K.S. Chithra", "Sushin Shyam", "Hesham Abdul Wahab"],
  kannada: ["Vijay Prakash", "Sanjith Hegde", "Raghu Dixit", "Sonu Nigam"],
  gujarati: ["Aditya Gadhvi", "Jigardan Gadhavi", "Kinjal Dave", "Sachin-Jigar"],
  bhojpuri: ["Pawan Singh", "Khesari Lal Yadav", "Ritesh Pandey", "Shilpi Raj"],
};

function buildFeaturedArtistSeeds(languages: readonly MusicLanguageId[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const normalized = normalizeMusicLanguages(languages);
  let cursor = 0;
  while (out.length < 4 && cursor < 4) {
    for (const lang of normalized) {
      const candidate = LANGUAGE_ARTIST_SEEDS[lang]?.[cursor];
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
      if (out.length >= 4) break;
    }
    cursor += 1;
  }
  return out.length > 0 ? out : ["Arijit Singh", "Shreya Ghoshal", "Diljit Dosanjh", "Anirudh Ravichander"];
}

/** Read-only startup fallback: do not start discovery requests while offline. */
export async function getCachedFeaturedArtists(): Promise<ArtistCard[]> {
  try {
    const stored = featured ?? JSON.parse(await AsyncStorage.getItem(`${PREFIX}:featured`) || "null");
    if (!stored || !Number.isFinite(stored.at) || stored.at > Date.now() ||
      Date.now() - stored.at > 24 * 60 * 60 * 1000 || !Array.isArray(stored.data)) return [];
    return stored.data.filter((artist: ArtistCard) => artist && validArtistChannelId(artist.id) &&
      typeof artist.name === "string" && Array.isArray(artist.image)).slice(0, 24);
  } catch { return []; }
}

export function getImmediateCachedArtist(id: string): ArtistDetails | null {
  const cached = memory.get(validArtistChannelId(id) ? `youtube_artist_${artistChannelId(id)}` : id);
  return cached && Date.now() - cached.at < TTL ? cached.data : null;
}
export async function searchArtists(query: string, signal?: AbortSignal): Promise<ArtistCard[]> {
  return (await searchYouTubeMusic(query, "artists", signal)).artists;
}
export async function resolveArtist(id: string, name = ""): Promise<string | null> {
  if (validArtistChannelId(id)) return `youtube_artist_${artistChannelId(id)}`;
  if (!name.trim()) return null;
  const results = await searchArtists(name);
  // Legacy saved artists are resolved by exact name, never by a numeric JioSaavn ID.
  return results.find(artist => artist.name.trim().toLowerCase() === name.trim().toLowerCase())?.id || null;
}
export function getArtistDetails(id: string, name = ""): Promise<ArtistDetails | null> {
  const key = validArtistChannelId(id) ? `youtube_artist_${artistChannelId(id)}` : `${id}:${name}`;
  const cached = getImmediateCachedArtist(id);
  if (cached) return Promise.resolve(cached);
  const active = pending.get(key);
  if (active) return active;
  const task = (async () => {
    const resolved = await resolveArtist(id, name);
    if (!resolved) return null;
    const cached = getImmediateCachedArtist(resolved);
    if (cached) return cached;
    let stored: { at: number; data: ArtistDetails } | undefined;
    try { const raw = await AsyncStorage.getItem(`${PREFIX}:${resolved}`); if (raw) stored = JSON.parse(raw); } catch { }
    const data = stored && Date.now() - stored.at < TTL && validArtistChannelId(stored.data?.id)
      && Array.isArray(stored.data.topSongs) && Array.isArray(stored.data.topAlbums) && Array.isArray(stored.data.similarArtists)
      ? stored.data : await loadYouTubeArtist(resolved);
    if (memory.size >= 40) memory.delete(memory.keys().next().value!);
    memory.set(resolved, { at: data === stored?.data ? stored.at : Date.now(), data });
    if (data !== stored?.data) void AsyncStorage.setItem(`${PREFIX}:${resolved}`, JSON.stringify({ at: Date.now(), data })).catch(() => { });
    return data;
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
export async function getAllPopularArtists(options?: {
  forceRefresh?: boolean;
  preferredLanguages?: readonly string[];
}): Promise<ArtistCard[]> {
  const preferred = normalizeMusicLanguages(options?.preferredLanguages);
  const langKey = preferred.join(",");
  const cacheStorageKey = `${PREFIX}:featured:${langKey}`;
  if (options?.forceRefresh) {
    await clearFeaturedArtistsCache();
    await AsyncStorage.removeItem(cacheStorageKey).catch(() => { });
  }
  if (!options?.forceRefresh && featured && featured.key === langKey && Date.now() - featured.at < TTL / 2) return featured.data;
  if (featuredRequest) return featuredRequest;
  const started = generation;
  const task = (async () => {
    if (!options?.forceRefresh) {
      try {
        const raw = (await AsyncStorage.getItem(cacheStorageKey)) ?? (await AsyncStorage.getItem(`${PREFIX}:featured`));
        const stored = raw ? JSON.parse(raw) : null;
        if (
          stored &&
          (!stored.key || stored.key === langKey) &&
          Date.now() - stored.at < TTL / 2 &&
          stored.data?.every((item: ArtistCard) => validArtistChannelId(item.id))
        ) {
          if (started === generation) featured = { at: stored.at, key: langKey, data: stored.data };
          return stored.data as ArtistCard[];
        }
      } catch { }
    }
    // Music search returns the artist and related artists tailored to India & user's languages.
    const seeds = buildFeaturedArtistSeeds(preferred);
    const result = new Map<string, ArtistCard>();
    for (let index = 0; index < seeds.length; index += 2) {
      const batch = await Promise.allSettled(seeds.slice(index, index + 2).map(query => searchArtists(query)));
      for (const item of batch) if (item.status === "fulfilled") for (const artist of item.value) result.set(artist.id, artist);
    }
    const data = [...result.values()];
    if (data.length && started === generation) {
      featured = { at: Date.now(), key: langKey, data };
      void AsyncStorage.setItem(cacheStorageKey, JSON.stringify(featured)).catch(() => { });
      void AsyncStorage.setItem(`${PREFIX}:featured`, JSON.stringify(data.length ? { at: featured.at, data } : featured)).catch(() => { });
    }
    return data;
  })().finally(() => { if (featuredRequest === task) featuredRequest = undefined; });
  featuredRequest = task;
  return task;
}
export async function getFeaturedArtists(options?: {
  forceRefresh?: boolean;
  preferredLanguages?: readonly string[];
}): Promise<ArtistCard[]> {
  return (await getAllPopularArtists(options)).slice(0, 24);
}
export async function clearFeaturedArtistsCache() {
  generation++; featured = undefined; featuredRequest = undefined;
  clearYouTubeSearchCache();
  try {
    if (typeof AsyncStorage.getAllKeys === "function" && typeof AsyncStorage.multiRemove === "function") {
      const keys = await AsyncStorage.getAllKeys();
      const featuredKeys = keys.filter((key) => key.startsWith(`${PREFIX}:featured`));
      if (featuredKeys.length > 0) await AsyncStorage.multiRemove(featuredKeys);
      return;
    }
  } catch { }
  await AsyncStorage.removeItem(`${PREFIX}:featured`).catch(() => { });
}
export function getArtistSongs(id: string, cursor = "") { return loadYouTubeArtistSongs(id, cursor); }
