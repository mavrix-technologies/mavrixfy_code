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

export function recordingVersion(value: string): string {
  const title = value.normalize("NFKC").toLowerCase().replace(/[-_]/g, " ");
  const versions = [
    /\bremix(?:ed)?\b/, /\blive\b/, /\bacoustic\b/, /\bunplugged\b/,
    /\bcover\b/, /\bkaraoke\b/, /\binstrumental\b/, /\bmashup\b/,
    /\blo\s*fi\b/, /\bslowed\b/, /\bsped\s*up\b/, /\bremaster(?:ed)?\b/,
    /\bre\s*record(?:ed|ing)?\b/, /\bradio\s*edit\b/, /\bextended\b/,
  ];
  return versions.map((pattern, index) => pattern.test(title) ? index : -1).filter(index => index >= 0).join(",");
}

/** Conservative recording match: uncertain results retain the original YouTube source. */
export function matchesJioSaavnRecording(song: Song, candidate: Song): boolean {
  if (recordingVersion(song.title) !== recordingVersion(candidate.title)) return false;
  const duration = toDurationSeconds(song.duration), other = toDurationSeconds(candidate.duration);
  const title = normalizeRecordingTitle(song.title);
  const performers = artists(song.artist).filter(name => !/^(unknown(?: artist)?|youtube music|various artists)$/.test(name));
  const performerNames = new Set(performers);
  return Boolean(title && title === normalizeRecordingTitle(candidate.title) && duration > 0 && other > 0 &&
    Math.abs(duration - other) <= Math.min(5, Math.max(2, duration * 0.01)) &&
    performers.length && artists(candidate.artist).some(name => performerNames.has(name)));
}

const PREFERRED_MISS_TTL_MS = 10 * 60_000;
const PREFERRED_LOOKUP_TIMEOUT_MS = 2200;
const negativeMissCache = new Map<string, number>();

function negativeMissKey(song: Song): string {
  return `${song.id}:${normalizeRecordingTitle(song.title)}:${artists(song.artist).join(",")}:${toDurationSeconds(song.duration)}`;
}

/** One bounded search + media check; no background source replacement while audio plays. */
export async function preferredJioSaavnStream(
  song: Song,
  videoId: string,
  signal?: AbortSignal
): Promise<YouTubeStream | null> {
  if (signal?.aborted || !matchesJioSaavnRecording(song, song)) return null;
  const missKey = negativeMissKey(song);
  const missedAt = negativeMissCache.get(missKey);
  if (missedAt && Date.now() - missedAt < PREFERRED_MISS_TTL_MS) return null;

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, PREFERRED_LOOKUP_TIMEOUT_MS);
  try {
    const query = `${normalizeRecordingTitle(song.title)} ${artists(song.artist).join(" ")}`;
    const response = await fetch(
      `${buildAppApiUrl("/search/songs")}?query=${encodeURIComponent(query)}&limit=10&page=1&country=IN`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const results = [payload?.data?.results, payload?.data?.songs?.results, payload?.data?.songs,
      payload?.results, payload?.songs?.results, payload?.songs, payload?.data].find(Array.isArray) || [];
    for (const raw of results.slice(0, 10)) {
      if (controller.signal.aborted) return null;
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
      negativeMissCache.delete(missKey);
      return { videoId, url: source.url, headers: {}, expiresAt: Date.now() + 5 * 60_000,
        bitrate: source.bitrate * 1000, codec: "", mimeType, clientProfile: "JIOSAAVN",
        resolutionId: `jiosaavn:${raw.id}`, durationSeconds: candidate.duration };
    }
    if (negativeMissCache.size >= 120) negativeMissCache.delete(negativeMissCache.keys().next().value!);
    negativeMissCache.set(missKey, Date.now());
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
