import AsyncStorage from "@react-native-async-storage/async-storage";
import { unescapeHtml } from "@/utils/stringUtils";

export interface LyricWord {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface LyricLine {
  id?: string;
  time: number; // in seconds
  text: string;
  words?: LyricWord[];
  isBreak?: boolean;
  duration?: number;
}

export interface LyricsResult {
  synced: boolean;
  lines: LyricLine[];
  plainLyrics?: string;
  provider: "apple" | "lrclib" | "none";
  trackName?: string;
  artistName?: string;
}

export interface FetchSongParams {
  id?: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
}

const STORAGE_KEY = "@mavrixfy_lyrics_cache_v3";
const MAX_PERSISTENT_ENTRIES = 120;
const NEGATIVE_CACHE_TTL_MS = 60_000;
const MAX_LOOKUP_DURATION_MS = 8_000;
const memoryCache = new Map<string, LyricsResult>();
const pendingRequests = new Map<string, Promise<LyricsResult>>();
const negativeCacheUntil = new Map<string, number>();
let persistentCacheLoad: Promise<void> | null = null;

async function loadPersistentCache(): Promise<void> {
  if (!persistentCacheLoad) {
    persistentCacheLoad = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: Record<string, LyricsResult> = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            for (const [k, v] of Object.entries(parsed)) {
              if (v && Array.isArray(v.lines) && v.lines.length > 0) memoryCache.set(k, v);
            }
          }
        }
      } catch {}
    })();
  }
  await persistentCacheLoad;
}

async function persistLyricsEntry(key: string, result: LyricsResult): Promise<void> {
  try {
    memoryCache.set(key, result);
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    let parsed: Record<string, LyricsResult> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) || {};
      } catch {
        parsed = {};
      }
    }
    parsed[key] = result;
    const keys = Object.keys(parsed);
    if (keys.length > MAX_PERSISTENT_ENTRIES) {
      delete parsed[keys[0]];
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
}

function lyricsCacheKey(song: FetchSongParams): string {
  const normalized = (value: string) => sanitizeTrackTitle(value).toLowerCase().replace(/\s+/g, " ").trim();
  const durationBucket = song.duration && song.duration > 0 ? Math.round(song.duration / 5) * 5 : 0;
  return [normalized(song.title), normalized(sanitizeArtistName(song.artist || "")), normalized(song.album || ""), durationBucket].join("|");
}

/**
 * Clean track title by removing movie tags, soundtracks, feat., and audio/video labels.
 */
