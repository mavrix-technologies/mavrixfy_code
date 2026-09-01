/**
 * Lyrics Service — Clean & Simple Synchronized Lyrics Fetcher for Mavrixfy.
 *
 * Tier 1: LRCLIB (Time-synced LRC timestamps by title, artist, duration)
 * Tier 2: LRCLIB Search Fallback (Fuzzy matching)
 * Tier 3: JioSaavn Catalogue Lyrics (Indian catalogue songs fallback)
 */

export interface LyricWord {
  text: string;
  start: number;
  end: number;
}

export interface LyricLine {
  id?: string;
  time: number; // in seconds (e.g. 14.25)
  text: string;
  words?: LyricWord[];
  isBreak?: boolean;
  duration?: number; // duration of instrumental section in seconds
}

export interface LyricsResult {
  synced: boolean;
  lines: LyricLine[];
  plainLyrics?: string;
  provider: "lrclib" | "jiosaavn" | "none";
  trackName?: string;
  artistName?: string;
}

const lyricsCache = new Map<string, LyricsResult>();
const MAX_CACHE_SIZE = 40;

/**
 * Clean track title by stripping noise like (From "Movie"), [Official Video], feat., etc.
 */
export function sanitizeTrackTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*\(from\s+["'].*?["']\)/gi, "")
    .replace(/\s*\[from\s+["'].*?["']\]/gi, "")
    .replace(/\s*\(feat\..*?\)/gi, "")
    .replace(/\s*\[feat\..*?\]/gi, "")
    .replace(/\s*\(ft\..*?\)/gi, "")
    .replace(/\s*\[ft\..*?\]/gi, "")
    .replace(/\s*\(with\s+.*?\)/gi, "")
    .replace(/\s*\(official\s+.*?\)/gi, "")
    .replace(/\s*\[official\s+.*?\]/gi, "")
    .replace(/\s*\(lyric\s+.*?\)/gi, "")
    .replace(/\s*\[lyric\s+.*?\]/gi, "")
    .replace(/\s*\(audio.*?\)/gi, "")
    .replace(/\s*\[audio.*?\]/gi, "")
    .replace(/\s*\(video.*?\)/gi, "")
    .replace(/\s*\[video.*?\]/gi, "")
    .replace(/\s*\(full\s+song.*?\)/gi, "")
    .replace(/\s*\(remix.*?\)/gi, "")
    .replace(/\s*\[remix.*?\]/gi, "")
    .replace(/\s*\(slowed.*?\)/gi, "")
    .replace(/\s*\(reverb.*?\)/gi, "")
    .replace(/\s*\(acoustic.*?\)/gi, "")
    .replace(/\s*\(live.*?\)/gi, "")
    .replace(/\s*-\s*from\s+.*$/gi, "")
    .replace(/\s*-\s*remix.*$/gi, "")
    .trim();
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
 * Universal Indic / South Asian to Romanized Hinglish Transliterator
 * (Converts Hindi/Devanagari, Punjabi/Gurmukhi, and Urdu/Arabic scripts into readable Hinglish).
 */
export function romanizeToHinglish(input: string): string {
  if (!input || typeof input !== "string") return "";

  // 1. Check for Punjabi (Gurmukhi) script (U+0A00 to U+0A7F)
  if (/[\u0A00-\u0A7F]/.test(input)) {
    const punjabiVowels: Record<string, string> = {
      "\u0A05": "a", "\u0A06": "aa", "\u0A07": "i", "\u0A08": "ee",
      "\u0A09": "u", "\u0A0A": "oo", "\u0A0F": "e", "\u0A10": "ai",
      "\u0A13": "o", "\u0A14": "au",
    };
    const punjabiConsonants: Record<string, string> = {
      "\u0A15": "k", "\u0A16": "kh", "\u0A17": "g", "\u0A18": "gh", "\u0A19": "ng",
      "\u0A1A": "ch", "\u0A1B": "chh", "\u0A1C": "j", "\u0A1D": "jh", "\u0A1E": "ny",
      "\u0A1F": "t", "\u0A20": "th", "\u0A21": "d", "\u0A22": "dh", "\u0A23": "n",
      "\u0A24": "t", "\u0A25": "th", "\u0A26": "d", "\u0A27": "dh", "\u0A28": "n",
      "\u0A2A": "p", "\u0A2B": "ph", "\u0A2C": "b", "\u0A2D": "bh", "\u0A2E": "m",
      "\u0A2F": "y", "\u0A30": "r", "\u0A32": "l", "\u0A35": "v", "\u0A5C": "r",
      "\u0A38": "s", "\u0A39": "h", "\u0A36": "sh", "\u0A59": "kh", "\u0A5A": "gh",
      "\u0A5B": "z", "\u0A5E": "f",
    };
    const punjabiMatras: Record<string, string> = {
      "\u0A3E": "aa", "\u0A3F": "i", "\u0A40": "ee", "\u0A41": "u", "\u0A42": "oo",
      "\u0A47": "e", "\u0A48": "ai", "\u0A4B": "o", "\u0A4C": "au",
    };

    let pResult = "";
    const chars = Array.from(input);
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const nextChar = chars[i + 1] || "";
      if (punjabiVowels[char]) {
        pResult += punjabiVowels[char];
      } else if (punjabiConsonants[char]) {
        const base = punjabiConsonants[char];
        if (nextChar === "\u0A4D") {
          pResult += base;
          i++;
        } else if (punjabiMatras[nextChar]) {
          pResult += base + punjabiMatras[nextChar];
          i++;
        } else if (punjabiConsonants[nextChar] || punjabiVowels[nextChar]) {
          pResult += base + "a";
        } else {
          pResult += base;
        }
      } else if (char === "\u0A70" || char === "\u0A02") {
        pResult += "n";
      } else {
        pResult += char;
      }
    }
    return pResult.replace(/\s+/g, " ").trim();
  }

  // 2. Check for Urdu / Arabic script (U+0600 to U+06FF)
  if (/[\u0600-\u06FF]/.test(input)) {
    const urduMap: Record<string, string> = {
      "\u0622": "aa", "\u0627": "a", "\u0628": "b", "\u067E": "p", "\u062A": "t",
      "\u0679": "t", "\u062B": "s", "\u062C": "j", "\u0686": "ch", "\u062D": "h",
      "\u062E": "kh", "\u062F": "d", "\u0688": "d", "\u0630": "z", "\u0631": "r",
      "\u0691": "r", "\u0632": "z", "\u0698": "zh", "\u0633": "s", "\u0634": "sh",
      "\u0635": "s", "\u0636": "z", "\u0637": "t", "\u0638": "z", "\u0639": "a",
      "\u063A": "gh", "\u0641": "f", "\u0642": "q", "\u06A9": "k", "\u06AF": "g",
      "\u0644": "l", "\u0645": "m", "\u0646": "n", "\u06BA": "n", "\u0648": "o",
      "\u06C1": "h", "\u06BE": "h", "\u06CC": "ee", "\u06D2": "e", "\u0621": "",
    };

    let uResult = "";
    const chars = Array.from(input);
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (urduMap[char] !== undefined) {
        uResult += urduMap[char];
      } else {
        uResult += char;
      }
    }
    return uResult.replace(/\s+/g, " ").trim();
  }

  // 3. Check for Hindi / Devanagari script (U+0900 to U+097F)
  if (/[\u0900-\u097F]/.test(input)) {
    const hindiVowels: Record<string, string> = {
      "\u0905": "a", "\u0906": "aa", "\u0907": "i", "\u0908": "ee",
      "\u0909": "u", "\u090A": "oo", "\u090B": "ri", "\u090F": "e",
      "\u0910": "ai", "\u0913": "o", "\u0914": "au",
    };
    const hindiConsonants: Record<string, string> = {
      "\u0915": "k", "\u0916": "kh", "\u0917": "g", "\u0918": "gh", "\u0919": "ng",
      "\u091A": "ch", "\u091B": "chh", "\u091C": "j", "\u091D": "jh", "\u091E": "ny",
      "\u091F": "t", "\u0920": "th", "\u0921": "d", "\u0922": "dh", "\u0923": "n",
      "\u0924": "t", "\u0925": "th", "\u0926": "d", "\u0927": "dh", "\u0928": "n",
      "\u092A": "p", "\u092B": "ph", "\u092C": "b", "\u092D": "bh", "\u092E": "m",
      "\u092F": "y", "\u0930": "r", "\u0932": "l", "\u0935": "v",
      "\u0936": "sh", "\u0937": "sh", "\u0938": "s", "\u0939": "h",
      "\u0958": "q", "\u0959": "kh", "\u095A": "gh", "\u095B": "z", "\u095C": "r", "\u095D": "rh", "\u095E": "f",
    };
    const hindiMatras: Record<string, string> = {
      "\u093E": "aa", "\u093F": "i", "\u0940": "ee", "\u0941": "u", "\u0942": "oo",
      "\u0943": "ri", "\u0947": "e", "\u0948": "ai", "\u094B": "o", "\u094C": "au",
    };

    let hResult = "";
    const chars = Array.from(input);
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const nextChar = chars[i + 1] || "";
      if (hindiVowels[char]) {
        hResult += hindiVowels[char];
      } else if (hindiConsonants[char]) {
        const base = hindiConsonants[char];
        if (nextChar === "\u094D") {
          hResult += base;
          i++;
        } else if (hindiMatras[nextChar]) {
          hResult += base + hindiMatras[nextChar];
          i++;
        } else if (hindiConsonants[nextChar] || hindiVowels[nextChar]) {
          hResult += base + "a";
        } else {
          hResult += base;
        }
      } else if (char === "\u0902" || char === "\u0901") {
        hResult += "n";
      } else if (char === "\u0903") {
        hResult += "h";
      } else if (char === "\u0964" || char === "\u0965") {
        hResult += ".";
      } else {
        hResult += char;
      }
    }

    return hResult
      .replace(/\s+/g, " ")
      .replace(/\bhee\b/gi, "hi")
      .replace(/\bbhee\b/gi, "bhi")
      .replace(/\bkee\b/gi, "ki")
      .replace(/\btoo\b/gi, "tu")
      .trim();
  }

  return input.trim();
}

/**
 * Parse standard or enhanced LRC timestamped text format: [mm:ss.xx] Lyric text
 * Supports enhanced word tags <mm:ss.xx> and calculates word-level timings for progressive karaoke.
 */
export function parseLrc(lrcContent: string): LyricLine[] {
  if (!lrcContent || typeof lrcContent !== "string") return [];

  const lines: { time: number; text: string; words?: LyricWord[] }[] = [];
  const rawLines = lrcContent.split(/\r?\n/);
  const timeRegex = /\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]/g;
  const wordTagRegex = /<(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)>/g;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed)) {
      continue;
    }

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    const lineWithoutLineTags = trimmed.replace(timeRegex, "").trim();

    // Check if line contains word tags like <00:12.30>word
    const hasWordTags = wordTagRegex.test(lineWithoutLineTags);
    wordTagRegex.lastIndex = 0;

    let parsedWords: LyricWord[] | undefined;
    let cleanLineText = "";

    if (hasWordTags) {
      const parts: { time: number; text: string }[] = [];
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      let lastTime = 0;

      while ((match = wordTagRegex.exec(lineWithoutLineTags)) !== null) {
        const min = parseInt(match[1], 10);
        const sec = parseFloat(match[2]);
        const wordTime = isNaN(min) || isNaN(sec) ? lastTime : min * 60 + sec;
        const textBefore = lineWithoutLineTags.substring(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({ time: lastTime, text: textBefore });
        }
        lastTime = wordTime;
        lastIndex = match.index + match[0].length;
      }
      const textAfter = lineWithoutLineTags.substring(lastIndex).trim();
      if (textAfter) {
        parts.push({ time: lastTime, text: textAfter });
      }

      if (parts.length > 0) {
        parsedWords = [];
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
          const p = parts[pIdx];
          const nextTime = parts[pIdx + 1]?.time ?? (p.time + 0.6);
          parsedWords.push({
            text: romanizeToHinglish(p.text),
            start: p.time,
            end: Math.max(p.time + 0.15, nextTime),
          });
        }
        cleanLineText = parsedWords.map((w) => w.text).join(" ");
      }
    }

    if (!cleanLineText) {
      cleanLineText = romanizeToHinglish(lineWithoutLineTags.replace(wordTagRegex, "").trim());
    }

    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      if (isNaN(minutes) || isNaN(seconds)) continue;

      const totalSeconds = Math.max(0, minutes * 60 + seconds);
      lines.push({
        time: totalSeconds,
        text: cleanLineText,
        words: parsedWords,
      });
    }
  }

  lines.sort((a, b) => a.time - b.time);

  const filtered: LyricLine[] = [];

  // Insert intro break if intro is longer than 5 seconds
  if (lines.length > 0 && lines[0].time > 5.0) {
    filtered.push({
      id: `break_intro_${Math.round(lines[0].time)}`,
      time: 0,
      text: "♪",
      isBreak: true,
      duration: lines[0].time,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i];
    if (curr.text === "" && filtered[filtered.length - 1]?.text === "") {
      continue;
    }

    const next = lines[i + 1];
    let words: LyricWord[] | undefined = curr.words;

    // If word timestamps weren't in the raw LRC, generate word segments
    if (!words || words.length === 0) {
      const tokens = curr.text.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        const lineStart = curr.time;
        const nextTime =
          next && next.time > lineStart
            ? next.time
            : lineStart + Math.max(2.5, tokens.length * 0.45);
        const lineDuration = Math.max(
          0.8,
          Math.min(nextTime - lineStart, Math.max(1.8, tokens.length * 0.55))
        );

        let totalWeight = 0;
        for (const token of tokens) {
          totalWeight += Math.max(1, token.length);
        }

        let currStart = lineStart;
        words = [];
        for (const token of tokens) {
          const weight = Math.max(1, token.length);
          const dur = (weight / totalWeight) * lineDuration;
          words.push({
            text: token,
            start: currStart,
            end: currStart + dur,
          });
          currStart += dur;
        }
      }
    }

    filtered.push({
      id: `lrc_${curr.time}_${i}`,
      time: curr.time,
      text: curr.text,
      words: words && words.length > 0 ? words : undefined,
    });

    // Check for instrumental break between verses (> 6.5s gap)
    if (next && curr.text.trim() !== "") {
      const gap = next.time - curr.time;
      if (gap > 6.5) {
        const breakStart = curr.time + 2.0;
        const breakDur = next.time - breakStart;
        if (breakDur >= 3.5) {
          filtered.push({
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

  return filtered;
}

/**
 * Parse plain text lyrics into non-timed LyricLine objects.
 */
function parsePlainText(plain: string): LyricLine[] {
  if (!plain) return [];
  const lines = plain.split(/\r?\n/);
  const result: LyricLine[] = [];
  let validIndex = 0;
  for (const rawLine of lines) {
    const text = romanizeToHinglish(rawLine.trim());
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

interface FetchSongParams {
  id?: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number; // in seconds
}

/**
 * Query LRCLIB direct get endpoint.
 */
async function fetchLrclibDirect(
  title: string,
  artist: string,
  duration?: number
): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    if (duration && duration > 10) {
      params.append("duration", Math.round(duration).toString());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mavrixfy-App/1.0 (https://mavrixfy.com)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();

    if (data.syncedLyrics) {
      const lines = parseLrc(data.syncedLyrics);
      if (lines.length > 0) {
        return {
          synced: true,
          lines,
          plainLyrics: data.plainLyrics || undefined,
          provider: "lrclib",
          trackName: data.name,
          artistName: data.artistName,
        };
      }
    }

    if (data.plainLyrics) {
      const lines = parsePlainText(data.plainLyrics);
      if (lines.length > 0) {
        return {
          synced: false,
          lines,
          plainLyrics: data.plainLyrics,
          provider: "lrclib",
          trackName: data.name,
          artistName: data.artistName,
        };
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

/**
 * Query LRCLIB search fallback endpoint (fuzzy matching).
 */
async function fetchLrclibSearch(
  title: string,
  artist: string
): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({
      q: `${title} ${artist}`.trim(),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mavrixfy-App/1.0 (https://mavrixfy.com)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const list = await response.json();

    if (Array.isArray(list) && list.length > 0) {
      const syncedItem = list.find((item) => Boolean(item.syncedLyrics));
      if (syncedItem && syncedItem.syncedLyrics) {
        const lines = parseLrc(syncedItem.syncedLyrics);
        if (lines.length > 0) {
          return {
            synced: true,
            lines,
            plainLyrics: syncedItem.plainLyrics || undefined,
            provider: "lrclib",
            trackName: syncedItem.name,
            artistName: syncedItem.artistName,
          };
        }
      }

      const plainItem = list.find((item) => Boolean(item.plainLyrics));
      if (plainItem && plainItem.plainLyrics) {
        const lines = parsePlainText(plainItem.plainLyrics);
        if (lines.length > 0) {
          return {
            synced: false,
            lines,
            plainLyrics: plainItem.plainLyrics,
            provider: "lrclib",
            trackName: plainItem.name,
            artistName: plainItem.artistName,
          };
        }
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

/**
 * Query JioSaavn lyrics fallback endpoint.
 */
async function fetchJioSaavnLyrics(songId?: string): Promise<LyricsResult | null> {
  if (!songId) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const url = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&lyrics_id=${encodeURIComponent(
      songId
    )}&ctx=web6dot0&api_version=4&_format=json`;

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();

    if (data.lyrics && typeof data.lyrics === "string") {
      const unescaped = data.lyrics
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      if (/\[\d{1,2}:\d{1,2}/.test(unescaped)) {
        const lines = parseLrc(unescaped);
        if (lines.length > 0) {
          return {
            synced: true,
            lines,
            plainLyrics: unescaped,
            provider: "jiosaavn",
          };
        }
      }

      const lines = parsePlainText(unescaped);
      if (lines.length > 0) {
        return {
          synced: false,
          lines,
          plainLyrics: unescaped,
          provider: "jiosaavn",
        };
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

/**
 * Master entry point: Clean, simple 3-tier lyrics pipeline.
 */
export async function getSongLyrics(song: FetchSongParams): Promise<LyricsResult> {
  if (!song?.title) {
    return { synced: false, lines: [], provider: "none" };
  }

  const cacheKey = `${song.id || ""}_${song.title}_${song.artist || ""}`.toLowerCase();
  const cached = lyricsCache.get(cacheKey);
  if (cached) return cached;

  const cleanTitle = sanitizeTrackTitle(song.title);
  const cleanArtist = sanitizeArtistName(song.artist || "");

  // Tier 1: LRCLIB Direct get (Synced LRC)
  let result = await fetchLrclibDirect(cleanTitle, cleanArtist, song.duration);

  // Tier 2: LRCLIB Search fuzzy fallback
  if (!result && cleanTitle) {
    result = await fetchLrclibSearch(cleanTitle, cleanArtist);
  }

  // Tier 3: JioSaavn catalogue lyrics
  if (!result && song.id) {
    result = await fetchJioSaavnLyrics(song.id);
  }

  const finalResult: LyricsResult = result || {
    synced: false,
    lines: [],
    provider: "none",
  };

  // Cache in memory
  if (lyricsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = lyricsCache.keys().next().value;
    if (firstKey) lyricsCache.delete(firstKey);
  }
  lyricsCache.set(cacheKey, finalResult);

  return finalResult;
}
