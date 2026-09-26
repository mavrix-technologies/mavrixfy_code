

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LyricWord {
  text: string;
  start: number;
  end: number;
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
  provider: "lrclib" | "lyrics.ovh" | "jiosaavn" | "none";
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

const STORAGE_KEY = "@mavrixfy_lyrics_cache_v2";
const MAX_PERSISTENT_ENTRIES = 120;
const memoryCache = new Map<string, LyricsResult>();
let persistentCacheLoaded = false;

async function loadPersistentCache(): Promise<void> {
  if (persistentCacheLoaded) return;
  persistentCacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: Record<string, LyricsResult> = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (v && Array.isArray(v.lines) && v.lines.length > 0) {
            memoryCache.set(k, v);
          }
        }
      }
    }
  } catch { }
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
  } catch { }
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

  // Add intro instrumental break if initial intro gap is > 5s
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

    // Check for instrumental break between verses (> 7s gap)
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

/**
 * Internal query helper for LRCLIB endpoint
 */
async function queryLrclib(endpoint: string, queryParams: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const params = new URLSearchParams(queryParams);
    const res = await fetch(`https://lrclib.net/api/${endpoint}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mavrixfy-App/1.0 (https://mavrixfy.site)",
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

function processLrclibItem(item: any): LyricsResult | null {
  if (!item || typeof item !== "object") return null;

  if (item.syncedLyrics && typeof item.syncedLyrics === "string") {
    const lines = parseLrc(item.syncedLyrics);
    if (lines.length > 0) {
      return {
        synced: true,
        lines,
        plainLyrics: item.plainLyrics || undefined,
        provider: "lrclib",
        trackName: item.name,
        artistName: item.artistName,
      };
    }
  }

  if (item.plainLyrics && typeof item.plainLyrics === "string") {
    const lines = parsePlainText(item.plainLyrics);
    if (lines.length > 0) {
      return {
        synced: false,
        lines,
        plainLyrics: item.plainLyrics,
        provider: "lrclib",
        trackName: item.name,
        artistName: item.artistName,
      };
    }
  }

  return null;
}

/**
 * Search LRCLIB using multiple targeted strategies.
 */
async function fetchFromLrclibMulti(title: string, artist: string): Promise<LyricsResult | null> {
  // Strategy 1: Direct GET (fastest, exact title & artist)
  if (title && artist) {
    const getItem = await queryLrclib("get", { track_name: title, artist_name: artist });
    const res = processLrclibItem(getItem);
    if (res) return res;
  }

  // Strategy 2: Structured search by track_name & artist_name
  if (title && artist) {
    const searchList = await queryLrclib("search", { track_name: title, artist_name: artist });
    if (Array.isArray(searchList)) {
      // Prioritize synced
      const syncedMatch = searchList.find((it) => Boolean(it.syncedLyrics));
      if (syncedMatch) {
        const res = processLrclibItem(syncedMatch);
        if (res) return res;
      }
      const plainMatch = searchList.find((it) => Boolean(it.plainLyrics));
      if (plainMatch) {
        const res = processLrclibItem(plainMatch);
        if (res) return res;
      }
    }
  }

  // Strategy 3: Full-text search (title + artist)
  const fullQuery = `${title} ${artist}`.trim();
  if (fullQuery) {
    const qList = await queryLrclib("search", { q: fullQuery });
    if (Array.isArray(qList)) {
      const syncedMatch = qList.find((it) => Boolean(it.syncedLyrics));
      if (syncedMatch) {
        const res = processLrclibItem(syncedMatch);
        if (res) return res;
      }
      const plainMatch = qList.find((it) => Boolean(it.plainLyrics));
      if (plainMatch) {
        const res = processLrclibItem(plainMatch);
        if (res) return res;
      }
    }
  }

  // Strategy 4: Query search with title only
  if (title) {
    const titleList = await queryLrclib("search", { q: title });
    if (Array.isArray(titleList)) {
      const syncedMatch = titleList.find((it) => Boolean(it.syncedLyrics));
      if (syncedMatch) {
        const res = processLrclibItem(syncedMatch);
        if (res) return res;
      }
      const plainMatch = titleList.find((it) => Boolean(it.plainLyrics));
      if (plainMatch) {
        const res = processLrclibItem(plainMatch);
        if (res) return res;
      }
    }
  }

  return null;
}

/**
 * Free international lyrics fallback (lyrics.ovh)
 */
async function fetchFromLyricsOvh(title: string, artist: string): Promise<LyricsResult | null> {
  if (!title || !artist) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.lyrics && typeof json.lyrics === "string") {
      const lines = parsePlainText(json.lyrics);
      if (lines.length > 0) {
        return {
          synced: false,
          lines,
          plainLyrics: json.lyrics,
          provider: "lyrics.ovh",
          trackName: title,
          artistName: artist,
        };
      }
    }
  } catch {
    clearTimeout(timeoutId);
  }
  return null;
}

/**
 * Master entry point: Clean, high-coverage lyrics pipeline.
 */
export async function getSongLyrics(song: FetchSongParams): Promise<LyricsResult> {
  if (!song?.title) {
    return { synced: false, lines: [], provider: "none" };
  }

  const cacheKey = `${song.id || ""}_${song.title}_${song.artist || ""}`.toLowerCase();

  // 1. Check in-memory cache
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  // 2. Check persistent storage cache
  await loadPersistentCache();
  const persistentCached = memoryCache.get(cacheKey);
  if (persistentCached) return persistentCached;

  const fullClean = sanitizeTrackTitle(song.title);
  const coreTitle = getCoreTrackTitle(song.title);
  const cleanArtist = sanitizeArtistName(song.artist || "");

  // 3. Search LRCLIB with full sanitized title
  let result = await fetchFromLrclibMulti(fullClean, cleanArtist);

  // 4. If not found and coreTitle is different (e.g. subtitle stripped), search with coreTitle
  if (!result && coreTitle && coreTitle !== fullClean) {
    result = await fetchFromLrclibMulti(coreTitle, cleanArtist);
  }

  // 5. Fallback for international songs
  if (!result && cleanArtist && (coreTitle || fullClean)) {
    result = await fetchFromLyricsOvh(coreTitle || fullClean, cleanArtist);
  }

  const finalResult: LyricsResult = result || {
    synced: false,
    lines: [],
    provider: "none",
  };

  // Only cache positive results in persistent storage
  if (finalResult.lines.length > 0) {
    void persistLyricsEntry(cacheKey, finalResult);
  } else {
    memoryCache.set(cacheKey, finalResult);
  }

  return finalResult;
}
