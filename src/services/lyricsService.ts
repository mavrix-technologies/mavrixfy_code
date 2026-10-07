import AsyncStorage from "@react-native-async-storage/async-storage";

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
  provider: "apple" | "betterlyrics" | "lrclib" | "lyrics.ovh" | "jiosaavn" | "none";
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
  } catch {}
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

  const rawLines: LyricLine[] = [];
  let lineIdx = 0;
  let pMatch: RegExpExecArray | null;

  pRegex.lastIndex = 0;
  while ((pMatch = pRegex.exec(ttml)) !== null) {
    const pAttrs = pMatch[1];
    const pContent = pMatch[2];

    // Skip background / translation roles
    const role = getAttr(pAttrs, "ttm:role") || getAttr(pAttrs, "role") || "";
    if (role === "x-translation" || role === "x-roman") continue;

    const pBegin = parseTtmlTimeSec(getAttr(pAttrs, "begin"));
    const pEnd = parseTtmlTimeSec(getAttr(pAttrs, "end") ?? undefined) || pBegin;

    const words: LyricWord[] = [];
    let spanMatch: RegExpExecArray | null;
    spanRegex.lastIndex = 0;

    while ((spanMatch = spanRegex.exec(pContent)) !== null) {
      const sAttrs = spanMatch[1];
      const spanRole = getAttr(sAttrs, "ttm:role") || getAttr(sAttrs, "role") || "";
      if (spanRole === "x-translation" || spanRole === "x-roman" || spanRole === "x-bg") continue;

      const rawText = spanMatch[2].replace(/<[^>]+>/g, "").trim();
      if (!rawText) continue;

      const sBegin = parseTtmlTimeSec(getAttr(sAttrs, "begin")) || pBegin;
      const sEnd = parseTtmlTimeSec(getAttr(sAttrs, "end") ?? undefined) || sBegin;
      words.push({ text: rawText, start: sBegin, end: sEnd });
    }

    const plainText = pContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!plainText) continue;

    rawLines.push({
      id: `ttml_${Math.round(pBegin * 1000)}_${lineIdx++}`,
      time: pBegin,
      duration: Math.max(0, pEnd - pBegin),
      text: plainText,
      words: words.length > 0 ? words : undefined,
    });
  }

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
  durationSeconds?: number
): Promise<LyricsResult | null> {
  if (!title) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const params = new URLSearchParams({ track: title });
    if (artist) params.set("artist", artist);
    if (durationSeconds && durationSeconds > 0) params.set("duration", String(Math.round(durationSeconds)));

    const searchUrl = `https://lyrics-api.binimum.org/?${params.toString()}`;
    const searchRes = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LastWave-Android/1.0 (https://github.com/clash-projects/lastwave)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const results: any[] = Array.isArray(searchData?.results) ? searchData.results : [];
    if (results.length === 0) return null;

    // Prefer word-timed results; pick first match
    const hit = results.find((r) => r?.timing_type === "word") || results[0];
    if (!hit?.lyricsUrl) return null;

    // Fetch the TTML document
    const ttmlController = new AbortController();
    const ttmlTimeout = setTimeout(() => ttmlController.abort(), 5000);

    const ttmlRes = await fetch(hit.lyricsUrl, {
      signal: ttmlController.signal,
      headers: {
        "User-Agent": "LastWave-Android/1.0 (https://github.com/clash-projects/lastwave)",
        Accept: "text/xml, application/xml, */*",
      },
    });
    clearTimeout(ttmlTimeout);
    if (!ttmlRes.ok) return null;

    const ttmlText = await ttmlRes.text();
    const lines = parseTtml(ttmlText);

    if (lines.length > 0) {
      return {
        synced: true,
        lines,
        provider: "apple",
        trackName: hit.track_name || title,
        artistName: hit.artist_name || artist,
      };
    }
  } catch {
    clearTimeout(timeoutId);
  }

  return null;
}

