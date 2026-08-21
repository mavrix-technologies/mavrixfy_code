import { Song } from "./musicData";

export interface CachedPlaylistData {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  imageUrl?: string;
  songs?: Song[];
  isFirestore?: boolean;
  isPublic?: boolean;
  updatedAt?: number;
}

const MEMORY_PLAYLIST_MAP = new Map<string, CachedPlaylistData>();

export function setCachedPlaylist(
  id: string,
  playlist: Partial<CachedPlaylistData> & { id?: string }
): void {
  if (!id) return;
  const existing = MEMORY_PLAYLIST_MAP.get(id) || { id, name: "" };
  MEMORY_PLAYLIST_MAP.set(id, {
    ...existing,
    ...playlist,
    id,
    name: playlist.name ?? existing.name ?? "",
    songs: playlist.songs ?? existing.songs ?? [],
  });
}

export function setCachedPlaylists(
  playlists: (Partial<CachedPlaylistData> & { id: string })[]
): void {
  for (const p of playlists) {
    if (p && p.id) {
      setCachedPlaylist(p.id, p);
    }
  }
}

export function getCachedPlaylist(id: string): CachedPlaylistData | undefined {
  if (!id) return undefined;
  return MEMORY_PLAYLIST_MAP.get(id);
}

export function removeCachedPlaylist(id: string): void {
  if (!id) return;
  MEMORY_PLAYLIST_MAP.delete(id);
}
