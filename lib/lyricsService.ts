import { logger } from "./logger";
import { getYouTubeMusicApiUrl } from "./api-config";

export type LyricsLine = {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
};

export type LyricsData = {
  lines: LyricsLine[];
  source: string | null;
  isTimeSynced: boolean;
  language?: string;
};

export type RawLyricsResponse = {
  lyrics: string | null;
  source: string | null;
  error?: string | null;
};

type LyricsResponseEnvelope = RawLyricsResponse & {
  data?: RawLyricsResponse | null;
};

type WatchLyricsResponse = {
  lyrics?: string | null;
  data?: {
    lyrics?: string | null;
  } | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeLyricsResponse(response: LyricsResponseEnvelope): RawLyricsResponse {
  const payload = response.data ?? response;

  return {
    lyrics: readString(payload.lyrics),
    source: readString(payload.source),
    error: readString(payload.error),
  };
}

function getLyricsBrowseId(response: WatchLyricsResponse): string | null {
  return readString(response.data?.lyrics) ?? readString(response.lyrics);
}

async function fetchJson<T>(url: string): Promise<{ data: T | null; response: Response }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return { data: null, response };
  }

  const data = (await response.json()) as T;
  return { data, response };
}

function parseLyricsData(data: RawLyricsResponse, videoId: string): LyricsData | null {
  if (!data.lyrics) {
    logger.debug("[LyricsService] No lyrics available for videoId", {
      videoId,
      error: data.error,
    });
    return null;
  }

  const isTimeSynced = isLRCFormat(data.lyrics);
  const lines = isTimeSynced
    ? parseLRCLyrics(data.lyrics)
    : parsePlainTextLyrics(data.lyrics);

  logger.info("[LyricsService] Successfully fetched lyrics", {
    videoId,
    linesCount: lines.length,
    isTimeSynced,
    source: data.source,
  });

  return {
    lines,
    source: data.source,
    isTimeSynced,
  };
}

/**
 * Parse LRC format lyrics (with timestamps)
 * Format: [mm:ss.xx]Line text
 */
