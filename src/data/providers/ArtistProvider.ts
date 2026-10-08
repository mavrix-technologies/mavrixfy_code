import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadYouTubeArtist, loadYouTubeArtistSongs, searchYouTubeMusic } from "@/services/youtube/YouTubeMusic";
import { artistChannelId, validArtistChannelId, type ArtistCard, type ArtistDetails } from "@/services/youtube/YouTubeArtists";
export type { ArtistCard, ArtistDetails, ArtistAlbum } from "@/services/youtube/YouTubeArtists";

const PREFIX = "@mavrixfy_youtube_artists_v1";
const TTL = 4 * 60 * 60 * 1000;
const memory = new Map<string, { at: number; data: ArtistDetails }>();
const pending = new Map<string, Promise<ArtistDetails | null>>();
let featured: { at: number; data: ArtistCard[] } | undefined;
let featuredRequest: Promise<ArtistCard[]> | undefined;
let generation = 0;

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
    try { const raw = await AsyncStorage.getItem(`${PREFIX}:${resolved}`); if (raw) stored = JSON.parse(raw); } catch {}
    const data = stored && Date.now() - stored.at < TTL && validArtistChannelId(stored.data?.id)
      && Array.isArray(stored.data.topSongs) && Array.isArray(stored.data.topAlbums) && Array.isArray(stored.data.similarArtists)
      ? stored.data : await loadYouTubeArtist(resolved);
    if (memory.size >= 40) memory.delete(memory.keys().next().value!);
    memory.set(resolved, { at: data === stored?.data ? stored.at : Date.now(), data });
    if (data !== stored?.data) void AsyncStorage.setItem(`${PREFIX}:${resolved}`, JSON.stringify({ at: Date.now(), data })).catch(() => {});
    return data;
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
export async function getAllPopularArtists(options?: { forceRefresh?: boolean }): Promise<ArtistCard[]> {
  if (options?.forceRefresh) await clearFeaturedArtistsCache();
  if (featured && Date.now() - featured.at < TTL / 2) return featured.data;
  if (featuredRequest) return featuredRequest;
  const started = generation;
  const task = (async () => {
    try {
      const raw = await AsyncStorage.getItem(`${PREFIX}:featured`);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored && Date.now() - stored.at < TTL / 2 && stored.data?.every((item: ArtistCard) => validArtistChannelId(item.id))) {
        if (started === generation) featured = stored;
        return stored.data as ArtistCard[];
      }
    } catch {}
    // Music search returns the artist and related artists. Four regional seeds
    // replace the previous forty-query fan-count ranking crawl; two requests at a time.
    const seeds = ["Arijit Singh", "Shreya Ghoshal", "Diljit Dosanjh", "Anirudh Ravichander"];
    const result = new Map<string, ArtistCard>();
    for (let index = 0; index < seeds.length; index += 2) {
      const batch = await Promise.allSettled(seeds.slice(index, index + 2).map(query => searchArtists(query)));
      for (const item of batch) if (item.status === "fulfilled") for (const artist of item.value) result.set(artist.id, artist);
    }
    const data = [...result.values()];
    if (data.length && started === generation) {
      featured = { at: Date.now(), data };
      void AsyncStorage.setItem(`${PREFIX}:featured`, JSON.stringify(featured)).catch(() => {});
    }
    return data;
  })().finally(() => { if (featuredRequest === task) featuredRequest = undefined; });
  featuredRequest = task;
  return task;
}
export async function getFeaturedArtists(options?: { forceRefresh?: boolean }): Promise<ArtistCard[]> {
  return (await getAllPopularArtists(options)).slice(0, 24);
}
export async function clearFeaturedArtistsCache() {
  generation++; featured = undefined; featuredRequest = undefined;
  await AsyncStorage.removeItem(`${PREFIX}:featured`).catch(() => {});
}
export function getArtistSongs(id: string, cursor = "") { return loadYouTubeArtistSongs(id, cursor); }
