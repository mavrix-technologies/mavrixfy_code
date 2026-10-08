import AsyncStorage from "@react-native-async-storage/async-storage";
import { accountStorageKey } from "./accountScope";
import { searchArtists } from "@/data/providers/ArtistProvider";
import { getBestImageUrl } from "./musicData";
import { validArtistChannelId } from "@/services/youtube/YouTubeArtists";
const KEY = "@mavrixfy_followed_artists_v1";

export interface FollowedArtist {
  id: string;
  name: string;
  image: string; // best image URL, pre-resolved
  followedAt: number;
}

// In-memory cache so reads are instant after first load
const cache = new Map<string, FollowedArtist[]>();

async function read(): Promise<FollowedArtist[]> {
  const key = accountStorageKey(KEY);
  if (cache.has(key)) return cache.get(key)!;
  const raw = await AsyncStorage.getItem(key);
  const value: FollowedArtist[] = raw ? JSON.parse(raw) : [];
  cache.set(key, value);
  return value;
}
function write(list: FollowedArtist[], key = accountStorageKey(KEY)): Promise<void> {
  cache.set(key, list);
  return AsyncStorage.setItem(key, JSON.stringify(list));
}

const migrations = new Map<string, Promise<FollowedArtist[]>>();
export async function getFollowedArtists(): Promise<FollowedArtist[]> {
  const key = accountStorageKey(KEY);
  const list = await read();
  const legacy = list.filter(artist => !validArtistChannelId(artist.id));
  if (!legacy.length) return list;
  const active = migrations.get(key);
  if (active) return active;
  const task = (async () => {
    const replacements = new Map<string, FollowedArtist>();
    for (let index = 0; index < legacy.length; index += 2) {
      const batch = await Promise.allSettled(legacy.slice(index, index + 2).map(async saved => {
        const candidates = await searchArtists(saved.name);
        const match = candidates.find(artist => artist.name.trim().toLowerCase() === saved.name.trim().toLowerCase());
        if (match) replacements.set(saved.id, { ...saved, id: match.id, name: match.name, image: getBestImageUrl(match.image) });
      }));
      // Failed lookups preserve the saved artist for a later retry.
      void batch;
    }
    // Merge against current state so a follow/unfollow during lookup is preserved.
    const current = cache.get(key) || list;
    const next = [...new Map(current.map(artist => {
      const updated = replacements.get(artist.id) || artist;
      return [updated.id, updated] as const;
    })).values()];
    if (replacements.size) await write(next, key);
    return next;
  })().finally(() => migrations.delete(key));
  migrations.set(key, task);
  return task;
}
export async function reconcileFollowedArtist(oldId: string, artist: FollowedArtist): Promise<boolean> {
  const key = accountStorageKey(KEY);
  const list = await read();
  const saved = list.find(item => item.id === oldId || item.id === artist.id);
  if (!saved) return false;
  const next = list.filter(item => item.id !== oldId && item.id !== artist.id);
  await write([{ ...artist, followedAt: saved.followedAt }, ...next], key);
  return true;
}

export async function isFollowingArtist(id: string): Promise<boolean> {
  const list = await read();
  return list.some((a) => a.id === id);
}

export async function toggleFollowArtist(artist: FollowedArtist): Promise<boolean> {
  const key = accountStorageKey(KEY);
  const list = await read();
  const already = list.some((a) => a.id === artist.id);
  if (already) {
    await write(list.filter((a) => a.id !== artist.id), key);
    return false; // now unfollowed
  } else {
    await write([{ ...artist, followedAt: Date.now() }, ...list], key);
    return true; // now following
  }
}

