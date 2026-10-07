import { isYouTubeSong, peekYouTubeStream, resolveYouTubeStream, youTubeSongWithStream, rejectYouTubeStream } from "@/services/youtube/YouTubeMusic";
import { getAccountScope } from "@/lib/accountScope";
import { getLocalPlaybackUrl } from "@/lib/downloads/downloadManager";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { resolveAudioStreamWithQuality } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import type { PlaybackQualityState,ResolvedPlaybackResult } from "@/types/playbackTypes";
import { toDurationSeconds } from "@/utils/timeFormatters";

import * as Network from "expo-network";
import { getInfoAsync } from "expo-file-system/legacy";

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
    if (
      host.includes("saavncdn.com") ||
      host.includes("gaanacdn.com") ||
      host.includes("akamaized.net") ||
      host.includes("googlevideo.com")
    )
      return false;
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

  if (source.id && isYouTubeSong(source as Song) && !source.audioUrl?.startsWith("file://") && !source.audioUrl?.startsWith("/")) {
    return peekYouTubeStream(source as Song)?.url || "";
  }
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
  if (isYouTubeSong(song)) song = youTubeSongWithStream(song);
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
  if (isYouTubeSong(song)) song = youTubeSongWithStream(song);
  const audioUrl = localUrl || cachedUrlMap?.get(song.id) || resolveAudioUrl(song as SongPlaybackSource);
  const rawDuration =
    song.duration ??
    (song as any)?.duration_ms ??
    (song as any)?.durationSeconds ??
    (song as any)?.duration_sec;
  const duration = toDurationSeconds(rawDuration);
  const title = cleanHtmlEntities(readNonEmptyString(song.title) || "Unknown");
  const artist = cleanHtmlEntities(readNonEmptyString(song.artist) || "Mavrixfy");
  const album = song.album ? cleanHtmlEntities(readNonEmptyString(song.album) || "") : undefined;
  return {
    id: song.id,
    source: song.source,
    youtubeVideoId: song.youtubeVideoId || song.videoId,
    youtubeAudioExpiresAt: song.youtubeAudioExpiresAt,
    accountId: getAccountScope().accountId ?? "guest",
    url: audioUrl,
    title,
    artist,
    album,
    genre: readNonEmptyString(song.genre),
    artwork: song.coverUrl,
    isLiveStream: false,
    ...(duration > 0 ? { duration } : {}),
    ...(song.playbackHeaders && Object.keys(song.playbackHeaders).length > 0
      ? { headers: song.playbackHeaders }
      : {}),
  };
}

let cachedQualityPreference: {
  requested: "auto" | "low" | "medium" | "high";
  effective: "low" | "medium" | "high";
  unlocked: boolean;
  cachedAt: number;
} | null = null;

export function invalidateQualityPreferenceCache(): void {
  cachedQualityPreference = null;
}

export async function detectAutoStreamingQuality(unlocked: boolean): Promise<"low" | "medium" | "high"> {
  try {
    const netState = await Network.getNetworkStateAsync();
    // On cellular/slow mobile network, use 96kbps to ensure smooth playback without stalls
    if (netState.type === Network.NetworkStateType.CELLULAR) {
      return "low";
    }
    // On Wi-Fi or fast connection, stream 320kbps (if unlocked) or 160kbps
    if (
      netState.type === Network.NetworkStateType.WIFI ||
      netState.type === Network.NetworkStateType.ETHERNET
    ) {
      return unlocked ? "high" : "medium";
    }
  } catch (err) {
    logger.debug("[Player] Network state query failed, defaulting to medium", err);
  }
  return "medium";
}

export async function getRequestedQualityPreference(): Promise<{
  requested: "auto" | "low" | "medium" | "high";
  effective: "low" | "medium" | "high";
  unlocked: boolean;
}> {
  const now = Date.now();
  if (cachedQualityPreference && now - cachedQualityPreference.cachedAt < 30000) {
    return cachedQualityPreference;
  }

  try {
    const settings = await Storage.getSettings();
    const unlocked = Storage.isHighQualityEntitled(settings);
    const requested = (settings.streamingQuality || "auto") as "auto" | "low" | "medium" | "high";
    let effective: "low" | "medium" | "high";

    if (requested === "auto") {
      effective = await detectAutoStreamingQuality(unlocked);
    } else if (requested === "high") {
      effective = unlocked ? "high" : "medium";
    } else {
      effective = requested;
    }

    cachedQualityPreference = { requested, effective, unlocked, cachedAt: now };
    return cachedQualityPreference;
  } catch (e) {
    logger.error("[Player] Failed to determine streaming quality preference", e);
    return { requested: "auto", effective: "medium", unlocked: false };
  }
}

