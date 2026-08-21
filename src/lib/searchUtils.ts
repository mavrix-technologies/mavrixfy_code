import { Song } from "./musicData";

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

export function rankSongs(songs: Song[], query: string): Song[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return songs;

  return [...songs].sort((a, b) => {
    const aTitle = normalizeText(a.title);
    const bTitle = normalizeText(b.title);

    const aExact = aTitle === normalizedQuery;
    const bExact = bTitle === normalizedQuery;
    if (aExact !== bExact) {
      return aExact ? -1 : 1;
    }

    const aStarts = aTitle.startsWith(normalizedQuery);
    const bStarts = bTitle.startsWith(normalizedQuery);
    if (aStarts !== bStarts) {
      return aStarts ? -1 : 1;
    }

    const aContains = aTitle.includes(normalizedQuery);
    const bContains = bTitle.includes(normalizedQuery);
    if (aContains !== bContains) {
      return aContains ? -1 : 1;
    }

    const aArtist = normalizeText(a.artist);
    const bArtist = normalizeText(b.artist);
    const aArtistMatch = aArtist.includes(normalizedQuery);
    const bArtistMatch = bArtist.includes(normalizedQuery);
    if (aArtistMatch !== bArtistMatch) {
      return aArtistMatch ? -1 : 1;
    }

    const playCountDiff = (b.playCount || 0) - (a.playCount || 0);
    if (playCountDiff !== 0) {
      return playCountDiff;
    }

    return aTitle.localeCompare(bTitle);
  });
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
  const parsed: ParsedQuery = { raw: query, freeText: "" };
  let remaining = query.trim();

  const patterns: [keyof Omit<ParsedQuery, "raw" | "freeText">, RegExp][] = [
    ["isrc", /\bisrc:([A-Z]{2}[A-Z0-9]{3}\d{7})\b/i],
    ["year", /\byear:(\d{4})\b/i],
    ["track", /\btrack:(?:"([^"]+)"|'([^']+)'|([^\s:]+))/i],
    ["artist", /\bartist:(?:"([^"]+)"|'([^']+)'|([^\s:]+))/i],
    ["album", /\balbum:(?:"([^"]+)"|'([^']+)'|([^\s:]+))/i],
  ];

  for (const [key, pattern] of patterns) {
    const match = remaining.match(pattern);
    if (match) {
      const val = match[1] || match[2] || match[3];
      if (val) {
        parsed[key] = val.trim();
      }
      remaining = remaining.replace(match[0], " ");
    }
  }

  parsed.freeText = remaining.replace(/\s+/g, " ").trim();
  return parsed;
}
