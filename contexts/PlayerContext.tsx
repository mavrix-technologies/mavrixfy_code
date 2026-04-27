import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Alert, Platform, ToastAndroid } from "react-native";
import { isRunningInExpoGo } from "expo";
import { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";
import * as ExpoAvPlayer from "@/lib/expoAvPlayer";

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
const isNativeTrackPlayerAvailable = Platform.OS !== "web" && !isExpoGoRuntime;
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

interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
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
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

type PlayerLiteContextValue = Omit<PlayerContextValue, "duration" | "positionMillis">;
const PlayerLiteContext = createContext<PlayerLiteContextValue | null>(null);

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
  queueIndex: number;
  playSong: (song: Song, queue?: Song[]) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
}

const PlayerQueueContext = createContext<PlayerQueueContextValue | null>(null);

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

function songToTrack(song: Song): any {
  const audioUrl = resolveAudioUrl(song as SongPlaybackSource);
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

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const canUseNativePlayback = Boolean(TrackPlayer && setupPlayer);
  
  // Get auth context properly
  const { user: authUser } = useAuth();

  const playbackState = usePlaybackState();
  const progressData = useProgress(250);
  const { position, duration: trackDuration } = progressData;

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [sourceQueue, setSourceQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [likedSongIds, setLikedSongIds] = useState<string[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [albumColor, setAlbumColor] = useState("#282828");
  const [textColor, setTextColor] = useState("#FFFFFF");
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
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const originalQueueRef = useRef<Song[]>([]);
  const playRequestIdRef = useRef(0);
  const seekOverrideRef = useRef<number | null>(null);
  const seekOverrideSinceRef = useRef(0);
  const seekRequestIdRef = useRef(0);
  const lastPlaybackNoticeAtRef = useRef(0);
  const playbackSwitchChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

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
  const isPreviewSession = isExpoGoRuntime && !canUseNativePlayback && Boolean(currentSong);
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
  const resolvedIsPlaying = isPreviewSession
    ? previewIsPlaying
    : Platform.OS === "android" && runtimePlaybackStateSnapshot !== undefined
      ? runtimeIsPlaying
      : isPlaying;

  useEffect(() => {
    if (!isPreviewSession) return;
    setPreviewProgress(0);
  }, [currentSong?.id, isPreviewSession]);

  // Wire expo-audio status + error callbacks (Expo Go only)
  useEffect(() => {
    if (!isExpoGoRuntime) return;

    ExpoAvPlayer.onError((err) => {
      logger.warn("[ExpoAudio] Playback error", err);
      showPlaybackNotice("Could not play this song.");
    });

    ExpoAvPlayer.onStatusUpdate(({ isPlaying, position, duration, didJustFinish }) => {
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
        const rm = repeatModeRef.current;
        let ni = ci + 1;
        if (ni >= cq.length) {
          if (rm === "all") ni = 0;
          else return;
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
  }, []);

  useEffect(() => {
    if (!TrackPlayer || !setupPlayer || !isPlayerReady || Platform.OS === "web") {
      return;
    }

    let mounted = true;
    // Only poll when app is in foreground — saves battery in background
    let appState = "active";
    const appStateSub = require("react-native").AppState.addEventListener(
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
              setQueueIndex(mappedIndex);
              queueIndexRef.current = mappedIndex;
              setCurrentSong((prev) => (prev?.id === cq[mappedIndex].id ? prev : cq[mappedIndex]));
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
          const nextSong = currentQueue[nextQueueIndex];
          if (queueIndexRef.current !== nextQueueIndex) {
            setQueueIndex(nextQueueIndex);
            queueIndexRef.current = nextQueueIndex;
          }
          if (nextSong?.id && currentSongRef.current?.id !== nextSong.id) {
            setCurrentSong(nextSong);
          }
        }
      } catch {
        // Silent runtime progress fallback failure
      }
    };

    void syncRuntimeProgress();
    const interval = setInterval(() => {
      void syncRuntimeProgress();
    }, Platform.OS === "android" ? 500 : 800);

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [currentSong?.id, isPlayerReady]);

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
    
    setup();

    return () => {
      mounted = false;
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
          if (queueIndexRef.current !== nextIndex) {
            setQueueIndex(nextIndex);
            queueIndexRef.current = nextIndex;
          }
          const nextSong = cq[nextIndex];
          if (nextSong?.id) {
            setCurrentSong((prev) => (prev?.id === nextSong.id ? prev : nextSong));
          }
          return;
        }

        const trackId = event?.track?.id;
        if (trackId == null) return;

        const normalizedId = String(trackId);
        const mappedIndex = cq.findIndex((song) => song.id === normalizedId);
        if (mappedIndex >= 0) {
          if (queueIndexRef.current !== mappedIndex) {
            setQueueIndex(mappedIndex);
            queueIndexRef.current = mappedIndex;
          }
          const mappedSong = cq[mappedIndex];
          if (mappedSong?.id) {
            setCurrentSong((prev) => (prev?.id === mappedSong.id ? prev : mappedSong));
          }
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

    return () => {
      activeTrackSubscription.remove();
      if (trackChangedSubscription) {
        trackChangedSubscription.remove();
      }
    };
  }, [isPlayerReady]);

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

  const loadAndPlaySong = useCallback(async (song: Song, newQueue?: Song[], newIndex?: number) => {
    const requestId = ++playRequestIdRef.current;
    await runSerializedPlaybackSwitch(async () => {
      try {
        setIsLoading(true);

        const playableQueue = (newQueue || [song])
          .map(normalizePlayableSong)
          .filter((item): item is Song => Boolean(item));
        if (playableQueue.length === 0) {
          return;
        }

        const requestedIndex =
          typeof newIndex === "number" && newIndex >= 0 && newIndex < playableQueue.length
            ? newIndex
            : playableQueue.findIndex((s) => s.id === song.id);
        const targetIndex = requestedIndex >= 0 ? requestedIndex : 0;
        const targetSong = playableQueue[targetIndex];

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        const previousQueue = queueRef.current;
        const queueIsSame = isSameQueueById(previousQueue, playableQueue);

        setQueue(playableQueue);
        setSourceQueue(playableQueue);
        queueRef.current = playableQueue;
        originalQueueRef.current = playableQueue;
        setQueueIndex(targetIndex);
        queueIndexRef.current = targetIndex;
        setCurrentSong(targetSong);

        Storage.addRecentlyPlayed({
          id: targetSong.id,
          name: targetSong.title,
          imageUrl: targetSong.coverUrl,
          type: "song",
          data: targetSong,
        });

        const ready = await ensurePlayerReady();
        if (!ready) {
          showPlaybackNotice("Player not ready yet. Please try again.");
          return;
        }

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        if (queueIsSame) {
          // Fast path: when queue is unchanged, jump instantly instead of rebuilding.
          await TrackPlayer.skip(targetIndex);
          await TrackPlayer.play();
          return;
        }

        const tracks = playableQueue.map(songToTrack);
        const preloadCount = Math.max(
          Math.min(tracks.length, PRELOAD_QUEUE_SIZE),
          targetIndex + 1
        );
        const initialTracks = tracks.slice(0, preloadCount);
        const remainingTracks = tracks.slice(preloadCount);

        if (typeof TrackPlayer.setQueue === "function") {
          await TrackPlayer.setQueue(initialTracks);
          if (targetIndex > 0) {
            await TrackPlayer.skip(targetIndex);
          }
          await TrackPlayer.play();

          if (remainingTracks.length > 0 && requestId === playRequestIdRef.current) {
            void TrackPlayer.add(remainingTracks).catch(() => {
              // Silent background queue append failure.
            });
          }
        } else {
          await TrackPlayer.reset();
          await TrackPlayer.add(initialTracks);
          if (targetIndex > 0) {
            await TrackPlayer.skip(targetIndex);
          }
          await TrackPlayer.play();

          if (remainingTracks.length > 0 && requestId === playRequestIdRef.current) {
            void TrackPlayer.add(remainingTracks).catch(() => {
              // Silent background queue append failure.
            });
          }
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
        logger.error("[Player] loadAndPlaySong failed", {
          error,
          songId: song?.id,
          songAudioUrl: song?.audioUrl,
        });
        showPlaybackNotice("Could not start playback.");
      } finally {
        if (requestId === playRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    });
  }, [ensurePlayerReady, runSerializedPlaybackSwitch, showPlaybackNotice]);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    if (!TrackPlayer || !setupPlayer) {
      if (isExpoGoRuntime) {
        // Expo Go: use expo-av for real audio playback
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
        originalQueueRef.current = fallbackQueue;
        setQueueIndex(targetIndex);
        queueIndexRef.current = targetIndex;
        setCurrentSong(targetSong);
        setPreviewProgress(0);
        setPreviewIsShuffled(false);
        setPreviewRepeatMode("off");
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
  }, [loadAndPlaySong, showPlaybackNotice]);

  const togglePlay = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (isExpoGoRuntime && currentSong) {
          // Use ref — never stale, always reflects current playback state
          if (previewIsPlayingRef.current) {
            ExpoAvPlayer.pause();
          } else {
            ExpoAvPlayer.play();
          }
          return;
        }
        showPlaybackNotice(nativePlayerUnavailableMessage);
        return;
      }
      if (!isPlayerReady) {
        return;
      }

      if (resolvedIsPlaying) {
        await TrackPlayer.pause();
        return;
      }

      await TrackPlayer.play();
      return;
    } catch {
      // Fallback path when no active track exists yet.
    }

    try {
      if (!TrackPlayer || !setupPlayer || !isPlayerReady) {
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
          return;
        }
      }
    } catch (error) {
      // Silent fail
    }
  }, [currentSong, isPlayerReady, loadAndPlaySong, resolvedIsPlaying, showPlaybackNotice]);

  const nextSong = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (isExpoGoRuntime) {
          const cq = queueRef.current;
          const ci = queueIndexRef.current;
          if (cq.length === 0) return;
          let ni = ci + 1;
          if (ni >= cq.length) {
            if (previewRepeatMode === "all") ni = 0;
            else return;
          }
          setQueueIndex(ni);
          queueIndexRef.current = ni;
          setCurrentSong(cq[ni]);
          setPreviewProgress(0);
          const url = resolveAudioUrl(cq[ni] as SongPlaybackSource);
          if (url) void ExpoAvPlayer.loadAndPlay(url);
        }
        return;
      }
      if (!isPlayerReady) {
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
      setQueueIndex(ni);
      queueIndexRef.current = ni;
      setCurrentSong(cq[ni]);

      // Then perform TrackPlayer operations smoothly
      await TrackPlayer.skip(ni);
      await TrackPlayer.play();
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady, previewRepeatMode]);

  const prevSong = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (isExpoGoRuntime) {
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
          setQueueIndex(pi);
          queueIndexRef.current = pi;
          setCurrentSong(cq[pi]);
          setPreviewProgress(0);
          const url = resolveAudioUrl(cq[pi] as SongPlaybackSource);
          if (url) void ExpoAvPlayer.loadAndPlay(url);
        }
        return;
      }
      if (!isPlayerReady) {
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
      setQueueIndex(pi);
      queueIndexRef.current = pi;
      setCurrentSong(cq[pi]);

      // Then perform TrackPlayer operations smoothly
      await TrackPlayer.skip(pi);
      await TrackPlayer.play();
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady, previewProgress, previewRepeatMode, safePosition]);

  const seekTo = useCallback(async (p: number) => {
    let seekRequestId = 0;
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (isExpoGoRuntime) {
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
  }, [effectiveTrackDurationSeconds, isPlayerReady]);

  const toggleShuffle = useCallback(async () => {
    if (!TrackPlayer || !setupPlayer) {
      if (isExpoGoRuntime) {
        setPreviewIsShuffled((prev) => !prev);
      }
      return;
    }
    if (!isPlayerReady) {
      return;
    }
    
    await runSerializedPlaybackSwitch(async () => {
      setIsShuffled(prev => {
        const next = !prev;
        if (next) {
          const cq = [...queueRef.current];
          const ci = queueIndexRef.current;
          const currentSongItem = cq[ci];
          if (!currentSongItem) {
            return prev;
          }
          const rest = cq.filter((_, i) => i !== ci);
          for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
          }
          const shuffled = [currentSongItem, ...rest];
          setQueue(shuffled);
          queueRef.current = shuffled;
          setQueueIndex(0);
          queueIndexRef.current = 0;
          
          // Smooth queue rebuild
          void (async () => {
            try {
              await TrackPlayer.reset();
              const validSongs = shuffled
                .map(normalizePlayableSong)
                .filter((item): item is Song => Boolean(item));
              await TrackPlayer.add(validSongs.map(songToTrack));
              await TrackPlayer.skip(0);
              await TrackPlayer.play();
            } catch {
              // Silent fail
            }
          })();
        } else {
          const orig = originalQueueRef.current;
          const cs = queueRef.current[queueIndexRef.current];
          const origIdx = orig.findIndex(s => s.id === cs?.id);
          setQueue(orig);
          queueRef.current = orig;
          setQueueIndex(origIdx >= 0 ? origIdx : 0);
          queueIndexRef.current = origIdx >= 0 ? origIdx : 0;
          
          // Smooth queue rebuild
          void (async () => {
            try {
              await TrackPlayer.reset();
              const validSongs = orig
                .map(normalizePlayableSong)
                .filter((item): item is Song => Boolean(item));
              await TrackPlayer.add(validSongs.map(songToTrack));
              const validIdx = validSongs.findIndex(s => s.id === cs?.id);
              await TrackPlayer.skip(validIdx >= 0 ? validIdx : 0);
              await TrackPlayer.play();
            } catch {
              // Silent fail
            }
          })();
        }
        return next;
      });
    });
  }, [isPlayerReady, runSerializedPlaybackSwitch]);

  const toggleRepeat = useCallback(async () => {
    if (!TrackPlayer || !setupPlayer) {
      if (isExpoGoRuntime) {
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
    
    if (isCurrentlyLiked) {
      setLikedSongIds(prev => prev.filter(id => id !== song.id));
      setLikedSongs(prev => prev.filter(s => s.id !== song.id));
      await removeLikedSongFromFirestore(authUser.id, song.id);
    } else {
      setLikedSongIds(prev => [song.id, ...prev]);
      setLikedSongs(prev => [song, ...prev]);
      await addLikedSongToFirestore(authUser.id, song);
    }
  }, [authUser?.id, likedSongIds, showPlaybackNotice]);

  const isLiked = useCallback((songId: string) => likedSongIds.includes(songId), [likedSongIds]);

  const addToQueue = useCallback(async (song: Song) => {
    try {
      if (!isPlayerReady) {
        return;
      }
      const normalizedSong = normalizePlayableSong(song);
      if (!normalizedSong) {
        return;
      }
      
      setQueue(prev => {
        const next = [...prev, normalizedSong];
        queueRef.current = next;
        setSourceQueue(next);
        return next;
      });
      await TrackPlayer.add(songToTrack(normalizedSong));
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const playNext = useCallback(async (song: Song) => {
    try {
      if (!isPlayerReady) {
        return;
      }
      const normalizedSong = normalizePlayableSong(song);
      if (!normalizedSong) {
        return;
      }
      
      setQueue(prev => {
        const ci = queueIndexRef.current;
        const next = [...prev];
        next.splice(ci + 1, 0, normalizedSong);
        queueRef.current = next;
        setSourceQueue(next);
        return next;
      });
      const ci = queueIndexRef.current;
      await TrackPlayer.add(songToTrack(normalizedSong), ci + 1);
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const removeFromQueue = useCallback(async (index: number) => {
    try {
      if (!isPlayerReady) {
        return;
      }
      setQueue(prev => {
        const next = prev.filter((_, i) => i !== index);
        queueRef.current = next;
        setSourceQueue(next);
        if (index < queueIndexRef.current) {
          const ni = queueIndexRef.current - 1;
          setQueueIndex(ni);
          queueIndexRef.current = ni;
        }
        return next;
      });
      await TrackPlayer.remove(index);
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

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
      await TrackPlayer.add(validSongs.map(songToTrack));
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
        setQueueIndex(0);
        queueIndexRef.current = 0;
        await TrackPlayer.reset();
        await TrackPlayer.add(songToTrack(cs));
      }
    } catch (error) {
      // Silent fail
    }
  }, [currentSong, isPlayerReady]);

  const shuffleQueue = useCallback(async () => {
    try {
      if (!isPlayerReady) {
        return;
      }
      const ci = queueIndexRef.current;
      const upcoming = queueRef.current.slice(ci + 1);
      for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
      }
      const newQ = [...queueRef.current.slice(0, ci + 1), ...upcoming];
      setQueue(newQ);
      queueRef.current = newQ;
      
      await TrackPlayer.reset();
      
      const validSongs = newQ
        .map(normalizePlayableSong)
        .filter((item): item is Song => Boolean(item));
      await TrackPlayer.add(validSongs.map(songToTrack));
      
      const currentSongId = newQ[ci]?.id;
      const validIndex = validSongs.findIndex(s => s.id === currentSongId);
      await TrackPlayer.skip(validIndex >= 0 ? validIndex : 0);
      await TrackPlayer.play();
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const value = useMemo(() => ({
    currentSong, queue, sourceQueue, queueIndex, isPlaying: resolvedIsPlaying, progress: resolvedProgress, duration: resolvedDuration, positionMillis: resolvedPositionMillis,
    isShuffled: resolvedIsShuffled, repeatMode: resolvedRepeatMode, likedSongIds, likedSongs, isLoading, albumColor, textColor,
    playSong, togglePlay, nextSong, prevSong, seekTo, toggleShuffle, toggleRepeat,
    toggleLike, isLiked, addToQueue, playNext, removeFromQueue, reorderQueue, clearQueue, shuffleQueue,
    setAlbumColor, setTextColor,
  }), [currentSong, queue, sourceQueue, queueIndex, resolvedIsPlaying, resolvedProgress, resolvedDuration, resolvedPositionMillis,
    resolvedIsShuffled, resolvedRepeatMode, likedSongIds, likedSongs, isLoading, albumColor, textColor, playSong, togglePlay, nextSong,
    prevSong, seekTo, toggleShuffle, toggleRepeat, toggleLike, isLiked, addToQueue,
    playNext, removeFromQueue, reorderQueue, clearQueue, shuffleQueue]);

  const liteValue = useMemo(
    () => ({
      currentSong,
      queue,
      sourceQueue,
      queueIndex,
      isPlaying: resolvedIsPlaying,
      progress: resolvedProgress,
      isShuffled: resolvedIsShuffled,
      repeatMode: resolvedRepeatMode,
      likedSongIds,
      likedSongs,
      isLoading,
      albumColor,
      textColor,
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
      setAlbumColor,
      setTextColor,
    }),
    [
      currentSong,
      queue,
      sourceQueue,
      queueIndex,
      resolvedIsPlaying,
      resolvedProgress,
      resolvedIsShuffled,
      resolvedRepeatMode,
      likedSongIds,
      likedSongs,
      isLoading,
      albumColor,
      textColor,
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
      setAlbumColor,
      setTextColor,
    ]
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
      queueIndex,
      playSong,
      removeFromQueue,
      reorderQueue,
      clearQueue,
    }),
    [currentSong, queue, queueIndex, playSong, removeFromQueue, reorderQueue, clearQueue]
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerLiteContext.Provider value={liteValue}>
        <PlayerBrowseContext.Provider value={browseValue}>
          <PlayerQueueContext.Provider value={queueValue}>
            <PlayerRowContext.Provider value={rowValue}>{children}</PlayerRowContext.Provider>
          </PlayerQueueContext.Provider>
        </PlayerBrowseContext.Provider>
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
