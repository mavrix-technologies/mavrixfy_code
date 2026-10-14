import { buildAppApiUrl } from "@/lib/api-config";
import { resolveAudioStreamWithQuality, type Song } from "@/lib/musicData";
import { fetch as mediaFetch } from "expo/fetch";
import { toDurationSeconds } from "@/utils/timeFormatters";
import type { YouTubeStream } from "../youtube/YouTubeMusic";

export const normalizeRecordingTitle = (value: string) => value.normalize("NFKC").toLowerCase()
  .replace(/&amp;/g, "&").replace(/&#0?39;|&quot;/g, "")
  .replace(/\b(?:official\s+(?:music\s+)?(?:audio|video)|lyric(?:al|s)?\s+video|full\s+song)\b/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const artists = (value: string) => value.split(/,|&|\bfeat\.?\b|\bft\.?\b/i).map(normalizeRecordingTitle).filter(Boolean);

/** Conservative recording match: uncertain results retain the original YouTube source. */
export function matchesJioSaavnRecording(song: Song, candidate: Song): boolean {
  const duration = toDurationSeconds(song.duration), other = toDurationSeconds(candidate.duration);
  const title = normalizeRecordingTitle(song.title);
  const performers = artists(song.artist).filter(name => !/^(unknown(?: artist)?|youtube music|various artists)$/.test(name));
  const performerNames = new Set(performers);
  return Boolean(title && title === normalizeRecordingTitle(candidate.title) && duration > 0 && other > 0 &&
    Math.abs(duration - other) <= Math.min(5, Math.max(2, duration * 0.01)) &&
    performers.length && artists(candidate.artist).some(name => performerNames.has(name)));
}

/** One bounded search + media check; no background source replacement while audio plays. */
export async function preferredJioSaavnStream(song: Song, videoId: string): Promise<YouTubeStream | null> {
  if (!matchesJioSaavnRecording(song, song)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const query = `${normalizeRecordingTitle(song.title)} ${artists(song.artist).join(" ")}`;
    const response = await fetch(`${buildAppApiUrl("/search/songs")}?query=${encodeURIComponent(query)}&limit=10&page=1`,
      { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    const results = [payload?.data?.results, payload?.data?.songs?.results, payload?.data?.songs,
      payload?.results, payload?.songs?.results, payload?.songs, payload?.data].find(Array.isArray) || [];
    for (const raw of results.slice(0, 10)) {
      const candidate = { title: String(raw.name || raw.title || ""),
        artist: typeof raw.primaryArtists === "string" ? raw.primaryArtists :
          raw.artists?.primary?.map((artist: { name: string }) => artist.name).join(", ") || String(raw.artist || ""),
        duration: toDurationSeconds(raw.duration) } as Song;
      if (!matchesJioSaavnRecording(song, candidate)) continue;
      const source = resolveAudioStreamWithQuality(raw.downloadUrl, "high");
      if (!source || source.bitrate < 256) continue;
      const url = new URL(source.url);
      if (url.protocol !== "https:" || !/(^|\.)saavncdn\.com$/i.test(url.hostname)) continue;
      const media = await mediaFetch(source.url, { signal: controller.signal, headers: { Range: "bytes=0-1023" } });
      const mimeType = media.headers.get("content-type") || "";
      const usable = (media.status === 200 || media.status === 206) && /^(audio\/|video\/mp4)/i.test(mimeType);
      await media.body?.cancel();
      if (!usable) return null;
      return { videoId, url: source.url, headers: {}, expiresAt: Date.now() + 5 * 60_000,
        bitrate: source.bitrate * 1000, codec: "", mimeType, clientProfile: "JIOSAAVN",
        resolutionId: `jiosaavn:${raw.id}`, durationSeconds: candidate.duration };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
