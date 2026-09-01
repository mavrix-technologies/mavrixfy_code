import { type Song } from "./musicData";

// ─── Configurable Ranking Weights ─────────────────────────────────────────────
/**
 * Export so weights can be tuned from analytics without touching ranking logic.
 *
 *  relevance  – tiered textual match score (exact → fuzzy)
 *  popularity – log-normalized playCount signal
 *  artist     – how well the query matches the artist name
 *  engagement – API-position proxy for search-engine CTR
 *  recency    – bonus for newer tracks
 *  version    – original vs remix/karaoke/cover penalty
 */
export const RANKING_WEIGHTS = {
  relevance:  0.35,
  popularity: 0.35,
  version:    0.15,
  artist:     0.07,
  engagement: 0.05,
  recency:    0.03,
} as const;

export type RankingWeights = typeof RANKING_WEIGHTS;

// ─── Query Normalization ───────────────────────────────────────────────────────

/**
 * Normalize a raw search query in a multilingual-safe way.
 * NFD decompose strips Latin diacritics only — Devanagari, Gujarati, Punjabi,
 * Tamil etc. are untouched because their code points fall outside U+0300–U+036F.
 */
export function normalizeQuery(text: string): string {
  if (!text) return "";

  let n = text.trim();

  // Decompose Latin diacritics, strip combining marks
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  n = n.toLowerCase();

  // Normalize collaboration markers
  n = n
    .replace(/\s+feat\.?\s+/gi, " feat ")
    .replace(/\s+ft\.?\s+/gi,   " feat ")
    .replace(/\s+featuring\s+/gi, " feat ")
    .replace(/\s+x\s+/g, " feat ");

  // Normalize ampersand
  n = n.replace(/\s*&\s*/g, " and ");

  // Normalize quotes and apostrophes
  n = n.replace(/[''`]/g, "'").replace(/[""]/g, '"');

  // Strip remaining punctuation except apostrophes
  n = n.replace(/[^\w\s']/g, " ");

  // Collapse whitespace
  n = n.replace(/\s+/g, " ").trim();

  return n;
}

/** Backward-compatible alias */
export const normalizeText = normalizeQuery;

// ─── Tokenization ──────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were",
  "of", "in", "on", "at", "to", "for", "with", "by", "from", "that",
  "this", "it", "its", "be", "as", "into", "than", "then", "so",
]);

export function tokenizeQuery(normalizedQuery: string): string[] {
  const all = normalizedQuery
    .split(/[\s\-_/|]+/)
    .flatMap((t) => {
      const cleaned = t.replace(/[^a-z0-9\u0900-\u097f\u0a80-\u0aff\u0a00-\u0a7f\u0b80-\u0bff]/gi, "").trim();
      return cleaned ? [cleaned] : [];
    });

  const meaningful = all.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : all;
}

// ─── Version Classifier ────────────────────────────────────────────────────────

export type SongVersion =
  | "original"
  | "remix"
  | "live"
  | "acoustic"
  | "instrumental"
  | "karaoke"
  | "cover"
  | "extended"
  | "radio_edit"
  | "sped_up"
  | "slowed"
  | "lofi"
  | "mashup"
  | "other_version";

const VERSION_PATTERNS: [SongVersion, RegExp][] = [
  ["karaoke",      /\b(karaoke|without\s+vocals?|minus\s+one|playback)\b/i],
  ["lofi",         /\b(lo-?fi|lofi)\b/i],
  ["sped_up",      /\b(sped[\s-]?up|speed[\s-]?up|nightcore)\b/i],
  ["slowed",       /\b(slowed|slowed\s*[&+]\s*reverb(?:ed)?|reverbed?|slow\s+version)\b/i],
  ["live",         /\b(live\s+at|live\s+from|live\s+version|live\s+recording|concert|tour)\b/i],
  ["acoustic",     /\b(acoustic|unplugged|stripped)\b/i],
  ["instrumental", /\b(instrumental|piano\s+version|orchestral|strings\s+version)\b/i],
  ["cover",        /\b(cover|tribute|in\s+the\s+style\s+of)\b/i],
  ["mashup",       /\b(mashup|medley)\b/i],
  ["remix",        /\b(remix|remixed|club\s+mix|vip\s+mix|flip|dj\s+edit)\b/i],
  ["extended",     /\b(extended\s+(mix|version|cut))\b/i],
  ["radio_edit",   /\b(radio\s+(edit|version|mix)|single\s+version)\b/i],
];

export function classifySongVersion(title: string): SongVersion {
  for (const [version, pattern] of VERSION_PATTERNS) {
    if (pattern.test(title)) return version;
  }
  return "original";
}

export function getVersionScore(version: SongVersion): number {
  const scores: Record<SongVersion, number> = {
    original:      1.00,
    radio_edit:    0.95,
    extended:      0.90,
    acoustic:      0.82,
    live:          0.78,
    remix:         0.75,
    other_version: 0.60,
    lofi:          0.50,
    sped_up:       0.45,
    slowed:        0.45,
    instrumental:  0.30,
    mashup:        0.35,
    cover:         0.25,
    karaoke:       0.10,
  };
  return scores[version];
}

// ─── Fuzzy: Dice Coefficient ───────────────────────────────────────────────────

function getBigramCounts(s: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice coefficient → 0.0 .. 1.0 */
export function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const aBigrams = getBigramCounts(a);
  const bBigrams = getBigramCounts(b);

  let intersection = 0;
  for (const [bg, count] of aBigrams) {
    intersection += Math.min(count, bBigrams.get(bg) ?? 0);
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

// ─── Individual Scorers ────────────────────────────────────────────────────────

/**
 * Tiered relevance score → { score: 0.0..1.0, tier: 1..9 }
 *
 * Tier 1 (1.00) – Exact title match
 * Tier 2 (0.85) – Title starts-with query
 * Tier 3 (0.70) – All query tokens in title
 * Tier 4 (0.40–0.65) – Majority of tokens in title (proportional)
 * Tier 5 (0.55) – Full query is substring of title
 * Tier 6 (0.20–0.45) – Artist name match
 * Tier 7 (0.12–0.28) – Fuzzy / Dice ≥ 0.35
 * Tier 8 (0.10) – Album / weak match only
 * Tier 9 (0.00) – No match
 */
function scoreRelevance(
  title: string,
  artist: string,
  album: string,
  nq: string,
  queryTokens: string[]
): { score: number; tier: number } {
  if (title === nq) return { score: 1.00, tier: 1 };
  if (title.startsWith(nq)) return { score: 0.85, tier: 2 };

  const titleTokenSet = new Set(title.split(/\s+/));
  const matchedTokens = queryTokens.filter((t) => titleTokenSet.has(t));
  const tokenRatio = queryTokens.length > 0 ? matchedTokens.length / queryTokens.length : 0;

  if (queryTokens.length > 0 && matchedTokens.length === queryTokens.length) {
    return { score: 0.70, tier: 3 };
  }

  if (queryTokens.length > 1 && tokenRatio >= 0.6) {
    return { score: 0.40 + tokenRatio * 0.25, tier: 4 };
  }

  if (title.includes(nq)) return { score: 0.55, tier: 5 };

  if (artist === nq)          return { score: 0.45, tier: 6 };
  if (artist.startsWith(nq)) return { score: 0.38, tier: 6 };
  if (artist.includes(nq))   return { score: 0.30, tier: 6 };

  const artistTokenSet = new Set(artist.split(/\s+/));
  const artistMatchRatio = queryTokens.length > 0
    ? queryTokens.filter((t) => artistTokenSet.has(t)).length / queryTokens.length
    : 0;
  if (artistMatchRatio >= 0.5) {
    return { score: 0.20 + artistMatchRatio * 0.15, tier: 6 };
  }

  const dice = diceCoefficient(title, nq);
  if (dice >= 0.5)  return { score: dice * 0.55, tier: 7 };
  if (dice >= 0.35) return { score: dice * 0.35, tier: 7 };

  if (album && album.includes(nq)) return { score: 0.10, tier: 8 };

  return { score: 0, tier: 9 };
}

const MAX_LOG_PLAY_COUNT = Math.log10(10_000_000);

function scorePopularity(playCount: number | undefined): number {
  if (!playCount || playCount <= 0) return 0;
  return Math.min(1.0, Math.log10(playCount + 1) / MAX_LOG_PLAY_COUNT);
}

const REFERENCE_YEAR = new Date().getFullYear();

function scoreRecency(year: string | undefined): number {
  if (!year) return 0.3;
  const y = parseInt(year, 10);
  if (isNaN(y)) return 0.3;
  const age = Math.max(0, REFERENCE_YEAR - y);
  if (age === 0) return 1.0;
  if (age >= 15) return 0.10;
  return Math.max(0.10, 1.0 - age / 15);
}

function scoreArtist(artist: string, nq: string, queryTokens: string[]): number {
  if (artist === nq)          return 1.00;
  if (artist.startsWith(nq)) return 0.85;
  if (artist.includes(nq))   return 0.65;

  const artistTokenSet = new Set(artist.split(/\s+/));
  const matched = queryTokens.filter((t) => artistTokenSet.has(t));
  if (matched.length > 0) return 0.40 * (matched.length / queryTokens.length);

  return 0;
}

// ─── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Build a canonical fingerprint.
 * Strips parenthetical metadata but preserves version so
 * "Song (Original)" and "Song (Remix)" keep separate fingerprints.
 */
export function songFingerprint(song: Song): string {
  const version = classifySongVersion(song.title);
  const t = normalizeQuery(song.title)
    .replace(/\(.*?\)/g, " ")
    .replace(/\[.*?\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const a = normalizeQuery(song.artist)
    .split(/,|feat\.|&/)[0]
    .trim();
  return `${t}::${a}::${version}`;
}

/**
 * Deduplicate by fingerprint — prefer jiosaavn > local > youtube by playCount.
 */
export function deduplicateSongs(songs: Song[]): Song[] {
  const groups = new Map<string, Song[]>();

  for (const song of songs) {
    const fp = songFingerprint(song);
    const existing = groups.get(fp);
    if (existing) {
      existing.push(song);
    } else {
      groups.set(fp, [song]);
    }
  }

  const result: Song[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    group.sort((a, b) => {
      const pri = (s: Song) =>
        s.source === "jiosaavn" ? 3 :
        s.source === "local"    ? 2 :
        s.source === "youtube"  ? 1 : 0;
      const diff = pri(b) - pri(a);
      if (diff !== 0) return diff;
      return (b.playCount ?? 0) - (a.playCount ?? 0);
    });
    result.push(group[0]);
  }

  return result;
}

// ─── Main Ranking Engine ───────────────────────────────────────────────────────

/**
 * Rank songs using a configurable, tier-protected composite score.
 *
 * GUARANTEE: Popularity CANNOT promote a weaker textual match above a stronger
 * one across tier boundaries. The sort is primary=tier (lower=better),
 * secondary=finalScore (higher=better).
 *
 * @param pinnedSongId - Optional JioSaavn song ID to always place at position #0.
 *   Use for the topQuery result so JioSaavn's own best-match judgment is honored.
 */
export function rankSongs(
  songs: Song[],
  query: string,
  weights: Partial<RankingWeights> = {},
  pinnedSongId?: string | null
): Song[] {
  const nq = normalizeQuery(query);
  if (!nq) return songs;

  const W: RankingWeights = { ...RANKING_WEIGHTS, ...weights };
  const queryTokens = tokenizeQuery(nq);

  const scored = songs.map((song, originalIndex) => {
    const title  = normalizeQuery(song.title);
    const artist = normalizeQuery(song.artist);
    const album  = normalizeQuery(song.album ?? "");

    const version           = classifySongVersion(song.title);
    const vs                = getVersionScore(version);
    const { score: rel, tier } = scoreRelevance(title, artist, album, nq, queryTokens);
    const pop               = scorePopularity(song.playCount);
    const art               = scoreArtist(artist, nq, queryTokens);
    const rec               = scoreRecency(song.year);
    const eng               = Math.max(0, 1 - originalIndex / Math.max(songs.length, 1));

    const finalScore =
      rel * W.relevance   +
      pop * W.popularity  +
      art * W.artist      +
      eng * W.engagement  +
      rec * W.recency     +
      vs  * W.version;

    return { song, finalScore, tier };
  });

  // Tier-protected sort: tier first, score second
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.finalScore - a.finalScore;
  });

  const ranked = scored.map((item) => item.song);

  // Pin the topQuery song to position #0 only if it is a legitimate top match
  // and does not displace a much more popular official original track.
  if (pinnedSongId && ranked.length > 0) {
    const pinnedIndex = ranked.findIndex((s) => s.id === pinnedSongId);
    if (pinnedIndex > 0) {
      const pinned = ranked[pinnedIndex];
      const topNatural = ranked[0];
      const pinnedVersion = classifySongVersion(pinned.title);
      const topVersion = classifySongVersion(topNatural.title);

      const isPinnedCoverOrInstrumental =
        pinnedVersion === "instrumental" ||
        pinnedVersion === "cover" ||
        pinnedVersion === "karaoke" ||
        pinnedVersion === "sped_up" ||
        pinnedVersion === "slowed";

      const topIsMuchMorePopular =
        (topNatural.playCount || 0) > (pinned.playCount || 0) * 5 &&
        (topNatural.playCount || 0) > 20000 &&
        topVersion === "original";

      if (!isPinnedCoverOrInstrumental && !topIsMuchMorePopular) {
        ranked.splice(pinnedIndex, 1);
        ranked.unshift(pinned);
      }
    }
  }

  return ranked;
}

// ─── Structured Query Parser ───────────────────────────────────────────────────

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
  const parsed: ParsedQuery = { raw: query, freeText: "" };
  let remaining = query.trim();

  const patterns: [keyof Omit<ParsedQuery, "raw" | "freeText">, RegExp][] = [
    ["isrc",   /\bisrc:([A-Z]{2}[A-Z0-9]{3}\d{7})\b/i],
    ["year",   /\byear:(\d{4})\b/i],
    ["track",  /\btrack:(?:"([^"]+)"|'([^']+)'|([^\s:]+))/i],
    ["artist", /\bartist:(?:"([^"]+)"|'([^']+)'|([^\s:]+))/i],
    ["album",  /\balbum:(?:"([^"]+)"|'([^']+)'|([^\s:]+))/i],
  ];

  for (const [key, pattern] of patterns) {
    const match = remaining.match(pattern);
    if (match) {
      const val = match[1] || match[2] || match[3];
      if (val) parsed[key] = val.trim();
      remaining = remaining.replace(match[0], " ");
    }
  }

  parsed.freeText = remaining.replace(/\s+/g, " ").trim();
  return parsed;
}


