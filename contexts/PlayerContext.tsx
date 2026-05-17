import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Alert, AppState, InteractionManager, Platform, ToastAndroid } from "react-native";
import { isRunningInExpoGo } from "expo";
import { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";
import * as ExpoAvPlayer from "@/lib/expoAvPlayer";
import {
  beginPlaybackTransaction,
  completePlaybackTransaction,
  failPlaybackTransaction,
  updatePlaybackEngineSnapshot,
} from "@/lib/playbackEngine";
import type { PlaybackCommandType } from "@/lib/playbackEngine";

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

const isExpoGoRuntime = isRunningInExpoGo();
// Production/dev builds use the native TrackPlayer module on both iOS and Android.
// Expo Go falls back to expo-audio because it does not include the native module.
const isNativeTrackPlayerAvailable = Platform.OS !== "web" && !isExpoGoRuntime;
const canUseLightweightAudioFallback = isExpoGoRuntime;
const shouldEagerlySetupNativePlayer = isNativeTrackPlayerAvailable;
const nativePlayerUnavailableMessage = isExpoGoRuntime
  ? "Use the development build or installed APK. Expo Go does not include the native music player."
  : "Native music player is not available in this runtime.";

if (isNativeTrackPlayerAvailable) {
  try {
    const trackPlayerModule = require("react-native-track-player");
    TrackPlayer = trackPlayerModule.default;
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
    const parts = value
      .split(":")
      .map((part) => Number(part.trim()))
      .filter((part) => Number.isFinite(part) && part >= 0);

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
  downloadUrl?: string | { url?: string; link?: string };
};

function readNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function resolveAudioUrl(source: SongPlaybackSource | null | undefined): string {
  if (!source) return "";

  const directCandidates = [source.audioUrl, source.url, source.uri, source.streamUrl];
  for (const candidate of directCandidates) {
    const value = readNonEmptyString(candidate);
    if (value) return value;
  }

  const downloadUrlValue = source.downloadUrl;
  if (typeof downloadUrlValue === "string") {
    return readNonEmptyString(downloadUrlValue);
  }

  if (downloadUrlValue && typeof downloadUrlValue === "object") {
    const nestedValue =
      readNonEmptyString(downloadUrlValue.url) || readNonEmptyString(downloadUrlValue.link);
    if (nestedValue) return nestedValue;
  }

  return "";
}

function normalizePlayableSong(song: Song | null | undefined): Song | null {
  if (!song?.id) return null;
  const resolvedAudioUrl = resolveAudioUrl(song as SongPlaybackSource);
  if (!resolvedAudioUrl) return null;

  if (song.audioUrl === resolvedAudioUrl) {
    return song;
  }

  return {
    ...song,
    audioUrl: resolvedAudioUrl,
  };
}

function songToTrack(song: Song, localUrl?: string | null): any {
  const audioUrl = localUrl || resolveAudioUrl(song as SongPlaybackSource);
  const durationSeconds = toDurationSeconds(song.duration);
  
  return {
    id: song.id,
    url: audioUrl,
    title: song.title,
    artist: song.artist,
    album: song.album || "",
    genre: song.genre || "",
    artwork: song.coverUrl,
    duration: durationSeconds,
  };
}

/** Resolve the best playback URL for a song — local file first, then stream. */
async function resolvePlaybackUrl(song: Song): Promise<string | null> {
  try {
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
  return null;
}

function isPlayableSong(song: Song | null | undefined): song is Song {
  return Boolean(song?.id && resolveAudioUrl(song as SongPlaybackSource));
}

function isSameQueueById(a: Song[], b: Song[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

const OPTIMISTIC_NATIVE_TRACK_SYNC_GRACE_MS = 1800;

export function PlayerProvider({ children }: { children: ReactNode }) {
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
  const [isLoading, setIsLoading] = useState(false);
  const [playbackIntent, setPlaybackIntent] = useState<boolean | null>(null);
  const [albumColor, setAlbumColor] = useState("#282828");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerState | null>(null);
  const [seekOverrideSeconds, setSeekOverrideSeconds] = useState<number | null>(null);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);
  const previewIsPlayingRef = useRef(false); // ref so togglePlay never has stale closure
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewIsShuffled, setPreviewIsShuffled] = useState(false);
  const [previewRepeatMode, setPreviewRepeatMode] = useState<"off" | "all" | "one">("off");
  const [runtimeProgressSnapshot, setRuntimeProgressSnapshot] = useState({
    position: 0,
    duration: 0,
  });
  const [runtimePlaybackStateSnapshot, setRuntimePlaybackStateSnapshot] = useState<any>(undefined);
  const PRELOAD_QUEUE_SIZE = 20;

  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const userQueuedSongIdsRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const isShuffledRef = useRef(false);
  const previewRepeatModeRef = useRef<"off" | "all" | "one">("off");
  const originalQueueRef = useRef<Song[]>([]);
  const playRequestIdRef = useRef(0);
  const seekOverrideRef = useRef<number | null>(null);
  const seekOverrideSinceRef = useRef(0);
  const seekRequestIdRef = useRef(0);
  const lastPlaybackNoticeAtRef = useRef(0);
  const restoredPositionSecondsRef = useRef(0);
  const latestPositionSecondsRef = useRef(0);
  const sleepTimerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<SleepTimerState | null>(null);
  const playbackSwitchChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingNativeTrackRef = useRef<{
    id: string;
    index: number;
    startedAt: number;
    transactionId: number;
  } | null>(null);

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
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
    setCurrentSong((prev) => (prev?.id === nextSong.id ? prev : nextSong));
    updatePlaybackEngineSnapshot({
      currentSong: nextSong,
      queue: cq,
      queueIndex: nextIndex,
      isLoading: false,
      isBuffering: false,
    });
    return true;
  }, [shouldAcceptNativeTrackSync]);

  const failPendingNativeTrack = useCallback((message: string) => {
    const pending = pendingNativeTrackRef.current;
    if (!pending) return;
    failPlaybackTransaction(pending.transactionId, message);
    pendingNativeTrackRef.current = null;
  }, []);

  // ── Restore player state on mount (show mini player with last song) ────────
  useEffect(() => {
    let mounted = true;

    Storage.loadPlayerState().then(async (saved) => {
      if (!mounted || !saved?.currentSong) return;

      // Restore UI state
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

    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const playbackStateValue =
    playbackState && typeof playbackState === "object" && "state" in playbackState
      ? playbackState.state
      : playbackState;
  const isPlaying = playbackStateValue === State.Playing;
  const currentSongDurationSeconds = toDurationSeconds(currentSong?.duration);
  const queueSongDurationSeconds = toDurationSeconds(queue[queueIndex]?.duration);
  const sourceQueueSongDurationSeconds = toDurationSeconds(sourceQueue[queueIndex]?.duration);
  const hookPosition = Number.isFinite(position) ? Math.max(0, position) : 0;
  const hookTrackDuration = Number.isFinite(trackDuration) ? Math.max(0, trackDuration) : 0;
  const runtimePosition = Number.isFinite(runtimeProgressSnapshot.position)
    ? Math.max(0, runtimeProgressSnapshot.position)
    : 0;
  const runtimeTrackDuration = Number.isFinite(runtimeProgressSnapshot.duration)
    ? Math.max(0, runtimeProgressSnapshot.duration)
    : 0;
  const safePosition =
    Platform.OS === "android"
      ? hookTrackDuration > 0 || hookPosition > 0
        ? hookPosition
        : runtimePosition
      : hookPosition;
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
  const effectivePositionSeconds = seekOverrideSeconds ?? safePosition;
  const progress =
    effectiveTrackDurationSeconds > 0
      ? Math.max(0, Math.min(1, effectivePositionSeconds / effectiveTrackDurationSeconds))
      : 0;
  const positionMillis = effectivePositionSeconds * 1000;
  const duration = effectiveTrackDurationSeconds * 1000;
  const isPreviewSession = canUseLightweightAudioFallback && !canUseNativePlayback && Boolean(currentSong);
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
      isLoading,
      isShuffled: resolvedIsShuffled,
      repeatMode: resolvedRepeatMode,
    });
  }, [
    currentSong,
    isLoading,
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

    const timeout = setTimeout(() => {
      setPlaybackIntent(null);
    }, 1800);

    return () => {
      clearTimeout(timeout);
    };
  }, [playbackIntent]);

  useEffect(() => {
    latestPositionSecondsRef.current = Math.max(0, effectivePositionSeconds);
  }, [effectivePositionSeconds]);

  useEffect(() => {
    const songId = currentSong?.id;
    if (!songId) return;
    if (userQueuedSongIdsRef.current[0] === songId) {
      replaceUserQueuedSongIds(userQueuedSongIdsRef.current.slice(1));
    }
  }, [currentSong?.id, replaceUserQueuedSongIds]);

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

  // ── Persist restored mini-player state without writing on every progress tick
  useEffect(() => {
    if (!currentSong) return;
    persistCurrentPlayerState();
  }, [currentSong?.id, queueIndex, persistCurrentPlayerState]);

  useEffect(() => {
    if (!currentSong) return;

    const interval = setInterval(persistCurrentPlayerState, 5000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        persistCurrentPlayerState();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
      persistCurrentPlayerState();
    };
  }, [currentSong?.id, persistCurrentPlayerState]);

  useEffect(() => {
    if (!isPreviewSession) return;
    setPreviewProgress(0);
  }, [currentSong?.id, isPreviewSession]);

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

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
    sleepTimerRef.current = null;
    setSleepTimerState(null);
  }, []);

  const pauseForSleepTimer = useCallback(async () => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
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
  }, []);

  const setSleepTimer = useCallback((selection: SleepTimerSelection) => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }

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
  }, [pauseForSleepTimer]);

  useEffect(() => {
    return () => {
      if (sleepTimerTimeoutRef.current) {
        clearTimeout(sleepTimerTimeoutRef.current);
      }
    };
  }, []);

  // Wire expo-audio status + error callbacks for runtimes using the lightweight fallback.
  useEffect(() => {
    if (!canUseLightweightAudioFallback) return;
    let mounted = true;

    ExpoAvPlayer.onError((err) => {
      if (!mounted) return;
      logger.warn("[ExpoAudio] Playback error", err);
      showPlaybackNotice("Could not play this song.");
    });

    ExpoAvPlayer.onStatusUpdate(({ isPlaying, position, duration, didJustFinish }) => {
      if (!mounted) return;
      previewIsPlayingRef.current = isPlaying;
      setPreviewIsPlaying(isPlaying);
      if (duration > 0) {
        setPreviewDuration(duration * 1000);
        setPreviewProgress(position / duration);
      }
      // Auto-advance to next song when current one finishes
      if (didJustFinish) {
        const cq = queueRef.current;
        const ci = queueIndexRef.current;
        const rm = previewRepeatModeRef.current;
        let ni = ci + 1;
        if (ni >= cq.length) {
          if (rm === "all") ni = 0;
          else {
            if (sleepTimerRef.current?.mode === "end-of-stack") {
              clearSleepTimer();
            }
            previewIsPlayingRef.current = false;
            setPreviewIsPlaying(false);
            return;
          }
        }
        const nextTrack = cq[ni];
        if (!nextTrack) return;
        const url = resolveAudioUrl(nextTrack as SongPlaybackSource);
        if (!url) return;
        setQueueIndex(ni);
        queueIndexRef.current = ni;
        setCurrentSong(nextTrack);
        setPreviewProgress(0);
        void ExpoAvPlayer.loadAndPlay(url);
      }
    });

    return () => {
      mounted = false;
      ExpoAvPlayer.destroy();
    };
  }, [clearSleepTimer, showPlaybackNotice]);

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
            const activeTrack = await TrackPlayer.getActiveTrack();
            if (!mounted || !activeTrack?.id) return;
            const cq = queueRef.current;
            const mappedIndex = cq.findIndex((s) => String(s.id) === String(activeTrack.id));
            if (mappedIndex >= 0) {
              applyNativeTrackIndex(mappedIndex, String(activeTrack.id));
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
        const [runtimeProgress, activeTrack, activeTrackIndex, runtimePlaybackState] = await Promise.all([
          TrackPlayer.getProgress(),
          TrackPlayer.getActiveTrack(),
          typeof TrackPlayer.getActiveTrackIndex === "function"
            ? TrackPlayer.getActiveTrackIndex()
            : Promise.resolve(undefined),
          TrackPlayer.getPlaybackState(),
        ]);
        if (!mounted) return;

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
        const currentQueue = queueRef.current;
        const mappedIndexById = activeTrackId
          ? currentQueue.findIndex((song) => String(song.id) === activeTrackId)
          : -1;
        const fallbackActiveIndex =
          typeof activeTrackIndex === "number" && Number.isFinite(activeTrackIndex) ? activeTrackIndex : -1;
        const nextQueueIndex = mappedIndexById >= 0 ? mappedIndexById : fallbackActiveIndex;

        setRuntimeProgressSnapshot((prev) => {
          const positionDelta = Math.abs(prev.position - nextPosition);
          const durationDelta = Math.abs(prev.duration - nextDuration);
          if (positionDelta < 0.04 && durationDelta < 0.04) {
            return prev;
          }
          return { position: nextPosition, duration: nextDuration };
        });
        setRuntimePlaybackStateSnapshot((prev: any) => (prev === nextPlaybackState ? prev : nextPlaybackState));

        if (nextQueueIndex >= 0 && nextQueueIndex < currentQueue.length) {
          applyNativeTrackIndex(nextQueueIndex, activeTrackId || null);
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
  }, [applyNativeTrackIndex, currentSong?.id, isPlayerReady]);

  useEffect(() => {
    if (seekOverrideSeconds == null) return;
    const drift = Math.abs(safePosition - seekOverrideSeconds);
    const age = Date.now() - seekOverrideSinceRef.current;
    if (drift <= 0.35 || age > 2200) {
      seekOverrideRef.current = null;
      setSeekOverrideSeconds(null);
    }
  }, [safePosition, seekOverrideSeconds]);

  useEffect(() => {
    seekOverrideRef.current = null;
    setSeekOverrideSeconds(null);
  }, [currentSong?.id]);

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
          setIsPlayerReady(false);
        }
        return;
      }

      try {
        await setupPlayer();
        if (mounted) {
          setIsPlayerReady(true);
        }
      } catch (error) {
        logger.error("[Player] TrackPlayer setup failed.", error);
        if (mounted) {
          setIsPlayerReady(false);
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
  }, []);

  useEffect(() => {
    let mounted = true;
    
    const loadLikedSongs = async () => {
      try {
        if (authUser?.id) {
          const firestoreSongs = await getLikedSongsFromFirestore(authUser.id);
          if (!mounted) return;

          setLikedSongs(firestoreSongs);
          setLikedSongIds(firestoreSongs.map((song) => song.id));
        } else {
          if (mounted) {
            setLikedSongIds([]);
            setLikedSongs([]);
          }
        }
      } catch (error) {
        if (mounted) {
          setLikedSongIds([]);
          setLikedSongs([]);
        }
      }
    };
    
    loadLikedSongs();

    return () => {
      mounted = false;
    };
  }, [authUser?.id]);

  useEffect(() => {
    if (!isPlayerReady) return;

    const syncFromTrackEvent = (event: any) => {
      try {
        const cq = queueRef.current;
        if (cq.length === 0) return;

        let nextIndex: number | undefined;
        if (typeof event?.index === "number") {
          nextIndex = event.index;
        } else if (typeof event?.nextTrack === "number") {
          nextIndex = event.nextTrack;
        }

        if (typeof nextIndex === "number" && nextIndex >= 0 && nextIndex < cq.length) {
          const nextSong = cq[nextIndex];
          applyNativeTrackIndex(nextIndex, nextSong?.id ? String(nextSong.id) : null);
          return;
        }

        const trackId = event?.track?.id;
        if (trackId == null) return;

        const normalizedId = String(trackId);
        const mappedIndex = cq.findIndex((song) => song.id === normalizedId);
        if (mappedIndex >= 0) {
          applyNativeTrackIndex(mappedIndex, normalizedId);
        }
      } catch {
        // Silent fail
      }
    };

    const activeTrackSubscription = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      syncFromTrackEvent
    );
    const trackChangedSubscription = Event.PlaybackTrackChanged
      ? TrackPlayer.addEventListener(Event.PlaybackTrackChanged, syncFromTrackEvent)
      : null;
    const playbackErrorSubscription = Event.PlaybackError
      ? TrackPlayer.addEventListener(Event.PlaybackError, (event: any) => {
          logger.warn("[Player] Native playback error", event);
          setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");
          showPlaybackNotice("Playback stopped. Please try this song again.");
        })
      : null;
    const queueEndedSubscription = Event.PlaybackQueueEnded
      ? TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
          setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");
          if (sleepTimerRef.current?.mode === "end-of-stack") {
            clearSleepTimer();
          }
        })
      : null;

    return () => {
      activeTrackSubscription.remove();
      if (trackChangedSubscription) {
        trackChangedSubscription.remove();
      }
      if (playbackErrorSubscription) {
        playbackErrorSubscription.remove();
      }
      if (queueEndedSubscription) {
        queueEndedSubscription.remove();
      }
    };
  }, [applyNativeTrackIndex, clearSleepTimer, isPlayerReady, showPlaybackNotice]);

  // Listen for Android Auto queue replacements so we can sync currentSong immediately
  // without waiting for PlaybackActiveTrackChanged (which fires after the queue is set)
  useEffect(() => {
    if (!isPlayerReady || Platform.OS !== "android") {
      return;
    }

    const { DeviceEventEmitter } = require("react-native");
    const subscription = DeviceEventEmitter.addListener(
      "AutoQueueApplied",
      (event: { tracks: Song[]; startIndex: number; queueTitle: string }) => {
        try {
          const { tracks, startIndex } = event;
          if (!Array.isArray(tracks) || tracks.length === 0) return;
          const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
          setQueue(tracks);
          setSourceQueue(tracks);
          queueRef.current = tracks;
          clearUserQueuedSongIds();
          originalQueueRef.current = tracks;
          setQueueIndex(safeIndex);
          queueIndexRef.current = safeIndex;
          setCurrentSong(tracks[safeIndex]);
        } catch {
          // Silent fail
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [isPlayerReady]);

  useEffect(() => {
    if (!isPlayerReady || Platform.OS !== "android") {
      return;
    }

    const { NativeEventEmitter, NativeModules } = require("react-native");
    const autoPlayModule = NativeModules.AutoPlayModule;
    if (!autoPlayModule) {
      return;
    }

    try {
      const emitter = new NativeEventEmitter(autoPlayModule);
      const subscription = emitter.addListener("AutoTransportCommand", (payload: unknown) => {
        if (typeof payload !== "string" || payload.trim().length === 0) {
          return;
        }

        try {
          const parsed = JSON.parse(payload) as { command?: string; queueIndex?: number };
          const currentQueue = queueRef.current;

          switch (parsed.command) {
            case "play":
              setRuntimePlaybackStateSnapshot(State.Playing);
              break;
            case "pause":
            case "stop":
              setRuntimePlaybackStateSnapshot(State.Paused ?? "paused");
              break;
            case "next": {
              const nextIndex = queueIndexRef.current + 1;
              const nextSong = currentQueue[nextIndex];
              if (!nextSong) return;
              setQueueIndex(nextIndex);
              queueIndexRef.current = nextIndex;
              setCurrentSong(nextSong);
              break;
            }
            case "skipToQueueItem": {
              if (typeof parsed.queueIndex !== "number" || !Number.isFinite(parsed.queueIndex)) {
                return;
              }
              const nextIndex = Math.max(0, Math.min(parsed.queueIndex, currentQueue.length - 1));
              const nextSong = currentQueue[nextIndex];
              if (!nextSong) return;
              setQueueIndex(nextIndex);
              queueIndexRef.current = nextIndex;
              setCurrentSong(nextSong);
              break;
            }
            default:
              break;
          }
        } catch {
          // Ignore malformed transport payloads.
        }
      });

      return () => {
        subscription.remove();
      };
    } catch {
      return;
    }
  }, [isPlayerReady]);

  const runSerializedPlaybackSwitch = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = playbackSwitchChainRef.current;
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

  const nativeQueueHasTrackAt = useCallback(async (index: number, songId: string): Promise<boolean> => {
    if (!TrackPlayer || index < 0 || !songId) {
      return false;
    }

    try {
      const nativeQueue = await TrackPlayer.getQueue();
      return String(nativeQueue?.[index]?.id ?? "") === String(songId);
    } catch {
      return false;
    }
  }, []);

  const appendRemainingTracksIfCurrent = useCallback((requestId: number, tracks: any[]) => {
    if (!TrackPlayer || tracks.length === 0) return;

    void runSerializedPlaybackSwitch(async () => {
      if (requestId !== playRequestIdRef.current) return;
      await TrackPlayer.add(tracks);
    }).catch(() => {
      // Silent background queue append failure.
    });
  }, [runSerializedPlaybackSwitch]);

  const loadAndPlaySong = useCallback(async (song: Song, newQueue?: Song[], newIndex?: number) => {
    const requestId = ++playRequestIdRef.current;
    setPlaybackIntent(true);
    const playableQueue = (newQueue || [song])
      .map(normalizePlayableSong)
      .filter((item): item is Song => Boolean(item));
    if (playableQueue.length === 0) {
      setPlaybackIntent(null);
      updatePlaybackEngineSnapshot({ desiredPlayState: null, isLoading: false, isBuffering: false });
      return;
    }

    const requestedIndex =
      typeof newIndex === "number" && newIndex >= 0 && newIndex < playableQueue.length
        ? newIndex
        : playableQueue.findIndex((s) => s.id === song.id);
    const targetIndex = requestedIndex >= 0 ? requestedIndex : 0;
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
        setIsLoading(true);
        updatePlaybackEngineSnapshot({ isLoading: true });

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        const ready = await ensurePlayerReady();
        if (!ready) {
          showPlaybackNotice("Player not ready yet. Please try again.");
          return;
        }

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        const nativeQueueMatchesTarget = queueIsSame
          ? await nativeQueueHasTrackAt(targetIndex, targetSong.id)
          : false;

        if (queueIsSame && nativeQueueMatchesTarget) {
          // Fast path: queue unchanged and native queue is confirmed in sync.
          // Do not remove/re-add the active track here; rebuilding is safer
          // than indexed native mutation if the URL source needs to change.
          await TrackPlayer.skip(targetIndex);
          await TrackPlayer.play();
          return;
        }

        // Resolve local file URLs for ALL songs in the initial batch.
        const preloadCount = Math.max(
          Math.min(playableQueue.length, PRELOAD_QUEUE_SIZE),
          targetIndex + 1
        );
        const localUrlMap = new Map<string, string>();
        await Promise.allSettled(
          playableQueue.slice(0, preloadCount).map(async (s) => {
            const local = await resolvePlaybackUrl(s).catch(() => null);
            if (local) localUrlMap.set(s.id, local);
          })
        );

        const tracks = playableQueue.map((s) => songToTrack(s, localUrlMap.get(s.id)));
        const initialTracks = tracks.slice(0, preloadCount);
        const remainingTracks = tracks.slice(preloadCount);

        if (typeof TrackPlayer.setQueue === "function") {
          await TrackPlayer.setQueue(initialTracks);
          if (targetIndex > 0) {
            await TrackPlayer.skip(targetIndex);
          }
          await TrackPlayer.play();

          appendRemainingTracksIfCurrent(requestId, remainingTracks);
        } else {
          await TrackPlayer.reset();
          await TrackPlayer.add(initialTracks);
          if (targetIndex > 0) {
            await TrackPlayer.skip(targetIndex);
          }
          await TrackPlayer.play();

          appendRemainingTracksIfCurrent(requestId, remainingTracks);
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
        failPendingNativeTrack("Could not start playback.");
        logger.error("[Player] loadAndPlaySong failed", {
          error,
          songId: song?.id,
          songAudioUrl: song?.audioUrl,
        });
        showPlaybackNotice("Could not start playback.");
      } finally {
        if (requestId === playRequestIdRef.current) {
          setIsLoading(false);
          updatePlaybackEngineSnapshot({ isLoading: false });
        }
      }
    });
  }, [appendRemainingTracksIfCurrent, clearUserQueuedSongIds, ensurePlayerReady, failPendingNativeTrack, markPendingNativeTrack, nativeQueueHasTrackAt, runSerializedPlaybackSwitch, showPlaybackNotice]);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    if (!TrackPlayer || !setupPlayer) {
      if (canUseLightweightAudioFallback) {
        // iOS / Expo Go: use expo-audio instead of the native TrackPlayer stack.
        const fallbackQueue = (newQueue || [song]).filter((item): item is Song => Boolean(item?.id));
        if (fallbackQueue.length === 0) {
          showPlaybackNotice("Could not play this song.");
          return;
        }
        const targetIndex = Math.max(0, fallbackQueue.findIndex((s) => s.id === song.id));
        const targetSong = fallbackQueue[targetIndex] ?? fallbackQueue[0];
        const audioUrl = resolveAudioUrl(targetSong as SongPlaybackSource);
        if (!audioUrl) {
          logger.warn("[ExpoAv] No audio URL for song", { id: targetSong.id, title: targetSong.title });
          showPlaybackNotice("This song has no playable audio URL.");
          return;
        }
        setQueue(fallbackQueue);
        setSourceQueue(fallbackQueue);
        queueRef.current = fallbackQueue;
        clearUserQueuedSongIds();
        originalQueueRef.current = fallbackQueue;
        setQueueIndex(targetIndex);
        queueIndexRef.current = targetIndex;
        setCurrentSong(targetSong);
        updatePlaybackEngineSnapshot({
          currentSong: targetSong,
          queue: fallbackQueue,
          sourceQueue: fallbackQueue,
          userQueuedSongIds: [],
          queueIndex: targetIndex,
          desiredPlayState: true,
          isPlaying: true,
          isLoading: false,
          isBuffering: false,
        });
        setPreviewProgress(0);
        setPreviewIsShuffled(false);
        setPreviewRepeatMode("off");
        previewIsPlayingRef.current = true;
        setPreviewIsPlaying(true);
        // Play via expo-audio
        void ExpoAvPlayer.loadAndPlay(audioUrl);
        return;
      }
      showPlaybackNotice(nativePlayerUnavailableMessage);
      return;
    }

    const normalizedSong = normalizePlayableSong(song);
    if (!normalizedSong) {
      logger.warn("[Player] Tapped song is not playable", {
        tappedSongId: song?.id,
        tappedSongAudioUrl: resolveAudioUrl(song as SongPlaybackSource),
      });
      showPlaybackNotice("This song has no playable audio URL.");
      return;
    }

    const q = (newQueue || [song])
      .map(normalizePlayableSong)
      .filter((item): item is Song => Boolean(item));
    if (q.length === 0) {
      logger.warn("[Player] No playable songs in queue", {
        tappedSongId: normalizedSong.id,
        tappedSongAudioUrl: normalizedSong.audioUrl,
        queueSize: (newQueue || [song]).length,
      });
      showPlaybackNotice("This song has no playable audio URL.");
      return;
    }
    const idx = q.findIndex((s) => s.id === normalizedSong.id);
    if (idx < 0) {
      logger.warn("[Player] Tapped song missing from playable queue", {
        tappedSongId: normalizedSong.id,
        queueSize: q.length,
      });
      showPlaybackNotice("Could not play selected song.");
      return;
    }
    const targetIndex = idx;
    loadAndPlaySong(q[targetIndex], q, targetIndex);
  }, [clearUserQueuedSongIds, loadAndPlaySong, showPlaybackNotice]);

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
            setPlaybackIntent(true);
            updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true, isBuffering: false });
            previewIsPlayingRef.current = true;
            setPreviewIsPlaying(true);
            // If no URL loaded yet (e.g. after app reopen), load first then play
            if (!ExpoAvPlayer.isLoaded()) {
              const url = resolveAudioUrl(currentSong as any);
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
      const currentQueue = (queueRef.current.length > 0 ? queueRef.current : currentSong ? [currentSong] : [])
        .map(normalizePlayableSong)
        .filter((item): item is Song => Boolean(item));
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
      const nativeQueueReady = await nativeQueueHasTrackAt(targetIndex, targetSong.id);
      if (!nativeQueueReady) {
        await loadAndPlaySong(targetSong, currentQueue.length > 0 ? currentQueue : [targetSong], targetIndex);
        const resumeAt = restoredPositionSecondsRef.current;
        if (resumeAt > 1) {
          await TrackPlayer.seekTo(resumeAt).catch(() => {});
        }
        restoredPositionSecondsRef.current = 0;
        return;
      }

      await TrackPlayer.play();
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
  }, [currentSong, ensurePlayerReady, isPlayerReady, loadAndPlaySong, nativeQueueHasTrackAt, resolvedIsPlaying, showPlaybackNotice]);

  const nextSong = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback) {
          const cq = queueRef.current;
          const ci = queueIndexRef.current;
          if (cq.length === 0) return;
          let ni = ci + 1;
          if (ni >= cq.length) {
            if (previewRepeatMode === "all") ni = 0;
            else return;
          }
          setPlaybackIntent(true);
          setQueueIndex(ni);
          queueIndexRef.current = ni;
          setCurrentSong(cq[ni]);
          updatePlaybackEngineSnapshot({
            currentSong: cq[ni],
            queue: cq,
            queueIndex: ni,
            desiredPlayState: true,
            isPlaying: true,
            isLoading: false,
            isBuffering: false,
          });
          setPreviewProgress(0);
          previewIsPlayingRef.current = true;
          setPreviewIsPlaying(true);
          const url = resolveAudioUrl(cq[ni] as SongPlaybackSource);
          if (url) void ExpoAvPlayer.loadAndPlay(url);
        }
        return;
      }
      const cq = queueRef.current;
      const ci = queueIndexRef.current;
      if (cq.length === 0) return;
      
      let ni = ci + 1;
      if (ni >= cq.length) {
        if (repeatModeRef.current === "all") ni = 0; 
        else return;
      }

      // Update state first for immediate UI feedback
      setPlaybackIntent(true);
      markPendingNativeTrack(ni, cq[ni], "skipNext");
      setQueueIndex(ni);
      queueIndexRef.current = ni;
      setCurrentSong(cq[ni]);
      updatePlaybackEngineSnapshot({
        currentSong: cq[ni],
        queue: cq,
        queueIndex: ni,
        desiredPlayState: true,
        isPlaying: true,
        isLoading: false,
        isBuffering: false,
      });

      let ready = isPlayerReady;
      if (!ready) {
        ready = await ensurePlayerReady();
        if (!ready) {
          setPlaybackIntent(null);
          return;
        }
      }

      // Then perform TrackPlayer operations smoothly
      const nativeQueueMatchesTarget = await nativeQueueHasTrackAt(ni, cq[ni].id);
      if (!nativeQueueMatchesTarget) {
        if (queueIndexRef.current !== ni || queueRef.current[ni]?.id !== cq[ni].id) return;
        await loadAndPlaySong(cq[ni], cq, ni);
        return;
      }
      await runSerializedPlaybackSwitch(async () => {
        if (queueIndexRef.current !== ni || queueRef.current[ni]?.id !== cq[ni].id) return;
        await TrackPlayer.skip(ni);
        await TrackPlayer.play();
      });
    } catch (error) {
      failPendingNativeTrack("Could not skip to next track.");
      // Silent fail
    }
  }, [ensurePlayerReady, failPendingNativeTrack, isPlayerReady, loadAndPlaySong, markPendingNativeTrack, nativeQueueHasTrackAt, previewRepeatMode, runSerializedPlaybackSwitch]);

  const prevSong = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback) {
          const cq = queueRef.current;
          const ci = queueIndexRef.current;
          if (cq.length === 0) return;
          if (previewProgress > 0.03) {
            await ExpoAvPlayer.seekTo(0);
            setPreviewProgress(0);
            return;
          }
          let pi = ci - 1;
          if (pi < 0) {
            if (previewRepeatMode === "all") pi = cq.length - 1;
            else { await ExpoAvPlayer.seekTo(0); setPreviewProgress(0); return; }
          }
          setPlaybackIntent(true);
          setQueueIndex(pi);
          queueIndexRef.current = pi;
          setCurrentSong(cq[pi]);
          updatePlaybackEngineSnapshot({
            currentSong: cq[pi],
            queue: cq,
            queueIndex: pi,
            desiredPlayState: true,
            isPlaying: true,
            isLoading: false,
            isBuffering: false,
          });
          setPreviewProgress(0);
          previewIsPlayingRef.current = true;
          setPreviewIsPlaying(true);
          const url = resolveAudioUrl(cq[pi] as SongPlaybackSource);
          if (url) void ExpoAvPlayer.loadAndPlay(url);
        }
        return;
      }
      const cq = queueRef.current;
      const ci = queueIndexRef.current;
      if (cq.length === 0) return;
      
      if (safePosition > 3) {
        await TrackPlayer.seekTo(0);
        return;
      }
      
      let pi = ci - 1;
      if (pi < 0) {
        if (repeatModeRef.current === "all") {
          pi = cq.length - 1;
        } else {
          await TrackPlayer.seekTo(0);
          return;
        }
      }

      // Update state first for immediate UI feedback
      setPlaybackIntent(true);
      markPendingNativeTrack(pi, cq[pi], "skipPrevious");
      setQueueIndex(pi);
      queueIndexRef.current = pi;
      setCurrentSong(cq[pi]);
      updatePlaybackEngineSnapshot({
        currentSong: cq[pi],
        queue: cq,
        queueIndex: pi,
        desiredPlayState: true,
        isPlaying: true,
        isLoading: false,
        isBuffering: false,
      });

      let ready = isPlayerReady;
      if (!ready) {
        ready = await ensurePlayerReady();
        if (!ready) {
          setPlaybackIntent(null);
          return;
        }
      }

      // Then perform TrackPlayer operations smoothly
      const nativeQueueMatchesTarget = await nativeQueueHasTrackAt(pi, cq[pi].id);
      if (!nativeQueueMatchesTarget) {
        if (queueIndexRef.current !== pi || queueRef.current[pi]?.id !== cq[pi].id) return;
        await loadAndPlaySong(cq[pi], cq, pi);
        return;
      }
      await runSerializedPlaybackSwitch(async () => {
        if (queueIndexRef.current !== pi || queueRef.current[pi]?.id !== cq[pi].id) return;
        await TrackPlayer.skip(pi);
        await TrackPlayer.play();
      });
    } catch (error) {
      failPendingNativeTrack("Could not skip to previous track.");
      // Silent fail
    }
  }, [ensurePlayerReady, failPendingNativeTrack, isPlayerReady, loadAndPlaySong, markPendingNativeTrack, nativeQueueHasTrackAt, previewProgress, previewRepeatMode, runSerializedPlaybackSwitch, safePosition]);

  const seekTo = useCallback(async (p: number) => {
    let seekRequestId = 0;
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (canUseLightweightAudioFallback) {
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

      seekOverrideRef.current = posSeconds;
      seekOverrideSinceRef.current = Date.now();
      setSeekOverrideSeconds(posSeconds);

      await TrackPlayer.seekTo(posSeconds);
    } catch (error) {
      if (seekRequestId === seekRequestIdRef.current) {
        seekOverrideRef.current = null;
        setSeekOverrideSeconds(null);
      }
    }
  }, [currentSong?.duration, effectiveTrackDurationSeconds, isPlayerReady, previewDuration]);

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
        setPreviewIsShuffled((prev) => {
          const next = !prev;
          applyShuffleState(next);
          return next;
        });
      }
      return;
    }
    
    await runSerializedPlaybackSwitch(async () => {
      const applied = applyShuffleState(!isShuffledRef.current);
      if (!applied) return;
      const { currentSongItem, nextQueue } = applied;
      if (!isPlayerReady) return;

      const validSongs = nextQueue
        .map(normalizePlayableSong)
        .filter((item): item is Song => Boolean(item));
      if (validSongs.length === 0) return;

      const nativeIndex = Math.max(0, validSongs.findIndex((song) => song.id === currentSongItem.id));
      await TrackPlayer.reset();
      await TrackPlayer.add(validSongs.map((song) => songToTrack(song)));
      await TrackPlayer.skip(nativeIndex);
      if (resolvedIsPlaying) {
        await TrackPlayer.play();
      }
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

      if (!TrackPlayer || !setupPlayer) {
        if (!canUseLightweightAudioFallback) {
          return;
        }
        setQueue(prev => {
          const ci = queueIndexRef.current;
          const insertIndex = Math.max(
            0,
            Math.min(ci + 1 + userQueuedSongIdsRef.current.length, prev.length)
          );
          const next = [...prev];
          next.splice(insertIndex, 0, normalizedSong);
          queueRef.current = next;
          return next;
        });
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

      if (!TrackPlayer || !setupPlayer) {
        if (!canUseLightweightAudioFallback) {
          return;
        }
        setQueue(prev => {
          const ci = queueIndexRef.current;
          const next = [...prev];
          next.splice(ci + 1, 0, normalizedSong);
          queueRef.current = next;
          return next;
        });
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
        await TrackPlayer.add(songToTrack(normalizedSong), insertIndex);
        return;
      }

      const activeSongId = currentQueue[ci]?.id ?? currentSongRef.current?.id ?? normalizedSong.id;
      const validSongs = next
        .map(normalizePlayableSong)
        .filter((item): item is Song => Boolean(item));
      const activeIndex = Math.max(0, validSongs.findIndex((song) => song.id === activeSongId));
      await TrackPlayer.reset();
      await TrackPlayer.add(validSongs.map((song) => songToTrack(song)));
      await TrackPlayer.skip(activeIndex);
      if (resolvedIsPlaying) {
        await TrackPlayer.play();
      }
    } catch (error) {
      setPlaybackIntent(null);
      // Silent fail
    }
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

      const validSongs = next
        .map(normalizePlayableSong)
        .filter((item): item is Song => Boolean(item));
      await TrackPlayer.reset();
      if (validSongs.length === 0) return;
      await TrackPlayer.add(validSongs.map((song) => songToTrack(song)));
      const activeSongId = next[nextIndex]?.id ?? validSongs[0].id;
      const nativeActiveIndex = Math.max(0, validSongs.findIndex((song) => song.id === activeSongId));
      await TrackPlayer.skip(nativeActiveIndex);
      if (resolvedIsPlaying) {
        await TrackPlayer.play();
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
      await TrackPlayer.skip(activeIndex >= 0 ? activeIndex : 0);
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
        await TrackPlayer.reset();
        await TrackPlayer.add(songToTrack(cs));
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
      
      const validSongs = newQ
        .map(normalizePlayableSong)
        .filter((item): item is Song => Boolean(item));
      await TrackPlayer.add(validSongs.map((song) => songToTrack(song)));
      
      const currentSongId = newQ[ci]?.id;
      const validIndex = validSongs.findIndex(s => s.id === currentSongId);
      await TrackPlayer.skip(validIndex >= 0 ? validIndex : 0);
      if (resolvedIsPlaying) {
        await TrackPlayer.play();
      }
    } catch (error) {
      // Silent fail
    }
  }, [clearUserQueuedSongIds, isPlayerReady, resolvedIsPlaying]);

  const value = useMemo(() => ({
    currentSong, queue, userQueuedSongIds, sourceQueue, queueIndex, isPlaying: resolvedIsPlaying, progress: resolvedProgress, duration: resolvedDuration, positionMillis: resolvedPositionMillis,
    isShuffled: resolvedIsShuffled, repeatMode: resolvedRepeatMode, likedSongIds, likedSongs, isLoading, albumColor, textColor, sleepTimer,
    playSong, togglePlay, nextSong, prevSong, seekTo, toggleShuffle, toggleRepeat,
    toggleLike, isLiked, addToQueue, playNext, removeFromQueue, reorderQueue, clearQueue, shuffleQueue,
    setSleepTimer, clearSleepTimer, setAlbumColor, setTextColor,
  }), [currentSong, queue, userQueuedSongIds, sourceQueue, queueIndex, resolvedIsPlaying, resolvedProgress, resolvedDuration, resolvedPositionMillis,
    resolvedIsShuffled, resolvedRepeatMode, likedSongIds, likedSongs, isLoading, albumColor, textColor, sleepTimer, playSong, togglePlay, nextSong,
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
      isLoading,
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
      isLoading,
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
                <PlayerRowContext.Provider value={rowValue}>{children}</PlayerRowContext.Provider>
              </PlayerQueueContext.Provider>
            </PlayerBrowseContext.Provider>
          </PlayerActionsContext.Provider>
        </PlayerProgressContext.Provider>
      </PlayerLiteContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

export function usePlayerLite() {
  const ctx = useContext(PlayerLiteContext);
  if (!ctx) throw new Error("usePlayerLite must be used within PlayerProvider");
  return ctx;
}

export function usePlayerProgress() {
  const ctx = useContext(PlayerProgressContext);
  if (!ctx) throw new Error("usePlayerProgress must be used within PlayerProvider");
  return ctx;
}

export function usePlayerActions() {
  const ctx = useContext(PlayerActionsContext);
  if (!ctx) throw new Error("usePlayerActions must be used within PlayerProvider");
  return ctx;
}

export function usePlayerRow() {
  const ctx = useContext(PlayerRowContext);
  if (!ctx) throw new Error("usePlayerRow must be used within PlayerProvider");
  return ctx;
}

export function usePlayerBrowse() {
  const ctx = useContext(PlayerBrowseContext);
  if (!ctx) throw new Error("usePlayerBrowse must be used within PlayerProvider");
  return ctx;
}

export function usePlayerQueue() {
  const ctx = useContext(PlayerQueueContext);
  if (!ctx) throw new Error("usePlayerQueue must be used within PlayerProvider");
  return ctx;
}
