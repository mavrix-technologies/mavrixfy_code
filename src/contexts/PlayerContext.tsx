import React, { createContext, use, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Alert, AppState, Platform, ToastAndroid, View } from "react-native";
import { isRunningInExpoGo } from "expo";
import * as Network from "expo-network";
import { Song, convertJioSaavnSong } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { getCatalogSongs } from "@/lib/catalogService";
import { searchSong } from "@/lib/song-matcher";
import { getYouTubeAudioStreamForPlayback, getYouTubeMusicVisualVideoId } from "@/data/providers/YouTubeMusicProvider";
import { useAuth } from "@/contexts/AuthContext";
import * as ExpoAvPlayer from "@/lib/expoAvPlayer";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";
import {
  beginPlaybackTransaction,
  completePlaybackTransaction,
  failPlaybackTransaction,
  updatePlaybackEngineSnapshot,
} from "@/lib/playbackEngine";
import type { PlaybackCommandType } from "@/lib/playbackEngine";
import { mapFilter } from "@/lib/arrayUtils";

let TrackPlayer: any = null;
let Event: any = null;
let RepeatMode: any = {
  Off: "off",
  Queue: "queue",
  Track: "track",
};
let State: any = {
  Playing: "playing",
  Buffering: "buffering",
  Loading: "loading",
};
let usePlaybackState: any = () => ({ state: undefined });
let useProgress: any = () => ({ position: 0, duration: 0 });
let setupPlayer: any = null;

type NativeSubscription = {
  remove: () => void;
};

const cleanupNativeSubscription = (subscription: NativeSubscription | null | undefined) => {
  subscription?.remove();
};

const subscribeTrackPlayerEvent = (eventName: unknown, listener: (...args: any[]) => void) => {
  const subscription = TrackPlayer.addEventListener(eventName, listener) as NativeSubscription;
  return () => cleanupNativeSubscription(subscription);
};

const isExpoGoRuntime = isRunningInExpoGo();
const isNativeTrackPlayerAvailable = Platform.OS !== "web" && !isExpoGoRuntime;

if (isNativeTrackPlayerAvailable) {
  try {
    const trackPlayerModule = require("react-native-track-player");
    TrackPlayer = trackPlayerModule.default ?? trackPlayerModule;
    Event = trackPlayerModule.Event;
    RepeatMode = trackPlayerModule.RepeatMode;
    State = trackPlayerModule.State;
    usePlaybackState = trackPlayerModule.usePlaybackState;
    useProgress = trackPlayerModule.useProgress;
    setupPlayer = require("@/lib/trackPlayer").setupPlayer;
  } catch (error) {
    console.error("[PlayerContext] Failed to load native TrackPlayer module:", error);
    logger.error("[Player] Failed to load native TrackPlayer module", error);
  }
}

export type SleepTimerSelection = 5 | 10 | 15 | 30 | 45 | 60 | "end-of-stack";

export interface SleepTimerState {
  mode: "duration" | "end-of-stack";
  label: string;
  endsAt: number | null;
}

interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  userQueuedSongIds: string[];
  sourceQueue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  positionMillis: number;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  likedSongIds: string[];
  likedSongs: Song[];
  isLoading: boolean;
  albumColor: string;
  textColor: string;
  sleepTimer: SleepTimerState | null;
}

