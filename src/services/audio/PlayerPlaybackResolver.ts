import type { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { logger } from "@/lib/logger";
import { toDurationSeconds } from "@/utils/timeFormatters";
import type { PlaybackQualityState, ResolvedPlaybackResult } from "@/types/playbackTypes";

export type SongPlaybackSource = Partial<Song> & {
  url?: string;
  uri?: string;
  streamUrl?: string;
  downloadUrl?: unknown;
};

export function readNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

export function isKnownNonAudioPageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (/\.(?:mp3|m4a|mp4|aac|opus|ogg|wav|flac|m3u8)(?:$|[?#])/i.test(path)) return false;
    if (host.includes("saavncdn.com") || host.includes("gaanacdn.com") || host.includes("akamaized.net")) return false;
    if (host === "gaana.com" || host === "www.gaana.com" || host === "jiosaavn.com" || host === "www.jiosaavn.com") return true;
    if (host.includes("youtube.com") || host.includes("youtu.be")) return true;
    if (host.includes("spotify.com") || host.includes("music.apple.com")) return true;
  } catch {
    return false;
  }

  return false;
}

export function readAudioCandidate(value: unknown): string {
  const url = readNonEmptyString(value);
  if (!url || isKnownNonAudioPageUrl(url)) return "";
  return url;
}

export function readDownloadAudioUrl(value: unknown): string {
  if (typeof value === "string") return readAudioCandidate(value);

  if (Array.isArray(value)) {
    const preferredQualities = ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"];
    for (const quality of preferredQualities) {
      const match = value.find((item) => String(item?.quality || "").toLowerCase() === quality);
      const url = readAudioCandidate(match?.url) || readAudioCandidate(match?.link);
      if (url) return url;
    }

    for (let index = value.length - 1; index >= 0; index -= 1) {
      const item = value[index];
      const url =
        typeof item === "string"
          ? readAudioCandidate(item)
          : readAudioCandidate(item?.url) || readAudioCandidate(item?.link);
      if (url) return url;
    }
  }

  if (value && typeof value === "object") {
    const item = value as { url?: unknown; link?: unknown };
    return readAudioCandidate(item.url) || readAudioCandidate(item.link);
  }

  return "";
}

export function resolveAudioUrl(source: SongPlaybackSource | null | undefined): string {
  if (!source) return "";

  const directCandidates = [source.audioUrl, source.uri, source.streamUrl];
  for (const candidate of directCandidates) {
    const value = readAudioCandidate(candidate);
    if (value) return value;
  }

  const downloadUrl = readDownloadAudioUrl(source.downloadUrl);
  if (downloadUrl) return downloadUrl;

  return readAudioCandidate(source.url);
}

export function withResolvedPlaybackUrl(song: Song, audioUrl: string): Song {
  const resolvedUrl = readNonEmptyString(audioUrl);
  if (!resolvedUrl || song.audioUrl === resolvedUrl) return song;
  return { ...song, audioUrl: resolvedUrl };
}

export function cleanHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'");
}

export function songToTrack(song: Song, localUrl?: string | null, cachedUrlMap?: Map<string, string>): any {
  const audioUrl = localUrl || cachedUrlMap?.get(song.id) || resolveAudioUrl(song as SongPlaybackSource);
  const rawDuration = song.duration ?? (song as any)?.duration_ms ?? (song as any)?.durationSeconds;
  const duration = toDurationSeconds(rawDuration);
  const title = cleanHtmlEntities(readNonEmptyString(song.title) || "Unknown");
  const artist = cleanHtmlEntities(readNonEmptyString(song.artist) || "Mavrixfy");
  const album = song.album ? cleanHtmlEntities(readNonEmptyString(song.album) || "") : undefined;
  return {
    id: song.id,
    url: audioUrl,
    title,
    artist,
    album,
    genre: readNonEmptyString(song.genre),
    artwork: song.coverUrl,
    ...(duration > 0 ? { duration } : {}),
    ...(song.playbackHeaders && Object.keys(song.playbackHeaders).length > 0
      ? { headers: song.playbackHeaders }
      : {}),
  };
}

export async function getRequestedQualityPreference(): Promise<{
  requested: "low" | "medium" | "high";
  effective: "low" | "medium" | "high";
  unlocked: boolean;
}> {
  try {
    const settings = await Storage.getSettings();
    const unlocked = Storage.isHighQualityEntitled(settings);
    const requested = settings.streamingQuality || "medium";
    const effective = Storage.getEffectiveStreamingQuality(settings);
    return { requested, effective, unlocked };
  } catch (e) {
    logger.error("[Player] Failed to determine streaming quality preference", e);
    return { requested: "medium", effective: "medium", unlocked: false };
  }
}

/** Resolve the best playback URL and metadata for a song based on explicit quality entitlement. */
export async function resolvePlaybackUrlWithDetails(
  song: Song,
  forcedQuality?: "low" | "medium" | "high"
): Promise<ResolvedPlaybackResult> {
  const { requested, effective, unlocked } = await getRequestedQualityPreference();
  const targetQuality = forcedQuality || effective;

  const defaultQualityState: PlaybackQualityState = {
    requested: forcedQuality || requested,
    actualBitrate: targetQuality === "high" ? 320 : targetQuality === "medium" ? 160 : 96,
    qualityLabel: targetQuality === "high" ? "320kbps" : targetQuality === "medium" ? "160kbps" : "96kbps",
    unlocked,
    isFallback: false,
  };

  try {
    // 1. Local downloaded file
    const { getLocalPlaybackUrl } = await import("@/lib/downloads/downloadManager");
    const local = await getLocalPlaybackUrl(song.id);
    if (local) {
      const url = local.startsWith("file://") || local.startsWith("http") ? local : `file://${local}`;
      return {
        url,
        qualityState: {
          requested,
          actualBitrate: 320,
          qualityLabel: "Offline (320kbps)",
          unlocked,
          isFallback: false,
        },
      };
    }
  } catch {
    // Fall through
  }

  // 2. JioSaavn / Catalogue Songs -> Quality ladder selection
  if (song.downloadUrl) {
    try {
      const { resolveAudioStreamWithQuality } = await import("@/lib/musicData");
      const stream = resolveAudioStreamWithQuality(song.downloadUrl, targetQuality);
      if (stream?.url) {
        const playableUrl = readAudioCandidate(stream.url);
        if (playableUrl) {
          return {
            url: playableUrl,
            qualityState: {
              requested,
              actualBitrate: stream.bitrate,
              qualityLabel: stream.qualityLabel,
              unlocked,
              isFallback: stream.isFallback,
            },
          };
        }
      }
    } catch (e) {
      logger.error("[Player] Failed to resolve quality-specific audio URL:", e);
    }
  }

  // 3. Direct audio URL fallback
  const fallbackUrl = resolveAudioUrl(song as SongPlaybackSource) || null;
  return {
    url: fallbackUrl,
    qualityState: {
      ...defaultQualityState,
      isFallback: true,
    },
  };
}

/** Resolve the best playback URL for a song — local file first, then quality-specific stream, then direct candidate. */
export async function resolvePlaybackUrl(song: Song): Promise<string | null> {
  const result = await resolvePlaybackUrlWithDetails(song);
  return result.url;
}
