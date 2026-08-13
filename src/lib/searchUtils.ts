/**
 * Advanced Music Search Utilities — Indian Music Ranking
 *
 * Ranking philosophy:
 *   - JioSaavn playCount is the PRIMARY popularity signal.
 *     It reflects real Indian listener behavior directly.
 *   - Last.fm is used ONLY for version-type detection via tags
 *     (remix / lofi / slowed / cover → penalty).
 *     Last.fm listener/playcount numbers are NOT used for ranking
 *     because Last.fm is Western-biased and severely undercounts
 *     Indian music (e.g. Dino James "Dooriyan" = 183 Last.fm
 *     listeners but millions of JioSaavn plays).
 *
 * Final score formula:
 *   textMatch      * 0.55   — title relevance to query
 *   + jiosaavnPop  * 0.45   — JioSaavn playCount (Indian popularity)
 *   + originalBoost         — +30 original, penalty for remix/cover/lofi
 *   + intentBoost           — exact-lookup bonus
 *   + artistMatchBoost      — query words match artist name
 */

import { Song } from "./musicData";
import { mapFilter } from "@/lib/arrayUtils";

export function normalizeText(text: string): string {
  if (!text) return "";
  let normalized = text.toLowerCase();
  normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  normalized = normalized
    .replace(/\s+feat\.?\s+/gi, " feat ")
    .replace(/\s+ft\.?\s+/gi, " feat ")
    .replace(/\s+featuring\s+/gi, " feat ");
  normalized = normalized.replace(/\s+&\s+/g, " and ");
  normalized = normalized.replace(/[^\w\s]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

function detectVersionType(title: string): {
  isOriginal: boolean;
  penalty: number;
  versionType: string;
} {
  const versionPatterns = [
    { pattern: /\b(remix|remixed|rmx)\b/i,                    penalty: 25, type: "remix" },
    { pattern: /\b(lofi|lo-fi|lo fi)\b/i,                     penalty: 25, type: "lofi" },
    { pattern: /\b(slowed|reverb|slowed\s*\+?\s*reverb)\b/i,  penalty: 25, type: "slowed" },
    { pattern: /\b(cover|covered by)\b/i,                     penalty: 20, type: "cover" },
    { pattern: /\b(instrumental|karaoke)\b/i,                  penalty: 20, type: "instrumental" },
    { pattern: /\b(8d|8d audio|3d audio)\b/i,                 penalty: 22, type: "8d" },
    { pattern: /\b(nightcore|sped up|speed up)\b/i,           penalty: 22, type: "nightcore" },
    { pattern: /\b(mashup)\b/i,                               penalty: 15, type: "mashup" },
    { pattern: /\b(live|concert)\b/i,                         penalty: 12, type: "live" },
    { pattern: /\b(acoustic)\b/i,                             penalty: 10, type: "acoustic" },
    { pattern: /\b(version|ver\.)\b/i,                        penalty: 5,  type: "version" },
  ];
  for (const { pattern, penalty, type } of versionPatterns) {
    if (pattern.test(title)) return { isOriginal: false, penalty, versionType: type };
  }
  return { isOriginal: true, penalty: 0, versionType: "original" };
}

function detectQueryIntent(query: string): {
  intent: "exact_lookup" | "broad_search";
  isModified: boolean;
} {
  const normalized = normalizeText(query);
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const hasModifiers = /\b(remix|lofi|slowed|cover|live|acoustic|version)\b/i.test(query);
  if (words.length >= 1 && words.length <= 3 && !hasModifiers) {
    return { intent: "exact_lookup", isModified: false };
  }
  return { intent: "broad_search", isModified: hasModifiers };
}

function calculateTextMatchScore(
  songTitle: string,
  songArtist: string,
  query: string
): number {
  const normalizedTitle  = normalizeText(songTitle);
  const normalizedArtist = normalizeText(songArtist);
  const normalizedQuery  = normalizeText(query);

  if (normalizedTitle === normalizedQuery) return 100;

  const queryWords  = normalizedQuery.split(/\s+/);
  const titleWords  = normalizedTitle.split(/\s+/);
  const artistWords = normalizedArtist.split(/\s+/);

  if (queryWords.length > 1) {
    const titleMatches  = queryWords.filter(qw => titleWords.some(tw => tw.includes(qw) || qw.includes(tw)));
    const artistMatches = queryWords.filter(qw => artistWords.some(aw => aw.includes(qw) || qw.includes(aw)));
    if (titleMatches.length > 0 && artistMatches.length > 0) return 95;
  }

  if (normalizedTitle.startsWith(normalizedQuery)) return 50;
  if (normalizedTitle.includes(normalizedQuery))   return 20;

  const allWordsMatch  = queryWords.every(qw => titleWords.some(tw => tw.includes(qw) || qw.includes(tw)));
  if (allWordsMatch) return 15;

  const someWordsMatch = queryWords.some(qw => titleWords.some(tw => tw.includes(qw) || qw.includes(tw)));
  if (someWordsMatch) return 10;

  return 0;
}

/**
 * Detect provider from song properties
 * JioSaavn: numeric IDs, jiosaavn.com URLs
 * Gaana: alphanumeric IDs with hyphens, gaana.com URLs
 */
function detectProvider(song: Song): 'jiosaavn' | 'gaana' | 'unknown' {
  // Check source field first (for local/youtube tracking)
  if (song.source === "jiosaavn") return 'jiosaavn';
  if (song.source === "gaana") return 'gaana';
  
  // Check URL (most reliable)
  const url = (song as any).url || '';
  if (url.includes('jiosaavn.com')) return 'jiosaavn';
  if (url.includes('gaana.com')) return 'gaana';
  
  // Check ID pattern (JioSaavn = numeric, Gaana = alphanumeric)
  if (/^\d+$/.test(song.id || "")) return 'jiosaavn';
  if (/^[a-z0-9-]+$/.test(song.id || "")) return 'gaana';
  
  return 'unknown';
}

/**
 * JioSaavn playCount → 0–50 score (log scale).
 *
 *   500M plays → 50
 *   100M plays → 44
 *   10M  plays → 37
 *   1M   plays → 30
 *   100K plays → 22
 *   10K  plays → 15
 *   1K   plays → 7
 */
function calculatePopularityScore(song: Song): number {
  if (song.playCount && song.playCount > 0) {
    return Math.min(50, Math.max(0, (Math.log10(song.playCount) / 9) * 50));
  }
  // Baseline popularity for Gaana songs without JioSaavn playCount metrics
  const provider = detectProvider(song);
  if (provider === 'gaana') {
    return 35;
  }
  // No playCount fallback — year recency only
  if (song.year) {
    const diff = new Date().getFullYear() - parseInt(song.year);
    if (!isNaN(diff)) {
      if (diff <= 2)  return 18;
      if (diff <= 5)  return 12;
      if (diff <= 10) return 6;
    }
  }
  return 20;
}

/**
 * Final score — Indian-first ranking.
 *
 * Uses JioSaavn playCount as the primary popularity signal and
 * title pattern matching for version-type detection.
 */
function calculateFinalScore(
  song: Song,
  query: string,
  queryIntent: ReturnType<typeof detectQueryIntent>
): number {
  const textMatchScore = calculateTextMatchScore(song.title, song.artist, query);

  // Version detection via title patterns
  const versionInfo = detectVersionType(song.title);
  const originalBoost = versionInfo.isOriginal ? 30 : -versionInfo.penalty;

  // JioSaavn playCount — the only popularity signal that matters for Indian music
  const jiosaavnScore = calculatePopularityScore(song);

  let intentBoost = 0;
  if (queryIntent.intent === "exact_lookup") {
    if (textMatchScore >= 95) intentBoost = 50;
    else if (textMatchScore >= 50) intentBoost = 20;
  }

  const queryWords  = normalizeText(query).split(/\s+/);
  const artistWords = normalizeText(song.artist).split(/\s+/);
  const artistMatchCount = queryWords.filter(qw =>
    artistWords.some(aw => aw.includes(qw) || qw.includes(aw))
  ).length;
  const artistMatchBoost = artistMatchCount > 0 ? artistMatchCount * 15 : 0;

  return (
    textMatchScore  * 0.55 +
    originalBoost          +
    jiosaavnScore   * 0.45 +
    intentBoost            +
    artistMatchBoost
  );
}

/**
 * Rank songs — Indian-first, using JioSaavn playCount + title pattern matching.
 */
export function rankSongs(
  songs: Song[],
  query: string,
  minScore: number = 0
): Array<{ song: Song; score: number; isBestMatch: boolean }> {
  const queryIntent = detectQueryIntent(query);

  const scored = mapFilter(songs, song => {
    return {
      song,
      score:      calculateFinalScore(song, query, queryIntent),
      versionInfo: detectVersionType(song.title),
      textMatch:  calculateTextMatchScore(song.title, song.artist, query),
      jiosaavnPop: calculatePopularityScore(song),
    };
  }, item => item.score >= minScore);

  scored.sort((a, b) => {
    // 1. Clear score gap (allow multi-provider interleaving for scores within 15 points)
    if (Math.abs(a.score - b.score) > 15) return b.score - a.score;

    // 2. Original beats remix/cover within gap
    if (a.versionInfo.isOriginal !== b.versionInfo.isOriginal)
      return a.versionInfo.isOriginal ? -1 : 1;

    // 3. Better text match
    if (a.textMatch !== b.textMatch) return b.textMatch - a.textMatch;

    // 4. Preserve multi-provider interleaved order if scores are close
    return 0;
  });

  return scored.map((item, index) => ({
    song:        item.song,
    score:       item.score,
    isBestMatch: index === 0 && item.score >= 50 && item.versionInfo.isOriginal,
  }));
}

export interface ParsedQuery {
  raw: string;
  track?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  year?: string;
  freeText: string;
}

export function parseStructuredQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = { raw: query, freeText: query };
  const patterns = {
    track:  /track:([^\s]+(?:\s+[^\s:]+)*?)(?:\s+\w+:|$)/i,
    artist: /artist:([^\s]+(?:\s+[^\s:]+)*?)(?:\s+\w+:|$)/i,
    album:  /album:([^\s]+(?:\s+[^\s:]+)*?)(?:\s+\w+:|$)/i,
    isrc:   /isrc:([A-Z]{2}[A-Z0-9]{3}\d{7})/i,
    year:   /year:(\d{4})/i,
  };
  let remaining = query;
  for (const [field, pattern] of Object.entries(patterns)) {
    const match = remaining.match(pattern);
    if (match) {
      parsed[field as keyof ParsedQuery] = match[1].trim();
      remaining = remaining.replace(match[0], "").trim();
    }
  }
  parsed.freeText = remaining.trim();
  return parsed;
}

const DEFAULT_WEIGHTS = {
  exactMatch: 100, startsWithMatch: 50, containsMatch: 20,
  originalBoost: 30, remixPenalty: -25, lofiPenalty: -25,
  slowedPenalty: -25, coverPenalty: -20, livePenalty: -12,
  jiosaavnPopularity: 0.45, textMatch: 0.55, intentBoost: 50,
};