interface PlayerContextValue extends PlayerState {
  playSong: (song: Song, queue?: Song[]) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  seekTo: (progress: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (song: Song) => void;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setSleepTimer: (selection: SleepTimerSelection) => void;
  clearSleepTimer: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

type PlayerLiteContextValue = Omit<PlayerContextValue, "progress" | "duration" | "positionMillis">;
const PlayerLiteContext = createContext<PlayerLiteContextValue | null>(null);

interface PlayerProgressContextValue {
  progress: number;
  duration: number;
  positionMillis: number;
}

const PlayerProgressContext = createContext<PlayerProgressContextValue | null>(null);

interface PlayerRowContextValue {
  currentSongId: string | null;
  isPlaying: boolean;
  playSong: (song: Song, queue?: Song[]) => void;
  toggleLike: (song: Song) => void;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
}

const PlayerRowContext = createContext<PlayerRowContextValue | null>(null);

interface PlayerBrowseContextValue {
  currentSong: Song | null;
  queue: Song[];
  isPlaying: boolean;
  likedSongs: Song[];
  playSong: (song: Song, queue?: Song[]) => void;
  togglePlay: () => void;
  toggleLike: (song: Song) => void;
}

const PlayerBrowseContext = createContext<PlayerBrowseContextValue | null>(null);

interface PlayerQueueContextValue {
  currentSong: Song | null;
  queue: Song[];
  userQueuedSongIds: string[];
  queueIndex: number;
  isShuffled: boolean;
  sleepTimer: SleepTimerState | null;
  playSong: (song: Song, queue?: Song[]) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
}

const PlayerQueueContext = createContext<PlayerQueueContextValue | null>(null);

interface PlayerActionsContextValue {
  likedSongIds: string[];
  likedSongs: Song[];
  albumColor: string;
  textColor: string;
  sleepTimer: SleepTimerState | null;
  playSong: (song: Song, queue?: Song[]) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  seekTo: (progress: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (song: Song) => void;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setSleepTimer: (selection: SleepTimerSelection) => void;
  clearSleepTimer: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
}

const PlayerActionsContext = createContext<PlayerActionsContextValue | null>(null);

function toDurationSeconds(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const normalized = Math.max(0, raw);
    return normalized > 10000 ? normalized / 1000 : normalized;
  }

  if (typeof raw !== "string") return 0;
  const value = raw.trim();
  if (!value) return 0;

  if (value.includes(":")) {
    const parts = mapFilter(value
      .split(":"), (part) => Number(part.trim()), (part) => Number.isFinite(part) && part >= 0);

    if (parts.length >= 2) {
      let total = 0;
      for (const part of parts) {
        total = total * 60 + part;
      }
      return Math.max(0, total);
    }
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Math.max(0, parsed);
  return normalized > 10000 ? normalized / 1000 : normalized;
}

type SongPlaybackSource = Partial<Song> & {
  url?: string;
  uri?: string;
  streamUrl?: string;
  downloadUrl?: unknown;
};

function readNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function isKnownNonAudioPageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes("saavncdn.com")) return false;
    if (host.includes("jiosaavn.com")) return true;
    if (host.includes("youtube.com") || host.includes("youtu.be")) return true;
    if (host.includes("spotify.com") || host.includes("music.apple.com")) return true;
    if (/\.(?:mp3|m4a|mp4|aac|opus|ogg|wav|flac)(?:$|[?#])/i.test(path)) return false;
  } catch {
    return false;
  }

  return false;
}

function readAudioCandidate(value: unknown): string {
  const url = readNonEmptyString(value);
  if (!url || isKnownNonAudioPageUrl(url)) return "";
  return url;
}

function isTrustedNativeAudioUrl(value: unknown): boolean {
  const url = readAudioCandidate(value);
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes("saavncdn.com")) return true;
    if (host.includes("googlevideo.com")) {
      const mime = parsed.searchParams.get("mime")?.toLowerCase() || "";
      return path.includes("/videoplayback") || mime.startsWith("audio/");
    }
    return /\.(?:mp3|m4a|mp4|aac|opus|ogg|wav|flac)(?:$|[?#])/i.test(path);
  } catch {
    return url.startsWith("file://");
  }
}

function readDownloadAudioUrl(value: unknown): string {
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

function resolveAudioUrl(source: SongPlaybackSource | null | undefined): string {
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

function normalizePlayableSong(song: Song | null | undefined): Song | null {
  if (!song?.id) return null;
  const resolvedAudioUrl = resolveAudioUrl(song as SongPlaybackSource);
  if (!resolvedAudioUrl) return { ...song, audioUrl: "" };
  if (song.audioUrl === resolvedAudioUrl) return song;
  return { ...song, audioUrl: resolvedAudioUrl };
}

function isYouTubeSource(song: Song | null | undefined): boolean {
  return Boolean(
    song &&
      (song.source === "youtube" ||
        song.id?.startsWith("youtube_") ||
        song.id?.startsWith("yt:") ||
        (song as any).youtubeVideoId)
  );
}

const YOUTUBE_AUDIO_EXPIRY_MARGIN_MS = 60 * 1000;

function hasFreshYouTubeNativeAudio(song: Song | null | undefined): boolean {
  if (!(song as any)?.youtubeNativeAudio || !isTrustedNativeAudioUrl(song?.audioUrl)) return false;
  const expiresAt = Number((song as any).youtubeAudioExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt - YOUTUBE_AUDIO_EXPIRY_MARGIN_MS > Date.now();
}

function extractYouTubeVideoId(song: Song | null | undefined): string {
  if (!song) return "";
  
  // Priority 1: Direct video ID fields
  if ((song as any).youtubeVideoId) return (song as any).youtubeVideoId;
  if ((song as any).videoId) return (song as any).videoId;
  
  // Priority 2: Extract from ID field
  const id = song.id || "";
  if (id.startsWith("youtube_")) {
    const extracted = id.replace("youtube_", "");
    if (/^[a-zA-Z0-9_-]{11}$/.test(extracted)) return extracted;
  }
  if (id.startsWith("yt:")) {
    const extracted = id.replace("yt:", "");
    if (/^[a-zA-Z0-9_-]{11}$/.test(extracted)) return extracted;
  }
  
  // Priority 3: Check if ID itself is a video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
  
  return "";
}

function isYouTubeSong(song: Song | null | undefined): boolean {
  return Boolean(song && isYouTubeSource(song) && !hasFreshYouTubeNativeAudio(song));
}

const SINGLE_SONG_AUTOPLAY_MIN_SIZE = 6;
const SINGLE_SONG_AUTOPLAY_TARGET_SIZE = 18;
const SINGLE_SONG_AUTOPLAY_LOOKUP_TIMEOUT_MS = 900;
const YOUTUBE_NATIVE_MATCH_TIMEOUT_MS = 2200;
const YOUTUBE_NATIVE_STREAM_TIMEOUT_MS = 8500;
const RESOLVED_NATIVE_AUDIO_TTL_MS = 5.5 * 60 * 60 * 1000;

function textKey(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleArtistKey(song: Song): string {
  return `${textKey(song.title)}:${textKey(song.artist)}`;
}

function songMatchKey(song: Song): string {
  return `${String(song.source || "song")}:${String(song.id || "")}`;
}

function wordSet(value: unknown): Set<string> {
  return new Set(
    textKey(value)
      .split(" ")
      .filter((word) => word.length > 2)
  );
}

function sharedWordCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  a.forEach((word) => {
    if (b.has(word)) count += 1;
  });
  return count;
}

function scoreAutoplayCandidate(seed: Song, candidate: Song, index: number): number {
  const seedArtist = textKey(seed.artist);
  const candidateArtist = textKey(candidate.artist);
  const seedTitleWords = wordSet(seed.title);
  const candidateTitleWords = wordSet(candidate.title);
  const seedArtistWords = wordSet(seed.artist);
  const candidateArtistWords = wordSet(candidate.artist);
  let score = 0;

  if (seedArtist && candidateArtist && seedArtist === candidateArtist) score += 70;
  score += sharedWordCount(seedArtistWords, candidateArtistWords) * 22;
  score += sharedWordCount(seedTitleWords, candidateTitleWords) * 6;
  if (textKey(seed.album) && textKey(seed.album) === textKey(candidate.album)) score += 18;
  if (textKey(seed.genre) && textKey(seed.genre) === textKey(candidate.genre)) score += 12;
  if (textKey(seed.language) && textKey(seed.language) === textKey(candidate.language)) score += 10;
  if (seed.source && candidate.source && seed.source === candidate.source) score += 6;
  score += Math.min(Math.log10(Math.max(Number(candidate.playCount || 0), 1)) * 6, 24);
  score += Math.random() * 4;
  score -= index * 0.04;

  return score;
}

function makeAutoplayQueue(seed: Song, candidates: Song[]): Song[] {
  const playableSeed = normalizePlayableSong(seed);
  if (!playableSeed) return [];

  const seenIds = new Set([songMatchKey(playableSeed)]);
  const seenTitles = new Set([titleArtistKey(playableSeed)]);
  const ranked = candidates
    .map((candidate, index) => ({ candidate, score: scoreAutoplayCandidate(playableSeed, candidate, index) }))
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate);

  const nextQueue: Song[] = [playableSeed];
  for (const candidate of ranked) {
    const playableCandidate = normalizePlayableSong(candidate);
    if (!playableCandidate || playableCandidate.id === playableSeed.id) continue;

    const idKey = songMatchKey(playableCandidate);
    const titleKey = titleArtistKey(playableCandidate);
    if (seenIds.has(idKey) || seenTitles.has(titleKey)) continue;

    seenIds.add(idKey);
    seenTitles.add(titleKey);
    nextQueue.push(playableCandidate);

    if (nextQueue.length >= SINGLE_SONG_AUTOPLAY_TARGET_SIZE) break;
  }

  return nextQueue;
}

function isSingleSongQueue(queue: Song[], song: Song): boolean {
  if (queue.length <= 1) return true;
  const uniqueIds = new Set(queue.flatMap((item) => item.id ? [item.id] : []));
  return uniqueIds.size <= 1 && uniqueIds.has(song.id);
}

function resolveWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

async function getRecentSongCandidates(): Promise<Song[]> {
  const items = await Storage.getRecentlyPlayed().catch(() => []);
  return mapFilter(
    items,
    (item) => (item.type === "song" && item.data ? item.data as Song : null),
    (song): song is Song => Boolean(song?.id && song?.title)
  );
}

async function getSingleSongAutoplayCandidates(): Promise<Song[]> {
  const [recentSongs, catalogSongs] = await Promise.all([
    getRecentSongCandidates(),
    resolveWithin(getCatalogSongs(), SINGLE_SONG_AUTOPLAY_LOOKUP_TIMEOUT_MS, [] as Song[]),
  ]);
  return [...recentSongs, ...catalogSongs];
}

async function resolveJioSaavnFallbackForYouTubeSong(song: Song, signal: AbortSignal): Promise<Song | null> {
  const title = readNonEmptyString(song.title);
  const artist = readNonEmptyString(song.artist);
  if (!title || signal.aborted) return null;

  const match = await resolveWithin(
    searchSong(title, artist, readNonEmptyString(song.album) || undefined),
    2500, // YOUTUBE_JIOSAAVN_FALLBACK_TIMEOUT_MS
    null
  );
  if (!match?.song || signal.aborted) return null;

  const fallbackSong = convertJioSaavnSong(match.song);
  const audioUrl = resolveAudioUrl(fallbackSong as SongPlaybackSource);
  if (!audioUrl) return null;

  logger.debug("[NativeResolve] Using JioSaavn fallback for YouTube song", {
    originalSongId: song.id,
    originalTitle: song.title,
    fallbackSongId: fallbackSong.id,
    fallbackTitle: fallbackSong.title,
    matchScore: match.matchScore,
  });

  return {
    ...fallbackSong,
    audioUrl,
    source: "jiosaavn",
    youtubeVideoId: undefined,
    youtubeVisualVideoId: undefined,
    youtubeNativeAudio: false,
    youtubeAudioExpiresAt: undefined,
    playbackHeaders: undefined,
  };
}

async function resolveJioSaavnAudioForSong(song: Song): Promise<Song | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_NATIVE_MATCH_TIMEOUT_MS);
  try {
    return await resolveJioSaavnFallbackForYouTubeSong(song, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveYouTubeTrackForNativePlayback(song: Song): Promise<Song | null> {
  const videoId = extractYouTubeVideoId(song);
  if (!videoId) return null;

  const resolvedSong = await resolveJioSaavnAudioForSong(song);
  if (resolvedSong) {
    return {
      ...resolvedSong,
      youtubeNativeAudio: true,
      youtubeAudioExpiresAt: Date.now() + RESOLVED_NATIVE_AUDIO_TTL_MS,
      youtubeVideoId: videoId,
      source: "youtube",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_NATIVE_STREAM_TIMEOUT_MS);
  try {
    const stream = await resolveWithin(
      getYouTubeAudioStreamForPlayback(videoId, song.title, song.artist, controller.signal),
      YOUTUBE_NATIVE_STREAM_TIMEOUT_MS,
      null
    );
    if (!stream?.url || !isTrustedNativeAudioUrl(stream.url)) {
      return null;
    }
    return {
      ...song,
      audioUrl: stream.url,
      downloadUrl: undefined,
      playbackHeaders: stream.headers && Object.keys(stream.headers).length > 0 ? stream.headers : undefined,
      duration: song.duration || stream.duration || 0,
      youtubeNativeAudio: true,
      youtubeAudioExpiresAt: stream.expiresAt || Date.now() + RESOLVED_NATIVE_AUDIO_TTL_MS,
      youtubeVideoId: videoId,
      source: "youtube",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function withResolvedPlaybackUrl(song: Song, audioUrl: string): Song {
  const resolvedUrl = readNonEmptyString(audioUrl);
  if (!resolvedUrl || song.audioUrl === resolvedUrl) return song;
  return { ...song, audioUrl: resolvedUrl };
}

function mergeResolvedNativeEntriesIntoQueue(queue: Song[], entries: NativeTrackEntry[]): Song[] {
  if (queue.length === 0 || entries.length === 0) return queue;

  let nextQueue: Song[] | null = null;
  for (const entry of entries) {
    const index = entry.appIndex;
    const existing = queue[index];
    if (!existing || String(existing.id) !== String(entry.song.id)) continue;

    const resolvedUrl = resolveAudioUrl(entry.song as SongPlaybackSource);
    if (!resolvedUrl) continue;
    const existingUrl = resolveAudioUrl(existing as SongPlaybackSource);
    const nativeMetadataChanged =
      entry.song.youtubeNativeAudio !== existing.youtubeNativeAudio ||
      entry.song.youtubeAudioExpiresAt !== existing.youtubeAudioExpiresAt ||
      entry.song.playbackHeaders !== existing.playbackHeaders;
    if (existingUrl === resolvedUrl && !nativeMetadataChanged) continue;

    if (!nextQueue) nextQueue = queue.slice();
    nextQueue[index] = { ...existing, ...entry.song, audioUrl: resolvedUrl };
  }

  return nextQueue ?? queue;
}

function stripTransientYouTubeAudioUrl(song: Song): Song {
  if (!isYouTubeSource(song) || !song.audioUrl) return song;
  return {
    ...song,
    audioUrl: "",
    playbackHeaders: undefined,
    youtubeNativeAudio: false,
    youtubeAudioExpiresAt: undefined,
  };
}

function getYouTubeVideoIdFromSong(song: Song | null | undefined): string {
  if (!song) return "";
  const source = song as Song & {
    videoId?: unknown;
    video_id?: unknown;
    youtubeId?: unknown;
    youtube_id?: unknown;
    youtubeVideoId?: unknown;
    youtubeVisualVideoId?: unknown;
    url?: unknown;
    watchUrl?: unknown;
    videoUrl?: unknown;
  };
  const candidates = [
    source.youtubeVisualVideoId,
    source.youtubeVideoId,
    source.videoId,
    source.video_id,
    source.youtubeId,
    source.youtube_id,
    readNonEmptyString(source.id).replace(/^youtube_/, ""),
  ];

  for (const candidate of candidates) {
    const value = readNonEmptyString(candidate);
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  }

  const watchUrl = readNonEmptyString(source.url || source.watchUrl || source.videoUrl);
  const match = watchUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return match?.[1] || match?.[2] || "";
}

function songToTrack(song: Song, localUrl?: string | null): any {
  const audioUrl = localUrl || resolveAudioUrl(song as SongPlaybackSource);
  const durationSeconds = toDurationSeconds(song.duration);
  return {
    id: song.id,
    url: audioUrl,
    title: readNonEmptyString(song.title) || "Unknown",
    artist: readNonEmptyString(song.artist) || "Mavrixfy",
    album: readNonEmptyString(song.album),
    genre: readNonEmptyString(song.genre),
    artwork: song.coverUrl,
    duration: durationSeconds,
    ...(song.playbackHeaders && Object.keys(song.playbackHeaders).length > 0
      ? { headers: song.playbackHeaders }
      : {}),
  };
}

type NativeTrackEntry = {
  song: Song;
  track: any;
  appIndex: number;
};

async function resolveNativeTrackEntry(song: Song, appIndex: number): Promise<NativeTrackEntry | null> {
  let nativeSong = isYouTubeSource(song) && !hasFreshYouTubeNativeAudio(song)
    ? await resolveYouTubeTrackForNativePlayback(song)
    : song;
  if (!nativeSong) return null;

  let audioUrl = await resolvePlaybackUrl(nativeSong);

  if (!audioUrl && !isYouTubeSource(song) && song.source !== "local" && song.id) {
    try {
      const { getJioSaavnSongDetails } = await import("@/data/providers/JioSaavnProvider");
      const { convertJioSaavnSong } = await import("@/lib/musicData");
      const fresh = await getJioSaavnSongDetails(song.id);
      if (fresh) {
        const refreshed: Song = { ...nativeSong, ...convertJioSaavnSong(fresh) };
        audioUrl = await resolvePlaybackUrl(refreshed);
        if (audioUrl) nativeSong = refreshed;
      }
    } catch {
      // fall through to search fallback
    }
  }

  if (!audioUrl && !isYouTubeSource(song) && song.source !== "local") {
    const matchedSong = await resolveJioSaavnAudioForSong(song);
    if (matchedSong) {
      nativeSong = matchedSong;
      audioUrl = await resolvePlaybackUrl(nativeSong);
    }
  }
  if (!audioUrl) return null;
  const resolvedSong = withResolvedPlaybackUrl(nativeSong, audioUrl);

  return {
    song: resolvedSong,
    track: songToTrack(resolvedSong, audioUrl),
    appIndex,
  };
}

async function resolveNativeTrackEntries(songs: Song[], startIndex = 0): Promise<NativeTrackEntry[]> {
  const settled = await Promise.allSettled(
    songs.map((song, index) => resolveNativeTrackEntry(song, startIndex + index))
  );

  return mapFilter(
    settled,
    (result) => (result.status === "fulfilled" ? result.value : null),
    (entry): entry is NativeTrackEntry => Boolean(entry?.song?.id && readNonEmptyString(entry?.track?.url))
  );
}

type NowPlayingMetadataSource = {
  title?: unknown;
  artist?: unknown;
  album?: unknown;
  genre?: unknown;
  duration?: unknown;
  artwork?: unknown;
  coverUrl?: unknown;
};

function getNowPlayingMetadata(track: NowPlayingMetadataSource) {
  const title = readNonEmptyString(track.title) || "Mavrixfy";
  const artist = readNonEmptyString(track.artist) || "Mavrixfy";
  const duration = toDurationSeconds(track.duration);
  const artwork = readNonEmptyString(track.artwork) || readNonEmptyString(track.coverUrl);

  return {
    title,
    artist,
    album: readNonEmptyString(track.album),
    genre: readNonEmptyString(track.genre) || "Mavrixfy",
    duration: duration > 0 ? duration : undefined,
    artwork: artwork || undefined,
  };
}

async function publishNativeNowPlaying(track: NowPlayingMetadataSource, trackIndex?: number): Promise<void> {
  if (!TrackPlayer) return;

  const metadata = getNowPlayingMetadata(track);

  try {
    if (
      typeof trackIndex === "number" &&
      trackIndex >= 0 &&
      typeof TrackPlayer.updateMetadataForTrack === "function"
    ) {
      await TrackPlayer.updateMetadataForTrack(trackIndex, metadata);
    }
  } catch {
    // not fatal — queue may change while skipping
  }

  try {
    if (typeof TrackPlayer.updateNowPlayingMetadata === "function") {
      await TrackPlayer.updateNowPlayingMetadata(metadata);
    }
  } catch {
    // autoUpdateMetadata provides the fallback
  }
}

function rebuildNativeQueue(tracks: any[], activeIndex: number, shouldPlay: boolean): Promise<void> {
  return TrackPlayer.reset()
    .then(() => TrackPlayer.add(tracks))
    .then(() => TrackPlayer.skip(activeIndex))
    .then(() => publishNativeNowPlaying(tracks[activeIndex] ?? tracks[0], activeIndex))
    .then(() => (shouldPlay ? TrackPlayer.play() : undefined))
    .then(() => undefined);
}

function trackToSong(track: any): Song | null {
  const id = readNonEmptyString(track?.id);
  const audioUrl = readNonEmptyString(track?.url);
  const title = readNonEmptyString(track?.title);
  if (!id || !audioUrl || !title) return null;

  return {
    id,
    title,
    artist: readNonEmptyString(track?.artist) || "Mavrixfy",
    album: readNonEmptyString(track?.album),
    duration: toDurationSeconds(track?.duration),
    coverUrl: readNonEmptyString(track?.artwork),
    genre: readNonEmptyString(track?.genre) || "Mavrixfy",
    audioUrl,
    source: "jiosaavn",
  };
}

async function getAdaptiveStreamingQuality(): Promise<"low" | "medium" | "high"> {
  try {
    const settings = await Storage.getSettings();
    if (settings.streamingQuality === "low" || settings.streamingQuality === "medium") {
      return settings.streamingQuality;
    }
    const netState = await Network.getNetworkStateAsync();
    if (netState.type === Network.NetworkStateType.CELLULAR) {
      logger.debug("[Player] Cellular connection detected, automatically using medium quality to prevent buffering");
      return "medium";
    }
  } catch (e) {
    logger.error("[Player] Failed to determine adaptive streaming quality", e);
  }
  return "high";
}

async function getVideoBackgroundQuality() {
  try {
    const settings = await Storage.getSettings();
    return settings.videoBackgroundQuality;
  } catch (e) {
    logger.error("[Player] Failed to determine video background quality", e);
  }
  return "auto";
}

/** Resolve the best playback URL for a song ΓÇö local file first, then stream. */
async function resolvePlaybackUrl(song: Song): Promise<string | null> {
  try {
    const isYt = isYouTubeSource(song);
    if (isYt) {
      return hasFreshYouTubeNativeAudio(song)
        ? resolveAudioUrl(song as SongPlaybackSource) || null
        : null;
    }

    const { getLocalPlaybackUrl } = await import("@/lib/downloads/downloadManager");
    const local = await getLocalPlaybackUrl(song.id);
    if (local) {
      if (local.startsWith("file://") || local.startsWith("http")) return local;
      return `file://${local}`;
    }
  } catch {
    // downloads module not available ΓÇö fall through to stream
  }

  if (song.downloadUrl) {
    try {
      const { getBestAudioUrlWithQuality, normalizeAudioCandidates } = await import("@/lib/musicData");
      const targetQuality = await getAdaptiveStreamingQuality();
      const resolvedUrl = getBestAudioUrlWithQuality(song.downloadUrl, targetQuality);
      const playableUrl = readAudioCandidate(resolvedUrl);
      if (playableUrl) {
        const candidates = normalizeAudioCandidates(song.downloadUrl);
        const chosenCandidate = candidates.find(c => c.url === playableUrl);
        logger.debug(`[Player] Resolved stream for "${song.title}" (Source: ${song.source || "jiosaavn"})`, {
          requestedQuality: targetQuality,
          availableQualities: candidates.map(c => c.quality || "unknown"),
          selectedQuality: chosenCandidate?.quality || "unknown",
          url: `${playableUrl.substring(0, 60)}...`,
        });
        return playableUrl;
      }
    } catch (e) {
      logger.error("[Player] Failed to resolve quality-specific audio URL:", e);
    }
  }

  const fallbackUrl = resolveAudioUrl(song as SongPlaybackSource) || null;
  logger.debug(`[Player] Resolved fallback stream for "${song.title}"`, {
    songId: song.id,
    url: fallbackUrl ? `${fallbackUrl.substring(0, 60)}...` : null,
  });
  return fallbackUrl;
}

function isPlayableSong(song: Song | null | undefined): song is Song {
  return Boolean(song?.id && (isYouTubeSource(song) || resolveAudioUrl(song as SongPlaybackSource)));
}

function isSameQueueById(a: Song[], b: Song[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

const OPTIMISTIC_NATIVE_TRACK_SYNC_GRACE_MS = 1800;
const NATIVE_START_STALL_GRACE_MS = 12000;
const NATIVE_START_STALL_POSITION_SECONDS = 0.75;
const YOUTUBE_PLAYER_REFERRER_URL = "https://mavrixfy.site/";
const UNKNOWN_YOUTUBE_PLAYER_ERROR = "unknown_player_error";
const PRELOAD_QUEUE_SIZE = 20;
const SKIPPABLE_YOUTUBE_ERRORS = new Set([
  "invalid_parameter",
  "video_not_found",
  "embed_not_allowed",
  2,
  100,
  101,
  150,
]);

// Check if lightweight ExpoAV audio fallback should be used (for Expo Go on iOS)
const canUseLightweightAudioFallback = Boolean(
  Platform.OS === "ios" && isRunningInExpoGo()
);

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- acceptable component structure for this app
// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this app
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const { user: authUser } = useAuth();

  const playbackState = usePlaybackState();
  const progressData = useProgress(1000);
  const { position, duration: trackDuration } = progressData;

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [userQueuedSongIds, setUserQueuedSongIds] = useState<string[]>([]);
  const [sourceQueue, setSourceQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [likedSongIds, setLikedSongIds] = useState<string[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [previewRepeatMode, setPreviewRepeatMode] = useState<"off" | "all" | "one">("off");
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackIntent, setPlaybackIntent] = useState<boolean | null>(null);
  const [albumColor, setAlbumColor] = useState("#282828");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerState | null>(null);
  const [seekOverride, setSeekOverride] = useState<{
    songId: string | null;
    seconds: number;
    startedAt: number;
  } | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [runtimeProgressSnapshot, setRuntimeProgressSnapshot] = useState({
    position: 0,
    duration: 0,
  });
  const [runtimePlaybackStateSnapshot, setRuntimePlaybackStateSnapshot] = useState<any>(undefined);

  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const likedSongsRef = useRef<Song[]>([]);
  const userQueuedSongIdsRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const isShuffledRef = useRef(false);
  const previewRepeatModeRef = useRef<"off" | "all" | "one">("off");
  const previewIsEndedRef = useRef(false);
  const previewIsPlayingRef = useRef(false);
  const originalQueueRef = useRef<Song[]>([]);
  const playRequestIdRef = useRef(0);
  const seekRequestIdRef = useRef(0);
  const lastPlaybackNoticeAtRef = useRef(0);
  const restoredPositionSecondsRef = useRef(0);
  const latestPositionSecondsRef = useRef(0);
  const nativeStartWatchdogRef = useRef<{
    songId: string | null;
    startedAt: number;
    lastPosition: number;
    lastAdvancedAt: number;
  } | null>(null);
  const sleepTimerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<SleepTimerState | null>(null);
  const playbackSwitchChainRef = useRef<Promise<void> | null>(null);
  const nativeQueueAppIndicesRef = useRef<number[]>([]);
  const pendingNativeTrackRef = useRef<{
    id: string;
    index: number;
    startedAt: number;
    transactionId: number;
  } | null>(null);
  const trackProgressSongIdRef = useRef<string | null>(null);

  const resetProgressForTrackChange = useCallback((songId: string | null | undefined) => {
    if (!songId) return;
    trackProgressSongIdRef.current = String(songId);
    setSeekOverride(null);
    setPreviewProgress(0);
    const durationSeconds = toDurationSeconds(currentSongRef.current?.duration);
    setRuntimeProgressSnapshot({ position: 0, duration: durationSeconds });
  }, []);

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { likedSongsRef.current = likedSongs; }, [likedSongs]);
  useEffect(() => { userQueuedSongIdsRef.current = userQueuedSongIds; }, [userQueuedSongIds]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isShuffledRef.current = isShuffled; }, [isShuffled]);
  useEffect(() => { previewRepeatModeRef.current = previewRepeatMode; }, [previewRepeatMode]);
  useEffect(() => { sleepTimerRef.current = sleepTimer; }, [sleepTimer]);

  const replaceUserQueuedSongIds = useCallback((ids: string[]) => {
    userQueuedSongIdsRef.current = ids;
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater
    setUserQueuedSongIds(ids);
  }, []);

  const clearUserQueuedSongIds = useCallback(() => {
    replaceUserQueuedSongIds([]);
  }, [replaceUserQueuedSongIds]);

  const appendUserQueuedSongId = useCallback((songId: string) => {
    replaceUserQueuedSongIds([...userQueuedSongIdsRef.current, songId]);
  }, [replaceUserQueuedSongIds]);

  const prependUserQueuedSongId = useCallback((songId: string) => {
    replaceUserQueuedSongIds([songId, ...userQueuedSongIdsRef.current]);
  }, [replaceUserQueuedSongIds]);

  const removeFirstUserQueuedSongId = useCallback((songId: string) => {
    const currentIds = userQueuedSongIdsRef.current;
    const removeIndex = currentIds.findIndex((id) => id === songId);
    if (removeIndex < 0) return;
    replaceUserQueuedSongIds(currentIds.filter((_, index) => index !== removeIndex));
  }, [replaceUserQueuedSongIds]);

  const consumeLeadingUserQueuedSongId = useCallback((songId: string | null | undefined) => {
    if (!songId) return;
    if (userQueuedSongIdsRef.current[0] !== songId) return;
    replaceUserQueuedSongIds(userQueuedSongIdsRef.current.slice(1));
  }, [replaceUserQueuedSongIds]);

  const markPendingNativeTrack = useCallback((
    index: number,
    song: Song | null | undefined,
    type: PlaybackCommandType = "nativeSync"
  ) => {
    if (!song?.id) {
      pendingNativeTrackRef.current = null;
      return;
    }

    const transaction = beginPlaybackTransaction({
      type,
      targetIndex: index,
      targetSongId: String(song.id),
      desiredPlayState: true,
    });

    pendingNativeTrackRef.current = {
      id: String(song.id),
      index,
      startedAt: Date.now(),
      transactionId: transaction.id,
    };
  }, []);

  const shouldAcceptNativeTrackSync = useCallback((trackId: string | null, index: number) => {
    if (isYouTubeSong(currentSongRef.current)) {
      return false;
    }

    const pending = pendingNativeTrackRef.current;
    if (!pending) {
      return true;
    }

    const queueSongId = index >= 0 ? String(queueRef.current[index]?.id ?? "") : "";
    const candidateId = trackId || queueSongId;
    if (candidateId === pending.id) {
      completePlaybackTransaction(pending.transactionId);
      pendingNativeTrackRef.current = null;
      return true;
    }

    if (Date.now() - pending.startedAt < OPTIMISTIC_NATIVE_TRACK_SYNC_GRACE_MS) {
      return false;
    }

    completePlaybackTransaction(pending.transactionId);
    pendingNativeTrackRef.current = null;
    return true;
  }, []);

  const applyNativeTrackIndex = useCallback((nextIndex: number, trackId: string | null = null) => {
    const cq = queueRef.current;
    if (nextIndex < 0 || nextIndex >= cq.length) {
      return false;
    }

    const nextSong = cq[nextIndex];
    if (!nextSong?.id || !shouldAcceptNativeTrackSync(trackId ?? String(nextSong.id), nextIndex)) {
      return false;
    }

    if (queueIndexRef.current !== nextIndex) {
      queueIndexRef.current = nextIndex;
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater
      setQueueIndex(nextIndex);
    }
    currentSongRef.current = nextSong;
    setCurrentSong((prev) => (prev?.id === nextSong.id ? prev : nextSong));
    consumeLeadingUserQueuedSongId(nextSong.id);
    updatePlaybackEngineSnapshot({
      currentSong: nextSong,
      queue: cq,
      queueIndex: nextIndex,
      isLoading: false,
      isBuffering: false,
    });
    
    // Update iOS lock screen metadata when track changes automatically
    publishNativeNowPlaying(nextSong, nextIndex).catch(() => {
      // Ignore errors ΓÇö autoUpdateMetadata will provide fallback
    });
    
    return true;
  }, [consumeLeadingUserQueuedSongId, shouldAcceptNativeTrackSync]);

  const applyNativeQueueSnapshot = useCallback((tracks: Song[], startIndex: number) => {
    const playableTracks = tracks.filter(isPlayableSong);
    if (playableTracks.length === 0) return false;

    const safeIndex = Math.max(0, Math.min(startIndex, playableTracks.length - 1));
    const nextSong = playableTracks[safeIndex];
    setQueue(playableTracks);
    setSourceQueue(playableTracks);
    queueRef.current = playableTracks;
    originalQueueRef.current = playableTracks;
    clearUserQueuedSongIds();
    setQueueIndex(safeIndex);
    queueIndexRef.current = safeIndex;
    currentSongRef.current = nextSong;
    setCurrentSong(nextSong);
    updatePlaybackEngineSnapshot({
      currentSong: nextSong,
      queue: playableTracks,
      queueIndex: safeIndex,
      isLoading: false,
      isBuffering: false,
    });
    return true;
  }, [clearUserQueuedSongIds]);

  const failPendingNativeTrack = useCallback((message: string) => {
    const pending = pendingNativeTrackRef.current;
    if (!pending) return;
    failPlaybackTransaction(pending.transactionId, message);
    pendingNativeTrackRef.current = null;
  }, []);

  const applyRuntimeSnapshot = useCallback((playbackStateSnapshot: any, progressSnapshot: { position?: number; duration?: number }) => {
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater
    setRuntimePlaybackStateSnapshot(playbackStateSnapshot);
    setRuntimeProgressSnapshot({
      position: Number.isFinite(progressSnapshot?.position) ? Math.max(0, progressSnapshot.position ?? 0) : 0,
      duration: Number.isFinite(progressSnapshot?.duration) ? Math.max(0, progressSnapshot.duration ?? 0) : 0,
    });
  }, []);

  const applyRuntimeProgressAndState = useCallback((position: number, duration: number, playbackStateSnapshot: any) => {
    setRuntimeProgressSnapshot((prev) => {
      const positionDelta = Math.abs(prev.position - position);
      const durationDelta = Math.abs(prev.duration - duration);
      if (positionDelta < 0.04 && durationDelta < 0.04) {
        return prev;
      }
      return { position, duration };
    });
    setRuntimePlaybackStateSnapshot((prev: any) => (prev === playbackStateSnapshot ? prev : playbackStateSnapshot));
  }, []);

  const applySavedPlayerSnapshot = useCallback((saved: NonNullable<Awaited<ReturnType<typeof Storage.loadPlayerState>>>) => {
    currentSongRef.current = saved.currentSong;
    setCurrentSong(saved.currentSong);
    setQueue(saved.queue);
    setSourceQueue(saved.queue);
    queueRef.current = saved.queue;
    originalQueueRef.current = saved.queue;
    setQueueIndex(saved.queueIndex);
    queueIndexRef.current = saved.queueIndex;
    restoredPositionSecondsRef.current = Math.max(0, saved.positionSeconds ?? 0);
    updatePlaybackEngineSnapshot({
      currentSong: saved.currentSong,
      queue: saved.queue,
      sourceQueue: saved.queue,
      queueIndex: saved.queueIndex,
    });
  }, []);

  const applyLikedSongsState = useCallback((songs: Song[]) => {
    // react-doctor-disable-next-line react-doctor/no-impure-state-updater
    setLikedSongs(songs);
    setLikedSongIds(songs.map((song) => song.id));
  }, []);

  const clearLikedSongsState = useCallback(() => {
    setLikedSongIds([]);
    setLikedSongs([]);
  }, []);

  useEffect(() => {
    let mounted = true;

    Storage.loadPlayerState().then(async (saved) => {
      if (!mounted) return;

      if (TrackPlayer && setupPlayer && Platform.OS !== "web") {
        try {
          const [activeTrack, nativeQueue, activeTrackIndex, runtimeProgress, runtimePlaybackState] =
            await Promise.all([
              TrackPlayer.getActiveTrack(),
              TrackPlayer.getQueue(),
              typeof TrackPlayer.getActiveTrackIndex === "function"
                ? TrackPlayer.getActiveTrackIndex()
                : Promise.resolve(undefined),
              TrackPlayer.getProgress(),
              TrackPlayer.getPlaybackState(),
            ]);
          if (mounted) {
            const nativeSongs = Array.isArray(nativeQueue)
              ? mapFilter(nativeQueue, trackToSong, (song): song is Song => Boolean(song))
              : [];
            const activeTrackId = String(activeTrack?.id ?? "").trim();
            const fallbackIndex =
              typeof activeTrackIndex === "number" && Number.isFinite(activeTrackIndex)
                ? activeTrackIndex
                : nativeSongs.findIndex((song) => String(song.id) === activeTrackId);

            if (activeTrackId && nativeSongs.length > 0) {
              applyNativeQueueSnapshot(nativeSongs, fallbackIndex >= 0 ? fallbackIndex : 0);
              const nextPlaybackState =
                runtimePlaybackState && typeof runtimePlaybackState === "object" && "state" in runtimePlaybackState
                  ? runtimePlaybackState.state
                  : runtimePlaybackState;
              applyRuntimeSnapshot(nextPlaybackState, runtimeProgress);
              return;
            }
          }
        } catch {
          // fallback to saved app state
        }
      }

      if (mounted && saved?.currentSong) {
        applySavedPlayerSnapshot(saved as NonNullable<Awaited<ReturnType<typeof Storage.loadPlayerState>>>);
      }

    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, [applyNativeQueueSnapshot, applyRuntimeSnapshot, applySavedPlayerSnapshot]);

  useEffect(() => {
    if (Platform.OS === "web" || !TrackPlayer || !setupPlayer) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    const hydrateFromNativePlayback = async () => {
      attempts += 1;
      try {
        const [activeTrack, nativeQueue, activeTrackIndex, runtimeProgress, runtimePlaybackState] =
          await Promise.all([
            TrackPlayer.getActiveTrack(),
            TrackPlayer.getQueue(),
            typeof TrackPlayer.getActiveTrackIndex === "function"
              ? TrackPlayer.getActiveTrackIndex()
              : Promise.resolve(undefined),
            TrackPlayer.getProgress(),
            TrackPlayer.getPlaybackState(),
          ]);
        if (!cancelled) {
          const activeTrackId = String(activeTrack?.id ?? "").trim();
          const nativeSongs = Array.isArray(nativeQueue)
            ? mapFilter(nativeQueue, trackToSong, (song): song is Song => Boolean(song))
            : [];
          const nativeState =
            runtimePlaybackState && typeof runtimePlaybackState === "object" && "state" in runtimePlaybackState
              ? runtimePlaybackState.state
              : runtimePlaybackState;
          const nativeIsActive =
            nativeState === State.Playing ||
            nativeState === State.Buffering ||
            nativeState === State.Loading;

          if (activeTrackId && nativeSongs.length > 0 && nativeIsActive) {
            const fallbackIndex =
              typeof activeTrackIndex === "number" && Number.isFinite(activeTrackIndex)
                ? activeTrackIndex
                : nativeSongs.findIndex((song) => String(song.id) === activeTrackId);
            applyNativeQueueSnapshot(nativeSongs, fallbackIndex >= 0 ? fallbackIndex : 0);
            applyRuntimeSnapshot(nativeState, runtimeProgress);
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            return;
          }
        }
      } catch {
        // Retry briefly during native service startup.
      }

      if (!cancelled && attempts >= 12 && interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    void hydrateFromNativePlayback();
    interval = setInterval(() => {
      void hydrateFromNativePlayback();
    }, 750);

    return () => {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [applyNativeQueueSnapshot, applyRuntimeSnapshot]);

  const playbackStateValue =
    playbackState && typeof playbackState === "object" && "state" in playbackState
      ? playbackState.state
      : playbackState;
  const isPlaying = playbackStateValue === State.Playing;
  const currentSongDurationSeconds = toDurationSeconds(currentSong?.duration);
  const queueSongDurationSeconds = toDurationSeconds(queue[queueIndex]?.duration);
  const sourceQueueSongDurationSeconds = toDurationSeconds(sourceQueue[queueIndex]?.duration);
  const hookTrackDuration = Number.isFinite(trackDuration) ? Math.max(0, trackDuration) : 0;
  const runtimeTrackDuration = Number.isFinite(runtimeProgressSnapshot.duration)
    ? Math.max(0, runtimeProgressSnapshot.duration)
    : 0;
  const pendingNative = pendingNativeTrackRef.current;
  const awaitingNativeTrack =
    Boolean(pendingNative?.id) &&
    pendingNative?.id === (currentSong?.id ?? null) &&
    Date.now() - (pendingNative?.startedAt ?? 0) < 5000;
  const rawHookPosition = Number.isFinite(position) ? Math.max(0, position) : 0;
  const rawRuntimePosition = Number.isFinite(runtimeProgressSnapshot.position)
    ? Math.max(0, runtimeProgressSnapshot.position)
    : 0;
  const guardedHookPosition = awaitingNativeTrack ? 0 : rawHookPosition;
  const guardedRuntimePosition = awaitingNativeTrack ? 0 : rawRuntimePosition;
  const safePosition =
    Platform.OS === "android"
      ? hookTrackDuration > 0 || guardedHookPosition > 0
        ? guardedHookPosition
        : guardedRuntimePosition
      : guardedHookPosition;
  const safeTrackDuration =
    Platform.OS === "android"
      ? hookTrackDuration > 0
        ? hookTrackDuration
        : runtimeTrackDuration
      : hookTrackDuration;
  const fallbackDurationSeconds =
    currentSongDurationSeconds || queueSongDurationSeconds || sourceQueueSongDurationSeconds;
  const effectiveTrackDurationSeconds =
    safeTrackDuration > 0 ? safeTrackDuration : fallbackDurationSeconds;
  const activeSeekOverrideSeconds = useMemo(() => {
    if (!seekOverride || seekOverride.songId !== (currentSong?.id ?? null)) {
      return null;
    }

    const drift = Math.abs(safePosition - seekOverride.seconds);
    const age = Date.now() - seekOverride.startedAt;
    if (drift <= 0.35 || age > 2200) {
      return null;
    }

    return seekOverride.seconds;
  }, [currentSong?.id, safePosition, seekOverride]);
  const effectivePositionSeconds = activeSeekOverrideSeconds ?? safePosition;
  const progress =
    effectiveTrackDurationSeconds > 0
      ? Math.max(0, Math.min(1, effectivePositionSeconds / effectiveTrackDurationSeconds))
      : 0;
  const positionMillis = effectivePositionSeconds * 1000;
  const duration = effectiveTrackDurationSeconds * 1000;
  const isPreviewSession = (canUseLightweightAudioFallback && !Boolean(TrackPlayer && setupPlayer) && Boolean(currentSong));
  const resolvedProgress = isPreviewSession ? previewProgress : progress;
  const resolvedDuration = isPreviewSession
    ? (previewDuration > 0 ? previewDuration : toDurationSeconds(currentSong?.duration) * 1000)
    : duration;
  const resolvedPositionMillis = isPreviewSession
    ? Math.round((previewDuration > 0 ? previewDuration : toDurationSeconds(currentSong?.duration) * 1000) * previewProgress)
    : positionMillis;
  const resolvedIsShuffled = isShuffled;
  const resolvedRepeatMode = isPreviewSession ? previewRepeatMode : repeatMode;
  // On Android, use the RNTP hook's playback state (isPlaying) as the primary
  // source of truth, with the runtime snapshot as a fallback only when the hook
  // has not yet reported a state. Including Buffering/Loading in "isPlaying"
  // caused the play-button icon to flicker on every buffer event.
  const runtimeIsPlaying = runtimePlaybackStateSnapshot === State.Playing;
  const actualResolvedIsPlaying = isPreviewSession
    ? previewIsPlaying
    : Platform.OS === "android" && runtimePlaybackStateSnapshot !== undefined
      ? runtimeIsPlaying
      : isPlaying;
  const resolvedIsPlaying = playbackIntent ?? actualResolvedIsPlaying;
  const nativeIsBuffering =
    playbackStateValue === State.Buffering ||
    playbackStateValue === State.Loading ||
    runtimePlaybackStateSnapshot === State.Buffering ||
    runtimePlaybackStateSnapshot === State.Loading;
  const resolvedIsBuffering = !isPreviewSession && nativeIsBuffering;

  useEffect(() => {
    updatePlaybackEngineSnapshot({
      currentSong,
      queue,
      sourceQueue,
      userQueuedSongIds,
      queueIndex,
      isPlaying: resolvedIsPlaying,
      desiredPlayState: playbackIntent,
      isBuffering: resolvedIsBuffering,
      isLoading: playbackLoading,
      isShuffled: resolvedIsShuffled,
      repeatMode: resolvedRepeatMode,
    });
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive playback state values are listed
  }, [
    currentSong,
    playbackLoading,
    playbackIntent,
    queue,
    queueIndex,
    resolvedIsBuffering,
    resolvedIsPlaying,
    resolvedIsShuffled,
    resolvedRepeatMode,
    sourceQueue,
    userQueuedSongIds,
  ]);


  // Clear playbackIntent once native state has caught up, or after a maximum
  // window if native state never reports the expected value.
  // Previously two separate effects competed: a 350ms "matched" clear and an
  // 1800ms "safety net" that fired on every intent change, causing premature
  // clearing and play-button flicker during normal playback. A single effect
  // covers both cases: clear immediately when state matches, or after 1800ms.
  useEffect(() => {
    if (playbackIntent === null) return;

    if (playbackIntent === actualResolvedIsPlaying) {
      const timeout = setTimeout(() => {
        setPlaybackIntent(null);
      }, 350);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setPlaybackIntent(null);
    }, 1800);
    return () => clearTimeout(timeout);
  }, [actualResolvedIsPlaying, playbackIntent]);

  useEffect(() => {
    latestPositionSecondsRef.current = Math.max(0, effectivePositionSeconds);
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- latestPositionSecondsRef is a stable ref; effectivePositionSeconds is the only reactive dep
  }, [effectivePositionSeconds]);

  // react-doctor-disable-next-line react-doctor/no-cascading-set-state -- resetting progress state updates multiple properties at once, which is batched.
  useEffect(() => {
    const songId = currentSong?.id ? String(currentSong.id) : null;
    if (!songId || trackProgressSongIdRef.current === songId) return;
    // react-doctor-disable-next-line react-doctor/no-derived-state -- transient seekOverride cannot be derived and resets cleanly during track change.
    resetProgressForTrackChange(songId);
  }, [currentSong?.id, resetProgressForTrackChange]);

  const persistCurrentPlayerState = useCallback(() => {
    const song = currentSongRef.current;
    if (!song) return;

    void Storage.savePlayerState({
      currentSong: song,
      queue: queueRef.current.length > 0 ? queueRef.current : [song],
      queueIndex: queueIndexRef.current,
      positionSeconds: latestPositionSecondsRef.current,
      updatedAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    if (!currentSong) return;
    persistCurrentPlayerState();
  }, [currentSong, queueIndex, persistCurrentPlayerState]);

  useEffect(() => {
    if (!currentSong) return;

    const interval = setInterval(persistCurrentPlayerState, 5000);
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") {
        persistCurrentPlayerState();
      } else {
        // App became active — refresh lock screen metadata on both platforms
        if (TrackPlayer && currentSongRef.current) {
          try {
            const trackIndex = typeof TrackPlayer.getActiveTrackIndex === "function"
              ? await TrackPlayer.getActiveTrackIndex()
              : queueIndexRef.current;
            await publishNativeNowPlaying(currentSongRef.current, trackIndex);
          } catch {
            // Silent fail
          }
        }
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
      persistCurrentPlayerState();
    };
  }, [currentSong, persistCurrentPlayerState]);

  const showPlaybackNotice = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastPlaybackNoticeAtRef.current < 1500) return;
    lastPlaybackNoticeAtRef.current = now;

    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    if (Platform.OS === "ios") {
      Alert.alert("Playback", message);
    }
  }, []);

  useEffect(() => {
    if (
      Platform.OS === "web" ||
      !TrackPlayer ||
      !setupPlayer ||
      !currentSong?.id ||
      isPreviewSession ||
      playbackLoading ||
      resolvedIsBuffering ||
      !actualResolvedIsPlaying ||
      // autoHandleInterruptions pauses playback natively (calls, notifications).
      // If the native runtime already reports Paused the position will not
      // advance — do not treat that as a stall that needs the watchdog.
      runtimePlaybackStateSnapshot === State.Paused
    ) {
      nativeStartWatchdogRef.current = null;
      return;
    }

    const now = Date.now();
    const positionSeconds = Math.max(0, effectivePositionSeconds);
    const existing = nativeStartWatchdogRef.current;

    if (!existing || existing.songId !== currentSong.id) {
      nativeStartWatchdogRef.current = {
        songId: currentSong.id,
        startedAt: now,
        lastPosition: positionSeconds,
        lastAdvancedAt: now,
      };
      return;
    }

    if (positionSeconds > existing.lastPosition + 0.25 || positionSeconds > NATIVE_START_STALL_POSITION_SECONDS) {
      nativeStartWatchdogRef.current = {
        ...existing,
        lastPosition: positionSeconds,
        lastAdvancedAt: now,
      };
      return;
    }

    if (now - existing.startedAt < NATIVE_START_STALL_GRACE_MS || now - existing.lastAdvancedAt < NATIVE_START_STALL_GRACE_MS) {
      return;
    }

    nativeStartWatchdogRef.current = {
      songId: currentSong.id,
      startedAt: now,
      lastPosition: positionSeconds,
      lastAdvancedAt: now,
    };

    let cancelled = false;
    void (async () => {
      try {
        await TrackPlayer.pause();
      } catch {
        // The playback service may already be torn down.
      }

      if (cancelled) return;
      setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");
      setPlaybackIntent(null);
      setPlaybackLoading(false);
      updatePlaybackEngineSnapshot({
        desiredPlayState: null,
        isPlaying: false,
        isLoading: false,
        isBuffering: false,
      });
      showPlaybackNotice("This song could not start. Please try again.");
    })();

    return () => {
      cancelled = true;
    };
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- all reactive playback watchdog deps are listed
  }, [
    actualResolvedIsPlaying,
    currentSong?.id,
    effectivePositionSeconds,
    isPreviewSession,
    playbackLoading,
    resolvedIsBuffering,
    runtimePlaybackStateSnapshot,
    showPlaybackNotice,
  ]);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
    sleepTimerRef.current = null;
    setSleepTimerState(null);
  }, []);

  const clearSleepTimerTimeout = useCallback(() => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
  }, []);

  const pauseForSleepTimer = useCallback(async () => {
    clearSleepTimerTimeout();
    sleepTimerRef.current = null;
    setSleepTimerState(null);
    setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");

    try {
      await TrackPlayer.pause();
    } catch {
      // Silent fail.
    }
  }, [clearSleepTimerTimeout]);

  const setSleepTimer = useCallback((selection: SleepTimerSelection) => {
    clearSleepTimerTimeout();

    if (selection === "end-of-stack") {
      const nextTimer: SleepTimerState = {
        mode: "end-of-stack",
        label: "End of stack",
        endsAt: null,
      };
      sleepTimerRef.current = nextTimer;
      setSleepTimerState(nextTimer);
      return;
    }

    const minutes = selection;
    const endsAt = Date.now() + minutes * 60 * 1000;
    const nextTimer: SleepTimerState = {
      mode: "duration",
      label: minutes === 60 ? "1 hour" : `${minutes} min`,
      endsAt,
    };
    sleepTimerRef.current = nextTimer;
    setSleepTimerState(nextTimer);
    sleepTimerTimeoutRef.current = setTimeout(() => {
      void pauseForSleepTimer();
    }, Math.max(0, endsAt - Date.now()));
  }, [clearSleepTimerTimeout, pauseForSleepTimer]);

  // Stub for YouTube songs - kept for backward compatibility but no longer used
  const playYouTubeSong = useCallback(async (_song: Song, _newQueue?: Song[], _newIndex?: number) => {
    logger.warn("[YouTube] playYouTubeSong called but YouTube iframe playback has been removed");
    showPlaybackNotice("YouTube playback not available");
  }, [showPlaybackNotice]);

  const stopPreviewPlayback = useCallback(() => {
    previewIsEndedRef.current = true;
    previewIsPlayingRef.current = false;
    setPreviewIsPlaying(false);
    setPreviewProgress(0);
    setPreviewDuration(0);
    setPlaybackIntent(null);
    setPlaybackLoading(false);
    updatePlaybackEngineSnapshot({
      desiredPlayState: null,
      isPlaying: false,
      isLoading: false,
      isBuffering: false,
    });
    if (canUseLightweightAudioFallback) {
      ExpoAvPlayer.pause();
    }
  }, []);

  const applyPreviewTrackAdvance = useCallback((nextIndex: number, nextTrack: Song) => {
    // Update refs first for immediate consistency
    previewIsEndedRef.current = false;
    queueIndexRef.current = nextIndex;
    currentSongRef.current = nextTrack;
    setQueueIndex(nextIndex);
    setCurrentSong(nextTrack);
    setPreviewProgress(0);
    setPreviewDuration(0);
    consumeLeadingUserQueuedSongId(nextTrack.id);
  }, [consumeLeadingUserQueuedSongId]);

  const applyPreviewPlaybackStatus = useCallback((isPlayingNext: boolean, position: number, duration: number) => {
    if (previewIsEndedRef.current) return;
    previewIsPlayingRef.current = isPlayingNext;
    setPreviewIsPlaying(isPlayingNext);

    if (isPlayingNext) {
      setPlaybackLoading(false);
    }

    const isMs = duration > 10000;
    const posSec = isMs ? position / 1000 : position;
    const durSec = isMs ? duration / 1000 : duration;

    if (durSec > 0) {
      setPreviewDuration(durSec * 1000);
      setPreviewProgress(posSec / durSec);
    }
  }, []);

  const advancePreviewPlayback = useCallback(() => {
    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    const rm = previewRepeatModeRef.current;
    let ni = ci;
    if (rm !== "one") {
      ni = ci + 1;
      if (ni >= cq.length) {
        if (rm === "all") ni = 0;
        else {
          if (sleepTimerRef.current?.mode === "end-of-stack") {
            clearSleepTimer();
          }
          stopPreviewPlayback();
          return;
        }
      }
    }
    const nextTrack = cq[ni];
    if (!nextTrack) return;

    applyPreviewTrackAdvance(ni, nextTrack);

    void resolvePlaybackUrl(nextTrack).then((url) => {
      if (url) {
        void ExpoAvPlayer.loadAndPlay(url);
      }
    });
  }, [applyPreviewTrackAdvance, clearSleepTimer, stopPreviewPlayback]);

  // Wire expo-audio status + error callbacks for runtimes using the lightweight fallback.
  useEffect(() => {
    if (!canUseLightweightAudioFallback) return;
    let mounted = true;

    ExpoAvPlayer.onError((err: any) => {
      if (!mounted) return;
      logger.warn("[ExpoAudio] Playback error", err);
      showPlaybackNotice("Could not play this song.");
    });

    ExpoAvPlayer.onStatusUpdate(({ isPlaying, position, duration, didJustFinish }: { isPlaying: boolean; position: number; duration: number; didJustFinish: boolean }) => {
      if (!mounted || previewIsEndedRef.current) return;
      applyPreviewPlaybackStatus(isPlaying, position, duration);

      // Robust check for playback completion
      const isMs = duration > 10000;
      const posSec = isMs ? position / 1000 : position;
      const durSec = isMs ? duration / 1000 : duration;
      const finished = didJustFinish || (!isPlaying && posSec > 0 && durSec > 0 && posSec >= durSec - 0.5);

      // Auto-advance to next song when current one finishes
      if (finished) {
        previewIsEndedRef.current = true; // prevent double auto-advancing
        advancePreviewPlayback();
      }
    });

    return () => {
      mounted = false;
      ExpoAvPlayer.destroy();
    };
  }, [applyPreviewPlaybackStatus, advancePreviewPlayback, showPlaybackNotice]);

  useEffect(() => {
    return clearSleepTimerTimeout;
  }, [clearSleepTimerTimeout]);

  useEffect(() => {
    if (!TrackPlayer || !setupPlayer || !isPlayerReady || Platform.OS === "web") {
      return;
    }

    let mounted = true;
    let appState = "active";
    const appStateSub = AppState.addEventListener(
      "change",
      async (next: string) => {
        const prev = appState;
        appState = next;
        // When app comes back to foreground, sync currentSong from TrackPlayer.
        // This handles the case where external controls (notifications, Bluetooth) changed the track
        // while the app was backgrounded ΓÇö without this the home screen mini-player stays blank.
        if (next === "active" && prev !== "active" && mounted) {
          try {
            const [activeTrack, nativeQueue, activeTrackIndex] = await Promise.all([
              TrackPlayer.getActiveTrack(),
              TrackPlayer.getQueue(),
              typeof TrackPlayer.getActiveTrackIndex === "function"
                ? TrackPlayer.getActiveTrackIndex()
                : Promise.resolve(undefined),
            ]);
            if (!mounted || !activeTrack?.id) return;
            const cq = queueRef.current;
            const mappedIndex = cq.findIndex((s) => String(s.id) === String(activeTrack.id));
            if (mappedIndex >= 0) {
              applyNativeTrackIndex(mappedIndex, String(activeTrack.id));
              return;
            }

            const nativeSongs = Array.isArray(nativeQueue)
              ? mapFilter(nativeQueue, trackToSong, (song): song is Song => Boolean(song))
              : [];
            const fallbackIndex = typeof activeTrackIndex === "number" && Number.isFinite(activeTrackIndex)
              ? activeTrackIndex
              : nativeSongs.findIndex((song) => String(song.id) === String(activeTrack.id));
            if (nativeSongs.length > 0) {
              applyNativeQueueSnapshot(nativeSongs, fallbackIndex >= 0 ? fallbackIndex : 0);
            }
          } catch {
            // Silent fail
          }
        }
      }
    );

    const syncRuntimeProgress = async () => {
      if (appState !== "active") return;
      try {
        // Only fetch progress + playback state here. Track/queue identity is
        // handled by RNTP events (PlaybackActiveTrackChanged) and the
        // AppState foreground-resume block above, avoiding duplicate
        // getQueue/getActiveTrack calls that cause progress jitter on Android.
        const [runtimeProgress, runtimePlaybackState] = await Promise.all([
          TrackPlayer.getProgress(),
          TrackPlayer.getPlaybackState(),
        ]);
        if (mounted) {
          const nextPosition = Number.isFinite(runtimeProgress?.position)
            ? Math.max(0, runtimeProgress.position)
            : 0;
          const nextDuration = Number.isFinite(runtimeProgress?.duration)
            ? Math.max(0, runtimeProgress.duration)
            : 0;
          const nextPlaybackState =
            runtimePlaybackState && typeof runtimePlaybackState === "object" && "state" in runtimePlaybackState
              ? runtimePlaybackState.state
              : runtimePlaybackState;

          applyRuntimeProgressAndState(nextPosition, nextDuration, nextPlaybackState);
        }
      } catch {
        // Silent runtime progress fallback failure
      }
    };

    void syncRuntimeProgress();
    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void syncRuntimeProgress();
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [applyNativeQueueSnapshot, applyNativeTrackIndex, applyRuntimeProgressAndState, isPlayerReady]);

  useEffect(() => {
    let mounted = true;

    const loadLikedSongs = async () => {
      try {
        if (authUser?.id) {
          const firestoreSongs = await getLikedSongsFromFirestore(authUser.id);
          if (mounted) {
            applyLikedSongsState(firestoreSongs);
          }
        } else {
          if (mounted) {
            clearLikedSongsState();
          }
        }
      } catch (error) {
        // Keep the existing liked-songs state intact on transient Firestore/network
        // failures. Wiping it would visually erase the user's liked list on any
        // momentary network blip. Only the signed-out path clears state.
        logger.warn("[Player] Failed to load liked songs; keeping existing state", error);
      }
    };
    
    loadLikedSongs();

    return () => {
      mounted = false;
    };
  }, [applyLikedSongsState, authUser?.id, clearLikedSongsState]);

  const syncFromTrackEvent = useCallback((event: any) => {
    try {
      const cq = queueRef.current;
      if (cq.length === 0) return;

      const trackId = event?.track?.id;
      if (trackId != null) {
        const normalizedId = String(trackId);
        const mappedIndex = cq.findIndex((song) => song.id === normalizedId);
        if (mappedIndex >= 0) {
          applyNativeTrackIndex(mappedIndex, normalizedId);
          return;
        }
      }

      let nextIndex: number | undefined;
      if (typeof event?.index === "number") {
        nextIndex = event.index;
      } else if (typeof event?.nextTrack === "number") {
        nextIndex = event.nextTrack;
      }

      const appIndex =
        typeof nextIndex === "number" && nextIndex >= 0
          ? nativeQueueAppIndicesRef.current[nextIndex] ?? nextIndex
          : undefined;

      if (typeof appIndex === "number" && appIndex >= 0 && appIndex < cq.length) {
        const nextSong = cq[appIndex];
        applyNativeTrackIndex(appIndex, nextSong?.id ? String(nextSong.id) : null);
      }
    } catch {
      // Silent fail
    }
  }, [applyNativeTrackIndex]);

  const handleNativePlaybackError = useCallback((event: any) => {
    logger.warn("[Player] Native playback error", event);
    const failedSong = currentSongRef.current;
    if (failedSong && isYouTubeSource(failedSong)) {
      const currentQueue = queueRef.current.length > 0 ? queueRef.current : [failedSong];
      const targetIndex = Math.max(0, currentQueue.findIndex((item) => item.id === failedSong.id));
      void playYouTubeSong(
        stripTransientYouTubeAudioUrl(failedSong),
        currentQueue,
        targetIndex
      );
      return;
    }
    setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");
    showPlaybackNotice("Playback stopped. Please try this song again.");
  }, [playYouTubeSong, showPlaybackNotice]);

  const handleNativeQueueEnded = useCallback(() => {
    setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");
    if (sleepTimerRef.current?.mode === "end-of-stack") {
      clearSleepTimer();
    }
  }, [clearSleepTimer]);

  const handleNativePlaybackState = useCallback((event: any) => {
    const nextState =
      event && typeof event === "object" && "state" in event
        ? event.state
        : event;
    setRuntimePlaybackStateSnapshot(nextState);
    if (nextState === State.Playing || nextState === State.Paused) {
      setPlaybackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPlayerReady) return;

    const cleanups = [
      subscribeTrackPlayerEvent(Event.PlaybackActiveTrackChanged, syncFromTrackEvent),
      Event.PlaybackTrackChanged
        ? subscribeTrackPlayerEvent(Event.PlaybackTrackChanged, syncFromTrackEvent)
        : null,
      Event.PlaybackError
        ? subscribeTrackPlayerEvent(Event.PlaybackError, handleNativePlaybackError)
        : null,
      Event.PlaybackQueueEnded
        ? subscribeTrackPlayerEvent(Event.PlaybackQueueEnded, handleNativeQueueEnded)
        : null,
      Event.PlaybackState
        ? subscribeTrackPlayerEvent(Event.PlaybackState, handleNativePlaybackState)
        : null,
    ];

    return () => {
      cleanups.forEach((cleanup) => cleanup?.());
    };
  }, [
    handleNativePlaybackError,
    handleNativePlaybackState,
    handleNativeQueueEnded,
    isPlayerReady,
    syncFromTrackEvent,
  ]);

  const runSerializedPlaybackSwitch = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = playbackSwitchChainRef.current ?? Promise.resolve();
    playbackSwitchChainRef.current = previous
      .catch(() => {
        // Keep the chain alive even if a previous switch failed.
      })
      .then(() => gate);

    await previous.catch(() => {
      // Ignore previous failure; still execute this request.
    });

    try {
      return await task();
    } finally {
      release();
    }
  }, []);

  const ensurePlayerReady = useCallback(async (): Promise<boolean> => {
    logger.debug("[Player] ensurePlayerReady check:", {
      isPlayerReady,
      hasTrackPlayer: Boolean(TrackPlayer),
      hasSetupPlayer: Boolean(setupPlayer),
    });
    if (isPlayerReady) return true;
    if (!TrackPlayer || !setupPlayer) {
      logger.warn("[Player] ensurePlayerReady: TrackPlayer or setupPlayer is null/undefined");
      return false;
    }
    try {
      await setupPlayer();
      setIsPlayerReady(true);
      return true;
    } catch (error) {
      logger.error("[Player] TrackPlayer setup failed during ensure", error);
      return false;
    }
  }, [isPlayerReady]);

  const getNativeTrackIndexForSong = useCallback(async (index: number, songId: string): Promise<number> => {
    if (!TrackPlayer || !songId) {
      return -1;
    }

    try {
      const nativeQueue = await TrackPlayer.getQueue();
      if (String(nativeQueue?.[index]?.id ?? "") === String(songId)) {
        return index;
      }

      const mappedIndex = nativeQueueAppIndicesRef.current.findIndex((appIndex) => appIndex === index);
      if (mappedIndex >= 0 && String(nativeQueue?.[mappedIndex]?.id ?? "") === String(songId)) {
        return mappedIndex;
      }

      return nativeQueue.findIndex((track: any) => String(track?.id ?? "") === String(songId));
    } catch {
      return -1;
    }
  }, []);

  const nativeQueueHasTrackAt = useCallback(async (index: number, songId: string): Promise<boolean> => {
    return (await getNativeTrackIndexForSong(index, songId)) >= 0;
  }, [getNativeTrackIndexForSong]);

  const buildPlaybackQueueForSong = useCallback(async (
    song: Song,
    requestedQueue?: Song[]
  ): Promise<{ queue: Song[]; targetIndex: number; targetSong: Song } | null> => {
    const seed = normalizePlayableSong(song);
    if (!seed) return null;

    const rawBaseQueue = Array.isArray(requestedQueue) && requestedQueue.length > 0
      ? requestedQueue
      : [song];
    const baseQueue = mapFilter(rawBaseQueue, normalizePlayableSong, (item): item is Song => Boolean(item));
    const baseTargetIndex = baseQueue.findIndex((item) => item.id === seed.id);

    if (!isSingleSongQueue(baseQueue, seed)) {
      if (baseTargetIndex >= 0) {
        return { queue: baseQueue, targetIndex: baseTargetIndex, targetSong: baseQueue[baseTargetIndex] };
      }

      return {
        queue: [seed, ...baseQueue],
        targetIndex: 0,
        targetSong: seed,
      };
    }

    const currentQueue = queueRef.current;
    const currentIndex = queueIndexRef.current;
    const immediateCandidates = [
      ...rawBaseQueue,
      ...currentQueue.slice(Math.max(0, currentIndex + 1)),
      ...currentQueue.slice(0, Math.max(0, currentIndex)),
      ...originalQueueRef.current,
      ...likedSongsRef.current,
    ];

    let autoplayQueue = makeAutoplayQueue(seed, immediateCandidates);
    if (autoplayQueue.length < SINGLE_SONG_AUTOPLAY_MIN_SIZE) {
      const storageCandidates = await getSingleSongAutoplayCandidates();
      autoplayQueue = makeAutoplayQueue(seed, [...immediateCandidates, ...storageCandidates]);
    }

    return {
      queue: autoplayQueue.length > 0 ? autoplayQueue : [seed],
      targetIndex: 0,
      targetSong: autoplayQueue[0] ?? seed,
    };
  }, []);

  const appendRemainingTracksIfCurrent = useCallback((requestId: number, songs: Song[], startIndex: number) => {
    if (!TrackPlayer || songs.length === 0) return;

    void runSerializedPlaybackSwitch(async () => {
      if (requestId !== playRequestIdRef.current) return;
      const entries = await resolveNativeTrackEntries(songs, startIndex);
      if (requestId !== playRequestIdRef.current || entries.length === 0) return;

      const currentQueue = queueRef.current;
      const resolvedQueue = mergeResolvedNativeEntriesIntoQueue(currentQueue, entries);
      if (resolvedQueue !== currentQueue) {
        queueRef.current = resolvedQueue;
        originalQueueRef.current = resolvedQueue;
        setQueue(resolvedQueue);
        setSourceQueue(resolvedQueue);
        updatePlaybackEngineSnapshot({ queue: resolvedQueue, sourceQueue: resolvedQueue });
      }

      nativeQueueAppIndicesRef.current = [
        ...nativeQueueAppIndicesRef.current,
        ...entries.map((entry) => entry.appIndex),
      ];
      await TrackPlayer.add(entries.map((entry) => entry.track));
    }).catch(() => {
      // Silent background queue append failure.
    });
  }, [runSerializedPlaybackSwitch]);

  const loadAndPlaySong = useCallback(async (song: Song, newQueue?: Song[], newIndex?: number) => {
    const requestId = ++playRequestIdRef.current;
    setPlaybackIntent(true);
    const playbackPlan = await buildPlaybackQueueForSong(song, newQueue);
    if (requestId !== playRequestIdRef.current) {
      return;
    }
    if (!playbackPlan || playbackPlan.queue.length === 0) {
      setPlaybackIntent(null);
      updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
      return;
    }

    const playableQueue = playbackPlan.queue;
    const requestedIndex =
      typeof newIndex === "number" &&
      newIndex >= 0 &&
      newIndex < playableQueue.length &&
      playableQueue[newIndex]?.id === playbackPlan.targetSong.id
        ? newIndex
        : playbackPlan.targetIndex;
    const targetIndex = requestedIndex >= 0 ? requestedIndex : playbackPlan.targetIndex;
    const targetSong = playableQueue[targetIndex];

    const previousQueue = queueRef.current;
    const queueIsSame = isSameQueueById(previousQueue, playableQueue);

    markPendingNativeTrack(targetIndex, targetSong, "playSong");
    setQueue(playableQueue);
    setSourceQueue(playableQueue);
    queueRef.current = playableQueue;
    clearUserQueuedSongIds();
    originalQueueRef.current = playableQueue;
    setQueueIndex(targetIndex);
    queueIndexRef.current = targetIndex;
    currentSongRef.current = targetSong;
    setCurrentSong(targetSong);
    updatePlaybackEngineSnapshot({
      currentSong: targetSong,
      queue: playableQueue,
      sourceQueue: playableQueue,
      userQueuedSongIds: [],
      queueIndex: targetIndex,
      desiredPlayState: true,
      isLoading: false,
      isBuffering: false,
    });

    Storage.addRecentlyPlayed({
      id: targetSong.id,
      name: targetSong.title,
      imageUrl: targetSong.coverUrl,
      type: "song",
      data: targetSong,
    });

    await runSerializedPlaybackSwitch(async () => {
      try {
        setPlaybackLoading(true);
        updatePlaybackEngineSnapshot({ isLoading: true });

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        const ready = await ensurePlayerReady();
        if (!ready) {
          if (isYouTubeSource(targetSong)) {
            await playYouTubeSong(
              stripTransientYouTubeAudioUrl(targetSong),
              playableQueue,
              targetIndex
            );
            return;
          }
          setPlaybackIntent(null);
          setPlaybackLoading(false);
          updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
          showPlaybackNotice("Player not ready yet. Please try again.");
          return;
        }

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        const existingNativeTargetIndex = queueIsSame &&
          (!isYouTubeSource(targetSong) || hasFreshYouTubeNativeAudio(targetSong))
          ? await getNativeTrackIndexForSong(targetIndex, targetSong.id)
          : -1;

        if (queueIsSame && existingNativeTargetIndex >= 0) {
          // Fast path: queue unchanged and native queue is confirmed in sync.
          // Do not remove/re-add the active track here; rebuilding is safer
          // than indexed native mutation if the URL source needs to change.
          await TrackPlayer.skip(existingNativeTargetIndex);
          await publishNativeNowPlaying(targetSong, targetIndex);
          await TrackPlayer.play();
          return;
        }

        // Resolve playable URLs before handing items to TrackPlayer.
        const preloadCount = Math.max(
          Math.min(playableQueue.length, PRELOAD_QUEUE_SIZE),
          targetIndex + 1
        );
        // react-doctor-disable-next-line react-doctor/async-defer-await -- requestId can become stale while resolving native tracks, so the guard below must run after this await.
        const initialEntries = await resolveNativeTrackEntries(playableQueue.slice(0, preloadCount), 0);
        const targetNativeIndex = initialEntries.findIndex((entry) => entry.appIndex === targetIndex);

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        if (targetNativeIndex < 0) {
          if (isYouTubeSource(targetSong)) {
            // Native audio stream could not be resolved (backend unavailable or yt-dlp failed).
            // Fall back to iframe ΓÇö background playback and lock screen will NOT work in this session.
            logger.warn("[Playback] YouTube native audio resolution failed ΓÇö falling back to iframe (no background/lock screen)", {
              songId: targetSong.id,
              title: targetSong.title,
            });
            showPlaybackNotice("Playing via YouTube ΓÇö background & lock screen unavailable");
            await playYouTubeSong(
              stripTransientYouTubeAudioUrl(targetSong),
              playableQueue,
              targetIndex
            );
            return;
          }
          setPlaybackIntent(null);
          setPlaybackLoading(false);
          failPendingNativeTrack("This song has no playable audio URL.");
          updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
          showPlaybackNotice("This song has no playable audio URL.");
          return;
        }

        const resolvedPlayableQueue = mergeResolvedNativeEntriesIntoQueue(playableQueue, initialEntries);
        const resolvedTargetSong = resolvedPlayableQueue[targetIndex] || targetSong;
        if (resolvedPlayableQueue !== playableQueue) {
          queueRef.current = resolvedPlayableQueue;
          originalQueueRef.current = resolvedPlayableQueue;
          currentSongRef.current = resolvedTargetSong;
          setQueue(resolvedPlayableQueue);
          setSourceQueue(resolvedPlayableQueue);
          setCurrentSong(resolvedTargetSong);
          updatePlaybackEngineSnapshot({
            currentSong: resolvedTargetSong,
            queue: resolvedPlayableQueue,
            sourceQueue: resolvedPlayableQueue,
          });
        }

        const initialTracks = initialEntries.map((entry) => entry.track);
        const remainingSongs = resolvedPlayableQueue.slice(preloadCount);
        nativeQueueAppIndicesRef.current = initialEntries.map((entry) => entry.appIndex);

        if (typeof TrackPlayer.setQueue === "function") {
          await TrackPlayer.setQueue(initialTracks);
          if (targetNativeIndex > 0) {
            await TrackPlayer.skip(targetNativeIndex);
          }
          await publishNativeNowPlaying(resolvedTargetSong, targetIndex);
          await TrackPlayer.play();

          appendRemainingTracksIfCurrent(requestId, remainingSongs, preloadCount);
        } else {
          await TrackPlayer.reset();
          await TrackPlayer.add(initialTracks);
          if (targetNativeIndex > 0) {
            await TrackPlayer.skip(targetNativeIndex);
          }
          await publishNativeNowPlaying(resolvedTargetSong, targetIndex);
          await TrackPlayer.play();

          appendRemainingTracksIfCurrent(requestId, remainingSongs, preloadCount);
        }

        if (RepeatMode) {
          const repeatMap = {
            "off": RepeatMode.Off,
            "all": RepeatMode.Queue,
            "one": RepeatMode.Track,
          };
          await TrackPlayer.setRepeatMode(repeatMap[repeatModeRef.current]);
        }
      } catch (error) {
        if (isYouTubeSource(targetSong)) {
          await playYouTubeSong(
            stripTransientYouTubeAudioUrl(targetSong),
            playableQueue,
            targetIndex
          );
          return;
        }
        setPlaybackIntent(null);
        failPendingNativeTrack("Could not start playback.");
        updatePlaybackEngineSnapshot({ desiredPlayState: null, isBuffering: false });
        logger.error("[Player] loadAndPlaySong failed", {
          error,
          songId: song?.id,
          songAudioUrl: song?.audioUrl,
        });
        showPlaybackNotice("Could not start playback.");
      } finally {
        setPlaybackLoading(false);
        if (requestId === playRequestIdRef.current) {
          updatePlaybackEngineSnapshot({ isLoading: false });
        }
      }
    });
  }, [appendRemainingTracksIfCurrent, buildPlaybackQueueForSong, clearUserQueuedSongIds, ensurePlayerReady, failPendingNativeTrack, getNativeTrackIndexForSong, markPendingNativeTrack, playYouTubeSong, runSerializedPlaybackSwitch, showPlaybackNotice]);



  const playSong = useCallback(async (song: Song, newQueue?: Song[]) => {
    try {
      const requestId = ++playRequestIdRef.current;
      const requestedQueue = (newQueue || [song]).filter((item): item is Song => Boolean(item?.id));
      const requestedIndex = Math.max(0, requestedQueue.findIndex((item) => item.id === song.id));
      const requestedSong = requestedQueue[requestedIndex] || song;
      const playbackPlan = await buildPlaybackQueueForSong(requestedSong, requestedQueue);
      if (requestId !== playRequestIdRef.current) {
        return;
      }
      if (!playbackPlan) {
        setPlaybackIntent(null);
        setPlaybackLoading(false);
        showPlaybackNotice("This song cannot be played.");
        return;
      }

      const q = playbackPlan.queue;
      const targetIndex = playbackPlan.targetIndex;
      const targetSong = playbackPlan.targetSong;

      logger.debug("[Playback] playSong initiating", {
        songId: targetSong.id,
        songTitle: targetSong.title,
      });

      setPlaybackIntent(true);
      setPlaybackLoading(true);
      setQueueIndex(targetIndex);
      queueIndexRef.current = targetIndex;
      currentSongRef.current = targetSong;
      setCurrentSong(targetSong);
      clearUserQueuedSongIds();
      setQueue(q);
      setSourceQueue(q);
      queueRef.current = q;
      originalQueueRef.current = q;
      updatePlaybackEngineSnapshot({
        currentSong: targetSong,
        queue: q,
        sourceQueue: q,
        userQueuedSongIds: [],
        queueIndex: targetIndex,
        desiredPlayState: true,
        isLoading: true,
        isBuffering: false,
      });

      const normalizedSong = normalizePlayableSong(targetSong);
      if (!normalizedSong) {
        logger.error("[Playback] playSong: Song normalization failed", { id: targetSong.id });
        if (requestId === playRequestIdRef.current) {
          setPlaybackLoading(false);
          showPlaybackNotice("This song cannot be played.");
        }
        return;
      }

      currentSongRef.current = normalizedSong;
      setCurrentSong(normalizedSong);

      logger.debug("[Playback] playSong: Routing to native player");

      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback) {
          const fallbackQueue = q.filter((item): item is Song => Boolean(item?.id));
          const songIndex = fallbackQueue.findIndex((s) => s.id === normalizedSong.id);
          if (songIndex >= 0) fallbackQueue[songIndex] = normalizedSong;

          previewIsEndedRef.current = false;
          setPlaybackIntent(true);
          setPlaybackLoading(true);
          updatePlaybackEngineSnapshot({
            currentSong: normalizedSong,
            queue: fallbackQueue,
            sourceQueue: fallbackQueue,
            userQueuedSongIds: [],
            queueIndex: targetIndex,
            desiredPlayState: true,
            isPlaying: true,
            isLoading: true,
            isBuffering: false,
          });
          setPreviewProgress(0);
          previewIsPlayingRef.current = true;
          setPreviewIsPlaying(true);

          void resolvePlaybackUrl(normalizedSong).then((url) => {
            if (requestId === playRequestIdRef.current) {
              if (url) {
                void ExpoAvPlayer.loadAndPlay(url);
              } else {
                setPlaybackIntent(null);
                setPlaybackLoading(false);
                updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
                showPlaybackNotice("Could not resolve playback URL.");
              }
            }
          });
        }
        return;
      }

      await loadAndPlaySong(normalizedSong, q, targetIndex);
    } catch (error) {
      logger.error("[Player] playSong failed", {
        error,
        songId: song?.id,
        source: song?.source,
      });
      setPlaybackIntent(null);
      updatePlaybackEngineSnapshot({
        desiredPlayState: null,
        isPlaying: false,
        isLoading: false,
        isBuffering: false,
      });
      showPlaybackNotice("Could not start playback.");
    } finally {
      setPlaybackLoading(false);
    }
  }, [buildPlaybackQueueForSong, clearUserQueuedSongIds, loadAndPlaySong, showPlaybackNotice]);

  const togglePlay = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback && currentSong) {
          // Use ref — never stale, always reflects current playback state
          if (previewIsPlayingRef.current) {
            setPlaybackIntent(false);
            updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isBuffering: false });
            previewIsPlayingRef.current = false;
            setPreviewIsPlaying(false);
            ExpoAvPlayer.pause();
          } else {
            previewIsEndedRef.current = false;
            setPlaybackIntent(true);
            updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true, isBuffering: false });
            previewIsPlayingRef.current = true;
            setPreviewIsPlaying(true);
            // If no URL loaded yet (e.g. after app reopen), load first then play
            if (!ExpoAvPlayer.isLoaded()) {
              const url = await resolvePlaybackUrl(currentSong);
              if (url) {
                void ExpoAvPlayer.loadAndPlay(url);
              }
            } else {
              ExpoAvPlayer.play();
            }
          }
          return;
        }
        setPlaybackIntent(null);
        updatePlaybackEngineSnapshot({ desiredPlayState: null });
        showPlaybackNotice("Player not available. Please restart the app.");
        return;
      }

      let ready = isPlayerReady;
      if (!ready) {
        ready = await ensurePlayerReady();
        if (!ready) {
          setPlaybackIntent(null);
          updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
          showPlaybackNotice("Player not ready yet. Please try again.");
          return;
        }
      }

      if (resolvedIsPlaying) {
        setPlaybackIntent(false);
        updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isBuffering: false });
        await TrackPlayer.pause();
        return;
      }

