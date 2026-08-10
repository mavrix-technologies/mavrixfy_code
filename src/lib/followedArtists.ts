import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArtistCard } from "@/data/providers/ArtistProvider";

const KEY = "@mavrixfy_followed_artists_v1";

export interface FollowedArtist {
  id: string;
  name: string;
  image: string; // best image URL, pre-resolved
  followedAt: number;
}

// In-memory cache so reads are instant after first load
let memCache: FollowedArtist[] | null = null;

async function read(): Promise<FollowedArtist[]> {
  if (memCache !== null) return memCache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    memCache = raw ? JSON.parse(raw) : [];
  } catch {
    memCache = [];
  }
  return memCache!;
}

async function write(list: FollowedArtist[]): Promise<void> {
  memCache = list;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export async function getFollowedArtists(): Promise<FollowedArtist[]> {
  return read();
}

export async function isFollowingArtist(id: string): Promise<boolean> {
  const list = await read();
  return list.some((a) => a.id === id);
}

async function followArtist(artist: FollowedArtist): Promise<void> {
  const list = await read();
  if (list.some((a) => a.id === artist.id)) return; // already following
  await write([{ ...artist, followedAt: Date.now() }, ...list]);
}

async function unfollowArtist(id: string): Promise<void> {
  const list = await read();
  await write(list.filter((a) => a.id !== id));
}

export async function toggleFollowArtist(artist: FollowedArtist): Promise<boolean> {
  const list = await read();
  const already = list.some((a) => a.id === artist.id);
  if (already) {
    await write(list.filter((a) => a.id !== artist.id));
    return false; // now unfollowed
  } else {
    await write([{ ...artist, followedAt: Date.now() }, ...list]);
    return true; // now following
  }
}

/** Invalidate in-memory cache — call after logout */
function clearFollowedArtistsCache(): void {
  memCache = null;
}
