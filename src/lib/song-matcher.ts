import { MatchResult, ParsedSong } from "@/types/import";
import { getApiUrl } from "./api-config";

/**
 * Simple song search - just search and return best match
 */
export async function searchSong(
  title: string, 
  artist: string, 
  album?: string,
  parsedSong?: ParsedSong
): Promise<MatchResult | null> {
  try {
    const apiUrl = getApiUrl();
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    
    // Search all APIs in parallel
    const [jiosaavn, spotify, deezer] = await Promise.allSettled([
      searchJioSaavn(baseUrl, title, artist),
      searchSpotify(baseUrl, title, artist),
      searchDeezer(baseUrl, title, artist),
    ]);
    
    // Return first successful result
    if (jiosaavn.status === 'fulfilled' && jiosaavn.value) return jiosaavn.value;
    if (spotify.status === 'fulfilled' && spotify.value) return spotify.value;
    if (deezer.status === 'fulfilled' && deezer.value) return deezer.value;
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Search JioSaavn
 */
async function searchJioSaavn(baseUrl: string, title: string, artist: string): Promise<MatchResult | null> {
  try {
    const query = `${title} ${artist}`.trim();
    const url = `${baseUrl}/api/search/songs?query=${encodeURIComponent(query)}&limit=10`;
    
    const response = await fetch(url, { timeout: 10000 } as any);
    if (!response.ok) return null;
    
    const data = await response.json();
    const results = data.data?.results || data.results || [];
    
    if (results.length === 0) return null;
    
    // Return first result with valid media
    const song = results.find((r: any) => {
      const hasAudio = Array.isArray(r.downloadUrl) ? r.downloadUrl.length > 0 : !!r.downloadUrl;
      const hasImage = Array.isArray(r.image) ? r.image.length > 0 : !!r.image;
      return hasAudio && hasImage;
    });
    
    if (!song) return null;
    
    return {
      song,
      confidence: 0.8,
      matchScore: 0.8
    };
  } catch {
    return null;
  }
}

/**
 * Search Spotify
 */
async function searchSpotify(baseUrl: string, title: string, artist: string): Promise<MatchResult | null> {
  try {
    const query = `${title} ${artist}`.trim();
    const url = `${baseUrl}/api/music/search?q=${encodeURIComponent(query)}&limit=10`;
    
    const response = await fetch(url, { timeout: 10000 } as any);
    if (!response.ok) return null;
    
    const data = await response.json();
    const results = data.songs || [];
    
    if (results.length === 0) return null;
    
    // Return first result with valid media
    const result = results.find((r: any) => r.audioUrl && r.imageUrl);
    if (!result) return null;
    
    return {
      song: {
        id: result._id || result.id,
        title: result.title,
        primaryArtists: result.artist,
        album: { name: result.albumId?.title || result.album || '' },
        duration: result.duration,
        image: [{ link: result.imageUrl }],
        downloadUrl: [{ link: result.audioUrl }],
      },
      confidence: 0.8,
      matchScore: 0.8
    };
  } catch {
    return null;
  }
}

/**
 * Search Deezer
 */
async function searchDeezer(baseUrl: string, title: string, artist: string): Promise<MatchResult | null> {
  try {
    const query = `${title} ${artist}`.trim();
    const url = `${baseUrl}/api/deezer/search?q=${encodeURIComponent(query)}&limit=10`;
    
    const response = await fetch(url, { timeout: 10000 } as any);
    if (!response.ok) return null;
    
    const data = await response.json();
    const results = data.data || [];
    
    if (results.length === 0) return null;
    
    // Return first result with valid media
    const result = results.find((r: any) => r.preview && r.album?.cover_medium);
    if (!result) return null;
    
    return {
      song: {
        id: result.id?.toString(),
        title: result.title,
        primaryArtists: result.artist?.name || '',
        album: { name: result.album?.title || '' },
        duration: result.duration,
        image: [{ link: result.album?.cover_xl || result.album?.cover_big || result.album?.cover_medium }],
        downloadUrl: [{ link: result.preview }],
      },
      confidence: 0.8,
      matchScore: 0.8
    };
  } catch {
    return null;
  }
}

/**
 * Get match confidence level
 */
export function getMatchConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}