      setPlaybackIntent(true);
      updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
      const currentQueue = mapFilter((queueRef.current.length > 0 ? queueRef.current : currentSong ? [currentSong] : []), normalizePlayableSong, (item): item is Song => Boolean(item));
      const targetSong = currentSong
        ? normalizePlayableSong(currentSong)
        : currentQueue[queueIndexRef.current] ?? currentQueue[0];
      if (!targetSong) {
        setPlaybackIntent(null);
        updatePlaybackEngineSnapshot({ desiredPlayState: null });
        showPlaybackNotice("This song has no playable audio URL.");
        return;
      }

      const targetIndex = Math.max(0, currentQueue.findIndex((song) => song.id === targetSong.id));
      const nativeTargetIndex = await getNativeTrackIndexForSong(targetIndex, targetSong.id);
      if (nativeTargetIndex < 0) {
        await loadAndPlaySong(targetSong, currentQueue.length > 0 ? currentQueue : [targetSong], targetIndex);
        const resumeAt = restoredPositionSecondsRef.current;
        if (resumeAt > 1) {
          await TrackPlayer.seekTo(resumeAt).catch(() => {});
        }
        restoredPositionSecondsRef.current = 0;
        return;
      }

      try {
        const activeNativeIndex =
          typeof TrackPlayer.getActiveTrackIndex === "function"
            ? await TrackPlayer.getActiveTrackIndex()
            : undefined;
        if (activeNativeIndex !== nativeTargetIndex) {
          await TrackPlayer.skip(nativeTargetIndex);
        }
        await publishNativeNowPlaying(targetSong, targetIndex);
        await TrackPlayer.play();
      } catch {
        await loadAndPlaySong(targetSong, currentQueue.length > 0 ? currentQueue : [targetSong], targetIndex);
        const resumeAt = restoredPositionSecondsRef.current;
        if (resumeAt > 1) {
          await TrackPlayer.seekTo(resumeAt).catch(() => {});
        }
      }
      restoredPositionSecondsRef.current = 0;
      return;
    } catch {
      setPlaybackIntent(null);
      updatePlaybackEngineSnapshot({ desiredPlayState: null });
      // Fallback path when no active track exists yet.
    }

    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (!activeTrack && currentSong) {
        const currentQueue = (queueRef.current.length > 0 ? queueRef.current : [currentSong]).filter(
          isPlayableSong
        );
        if (currentQueue.length > 0) {
          const currentIndex = currentQueue.findIndex((s) => s.id === currentSong.id);
          const targetIndex = currentIndex >= 0 ? currentIndex : 0;
          await loadAndPlaySong(currentQueue[targetIndex], currentQueue, targetIndex);
          const resumeAt = restoredPositionSecondsRef.current;
          if (resumeAt > 1) {
            await TrackPlayer.seekTo(resumeAt).catch(() => {});
          }
          restoredPositionSecondsRef.current = 0;
          return;
        }
      }
    } catch (error) {
      // Silent fail
    }
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- queueRef/queueIndexRef are stable; all reactive deps listed
  }, [currentSong, ensurePlayerReady, getNativeTrackIndexForSong, isPlayerReady, loadAndPlaySong, resolvedIsPlaying, showPlaybackNotice]);

  const nextSong = useCallback(async () => {
    try {
      const cq = queueRef.current;
      const ci = queueIndexRef.current;
      if (cq.length === 0) return;
      let ni = ci + 1;
      const rm = TrackPlayer && setupPlayer ? repeatModeRef.current : previewRepeatMode;
      if (ni >= cq.length) {
        if (rm === "all") ni = 0;
        else return;
      }

      const nextTrack = cq[ni];
      if (!nextTrack) return;

      const requestId = ++playRequestIdRef.current;
      setPlaybackIntent(true);
      setPlaybackLoading(true);
      setQueueIndex(ni);
      queueIndexRef.current = ni;
      currentSongRef.current = nextTrack;
      setCurrentSong(nextTrack);
      consumeLeadingUserQueuedSongId(nextTrack.id);
      updatePlaybackEngineSnapshot({
        currentSong: nextTrack,
        queue: cq,
        queueIndex: ni,
        desiredPlayState: true,
        isPlaying: true,
        isLoading: true,
        isBuffering: false,
      });

      logger.debug("[Playback] nextSong: Routing to native player");
      currentSongRef.current = nextTrack;

      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback) {
          void resolvePlaybackUrl(nextTrack).then((url) => {
            if (requestId === playRequestIdRef.current && url) {
              void ExpoAvPlayer.loadAndPlay(url);
            }
          });
        }
        return;
      }

      markPendingNativeTrack(ni, nextTrack, "skipNext");

      let ready = isPlayerReady;
      if (!ready) {
        ready = await ensurePlayerReady();
        if (!ready) {
          if (requestId === playRequestIdRef.current) setPlaybackIntent(null);
          return;
        }
      }

      const nativeTargetIndex = await getNativeTrackIndexForSong(ni, nextTrack.id);
      if (nativeTargetIndex < 0) {
        if (queueIndexRef.current !== ni || queueRef.current[ni]?.id !== nextTrack.id) return;
        await loadAndPlaySong(nextTrack, cq, ni);
        return;
      }

      await runSerializedPlaybackSwitch(async () => {
        if (queueIndexRef.current !== ni || queueRef.current[ni]?.id !== nextTrack.id) return;
        await TrackPlayer.skip(nativeTargetIndex);
        await publishNativeNowPlaying(nextTrack, ni);
        await TrackPlayer.play();
      });
    } catch (error) {
      failPendingNativeTrack("Could not skip to next track.");
    }
  }, [consumeLeadingUserQueuedSongId, ensurePlayerReady, failPendingNativeTrack, getNativeTrackIndexForSong, isPlayerReady, loadAndPlaySong, markPendingNativeTrack, runSerializedPlaybackSwitch, previewRepeatMode]);

  const prevSong = useCallback(async () => {
    try {
      const cq = queueRef.current;
      const ci = queueIndexRef.current;
      if (cq.length === 0) return;

      const rm = TrackPlayer && setupPlayer ? repeatModeRef.current : previewRepeatMode;

      const positionSeconds = (TrackPlayer && setupPlayer) 
        ? safePosition 
        : previewProgress * (previewDuration / 1000);
        
      if (positionSeconds > 3) {
        if (TrackPlayer && setupPlayer) {
          await TrackPlayer.seekTo(0);
        } else if (canUseLightweightAudioFallback) {
          await ExpoAvPlayer.seekTo(0);
          setPreviewProgress(0);
        }
        return;
      }

      let pi = ci - 1;
      if (pi < 0) {
        if (rm === "all") {
          pi = cq.length - 1;
        } else {
          if (TrackPlayer && setupPlayer) {
            await TrackPlayer.seekTo(0);
          } else if (canUseLightweightAudioFallback) {
            await ExpoAvPlayer.seekTo(0);
            setPreviewProgress(0);
          }
          return;
        }
      }

      const prevTrack = cq[pi];
      if (!prevTrack) return;

      logger.debug("[Playback] prevSong initiating", {
        currentIndex: ci,
        prevIndex: pi,
        prevSongId: prevTrack.id,
      });

      const requestId = ++playRequestIdRef.current;
      setPlaybackIntent(true);
      setPlaybackLoading(true);
      setQueueIndex(pi);
      queueIndexRef.current = pi;
      currentSongRef.current = prevTrack;
      setCurrentSong(prevTrack);
      consumeLeadingUserQueuedSongId(prevTrack.id);
      updatePlaybackEngineSnapshot({
        currentSong: prevTrack,
        queue: cq,
        queueIndex: pi,
        desiredPlayState: true,
        isPlaying: true,
        isLoading: true,
        isBuffering: false,
      });

      logger.debug("[Playback] prevSong: Routing to native player");
      currentSongRef.current = prevTrack;

      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback) {
          void resolvePlaybackUrl(prevTrack).then((url) => {
            if (requestId === playRequestIdRef.current && url) {
              void ExpoAvPlayer.loadAndPlay(url);
            }
          });
        }
        return;
      }

      markPendingNativeTrack(pi, prevTrack, "skipPrevious");

      let ready = isPlayerReady;
      if (!ready) {
        ready = await ensurePlayerReady();
        if (!ready) {
          if (requestId === playRequestIdRef.current) setPlaybackIntent(null);
          return;
        }
      }

      const nativeTargetIndex = await getNativeTrackIndexForSong(pi, prevTrack.id);
      if (nativeTargetIndex < 0) {
        if (queueIndexRef.current !== pi || queueRef.current[pi]?.id !== prevTrack.id) return;
        await loadAndPlaySong(prevTrack, cq, pi);
        return;
      }

      await runSerializedPlaybackSwitch(async () => {
        if (queueIndexRef.current !== pi || queueRef.current[pi]?.id !== prevTrack.id) return;
        await TrackPlayer.skip(nativeTargetIndex);
        await publishNativeNowPlaying(prevTrack, pi);
        await TrackPlayer.play();
      });
    } catch (error) {
      failPendingNativeTrack("Could not skip to previous track.");
    }
  }, [consumeLeadingUserQueuedSongId, ensurePlayerReady, failPendingNativeTrack, getNativeTrackIndexForSong, isPlayerReady, loadAndPlaySong, markPendingNativeTrack, runSerializedPlaybackSwitch, safePosition, previewProgress, previewDuration, previewRepeatMode]);

  const seekTo = useCallback(async (p: number) => {
    let seekRequestId = 0;
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback) {
          previewIsEndedRef.current = false;
          const normalizedProgress = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
          // Set progress immediately so the UI moves right away
          setPreviewProgress(normalizedProgress);

          // Get duration — prefer live state, fall back to song metadata
          let durSec = previewDuration / 1000;
          if (durSec <= 0) {
            durSec = toDurationSeconds(currentSong?.duration);
          }
          if (durSec > 0) {
            await ExpoAvPlayer.seekTo(normalizedProgress * durSec);
          }
        }
        return;
      }
      if (!isPlayerReady) {
        return;
      }
      let seekableDuration = effectiveTrackDurationSeconds;
      if (!seekableDuration) {
        try {
          const runtimeProgress = await TrackPlayer.getProgress();
          seekableDuration = toDurationSeconds(runtimeProgress?.duration);
        } catch {
          // Continue to track metadata fallback
        }
      }
      if (!seekableDuration) {
        try {
          const activeTrack = await TrackPlayer.getActiveTrack();
          seekableDuration = toDurationSeconds(activeTrack?.duration);
        } catch {
          // No-op
        }
      }
      if (!seekableDuration) return;
      const normalizedProgress = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
      const posSeconds = Math.max(0, Math.min(seekableDuration, normalizedProgress * seekableDuration));
      seekRequestId = ++seekRequestIdRef.current;

      setSeekOverride({
        songId: currentSong?.id ?? null,
        seconds: posSeconds,
        startedAt: Date.now(),
      });

      await TrackPlayer.seekTo(posSeconds);
    } catch (error) {
      if (seekRequestId === seekRequestIdRef.current) {
        setSeekOverride(null);
      }
    }
  }, [currentSong, effectiveTrackDurationSeconds, isPlayerReady, previewDuration]);

  const toggleShuffle = useCallback(async () => {
    const applyShuffleState = (nextShuffleState: boolean) => {
      const currentQueue = [...queueRef.current];
      const currentIndex = queueIndexRef.current;
      const currentSongItem = currentQueue[currentIndex];
      if (!currentSongItem) return null;

      const nextQueue = nextShuffleState
        ? (() => {
            const rest = currentQueue.filter((_, i) => i !== currentIndex);
            for (let i = rest.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [rest[i], rest[j]] = [rest[j], rest[i]];
            }
            return [currentSongItem, ...rest];
          })()
        : (originalQueueRef.current.length > 0 ? originalQueueRef.current : currentQueue);

      const nextIndex = nextShuffleState
        ? 0
        : Math.max(0, nextQueue.findIndex((song) => song.id === currentSongItem.id));

      // Update refs first for immediate consistency
      isShuffledRef.current = nextShuffleState;
      queueRef.current = nextQueue;
      queueIndexRef.current = nextIndex;
      // react-doctor-disable-next-line react-doctor/no-impure-state-updater
      setIsShuffled(nextShuffleState);
      setQueue(nextQueue);
      setQueueIndex(nextIndex);
      clearUserQueuedSongIds();
      return { currentSongItem, nextQueue, nextIndex };
    };

    if (!TrackPlayer || !setupPlayer) {
      if (canUseLightweightAudioFallback) {
        applyShuffleState(!isShuffledRef.current);
      }
      return;
    }

    await runSerializedPlaybackSwitch(async () => {
      const applied = applyShuffleState(!isShuffledRef.current);
      if (!applied) return;
      const { currentSongItem, nextQueue } = applied;
      if (!isPlayerReady) return;

      const validSongs = mapFilter(nextQueue, normalizePlayableSong, (item): item is Song => Boolean(item));
      if (validSongs.length === 0) return;

      const nativeIndex = Math.max(0, validSongs.findIndex((song) => song.id === currentSongItem.id));
      await rebuildNativeQueue(
        validSongs.map((song) => songToTrack(song)),
        nativeIndex,
        resolvedIsPlaying
      );
    });
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- queueRef and related refs are stable; all reactive deps listed
  }, [clearUserQueuedSongIds, isPlayerReady, resolvedIsPlaying, runSerializedPlaybackSwitch]);

  const toggleRepeat = useCallback(async () => {
    if (!TrackPlayer || !setupPlayer) {
      if (canUseLightweightAudioFallback) {
        const next = previewRepeatMode === "off" ? "all" : previewRepeatMode === "all" ? "one" : "off";
        setPreviewRepeatMode(next);
        previewRepeatModeRef.current = next;
      }
      return;
    }
    if (!isPlayerReady) {
      return;
    }
    const next = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    repeatModeRef.current = next;
    
    if (RepeatMode) {
      const repeatMap = {
        "off": RepeatMode.Off,
        "all": RepeatMode.Queue,
        "one": RepeatMode.Track,
      };
      TrackPlayer.setRepeatMode(repeatMap[next]).catch(() => {});
    }
    setRepeatMode(next);
  }, [isPlayerReady, repeatMode, previewRepeatMode]);

  const toggleLike = useCallback(async (song: Song) => {
    if (!authUser?.id) {
      showPlaybackNotice("Sign in to save liked songs to your account.");
      return;
    }

    const isCurrentlyLiked = likedSongIds.includes(song.id);
    
    try {
      if (isCurrentlyLiked) {
        setLikedSongIds(prev => prev.filter(id => id !== song.id));
        setLikedSongs(prev => prev.filter(s => s.id !== song.id));
        await removeLikedSongFromFirestore(authUser.id, song.id);
      } else {
        setLikedSongIds(prev => [song.id, ...prev]);
        setLikedSongs(prev => [song, ...prev]);
        await addLikedSongToFirestore(authUser.id, song);
      }
    } catch (error) {
      logger.warn("[Player] Failed to sync liked song", { songId: song.id, error });
      if (isCurrentlyLiked) {
        setLikedSongIds(prev => prev.includes(song.id) ? prev : [song.id, ...prev]);
        setLikedSongs(prev => prev.some((s) => s.id === song.id) ? prev : [song, ...prev]);
      } else {
        setLikedSongIds(prev => prev.filter(id => id !== song.id));
        setLikedSongs(prev => prev.filter(s => s.id !== song.id));
      }
      showPlaybackNotice("Could not update liked songs. Please try again.");
    }
  }, [authUser?.id, likedSongIds, showPlaybackNotice]);

  const isLiked = useCallback((songId: string) => likedSongIds.includes(songId), [likedSongIds]);

  const addToQueue = useCallback(async (song: Song) => {
    try {
      const normalizedSong = normalizePlayableSong(song);
      if (!normalizedSong) {
        return;
      }

      if (!isPlayerReady) {
        return;
      }
      const currentQueue = queueRef.current;
      const ci = queueIndexRef.current;
      const insertIndex = Math.max(
        0,
        Math.min(ci + 1 + userQueuedSongIdsRef.current.length, currentQueue.length)
      );
      const next = [...currentQueue];
      next.splice(insertIndex, 0, normalizedSong);
      setQueue(next);
      queueRef.current = next;
      appendUserQueuedSongId(normalizedSong.id);
      await TrackPlayer.add(songToTrack(normalizedSong), insertIndex);
    } catch (error) {
      // Silent fail
    }
  }, [appendUserQueuedSongId, isPlayerReady]);

  const playNext = useCallback(async (song: Song) => {
    try {
      const normalizedSong = normalizePlayableSong(song);
      if (!normalizedSong) {
        return;
      }

      if (!isPlayerReady) {
        return;
      }
      const currentQueue = queueRef.current;
      const ci = queueIndexRef.current;
      const insertIndex = Math.max(0, Math.min(ci + 1, currentQueue.length));
      const next = [...currentQueue];
      next.splice(insertIndex, 0, normalizedSong);
      setQueue(next);
      queueRef.current = next;
      prependUserQueuedSongId(normalizedSong.id);

      const canInsertNative =
        currentQueue.length === 0 ||
        (ci >= 0 && ci < currentQueue.length && await nativeQueueHasTrackAt(ci, currentQueue[ci].id));

      if (canInsertNative) {
        await TrackPlayer.add(songToTrack(normalizedSong), insertIndex);
        return;
      }

      const activeSongId = currentQueue[ci]?.id ?? currentSongRef.current?.id ?? normalizedSong.id;
      const validSongs = mapFilter(next, normalizePlayableSong, (item): item is Song => Boolean(item));
      const activeIndex = Math.max(0, validSongs.findIndex((song) => song.id === activeSongId));
      await rebuildNativeQueue(
        validSongs.map((song) => songToTrack(song)),
        activeIndex,
        resolvedIsPlaying
      );
    } catch (error) {
      setPlaybackIntent(null);
      // Silent fail
    }
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- queueRef/related refs are stable; all reactive deps listed
  }, [isPlayerReady, nativeQueueHasTrackAt, prependUserQueuedSongId, resolvedIsPlaying]);

  const removeFromQueue = useCallback(async (index: number) => {
    try {
      if (!isPlayerReady) {
        return;
      }
      const currentQueue = queueRef.current;
      const removedSong = currentQueue[index];
      if (!removedSong) return;

      const currentIndex = queueIndexRef.current;
      const userQueueStartIndex = currentIndex + 1;
      const userQueueEndIndex = userQueueStartIndex + userQueuedSongIdsRef.current.length;
      const removesUserQueuedSong = index >= userQueueStartIndex && index < userQueueEndIndex;
      const next = currentQueue.filter((_, i) => i !== index);
      let nextIndex = currentIndex;
      if (index < currentIndex) {
        nextIndex = currentIndex - 1;
      } else if (index === currentIndex) {
        nextIndex = Math.min(currentIndex, Math.max(0, next.length - 1));
      }

      setQueue(next);
      queueRef.current = next;
      setSourceQueue(next);
      if (removesUserQueuedSong) {
        removeFirstUserQueuedSongId(removedSong.id);
      }
      setQueueIndex(nextIndex);
      queueIndexRef.current = nextIndex;

      const nativeMatchesRemoved = await nativeQueueHasTrackAt(index, removedSong.id);
      const removesActiveTrack = index === currentIndex;
      if (nativeMatchesRemoved && !removesActiveTrack) {
        await TrackPlayer.remove(index);
        return;
      }

      const validSongs = mapFilter(next, normalizePlayableSong, (item): item is Song => Boolean(item));
      if (validSongs.length > 0) {
        const activeSongId = next[nextIndex]?.id ?? validSongs[0].id;
        const nativeActiveIndex = Math.max(0, validSongs.findIndex((song) => song.id === activeSongId));
        await rebuildNativeQueue(
          validSongs.map((song) => songToTrack(song)),
          nativeActiveIndex,
          resolvedIsPlaying
        );
      } else {
        await TrackPlayer.reset();
      }
    } catch (error) {
      // Silent fail
    }
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- queueRef/related refs are stable; all reactive deps listed
  }, [isPlayerReady, nativeQueueHasTrackAt, removeFirstUserQueuedSongId, resolvedIsPlaying]);

  const reorderQueue = useCallback(async (fromIndex: number, toIndex: number) => {
    try {
      if (fromIndex === toIndex) return;
      const currentQueue = queueRef.current;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentQueue.length ||
        toIndex >= currentQueue.length
      ) {
        return;
      }

      const nextQueue = [...currentQueue];
      const [movedSong] = nextQueue.splice(fromIndex, 1);
      if (!movedSong) return;
      nextQueue.splice(toIndex, 0, movedSong);

      const currentQueueIndex = queueIndexRef.current;
      let nextQueueIndex = currentQueueIndex;
      if (currentQueueIndex === fromIndex) {
        nextQueueIndex = toIndex;
      } else if (fromIndex < currentQueueIndex && toIndex >= currentQueueIndex) {
        nextQueueIndex = currentQueueIndex - 1;
      } else if (fromIndex > currentQueueIndex && toIndex <= currentQueueIndex) {
        nextQueueIndex = currentQueueIndex + 1;
      }

      setQueue(nextQueue);
      queueRef.current = nextQueue;
      setSourceQueue(nextQueue);

      if (nextQueueIndex !== currentQueueIndex) {
        setQueueIndex(nextQueueIndex);
        queueIndexRef.current = nextQueueIndex;
      }

      if (!isPlayerReady) return;

      if (typeof TrackPlayer.move === "function") {
        await TrackPlayer.move(fromIndex, toIndex);
        return;
      }

      // Fallback when move API is unavailable.
      const validSongs = nextQueue.filter(isPlayableSong);
      if (validSongs.length === 0) return;

      const activeSongId = nextQueue[nextQueueIndex]?.id ?? currentSong?.id ?? validSongs[0].id;
      await TrackPlayer.reset();
      await TrackPlayer.add(validSongs.map((song) => songToTrack(song)));
      const activeIndex = validSongs.findIndex((song) => song.id === activeSongId);
      const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;
      await TrackPlayer.skip(safeActiveIndex);
      await publishNativeNowPlaying(validSongs[safeActiveIndex], safeActiveIndex);
      if (isPlaying) {
        await TrackPlayer.play();
      }
    } catch (error) {
      // Silent fail
    }
  }, [currentSong?.id, isPlayerReady, isPlaying]);

  const clearQueue = useCallback(async () => {
    try {
      if (!isPlayerReady) {
        return;
      }
      const cs = normalizePlayableSong(currentSong);
      if (cs) {
        setQueue([cs]);
        queueRef.current = [cs];
        clearUserQueuedSongIds();
        setQueueIndex(0);
        queueIndexRef.current = 0;
        await rebuildNativeQueue([songToTrack(cs)], 0, false);
      }
    } catch (error) {
      // Silent fail
    }
  }, [clearUserQueuedSongIds, currentSong, isPlayerReady]);

  const shuffleQueue = useCallback(async () => {
    try {
      const currentQueue = queueRef.current;
      if (currentQueue.length <= 1) {
        return;
      }
      const ci = queueIndexRef.current;
      const upcoming = currentQueue.slice(ci + 1);
      for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
      }
      const newQ = [...currentQueue.slice(0, ci + 1), ...upcoming];
      setQueue(newQ);
      queueRef.current = newQ;
      clearUserQueuedSongIds();
      setIsShuffled(true);
      isShuffledRef.current = true;
      if (!isPlayerReady) {
        return;
      }
      
      await TrackPlayer.reset();
      
      const validSongs = mapFilter(newQ, normalizePlayableSong, (item): item is Song => Boolean(item));
      if (validSongs.length === 0) return;
      await TrackPlayer.add(validSongs.map((song) => songToTrack(song)));
      
      const currentSongId = newQ[ci]?.id;
      const validIndex = validSongs.findIndex(s => s.id === currentSongId);
      const safeValidIndex = validIndex >= 0 ? validIndex : 0;
      await TrackPlayer.skip(safeValidIndex);
      await publishNativeNowPlaying(validSongs[safeValidIndex], safeValidIndex);
      if (resolvedIsPlaying) {
        await TrackPlayer.play();
      }
    } catch (error) {
      // Silent fail
    }
  },
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- refs are stable and resolvedIsPlaying is the only reactive playback state read by this callback.
  [clearUserQueuedSongIds, isPlayerReady, resolvedIsPlaying]);

  const value = useMemo(() => ({
    currentSong, queue, userQueuedSongIds, sourceQueue, queueIndex, isPlaying: resolvedIsPlaying, progress: resolvedProgress, duration: resolvedDuration, positionMillis: resolvedPositionMillis,
    isShuffled: resolvedIsShuffled, repeatMode: resolvedRepeatMode, likedSongIds, likedSongs, isLoading: playbackLoading, albumColor, textColor, sleepTimer,
    playSong, togglePlay, nextSong, prevSong, seekTo, toggleShuffle, toggleRepeat,
    toggleLike, isLiked, addToQueue, playNext, removeFromQueue, reorderQueue, clearQueue, shuffleQueue,
    setSleepTimer, clearSleepTimer, setAlbumColor, setTextColor,
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- resolved values already capture native and preview state; backing state would not change this public value.
  }), [currentSong, queue, userQueuedSongIds, sourceQueue, queueIndex, resolvedIsPlaying, resolvedProgress, resolvedDuration, resolvedPositionMillis,
    resolvedIsShuffled, resolvedRepeatMode, likedSongIds, likedSongs, playbackLoading, albumColor, textColor, sleepTimer, playSong, togglePlay, nextSong,
    prevSong, seekTo, toggleShuffle, toggleRepeat, toggleLike, isLiked, addToQueue,
    playNext, removeFromQueue, reorderQueue, clearQueue, shuffleQueue, setSleepTimer, clearSleepTimer]);

  const liteValue = useMemo(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      isPlaying: resolvedIsPlaying,
      isShuffled: resolvedIsShuffled,
      repeatMode: resolvedRepeatMode,
      likedSongIds,
      likedSongs,
      isLoading: playbackLoading,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      togglePlay,
      nextSong,
      prevSong,
      seekTo,
      toggleShuffle,
      toggleRepeat,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
      setSleepTimer,
      clearSleepTimer,
      setAlbumColor,
      setTextColor,
    }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- resolved values already capture native and preview state; backing state would not change this public value.
    [
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      resolvedIsPlaying,
      resolvedIsShuffled,
      resolvedRepeatMode,
      likedSongIds,
      likedSongs,
      playbackLoading,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      togglePlay,
      nextSong,
      prevSong,
      seekTo,
      toggleShuffle,
      toggleRepeat,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
      setSleepTimer,
      clearSleepTimer,
      setAlbumColor,
      setTextColor,
    ]
  );

  const progressValue = useMemo(
    () => ({
      progress: resolvedProgress,
      duration: resolvedDuration,
      positionMillis: resolvedPositionMillis,
    }),
    [resolvedProgress, resolvedDuration, resolvedPositionMillis]
  );

  const rowValue = useMemo(
    () => ({
      currentSongId: currentSong?.id || null,
      isPlaying: resolvedIsPlaying,
      playSong,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
    }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- resolvedIsPlaying is the public value; backing intent/native state is intentionally not exposed here.
    [currentSong?.id, resolvedIsPlaying, playSong, toggleLike, isLiked, addToQueue, playNext]
  );

  const browseValue = useMemo(
    () => ({
      currentSong,
      queue,
      isPlaying: resolvedIsPlaying,
      likedSongs,
      playSong,
      togglePlay,
      toggleLike,
    }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- resolvedIsPlaying is the public value; backing intent/native state is intentionally not exposed here.
    [currentSong, queue, resolvedIsPlaying, likedSongs, playSong, togglePlay, toggleLike]
  );

  const queueValue = useMemo(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      queueIndex,
      isShuffled: resolvedIsShuffled,
      sleepTimer,
      playSong,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
    }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- resolvedIsShuffled is the public value; backing preview/native state is intentionally not exposed here.
    [
      currentSong,
      queue,
      userQueuedSongIds,
      queueIndex,
      resolvedIsShuffled,
      sleepTimer,
      playSong,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
    ]
  );

  const actionsValue = useMemo(
    () => ({
      likedSongIds,
      likedSongs,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      togglePlay,
      nextSong,
      prevSong,
      seekTo,
      toggleShuffle,
      toggleRepeat,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
      setSleepTimer,
      clearSleepTimer,
      setAlbumColor,
      setTextColor,
    }),
    [
      likedSongIds,
      likedSongs,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      togglePlay,
      nextSong,
      prevSong,
      seekTo,
      toggleShuffle,
      toggleRepeat,
      toggleLike,
      isLiked,
      addToQueue,
      playNext,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
      setSleepTimer,
      clearSleepTimer,
      setAlbumColor,
      setTextColor,
    ]
  );

  const applyNewStreamingQuality = useCallback(async () => {
    if (!currentSongRef.current) return;
    if (isYouTubeSource(currentSongRef.current)) return;

    logger.debug("[Player] Applying new streaming quality...");

    const isPlaying = resolvedIsPlaying;
    let currentPosition = 0;
    if (TrackPlayer && setupPlayer) {
      try {
        const progress = await TrackPlayer.getProgress();
        currentPosition = progress.position;
      } catch {}
    }

    // Clear cached audioUrl so resolvePlaybackUrl re-picks quality from downloadUrl
    const cleanedQueue = queueRef.current.map((song) =>
      song.source === "jiosaavn" ? { ...song, audioUrl: "" } : song
    );
    const cleanedSong = { ...(cleanedQueue[queueIndexRef.current] ?? currentSongRef.current), audioUrl: "" };

    setQueue(cleanedQueue);
    queueRef.current = cleanedQueue;
    setCurrentSong(cleanedSong);
    currentSongRef.current = cleanedSong;

    try {
      if (isPlaying) {
        if (TrackPlayer && setupPlayer) {
          await TrackPlayer.reset().catch(() => {});
          await loadAndPlaySong(cleanedSong, cleanedQueue, queueIndexRef.current);
          if (currentPosition > 1) {
            await TrackPlayer.seekTo(currentPosition).catch(() => {});
          }
        } else {
          await playSong(cleanedSong, cleanedQueue);
        }
      } else if (TrackPlayer && setupPlayer) {
        // Rebuild native queue with fresh URLs resolved asynchronously
        await TrackPlayer.reset().catch(() => {});
        const entries = await resolveNativeTrackEntries(cleanedQueue);
        if (entries.length > 0) {
          await TrackPlayer.add(entries.map((e) => e.track));
          const idx = entries.findIndex((e) => e.song.id === cleanedSong.id);
          const safeIdx = idx >= 0 ? idx : 0;
          await TrackPlayer.skip(safeIdx).catch(() => {});
          await publishNativeNowPlaying(entries[safeIdx].track, safeIdx);
          await TrackPlayer.pause().catch(() => {});
        }
      }
    } catch (err) {
      logger.error("[Player] Failed to apply new streaming quality:", err);
    }
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- queueRef/currentSongRef are stable; all reactive deps listed
  }, [loadAndPlaySong, playSong, resolvedIsPlaying]);

  const applyNewStreamingQualityRef = useRef(applyNewStreamingQuality);
  useEffect(() => {
    applyNewStreamingQualityRef.current = applyNewStreamingQuality;
  }, [applyNewStreamingQuality]);

  const previousQualityRef = useRef<string | null>(null);
  const qualityApplyInProgressRef = useRef(false);

  useEffect(() => {
    void Storage.getSettings().then((s) => {
      previousQualityRef.current = s.streamingQuality;
    });

    const unsubscribe = Storage.addSettingsListener((newSettings) => {
      const nextQuality = newSettings.streamingQuality;
      if (
        previousQualityRef.current &&
        previousQualityRef.current !== nextQuality &&
        !qualityApplyInProgressRef.current
      ) {
        previousQualityRef.current = nextQuality;
        qualityApplyInProgressRef.current = true;
        void applyNewStreamingQualityRef.current().finally(() => {
          qualityApplyInProgressRef.current = false;
        });
      } else {
        previousQualityRef.current = nextQuality;
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <PlayerContext.Provider value={value}>
      <PlayerLiteContext.Provider value={liteValue}>
        <PlayerProgressContext.Provider value={progressValue}>
          <PlayerActionsContext.Provider value={actionsValue}>
            <PlayerBrowseContext.Provider value={browseValue}>
              <PlayerQueueContext.Provider value={queueValue}>
                <PlayerRowContext.Provider value={rowValue}>
                  <View style={{ flex: 1 }}>
                    {children}
                  </View>
                </PlayerRowContext.Provider>
              </PlayerQueueContext.Provider>
            </PlayerBrowseContext.Provider>
          </PlayerActionsContext.Provider>
        </PlayerProgressContext.Provider>
      </PlayerLiteContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayerProgress() {
  const ctx = use(PlayerProgressContext);
  if (!ctx) throw new Error("usePlayerProgress must be used within PlayerProvider");
  return ctx;
}

export function useOptionalPlayerProgress() {
  return use(PlayerProgressContext);
}

export function usePlayerActions() {
  const ctx = use(PlayerActionsContext);
  if (!ctx) throw new Error("usePlayerActions must be used within PlayerProvider");
  return ctx;
}

export function useOptionalPlayerActions() {
  return use(PlayerActionsContext);
}

export function usePlayerRow() {
  const ctx = use(PlayerRowContext);
  if (!ctx) throw new Error("usePlayerRow must be used within PlayerProvider");
  return ctx;
}

export function usePlayerRowActions() {
  return usePlayerRow();
}

export function usePlayerBrowse() {
  const ctx = use(PlayerBrowseContext);
  if (!ctx) throw new Error("usePlayerBrowse must be used within PlayerProvider");
  return ctx;
}
