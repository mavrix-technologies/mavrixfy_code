/**
 * Catalog Service — fetches admin-uploaded songs from Firestore
 * and merges them into search results seamlessly.
 */
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Song } from '@/lib/musicData';
import { logger } from '@/lib/logger';
import { mapFilter } from "@/lib/arrayUtils";

let _cache: Song[] | null = null;
let _cacheTime = 0;
let _inFlight: Promise<Song[]> | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const FAILURE_CACHE_TTL = 60 * 1000; // Avoid repeated permission-denied reads in dev.
let _lastFailureAt = 0;

export async function getCatalogSongs(): Promise<Song[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    return _cache;
  }

  if (_lastFailureAt && now - _lastFailureAt < FAILURE_CACHE_TTL) {
    return _cache || [];
  }

  if (_inFlight) {
    return _inFlight;
  }

  _inFlight = fetchCatalogSongs();
  try {
    return await _inFlight;
  } finally {
    _inFlight = null;
  }
}

async function fetchCatalogSongs(): Promise<Song[]> {
  try {
    const snap = await getDocs(collection(db, 'songs'));

    const songs: Song[] = mapFilter(snap.docs, (d): Song | null => {
        const data = d.data();
        const audioUrl = data.audioUrl || data.streamUrl || data.url || '';
        if (!audioUrl || !data.title) {
          return null;
        }

        let imageUrl = data.imageUrl || data.coverUrl || '';
        if (!imageUrl && Array.isArray(data.image)) {
          imageUrl = data.image[data.image.length - 1]?.url || '';
        }

        return {
          id: d.id,
          title: data.title || data.name || '',
          artist: data.artist || data.primaryArtists || 'Unknown Artist',
          album: typeof data.album === 'object' ? (data.album?.name || '') : (data.album || ''),
          duration: data.duration ? Number(data.duration) : 0,
          coverUrl: imageUrl,
          genre: data.genre || '',
          mood: data.mood || data.moods || undefined,
          audioUrl,
          year: data.year ? String(data.year) : '',
          language: data.language || '',
          popularity: Number(data.popularity || 0) || undefined,
          source: 'local' as const,
        };
      }, (s): s is Song => s !== null);

    _cache = songs;
    _cacheTime = Date.now();
    _lastFailureAt = 0;
    return songs;
  } catch (e) {
    _lastFailureAt = Date.now();
    const error = e as { code?: string; message?: string };
    const message = error?.message || '';

    if (error?.code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
      logger.warn(
        '[CatalogService] Firestore /songs is not readable for this user. Ensure public song docs match firestore.rules public catalog fields.',
        e
      );
      return _cache || [];
    }

    logger.warn('[CatalogService] Failed to fetch catalog songs.', e);
    return _cache || [];
  }
}

export function searchCatalog(songs: Song[], query: string): Song[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  const results = songs.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.artist.toLowerCase().includes(q) ||
    s.album.toLowerCase().includes(q) ||
    q.split(' ').some(w => w.length > 2 && s.title.toLowerCase().includes(w))
  );
  return results;
}
