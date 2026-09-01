import { type MatchResult, type ParsedSong } from "@/types/import";
import { getApiUrl } from "./api-config";

/**
 * Sequential provider song search: JioSaavn -> Spotify -> Deezer
 */
export async function searchSong(
  title: string,
  artist: string,
  _album?: string,
  _parsedSong?: ParsedSong
): Promise<MatchResult | null> {
  try {
    const apiUrl = getApiUrl().replace(/\/$/, "");

    // 1. Priority: JioSaavn
    const jio = await searchJioSaavn(apiUrl, title, artist);
    if (jio) return jio;

    // 2. Fallback: Spotify
    const spotify = await searchSpotify(apiUrl, title, artist);
    if (spotify) return spotify;

    // 3. Fallback: Deezer
    return await searchDeezer(apiUrl, title, artist);
  } catch {
    return null;
  }
}

/**
 * Search JioSaavn
 */
async function searchJioSaavn(baseUrl: string, title: string, artist: string): Promise<MatchResult | null> {
  try {
    const cleanTitle = title
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/&amp;/g, "&")
      .replace(/["'“”]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const cleanArtist = artist
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/&amp;/g, "&")
      .replace(/["'“”]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const queryCandidates = [
      `${cleanTitle} ${cleanArtist}`.trim(),
      cleanTitle,
      `${title} ${artist}`.trim(),
    ].filter(Boolean);

    for (const q of queryCandidates) {
      const url = `${baseUrl}/api/search/songs?query=${encodeURIComponent(q)}&limit=10`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;

      const data = await response.json();
      const results = data.data?.results || data.results || [];
      if (results.length === 0) continue;

      const song = results.find((r: any) => {
        const hasAudio = Array.isArray(r.downloadUrl) ? r.downloadUrl.length > 0 : !!r.downloadUrl;
        const hasImage = Array.isArray(r.image) ? r.image.length > 0 : !!r.image;
        return hasAudio && hasImage;
      });

      if (song) {
        return {
          song,
          confidence: 0.85,
          matchScore: 0.85,
        };
      }
    }

    return null;
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

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = await response.json();
    const results = data.songs || [];
    if (results.length === 0) return null;

    const result = results.find((r: any) => r.audioUrl && r.imageUrl);
    if (!result) return null;

    return {
      song: {
        id: result._id || result.id,
        title: result.title,
        primaryArtists: result.artist,
        album: { name: result.albumId?.title || result.album || "" },
        duration: result.duration,
        image: [{ link: result.imageUrl }],
        downloadUrl: [{ link: result.audioUrl }],
      },
      confidence: 0.8,
      matchScore: 0.8,
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

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = await response.json();
    const results = data.data || [];
    if (results.length === 0) return null;

    const result = results.find((r: any) => r.preview && r.album?.cover_medium);
    if (!result) return null;

    return {
      song: {
        id: result.id?.toString(),
        title: result.title,
        primaryArtists: result.artist?.name || "",
        album: { name: result.album?.title || "" },
        duration: result.duration,
        image: [{ link: result.album?.cover_xl || result.album?.cover_big || result.album?.cover_medium }],
        downloadUrl: [{ link: result.preview }],
      },
      confidence: 0.8,
      matchScore: 0.8,
    };
  } catch {
    return null;
  }
}

/**
 * Get match confidence level
 */
export function getMatchConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 0.7) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}
