import AsyncStorage from "@react-native-async-storage/async-storage";
import type { YouTubeHomeSection } from "@/services/youtube/YouTubeMusic";
import type { Song } from "@/lib/musicData";

type CatalogFeed = { songs: Song[]; sections: YouTubeHomeSection[] };
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_BYTES = 180000;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validSong(value: unknown) {
  return record(value) && typeof value.id === "string" && value.id.startsWith("youtube_") &&
    typeof value.title === "string" && typeof value.artist === "string" && typeof value.coverUrl === "string";
}
function validCollection(value: unknown) {
  return record(value) && typeof value.id === "string" && /^youtube_(playlist|album)_/.test(value.id) &&
    typeof value.name === "string" && typeof value.coverUrl === "string";
}
export function decodeHomeFeedCache<T extends CatalogFeed>(raw: string | null, now = Date.now()): { data: T; at: number } | undefined {
  if (!raw || raw.length > MAX_BYTES) return;
  try {
    const snapshot = JSON.parse(raw);
    if (!record(snapshot) || snapshot.version !== 1 || typeof snapshot.at !== "number" ||
      !Number.isFinite(snapshot.at) || snapshot.at > now || now - snapshot.at > MAX_AGE || !record(snapshot.data)) return;
    const data = snapshot.data;
    if (!Array.isArray(data.songs) || !data.songs.every(validSong) || !Array.isArray(data.sections) || !Array.isArray(data.playlists) ||
      !data.playlists.every(validCollection) || data.sections.length > 12 || !data.sections.every(section =>
        record(section) && typeof section.id === "string" && typeof section.title === "string" &&
        Array.isArray(section.songs) && section.songs.every(validSong) && Array.isArray(section.playlists) && section.playlists.every(validCollection))) return;
    return { data: data as unknown as T, at: snapshot.at };
  } catch { return; }
}
export async function readHomeFeedCache<T extends CatalogFeed>(key: string) {
  try { return decodeHomeFeedCache<T>(await AsyncStorage.getItem(key)); } catch { return; }
}
export async function writeHomeFeedCache<T extends CatalogFeed>(key: string, data: T, at: number) {
  try {
    const raw = JSON.stringify({ version: 1, at, data });
    if (raw.length <= MAX_BYTES) await AsyncStorage.setItem(key, raw);
  } catch { /* A cache write cannot interrupt playback or feed rendering. */ }
}
