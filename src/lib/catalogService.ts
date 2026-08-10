/**
 * Catalog Service — fetches admin-uploaded songs from Firestore
 * and merges them into search results seamlessly.
 */
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
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
    if (!db) return [];

    // Optimize: Keep a small local "featured/recent" cache by limiting documents retrieved
    let snap;
    try {
      const q = query(collection(db, 'songs'), orderBy('popularity', 'desc'), limit(30));
      snap = await getDocs(q);
    } catch {
      const q = query(collection(db, 'songs'), limit(30));
      snap = await getDocs(q);
    }

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

export async function searchCatalog(queryText: string): Promise<Song[]> {
  if (!db || !queryText.trim()) return [];
  const qClean = queryText.trim();
  const qLower = qClean.toLowerCase();
  const qCapitalized = qClean.charAt(0).toUpperCase() + qClean.slice(1);

  const songsRef = collection(db, 'songs');

  // Helper prefix query generator
  const getPrefixQuery = (field: string, prefix: string) => {
    return query(
      songsRef,
      where(field, '>=', prefix),
      where(field, '<=', prefix + '\uf8ff'),
      limit(15)
    );
  };

  // Run multiple parallel prefix queries for maximum coverage with compact returns
  const queries = [
    getPrefixQuery('title', qClean),
    getPrefixQuery('title', qCapitalized),
    getPrefixQuery('titleLower', qLower),
    getPrefixQuery('artist', qClean),
    getPrefixQuery('artist', qCapitalized),
    getPrefixQuery('artistLower', qLower),
  ];

  const snapshots = await Promise.allSettled(queries.map(q => getDocs(q)));

  const seenIds = new Set<string>();
  const results: Song[] = [];

  for (const result of snapshots) {
    if (result.status === 'fulfilled') {
      result.value.forEach(d => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);

        const data = d.data();
        const audioUrl = data.audioUrl || data.streamUrl || data.url || '';
        if (!audioUrl || !data.title) return;

        let imageUrl = data.imageUrl || data.coverUrl || '';
        if (!imageUrl && Array.isArray(data.image)) {
          imageUrl = data.image[data.image.length - 1]?.url || '';
        }

        results.push({
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
        });
      });
    }
  }

  // Filter precisely and return
  return results.filter(s =>
    s.title.toLowerCase().includes(qLower) ||
    s.artist.toLowerCase().includes(qLower) ||
    s.album.toLowerCase().includes(qLower)
  );
}
