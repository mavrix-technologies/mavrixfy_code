/**
 * Catalog Service — fetches admin-uploaded songs from Firestore
 * and merges them into search results seamlessly.
 */
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Song } from '@/lib/musicData';

let _cache: Song[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds

export async function getCatalogSongs(): Promise<Song[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    console.log(`[CatalogService] Returning ${_cache.length} cached songs`);
    return _cache;
  }

  try {
    console.log('[CatalogService] Fetching songs from Firestore...');
    const snap = await getDocs(collection(db, 'songs'));
    console.log(`[CatalogService] Firestore returned ${snap.docs.length} raw documents`);

    const songs: Song[] = snap.docs
      .map(d => {
        const data = d.data();
        const audioUrl = data.audioUrl || data.streamUrl || data.url || '';
        if (!audioUrl || !data.title) {
          console.log(`[CatalogService] Skipping doc ${d.id} — missing audioUrl or title`);
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
          audioUrl,
          year: data.year ? String(data.year) : '',
          language: data.language || '',
          hasLyrics: false,
          source: 'local' as const,
        };
      })
      .filter((s): s is Song => s !== null);

    console.log(`[CatalogService] Parsed ${songs.length} valid songs`);
    _cache = songs;
    _cacheTime = now;
    return songs;
  } catch (e) {
    console.error('[CatalogService] Failed to fetch from Firestore:', e);
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
  console.log(`[CatalogService] searchCatalog("${query}") → ${results.length} matches from ${songs.length} songs`);
  return results;
}
