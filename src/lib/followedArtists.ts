import AsyncStorage from "@react-native-async-storage/async-storage";
import { accountStorageKey } from "./accountScope";
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

export function getFollowedArtists(): Promise<FollowedArtist[]> {
  return read();
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