export function sanitizeTrackTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*\([^)]*(?:from|soundtrack|movie|film|ost)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*(?:from|soundtrack|movie|film|ost)[^\]]*\]/gi, "")
    .replace(/\s*-\s*(?:from|soundtrack|movie|film).*$/gi, "")
    .replace(/\s*\((?:official\s+)?(?:video|audio|lyric|lyrics|lyrical|full\s+song|remix|slowed|reverb|acoustic|live|original|hd|4k)[^)]*\)/gi, "")
    .replace(/\s*\[(?:official\s+)?(?:video|audio|lyric|lyrics|lyrical|full\s+song|remix|slowed|reverb|acoustic|live|original|hd|4k)[^\]]*\]/gi, "")
    .replace(/\s*\((?:feat|ft|with)\.?\s+[^)]+\)/gi, "")
    .replace(/\s*\[(?:feat|ft|with)\.?\s+[^\]]+\]/gi, "")
    .replace(/\s*-\s*remix.*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract core title before any subtitle dash (e.g. "Hukum - Alappara Theme" -> "Hukum")
 */
export function getCoreTrackTitle(title: string): string {
  const cleaned = sanitizeTrackTitle(title);
  const parts = cleaned.split(/\s*-\s*/);
  return (parts[0] || "").trim();
}

/**
 * Clean artist string by taking the primary artist before delimiters.
 */
export function sanitizeArtistName(artist: string): string {
  if (!artist) return "";
  return artist
    .split(/[,&/|]/)[0]
    .replace(/\bfeat\b.*$/gi, "")
    .replace(/\bft\b.*$/gi, "")
    .trim();
}

/**
 * Parse standard timestamped LRC: [mm:ss.xx] Lyric text
 */
export function parseLrc(lrcContent: string): LyricLine[] {
  if (!lrcContent || typeof lrcContent !== "string") return [];

  const rawLines = lrcContent.split(/\r?\n/);
  const timeRegex = /\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]/g;
  const wordTagRegex = /<(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)>/g;

  const rawParsed: { time: number; text: string }[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed)) continue;

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    const cleanText = trimmed
      .replace(timeRegex, "")
      .replace(wordTagRegex, "")
      .trim();

    for (const match of matches) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2]);
      if (isNaN(min) || isNaN(sec)) continue;
      rawParsed.push({
        time: Math.max(0, min * 60 + sec),
        text: cleanText,
      });
    }
  }

  rawParsed.sort((a, b) => a.time - b.time);

  const lines: LyricLine[] = [];

  if (rawParsed.length > 0 && rawParsed[0].time > 5.0) {
    lines.push({
      id: `break_intro_${Math.round(rawParsed[0].time)}`,
      time: 0,
      text: "♪",
      isBreak: true,
      duration: rawParsed[0].time,
    });
  }

  for (let i = 0; i < rawParsed.length; i++) {
    const curr = rawParsed[i];
    if (!curr.text && lines[lines.length - 1]?.text === "") continue;

    lines.push({
      id: `lrc_${curr.time}_${i}`,
      time: curr.time,
      text: curr.text,
    });

    const next = rawParsed[i + 1];
    if (next && curr.text) {
      const gap = next.time - curr.time;
      if (gap > 7.0) {
        const breakStart = curr.time + 2.0;
        const breakDur = next.time - breakStart;
        if (breakDur >= 4.0) {
          lines.push({
            id: `break_${Math.round(breakStart)}_${i}`,
            time: breakStart,
            text: "♪",
            isBreak: true,
            duration: breakDur,
          });
        }
      }
    }
  }

  return lines;
}

/**
 * Parse plain text lyrics into structured lines.
 */
export function parsePlainText(plain: string): LyricLine[] {
  if (!plain || typeof plain !== "string") return [];
  const rawLines = plain.split(/\r?\n/);
  const result: LyricLine[] = [];
  let validIndex = 0;

  for (const raw of rawLines) {
    const text = raw.trim();
    if (text.length > 0) {
      result.push({
        id: `plain_${validIndex * 4}_${validIndex}`,
        time: validIndex * 4,
        text,
      });
      validIndex++;
    }
  }
  return result;
}

// ─── 0. Bini TTML Word-by-Word Provider (lyrics-api.binimum.org + lrc.red) ────
// Highest priority: Apple-Music-sourced TTML with per-word timings.
// Two hops: Bini search finds the best recording match and returns a lyricsUrl
// pointing to a TTML file on lrc.red. We fetch + parse it with a lightweight
// regex parser (no XML DOM needed in React Native).

/**
 * Parse a time string from TTML: "mm:ss.mmm", "ss.mmm", "ss.mmms", "NNNms"
 */
function parseTtmlTimeSec(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s.endsWith("ms")) return (parseFloat(s) || 0) / 1000;
  if (s.endsWith("s") && !s.includes(":")) return parseFloat(s) || 0;
  const parts = s.split(":");
  if (parts.length === 1) return parseFloat(parts[0]) || 0;
  if (parts.length === 2) return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
  if (parts.length === 3)
    return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
  return parseFloat(s) || 0;
}

/**
 * Parse Apple-Music TTML into LyricLine[] with per-word timings.
 * Uses regex so it works in React Native without a DOM/XML parser dependency.
 */