// ─── 1. Apple Music Word-by-Word Provider (Paxsenix) ──────────────────────────

async function resolveAppleMusicTrackId(title: string, artist: string, durationSeconds?: number): Promise<number | null> {
  const query = `${title} ${artist}`.trim();
  if (!query) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`;
    const res = await fetch(itunesUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const cleanTitle = title.toLowerCase().trim();
    const cleanArtist = artist.toLowerCase().trim();
    const targetMs = durationSeconds && durationSeconds > 0 ? durationSeconds * 1000 : null;

    let bestMatch: any = null;
    let bestScore = -1;

    for (const item of results) {
      if (!item?.trackId) continue;
      const trackName = String(item.trackName || "").toLowerCase();
      const artistName = String(item.artistName || "").toLowerCase();

      let score = 0;
      if (trackName.includes(cleanTitle) || cleanTitle.includes(trackName)) score += 3;
      if (artistName.includes(cleanArtist) || cleanArtist.includes(artistName)) score += 2;

      if (targetMs && item.trackTimeMillis) {
        const diff = Math.abs(item.trackTimeMillis - targetMs);
        if (diff < 5000) score += 2;
        else if (diff < 12000) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && bestScore >= 3) {
      return Number(bestMatch.trackId);
    }
  } catch {
    clearTimeout(timeoutId);
  }

  return null;
}

async function fetchFromAppleMusicPaxsenix(
  title: string,
  artist: string,
  durationSeconds?: number
): Promise<LyricsResult | null> {
  const trackId = await resolveAppleMusicTrackId(title, artist, durationSeconds);
  if (!trackId) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://lyrics.paxsenix.org/apple-music/lyrics?id=${trackId}&v=2`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LastWave",
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data) return null;

    // Check if syllable/word-level lyrics array is present
    if (Array.isArray(data.lyrics) && data.lyrics.length > 0) {
      const lines: LyricLine[] = [];

      for (let i = 0; i < data.lyrics.length; i++) {
        const rawLine = data.lyrics[i];
        const lineWords: LyricWord[] = [];
        let assembledText = "";

        const textArray = Array.isArray(rawLine.text) ? rawLine.text : [];
        for (const w of textArray) {
          if (!w?.text) continue;
          const startSec = (Number(w.timestamp) || 0) / 1000;
          const endSec = (Number(w.endtime) || Number(w.timestamp) || 0) / 1000;

          if (w.part && lineWords.length > 0) {
            lineWords[lineWords.length - 1].text += w.text;
            lineWords[lineWords.length - 1].end = Math.max(lineWords[lineWords.length - 1].end, endSec);
            assembledText += w.text;
          } else {
            lineWords.push({
              text: w.text,
              start: startSec,
              end: endSec,
            });
            assembledText += (assembledText ? " " : "") + w.text;
          }
        }

        const lineStart = (Number(rawLine.timestamp) || 0) / 1000;
        const lineEnd = (Number(rawLine.endtime) || Number(rawLine.timestamp) || 0) / 1000;

        if (assembledText.trim()) {
          lines.push({
            id: `apple_${lineStart}_${i}`,
            time: lineStart,
            duration: Math.max(0, lineEnd - lineStart),
            text: assembledText.trim(),
            words: lineWords.length > 0 ? lineWords : undefined,
          });
        }
      }

      if (lines.length > 0) {
        return {
          synced: true,
          lines,
          plainLyrics: data.plain || undefined,
          provider: "apple",
          trackName: title,
          artistName: artist,
        };
      }
    }

    // Fallback to LRC if provided in response
    if (data.lrc && typeof data.lrc === "string") {
      const lines = parseLrc(data.lrc);
      if (lines.length > 0) {
        return {
          synced: true,
          lines,
          plainLyrics: data.plain || undefined,
          provider: "apple",
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

// ─── 2. BetterLyrics Word-Sync Provider ───────────────────────────────────────

async function fetchFromBetterLyrics(title: string, artist: string): Promise<LyricsResult | null> {
  if (!title || !artist) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `https://lyrics-api.boidu.dev/getLyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.lrc && typeof data.lrc === "string") {
      const lines = parseLrc(data.lrc);
      if (lines.length > 0) {
        return {
          synced: true,
          lines,
          plainLyrics: data.plain || undefined,
          provider: "betterlyrics",
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

// ─── 3. LRCLIB Multi-Search Provider ──────────────────────────────────────────

async function queryLrclib(endpoint: string, queryParams: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

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

async function fetchFromLrclibMulti(title: string, artist: string): Promise<LyricsResult | null> {
  if (!title) return null;

  // Direct exact query
  const direct = await queryLrclib("get", { track_name: title, artist_name: artist });
  const directRes = processLrclibItem(direct);
  if (directRes) return directRes;

  // Search query
  const searchList = await queryLrclib("search", { q: `${title} ${artist}`.trim() });
  if (Array.isArray(searchList)) {
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

  return null;
}

// ─── 4. Lyrics.ovh Fallback Provider ──────────────────────────────────────────

async function fetchFromLyricsOvh(title: string, artist: string): Promise<LyricsResult | null> {
  if (!title || !artist) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

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

// ─── Master Pipeline ──────────────────────────────────────────────────────────

export async function getSongLyrics(song: FetchSongParams): Promise<LyricsResult> {
  if (!song?.title) {
    return { synced: false, lines: [], provider: "none" };
  }

  const cacheKey = `${song.id || ""}_${song.title}_${song.artist || ""}`.toLowerCase();

  // 1. Check in-memory cache – skip "none" so a new provider attempt can succeed
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.provider !== "none") return cached;

  // 2. Check persistent storage cache
  await loadPersistentCache();
  const persistentCached = memoryCache.get(cacheKey);
  if (persistentCached && persistentCached.provider !== "none") return persistentCached;

  const fullClean = sanitizeTrackTitle(song.title);
  const coreTitle = getCoreTrackTitle(song.title);
  const cleanArtist = sanitizeArtistName(song.artist || "");

  // Priority 0: Bini (lyrics-api.binimum.org) – Apple Music TTML, real word-by-word sync
  let result = await fetchFromBini(fullClean || song.title, cleanArtist, song.duration);

  if (!result && coreTitle && coreTitle !== fullClean) {
    result = await fetchFromBini(coreTitle, cleanArtist, song.duration);
  }

  // Priority 1: Apple Music via Paxsenix (syllable-level, may return 503 when busy)
  if (!result) {
    result = await fetchFromAppleMusicPaxsenix(fullClean || song.title, cleanArtist, song.duration);
  }
  if (!result && coreTitle && coreTitle !== fullClean) {
    result = await fetchFromAppleMusicPaxsenix(coreTitle, cleanArtist, song.duration);
  }

  // Priority 2: BetterLyrics Word-sync API (boidu.dev)
  if (!result) {
    result = await fetchFromBetterLyrics(fullClean || song.title, cleanArtist);
  }

  // Priority 3: LRCLIB Multi-Search (line-synced LRC)
  if (!result) {
    result = await fetchFromLrclibMulti(fullClean || song.title, cleanArtist);
  }
  if (!result && coreTitle && coreTitle !== fullClean) {
    result = await fetchFromLrclibMulti(coreTitle, cleanArtist);
  }

  // Priority 4: Plain text fallback (lyrics.ovh)
  if (!result && cleanArtist) {
    result = await fetchFromLyricsOvh(coreTitle || fullClean || song.title, cleanArtist);
  }

  const finalResult: LyricsResult = result || {
    synced: false,
    lines: [],
    provider: "none",
  };

  // Cache result
  if (finalResult.lines.length > 0) {
    void persistLyricsEntry(cacheKey, finalResult);
  } else {
    memoryCache.set(cacheKey, finalResult);
  }

  return finalResult;
}
