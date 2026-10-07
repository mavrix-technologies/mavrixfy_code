import { Platform } from "react-native";
import type { Song } from "@/lib/musicData";
import type { PlaylistResult, ResultFilter, SearchResults } from "@/lib/searchRepository";

export interface NativeTrack { videoId: string; title: string; artist: string; coverUrl: string; duration: number }
interface NativePlaylist { id: string; name: string; coverUrl: string; songCount: number; url: string; description: string }
export interface PlaylistPage { songs: NativeTrack[]; cursor: string; name?: string; coverUrl?: string; songCount?: number }
export interface YouTubeStream {
  videoId: string; url: string; headers: Record<string, string>; expiresAt: number;
  bitrate: number; mimeType: string; codec: string; clientProfile: string; resolutionId: string;
  requestedQuality?: string;
}
// Transport contract retained for callers; implementation is shared TypeScript.
export interface YouTubeNative {
  search(query: string, filter: string, requestId: string): Promise<{ songs: NativeTrack[]; playlists: NativePlaylist[] }>;
  playlist(playlistId: string, cursor: string, requestId: string): Promise<PlaylistPage>;
  resolveStream(videoId: string, quality: string, requestId: string): Promise<YouTubeStream>;
  cancel(requestId: string): void;
  related(videoId: string, requestId: string): Promise<NativeTrack[]>;
  rejectStream(resolutionId: string): void;
}
let transport: YouTubeNative | undefined;
let sequence = 0;
export function isYouTubeSong(song: Pick<Song, "source" | "id">): boolean { return song.source === "youtube" || song.id.startsWith("youtube_"); }
export function youTubeAvailable(): boolean { return Platform.OS === "android" || Platform.OS === "ios"; }
function getTransport(): YouTubeNative {
  if (!youTubeAvailable()) throw new Error("YouTube Music is supported on Android and iOS.");
  // Load extractor only when YouTube is used, keeping JioSaavn startup light.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return transport ??= require("./SharedYouTubeTransport").sharedYouTubeTransport;
}
async function invoke<T>(operation: (module: YouTubeNative, id: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const module = getTransport();
  const id = `yt-${++sequence}`;
  if (signal?.aborted) throw new Error("YouTube request cancelled");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => { module.cancel(id); reject(new Error("YouTube request cancelled")); };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { module.cancel(id); reject(new Error("YouTube Music request timed out. Please retry.")); }, 26000);
  });
  try { return await Promise.race([operation(module, id), cancelled]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
export function normalizeYouTubeTrack(track: NativeTrack): Song {
  if (!/^[\w-]{11}$/.test(track.videoId)) throw new Error("Invalid YouTube video ID");
  return { id: `youtube_${track.videoId}`, source: "youtube", youtubeVideoId: track.videoId, videoId: track.videoId,
    title: track.title || "YouTube song", artist: track.artist || "YouTube Music", album: "", genre: "", duration: Number.isFinite(track.duration) ? Math.max(0, track.duration) : 0,
    coverUrl: track.coverUrl || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`, audioUrl: "" };
}
function normalizeTracks(tracks: NativeTrack[]): Song[] {
  const unique = new Map<string, Song>();
  for (const track of tracks) if (/^[\w-]{11}$/.test(track.videoId)) unique.set(track.videoId, normalizeYouTubeTrack(track));
  return [...unique.values()];
}
const searchCache = new Map<string, { at: number; results: SearchResults }>();
export async function searchYouTubeMusic(query: string, filter: ResultFilter, signal?: AbortSignal): Promise<SearchResults> {
  if (signal?.aborted) throw new Error("YouTube request cancelled");
  if (!query.trim()) return { songs: [], playlists: [], albums: [], artists: [] };
  const key = `${filter}:${query.trim().toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 180000) return cached.results;
  if (filter === "albums" || filter === "artists") return { songs: [], playlists: [], albums: [], artists: [] };
  const data = await invoke((module, id) => module.search(query.trim(), filter, id), signal);
  const playlists: PlaylistResult[] = data.playlists.map((item) => ({
    id: `youtube_playlist_${item.id}`, name: item.name, songCount: item.songCount,
    image: item.coverUrl ? [{ quality: "500x500", url: item.coverUrl }] : [], url: item.url, description: item.description,
  }));
  const results: SearchResults = { songs: normalizeTracks(data.songs), playlists, albums: [], artists: [] };
  if (!signal?.aborted) {
    if (searchCache.size >= 40) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(key, { at: Date.now(), results });
  }
  // Only two previews, using the same pending stream requests as playback.
  results.songs.slice(0, 2).forEach((song) => { void resolveYouTubeStream(song).catch(() => {}); });
  return results;
}
export async function loadYouTubePlaylist(id: string, signal?: AbortSignal) {
  const playlistId = id.replace(/^youtube_playlist_/, "");
  let cursor = "";
  let name = "YouTube Music playlist", coverUrl = "", songCount = 0;
  const all: NativeTrack[] = [];
  const seen = new Set<string>();
  for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
    const page = await invoke((module, requestId) => module.playlist(playlistId, cursor, requestId), signal);
    name = page.name || name; coverUrl = page.coverUrl || coverUrl; songCount = page.songCount || songCount;
    all.push(...page.songs);
    cursor = page.cursor;
    if (!cursor) { const songs = normalizeTracks(all); return { name, coverUrl, songCount: songCount || songs.length, songs }; }
    if (seen.has(cursor)) throw new Error("YouTube playlist returned a repeated page.");
    seen.add(cursor);
  }
  throw new Error("YouTube playlist is too large to load completely.");
}
export async function relatedYouTubeSongs(song: Song, signal?: AbortSignal): Promise<Song[]> {
  const id = song.youtubeVideoId || song.videoId || song.id.replace(/^youtube_/, "");
  return normalizeTracks(await invoke((module, requestId) => module.related(id, requestId), signal)).filter((item) => item.id !== song.id);
}
const streams = new Map<string, YouTubeStream>();
const pending = new Map<string, Promise<YouTubeStream>>();
const latest = new Map<string, Promise<YouTubeStream>>();
export function peekYouTubeStream(song: Song, quality?: string): YouTubeStream | undefined {
  const stream = streams.get(song.id);
  return stream && stream.expiresAt - Date.now() > 120000 && (!quality || stream.requestedQuality === quality) ? stream : undefined;
}
export async function resolveYouTubeStream(song: Song, quality?: string): Promise<YouTubeStream> {
  const requestedQuality = quality || "medium";
  const cached = peekYouTubeStream(song, requestedQuality);
  if (cached) { latest.delete(song.id); return cached; }
  const key = `${song.id}:${requestedQuality}`;
  const inFlight = pending.get(key);
  if (inFlight) { latest.set(song.id, inFlight); return inFlight; }
  const videoId = song.youtubeVideoId || song.videoId || song.id.replace(/^youtube_/, "");
  const promise = invoke((module, id) => module.resolveStream(videoId, requestedQuality, id)).then((stream) => {
    if (!stream.url.startsWith("https://") || stream.expiresAt <= Date.now()) throw new Error("YouTube returned an expired stream");
    if (pending.get(key) !== promise) throw new Error("YouTube stream request superseded");
    stream.requestedQuality = requestedQuality;
    if (latest.get(song.id) === promise) {
      if (streams.size >= 60) streams.delete(streams.keys().next().value!);
      streams.set(song.id, stream);
    }
    return stream;
  }).finally(() => {
    if (pending.get(key) === promise) pending.delete(key);
    if (latest.get(song.id) === promise) latest.delete(song.id);
  });
  pending.set(key, promise);
  latest.set(song.id, promise);
  return promise;
}
export function invalidateYouTubeStream(song: Song, rejectProfile = false): void {
  const previous = streams.get(song.id);
  if (rejectProfile && previous) transport?.rejectStream(previous.resolutionId);
  streams.delete(song.id);
  latest.delete(song.id);
  for (const key of pending.keys()) if (key.startsWith(`${song.id}:`)) pending.delete(key);
}
export function rejectYouTubeStream(song: Song): void { invalidateYouTubeStream(song, true); }
export function youTubeSongWithStream(song: Song, stream = peekYouTubeStream(song)): Song {
  return stream ? { ...song, audioUrl: stream.url, playbackHeaders: stream.headers, youtubeAudioExpiresAt: stream.expiresAt } : song;
}
export function youTubePlaybackErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/confirm.*not a bot|sign in|login.required/i.test(message))
    return "YouTube is requiring sign-in for this connection. Please try again later.";
  if (/private|removed|not available|unavailable|restricted/i.test(message))
    return "This YouTube song is unavailable right now. Tap Play to retry.";
  if (/timed out|timeout/i.test(message)) return "YouTube playback timed out. Tap Play to retry.";
  return "Could not play this YouTube song. Tap Play to retry.";
}