function parseTtml(ttml: string): LyricLine[] {
  if (!ttml || typeof ttml !== "string" || !ttml.includes("<p")) return [];

  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  const spanRegex = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;

  function getAttr(tagAttrs: string, name: string): string | null {
    const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i").exec(tagAttrs);
    return m ? m[1] : null;
  }

  const originalLines: LyricLine[] = [];
  const romanizedLines: LyricLine[] = [];
  let pMatch: RegExpExecArray | null;

  pRegex.lastIndex = 0;
  while ((pMatch = pRegex.exec(ttml)) !== null) {
    const pAttrs = pMatch[1];
    const pContent = pMatch[2];

    const role = getAttr(pAttrs, "ttm:role") || getAttr(pAttrs, "role") || "";
    if (role === "x-translation" || role === "x-bg") continue;
    const paragraphIsRomanized = role === "x-roman";

    const beginAttr = getAttr(pAttrs, "begin");
    const endAttr = getAttr(pAttrs, "end");
    const pBegin = parseTtmlTimeSec(beginAttr);
    const pEnd = endAttr ? parseTtmlTimeSec(endAttr) : pBegin;

    const originalWords: LyricWord[] = [];
    const romanizedWords: LyricWord[] = [];
    let spanMatch: RegExpExecArray | null;
    spanRegex.lastIndex = 0;

    while ((spanMatch = spanRegex.exec(pContent)) !== null) {
      const sAttrs = spanMatch[1];
      const spanRole = getAttr(sAttrs, "ttm:role") || getAttr(sAttrs, "role") || "";
      if (spanRole === "x-translation" || spanRole === "x-bg") continue;

      const rawText = unescapeHtml(spanMatch[2].replace(/<[^>]+>/g, " "));
      if (!rawText) continue;

      const spanBegin = getAttr(sAttrs, "begin");
      const spanEnd = getAttr(sAttrs, "end");
      const sBegin = spanBegin ? parseTtmlTimeSec(spanBegin) : pBegin;
      const sEnd = spanEnd ? parseTtmlTimeSec(spanEnd) : sBegin;
      const targetWords = paragraphIsRomanized || spanRole === "x-roman" ? romanizedWords : originalWords;
      targetWords.push({ text: rawText, start: sBegin, end: Math.max(sBegin, sEnd) });
    }

    const paragraphText = unescapeHtml(pContent.replace(/<[^>]+>/g, " "));
    const originalText = originalWords.length ? originalWords.map((word) => word.text).join(" ") : paragraphText;
    const romanizedText = romanizedWords.length ? romanizedWords.map((word) => word.text).join(" ") : "";

    if (originalText) {
      originalLines.push({
        id: `ttml_${Math.round(pBegin * 1000)}_${originalLines.length}`,
        time: pBegin,
        duration: Math.max(0, pEnd - pBegin),
        text: originalText,
        words: originalWords.length ? originalWords : undefined,
      });
    }
    if (romanizedText || paragraphIsRomanized && paragraphText) {
      romanizedLines.push({
        id: `ttml_roman_${Math.round(pBegin * 1000)}_${romanizedLines.length}`,
        time: pBegin,
        duration: Math.max(0, pEnd - pBegin),
        text: romanizedText || paragraphText,
        words: romanizedWords.length ? romanizedWords : undefined,
      });
    }
  }

  const rawLines = romanizedLines.length >= Math.ceil(originalLines.length * 0.8) && romanizedLines.length > 0
    ? romanizedLines
    : originalLines;
  rawLines.sort((a, b) => a.time - b.time);
  if (rawLines.length === 0) return [];

  // Insert instrumental breaks for gaps >= 7 seconds
  const lines: LyricLine[] = [];
  if (rawLines[0].time > 5.0) {
    lines.push({
      id: `ttml_break_intro`,
      time: 0,
      text: "♪",
      isBreak: true,
      duration: rawLines[0].time,
    });
  }

  for (let i = 0; i < rawLines.length; i++) {
    const curr = rawLines[i];
    lines.push(curr);
    if (i < rawLines.length - 1) {
      const next = rawLines[i + 1];
      const gap = next.time - (curr.time + (curr.duration || 0));
      if (gap >= 7.0) {
        const breakStart = curr.time + Math.max(1.5, curr.duration || 0);
        const breakDur = next.time - breakStart;
        if (breakDur >= 4.0) {
          lines.push({
            id: `ttml_break_${Math.round(breakStart)}`,
            time: breakStart,
            text: "♪",
            isBreak: true,
            duration: breakDur,
          });
        }
      }
    }
  }

  return lines;
}

/**
 * Fetch word-synced Apple Music TTML lyrics via Bini catalogue + lrc.red.
 * Returns null if no match or TTML cannot be parsed.
 */