/** Resolve the best playback URL and metadata for a song based on explicit quality entitlement. */
export async function resolvePlaybackUrlWithDetails(
  song: Song,
  forcedQuality?: "auto" | "low" | "medium" | "high"
): Promise<ResolvedPlaybackResult> {
  const { requested, effective, unlocked } = await getRequestedQualityPreference();
  let targetQuality: "low" | "medium" | "high";

  if (forcedQuality === "auto") {
    targetQuality = await detectAutoStreamingQuality(unlocked);
  } else if (forcedQuality) {
    targetQuality = forcedQuality === "high" && !unlocked ? "medium" : forcedQuality;
  } else {
    targetQuality = effective;
  }

  const effectiveRequested = forcedQuality || requested;
  const defaultBitrate = targetQuality === "high" ? 320 : targetQuality === "medium" ? 160 : 96;
  const defaultLabel = effectiveRequested === "auto" ? `Auto (${defaultBitrate}kbps)` : `${defaultBitrate}kbps`;

  const defaultQualityState: PlaybackQualityState = {
    requested: effectiveRequested,
    actualBitrate: defaultBitrate,
    qualityLabel: defaultLabel,
    unlocked,
    isFallback: false,
  };

  try {
    // 1. Local downloaded file
    const local = await getLocalPlaybackUrl(song.id);
    if (local) {
      const url = local.startsWith("file://") || local.startsWith("http") ? local : `file://${local}`;
      return {
        url,
        qualityState: {
          requested: effectiveRequested,
          actualBitrate: 320,
          qualityLabel: "Offline (320kbps)",
          unlocked,
          isFallback: false,
        },
      };
    }

    // Direct local audioUrl fallback (e.g. from DownloadedSongsScreen)
    if (song.audioUrl && (song.audioUrl.startsWith("file://") || song.audioUrl.startsWith("/"))) {
      const cleanUrl = song.audioUrl.startsWith("file://") ? song.audioUrl : `file://${song.audioUrl}`;
      const info = await getInfoAsync(cleanUrl).catch(() => null);
      if (info?.exists && !info.isDirectory && ((info as any).size ?? 0) > 1024) {
        return {
          url: cleanUrl,
          qualityState: {
            requested: effectiveRequested,
            actualBitrate: 320,
            qualityLabel: "Offline (320kbps)",
            unlocked,
            isFallback: false,
          },
        };
      }
    }
  } catch {
    // Fall through
  }

  // YouTube owns resolution and quality reporting; a failure never enters another provider.
  if (isYouTubeSong(song)) {
    if (forcedQuality) rejectYouTubeStream(song);
    const stream = await resolveYouTubeStream(song, targetQuality);
    const bitrate = Math.round(stream.bitrate / 1000);
    return { url: stream.url, qualityState: { requested: effectiveRequested,
      actualBitrate: bitrate, qualityLabel: `${bitrate}kbps${stream.codec ? ` · ${stream.codec}` : ""}`,
      unlocked, isFallback: false } };
  }

  // 2. JioSaavn / Catalogue Songs -> Quality ladder selection
  if (song.downloadUrl) {
    try {
      const stream = resolveAudioStreamWithQuality(song.downloadUrl, targetQuality);
      if (stream?.url) {
        const playableUrl = readAudioCandidate(stream.url);
        if (playableUrl) {
          return {
            url: playableUrl,
            qualityState: {
              requested: effectiveRequested,
              actualBitrate: stream.bitrate,
              qualityLabel: effectiveRequested === "auto" ? `Auto (${stream.qualityLabel})` : stream.qualityLabel,
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

  // 4. Direct audio URL fallback (Non-YouTube tracks only)
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
