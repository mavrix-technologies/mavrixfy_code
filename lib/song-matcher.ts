import { MatchResult } from "@/types/import";
import { getApiUrl } from "./api-config";

/**
 * Search for song details using JioSaavn API with enhanced matching
 */
export async function searchSong(title: string, artist: string, album?: string): Promise<MatchResult | null> {
  try {
    const apiUrl = getApiUrl();
    
    // Remove trailing slash if present
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    
    // Create multiple search queries with priority order
    const queries = [];
    
    // Priority 1: Full query with album (most specific)
    if (album) {
      queries.push(`${title} ${artist} ${album}`.trim());
    }
    
    // Priority 2: Title + Artist (most common)
    queries.push(`${title} ${artist}`.trim());
    
    // Priority 3: Artist + Title (alternative order)
    queries.push(`${artist} ${title}`.trim());
    
    // Priority 4: Title only (fallback)
    queries.push(title.trim());

    let bestMatch: any = null;
    let bestScore = 0;
    let allResults: any[] = [];

    // Try each query and collect all results
    for (const searchQuery of queries) {
      const url = `${baseUrl}/api/jiosaavn/search/songs?query=${encodeURIComponent(searchQuery)}&limit=10`;
      
      try {
        const response = await fetch(url);

        if (!response.ok) {
          try {
            await response.text();
          } catch {
            // Best effort only
          }
          continue;
        }

        const data = await response.json();
        
        // Handle both response formats
        const results = data.data?.results || data.results || [];

        if (results.length > 0) {
          // Filter results that have downloadUrl and image
          const validResults = results.filter((r: any) => {
            const hasDownloadUrl = Array.isArray(r.downloadUrl) 
              ? r.downloadUrl.length > 0 
              : !!r.downloadUrl;
            const hasImage = Array.isArray(r.image) 
              ? r.image.length > 0 
              : !!r.image;
            return hasDownloadUrl && hasImage;
          });
          
          allResults.push(...validResults);
        }

        // If we found results with the first query, prioritize them
        if (allResults.length > 0 && queries.indexOf(searchQuery) === 0) {
          break;
        }
      } catch (error) {
        continue;
      }
    }

    // Remove duplicates based on song ID
    const uniqueResults = Array.from(
      new Map(allResults.map(item => [item.id, item])).values()
    );

    // Score all unique results
    for (const result of uniqueResults.slice(0, 15)) {
      const score = calculateMatchScore(
        { title, artist, album },
        { 
          title: result.title || result.name, 
          artist: result.artist || result.primaryArtists || result.singers || '', 
          album: result.album?.name || result.album || '' 
        },
        result // Pass full result for additional checks
      );

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    // Only return if we have a reasonable match
    if (bestMatch && bestScore >= 0.35) { // Lowered threshold slightly for better recall
      return {
        song: bestMatch,
        confidence: bestScore,
        matchScore: bestScore
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate similarity score between two songs with enhanced verification
 */
export function calculateMatchScore(
  original: { title: string; artist: string; album?: string },
  candidate: { title: string; artist: string; album?: string },
  fullResult?: any // Full API result for additional checks
): number {
  let score = 0;
  let maxScore = 0;

  // Title matching (most important - 45% weight)
  maxScore += 45;
  const titleSimilarity = stringSimilarity(
    normalizeString(original.title),
    normalizeString(candidate.title)
  );
  score += titleSimilarity * 45;

  // Artist matching (35% weight)
  maxScore += 35;
  const artistSimilarity = stringSimilarity(
    normalizeString(original.artist),
    normalizeString(candidate.artist)
  );
  score += artistSimilarity * 35;

  // Album matching (15% weight, if available)
  if (original.album && candidate.album) {
    maxScore += 15;
    const albumSimilarity = stringSimilarity(
      normalizeString(original.album),
      normalizeString(candidate.album)
    );
    score += albumSimilarity * 15;
  }

  // Bonus points for quality indicators (5% weight)
  maxScore += 5;
  let qualityBonus = 0;

  if (fullResult) {
    // Prefer songs with higher play count (indicates popularity/official version)
    if (fullResult.playCount && fullResult.playCount > 1000000) {
      qualityBonus += 2;
    } else if (fullResult.playCount && fullResult.playCount > 100000) {
      qualityBonus += 1;
    }

    // Prefer songs with year information (indicates official release)
    if (fullResult.year) {
      qualityBonus += 1;
    }

    // Prefer songs with explicit flag (indicates official metadata)
    if (fullResult.hasLyrics || fullResult.copyright) {
      qualityBonus += 1;
    }

    // Penalize remixes, covers, or live versions if not in original title
    const candidateTitle = normalizeString(candidate.title);
    const originalTitle = normalizeString(original.title);
    const isRemixOrCover = candidateTitle.includes('remix') || 
                           candidateTitle.includes('cover') || 
                           candidateTitle.includes('live') ||
                           candidateTitle.includes('acoustic') ||
                           candidateTitle.includes('version');
    const originalIsRemixOrCover = originalTitle.includes('remix') || 
                                    originalTitle.includes('cover') || 
                                    originalTitle.includes('live') ||
                                    originalTitle.includes('acoustic') ||
                                    originalTitle.includes('version');
    
    if (isRemixOrCover && !originalIsRemixOrCover) {
      qualityBonus -= 2; // Penalize if candidate is remix but original isn't
    }
  }

  score += Math.max(0, Math.min(qualityBonus, 5)); // Cap bonus at 5

  return score / maxScore;
}

/**
 * Normalize string for comparison with enhanced cleaning
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove content in parentheses
    .replace(/\[.*?\]/g, '') // Remove content in brackets
    .replace(/feat\.?|ft\.?/gi, '') // Remove featuring
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function stringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  // Check if one string contains the other
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.8;
  }

  // Calculate Levenshtein distance
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Get match confidence level
 */
export function getMatchConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}
