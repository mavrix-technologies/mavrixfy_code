import { isYouTubeSong, peekYouTubeStream, resolveYouTubeStream, youTubeSongWithStream, invalidateYouTubeStream } from "@/services/youtube/YouTubeMusic";
import { getAccountScope } from "@/lib/accountScope";
import { getLocalPlaybackUrl, getSongDownload } from "@/lib/downloads/downloadManager";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { convertJioSaavnSong, resolveAudioStreamWithQuality } from "@/lib/musicData";
import { isAudioPreviewUrl } from "@/services/spotify/SpotifyCatalogService";
import * as Storage from "@/lib/storage";
import type { PlaybackQualityState,ResolvedPlaybackResult } from "@/types/playbackTypes";
import { toDurationSeconds } from "@/utils/timeFormatters";

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

export function songToTrack(song: Song, localUrl?: string | null, cachedUrlMap?: Map<string, string>) {
  if (isYouTubeSong(song)) song = youTubeSongWithStream(song);
  const audioUrl = localUrl || cachedUrlMap?.get(song.id) || resolveAudioUrl(song as SongPlaybackSource);
  const duration = toDurationSeconds(song.duration);
  const title = cleanHtmlEntities(readNonEmptyString(song.title) || "Unknown");
  const artist = cleanHtmlEntities(readNonEmptyString(song.artist) || "Mavrixfy");
  const album = song.album ? cleanHtmlEntities(readNonEmptyString(song.album) || "") : undefined;
  return {
    id: song.id,
    source: song.source,
    youtubeVideoId: song.youtubeVideoId || song.videoId,
    youtubeAudioExpiresAt: song.youtubeAudioExpiresAt,
    playbackDurationSeconds: song.playbackDurationSeconds,
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
  preferJioSaavn: boolean;
} | null = null;

export function invalidateQualityPreferenceCache(): void {
  cachedQualityPreference = null;
}

export async function detectAutoStreamingQuality(unlocked: boolean): Promise<"low" | "medium" | "high"> {
  // Always output highest quality audio (320kbps) as requested by user
  return unlocked !== false ? "high" : "medium";
}

export async function getRequestedQualityPreference(): Promise<{
  requested: "auto" | "low" | "medium" | "high";
  effective: "low" | "medium" | "high";
  unlocked: boolean;
  preferJioSaavn: boolean;
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
      effective = "high";
    } else {
      effective = requested;
    }

    const preferJioSaavn = true;
    cachedQualityPreference = { requested, effective, unlocked, cachedAt: now, preferJioSaavn };
    return cachedQualityPreference;
  } catch (e) {
    logger.error("[Player] Failed to determine streaming quality preference", e);
    return { requested: "auto", effective: "medium", unlocked: false, preferJioSaavn: true };
  }
}