async function fetchFromBini(
  title: string,
  artist: string,
  durationSeconds?: number,
  timeoutMs = 4500
): Promise<LyricsResult | null> {
  if (!title) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams({ track: title });
    if (artist) params.set("artist", artist);
    if (durationSeconds && durationSeconds > 0) params.set("duration", String(Math.round(durationSeconds)));

    const searchUrl = `https://lyrics-api.binimum.org/?${params.toString()}`;
    const searchRes = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const results: Record<string, unknown>[] = Array.isArray(searchData?.results) ? searchData.results : [];
    if (results.length === 0) return null;

    const hit = results
      .filter((result) => typeof result.lyricsUrl === "string")
      .map((result) => ({
        result,
        score: scoreLyricsCandidate(
          String(result.track_name || ""),
          String(result.artist_name || ""),
          "",
          Number(result.duration) || 0,
          title,
          artist,
          "",
          durationSeconds
        ) + (result.timing_type === "word" ? 1 : 0),
      }))
      .filter((candidate) => candidate.score >= 7)
      .sort((a, b) => b.score - a.score)[0]?.result;
    if (!hit || typeof hit.lyricsUrl !== "string") return null;

    const ttmlRes = await fetch(hit.lyricsUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/xml, application/xml, */*",
      },
    });
    if (!ttmlRes.ok) return null;

    const ttmlText = await ttmlRes.text();
    const lines = parseTtml(ttmlText);

    if (lines.length > 0) {
      return {
        synced: true,
        lines,
        provider: "apple",
        trackName: String(hit.track_name || title),
        artistName: String(hit.artist_name || artist),
      };
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  return null;
}

function normalizeLyricsMatch(value: string): string {
  return sanitizeTrackTitle(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s'’.,!?:;()\[\]{}_/-]+/g, "");
}

function scoreLyricsCandidate(
  candidateTitle: string,
  candidateArtist: string,
  candidateAlbum: string,
  candidateDuration: number,
  title: string,
  artist: string,
  album: string,
  duration?: number
): number {
  const expectedTitle = normalizeLyricsMatch(title);
  const actualTitle = normalizeLyricsMatch(candidateTitle);
  if (!expectedTitle || !actualTitle) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (actualTitle === expectedTitle) score += 6;
  else if (
    (actualTitle.includes(expectedTitle) || expectedTitle.includes(actualTitle)) &&
    Math.min(actualTitle.length, expectedTitle.length) / Math.max(actualTitle.length, expectedTitle.length) >= 0.85
  ) score += 4;
  else return Number.NEGATIVE_INFINITY;

  const expectedArtist = normalizeLyricsMatch(artist);
  const actualArtist = normalizeLyricsMatch(candidateArtist);
  if (expectedArtist) {
    if (!actualArtist) return Number.NEGATIVE_INFINITY;
    if (actualArtist === expectedArtist) score += 4;
    else if (actualArtist.includes(expectedArtist) || expectedArtist.includes(actualArtist)) score += 2;
    else return Number.NEGATIVE_INFINITY;
  }

  const expectedAlbum = normalizeLyricsMatch(album);
  const actualAlbum = normalizeLyricsMatch(candidateAlbum);
  if (expectedAlbum && actualAlbum === expectedAlbum) score += 1;

  if (duration && duration > 0 && candidateDuration > 0) {
    const difference = Math.abs(duration - candidateDuration);
    if (difference > 12) return Number.NEGATIVE_INFINITY;
    if (difference <= 2) score += 2;
    else if (difference <= 8) score += 1;
  }
  return score;
}

async function queryLrclib(
  title: string,
  artist: string,
  album: string,
  timeoutMs = 3500
): Promise<Record<string, unknown>[] | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ track_name: title });
    if (artist) params.set("artist_name", artist);
    if (album) params.set("album_name", album);
    const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mavrixfy-App/1.0 (https://mavrixfy.site)",
      },
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
    const data: unknown = await response.json();
    return Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function processLrclibItem(item: Record<string, unknown>): LyricsResult | null {
  if (item.instrumental === true) return null;

  const syncedLyrics = typeof item.syncedLyrics === "string" ? item.syncedLyrics : "";
  const lines = parseLrc(syncedLyrics);
  if (lines.length > 0) {
    return {
      synced: true,
      lines,
      plainLyrics: typeof item.plainLyrics === "string" ? item.plainLyrics : undefined,
      provider: "lrclib",
      trackName: String(item.trackName || item.name || ""),
      artistName: String(item.artistName || ""),
    };
  }

  const plainLyrics = typeof item.plainLyrics === "string" ? item.plainLyrics : "";
  const plainLines = parsePlainText(plainLyrics);
  return plainLines.length > 0 ? {
    synced: false,
    lines: plainLines,
    plainLyrics,
    provider: "lrclib",
    trackName: String(item.trackName || item.name || ""),
    artistName: String(item.artistName || ""),
  } : null;
}

async function fetchFromLrclib(
  title: string,
  artist: string,
  album: string,
  duration?: number,
  timeoutMs = 3500
): Promise<LyricsResult | null> {
  if (!title) return null;
  const items = await queryLrclib(title, artist, album, timeoutMs);
  if (!items?.length) return null;

  const ranked = items
    .map((item) => ({
      item,
      score: scoreLyricsCandidate(
        String(item.trackName || item.name || ""),
        String(item.artistName || ""),
        String(item.albumName || ""),
        Number(item.duration) || 0,
        title,
        artist,
        album,
        duration
      ),
    }))
    .filter((candidate) => candidate.score >= (artist ? 8 : 6))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return Number(Boolean(b.item.syncedLyrics)) - Number(Boolean(a.item.syncedLyrics));
    });

  for (const candidate of ranked) {
    const result = processLrclibItem(candidate.item);
    if (result) return result;
  }
  return null;
}
// ─── Lyrics lookup ─────────────────────────────────────────────────────────────

async function fetchLyrics(song: FetchSongParams, cacheKey: string): Promise<LyricsResult> {
  await loadPersistentCache();
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const negativeUntil = negativeCacheUntil.get(cacheKey) || 0;
  if (negativeUntil > Date.now()) return { synced: false, lines: [], provider: "none" };
  negativeCacheUntil.delete(cacheKey);

  const title = sanitizeTrackTitle(song.title) || song.title.trim();
  const coreTitle = getCoreTrackTitle(title);
  const artist = sanitizeArtistName(song.artist || "");
  const album = sanitizeTrackTitle(song.album || "");
  const deadline = Date.now() + MAX_LOOKUP_DURATION_MS;
  const remaining = () => Math.max(0, deadline - Date.now());
  let result = remaining() > 0
    ? await fetchFromLrclib(title, artist, album, song.duration, Math.min(3500, remaining()))
    : null;

  if (!result && remaining() > 0) {
    result = await fetchFromBini(title, artist, song.duration, Math.min(4500, remaining()));
  }

  if (!result && coreTitle && coreTitle !== title && remaining() > 0) {
    result = await fetchFromLrclib(coreTitle, artist, album, song.duration, Math.min(3500, remaining()));
  }

  if (!result && coreTitle && coreTitle !== title && remaining() > 0) {
    result = await fetchFromBini(coreTitle, artist, song.duration, Math.min(4500, remaining()));
  }

  if (result?.lines.length) {
    memoryCache.set(cacheKey, result);
    negativeCacheUntil.delete(cacheKey);
    void persistLyricsEntry(cacheKey, result);
    return result;
  }

  negativeCacheUntil.set(cacheKey, Date.now() + NEGATIVE_CACHE_TTL_MS);
  return { synced: false, lines: [], provider: "none" };
}

export async function getSongLyrics(song: FetchSongParams): Promise<LyricsResult> {
  if (!song?.title?.trim()) return { synced: false, lines: [], provider: "none" };

  const cacheKey = lyricsCacheKey(song);
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;
  if ((negativeCacheUntil.get(cacheKey) || 0) > Date.now()) {
    return { synced: false, lines: [], provider: "none" };
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const request = fetchLyrics(song, cacheKey).finally(() => {
    pendingRequests.delete(cacheKey);
  });
  pendingRequests.set(cacheKey, request);
  return request;
}
