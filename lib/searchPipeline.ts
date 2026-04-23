import { convertJioSaavnSong, Song } from "@/lib/musicData";

export type SearchJsonRecord = Record<string, unknown>;

interface RankedSongCandidate {
  song: Song;
  id: string;
  title: string;
  canonicalTitle: string;
  normalizedTitle: string;
  normalizedArtist: string;
  playCount: number;
  year: number;
  metadataScore: number;
  isVariant: boolean;
  originalPriority: number;
  matchScore: number;
}

export interface SearchPlan {
  originalQuery: string;
  normalizedQuery: string;
  retrievalQueries: string[];
}

export interface RankedSongResults {
  correctedQuery: string;
  corrected: boolean;
  songs: Song[];
  candidateCount: number;
}

const VARIANT_KEYWORDS_PATTERN =
  "\\b(remix|version|edit|mix|dj|slowed|reverb|cover|acoustic|live|instrumental|karaoke|nightcore|lo[-\\s]?fi|sped[-\\s]?up|mashup)\\b";

const VARIANT_KEYWORDS_REGEX = new RegExp(VARIANT_KEYWORDS_PATTERN, "gi");
const VARIANT_KEYWORDS_TEST_REGEX = new RegExp(VARIANT_KEYWORDS_PATTERN, "i");

const NOISE_KEYWORDS_REGEX =
  /\b(official|audio|video|lyrics?|full|track|song)\b/gi;

const LEVENSHTEIN_MAX_COMPARE_LENGTH = 64;
const MIN_CORRECTION_SIMILARITY = 0.72;
const MIN_RESULT_SIMILARITY = 0.34;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSearchText(value: string): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/feat\.?|ft\.?/gi, " ")
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVariantTitle(title: string): boolean {
  return VARIANT_KEYWORDS_TEST_REGEX.test(normalizeSearchText(title));
}