function parseLRCLyrics(lrcText: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  const lrcLines = lrcText.split('\n');
  
  for (let i = 0; i < lrcLines.length; i++) {
    const line = lrcLines[i].trim();
    if (!line) continue;
    
    // Match [mm:ss.xx] or [mm:ss] format
    const match = line.match(/^\[(\d{1,2}):(\d{2})\.?(\d{0,2})\](.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const centiseconds = match[3] ? parseInt(match[3].padEnd(2, '0'), 10) : 0;
      const text = match[4].trim();
      
      if (text) {
        const startTimeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
        // Calculate end time (next line start or add 3 seconds)
        const nextLine = i < lrcLines.length - 1 ? lrcLines[i + 1] : null;
        let endTimeMs = startTimeMs + 3000; // Default 3 second duration
        
        if (nextLine) {
          const nextMatch = nextLine.match(/^\[(\d{1,2}):(\d{2})\.?(\d{0,2})\]/);
          if (nextMatch) {
            const nextMinutes = parseInt(nextMatch[1], 10);
            const nextSeconds = parseInt(nextMatch[2], 10);
            const nextCentiseconds = nextMatch[3] ? parseInt(nextMatch[3].padEnd(2, '0'), 10) : 0;
            endTimeMs = (nextMinutes * 60 + nextSeconds) * 1000 + nextCentiseconds * 10;
          }
        }
        
        lines.push({
          text,
          startTimeMs,
          endTimeMs,
        });
      }
    }
  }
  
  return lines;
}

/**
 * Parse plain text lyrics (no timestamps)
 */
function parsePlainTextLyrics(text: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  const textLines = text.split('\n').filter(line => line.trim());
  
  // Distribute lines evenly across a typical 3-minute song
  const estimatedDuration = 180000; // 3 minutes in ms
  const timePerLine = estimatedDuration / textLines.length;
  
  textLines.forEach((line, index) => {
    if (line.trim()) {
      lines.push({
        text: line.trim(),
        startTimeMs: index * timePerLine,
        endTimeMs: (index + 1) * timePerLine,
      });
    }
  });
  
  return lines;
}

/**
 * Detect if lyrics text contains LRC format timestamps
 */
function isLRCFormat(text: string): boolean {
  return /^\[\d{1,2}:\d{2}\.?\d{0,2}\]/.test(text.trim());
}

/**
 * Fetch lyrics from YouTube Music API using videoId
 */
export async function fetchLyrics(videoId: string): Promise<LyricsData | null> {
  try {
    const backendUrl = getYouTubeMusicApiUrl();
    if (!backendUrl) {
      logger.warn("[LyricsService] YouTube Music backend URL not configured");
      return null;
    }

    const url = `${backendUrl}lyrics/video/${encodeURIComponent(videoId)}`;
    logger.debug("[LyricsService] Fetching lyrics from", { url, videoId });

    const primary = await fetchJson<LyricsResponseEnvelope>(url);

    if (primary.response.ok && primary.data) {
      const primaryLyrics = parseLyricsData(normalizeLyricsResponse(primary.data), videoId);
      if (primaryLyrics) {
        return primaryLyrics;
      }
    } else {
      logger.warn("[LyricsService] Failed to fetch lyrics", {
        status: primary.response.status,
        statusText: primary.response.statusText,
      });
    }

    const watchUrl = `${backendUrl}watch/${encodeURIComponent(videoId)}?limit=1&radio=false`;
    logger.debug("[LyricsService] Fetching lyrics browseId from watch playlist", {
      watchUrl,
      videoId,
    });

    const watch = await fetchJson<WatchLyricsResponse>(watchUrl);
    if (!watch.response.ok || !watch.data) {
      logger.warn("[LyricsService] Failed to fetch watch playlist for lyrics", {
        status: watch.response.status,
        statusText: watch.response.statusText,
      });
      return null;
    }

    const browseId = getLyricsBrowseId(watch.data);
    if (!browseId) {
      logger.debug("[LyricsService] Watch playlist has no lyrics browseId", {
        videoId,
      });
      return null;
    }

    const browseLyricsUrl = `${backendUrl}lyrics/${encodeURIComponent(browseId)}`;
    logger.debug("[LyricsService] Fetching lyrics by browseId", {
      browseLyricsUrl,
      videoId,
      browseId,
    });

    const browseLyrics = await fetchJson<LyricsResponseEnvelope>(browseLyricsUrl);
    if (!browseLyrics.response.ok || !browseLyrics.data) {
      logger.warn("[LyricsService] Failed to fetch lyrics by browseId", {
        status: browseLyrics.response.status,
        statusText: browseLyrics.response.statusText,
      });
      return null;
    }

    return parseLyricsData(normalizeLyricsResponse(browseLyrics.data), videoId);
  } catch (error) {
    logger.error("[LyricsService] Error fetching lyrics", { error, videoId });
    return null;
  }
}

/**
 * Get the current active lyrics line based on playback position
 */
export function getCurrentLyricsLine(
  lines: LyricsLine[],
  positionMs: number
): number {
  if (lines.length === 0) return -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (positionMs >= line.startTimeMs && positionMs < line.endTimeMs) {
      return i;
    }
  }

  // If position is before first line
  if (positionMs < lines[0].startTimeMs) {
    return -1;
  }

  // If position is after last line, return last line index
  return lines.length - 1;
}

/**
 * Get upcoming lyrics lines for preview (next 3 lines)
 */
export function getUpcomingLines(
  lines: LyricsLine[],
  currentIndex: number,
  count: number = 3
): LyricsLine[] {
  if (currentIndex === -1 || currentIndex >= lines.length - 1) {
    return [];
  }

  const startIndex = currentIndex + 1;
  const endIndex = Math.min(startIndex + count, lines.length);
  
  return lines.slice(startIndex, endIndex);
}

/**
 * Get previous lyrics lines for context (previous 2 lines)
 */
export function getPreviousLines(
  lines: LyricsLine[],
  currentIndex: number,
  count: number = 2
): LyricsLine[] {
  if (currentIndex === -1 || currentIndex === 0) {
    return [];
  }

  const startIndex = Math.max(0, currentIndex - count);
  
  return lines.slice(startIndex, currentIndex);
}

/**
 * Format time for lyrics display
 */
export function formatLyricsTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