/** Resolve the best playback URL and metadata for a song based on explicit quality entitlement. */
export async function resolvePlaybackUrlWithDetails(
  song: Song,
  forcedQuality?: "auto" | "low" | "medium" | "high"
): Promise<ResolvedPlaybackResult> {
  const { requested, effective, unlocked, preferJioSaavn } = await getRequestedQualityPreference();
  let targetQuality: "low" | "medium" | "high";

  if (forcedQuality === "auto") {
    targetQuality = await detectAutoStreamingQuality(unlocked);
  } else if (forcedQuality) {
    targetQuality = forcedQuality === "high" && !unlocked ? "medium" : forcedQuality;
  } else {
    targetQuality = effective;
  }

  const effectiveRequested = forcedQuality || requested;
  const defaultQualityState: PlaybackQualityState = {
    requested: effectiveRequested,
    actualBitrate: 0,
    qualityLabel: "Original audio",
    unlocked,
    isFallback: false,
  };

  const offlineQuality = async (): Promise<PlaybackQualityState> => {
    const download = await getSongDownload(song.id).catch(() => null);
    const bitrate = download?.status === "completed" && typeof download.audioBitrate === "number" &&
      Number.isFinite(download.audioBitrate) && download.audioBitrate > 0 ? Math.round(download.audioBitrate / 1000) : 0;
    return { ...defaultQualityState, actualBitrate: bitrate, codec: download?.status === "completed" ? download.audioCodec : undefined,
      qualityLabel: bitrate > 0 ? `Offline (${bitrate}kbps${download?.audioCodec ? ` · ${download.audioCodec}` : ""})` : "Offline" };
  };

  const localSource = song.audioUrl && (song.audioUrl.startsWith("file://") || song.audioUrl.startsWith("/"))
    ? song.audioUrl : null;
  if (localSource) song = { ...song, audioUrl: "" };
  try {
    // 1. Local downloaded file
    const local = await getLocalPlaybackUrl(song.id);
    if (local) {
      const url = local.startsWith("file://") || local.startsWith("http") ? local : `file://${local}`;
      return {
        url,
        qualityState: await offlineQuality(),
      };
    }

    // Direct local audioUrl fallback (e.g. from DownloadedSongsScreen)
    if (localSource) {
      // Managed downloads are validated only by getLocalPlaybackUrl. A retained
      // screen/queue snapshot must not bypass a revoked, expired or missing file.
      const download = await getSongDownload(song.id);
      const cleanUrl = localSource.startsWith("file://") ? localSource : `file://${localSource}`;
      const info = download ? null : await getInfoAsync(cleanUrl).catch(() => null);
      if (info?.exists && !info.isDirectory && info.size > 1024) {
        return {
          url: cleanUrl,
          qualityState: await offlineQuality(),
        };
      }
    }
  } catch {
    // Fall through
  }

  // An opt-in recording match may supply the audio; song identity stays unchanged.
  if (isYouTubeSong(song)) {
    if (forcedQuality) invalidateYouTubeStream(song);
    const stream = await resolveYouTubeStream(song, targetQuality, targetQuality !== "low" && preferJioSaavn);
    const bitrate = Number.isFinite(stream.bitrate) && stream.bitrate > 0 ? Math.round(stream.bitrate / 1000) : 0;
    return { url: stream.url, qualityState: { requested: effectiveRequested,
      actualBitrate: bitrate, codec: stream.codec, qualityLabel: `${bitrate > 0 ? `${bitrate}kbps` : "Original audio"}${stream.codec ? ` · ${stream.codec}` : ""}`,
      unlocked, isFallback: false } };
  }

  // iTunes / Spotify track audio resolution (E:\ria resolveFullSong pattern)
  if (song.id.startsWith("itunes_") || song.source === "spotify" || song.id.startsWith("sp_")) {
    try {
      const { resolveFullSongAudio } = await import("@/services/spotify/SpotifyCatalogService");
      const resolved = await resolveFullSongAudio(song);
      if (resolved?.url && !isAudioPreviewUrl(resolved.url)) {
        return {
          url: resolved.url,
          qualityState: {
            requested: effectiveRequested,
            actualBitrate: resolved.bitrate,
            qualityLabel: `${resolved.bitrate}kbps`,
            unlocked,
            isFallback: false,
          },
        };
      }
    } catch {}
  }

  // Older like caches did not retain audio URLs. Refresh by the original catalog ID,
  // only inside the original provider lane; this cannot run after a YouTube failure.
  if (song.likedSongDocumentIds?.length && (!song.source || song.source === "jiosaavn")
    && !resolveAudioUrl(song)) {
    const { getCatalogSongDetails } = await import("@/data/providers/MusicCatalogDetailsProvider");
    const details = await getCatalogSongDetails(song.id);
    if (details?.id === song.id) {
      const fresh = convertJioSaavnSong(details);
      song = { ...song, audioUrl: fresh.audioUrl, downloadUrl: fresh.downloadUrl };
    }
  }

  // 2. JioSaavn / Catalogue Songs -> Quality ladder selection
  if (song.downloadUrl) {
    try {
      const stream = resolveAudioStreamWithQuality(song.downloadUrl, targetQuality);
      if (stream?.url) {
        const playableUrl = readAudioCandidate(stream.url);
        if (playableUrl && !isAudioPreviewUrl(playableUrl)) {
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

  // 4. Direct audio URL fallback (Non-YouTube tracks only - strictly reject previews)
  const rawFallback = resolveAudioUrl(song as SongPlaybackSource) || null;
  const directCandidate = rawFallback && !isAudioPreviewUrl(rawFallback) ? rawFallback : null;
  if (directCandidate) {
    return {
      url: directCandidate,
      qualityState: {
        ...defaultQualityState,
        isFallback: true,
      },
    };
  }

  // If candidate was a 30s preview or missing, force resolve full-length 320kbps song
  try {
    const { resolveFullSongAudio } = await import("@/services/spotify/SpotifyCatalogService");
    const resolved = await resolveFullSongAudio(song);
    if (resolved?.url && !isAudioPreviewUrl(resolved.url)) {
      return {
        url: resolved.url,
        qualityState: {
          requested: effectiveRequested,
          actualBitrate: resolved.bitrate,
          qualityLabel: `${resolved.bitrate}kbps`,
          unlocked,
          isFallback: false,
        },
      };
    }
  } catch {}

  return {
    url: null,
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
