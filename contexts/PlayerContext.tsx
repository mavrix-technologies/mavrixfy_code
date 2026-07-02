import React, { createContext, use, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Alert, AppState, DeviceEventEmitter, InteractionManager, NativeModules, Platform, ToastAndroid, useWindowDimensions } from "react-native";
import { isRunningInExpoGo } from "expo";
import * as Network from "expo-network";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { getCatalogSongs } from "@/lib/catalogService";
import { useAuth } from "@/contexts/AuthContext";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";
import * as ExpoAvPlayer from "@/lib/expoAvPlayer";
import {
  getYouTubeAudioStreamForPlayback,
  reportYouTubeMusicPlaybackFailure,
} from "@/lib/youtubeMusicService";
import { prefetchNextSongs, shouldPrefetch, clearPrefetchCache } from "@/lib/prefetchQueue";
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

type AndroidAutoMediaModule = {
  publishBrowseState?: (stateJson: string) => void;
  clearBrowseState?: () => void;
};

const AndroidAutoMedia: AndroidAutoMediaModule | null =
  Platform.OS === "android"
    ? (NativeModules.MavrixfyAutoMedia as AndroidAutoMediaModule | undefined) ?? null
    : null;

const cleanupNativeSubscription = (subscription: NativeSubscription | null | undefined) => {
  subscription?.remove();
};

const subscribeTrackPlayerEvent = (eventName: unknown, listener: (...args: any[]) => void) => {
  const subscription = TrackPlayer.addEventListener(eventName, listener) as NativeSubscription;
  return () => cleanupNativeSubscription(subscription);
};

const isExpoGoRuntime = isRunningInExpoGo();
// Production/dev builds prefer the native TrackPlayer module on both iOS and Android.
// If that native module is unavailable at runtime, use expo-audio as a native fallback.
const isNativeTrackPlayerAvailable = Platform.OS !== "web" && !isExpoGoRuntime;
const canUseLightweightAudioFallback = Platform.OS !== "web";
const shouldEagerlySetupNativePlayer = false;
const nativePlayerUnavailableMessage = isExpoGoRuntime
  ? "Use the development build or installed APK. Expo Go does not include the native music player."
  : "Native music player is not available in this runtime.";

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
    logger.error("[Player] Failed to load native TrackPlayer module", error);
  }
}

export type SleepTimerSelection = 5 | 10 | 15 | 30 | 45 | 60 | "end-of-stack";

export interface SleepTimerState {
  mode: "duration" | "end-of-stack";
  label: string;
  endsAt: number | null;
}

export type YoutubePlayerFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
    // Some sources store duration as milliseconds.
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
    if (
      host.includes("googlevideo.com") ||
      path.includes("/videoplayback") ||
      path.includes("/stream/media/") ||
      path.includes("/stream/")
    ) {
      return true;
    }
    return /\.(?:mp3|m4a|mp4|aac|opus|ogg|wav|flac)(?:$|[?#])/i.test(path);
  } catch {
    return url.startsWith("file://");
  }
}

