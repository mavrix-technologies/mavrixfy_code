import { type MatchResult,type ParsedSong } from "@/types/import";
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
    return await searchJioSaavn(apiUrl, title, artist);
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
 * Get match confidence level
 */
export function getMatchConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 0.7) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}
