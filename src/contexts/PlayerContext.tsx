import React, { createContext, use, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Alert, AppState, Platform, View } from "react-native";
import { isRunningInExpoGo } from "expo";
import * as Network from "expo-network";
import { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import * as ExpoAvPlayer from "@/services/audio/ExpoAvAdapter";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { mapFilter } from "@/lib/arrayUtils";
import { createShuffledPlaybackQueue, toggleQueueShuffleState } from "@/services/audio/ShuffleManager";
import { showGlobalToast } from "@/utils/globalToast";

import TrackPlayer, {
  Event,
  RepeatMode,
  State,
  Capability,
} from "react-native-track-player";
import { setupPlayer } from "@/services/audio/TrackPlayerAdapter";

type NativeSubscription = {
  remove: () => void;
};

const cleanupNativeSubscription = (subscription: NativeSubscription | null | undefined) => {
  subscription?.remove();
};

const subscribeTrackPlayerEvent = (eventName: unknown, listener: (...args: any[]) => void) => {
  if (!TrackPlayer?.addEventListener || !eventName) return () => {};
  const subscription = TrackPlayer.addEventListener(eventName as any, listener) as NativeSubscription;
  return () => cleanupNativeSubscription(subscription);
};

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
  shufflePlay: (songs: Song[], startSong?: Song) => void;
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
  shufflePlay: (songs: Song[], startSong?: Song) => void;
  togglePlay: () => void;
  toggleLike: (song: Song) => void;
  toggleShuffle: () => void;
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
  shufflePlay: (songs: Song[], startSong?: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
}

const PlayerQueueContext = createContext<PlayerQueueContextValue | null>(null);

interface PlayerActionsContextValue {
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  likedSongIds: string[];
  likedSongs: Song[];
  albumColor: string;
  textColor: string;
  sleepTimer: SleepTimerState | null;
  playSong: (song: Song, queue?: Song[]) => void;
  shufflePlay: (songs: Song[], startSong?: Song) => void;
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

interface PlayerLikedContextValue {
  likedSongs: Song[];
  likedSongIds: string[];
  likedSongsCount: number;
  isLiked: (songId: string) => boolean;
  toggleLike: (song: Song) => void;
}

const PlayerLikedContext = createContext<PlayerLikedContextValue | null>(null);

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
    const parts = mapFilter(
      value.split(":"),
      (part) => Number(part.trim()),
      (part) => Number.isFinite(part) && part >= 0
    );

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

function readAudioCandidate(value: unknown): string {
  const url = readNonEmptyString(value);
  if (!url || isKnownNonAudioPageUrl(url)) return "";
  return url;
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



function withResolvedPlaybackUrl(song: Song, audioUrl: string): Song {
  const resolvedUrl = readNonEmptyString(audioUrl);
  if (!resolvedUrl || song.audioUrl === resolvedUrl) return song;
  return { ...song, audioUrl: resolvedUrl };
}

function songToTrack(song: Song, localUrl?: string | null): any {
  const audioUrl = localUrl || resolveAudioUrl(song as SongPlaybackSource);
  const durationSeconds = toDurationSeconds(song.duration);
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
    duration: durationSeconds > 0 ? durationSeconds : undefined,
    ...(song.playbackHeaders && Object.keys(song.playbackHeaders).length > 0
      ? { headers: song.playbackHeaders }
      : {}),
  };
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

function cleanHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'");
}

function getNowPlayingMetadata(track: NowPlayingMetadataSource) {
  const rawTitle = readNonEmptyString(track.title) || "Mavrixfy";
  const rawArtist = readNonEmptyString(track.artist) || "Mavrixfy";
  const rawAlbum = readNonEmptyString(track.album);
  const title = cleanHtmlEntities(rawTitle);
  const artist = cleanHtmlEntities(rawArtist);
  const album = rawAlbum ? cleanHtmlEntities(rawAlbum) : undefined;
  const duration = toDurationSeconds(track.duration);
  const artwork = readNonEmptyString(track.artwork) || readNonEmptyString(track.coverUrl);

  return {
    title,
    artist,
    album,
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
    // Non-fatal
  }

  try {
    if (typeof TrackPlayer.updateNowPlayingMetadata === "function") {
      await TrackPlayer.updateNowPlayingMetadata(metadata);
    }
  } catch {
    // Non-fatal
  }
}

let cachedAdaptiveQuality: { quality: "low" | "medium" | "high"; timestamp: number } | null = null;

async function getAdaptiveStreamingQuality(): Promise<"low" | "medium" | "high"> {
  const now = Date.now();
  if (cachedAdaptiveQuality && now - cachedAdaptiveQuality.timestamp < 30000) {
    return cachedAdaptiveQuality.quality;
  }
  try {
    const settings = await Storage.getSettings();
    if (settings.streamingQuality === "low" || settings.streamingQuality === "medium") {
      cachedAdaptiveQuality = { quality: settings.streamingQuality, timestamp: now };
      return settings.streamingQuality;
    }
    const netState = await Network.getNetworkStateAsync();
    if (netState.type === Network.NetworkStateType.CELLULAR) {
      cachedAdaptiveQuality = { quality: "medium", timestamp: now };
      return "medium";
    }
  } catch (e) {
    logger.error("[Player] Failed to determine adaptive streaming quality", e);
  }
  cachedAdaptiveQuality = { quality: "high", timestamp: now };
  return "high";
}

/** Resolve the best playback URL for a song — local file first, then quality-specific stream, then direct candidate. */
async function resolvePlaybackUrl(song: Song): Promise<string | null> {
  try {
    // 1. Local downloaded file
    const { getLocalPlaybackUrl } = await import("@/lib/downloads/downloadManager");
    const local = await getLocalPlaybackUrl(song.id);
    if (local) {
      if (local.startsWith("file://") || local.startsWith("http")) return local;
      return `file://${local}`;
    }
  } catch {
    // Fall through
  }

  // 2. JioSaavn / Catalogue Songs -> Quality adaptive selection
  if (song.downloadUrl) {
    try {
      const { getBestAudioUrlWithQuality } = await import("@/lib/musicData");
      const targetQuality = await getAdaptiveStreamingQuality();
      const resolvedUrl = getBestAudioUrlWithQuality(song.downloadUrl, targetQuality);
      const playableUrl = readAudioCandidate(resolvedUrl);
      if (playableUrl) {
        return playableUrl;
      }
    } catch (e) {
      logger.error("[Player] Failed to resolve quality-specific audio URL:", e);
    }
  }

  // 3. Direct audio URL fallback
  const fallbackUrl = resolveAudioUrl(song as SongPlaybackSource) || null;
  return fallbackUrl;
}

const canUseLightweightAudioFallback = Boolean(isRunningInExpoGo() || !TrackPlayer);

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- acceptable component structure for this app
// react-doctor-disable-next-line react-doctor/no-giant-component -- acceptable component structure for this app
export function PlayerProvider({ children }: { children: ReactNode }) {
  // Android Auto service integration
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const { user: authUser } = useAuth();

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [userQueuedSongIds, setUserQueuedSongIds] = useState<string[]>([]);
  const [sourceQueue, setSourceQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [likedSongIds, setLikedSongIds] = useState<string[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [albumColor, setAlbumColor] = useState("#282828");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerState | null>(null);

  // Position and progress state
  const [nativePosition, setNativePosition] = useState(0);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [seekOverride, setSeekOverride] = useState<{
    songId: string | null;
    seconds: number;
    startedAt: number;
  } | null>(null);

  // References for fast, glitch-free synchronous access
  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const originalQueueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const isShuffledRef = useRef(false);
  const likedSongsRef = useRef<Song[]>([]);
  const userQueuedSongIdsRef = useRef<string[]>([]);
  const playbackLoadingRef = useRef(false);
  const playRequestIdRef = useRef(0);
  const positionSecondsRef = useRef(0);
  const playerSetupPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastPlaybackNoticeAtRef = useRef(0);
  const sleepTimerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<SleepTimerState | null>(null);
  const likePendingSongsRef = useRef<Map<string, Promise<void>>>(new Map());
  const nextSongRef = useRef<() => void>(() => {});
  const prevSongRef = useRef<() => void>(() => {});
  const togglePlayRef = useRef<() => Promise<void> | void>(() => {});
  const togglePlayInFlightRef = useRef(false);
  const seekToRef = useRef<(progress: number) => Promise<void> | void>(() => {});
  const playSongRef = useRef<(song: Song, queue?: Song[]) => Promise<void> | void>(() => {});

  // In-memory stream URL cache for instant zero-latency queue navigation
  const streamUrlCache = useRef<Map<string, string>>(new Map());
  const streamResolveCache = useRef<Map<string, Promise<string | null>>>(new Map());
  const MAX_STREAM_CACHE = 100;

  // Keep refs up-to-date
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playbackLoadingRef.current = playbackLoading; }, [playbackLoading]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isShuffledRef.current = isShuffled; }, [isShuffled]);
  useEffect(() => { likedSongsRef.current = likedSongs; }, [likedSongs]);
  useEffect(() => { userQueuedSongIdsRef.current = userQueuedSongIds; }, [userQueuedSongIds]);
  useEffect(() => { sleepTimerRef.current = sleepTimer; }, [sleepTimer]);

  // Restore previous song and queue on app launch / refresh
  useEffect(() => {
    let mounted = true;
    void Storage.loadPlayerState().then((persisted) => {
      if (!mounted || !persisted?.currentSong?.id || currentSongRef.current) return;
      const song = persisted.currentSong;
      const q = Array.isArray(persisted.queue) && persisted.queue.length > 0 ? persisted.queue : [song];
      const qIndex = Math.max(0, Math.min(persisted.queueIndex || 0, q.length - 1));

      setCurrentSong(song);
      currentSongRef.current = song;
      setQueue(q);
      setSourceQueue(q);
      queueRef.current = q;
      originalQueueRef.current = q;
      setQueueIndex(qIndex);
      queueIndexRef.current = qIndex;
      setIsPlaying(false);
      isPlayingRef.current = false;

      updatePlaybackEngineSnapshot({
        currentSong: song,
        queue: q,
        sourceQueue: q,
        queueIndex: qIndex,
        desiredPlayState: false,
        isPlaying: false,
        isLoading: false,
        isBuffering: false,
      });
    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  // Fast 250ms progress tracking loop (Spotify/Apple Music style)
  useEffect(() => {
    let mounted = true;

    if (canUseLightweightAudioFallback) {
      ExpoAvPlayer.onStatusUpdate((status) => {
        if (!mounted) return;
        if (typeof status.position === "number") {
          setNativePosition(status.position);
        }
        if (typeof status.duration === "number" && status.duration > 0) {
          setNativeDuration(status.duration);
        }
        if (typeof status.isPlaying === "boolean" && status.isPlaying !== isPlayingRef.current) {
          // If a new track is in the process of loading, do not let transient buffering false flip the state
          if (!status.isPlaying && playbackLoadingRef.current) {
            return;
          }
          setIsPlaying(status.isPlaying);
          isPlayingRef.current = status.isPlaying;
          updatePlaybackEngineSnapshot({ isPlaying: status.isPlaying, isLoading: false, isBuffering: false });
        }
        if (status.didJustFinish) {
          if (repeatModeRef.current === "one" && currentSongRef.current) {
            void playSongRef.current(currentSongRef.current, queueRef.current);
          } else {
            nextSongRef.current();
          }
        }
      });
      return () => {
        mounted = false;
      };
    }

    let progressInFlight = false;
    const interval = setInterval(async () => {
      if (!isPlayingRef.current || progressInFlight) return;
      try {
        if (TrackPlayer) {
          progressInFlight = true;
          const prog = await TrackPlayer.getProgress();
          if (mounted && prog) {
            if (typeof prog.position === "number") {
              setNativePosition(prog.position);
            }
            if (typeof prog.duration === "number" && prog.duration > 0) {
              setNativeDuration(prog.duration);
            }
          }
        }
      } catch {
      } finally {
        progressInFlight = false;
      }
    }, 250);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const resolvedIsPlaying = isPlaying;

  const resolvedDuration = useMemo(() => {
    if (nativeDuration > 0) return nativeDuration;
    const songDuration = toDurationSeconds(currentSong?.duration);
    if (songDuration > 0) return songDuration;
    return 0;
  }, [nativeDuration, currentSong?.duration]);

  const resolvedDurationMillis = useMemo(() => {
    return Math.round(resolvedDuration * 1000);
  }, [resolvedDuration]);

  const resolvedPositionSeconds = useMemo(() => {
    if (seekOverride && currentSong?.id && seekOverride.songId === currentSong.id) {
      const elapsed = (Date.now() - seekOverride.startedAt) / 1000;
      if (elapsed < 1.2) {
        return seekOverride.seconds;
      }
    }
    if (TrackPlayer || canUseLightweightAudioFallback) {
      return nativePosition;
    }
    return 0;
  }, [seekOverride, currentSong?.id, nativePosition]);

  const resolvedProgress = useMemo(() => {
    if (resolvedDuration <= 0) return 0;
    return Math.max(0, Math.min(1, resolvedPositionSeconds / resolvedDuration));
  }, [resolvedPositionSeconds, resolvedDuration]);

  const resolvedPositionMillis = useMemo(() => {
    return Math.round(resolvedPositionSeconds * 1000);
  }, [resolvedPositionSeconds]);

  // Keep position ref updated for zero-overhead persistence
  useEffect(() => {
    positionSecondsRef.current = resolvedPositionSeconds;
  }, [resolvedPositionSeconds]);

  const showPlaybackNotice = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastPlaybackNoticeAtRef.current < 1200) return;
    lastPlaybackNoticeAtRef.current = now;

    showGlobalToast(message);
  }, []);

  const ensurePlayerReady = useCallback(async (): Promise<boolean> => {
    if (isPlayerReady) return true;
    if (!TrackPlayer) return false;

    if (playerSetupPromiseRef.current) {
      return playerSetupPromiseRef.current;
    }

    const promise = (async () => {
      try {
        await setupPlayer();
        setIsPlayerReady(true);
        return true;
      } catch (error) {
        logger.error("[Player] TrackPlayer setup failed", error);
        return false;
      } finally {
        playerSetupPromiseRef.current = null;
      }
    })();

    playerSetupPromiseRef.current = promise;
    return promise;
  }, [isPlayerReady]);

  useEffect(() => {
    if (TrackPlayer) {
      void ensurePlayerReady();
    }
  }, [ensurePlayerReady]);

  // Bounded LRU Stream Cache updater
  const setStreamCache = useCallback((songId: string, url: string) => {
    if (!songId || !url) return;
    const cache = streamUrlCache.current;
    if (cache.has(songId)) {
      cache.delete(songId);
    } else if (cache.size >= MAX_STREAM_CACHE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(songId, url);
  }, []);

  // Deduplicated in-flight stream URL resolver
  const resolvePlaybackUrlCached = useCallback(
    async (song: Song): Promise<string | null> => {
      if (!song?.id) return null;
      const cached = streamUrlCache.current.get(song.id);
      if (cached) return cached;

      const pending = streamResolveCache.current.get(song.id);
      if (pending) return pending;

      const request = resolvePlaybackUrl(song)
        .then((url) => {
          if (url) {
            setStreamCache(song.id, url);
          }
          return url;
        })
        .finally(() => {
          streamResolveCache.current.delete(song.id);
        });

      streamResolveCache.current.set(song.id, request);
      return request;
    },
    [setStreamCache]
  );

  // Pre-fetch adjacent stream URLs in background for 0ms transitions
  const prefetchAdjacentTrackStreams = useCallback(
    (songQueue: Song[], activeIndex: number) => {
      const nextItem = songQueue[activeIndex + 1];
      if (nextItem) {
        void resolvePlaybackUrlCached(nextItem);
      }
    },
    [resolvePlaybackUrlCached]
  );

  const clearSleepTimerTimeout = useCallback(() => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
  }, []);

  const clearSleepTimer = useCallback(() => {
    clearSleepTimerTimeout();
    sleepTimerRef.current = null;
    setSleepTimerState(null);
  }, [clearSleepTimerTimeout]);

  // Main atomic playback execution
  const playSong = useCallback(
    async (song: Song, requestedQueue?: Song[]) => {
      if (!song?.id) return;
      const reqId = ++playRequestIdRef.current;

      // 1. Build queue
      const hasRequestedQueue = Array.isArray(requestedQueue) && requestedQueue.length > 0;
      const songIndexInQueue = hasRequestedQueue
        ? requestedQueue.findIndex((s) => s.id === song.id)
        : queueRef.current.findIndex((s) => s.id === song.id);

      const isNewQueue = hasRequestedQueue
        ? requestedQueue !== queueRef.current
        : songIndexInQueue < 0;

      const q = hasRequestedQueue
        ? requestedQueue
        : songIndexInQueue >= 0
          ? queueRef.current
          : [song];

      const targetIndex = Math.max(0, q.findIndex((s) => s.id === song.id));
      const targetSong = q[targetIndex] || song;

      // 2. Synchronously commit state (immediate UI update, zero lag, zero flicker)
      setCurrentSong(targetSong);
      currentSongRef.current = targetSong;
      setQueue(q);
      queueRef.current = q;
      if (isNewQueue || !isShuffledRef.current) {
        originalQueueRef.current = q;
        setSourceQueue(q);
      }
      setQueueIndex(targetIndex);
      queueIndexRef.current = targetIndex;

      if (isNewQueue) {
        setUserQueuedSongIds([]);
        userQueuedSongIdsRef.current = [];
      } else {
        const prevIds = userQueuedSongIdsRef.current;
        if (prevIds.includes(targetSong.id)) {
          const next = prevIds.filter((id) => id !== targetSong.id);
          userQueuedSongIdsRef.current = next;
          setUserQueuedSongIds(next);
        }
      }

      setIsPlaying(true);
      isPlayingRef.current = true;
      setPlaybackLoading(true);
      setSeekOverride(null);
      setNativePosition(0);

      updatePlaybackEngineSnapshot({
        currentSong: targetSong,
        queue: q,
        sourceQueue: originalQueueRef.current,
        userQueuedSongIds: isNewQueue ? [] : userQueuedSongIdsRef.current,
        queueIndex: targetIndex,
        desiredPlayState: true,
        isPlaying: true,
        isLoading: true,
        isBuffering: false,
      });

      // 3. Save to recently played and persisted player state asynchronously (deferred off the critical tap path)
      setTimeout(() => {
        Storage.addRecentlyPlayed({
          id: targetSong.id,
          name: targetSong.title,
          imageUrl: targetSong.coverUrl,
          type: "song",
          data: targetSong,
        }).catch(() => {});

        Storage.savePlayerState({
          currentSong: targetSong,
          queue: q,
          queueIndex: targetIndex,
          positionSeconds: 0,
          updatedAt: Date.now(),
        }).catch(() => {});
      }, 150);

      // 4. Resolve audio URL (cached or network)
      try {
        const audioUrl = await resolvePlaybackUrlCached(targetSong);
        if (reqId !== playRequestIdRef.current) return;

        if (!audioUrl) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: null, isPlaying: false, isLoading: false, isBuffering: false });
          showPlaybackNotice("Could not resolve playback URL.");
          return;
        }

        const resolvedSong = withResolvedPlaybackUrl(targetSong, audioUrl);
        currentSongRef.current = resolvedSong;
        setCurrentSong(resolvedSong);

        // 5. Playback execution
        console.log("[PlayerContext] Playback execution - TrackPlayer exists:", Boolean(TrackPlayer));
        if (TrackPlayer) {
          const ready = isPlayerReady || (await ensurePlayerReady());
          console.log("[PlayerContext] Player ready state:", ready);
          if (reqId !== playRequestIdRef.current) return;
          if (!ready) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            showPlaybackNotice("Audio player initialization failed.");
            return;
          }

          const track = songToTrack(resolvedSong, audioUrl);
          console.log("[PlayerContext] Resetting and adding track to TrackPlayer:", track.title);

          await TrackPlayer.reset().catch(() => {});
          if (reqId !== playRequestIdRef.current) return;
          await TrackPlayer.add([track]);
          if (reqId !== playRequestIdRef.current) return;

          await publishNativeNowPlaying(resolvedSong, targetIndex);
          if (reqId !== playRequestIdRef.current) return;

          console.log("[PlayerContext] Calling TrackPlayer.play()...");
          await TrackPlayer.play();
          console.log("[PlayerContext] TrackPlayer.play() called successfully!");
          if (reqId !== playRequestIdRef.current) return;

          // Prefetch next track in background
          prefetchAdjacentTrackStreams(q, targetIndex);
        } else if (canUseLightweightAudioFallback) {
          console.warn("[PlayerContext] Falling back to ExpoAvPlayer!");
          if (reqId !== playRequestIdRef.current) return;
          await ExpoAvPlayer.loadAndPlay(audioUrl);
        }
      } catch (error) {
        if (reqId !== playRequestIdRef.current) return;
        logger.error("[Player] playSong failed", error);
        setIsPlaying(false);
        isPlayingRef.current = false;
        updatePlaybackEngineSnapshot({ desiredPlayState: null, isPlaying: false, isLoading: false, isBuffering: false });
        showPlaybackNotice("Could not start playback.");
      } finally {
        setPlaybackLoading(false);
        if (reqId === playRequestIdRef.current) {
          updatePlaybackEngineSnapshot({ isLoading: false, isBuffering: false });
        }
      }
    },
    [ensurePlayerReady, isPlayerReady, prefetchAdjacentTrackStreams, resolvePlaybackUrlCached, showPlaybackNotice]
  );

  useEffect(() => {
    playSongRef.current = playSong;
  }, [playSong]);

  const togglePlay = useCallback(async () => {
    if (togglePlayInFlightRef.current) return;
    togglePlayInFlightRef.current = true;

    const nextPlayState = !isPlayingRef.current;

    if (!nextPlayState) {
      // Invalidate any in-flight playSong requests so they don't force playback to resume
      playRequestIdRef.current += 1;
    }

    if (!currentSongRef.current) {
      if (queueRef.current.length > 0) {
        const target = queueRef.current[queueIndexRef.current] || queueRef.current[0];
        if (target) {
          void playSong(target, queueRef.current);
        }
      }
      togglePlayInFlightRef.current = false;
      return;
    }

    try {
      if (TrackPlayer) {
        if (nextPlayState) {
          const ready = isPlayerReady || (await ensurePlayerReady());
          const activeTrack = ready ? await TrackPlayer.getActiveTrack().catch(() => null) : null;
          const playbackState = ready ? await TrackPlayer.getPlaybackState().catch(() => null) : null;
          const rawState = (playbackState as any)?.state ?? playbackState;

          // If no active track is loaded in native TrackPlayer, or player is idle/stopped/unloaded
          if (
            !activeTrack ||
            rawState === "none" ||
            rawState === "stopped" ||
            rawState === "idle" ||
            rawState === 0 ||
            rawState === undefined
          ) {
            void playSong(currentSongRef.current, queueRef.current);
            return;
          }

          setIsPlaying(true);
          isPlayingRef.current = true;
          updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });

          await TrackPlayer.play();
          if (currentSongRef.current) {
            void publishNativeNowPlaying(currentSongRef.current, queueIndexRef.current);
          }
        } else {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
          await TrackPlayer.pause();
        }
      } else if (canUseLightweightAudioFallback) {
        if (nextPlayState) {
          // If ExpoAvPlayer has no loaded sound yet (e.g. cold start restored song)
          void playSong(currentSongRef.current, queueRef.current);
        } else {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
          await ExpoAvPlayer.pause();
        }
      }
    } catch (error) {
      logger.error("[Player] togglePlay failed", error);
      if (nextPlayState && currentSongRef.current) {
        void playSong(currentSongRef.current, queueRef.current);
      }
    } finally {
      togglePlayInFlightRef.current = false;
    }
  }, [ensurePlayerReady, isPlayerReady, playSong]);

  useEffect(() => {
    togglePlayRef.current = togglePlay;
  }, [togglePlay]);

  const nextSong = useCallback(async () => {
    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;

    let ni = ci + 1;
    const rm = repeatModeRef.current;
    if (ni >= cq.length) {
      if (rm === "all") {
        ni = 0;
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });
        if (sleepTimerRef.current?.mode === "end-of-stack") {
          clearSleepTimer();
        }
        return;
      }
    }

    const nextTrack = cq[ni];
    if (nextTrack) {
      void playSong(nextTrack, cq);
    }
  }, [clearSleepTimer, playSong]);

  useEffect(() => {
    nextSongRef.current = nextSong;
  }, [nextSong]);

  const seekTo = useCallback(async (progress: number) => {
    const targetProgress = Math.max(0, Math.min(1, progress));
    const dur = resolvedDuration;
    const targetSeconds = targetProgress * dur;

    setSeekOverride({
      songId: currentSongRef.current?.id || null,
      seconds: targetSeconds,
      startedAt: Date.now(),
    });
    setNativePosition(targetSeconds);

    try {
      if (TrackPlayer) {
        await TrackPlayer.seekTo(targetSeconds);
      } else if (canUseLightweightAudioFallback) {
        await ExpoAvPlayer.seekTo(targetSeconds);
      }
    } catch (error) {
      logger.error("[Player] seekTo failed", error);
    }
  }, [resolvedDuration]);

  useEffect(() => {
    seekToRef.current = seekTo;
  }, [seekTo]);

  const prevSong = useCallback(async () => {
    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;

    if (resolvedPositionSeconds > 3) {
      void seekTo(0);
      return;
    }

    let pi = ci - 1;
    const rm = repeatModeRef.current;
    if (pi < 0) {
      if (rm === "all") pi = cq.length - 1;
      else {
        void seekTo(0);
        return;
      }
    }

    const prevTrack = cq[pi];
    if (prevTrack) {
      void playSong(prevTrack, cq);
    }
  }, [playSong, resolvedPositionSeconds, seekTo]);

  useEffect(() => {
    prevSongRef.current = prevSong;
  }, [prevSong]);

  const toggleShuffle = useCallback(() => {
    const { nextIsShuffled, nextQueue, nextIndex } = toggleQueueShuffleState({
      isShuffled: isShuffledRef.current,
      currentSong: currentSongRef.current,
      activeQueue: queueRef.current,
      originalQueue: originalQueueRef.current,
    });

    isShuffledRef.current = nextIsShuffled;
    setIsShuffled(nextIsShuffled);
    setQueue(nextQueue);
    queueRef.current = nextQueue;
    setQueueIndex(nextIndex);
    queueIndexRef.current = nextIndex;

    updatePlaybackEngineSnapshot({
      isShuffled: nextIsShuffled,
      queue: nextQueue,
      queueIndex: nextIndex,
    });
  }, []);

  const shufflePlay = useCallback(
    async (songs: Song[], startSong?: Song) => {
      const result = createShuffledPlaybackQueue(songs, startSong);
      if (!result) return;

      const { shuffledQueue, targetSong } = result;
      const canonicalSource = [...songs];

      originalQueueRef.current = canonicalSource;
      setSourceQueue(canonicalSource);
      isShuffledRef.current = true;
      setIsShuffled(true);

      await playSong(targetSong, shuffledQueue);

      updatePlaybackEngineSnapshot({
        isShuffled: true,
        sourceQueue: canonicalSource,
      });
    },
    [playSong]
  );

  const toggleRepeat = useCallback(() => {
    const prev = repeatModeRef.current;
    const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
    repeatModeRef.current = next;
    setRepeatMode(next);

    updatePlaybackEngineSnapshot({
      repeatMode: next,
    });

    if (TrackPlayer && RepeatMode) {
      const repeatMap: Record<string, any> = {
        off: RepeatMode.Off,
        all: RepeatMode.Queue,
        one: RepeatMode.Track,
      };
      TrackPlayer.setRepeatMode(repeatMap[next] || RepeatMode.Off).catch(() => {});
    }
  }, []);

  const isLiked = useCallback((songId: string) => {
    return likedSongIds.includes(songId);
  }, [likedSongIds]);

  const toggleLike = useCallback(
    async (song: Song) => {
      if (!song?.id) return;
      const songId = song.id;
      const isCurrentlyLiked =
        likedSongsRef.current.some((s) => s.id === songId) || likedSongIds.includes(songId);
      const willBeLiked = !isCurrentlyLiked;

      const prevSongs = likedSongsRef.current;
      const nextSongs = willBeLiked
        ? prevSongs.some((s) => s.id === songId)
          ? prevSongs
          : [...prevSongs, song]
        : prevSongs.filter((s) => s.id !== songId);
      likedSongsRef.current = nextSongs;
      setLikedSongs(nextSongs);

      setLikedSongIds((prevIds) =>
        willBeLiked
          ? prevIds.includes(songId)
            ? prevIds
            : [...prevIds, songId]
          : prevIds.filter((id) => id !== songId)
      );

      if (authUser?.id) {
        const previousPromise = likePendingSongsRef.current.get(songId) || Promise.resolve();
        const currentOperation = previousPromise
          .then(async () => {
            if (willBeLiked) {
              await addLikedSongToFirestore(authUser.id, song);
            } else {
              await removeLikedSongFromFirestore(authUser.id, songId);
            }
          })
          .catch((error) => {
            logger.error("[Player] Failed to sync like state with Firestore", error);
          })
          .finally(() => {
            if (likePendingSongsRef.current.get(songId) === currentOperation) {
              likePendingSongsRef.current.delete(songId);
            }
          });

        likePendingSongsRef.current.set(songId, currentOperation);
      }
    },
    [authUser?.id, likedSongIds]
  );

  const addToQueue = useCallback(
    (song: Song) => {
      if (!song?.id) return;

      if (queueRef.current.some((s) => s.id === song.id)) {
        showPlaybackNotice("Already in queue");
        return;
      }

      const nextQueue = [...queueRef.current, song];
      queueRef.current = nextQueue;
      setQueue(nextQueue);

      const nextSourceQueue = [...originalQueueRef.current, song];
      originalQueueRef.current = nextSourceQueue;
      setSourceQueue(nextSourceQueue);

      setUserQueuedSongIds((prev) => (prev.includes(song.id) ? prev : [...prev, song.id]));
      showPlaybackNotice("Added to queue");
    },
    [showPlaybackNotice]
  );

  const playNext = useCallback(
    (song: Song) => {
      if (!song?.id) return;

      if (currentSongRef.current?.id === song.id) {
        showPlaybackNotice("This song is already playing");
        return;
      }

      const currentQ = queueRef.current;
      const cleanQ = currentQ.filter((s) => s.id !== song.id);
      const ci = Math.min(queueIndexRef.current, cleanQ.length - 1);
      const insertAt = Math.max(0, ci + 1);
      const nextQueue = [...cleanQ.slice(0, insertAt), song, ...cleanQ.slice(insertAt)];
      queueRef.current = nextQueue;
      setQueue(nextQueue);

      const currentSourceQ = originalQueueRef.current;
      const cleanSourceQ = currentSourceQ.filter((s) => s.id !== song.id);
      const current = currentSongRef.current;
      const sci = current ? cleanSourceQ.findIndex((s) => s.id === current.id) : 0;
      const sourceInsertAt = Math.max(0, (sci >= 0 ? sci : 0) + 1);
      const nextSourceQueue = [
        ...cleanSourceQ.slice(0, sourceInsertAt),
        song,
        ...cleanSourceQ.slice(sourceInsertAt),
      ];
      originalQueueRef.current = nextSourceQueue;
      setSourceQueue(nextSourceQueue);

      setUserQueuedSongIds((prev) => [song.id, ...prev.filter((id) => id !== song.id)]);
      showPlaybackNotice("Playing next");
    },
    [showPlaybackNotice]
  );

  const removeFromQueue = useCallback((index: number) => {
    const currentQ = queueRef.current;
    if (index === queueIndexRef.current || index < 0 || index >= currentQ.length) return;

    const removedSong = currentQ[index];
    const nextQueue = currentQ.filter((_, i) => i !== index);
    queueRef.current = nextQueue;
    setQueue(nextQueue);

    if (index < queueIndexRef.current) {
      setQueueIndex((ci) => Math.max(0, ci - 1));
    }

    if (removedSong) {
      const nextSourceQueue = originalQueueRef.current.filter((s) => s.id !== removedSong.id);
      originalQueueRef.current = nextSourceQueue;
      setSourceQueue(nextSourceQueue);

      setUserQueuedSongIds((prevUserIds) => {
        const itemIdx = prevUserIds.indexOf(removedSong.id);
        if (itemIdx >= 0) {
          const nextUserIds = [...prevUserIds];
          nextUserIds.splice(itemIdx, 1);
          return nextUserIds;
        }
        return prevUserIds;
      });
    }
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    const currentQ = queueRef.current;
    if (
      fromIndex < 0 ||
      fromIndex >= currentQ.length ||
      toIndex < 0 ||
      toIndex >= currentQ.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const nextQueue = [...currentQ];
    const [item] = nextQueue.splice(fromIndex, 1);
    if (item) nextQueue.splice(toIndex, 0, item);
    queueRef.current = nextQueue;
    setQueue(nextQueue);

    if (!isShuffledRef.current) {
      originalQueueRef.current = nextQueue;
      setSourceQueue(nextQueue);
    }
  }, []);

  const clearQueue = useCallback(() => {
    const current = currentSongRef.current;
    const next = current ? [current] : [];
    setQueue(next);
    setSourceQueue(next);
    queueRef.current = next;
    originalQueueRef.current = next;
    setQueueIndex(0);
    queueIndexRef.current = 0;
    setUserQueuedSongIds([]);
  }, []);

  const shuffleQueue = useCallback(() => {
    toggleShuffle();
  }, [toggleShuffle]);

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
      if (isPlayingRef.current) {
        void togglePlay();
      }
      clearSleepTimer();
    }, Math.max(0, endsAt - Date.now()));
  }, [clearSleepTimer, clearSleepTimerTimeout, togglePlay]);

  // TrackPlayer native event handlers
  useEffect(() => {
    if (!isPlayerReady || !TrackPlayer) return;

    const unsubs = [
      subscribeTrackPlayerEvent(Event.PlaybackState, (event: any) => {
        const nextState = event && typeof event === "object" && "state" in event ? event.state : event;

        switch (nextState) {
          case State.Playing:
            setIsPlaying(true);
            isPlayingRef.current = true;
            setPlaybackLoading(false);
            updatePlaybackEngineSnapshot({ isPlaying: true, isLoading: false, isBuffering: false });
            break;

          case State.Paused:
          case State.Stopped:
            if (!playbackLoadingRef.current) {
              setIsPlaying(false);
              isPlayingRef.current = false;
              setPlaybackLoading(false);
              updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });
            }
            break;

          case State.Buffering:
          case State.Loading:
            updatePlaybackEngineSnapshot({ isBuffering: true });
            break;
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackError, (error: any) => {
        // Handle playback errors (stream failures, network issues, codec problems)
        logger.error("[Player] PlaybackError event", error);
        
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });
        
        // Show user-friendly error message
        const errorMsg = error?.message || error?.code || "Playback failed";
        showPlaybackNotice(`Playback error: ${errorMsg}`);
        
        // Log detailed error for debugging
        if (error?.code) logger.error("[Player] Error code:", error.code);
        if (currentSongRef.current) {
          logger.error("[Player] Failed song:", currentSongRef.current.title);
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackQueueEnded, () => {
        nextSongRef.current();
      }),
      subscribeTrackPlayerEvent(Event.RemoteNext, () => {
        nextSongRef.current();
      }),
      subscribeTrackPlayerEvent(Event.RemotePrevious, () => {
        prevSongRef.current();
      }),
      subscribeTrackPlayerEvent(Event.RemotePlay, async () => {
        try {
          setIsPlaying(true);
          isPlayingRef.current = true;
          updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
          if (TrackPlayer) {
            await TrackPlayer.play();
          }
        } catch (err) {
          logger.error("[Player] RemotePlay error", err);
        }
      }),
      subscribeTrackPlayerEvent(Event.RemotePause, async () => {
        try {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
          if (TrackPlayer) {
            await TrackPlayer.pause();
          }
        } catch (err) {
          logger.error("[Player] RemotePause error", err);
        }
      }),
      subscribeTrackPlayerEvent(Event.RemoteStop, async () => {
        try {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
          if (TrackPlayer) {
            await TrackPlayer.stop();
          }
        } catch (err) {
          logger.error("[Player] RemoteStop error", err);
        }
      }),
      subscribeTrackPlayerEvent(Event.RemoteSeek, async (event: { position: number }) => {
        if (typeof event?.position === "number") {
          try {
            if (TrackPlayer) {
              await TrackPlayer.seekTo(event.position);
            }
            setNativePosition(event.position);
          } catch (err) {
            logger.error("[Player] RemoteSeek error", err);
          }
        }
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub?.());
    };
  }, [isPlayerReady, resolvedDuration]);

  // Load liked songs from Firestore when user auth state changes
  useEffect(() => {
    if (authUser?.id) {
      getLikedSongsFromFirestore(authUser.id)
        .then((songs) => {
          if (songs && songs.length > 0) {
            setLikedSongs(songs);
            setLikedSongIds(songs.map((s) => s.id));
            likedSongsRef.current = songs;
          }
        })
        .catch(() => {});
    }
  }, [authUser?.id]);

  // Save player state periodically and on background (only dependent on currentSong)
  useEffect(() => {
    if (!currentSong) return;
    const persist = () => {
      const song = currentSongRef.current;
      if (!song) return;
      Storage.savePlayerState({
        currentSong: song,
        queue: queueRef.current.length > 0 ? queueRef.current : [song],
        queueIndex: queueIndexRef.current,
        positionSeconds: positionSecondsRef.current,
        updatedAt: Date.now(),
      }).catch(() => {});
    };

    const interval = setInterval(persist, 6000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") persist();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
      persist();
    };
  }, [currentSong]);

  // Context Values
  const value = useMemo<PlayerContextValue>(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      isPlaying: resolvedIsPlaying,
      progress: resolvedProgress,
      duration: resolvedDurationMillis,
      positionMillis: resolvedPositionMillis,
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      isLoading: playbackLoading,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      shufflePlay,
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
      resolvedProgress,
      resolvedDurationMillis,
      resolvedPositionMillis,
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      playbackLoading,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      shufflePlay,
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

  const liteValue = useMemo<PlayerLiteContextValue>(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      sourceQueue,
      queueIndex,
      isPlaying: resolvedIsPlaying,
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      isLoading: playbackLoading,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      shufflePlay,
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
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      playbackLoading,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      shufflePlay,
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
      duration: resolvedDurationMillis,
      positionMillis: resolvedPositionMillis,
    }),
    [resolvedProgress, resolvedDurationMillis, resolvedPositionMillis]
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
      shufflePlay,
      togglePlay,
      toggleLike,
      toggleShuffle,
    }),
    [currentSong, queue, resolvedIsPlaying, likedSongs, playSong, shufflePlay, togglePlay, toggleLike, toggleShuffle]
  );

  const queueValue = useMemo(
    () => ({
      currentSong,
      queue,
      userQueuedSongIds,
      queueIndex,
      isShuffled,
      sleepTimer,
      playSong,
      shufflePlay,
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
      isShuffled,
      sleepTimer,
      playSong,
      shufflePlay,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      shuffleQueue,
    ]
  );

  const actionsValue = useMemo(
    () => ({
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      shufflePlay,
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
      isShuffled,
      repeatMode,
      likedSongIds,
      likedSongs,
      albumColor,
      textColor,
      sleepTimer,
      playSong,
      shufflePlay,
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

  const likedValue = useMemo<PlayerLikedContextValue>(
    () => ({
      likedSongs,
      likedSongIds,
      likedSongsCount: likedSongs.length,
      isLiked,
      toggleLike,
    }),
    [likedSongs, likedSongIds, isLiked, toggleLike]
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerLiteContext.Provider value={liteValue}>
        <PlayerProgressContext.Provider value={progressValue}>
          <PlayerActionsContext.Provider value={actionsValue}>
            <PlayerLikedContext.Provider value={likedValue}>
              <PlayerBrowseContext.Provider value={browseValue}>
                <PlayerQueueContext.Provider value={queueValue}>
                  <PlayerRowContext.Provider value={rowValue}>
                    <View style={{ flex: 1 }}>{children}</View>
                  </PlayerRowContext.Provider>
                </PlayerQueueContext.Provider>
              </PlayerBrowseContext.Provider>
            </PlayerLikedContext.Provider>
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

export function useLikedSongs() {
  const ctx = use(PlayerLikedContext);
  if (!ctx) throw new Error("useLikedSongs must be used within PlayerProvider");
  return ctx;
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