function readDownloadAudioUrl(value: unknown): string {
  if (typeof value === "string") return readAudioCandidate(value);

  if (Array.isArray(value)) {
    const qualityMap = new Map<string, any>();
    for (const item of value) {
      if (item && typeof item === "object") {
        qualityMap.set(String((item as any).quality || "").toLowerCase(), item);
      }
    }
    const preferredQualities = ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"];
    for (const quality of preferredQualities) {
      const match = qualityMap.get(quality);
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

function isYouTubeSource(song: Song | null | undefined): boolean {
  return Boolean(
    song &&
      (song.source === "youtube" ||
        song.id?.startsWith("youtube_") ||
        song.id?.startsWith("yt:") ||
        song.youtubeVideoId)
  );
}

function extractYouTubeVideoId(song: Song | null | undefined): string {
  if (!song) return "";
  
  // Priority 1: Direct video ID fields
  if (song.youtubeVideoId) return song.youtubeVideoId;
  if (song.videoId) return song.videoId;
  
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

function normalizePlayableSong(song: Song | null | undefined): Song | null {
  if (!song?.id) return null;

  // YouTube stream URLs are short-lived. Keep only the video ID in app state;
  // resolve a fresh backend URL at the moment playback starts.
  if (isYouTubeSource(song)) {
    const videoId = extractYouTubeVideoId(song);
    if (!videoId) {
      logger.warn("[Normalize] YouTube song missing video ID", { id: song.id, title: song.title });
      return null;
    }
    return {
      ...song,
      audioUrl: "",
      playbackHeaders: undefined,
      youtubeNativeAudio: false,
      youtubeAudioExpiresAt: undefined,
      youtubeVideoId: videoId,
      source: "youtube",
    };
  }

  // For native audio, must have resolvable audioUrl
  const resolvedAudioUrl = resolveAudioUrl(song as SongPlaybackSource);
  if (!resolvedAudioUrl) {
    logger.warn("[Normalize] Native song missing audio URL", { id: song.id, title: song.title });
    return null;
  }

  if (song.audioUrl === resolvedAudioUrl) {
    return song;
  }

  return {
    ...song,
    audioUrl: resolvedAudioUrl,
  };
}



const SINGLE_SONG_AUTOPLAY_MIN_SIZE = 6;
const SINGLE_SONG_AUTOPLAY_TARGET_SIZE = 18;
const SINGLE_SONG_AUTOPLAY_LOOKUP_TIMEOUT_MS = 900;
const YOUTUBE_NATIVE_STREAM_TIMEOUT_MS = 15000;
const YOUTUBE_UPCOMING_NATIVE_PRELOAD_SIZE = 3;
const RESOLVED_NATIVE_AUDIO_TTL_MS = 55 * 60 * 1000;

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

function createPlaybackTimeoutSignal(ms: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

async function getRecentSongCandidates(): Promise<Song[]> {
  const items = await Storage.getRecentlyPlayed().catch(() => []);
  return mapFilter(
    items,
    (item) => (item.type === "song" && item.data ? sanitizeSongForStorage(item.data as Song) : null),
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

async function resolveYouTubeTrackForNativePlayback(song: Song): Promise<Song | null> {
  const videoId = extractYouTubeVideoId(song);
  if (!videoId) return null;

  const timeout = createPlaybackTimeoutSignal(YOUTUBE_NATIVE_STREAM_TIMEOUT_MS);

  try {
    const stream = await getYouTubeAudioStreamForPlayback(videoId, timeout.signal);

    logger.info(`[NativeResolve] Got stream response for ${videoId}`, {
      hasStream: !!stream,
      hasUrl: !!stream?.url,
      url: stream?.url,
      urlTrusted: stream?.url ? isTrustedNativeAudioUrl(stream.url) : false,
    });

    if (stream?.url && isTrustedNativeAudioUrl(stream.url)) {
      logger.info(`[NativeResolve] Stream resolved for ${videoId} - URL: ${stream.url}`);
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
    }
  } catch (err) {
    logger.warn("[NativeResolve] Stream request failed", { videoId, error: err });
  } finally {
    timeout.cleanup();
  }

  logger.error("[NativeResolve] Could not resolve YouTube stream", { videoId, songId: song.id });
  return null;
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
    nextQueue[index] = isYouTubeSource(entry.song)
      ? { ...existing, ...stripTransientYouTubeAudioUrl(entry.song), audioUrl: "" }
      : { ...existing, ...entry.song, audioUrl: resolvedUrl };
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

function sanitizeSongForStorage(song: Song): Song {
  return isYouTubeSource(song) ? stripTransientYouTubeAudioUrl(song) : song;
}

function sanitizeQueueForStorage(queue: Song[]): Song[] {
  return queue.map(sanitizeSongForStorage);
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
  const album = cleanAndroidAutoText(song.album);
  
  const track = {
    id: song.id,
    url: audioUrl,
    title: cleanAndroidAutoTitle(song.title, album) || song.title,
    artist: cleanAndroidAutoText(song.artist) || song.artist,
    album,
    genre: cleanAndroidAutoText(song.genre),
    artwork: song.coverUrl,
    duration: durationSeconds,
    type: 'default', // Explicitly set track type for TrackPlayer
    ...(song.playbackHeaders && Object.keys(song.playbackHeaders).length > 0
      ? { headers: song.playbackHeaders }
      : {}),
  };
  
  logger.info('[songToTrack] Created track', {
    id: track.id,
    url: track.url,
    hasHeaders: !!track.headers,
    headers: track.headers,
    duration: track.duration,
    source: song.source,
  });
  
  return track;
}

type NativeTrackEntry = {
  song: Song;
  track: any;
  appIndex: number;
};

async function resolveNativeTrackEntry(song: Song, appIndex: number): Promise<NativeTrackEntry | null> {
  const nativeSong = isYouTubeSource(song)
    ? await resolveYouTubeTrackForNativePlayback(stripTransientYouTubeAudioUrl(song))
    : song;
  if (!nativeSong) return null;

  const audioUrl = isYouTubeSource(nativeSong)
    ? resolveAudioUrl(nativeSong as SongPlaybackSource)
    : await resolvePlaybackUrl(nativeSong);
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

  const entries: NativeTrackEntry[] = [];
  settled.forEach((result, index) => {
    const song = songs[index];
    const appIndex = startIndex + index;

    if (result.status === "rejected") {
      if (isYouTubeSource(song)) {
        logger.warn("[NativeResolve] Skipping unresolved YouTube track", {
          songId: song?.id,
          title: song?.title,
          appIndex,
          error: result.reason,
        });
      }
      return;
    }

    const entry = result.value;
    if (entry?.song?.id && readNonEmptyString(entry?.track?.url)) {
      entries.push(entry);
      return;
    }

    if (isYouTubeSource(song)) {
      logger.warn("[NativeResolve] Skipping YouTube track without playable stream", {
        songId: song?.id,
        title: song?.title,
        appIndex,
      });
    }
  });

  return entries;
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
  if (Platform.OS !== "ios" || !TrackPlayer) return;

  const metadata = getNowPlayingMetadata(track);

  // According to Apple's MPNowPlayingInfoCenter documentation and react-native-track-player best practices:
  // 1. Update metadata synchronously when track changes
  // 2. Let autoUpdateMetadata handle routine updates
  // 3. Only manual update when autoUpdateMetadata doesn't cover the case (remote controls, manual skips)
  
  try {
    // Update the specific track in the queue (preferred method per RNTP docs)
    if (
      typeof trackIndex === "number" &&
      trackIndex >= 0 &&
      typeof TrackPlayer.updateMetadataForTrack === "function"
    ) {
      await TrackPlayer.updateMetadataForTrack(trackIndex, metadata);
    }
  } catch {
    // The active queue can change while the user is skipping quickly.
  }

  try {
    // Update the current now playing info (required for immediate lock screen update)
    // This is the official Apple MPNowPlayingInfoCenter pattern via RNTP
    if (typeof TrackPlayer.updateNowPlayingMetadata === "function") {
      await TrackPlayer.updateNowPlayingMetadata(metadata);
    }
  } catch {
    // iOS will still fall back to RNTP's automatic metadata publishing.
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
      return "medium";
    }
  } catch (e) {
    logger.error("[Player] Failed to determine adaptive streaming quality", e);
  }
  return "high";
}

async function getVideoBackgroundQuality() {
  return "auto";
}

/** Resolve the best playback URL for a song — local file first, then stream. */
async function resolvePlaybackUrl(song: Song): Promise<string | null> {
  try {
    const isYt = isYouTubeSource(song);
    if (isYt) {
      const resolved = await resolveYouTubeTrackForNativePlayback(stripTransientYouTubeAudioUrl(song));
      return resolved?.audioUrl || null;
    }

    // Static import path — dynamic import can fail silently in some contexts
    const { getLocalPlaybackUrl } = await import("@/lib/downloads/downloadManager");
    const local = await getLocalPlaybackUrl(song.id);
    if (local) {
      // Ensure the URI has the file:// scheme — RNTP requires it on both platforms
      if (local.startsWith("file://") || local.startsWith("http")) return local;
      return `file://${local}`;
    }
  } catch {
    // downloads module not available — fall through to stream
  }

  if (song.downloadUrl) {
    try {
      const { getBestAudioUrlWithQuality } = await import("@/lib/musicData");
      const targetQuality = await getAdaptiveStreamingQuality();
      const resolvedUrl = getBestAudioUrlWithQuality(song.downloadUrl, targetQuality);
      const playableUrl = readAudioCandidate(resolvedUrl);
      if (playableUrl) return playableUrl;
    } catch (e) {
      logger.error("[Player] Failed to resolve quality-specific audio URL:", e);
    }
  }

  return resolveAudioUrl(song as SongPlaybackSource) || null;
}

function isPlayableSong(song: Song | null | undefined): song is Song {
  return Boolean(song?.id && (isYouTubeSource(song) || resolveAudioUrl(song as SongPlaybackSource)));
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function cleanAndroidAutoText(value: unknown): string {
  return decodeBasicHtmlEntities(readNonEmptyString(value)).replace(/\s+/g, " ").trim();
}

function cleanAndroidAutoTitle(title: unknown, album: unknown): string {
  const decodedTitle = cleanAndroidAutoText(title);
  if (!decodedTitle) return "";

  const decodedAlbum = cleanAndroidAutoText(album);
  if (!decodedAlbum) return decodedTitle;

  const withoutFromSuffix = decodedTitle
    .replace(/\s*\((?:from|movie|film)\s+["']?[^)]*["']?\)\s*$/i, "")
    .replace(/\s*-\s*(?:from|movie|film)\s+["']?.*["']?\s*$/i, "")
    .trim();

  return withoutFromSuffix.length >= 2 ? withoutFromSuffix : decodedTitle;
}

function songToAndroidAutoItem(song: Song | null | undefined) {
  if (!song?.id || !song.title) return null;

  const album = cleanAndroidAutoText(song.album);

  return {
    id: String(song.id),
    title: cleanAndroidAutoTitle(song.title, album) || "Unknown song",
    artist: cleanAndroidAutoText(song.artist) || "Mavrixfy",
    album,
    duration: Math.round(toDurationSeconds(song.duration)),
    artwork: readNonEmptyString(song.coverUrl),
  };
}

function uniqueAndroidAutoSongs(songs: Array<Song | null | undefined>, limit: number) {
  const seen = new Set<string>();
  const items: Array<NonNullable<ReturnType<typeof songToAndroidAutoItem>>> = [];

  for (const song of songs) {
    const item = songToAndroidAutoItem(song);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= limit) break;
  }

  return items;
}

function uniqueSongsById(songs: Array<Song | null | undefined>): Song[] {
  const seen = new Set<string>();
  const items: Song[] = [];

  for (const song of songs) {
    if (!song?.id || seen.has(song.id)) continue;
    seen.add(song.id);
    items.push(song);
  }

  return items;
}

function parseAndroidAutoPlayRequest(mediaId: string): { section: string; index: number; id: string } | null {
  const parts = mediaId.split("|");
  if (parts[0] !== "play" || parts.length < 4) return null;

  const index = Number(parts[2]);
  if (!Number.isFinite(index) || index < 0) return null;

  return {
    section: parts[1] || "",
    index,
    id: parts.slice(3).join("|"),
  };
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
const NATIVE_YOUTUBE_START_STALL_GRACE_MS = 28000;
const NATIVE_START_STALL_POSITION_SECONDS = 0.75;

function getNextQueueIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: "off" | "all" | "one"
): number | null {
  if (queueLength <= 0) return null;
  if (repeatMode === "one") {
    return Math.max(0, Math.min(currentIndex, queueLength - 1));
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex < queueLength) return nextIndex;
  return repeatMode === "all" ? 0 : null;
}


export function PlayerProvider(props: { children: ReactNode }) {
  return usePlayerProviderView(props);
}

function usePlayerProviderView({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const canUseNativePlayback = Boolean(TrackPlayer && setupPlayer);
  
  // Get auth context properly
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

  if (seekOverride && seekOverride.songId !== (currentSong?.id ? String(currentSong.id) : null)) {
    setSeekOverride(null);
  }
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);
  const previewIsPlayingRef = useRef(false); // ref so togglePlay never has stale closure
  const previewIsEndedRef = useRef(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [lastPreviewSongId, setLastPreviewSongId] = useState<string | null>(null);
  const currentSongIdStr = currentSong?.id ? String(currentSong.id) : null;
  if (currentSongIdStr !== lastPreviewSongId) {
    setLastPreviewSongId(currentSongIdStr);
    setPreviewProgress(0);
  }
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewIsShuffled, setPreviewIsShuffled] = useState(false);
  const [previewRepeatMode, setPreviewRepeatMode] = useState<"off" | "all" | "one">("off");
  const [runtimeProgressSnapshot, setRuntimeProgressSnapshot] = useState({
    position: 0,
    duration: 0,
  });
  const [lastProgressSongId, setLastProgressSongId] = useState<string | null>(null);
  const currentSongIdStrForProgress = currentSong?.id ? String(currentSong.id) : null;
  if (currentSongIdStrForProgress !== lastProgressSongId) {
    setLastProgressSongId(currentSongIdStrForProgress);
    const durationSeconds = toDurationSeconds(currentSong?.duration);
    setRuntimeProgressSnapshot({ position: 0, duration: durationSeconds });
  }
  const [runtimePlaybackStateSnapshot, setRuntimePlaybackStateSnapshot] = useState<any>(undefined);
  const PRELOAD_QUEUE_SIZE = 20;

  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const likedSongsRef = useRef<Song[]>([]);
  const userQueuedSongIdsRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const isShuffledRef = useRef(false);
  const previewRepeatModeRef = useRef<"off" | "all" | "one">("off");
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
  if (playbackSwitchChainRef.current === null) {
    playbackSwitchChainRef.current = Promise.resolve();
  }
  const nativeQueueAppIndicesRef = useRef<number[]>([]);
  const autoplayPrefetchInFlightRef = useRef<string | null>(null);
  const lastAutoplayPrefetchKeyRef = useRef<string | null>(null);
  const nativePlaybackRecoveryRef = useRef<{
    songId: string;
    attempts: number;
    lastAt: number;
  } | null>(null);
  const loadAndPlaySongRef = useRef<((song: Song, newQueue?: Song[], newIndex?: number) => Promise<void>) | null>(null);
  const retryYouTubePlaybackAfterFailureRef = useRef<((event: any) => Promise<boolean>) | null>(null);
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
      setQueueIndex(nextIndex);
      queueIndexRef.current = nextIndex;
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
      // Ignore errors — autoUpdateMetadata will provide fallback
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
    const savedCurrentSong = saved.currentSong ? sanitizeSongForStorage(saved.currentSong) : saved.currentSong;
    const savedQueue = sanitizeQueueForStorage(saved.queue || []);
    currentSongRef.current = savedCurrentSong;
    setCurrentSong(savedCurrentSong);
    setQueue(savedQueue);
    setSourceQueue(savedQueue);
    queueRef.current = savedQueue;
    originalQueueRef.current = savedQueue;
    setQueueIndex(saved.queueIndex);
    queueIndexRef.current = saved.queueIndex;
    restoredPositionSecondsRef.current = Math.max(0, saved.positionSeconds ?? 0);
    updatePlaybackEngineSnapshot({
      currentSong: savedCurrentSong,
      queue: savedQueue,
      sourceQueue: savedQueue,
      queueIndex: saved.queueIndex,
    });
  }, []);

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
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  }, [canUseLightweightAudioFallback]);

  const applyPreviewTrackAdvance = useCallback((nextIndex: number, nextTrack: Song) => {
    previewIsEndedRef.current = false;
    setQueueIndex(nextIndex);
    queueIndexRef.current = nextIndex;
    currentSongRef.current = nextTrack;
    setCurrentSong(nextTrack);
    consumeLeadingUserQueuedSongId(nextTrack.id);
    setPreviewProgress(0);
    setPreviewDuration(0);
  }, [consumeLeadingUserQueuedSongId]);

  const applyPlayerReadyState = useCallback((ready: boolean) => {
    setIsPlayerReady(ready);
  }, []);

  const applyLikedSongsState = useCallback((songs: Song[]) => {
    setLikedSongs(songs);
    setLikedSongIds(songs.map((song) => song.id));
  }, []);

  const clearLikedSongsState = useCallback(() => {
    setLikedSongIds([]);
    setLikedSongs([]);
  }, []);

  // ── Restore player state on mount (show mini player with last song) ────────
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
          // Fall back to saved app state when native playback state is unavailable.
        }
      }

      if (mounted && saved?.currentSong) {
        // Restore UI state
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
  const isPreviewSession = (canUseLightweightAudioFallback && !canUseNativePlayback && Boolean(currentSong));
  const resolvedProgress = isPreviewSession ? previewProgress : progress;
  const resolvedDuration = isPreviewSession
    ? (previewDuration > 0 ? previewDuration : currentSongDurationSeconds * 1000)
    : duration;
  const resolvedPositionMillis = isPreviewSession
    ? Math.round((previewDuration > 0 ? previewDuration : currentSongDurationSeconds * 1000) * previewProgress)
    : positionMillis;
  const resolvedIsShuffled = isPreviewSession ? previewIsShuffled : isShuffled;
  const resolvedRepeatMode = isPreviewSession ? previewRepeatMode : repeatMode;
  const runtimeIsPlaying =
    runtimePlaybackStateSnapshot === State.Playing ||
    runtimePlaybackStateSnapshot === State.Buffering ||
    runtimePlaybackStateSnapshot === State.Loading;
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

  useEffect(() => {
    if (playbackIntent === null || playbackIntent !== actualResolvedIsPlaying) {
      return;
    }

    const timeout = setTimeout(() => {
      setPlaybackIntent(null);
    }, 350);

    return () => {
      clearTimeout(timeout);
    };
  }, [actualResolvedIsPlaying, playbackIntent]);

  useEffect(() => {
    if (playbackIntent === null) {
      return;
    }

    if (playbackIntent && (playbackLoading || resolvedIsBuffering)) {
      return;
    }

    const timeout = setTimeout(() => {
      setPlaybackIntent(null);
    }, playbackIntent ? 8000 : 1800);

    return () => {
      clearTimeout(timeout);
    };
  }, [playbackIntent, playbackLoading, resolvedIsBuffering]);

  useEffect(() => {
    latestPositionSecondsRef.current = Math.max(0, effectivePositionSeconds);
  }, [effectivePositionSeconds]);

  useEffect(() => {
    const songId = currentSong?.id ? String(currentSong.id) : null;
    if (!songId || trackProgressSongIdRef.current === songId) return;
    resetProgressForTrackChange(songId);
  }, [currentSong?.id, resetProgressForTrackChange]);

  const persistCurrentPlayerState = useCallback(() => {
    const song = currentSongRef.current;
    if (!song) return;
    const storedSong = sanitizeSongForStorage(song);
    const storedQueue = sanitizeQueueForStorage(queueRef.current.length > 0 ? queueRef.current : [song]);

    void Storage.savePlayerState({
      currentSong: storedSong,
      queue: storedQueue,
      queueIndex: queueIndexRef.current,
      positionSeconds: latestPositionSecondsRef.current,
      updatedAt: Date.now(),
    });
  }, []);

  // ── Persist restored mini-player state without writing on every progress tick
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
        // App became active — refresh iOS lock screen metadata
        if (Platform.OS === "ios" && TrackPlayer && currentSongRef.current) {
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

  const scheduleNextTrackAfterFailure = useCallback((
    failedIndex: number,
    reason: string,
    notice = "Skipping unavailable song...",
    delayMs = 250
  ): boolean => {
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0 || !loadAndPlaySongRef.current) return false;

    const safeFailedIndex = Math.max(0, Math.min(failedIndex, currentQueue.length - 1));
    const failedSong = currentQueue[safeFailedIndex];
    const nextIndex = getNextQueueIndex(
      safeFailedIndex,
      currentQueue.length,
      repeatModeRef.current === "all" ? "all" : "off"
    );
    const nextTrack = nextIndex !== null ? currentQueue[nextIndex] : null;

    if (nextIndex === null || !nextTrack) return false;
    if (failedSong?.id && String(nextTrack.id) === String(failedSong.id) && currentQueue.length > 1) {
      return false;
    }

    logger.warn("[Player] Skipping failed track and advancing queue", {
      reason,
      failedIndex: safeFailedIndex,
      failedSongId: failedSong?.id,
      failedTitle: failedSong?.title,
      nextIndex,
      nextSongId: nextTrack.id,
      nextTitle: nextTrack.title,
    });

    if (notice) showPlaybackNotice(notice);
    setPlaybackIntent(true);
    setPlaybackLoading(true);
    setQueueIndex(nextIndex);
    queueIndexRef.current = nextIndex;
    currentSongRef.current = nextTrack;
    setCurrentSong(nextTrack);
    updatePlaybackEngineSnapshot({
      currentSong: nextTrack,
      queue: currentQueue,
      queueIndex: nextIndex,
      desiredPlayState: true,
      isPlaying: true,
      isLoading: true,
      isBuffering: false,
    });

    setTimeout(() => {
      const liveQueue = queueRef.current;
      const liveSong = liveQueue[nextIndex];
      if (liveSong?.id === nextTrack.id) {
        void loadAndPlaySongRef.current?.(liveSong, liveQueue, nextIndex);
        return;
      }

      const refreshedIndex = liveQueue.findIndex((item) => item.id === nextTrack.id);
      if (refreshedIndex >= 0) {
        void loadAndPlaySongRef.current?.(liveQueue[refreshedIndex], liveQueue, refreshedIndex);
      }
    }, delayMs);

    return true;
  }, [showPlaybackNotice]);

  useEffect(() => {
    const shouldWatchNativeStart =
      playbackIntent === true ||
      actualResolvedIsPlaying ||
      resolvedIsBuffering;

    if (
      Platform.OS === "web" ||
      !TrackPlayer ||
      !setupPlayer ||
      !currentSong?.id ||
      isPreviewSession ||
      playbackLoading ||
      !shouldWatchNativeStart
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

    const isCurrentYouTubeTrack = isYouTubeSource(currentSong);
    const stallGraceMs = isCurrentYouTubeTrack
      ? NATIVE_YOUTUBE_START_STALL_GRACE_MS
      : NATIVE_START_STALL_GRACE_MS;

    if (now - existing.startedAt < stallGraceMs || now - existing.lastAdvancedAt < stallGraceMs) {
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
      if (isCurrentYouTubeTrack) {
        const recovered = await retryYouTubePlaybackAfterFailureRef.current?.({
          code: "start_stall",
          message: "Playback started but audio position did not advance",
        });
        if (cancelled || recovered) return;

        const skipped = scheduleNextTrackAfterFailure(
          queueIndexRef.current,
          "youtube_start_stall",
          "This song is slow to start. Trying next...",
          0
        );
        if (skipped) {
          return;
        }
      }

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
  }, [
    actualResolvedIsPlaying,
    currentSong,
    currentSong?.id,
    effectivePositionSeconds,
    isPreviewSession,
    playbackLoading,
    playbackIntent,
    resolvedIsBuffering,
    scheduleNextTrackAfterFailure,
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

    if (!TrackPlayer || !setupPlayer) {
      if (canUseLightweightAudioFallback) {
        previewIsPlayingRef.current = false;
        setPreviewIsPlaying(false);
        ExpoAvPlayer.pause();
      }
      return;
    }

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

  useEffect(() => {
    return clearSleepTimerTimeout;
  }, [clearSleepTimerTimeout]);

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
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- cleanup intentionally resets mutable playback refs without treating ref.current as a render dependency.
  useEffect(() => {
    if (!canUseLightweightAudioFallback) return;
    let mounted = true;

    ExpoAvPlayer.onError((err) => {
      if (!mounted) return;
      logger.warn("[ExpoAudio] Playback error", err);
      showPlaybackNotice("Could not play this song.");
    });

    ExpoAvPlayer.onStatusUpdate(({ isPlaying, position, duration, didJustFinish }) => {
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
      clearPrefetchCache();
    };
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- cleanup deliberately writes the latest ref value when tearing down fallback playback.
  }, [applyPreviewPlaybackStatus, advancePreviewPlayback, canUseLightweightAudioFallback, showPlaybackNotice]);

  useEffect(() => {
    if (!TrackPlayer || !setupPlayer || !isPlayerReady || Platform.OS === "web") {
      return;
    }

    let mounted = true;
    // Only poll when app is in foreground — saves battery in background
    let appState = "active";
    const appStateSub = AppState.addEventListener(
      "change",
      async (next: string) => {
        const prev = appState;
        appState = next;
        // When app comes back to foreground, sync currentSong from TrackPlayer.
        // This handles the case where Android Auto changed the track while the
        // app was backgrounded — without this the home screen mini-player stays blank.
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
        const [runtimeProgress, activeTrack, activeTrackIndex, runtimePlaybackState, nativeQueue] = await Promise.all([
          TrackPlayer.getProgress(),
          TrackPlayer.getActiveTrack(),
          typeof TrackPlayer.getActiveTrackIndex === "function"
            ? TrackPlayer.getActiveTrackIndex()
            : Promise.resolve(undefined),
          TrackPlayer.getPlaybackState(),
          TrackPlayer.getQueue(),
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
          const activeTrackId = String(activeTrack?.id ?? "").trim();
          let currentQueue = queueRef.current;
          const mappedIndexById = activeTrackId
            ? currentQueue.findIndex((song) => String(song.id) === activeTrackId)
            : -1;
          const fallbackActiveIndex =
            typeof activeTrackIndex === "number" && Number.isFinite(activeTrackIndex) ? activeTrackIndex : -1;
          const nextQueueIndex = mappedIndexById >= 0 ? mappedIndexById : fallbackActiveIndex;

          if (currentQueue.length === 0 && Array.isArray(nativeQueue) && nativeQueue.length > 0) {
            const nativeSongs = mapFilter(nativeQueue, trackToSong, (song): song is Song => Boolean(song));
            if (nativeSongs.length > 0) {
              applyNativeQueueSnapshot(nativeSongs, nextQueueIndex >= 0 ? nextQueueIndex : 0);
              currentQueue = nativeSongs;
            }
          }

          applyRuntimeProgressAndState(nextPosition, nextDuration, nextPlaybackState);

          // 80% progress trigger: ask the backend for the next autoplay batch
          // and keep returned stream URLs only in the transient playback queue.
          if (shouldPrefetch(nextPosition, nextDuration)) {
            const activeSong = currentQueue[nextQueueIndex];
            const activePrefetchId = extractYouTubeVideoId(activeSong) || readNonEmptyString(activeSong?.id);
            const prefetchKey = activePrefetchId ? `${activePrefetchId}:${Math.round(nextDuration || 0)}` : "";

            if (
              prefetchKey &&
              autoplayPrefetchInFlightRef.current !== prefetchKey &&
              lastAutoplayPrefetchKeyRef.current !== prefetchKey
            ) {
              autoplayPrefetchInFlightRef.current = prefetchKey;
              void prefetchNextSongs(currentQueue, nextQueueIndex, 20).then((prefetchResult) => {
                if (!mounted) return;

                const normalizedRecommendations = mapFilter(
                  prefetchResult.songs,
                  (song) => normalizePlayableSong(song),
                  (song): song is Song => Boolean(song)
                );

                const updatedQueue = uniqueSongsById([
                  ...currentQueue.map(sanitizeSongForStorage),
                  ...normalizedRecommendations,
                ]);

                if (updatedQueue.length !== currentQueue.length) {
                  queueRef.current = updatedQueue;
                  originalQueueRef.current = updatedQueue;
                  setQueue(updatedQueue);
                  setSourceQueue(updatedQueue);
                  updatePlaybackEngineSnapshot({ queue: updatedQueue, sourceQueue: updatedQueue });
                }

                lastAutoplayPrefetchKeyRef.current = prefetchKey;
              }).catch((err) => {
                logger.warn("[Prefetch] Background autoplay prefetch failed", err);
              }).finally(() => {
                if (autoplayPrefetchInFlightRef.current === prefetchKey) {
                  autoplayPrefetchInFlightRef.current = null;
                }
              });
            }
          }

          if (nextQueueIndex >= 0 && nextQueueIndex < currentQueue.length) {
            applyNativeTrackIndex(nextQueueIndex, activeTrackId || null);
          }
        }
      } catch {
        // Silent runtime progress fallback failure
      }
    };

    void syncRuntimeProgress();
    const interval = setInterval(() => {
      // Only sync when app is active to save battery
      if (AppState.currentState === 'active') {
        void syncRuntimeProgress();
      }
    }, 2000); // Increased from 500-800ms to 2000ms to reduce battery drain

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [applyNativeQueueSnapshot, applyNativeTrackIndex, applyRuntimeProgressAndState, currentSong?.id, isPlayerReady]);

  useEffect(() => {
    let mounted = true;

    if (!shouldEagerlySetupNativePlayer) {
      return () => {
        mounted = false;
      };
    }

    const setup = async () => {
      if (!TrackPlayer || !setupPlayer) {
        logger.warn("[Player] Native TrackPlayer is unavailable in this runtime.");
        if (mounted) {
          applyPlayerReadyState(false);
        }
        return;
      }

      try {
        await setupPlayer();
        if (mounted) {
          applyPlayerReadyState(true);
        }
      } catch (error) {
        logger.error("[Player] TrackPlayer setup failed.", error);
        if (mounted) {
          applyPlayerReadyState(false);
        }
      }
    };
    
    const setupTask = InteractionManager.runAfterInteractions(() => {
      void setup();
    });

    return () => {
      mounted = false;
      setupTask.cancel?.();
    };
  }, [applyPlayerReadyState]);

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

  const retryYouTubePlaybackAfterFailure = useCallback(async (event: any): Promise<boolean> => {
    const failedSong = currentSongRef.current;
    if (!failedSong || !TrackPlayer || !setupPlayer || !isYouTubeSource(failedSong)) return false;

    const videoId = extractYouTubeVideoId(failedSong);
    if (!videoId) return false;

    const songId = String(failedSong.id || videoId);
    const previousRecovery = nativePlaybackRecoveryRef.current;
    const attempts =
      previousRecovery?.songId === songId && Date.now() - previousRecovery.lastAt < 30000
        ? previousRecovery.attempts + 1
        : 1;

    nativePlaybackRecoveryRef.current = {
      songId,
      attempts,
      lastAt: Date.now(),
    };

    if (attempts > 2) {
      logger.warn("[Player] YouTube playback recovery attempts exhausted", { songId, videoId });
      return false;
    }

    const message = readNonEmptyString(event?.message || event?.error || event?.code);
    await reportYouTubeMusicPlaybackFailure({
      videoId,
      code: readNonEmptyString(event?.code) || undefined,
      status: Number(event?.status) || (message.includes("403") ? 403 : undefined),
      message: message || "Native playback error",
      platform: Platform.OS,
    });

    try {
      setPlaybackLoading(true);
      updatePlaybackEngineSnapshot({ isLoading: true, isBuffering: true });

      const refreshedSong = await resolveYouTubeTrackForNativePlayback(stripTransientYouTubeAudioUrl(failedSong));
      if (!refreshedSong?.audioUrl) return false;

      const currentQueue: Song[] = queueRef.current.length > 0 ? queueRef.current : [failedSong];
      const activeIndex = Math.max(
        0,
        Math.min(
          queueIndexRef.current,
          Math.max(0, currentQueue.length - 1)
        )
      );
      const nextQueue: Song[] = currentQueue.map((song, index): Song =>
        index === activeIndex
          ? {
              ...song,
              ...refreshedSong,
              id: song.id,
              title: refreshedSong.title || song.title,
              artist: refreshedSong.artist || song.artist,
            }
          : song
      );
      const nextActiveSong = nextQueue[activeIndex];
      if (!nextActiveSong) return false;
      const preloadEnd = Math.min(nextQueue.length, activeIndex + PRELOAD_QUEUE_SIZE);
      const entries = await resolveNativeTrackEntries(nextQueue.slice(activeIndex, preloadEnd), activeIndex);
      const targetNativeIndex = entries.findIndex((entry) => entry.appIndex === activeIndex);
      if (targetNativeIndex < 0 || entries.length === 0) return false;

      queueRef.current = nextQueue;
      originalQueueRef.current = nextQueue;
      currentSongRef.current = nextActiveSong;
      setQueue(nextQueue);
      setSourceQueue(nextQueue);
      setCurrentSong(nextActiveSong);
      setQueueIndex(activeIndex);
      queueIndexRef.current = activeIndex;
      nativeQueueAppIndicesRef.current = entries.map((entry) => entry.appIndex);

      await rebuildNativeQueue(entries.map((entry) => entry.track), targetNativeIndex, true);

      setPlaybackIntent(true);
      setPlaybackLoading(false);
      setRuntimePlaybackStateSnapshot(State.Playing ?? "playing");
      updatePlaybackEngineSnapshot({
        currentSong: nextActiveSong,
        queue: nextQueue,
        sourceQueue: nextQueue,
        queueIndex: activeIndex,
        desiredPlayState: true,
        isLoading: false,
        isBuffering: false,
      });

      return true;
    } catch (error) {
      logger.warn("[Player] YouTube playback recovery failed", error);
      return false;
    } finally {
      setPlaybackLoading(false);
    }
  }, [PRELOAD_QUEUE_SIZE]);
  retryYouTubePlaybackAfterFailureRef.current = retryYouTubePlaybackAfterFailure;

  const handleNativePlaybackError = useCallback((event: any) => {
    logger.error("[Player] Native playback error", {
      event,
      code: event?.code,
      message: event?.message,
      type: event?.type,
      currentSong: currentSongRef.current?.id,
      currentSongTitle: currentSongRef.current?.title,
      audioUrl: currentSongRef.current?.audioUrl,
    });
    void retryYouTubePlaybackAfterFailure(event).then((recovered) => {
      if (recovered) return;

      const failedSong = currentSongRef.current;
      if (failedSong && isYouTubeSource(failedSong)) {
        const skipped = scheduleNextTrackAfterFailure(
          queueIndexRef.current,
          "youtube_playback_error",
          "Skipping unavailable song...",
          0
        );
        if (skipped) {
          return;
        }
      }

      setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");
      setPlaybackIntent(null);
      setPlaybackLoading(false);
      updatePlaybackEngineSnapshot({
        desiredPlayState: null,
        isPlaying: false,
        isLoading: false,
        isBuffering: false,
      });
      showPlaybackNotice("Playback stopped. Please try this song again.");
    });
  }, [retryYouTubePlaybackAfterFailure, scheduleNextTrackAfterFailure, showPlaybackNotice]);

  const handleNativeQueueEnded = useCallback(() => {
    const currentQueue = queueRef.current;
    const nextIndex = getNextQueueIndex(queueIndexRef.current, currentQueue.length, repeatModeRef.current);
    const nextTrack = nextIndex !== null ? currentQueue[nextIndex] : null;
    if (nextIndex !== null && nextTrack && loadAndPlaySongRef.current) {
      setPlaybackIntent(true);
      setPlaybackLoading(true);
      updatePlaybackEngineSnapshot({
        currentSong: nextTrack,
        queue: currentQueue,
        queueIndex: nextIndex,
        desiredPlayState: true,
        isPlaying: true,
        isLoading: true,
        isBuffering: false,
      });
      void loadAndPlaySongRef.current(nextTrack, currentQueue, nextIndex);
      return;
    }

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
    
    logger.info("[Player] State changed", {
      state: nextState,
      isPlaying: nextState === State.Playing,
      isPaused: nextState === State.Paused,
      isBuffering: nextState === State.Buffering,
      isLoading: nextState === State.Loading,
      currentSong: currentSongRef.current?.id,
    });
    
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
    if (isPlayerReady) return true;
    if (!TrackPlayer || !setupPlayer) {
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

  const appendRemainingTracksIfCurrent = useCallback((
    requestId: number,
    songs: Song[],
    startIndex: number,
    maxCount = PRELOAD_QUEUE_SIZE
  ) => {
    if (!TrackPlayer || songs.length === 0) return;
    const songsToAppend = songs.slice(0, Math.max(0, maxCount));
    if (songsToAppend.length === 0) return;

    void (async () => {
      const nextStartIndex = startIndex + songsToAppend.length;
      const scheduleNextYouTubeBatch = () => {
        if (maxCount !== YOUTUBE_UPCOMING_NATIVE_PRELOAD_SIZE) return;
        if (requestId !== playRequestIdRef.current) return;

        const liveQueue = queueRef.current;
        if (nextStartIndex >= liveQueue.length) return;

        setTimeout(() => {
          appendRemainingTracksIfCurrent(
            requestId,
            queueRef.current.slice(nextStartIndex),
            nextStartIndex,
            maxCount
          );
        }, 1200);
      };

      const resolvedEntries = await resolveNativeTrackEntries(songsToAppend, startIndex);
      if (requestId !== playRequestIdRef.current) return;
      if (resolvedEntries.length === 0) {
        scheduleNextYouTubeBatch();
        return;
      }

      await runSerializedPlaybackSwitch(async () => {
        if (requestId !== playRequestIdRef.current) return;

        const queuedAppIndices = new Set(nativeQueueAppIndicesRef.current);
        const entries = resolvedEntries.filter((entry) => !queuedAppIndices.has(entry.appIndex));
        if (entries.length === 0) return;

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
      });
      scheduleNextYouTubeBatch();
    })().catch((error) => {
      logger.warn("[Player] Background native queue append failed", {
        startIndex,
        count: songsToAppend.length,
        error,
      });
    });
  }, [runSerializedPlaybackSwitch]);

  const loadAndPlaySong = useCallback(async (song: Song, newQueue?: Song[], newIndex?: number) => {
    const requestId = ++playRequestIdRef.current;
    setPlaybackIntent(true);
    const playbackPlan = await buildPlaybackQueueForSong(song, newQueue);
    if (!playbackPlan || requestId !== playRequestIdRef.current) {
      if (!playbackPlan && requestId === playRequestIdRef.current) {
        setPlaybackIntent(null);
        updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
      }
      return;
    }
    if (playbackPlan.queue.length === 0) {
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
      data: sanitizeSongForStorage(targetSong),
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
          setPlaybackIntent(null);
          setPlaybackLoading(false);
          updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
          showPlaybackNotice("Player not ready yet. Please try again.");
          return;
        }

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        const existingNativeTargetIndex = queueIsSame
          ? await getNativeTrackIndexForSong(targetIndex, targetSong.id)
          : -1;

        if (queueIsSame && existingNativeTargetIndex >= 0 && !isYouTubeSource(targetSong)) {
          // Fast path: queue unchanged and native queue is confirmed in sync.
          // Do not remove/re-add the active track here; rebuilding is safer
          // than indexed native mutation if the URL source needs to change.
          await TrackPlayer.skip(existingNativeTargetIndex);
          await publishNativeNowPlaying(targetSong, targetIndex);
          await TrackPlayer.play();
          return;
        }

        // Resolve playable URLs before handing items to TrackPlayer.
        const preloadCount = isYouTubeSource(targetSong)
          ? Math.min(playableQueue.length, targetIndex + 1 + YOUTUBE_UPCOMING_NATIVE_PRELOAD_SIZE)
          : Math.max(
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
            // Native audio stream could not be resolved after backend retries.
            // Show error and auto-advance to the next song.
            logger.error("[Playback] YouTube native audio resolution failed — all resolvers exhausted", {
              songId: targetSong.id,
              title: targetSong.title,
            });
            setPlaybackIntent(null);
            setPlaybackLoading(false);
            failPendingNativeTrack("Could not resolve audio stream for this song.");
            updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
            const skipped = scheduleNextTrackAfterFailure(
              targetIndex,
              "youtube_resolve_failed",
              "Could not play this song. Trying next...",
              500
            );
            if (!skipped) {
              showPlaybackNotice("Could not play this song.");
            }
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
          
          logger.info("[Player] About to call TrackPlayer.play()", {
            song: resolvedTargetSong.id,
            title: resolvedTargetSong.title,
            url: resolvedTargetSong.audioUrl,
            hasHeaders: !!resolvedTargetSong.playbackHeaders,
          });
          
          await TrackPlayer.play();
          
          logger.info("[Player] TrackPlayer.play() called successfully");

          appendRemainingTracksIfCurrent(
            requestId,
            remainingSongs,
            preloadCount,
            isYouTubeSource(targetSong) ? YOUTUBE_UPCOMING_NATIVE_PRELOAD_SIZE : PRELOAD_QUEUE_SIZE
          );
        } else {
          await TrackPlayer.reset();
          await TrackPlayer.add(initialTracks);
          if (targetNativeIndex > 0) {
            await TrackPlayer.skip(targetNativeIndex);
          }
          await publishNativeNowPlaying(resolvedTargetSong, targetIndex);
          await TrackPlayer.play();

          appendRemainingTracksIfCurrent(
            requestId,
            remainingSongs,
            preloadCount,
            isYouTubeSource(targetSong) ? YOUTUBE_UPCOMING_NATIVE_PRELOAD_SIZE : PRELOAD_QUEUE_SIZE
          );
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
        setPlaybackIntent(null);
        setPlaybackLoading(false);
        failPendingNativeTrack("Could not start playback.");
        updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
        logger.error("[Player] loadAndPlaySong failed", {
          error,
          songId: song?.id,
          songAudioUrl: song?.audioUrl,
        });
        const skipped = requestId === playRequestIdRef.current && isYouTubeSource(targetSong)
          ? scheduleNextTrackAfterFailure(
              targetIndex,
              "load_and_play_failed",
              "Could not start this song. Trying next...",
              500
            )
          : false;
        if (!skipped) {
          showPlaybackNotice("Could not start playback.");
        }
      } finally {
        if (requestId === playRequestIdRef.current) {
          setPlaybackLoading(false);
          updatePlaybackEngineSnapshot({ isLoading: false });
        }
      }
    });
  }, [appendRemainingTracksIfCurrent, buildPlaybackQueueForSong, clearUserQueuedSongIds, ensurePlayerReady, failPendingNativeTrack, getNativeTrackIndexForSong, markPendingNativeTrack, runSerializedPlaybackSwitch, scheduleNextTrackAfterFailure, showPlaybackNotice]);
  loadAndPlaySongRef.current = loadAndPlaySong;

  useEffect(() => {
    if (Platform.OS !== "android" || !AndroidAutoMedia) return;

    const subscription = DeviceEventEmitter.addListener("MavrixfyAutoMediaPlayRequest", (mediaId: unknown) => {
      const request = parseAndroidAutoPlayRequest(String(mediaId || ""));
      if (!request) return;

      const liveQueue = queueRef.current;
      const searchPool = [
        ...liveQueue,
        ...originalQueueRef.current,
        ...likedSongsRef.current,
        currentSongRef.current,
      ];

      const targetSong = searchPool.find((item) => item?.id === request.id) || liveQueue[request.index];
      if (!targetSong?.id) return;

      const queueIndexForTarget = liveQueue.findIndex((item) => item.id === targetSong.id);
      if (queueIndexForTarget >= 0) {
        void loadAndPlaySong(targetSong, liveQueue, queueIndexForTarget);
        return;
      }

      const nextQueue = uniqueSongsById([targetSong, ...liveQueue, ...originalQueueRef.current]);
      void loadAndPlaySong(targetSong, nextQueue, 0);
    });

    return () => subscription.remove();
  }, [loadAndPlaySong]);

  useEffect(() => {
    if (Platform.OS !== "android" || !AndroidAutoMedia?.publishBrowseState) return;

    const visibleQueue = queue.length > 0
      ? queue
      : currentSong
        ? [currentSong]
        : [];
    const safeQueueIndex = Math.min(Math.max(queueIndex, 0), Math.max(visibleQueue.length - 1, 0));
    const activeSong = currentSong || visibleQueue[safeQueueIndex] || null;
    const quickCandidates = [
      activeSong,
      ...visibleQueue.slice(safeQueueIndex + 1),
      ...visibleQueue.slice(0, safeQueueIndex),
      ...sourceQueue,
      ...likedSongs,
    ];

    const payload = {
      currentSong: songToAndroidAutoItem(activeSong),
      queue: uniqueAndroidAutoSongs(visibleQueue, 30),
      quickPicks: uniqueAndroidAutoSongs(quickCandidates, 24),
      recentSongs: uniqueAndroidAutoSongs([activeSong, ...sourceQueue, ...visibleQueue], 24),
      likedSongs: uniqueAndroidAutoSongs(likedSongs, 24),
      queueIndex: safeQueueIndex,
      isPlaying: resolvedIsPlaying,
    };

    try {
      AndroidAutoMedia.publishBrowseState(JSON.stringify(payload));
    } catch {
      // Android Auto browse metadata is optional; phone playback must continue.
    }
  }, [currentSong, likedSongs, queue, queueIndex, resolvedIsPlaying, sourceQueue]);

  const playSong = useCallback(async (song: Song, newQueue?: Song[]) => {
    try {
      const requestId = ++playRequestIdRef.current;
      const requestedQueue = (newQueue || [song]).filter((item): item is Song => Boolean(item?.id));
      const requestedIndex = Math.max(0, requestedQueue.findIndex((item) => item.id === song.id));
      const requestedSong = requestedQueue[requestedIndex] || song;
      const playbackPlan = await buildPlaybackQueueForSong(requestedSong, requestedQueue);
      if (!playbackPlan || requestId !== playRequestIdRef.current) {
        if (!playbackPlan && requestId === playRequestIdRef.current) {
          setPlaybackIntent(null);
          setPlaybackLoading(false);
          showPlaybackNotice("This song cannot be played.");
        }
        return;
      }

      const q = playbackPlan.queue;
      const targetIndex = playbackPlan.targetIndex;
      const targetSong = playbackPlan.targetSong;

      // 1. Update UI state immediately for responsiveness
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

      // 2. Perform native player routing asynchronously in the background.
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
      setPlaybackLoading(false);
      previewIsPlayingRef.current = false;
      setPreviewIsPlaying(false);
      updatePlaybackEngineSnapshot({
        desiredPlayState: null,
        isPlaying: false,
        isLoading: false,
        isBuffering: false,
      });
      showPlaybackNotice("Could not start playback.");
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
            const shouldRefreshYouTubeResume = isYouTubeSource(currentSong);
            // If no URL loaded yet (e.g. after app reopen), load first then play.
            // YouTube proxy URLs are resolved just-in-time, so refresh them on
            // resume and restore the visible position.
            if (!ExpoAvPlayer.isLoaded() || shouldRefreshYouTubeResume) {
              const resumeDuration = previewDuration > 0
                ? previewDuration / 1000
                : toDurationSeconds(currentSong.duration);
              const resumeAt = previewProgress > 0 && resumeDuration > 0
                ? previewProgress * resumeDuration
                : latestPositionSecondsRef.current;
              const playbackSong = shouldRefreshYouTubeResume
                ? stripTransientYouTubeAudioUrl(currentSong)
                : currentSong;
              const url = await resolvePlaybackUrl(playbackSong);
              if (url) {
                await ExpoAvPlayer.loadAndPlay(url);
                if (shouldRefreshYouTubeResume && resumeAt > 1) {
                  await ExpoAvPlayer.seekTo(resumeAt);
                }
              }
            } else {
              ExpoAvPlayer.play();
            }
          }
          return;
        }
        setPlaybackIntent(null);
        updatePlaybackEngineSnapshot({ desiredPlayState: null });
        showPlaybackNotice(nativePlayerUnavailableMessage);
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
      if (isYouTubeSource(targetSong)) {
        const resumeAt = Math.max(
          0,
          restoredPositionSecondsRef.current,
          latestPositionSecondsRef.current,
          effectivePositionSeconds
        );
        const refreshQueue = (currentQueue.length > 0 ? currentQueue : [targetSong]).map((item, index) =>
          index === targetIndex || item.id === targetSong.id
            ? stripTransientYouTubeAudioUrl(item)
            : item
        );
        const refreshTarget = stripTransientYouTubeAudioUrl(targetSong);

        await loadAndPlaySong(refreshTarget, refreshQueue, targetIndex);
        if (resumeAt > 1 && currentSongRef.current?.id === targetSong.id) {
          await TrackPlayer.seekTo(resumeAt).catch(() => {});
        }
        restoredPositionSecondsRef.current = 0;
        return;
      }

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
      if (!TrackPlayer || !setupPlayer) {
        return;
      }
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
  }, [currentSong, effectivePositionSeconds, ensurePlayerReady, getNativeTrackIndexForSong, isPlayerReady, loadAndPlaySong, previewDuration, previewProgress, resolvedIsPlaying, showPlaybackNotice]);

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

      // 1. Update UI state immediately for responsiveness
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
      if (nativeTargetIndex < 0 || isYouTubeSource(nextTrack)) {
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
      logger.warn("[Player] nextSong failed", error);
      const failedSong = currentSongRef.current;
      const skipped = failedSong && isYouTubeSource(failedSong)
        ? scheduleNextTrackAfterFailure(
            queueIndexRef.current,
            "next_song_failed",
            "Could not play this song. Trying next...",
            250
          )
        : false;
      if (!skipped) {
        setPlaybackIntent(null);
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
        showPlaybackNotice("Could not skip to next track.");
      }
    }
  }, [consumeLeadingUserQueuedSongId, ensurePlayerReady, failPendingNativeTrack, getNativeTrackIndexForSong, isPlayerReady, loadAndPlaySong, markPendingNativeTrack, previewRepeatMode, runSerializedPlaybackSwitch, scheduleNextTrackAfterFailure, showPlaybackNotice]);

  const prevSong = useCallback(async () => {
    try {
      const cq = queueRef.current;
      const ci = queueIndexRef.current;
      if (cq.length === 0) return;

      const rm = TrackPlayer && setupPlayer ? repeatModeRef.current : previewRepeatMode;

      const positionSeconds = TrackPlayer && setupPlayer ? safePosition : previewProgress * (previewDuration / 1000);
      if (positionSeconds > 3) {
        if (TrackPlayer && setupPlayer) {
          await TrackPlayer.seekTo(0);
        } else {
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
          } else {
            await ExpoAvPlayer.seekTo(0);
            setPreviewProgress(0);
          }
          return;
        }
      }

      const prevTrack = cq[pi];
      if (!prevTrack) return;

      // 1. Update UI state immediately for responsiveness
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
      if (nativeTargetIndex < 0 || isYouTubeSource(prevTrack)) {
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
  }, [consumeLeadingUserQueuedSongId, ensurePlayerReady, failPendingNativeTrack, getNativeTrackIndexForSong, isPlayerReady, loadAndPlaySong, markPendingNativeTrack, previewRepeatMode, runSerializedPlaybackSwitch, safePosition, previewDuration, previewProgress]);

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

      setIsShuffled(nextShuffleState);
      isShuffledRef.current = nextShuffleState;
      setQueue(nextQueue);
      queueRef.current = nextQueue;
      clearUserQueuedSongIds();
      setQueueIndex(nextIndex);
      queueIndexRef.current = nextIndex;
      return { currentSongItem, nextQueue, nextIndex };
    };

    if (!TrackPlayer || !setupPlayer) {
      if (canUseLightweightAudioFallback) {
        // Compute the next shuffle value first, then run the side effects
        // OUTSIDE the updater. React 18 StrictMode double-invokes state updaters,
        // so calling applyShuffleState (which calls setQueue/Math.random/ref
        // writes) inside the updater would shuffle the queue twice.
        const nextShuffled = !isShuffledRef.current;
        setPreviewIsShuffled(nextShuffled);
        applyShuffleState(nextShuffled);
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
  }, [clearUserQueuedSongIds, isPlayerReady, resolvedIsPlaying, runSerializedPlaybackSwitch]);

  const toggleRepeat = useCallback(async () => {
    if (!TrackPlayer || !setupPlayer) {
      if (canUseLightweightAudioFallback) {
        setPreviewRepeatMode((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
      }
      return;
    }
    if (!isPlayerReady) {
      return;
    }
    setRepeatMode(prev => {
      const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
      repeatModeRef.current = next;
      
      if (RepeatMode) {
        const repeatMap = {
          "off": RepeatMode.Off,
          "all": RepeatMode.Queue,
          "one": RepeatMode.Track,
        };
        TrackPlayer.setRepeatMode(repeatMap[next]).catch(() => {});
      }
      
      return next;
    });
  }, [isPlayerReady]);

  const toggleLike = useCallback(async (song: Song) => {
    if (!authUser?.id) {
      showPlaybackNotice("Sign in to save liked songs to your account.");
      return;
    }

    const isCurrentlyLiked = likedSongIds.includes(song.id);
    const storedSong = sanitizeSongForStorage(song);
    
    try {
      if (isCurrentlyLiked) {
        setLikedSongIds(prev => prev.filter(id => id !== song.id));
        setLikedSongs(prev => prev.filter(s => s.id !== song.id));
        await removeLikedSongFromFirestore(authUser.id, song.id);
      } else {
        setLikedSongIds(prev => [song.id, ...prev]);
        setLikedSongs(prev => [storedSong, ...prev]);
        await addLikedSongToFirestore(authUser.id, storedSong);
      }
    } catch (error) {
      logger.warn("[Player] Failed to sync liked song", { songId: song.id, error });
      if (isCurrentlyLiked) {
        setLikedSongIds(prev => prev.includes(song.id) ? prev : [song.id, ...prev]);
        setLikedSongs(prev => prev.some((s) => s.id === song.id) ? prev : [storedSong, ...prev]);
      } else {
        setLikedSongIds(prev => prev.filter(id => id !== song.id));
        setLikedSongs(prev => prev.filter(s => s.id !== song.id));
      }
      showPlaybackNotice("Could not update liked songs. Please try again.");
    }
  }, [authUser?.id, likedSongIds, showPlaybackNotice]);

  const isLiked = useCallback((songId: string) => likedSongIds.includes(songId), [likedSongIds]);

  const addNativeQueueTrack = useCallback(async (song: Song, insertIndex: number): Promise<boolean> => {
    if (!TrackPlayer || !setupPlayer) return false;

    const entry = isYouTubeSource(song)
      ? await resolveNativeTrackEntry(song, insertIndex)
      : {
          song,
          track: songToTrack(song),
          appIndex: insertIndex,
        };
    if (!entry?.track?.url) return false;

    await TrackPlayer.add(entry.track, insertIndex);
    nativeQueueAppIndicesRef.current = nativeQueueAppIndicesRef.current.map((appIndex) =>
      appIndex >= insertIndex ? appIndex + 1 : appIndex
    );
    nativeQueueAppIndicesRef.current.splice(insertIndex, 0, insertIndex);
    return true;
  }, []);

  const addToQueue = useCallback(async (song: Song) => {
    try {
      const normalizedSong = normalizePlayableSong(song);
      if (!normalizedSong) {
        return;
      }

      if (!TrackPlayer || !setupPlayer) {
        if (!canUseLightweightAudioFallback) {
          return;
        }
        // Read the live queue from the ref and compute the new array outside
        // the updater. React 18 StrictMode double-invokes state updaters, so
        // writing to refs/splicing inside setQueue would run twice and double
        // the inserted song.
        const ci = queueIndexRef.current;
        const insertIndex = Math.max(
          0,
          Math.min(ci + 1 + userQueuedSongIdsRef.current.length, queueRef.current.length)
        );
        const next = [...queueRef.current];
        next.splice(insertIndex, 0, normalizedSong);
        queueRef.current = next;
        setQueue(next);
        appendUserQueuedSongId(normalizedSong.id);
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
      await addNativeQueueTrack(normalizedSong, insertIndex);
    } catch (error) {
      // Silent fail
    }
  }, [addNativeQueueTrack, appendUserQueuedSongId, isPlayerReady]);

  const playNext = useCallback(async (song: Song) => {
    try {
      const normalizedSong = normalizePlayableSong(song);
      if (!normalizedSong) {
        return;
      }

      if (!TrackPlayer || !setupPlayer) {
        if (!canUseLightweightAudioFallback) {
          return;
        }
        // Read the live queue from the ref and compute the new array outside
        // the updater. React 18 StrictMode double-invokes state updaters, so
        // splicing inside setQueue would run twice and double the inserted song.
        const ci = queueIndexRef.current;
        const next = [...queueRef.current];
        next.splice(ci + 1, 0, normalizedSong);
        queueRef.current = next;
        setQueue(next);
        prependUserQueuedSongId(normalizedSong.id);
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
        await addNativeQueueTrack(normalizedSong, insertIndex);
        return;
      }

      const activeSongId = currentQueue[ci]?.id ?? currentSongRef.current?.id ?? normalizedSong.id;
      const validSongs = mapFilter(next, normalizePlayableSong, (item): item is Song => Boolean(item));
      const activeIndex = Math.max(0, validSongs.findIndex((song) => song.id === activeSongId));
      const entries = await resolveNativeTrackEntries(validSongs, 0);
      const nativeActiveIndex = Math.max(0, entries.findIndex((entry) => entry.appIndex === activeIndex));
      if (entries.length > 0) {
        nativeQueueAppIndicesRef.current = entries.map((entry) => entry.appIndex);
        await rebuildNativeQueue(
          entries.map((entry) => entry.track),
          nativeActiveIndex,
          resolvedIsPlaying
        );
      }
    } catch (error) {
      setPlaybackIntent(null);
      // Silent fail
    }
  }, [addNativeQueueTrack, isPlayerReady, nativeQueueHasTrackAt, prependUserQueuedSongId, resolvedIsPlaying]);

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
      if (canUseLightweightAudioFallback && (!TrackPlayer || !setupPlayer)) {
        setPreviewIsShuffled(true);
        return;
      }
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
  }, [clearUserQueuedSongIds, isPlayerReady, resolvedIsPlaying]);

  const value = useMemo(() => ({
    currentSong, queue, userQueuedSongIds, sourceQueue, queueIndex, isPlaying: resolvedIsPlaying, progress: resolvedProgress, duration: resolvedDuration, positionMillis: resolvedPositionMillis,
    isShuffled: resolvedIsShuffled, repeatMode: resolvedRepeatMode, likedSongIds, likedSongs, isLoading: playbackLoading, albumColor, textColor, sleepTimer,
    playSong, togglePlay, nextSong, prevSong, seekTo, toggleShuffle, toggleRepeat,
    toggleLike, isLiked, addToQueue, playNext, removeFromQueue, reorderQueue, clearQueue, shuffleQueue,
    setSleepTimer, clearSleepTimer, setAlbumColor, setTextColor,
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

  return (
    <PlayerContext.Provider value={value}>
      <PlayerLiteContext.Provider value={liteValue}>
        <PlayerProgressContext.Provider value={progressValue}>
          <PlayerActionsContext.Provider value={actionsValue}>
            <PlayerBrowseContext.Provider value={browseValue}>
              <PlayerQueueContext.Provider value={queueValue}>
                <PlayerRowContext.Provider value={rowValue}>
                  {children}
                </PlayerRowContext.Provider>
              </PlayerQueueContext.Provider>
            </PlayerBrowseContext.Provider>
          </PlayerActionsContext.Provider>
        </PlayerProgressContext.Provider>
      </PlayerLiteContext.Provider>
    </PlayerContext.Provider>
  );
}

function usePlayer() {
  const ctx = use(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

function usePlayerLite() {
  const ctx = use(PlayerLiteContext);
  if (!ctx) throw new Error("usePlayerLite must be used within PlayerProvider");
  return ctx;
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

function usePlayerQueue() {
  const ctx = use(PlayerQueueContext);
  if (!ctx) throw new Error("usePlayerQueue must be used within PlayerProvider");
  return ctx;
}