function getCanonicalTitle(title: string): string {
  const withoutBrackets = title.replace(/[\(\[\{].*?[\)\]\}]/g, " ");
  return normalizeSearchText(withoutBrackets)
    .replace(VARIANT_KEYWORDS_REGEX, " ")
    .replace(NOISE_KEYWORDS_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPlayCount(raw: SearchJsonRecord): number {
  return Math.max(
    toFiniteNumber(raw.playCount),
    toFiniteNumber(raw.play_count),
    0
  );
}

function getYear(raw: SearchJsonRecord): number {
  const directYear = String(raw.year ?? "").trim();
  const releaseDate = String(raw.releaseDate ?? raw.release_date ?? "").trim();
  const combined = `${directYear} ${releaseDate}`;
  const match = combined.match(/\b(19\d{2}|20\d{2})\b/);
  const parsed = match ? Number(match[1]) : 0;
  const currentYear = new Date().getFullYear() + 1;
  if (!Number.isFinite(parsed) || parsed < 1900 || parsed > currentYear) return 0;
  return parsed;
}

function getArtistName(raw: SearchJsonRecord): string {
  const fromString = asString(raw.primaryArtists || raw.singers || raw.artist);
  if (fromString) return fromString;

  const artists = raw.artists;
  if (!artists || typeof artists !== "object") return "";
  const primary = (artists as { primary?: unknown }).primary;
  if (!Array.isArray(primary)) return "";

  const names = primary
    .map((entry) =>
      entry && typeof entry === "object"
        ? asString((entry as { name?: unknown }).name)
        : ""
    )
    .filter(Boolean);

  return names.join(", ");
}

function getAlbumName(raw: SearchJsonRecord): string {
  const album = raw.album;
  if (typeof album === "string") return album.trim();
  if (album && typeof album === "object") {
    return asString((album as { name?: unknown }).name);
  }
  return "";
}

export function getStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;

  const left = a.slice(0, LEVENSHTEIN_MAX_COMPARE_LENGTH);
  const right = b.slice(0, LEVENSHTEIN_MAX_COMPARE_LENGTH);
  const lenA = left.length;
  const lenB = right.length;
  const matrix: number[][] = Array.from({ length: lenA + 1 }, () =>
    new Array(lenB + 1).fill(0)
  );

  for (let i = 0; i <= lenA; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= lenA; i += 1) {
    for (let j = 1; j <= lenB; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[lenA][lenB];
  const maxLength = Math.max(lenA, lenB);
  return maxLength > 0 ? 1 - distance / maxLength : 0;
}

function getMatchScore(
  queryNormalized: string,
  normalizedTitle: string,
  canonicalTitle: string,
  normalizedArtist: string,
  album: string
): number {
  const normalizedAlbum = normalizeSearchText(album);
  const titleScore = Math.max(
    getStringSimilarity(queryNormalized, normalizedTitle),
    getStringSimilarity(queryNormalized, canonicalTitle)
  );
  const artistScore = getStringSimilarity(queryNormalized, normalizedArtist) * 0.2;
  const albumScore = getStringSimilarity(queryNormalized, normalizedAlbum) * 0.12;
  return Math.max(0, Math.min(1, titleScore + artistScore + albumScore));
}

function addAspiratedVariants(term: string, candidates: Set<string>) {
  if (!term || term.length < 3) return;

  // Common Indian transliteration typo support: "d" vs "dh", "t" vs "th".
  for (let i = 0; i < term.length; i += 1) {
    const char = term[i];
    const next = term[i + 1] ?? "";
    if ("bdgkpctj".includes(char) && next !== "h") {
      candidates.add(`${term.slice(0, i + 1)}h${term.slice(i + 1)}`);
    }
    if ("bdgkpctj".includes(char) && next === "h") {
      candidates.add(`${term.slice(0, i + 1)}${term.slice(i + 2)}`);
    }
  }
}

export function createSearchPlan(searchQuery: string): SearchPlan {
  const originalQuery = searchQuery.trim().replace(/\s+/g, " ");
  const normalizedQuery = normalizeSearchText(originalQuery);
  if (normalizedQuery.length < 2) {
    return { originalQuery, normalizedQuery, retrievalQueries: [] };
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const candidates = new Set<string>([originalQuery, normalizedQuery]);

  if (tokens.length === 1) {
    const term = tokens[0];
    addAspiratedVariants(term, candidates);
    if (term.length >= 5) candidates.add(term.slice(0, -1));
    if (term.length >= 7) candidates.add(term.slice(0, -2));
    if (term.length >= 6) {
      candidates.add(term.slice(0, Math.max(4, Math.floor(term.length * 0.75))));
    }
  } else {
    candidates.add(tokens.slice(0, 2).join(" "));
    if (tokens[0]) candidates.add(tokens[0]);
    tokens.forEach((token) => addAspiratedVariants(token, candidates));
    addAspiratedVariants(tokens.join(""), candidates);
  }

  return {
    originalQuery,
    normalizedQuery,
    retrievalQueries: Array.from(candidates)
      .filter((candidate) => candidate.length >= 2)
      .slice(0, 8),
  };
}

export function extractSongResults(payload: unknown): SearchJsonRecord[] {
  if (!payload || typeof payload !== "object") return [];

  const root = payload as {
    data?: { results?: unknown };
    results?: unknown;
  };

  const results = Array.isArray(root.data?.results)
    ? root.data.results
    : Array.isArray(root.results)
      ? root.results
      : [];

  return results.filter(
    (item): item is SearchJsonRecord => Boolean(item) && typeof item === "object"
  );
}

function buildCandidate(
  raw: SearchJsonRecord,
  queryNormalized: string
): RankedSongCandidate | null {
  const id = asString(raw.id);
  if (!id) return null;

  const sourceTitle = asString(raw.name || raw.title);
  if (!sourceTitle) return null;

  const converted = convertJioSaavnSong(
    raw as unknown as Parameters<typeof convertJioSaavnSong>[0]
  );
  const title = converted.title?.trim() || sourceTitle;
  const artist = converted.artist?.trim() || getArtistName(raw) || "Unknown Artist";
  const album = converted.album?.trim() || getAlbumName(raw);
  const normalizedTitle = normalizeSearchText(title);
  const canonicalTitle = getCanonicalTitle(title) || normalizedTitle;
  const normalizedArtist = normalizeSearchText(artist);
  const isVariant = isVariantTitle(title);
  const playCount = getPlayCount(raw);
  const year = getYear(raw);
  const hasArtist = normalizedArtist.length > 0 && !normalizedArtist.includes("unknown artist");
  const hasAlbum = normalizeSearchText(album).length > 0;
  const hasOfficialFlag =
    Boolean(raw.isOfficial === true || raw.official === true || raw.isOriginal === true) ||
    asString(raw.copyright).length > 0 ||
    asString(raw.label).length > 0;

  return {
    song: {
      ...converted,
      title,
      artist,
      album,
    },
    id,
    title,
    canonicalTitle,
    normalizedTitle,
    normalizedArtist,
    playCount,
    year,
    metadataScore:
      Number(hasArtist) +
      Number(hasAlbum) +
      Number(year > 0) +
      Number(hasOfficialFlag),
    isVariant,
    originalPriority: isVariant
      ? 0
      : hasOfficialFlag
        ? 3
        : hasArtist && hasAlbum
          ? 2
          : 1,
    matchScore: getMatchScore(
      queryNormalized,
      normalizedTitle,
      canonicalTitle,
      normalizedArtist,
      album
    ),
  };
}

function compareCandidates(a: RankedSongCandidate, b: RankedSongCandidate): number {
  if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
  if (b.originalPriority !== a.originalPriority) {
    return b.originalPriority - a.originalPriority;
  }
  if (b.playCount !== a.playCount) return b.playCount - a.playCount;
  if (b.metadataScore !== a.metadataScore) return b.metadataScore - a.metadataScore;
  if (b.year !== a.year) return b.year - a.year;
  return a.title.localeCompare(b.title);
}

function withMatchScore(
  candidate: RankedSongCandidate,
  queryNormalized: string
): RankedSongCandidate {
  return {
    ...candidate,
    matchScore: getMatchScore(
      queryNormalized,
      candidate.normalizedTitle,
      candidate.canonicalTitle,
      candidate.normalizedArtist,
      candidate.song.album
    ),
  };
}

function findCorrectedQuery(
  normalizedQuery: string,
  candidates: RankedSongCandidate[]
): string {
  let bestCorrection = normalizedQuery;
  let bestScore = 0;

  for (const candidate of candidates) {
    const target = candidate.canonicalTitle || candidate.normalizedTitle;
    if (!target || target === normalizedQuery) continue;

    const similarity = Math.max(
      getStringSimilarity(normalizedQuery, target),
      getStringSimilarity(normalizedQuery, candidate.normalizedTitle)
    );
    const qualityBoost =
      candidate.originalPriority * 0.03 +
      Math.min(Math.log10(candidate.playCount + 1) / 100, 0.07);
    const correctionScore = similarity + qualityBoost;

    if (similarity >= MIN_CORRECTION_SIMILARITY && correctionScore > bestScore) {
      bestScore = correctionScore;
      bestCorrection = target;
    }
  }

  return bestCorrection;
}

export function rankSongsTopK(
  query: string,
  rawResults: SearchJsonRecord[],
  limit = 20
): RankedSongResults {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return { correctedQuery: "", corrected: false, songs: [], candidateCount: 0 };
  }

  const candidateById = new Map<string, RankedSongCandidate>();
  for (const raw of rawResults) {
    const candidate = buildCandidate(raw, normalizedQuery);
    if (!candidate) continue;
    const existing = candidateById.get(candidate.id);
    if (!existing || compareCandidates(candidate, existing) < 0) {
      candidateById.set(candidate.id, candidate);
    }
  }

  const firstPassCandidates = Array.from(candidateById.values());
  if (firstPassCandidates.length === 0) {
    return {
      correctedQuery: normalizedQuery,
      corrected: false,
      songs: [],
      candidateCount: 0,
    };
  }

  const correctedQuery = findCorrectedQuery(normalizedQuery, firstPassCandidates);
  const rankedCandidates =
    correctedQuery === normalizedQuery
      ? firstPassCandidates
      : firstPassCandidates.map((candidate) => withMatchScore(candidate, correctedQuery));

  const grouped = new Map<string, RankedSongCandidate[]>();
  for (const candidate of rankedCandidates) {
    const key = candidate.canonicalTitle || candidate.normalizedTitle || candidate.id;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(candidate);
    } else {
      grouped.set(key, [candidate]);
    }
  }

  const orderedGroups = Array.from(grouped.values()).map((items) => {
    const sorted = [...items].sort(compareCandidates);
    return { top: sorted[0], items: sorted };
  });

  orderedGroups.sort((left, right) => compareCandidates(left.top, right.top));

  const flattened = orderedGroups.flatMap((group) => group.items);
  const filtered = flattened.filter(
    (candidate, index) => candidate.matchScore >= MIN_RESULT_SIMILARITY || index < 3
  );
  const chosen = filtered.length > 0 ? filtered : flattened;

  return {
    correctedQuery,
    corrected: correctedQuery !== normalizedQuery,
    songs: chosen.slice(0, Math.max(1, limit)).map((candidate) => candidate.song),
    candidateCount: firstPassCandidates.length,
  };
}
