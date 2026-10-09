import { Platform } from "react-native";
import type { Song } from "@/lib/musicData";
import type { PlaylistResult, ResultFilter, SearchResults } from "@/lib/searchRepository";
import { youTubeArtworkUrl } from "./YouTubeArtwork";
import { playbackDuration, playbackStreamMetadata } from "../audio/audioTimeline";
import { artistChannelId, validArtistChannelId, type NativeArtist, type NativeArtistDetails, type ArtistCard, type ArtistDetails } from "./YouTubeArtists";
import type { OfficialMusicVideoQuery } from "./officialMusicVideo";

export interface NativeTrack { videoId: string; title: string; artist: string; coverUrl: string; duration: number; artists?: { id: string; name: string }[] }
export interface NativePlaylist { id: string; name: string; coverUrl: string; songCount: number; url: string; description: string; ownerChannelId?: string; ownerName?: string; kind?: "album" | "playlist" }
export interface NativeHomeSection { id: string; title: string; songs: NativeTrack[]; playlists: NativePlaylist[]; category?: "new-releases" | "trending" | "discover" }
export interface PlaylistPage { songs: NativeTrack[]; cursor: string; name?: string; coverUrl?: string; songCount?: number }
export interface YouTubeStream {
  videoId: string; url: string; headers: Record<string, string>; expiresAt: number;
  bitrate: number; mimeType: string; codec: string; clientProfile: string; resolutionId: string;
  requestedQuality?: string;
  durationSeconds?: number;
}
export interface YouTubeVideoStream extends YouTubeStream { height: number }
// Transport contract retained for callers; implementation is shared TypeScript.
export type NativeHomeFeed = { songs: NativeTrack[]; playlists: NativePlaylist[]; sections?: NativeHomeSection[] };
export interface YouTubeNative {
  home(requestId: string, onFirstPage?: (feed: NativeHomeFeed) => void): Promise<NativeHomeFeed>;
  explore(requestId: string): Promise<{ songs: NativeTrack[]; playlists: NativePlaylist[]; sections?: NativeHomeSection[] }>;
  search(query: string, filter: string, requestId: string): Promise<{ songs: NativeTrack[]; playlists: NativePlaylist[]; artists?: NativeArtist[]; albums?: NativePlaylist[] }>;
  artist?(channelId: string, requestId: string): Promise<NativeArtistDetails>;
  artistSongs?(channelId: string, cursor: string, requestId: string): Promise<PlaylistPage>;
  playlist(playlistId: string, cursor: string, requestId: string): Promise<PlaylistPage>;
  discardPlaylistCursor?(cursor: string): void;
  resolveStream(videoId: string, quality: string, requestId: string): Promise<YouTubeStream>;
  resolveVideoStream(videoId: string, quality: string, requestId: string): Promise<YouTubeVideoStream>;
  resolveOfficialMusicVideo(query: OfficialMusicVideoQuery, requestId: string): Promise<string | null>;
  cancel(requestId: string): void;
  related(videoId: string, requestId: string): Promise<NativeTrack[]>;
  rejectStream(resolutionId: string): void;
}
let transport: YouTubeNative | undefined;
let sequence = 0;
export function isYouTubeSong(song: Pick<Song, "source" | "id">): boolean { return song.source === "youtube" || song.id.startsWith("youtube_"); }
export function youTubeAvailable(): boolean { return Platform.OS === "android" || Platform.OS === "ios"; }
function getTransport(): YouTubeNative {
  if (!youTubeAvailable()) throw new Error("Mavrixfy Music is unavailable on this platform.");
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
    timer = setTimeout(() => { module.cancel(id); reject(new Error("Mavrixfy Music request timed out. Please retry.")); }, 26000);
  });
  try { return await Promise.race([operation(module, id), cancelled]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
export function normalizeYouTubeTrack(track: NativeTrack): Song {
  if (!/^[\w-]{11}$/.test(track.videoId)) throw new Error("Invalid YouTube video ID");
  return { id: `youtube_${track.videoId}`, source: "youtube", youtubeVideoId: track.videoId, videoId: track.videoId,
    title: track.title || "Mavrixfy Music track", artist: track.artist || "Mavrixfy Music", album: "", genre: "", duration: Number.isFinite(track.duration) ? Math.max(0, track.duration) : 0,
    coverUrl: youTubeArtworkUrl(track.coverUrl) || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`, audioUrl: "",
    artistRefs: track.artists?.filter(artist => validArtistChannelId(artist.id)).map(artist => ({ ...artist, id: `youtube_artist_${artistChannelId(artist.id)}` })) };
}
function normalizeTracks(tracks: NativeTrack[]): Song[] {
  const unique = new Map<string, Song>();
  for (const track of tracks) if (/^[\w-]{11}$/.test(track.videoId)) unique.set(track.videoId, normalizeYouTubeTrack(track));
  return [...unique.values()];
}
export function clearYouTubeSearchCache() { searchCache.clear(); }
const searchCache = new Map<string, { at: number; results: SearchResults }>();
export async function searchYouTubeMusic(query: string, filter: ResultFilter, signal?: AbortSignal): Promise<SearchResults> {
  if (signal?.aborted) throw new Error("YouTube request cancelled");
  if (!query.trim()) return { songs: [], playlists: [], albums: [], artists: [] };
  const key = `${filter}:${query.trim().toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 180000) return cached.results;
  const data = await invoke((module, id) => module.search(query.trim(), filter, id), signal);
  const playlists: PlaylistResult[] = data.playlists.map((item) => ({
    id: `youtube_playlist_${item.id}`, name: item.name, songCount: item.songCount,
    image: item.coverUrl ? [{ quality: "1200x1200", url: youTubeArtworkUrl(item.coverUrl) }] : [], url: item.url, description: item.description,
  }));
  const results: SearchResults = { songs: normalizeTracks(data.songs), playlists, albums: (data.albums || []).map(item => ({ id: `youtube_album_${item.id}`, name: item.name, songCount: item.songCount, url: item.url, image: item.coverUrl ? [{ quality: "1200x1200", url: youTubeArtworkUrl(item.coverUrl) }] : [], description: item.description })), artists: (data.artists || []).filter(item => validArtistChannelId(item.id)).map(normalizeYouTubeArtist) };
  if (!signal?.aborted) {
    if (searchCache.size >= 40) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(key, { at: Date.now(), results });
  }
  return results;
}
export function normalizeYouTubeArtist(item: NativeArtist): ArtistCard {
  return { id: `youtube_artist_${artistChannelId(item.id)}`, name: item.name,
    image: item.coverUrl ? [{ quality: "1200x1200", url: youTubeArtworkUrl(item.coverUrl) }] : [],
    url: `https://music.youtube.com/channel/${artistChannelId(item.id)}` };
}
export async function loadYouTubeArtist(id: string): Promise<ArtistDetails> {
  if (!validArtistChannelId(id)) throw new Error("Invalid artist channel");
  const data = await invoke((module, requestId) => {
    if (!module.artist) throw new Error("Artist browsing is unavailable");
    return module.artist(artistChannelId(id), requestId);
  });
  return { ...normalizeYouTubeArtist(data), url: `https://music.youtube.com/channel/${artistChannelId(id)}`,
    bio: data.description ? [{ title: "About", text: data.description }] : [],
    topSongs: normalizeTracks(data.songs), hasMoreSongs: data.hasMoreSongs,
    topAlbums: data.albums.map(item => ({ id: `youtube_album_${item.id}`, name: item.name, url: item.url,
      image: item.coverUrl ? [{ quality: "1200x1200", url: youTubeArtworkUrl(item.coverUrl) }] : [] })),
    similarArtists: data.artists.filter(item => validArtistChannelId(item.id)).map(normalizeYouTubeArtist) };
}
export async function loadYouTubeArtistSongs(id: string, cursor = "") {
  if (!validArtistChannelId(id)) throw new Error("Invalid artist channel");
  const page = await invoke((module, requestId) => {
    if (!module.artistSongs) throw new Error("Artist songs are unavailable");
    return module.artistSongs(artistChannelId(id), cursor, requestId);
  });
  return { songs: normalizeTracks(page.songs), cursor: page.cursor };
}
export type YouTubeHomePlaylist = NativePlaylist & { source: "youtube" };
export interface YouTubeHomeSection { id: string; title: string; songs: Song[]; playlists: YouTubeHomePlaylist[]; category?: NativeHomeSection["category"] }
type YouTubeHome = { songs: Song[]; playlists: YouTubeHomePlaylist[]; sections: YouTubeHomeSection[] };
function normalizeHomePlaylists(items: NativePlaylist[]): YouTubeHomePlaylist[] {
  return [...new Map(items.map(item => [item.id, {
    ...item, coverUrl: youTubeArtworkUrl(item.coverUrl), id: `youtube_${item.kind === "album" ? "album" : "playlist"}_${item.id.replace(/^youtube_(?:playlist|album)_/, "")}`, source: "youtube" as const,
  }])).values()];
}
let exploreCache: { at: number; data: YouTubeHome } | undefined;
let homeCache: { at: number; data: YouTubeHome } | undefined;
let homeCacheGeneration = 0;
const previewCache = new Map<string, { at: number; songs: Song[] }>();
export function clearYouTubeHomeCache() { homeCacheGeneration++; homeCache = undefined; exploreCache = undefined; previewCache.clear(); }
export async function loadYouTubeHome(signal?: AbortSignal, onFirstPage?: (feed: YouTubeHome) => void): Promise<YouTubeHome> {
  if (signal?.aborted) throw new Error("YouTube request cancelled");
  if (homeCache && Date.now() - homeCache.at < 1200000) { onFirstPage?.(homeCache.data); return homeCache.data; }
  const generation = homeCacheGeneration;
  const data = await invoke((module, id) => module.home(id, onFirstPage ? page => { if (!signal?.aborted) onFirstPage(normalizeHome(page)); } : undefined), signal);
  const result = normalizeHome(data);
  if (generation === homeCacheGeneration && !signal?.aborted && (result.songs.length || result.playlists.length)) homeCache = { at: Date.now(), data: result };
  return result;
}
function normalizeHome(data: { songs: NativeTrack[]; playlists: NativePlaylist[]; sections?: NativeHomeSection[] }): YouTubeHome {
  return {
    songs: normalizeTracks(data.songs), playlists: normalizeHomePlaylists(data.playlists).slice(0, 60),
    sections: (data.sections || []).map(section => ({ ...section,
      songs: normalizeTracks(section.songs).slice(0, 20), playlists: normalizeHomePlaylists(section.playlists).slice(0, 24),
    })).filter(section => section.songs.length || section.playlists.length).slice(0, 12),
  };
}
export async function loadYouTubeExplore(signal?: AbortSignal): Promise<YouTubeHome> {
  if (signal?.aborted) throw new Error("YouTube request cancelled");
  if (exploreCache && Date.now() - exploreCache.at < 1200000) return exploreCache.data;
  const generation = homeCacheGeneration;
  const data = normalizeHome(await invoke((module, id) => module.explore(id), signal));
  if (generation === homeCacheGeneration && !signal?.aborted && data.sections.length) exploreCache = { at: Date.now(), data };
  return data;
}
export interface YouTubePlaylistResult { name: string; coverUrl: string; songCount: number; songs: Song[] }
export async function loadYouTubePlaylist(id: string, signal?: AbortSignal, onFirstPage?: (page: YouTubePlaylistResult) => void) {
  const playlistId = id.replace(/^youtube_(?:playlist|album)_/, "");
  let cursor = "";
  let name = "Mavrixfy Music playlist", coverUrl = "", songCount = 0;
  const all: NativeTrack[] = [];
  const seen = new Set<string>();
  try {
    for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
      const page = await invoke((module, requestId) => module.playlist(playlistId, cursor, requestId), signal);
      name = page.name || name; coverUrl = youTubeArtworkUrl(page.coverUrl) || coverUrl; songCount = page.songCount || songCount;
      all.push(...page.songs);
      cursor = page.cursor;
      if (pageIndex === 0 && cursor && onFirstPage && !signal?.aborted) {
        const songs = normalizeTracks(all);
        if (songs.length) onFirstPage({ name, coverUrl, songCount: songCount || songs.length, songs });
      }
      if (!cursor) { const songs = normalizeTracks(all); return { name, coverUrl, songCount: songCount || songs.length, songs }; }
      if (seen.has(cursor)) throw new Error("YouTube playlist returned a repeated page.");
      seen.add(cursor);
    }
    throw new Error("YouTube playlist is too large to load completely.");
  } finally { if (cursor) transport?.discardPlaylistCursor?.(cursor); }
}
export async function previewYouTubePlaylist(id: string, signal?: AbortSignal): Promise<Song[]> {
  if (signal?.aborted) throw new Error("YouTube request cancelled");
  const cached = previewCache.get(id);
  if (cached && Date.now() - cached.at < 1200000) return cached.songs;
  const generation = homeCacheGeneration;
  const page = await invoke(async (module, requestId) => {
    const result = await module.playlist(id.replace(/^youtube_(?:playlist|album)_/, ""), "", requestId);
    if (result.cursor) module.discardPlaylistCursor?.(result.cursor);
    return result;
  }, signal);
  const songs = normalizeTracks(page.songs).slice(0, 6);
  if (songs.length && !signal?.aborted && generation === homeCacheGeneration) {
    if (previewCache.size >= 16) previewCache.delete(previewCache.keys().next().value!);
    previewCache.set(id, { at: Date.now(), songs });
  }
  return songs;
}
export async function relatedYouTubeSongs(song: Song, signal?: AbortSignal): Promise<Song[]> {
  const id = song.youtubeVideoId || song.videoId || song.id.replace(/^youtube_/, "");
  return normalizeTracks(await invoke((module, requestId) => module.related(id, requestId), signal)).filter((item) => item.id !== song.id);
}
const streams = new Map<string, YouTubeStream>();
const pending = new Map<string, Promise<YouTubeStream>>();
const latest = new Map<string, Promise<YouTubeStream>>();
// A signed URL can be bound to the old connection. This does not stop audio
// already handed to the player or clear catalog/library caches.
export function clearYouTubeConnectionStreams(): void {
  streams.clear();
  pending.clear();
  latest.clear();
}
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
export function invalidateYouTubeStream(song: Pick<Song, "id">, rejectProfile = false): void {
  const previous = streams.get(song.id);
  if (rejectProfile && previous) transport?.rejectStream(previous.resolutionId);
  streams.delete(song.id);
  latest.delete(song.id);
  for (const key of pending.keys()) if (key.startsWith(`${song.id}:`)) pending.delete(key);
}
export function rejectYouTubeStream(song: Song): void { invalidateYouTubeStream(song, true); }
export function youTubeSongWithStream(song: Song, stream = peekYouTubeStream(song)): Song {
  return stream ? { ...song, ...playbackStreamMetadata(stream), audioUrl: stream.url, youtubeAudioExpiresAt: stream.expiresAt,
    duration: playbackDuration(song.duration, stream.durationSeconds) } : song;
}
export function youTubePlaybackErrorDetails(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    .replace(/https?:\/\/[^\s"']+/g, "[URL]")
    .replace(/(authorization|cookie|token|signature)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 2000);
}
export function youTubePlaybackErrorMessage(error: unknown): string {
  const message = youTubePlaybackErrorDetails(error);
  if (/allow audio in this browser/i.test(message)) return "Tap Play to allow audio in this browser.";
  if (/LOGIN_REQUIRED|SIGN_IN_REQUIRED|confirm.*not a bot/i.test(message))
    return "YouTube is asking this connection to verify, so this track can't play here right now. Try again later.";
  if (/sign in/i.test(message))
    return "This track needs sign-in outside Mavrixfy. Try another version.";
  if (/timed out|timeout|aborterror/i.test(message)) return "Mavrixfy Music playback timed out. Tap Play to retry.";
  if (/network request failed|failed to fetch|audio (?:GET )?HTTP/i.test(message))
    return "Could not connect to this song's audio stream. Tap Play to retry.";
  if (/private|removed|not available|video unavailable|restricted/i.test(message))
    return "This Mavrixfy Music track is unavailable right now. Tap Play to retry.";
  return "Could not play this Mavrixfy Music track. Tap Play to retry.";
}

/** Resolve a separate visual-only video stream; it never enters the audio cache. */
export function resolveYouTubeVideoStream(videoId: string, quality: string, signal?: AbortSignal): Promise<YouTubeVideoStream> {
  return invoke((module, id) => module.resolveVideoStream(videoId, quality, id), signal);
}

export function resolveOfficialYouTubeMusicVideo(song: Pick<Song, "title" | "artist" | "duration" | "artistRefs">,
  signal?: AbortSignal): Promise<string | null> {
  const query: OfficialMusicVideoQuery = {
    title: song.title,
    artist: song.artist,
    durationSeconds: song.duration,
    artistChannelIds: song.artistRefs?.map(artist => artist.id) || [],
  };
  return invoke((module, id) => module.resolveOfficialMusicVideo(query, id), signal);
}

