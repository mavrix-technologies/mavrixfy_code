import { NativeModules, Platform } from "react-native";
import type { Song } from "@/lib/musicData";
import type { PlaylistResult, ResultFilter, SearchResults } from "@/lib/searchRepository";

interface NativeTrack { videoId: string; title: string; artist: string; coverUrl: string; duration: number }
interface NativePlaylist { id: string; name: string; coverUrl: string; songCount: number; url: string; description: string }
interface PlaylistPage { songs: NativeTrack[]; cursor: string; name?: string; coverUrl?: string; songCount?: number }
export interface YouTubeStream {
  videoId: string; url: string; headers: Record<string, string>; expiresAt: number;
  bitrate: number; mimeType: string; codec: string; clientProfile: string; resolutionId: string;
  requestedQuality?: string;
}
interface YouTubeNative {
  search(query: string, filter: string, requestId: string): Promise<{ songs: NativeTrack[]; playlists: NativePlaylist[] }>;
  playlist(playlistId: string, cursor: string, requestId: string): Promise<PlaylistPage>;
  resolveStream(videoId: string, quality: string, requestId: string): Promise<YouTubeStream>;
  cancel(requestId: string): void;
  related(videoId: string, requestId: string): Promise<NativeTrack[]>;
  rejectStream(resolutionId: string): void;
}
const native = NativeModules.MavrixfyYouTube as YouTubeNative | undefined;
let sequence = 0;
export function isYouTubeSong(song: Pick<Song, "source" | "id">): boolean { return song.source === "youtube" || song.id.startsWith("youtube_"); }
export function youTubeAvailable(): boolean { return (Platform.OS === "android" || Platform.OS === "ios") && !!native; }
function requireNative(): YouTubeNative {
  if (!youTubeAvailable()) throw new Error("YouTube Music requires the updated native app build.");
  return native!;
}
async function invoke<T>(operation: (module: YouTubeNative, id: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const module = requireNative();
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
    title: track.title, artist: track.artist || "YouTube Music", album: "", genre: "", duration: Math.max(0, track.duration),
    coverUrl: track.coverUrl || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`, audioUrl: "" };
}
function normalizeTracks(tracks: NativeTrack[]): Song[] {
  const unique = new Map<string, Song>();
  for (const track of tracks) if (/^[\w-]{11}$/.test(track.videoId)) unique.set(track.videoId, normalizeYouTubeTrack(track));
  return [...unique.values()];
}
const searchCache = new Map<string, { at: number; results: SearchResults }>();
export async function searchYouTubeMusic(query: string, filter: ResultFilter, signal?: AbortSignal): Promise<SearchResults> {
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
  for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
    const page = await invoke((module, requestId) => module.playlist(playlistId, cursor, requestId), signal);
    name = page.name || name; coverUrl = page.coverUrl || coverUrl; songCount = page.songCount || songCount;
    all.push(...page.songs);
    cursor = page.cursor;
    if (!cursor) return { name, coverUrl, songCount, songs: normalizeTracks(all) };
  }
  throw new Error("YouTube playlist is too large to load completely.");
}
export async function relatedYouTubeSongs(song: Song, signal?: AbortSignal): Promise<Song[]> {
  const id = song.youtubeVideoId || song.videoId || song.id.replace(/^youtube_/, "");
  return normalizeTracks(await invoke((module, requestId) => module.related(id, requestId), signal)).filter((item) => item.id !== song.id);
}
const streams = new Map<string, YouTubeStream>();
const pending = new Map<string, Promise<YouTubeStream>>();
const generations = new Map<string, number>();
export function peekYouTubeStream(song: Song): YouTubeStream | undefined {
  const stream = streams.get(song.id);
  return stream && stream.expiresAt - Date.now() > 120000 ? stream : undefined;
}
export async function resolveYouTubeStream(song: Song, quality?: string): Promise<YouTubeStream> {
  const cached = peekYouTubeStream(song);
  if (cached) return cached;
  const inFlight = pending.get(song.id);
  if (inFlight) return inFlight;
  const videoId = song.youtubeVideoId || song.videoId || song.id.replace(/^youtube_/, "");
  const generation = generations.get(song.id) || 0;
  const promise = invoke((module, id) => module.resolveStream(videoId, quality || "medium", id)).then((stream) => {
    if (!stream.url.startsWith("https://") || stream.expiresAt <= Date.now()) throw new Error("YouTube returned an expired stream");
    if ((generations.get(song.id) || 0) !== generation) throw new Error("YouTube stream request superseded");
    stream.requestedQuality = quality || "medium";
    if ((generations.get(song.id) || 0) === generation) {
      if (streams.size >= 60) streams.delete(streams.keys().next().value!);
      streams.set(song.id, stream);
    }
    return stream;
  }).finally(() => { if (pending.get(song.id) === promise) pending.delete(song.id); });
  pending.set(song.id, promise);
  return promise;
}
export function rejectYouTubeStream(song: Song): void {
  const previous = streams.get(song.id);
  if (previous) native?.rejectStream(previous.resolutionId);
  streams.delete(song.id); pending.delete(song.id);
  generations.set(song.id, (generations.get(song.id) || 0) + 1);
}
export function youTubeSongWithStream(song: Song, stream = peekYouTubeStream(song)): Song {
  return stream ? { ...song, audioUrl: stream.url, playbackHeaders: stream.headers, youtubeAudioExpiresAt: stream.expiresAt } : song;
}
