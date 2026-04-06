import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Alert, Platform, ToastAndroid } from "react-native";
import { isRunningInExpoGo } from "expo";
import { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";
import { logger } from "@/lib/logger";

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

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const canUseNativePlayback = Boolean(TrackPlayer && setupPlayer);
  
  // Get auth context properly
  const { user: authUser } = useAuth();

  const playbackState = usePlaybackState();
  const progressData = useProgress();
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
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewIsShuffled, setPreviewIsShuffled] = useState(false);
  const [previewRepeatMode, setPreviewRepeatMode] = useState<"off" | "all" | "one">("off");
  const [runtimeProgressSnapshot, setRuntimeProgressSnapshot] = useState({
    position: 0,
    duration: 0,
  });

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
      ? runtimePosition > 0
        ? runtimePosition
        : hookPosition
      : hookPosition;
  const safeTrackDuration =
    Platform.OS === "android"
      ? runtimeTrackDuration > 0
        ? runtimeTrackDuration
        : hookTrackDuration
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
  const isPreviewSession = __DEV__ && !canUseNativePlayback && Boolean(currentSong);
  const resolvedIsPlaying = isPreviewSession ? previewIsPlaying : isPlaying;
  const resolvedProgress = isPreviewSession ? previewProgress : progress;
  const resolvedDuration = isPreviewSession ? currentSongDurationSeconds * 1000 : duration;
  const resolvedPositionMillis = isPreviewSession
    ? Math.round(currentSongDurationSeconds * 1000 * previewProgress)
    : positionMillis;
  const resolvedIsShuffled = isPreviewSession ? previewIsShuffled : isShuffled;
  const resolvedRepeatMode = isPreviewSession ? previewRepeatMode : repeatMode;

  useEffect(() => {
    if (!isPreviewSession) return;
    setPreviewProgress(0);
  }, [currentSong?.id, isPreviewSession]);

  useEffect(() => {
    if (!TrackPlayer || !setupPlayer || !isPlayerReady || Platform.OS === "web") {
      return;
    }

    let mounted = true;

    const syncRuntimeProgress = async () => {
      try {
        const runtimeProgress = await TrackPlayer.getProgress();
        if (!mounted) return;

        const nextPosition = Number.isFinite(runtimeProgress?.position)
          ? Math.max(0, runtimeProgress.position)
          : 0;
        const nextDuration = Number.isFinite(runtimeProgress?.duration)
          ? Math.max(0, runtimeProgress.duration)
          : 0;

        setRuntimeProgressSnapshot((prev) => {
          const positionDelta = Math.abs(prev.position - nextPosition);
          const durationDelta = Math.abs(prev.duration - nextDuration);
          if (positionDelta < 0.04 && durationDelta < 0.04) {
            return prev;
          }

          return {
            position: nextPosition,
            duration: nextDuration,
          };
        });
      } catch {
        // Silent runtime progress fallback failure
      }
    };

    void syncRuntimeProgress();
    const interval = setInterval(() => {
      void syncRuntimeProgress();
    }, Platform.OS === "android" ? 350 : 800);

    return () => {
      mounted = false;
      clearInterval(interval);
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
          // 1. First, try to fetch synced Spotify songs from backend
          let backendSongs: Song[] = [];
          try {
            const token = await authUser.getIdToken();
            console.log('🎵 [PlayerContext] Fetching liked songs for user:', authUser.id);
            const response = await fetch('https://api.mavrixfy.site/api/liked-songs', {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
              const data = await response.json();
              console.log('📡 [PlayerContext] Backend response:', data);
              if (data.data && Array.isArray(data.data)) {
                backendSongs = data.data.map((s: any) => ({
                  id: s.id || s.songId,
                  title: s.title,
                  artist: s.artist,
                  coverUrl: s.imageUrl || s.coverUrl,
                  audioUrl: s.audioUrl || s.previewUrl,
                  duration: s.duration || 0,
                  album: s.album,
                  source: 'spotify' as const,
                  isLocal: false,
                }));
                console.log(`✅ [PlayerContext] Loaded ${backendSongs.length} backend songs`);
              }
            } else {
              console.warn(`⚠️ [PlayerContext] Backend response not ok: ${response.status}`);
            }
          } catch (err) {
            // Silently fail, will fall back to Firestore
            console.warn('❌ [PlayerContext] Failed to fetch backend songs:', err);
          }
          
          if (!mounted) return;
          
          // 2. Fetch Firestore songs
          const firestoreSongs = await getLikedSongsFromFirestore(authUser.id);
          if (!mounted) return;
          
          // 3. Fetch local songs
          const localData = await Storage.getLikedSongsData();
          
          // 4. Merge all sources (backend Spotify songs + Firestore + local)
          const allSongIds = new Set<string>();
          const mergedSongs: Song[] = [];
          
          // Add backend Spotify songs first
          for (const song of backendSongs) {
            if (!allSongIds.has(song.id)) {
              allSongIds.add(song.id);
              mergedSongs.push(song);
            }
          }
          
          // Add Firestore songs
          for (const song of firestoreSongs) {
            if (!allSongIds.has(song.id)) {
              allSongIds.add(song.id);
              mergedSongs.push(song);
            }
          }
          
          // Add local songs as fallback
          for (const song of localData) {
            if (!allSongIds.has(song.id)) {
              allSongIds.add(song.id);
              mergedSongs.push(song);
            }
          }
          
          if (!mounted) return;
          
          if (mergedSongs.length > 0) {
            console.log(`🎉 [PlayerContext] MERGED ${mergedSongs.length} total songs:`, {
              backend: backendSongs.length,
              firestore: firestoreSongs.length,
              local: localData.length,
              merged: mergedSongs.length,
            });
            setLikedSongs(mergedSongs);
            setLikedSongIds(mergedSongs.map(s => s.id));
            // Update local storage with merged songs
            await Storage.setJSON('@mavrixfy_liked_songs', mergedSongs.map(s => s.id));
            await Storage.setJSON('@mavrixfy_liked_songs_data', mergedSongs);
          } else {
            console.log('⚠️ [PlayerContext] No liked songs found in any source');
            setLikedSongs([]);
            setLikedSongIds([]);
          }
        } else {
          const ids = await Storage.getLikedSongIds();
          const data = await Storage.getLikedSongsData();
          if (mounted) {
            setLikedSongIds(ids);
            setLikedSongs(data);
          }
        }
      } catch (error) {
        if (mounted) {
          try {
            const ids = await Storage.getLikedSongIds();
            const data = await Storage.getLikedSongsData();
            setLikedSongIds(ids);
            setLikedSongs(data);
          } catch (e) {
            // Silent fail
          }
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

        const tracks = playableQueue.map(songToTrack);

        if (typeof TrackPlayer.setQueue === "function") {
          await TrackPlayer.setQueue(tracks);
        } else {
          await TrackPlayer.reset();
          await TrackPlayer.add(tracks);
        }

        if (requestId !== playRequestIdRef.current) {
          return;
        }

        await TrackPlayer.skip(targetIndex);
        await TrackPlayer.play();

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
      if (__DEV__) {
        const fallbackQueue = (newQueue || [song]).filter((item): item is Song => Boolean(item?.id));
        if (fallbackQueue.length === 0) {
          showPlaybackNotice("Could not open preview for this song.");
          return;
        }
        const targetIndex = Math.max(0, fallbackQueue.findIndex((s) => s.id === song.id));
        const targetSong = fallbackQueue[targetIndex] ?? fallbackQueue[0];
        setQueue(fallbackQueue);
        setSourceQueue(fallbackQueue);
        queueRef.current = fallbackQueue;
        originalQueueRef.current = fallbackQueue;
        setQueueIndex(targetIndex);
        queueIndexRef.current = targetIndex;
        setCurrentSong(targetSong);
        setPreviewIsPlaying(true);
        setPreviewProgress(0);
        setPreviewIsShuffled(false);
        setPreviewRepeatMode("off");
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
        if (__DEV__ && currentSong) {
          setPreviewIsPlaying((prev) => !prev);
          return;
        }
        showPlaybackNotice(nativePlayerUnavailableMessage);
        return;
      }
      if (!isPlayerReady) {
        return;
      }

      const stateObj = await TrackPlayer.getPlaybackState();
      const stateValue =
        stateObj && typeof stateObj === "object" && "state" in stateObj ? stateObj.state : stateObj;

      if (
        stateValue === State.Playing ||
        stateValue === State.Buffering ||
        stateValue === State.Loading
      ) {
        await TrackPlayer.pause();
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

      await TrackPlayer.play();
    } catch (error) {
      // Silent fail
    }
  }, [currentSong, isPlayerReady, loadAndPlaySong, showPlaybackNotice]);

  const nextSong = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (__DEV__) {
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

      await TrackPlayer.skip(ni);
      await TrackPlayer.play();
      setQueueIndex(ni);
      queueIndexRef.current = ni;
      setCurrentSong(cq[ni]);
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady, previewRepeatMode]);

  const prevSong = useCallback(async () => {
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (__DEV__) {
          const cq = queueRef.current;
          const ci = queueIndexRef.current;
          if (cq.length === 0) return;

          if (previewProgress > 0.03) {
            setPreviewProgress(0);
            return;
          }

          let pi = ci - 1;
          if (pi < 0) {
            if (previewRepeatMode === "all") {
              pi = cq.length - 1;
            } else {
              setPreviewProgress(0);
              return;
            }
          }

          setQueueIndex(pi);
          queueIndexRef.current = pi;
          setCurrentSong(cq[pi]);
          setPreviewProgress(0);
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

      await TrackPlayer.skip(pi);
      await TrackPlayer.play();
      setQueueIndex(pi);
      queueIndexRef.current = pi;
      setCurrentSong(cq[pi]);
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady, previewProgress, previewRepeatMode, safePosition]);

  const seekTo = useCallback(async (p: number) => {
    let seekRequestId = 0;
    try {
      if (!TrackPlayer || !setupPlayer) {
        if (__DEV__) {
          const normalizedProgress = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
          setPreviewProgress(normalizedProgress);
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

  const toggleShuffle = useCallback(() => {
    if (!TrackPlayer || !setupPlayer) {
      if (__DEV__) {
        setPreviewIsShuffled((prev) => !prev);
      }
      return;
    }
    if (!isPlayerReady) {
      return;
    }
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
        
        TrackPlayer.reset().then(() => {
          const validSongs = shuffled
            .map(normalizePlayableSong)
            .filter((item): item is Song => Boolean(item));
          TrackPlayer.add(validSongs.map(songToTrack)).then(() => {
            TrackPlayer.skip(0);
            TrackPlayer.play();
          }).catch(() => {});
        }).catch(() => {});
      } else {
        const orig = originalQueueRef.current;
        const cs = queueRef.current[queueIndexRef.current];
        const origIdx = orig.findIndex(s => s.id === cs?.id);
        setQueue(orig);
        queueRef.current = orig;
        setQueueIndex(origIdx >= 0 ? origIdx : 0);
        queueIndexRef.current = origIdx >= 0 ? origIdx : 0;
        
        TrackPlayer.reset().then(() => {
          const validSongs = orig
            .map(normalizePlayableSong)
            .filter((item): item is Song => Boolean(item));
          TrackPlayer.add(validSongs.map(songToTrack)).then(() => {
            const validIdx = validSongs.findIndex(s => s.id === cs?.id);
            TrackPlayer.skip(validIdx >= 0 ? validIdx : 0);
            TrackPlayer.play();
          }).catch(() => {});
        }).catch(() => {});
      }
      return next;
    });
  }, [isPlayerReady]);

  const toggleRepeat = useCallback(async () => {
    if (!TrackPlayer || !setupPlayer) {
      if (__DEV__) {
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
    const isCurrentlyLiked = likedSongIds.includes(song.id);
    
    if (isCurrentlyLiked) {
      setLikedSongIds(prev => prev.filter(id => id !== song.id));
      setLikedSongs(prev => prev.filter(s => s.id !== song.id));
      await Storage.removeLikedSong(song.id);
      if (authUser?.id) {
        await removeLikedSongFromFirestore(authUser.id, song.id);
      }
    } else {
      setLikedSongIds(prev => [song.id, ...prev]);
      setLikedSongs(prev => [song, ...prev]);
      await Storage.addLikedSong(song);
      if (authUser?.id) {
        await addLikedSongToFirestore(authUser.id, song);
      }
    }
  }, [likedSongIds, authUser]);

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
