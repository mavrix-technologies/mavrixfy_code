import { getSettings } from "@/lib/storage";
import { isYouTubeSong, peekYouTubeStream, rejectYouTubeStream } from "@/services/youtube/YouTubeMusic";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { songToTrack } from "@/services/audio/PlayerPlaybackResolver";
import type { SeekOverride } from "@/services/audio/audioProgressTracking";
import type { PendingPlayRequest } from "@/services/audio/usePlayerCoreState";
import { carPlayService } from "@/services/carPlayService";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import type { SleepTimerState, PlaybackQualityState } from "@/types/playbackTypes";
import { toDurationSeconds } from "@/utils/timeFormatters";
import { useEffect,useRef,type MutableRefObject } from "react";
import { AppState,Platform } from "react-native";

interface UseAudioSyncListenersOptions {
  setPlaybackQuality?: (update: (previous: PlaybackQualityState) => PlaybackQualityState) => void;
  isPlayerReady: boolean;
  TrackPlayer: any;
  Event: any;
  State: any;
  subscribeTrackPlayerEvent: (eventName: unknown, listener: (...args: any[]) => void) => () => void;
  currentSong: Song | null;
  currentSongRef: MutableRefObject<Song | null>;
  setCurrentSong: (song: Song | null) => void;
  queueRef: MutableRefObject<Song[]>;
  queueIndex: number;
  queueIndexRef: MutableRefObject<number>;
  setQueueIndex: (index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  isPlayingRef: MutableRefObject<boolean>;
  setPlaybackLoading: (loading: boolean) => void;
  playbackLoadingRef: MutableRefObject<boolean>;
  desiredPlayStateRef: MutableRefObject<boolean | null>;
  pendingPlayRequestRef: MutableRefObject<PendingPlayRequest | null>;
  positionSecondsRef: MutableRefObject<number>;
  setNativePosition: (pos: number) => void;
  setNativeDuration: (value: number | ((previous: number) => number), source?: "media" | "catalog") => void;
  setSeekOverride: (override: SeekOverride) => void;
  prefetchAdjacentTrackStreams: (queue: Song[], index: number) => void;
  sleepTimerRef: MutableRefObject<SleepTimerState | null>;
  clearSleepTimer: () => void;
  showPlaybackNotice: (msg: string) => void;
  likedSongs: Song[];
  likedSongsRef: MutableRefObject<Song[]>;
  playSong: (song: Song, queue?: Song[], position?: number) => Promise<void> | void;
  nextSong: () => Promise<void>;
  prevSong: () => Promise<void>;
  playSongRef: MutableRefObject<(song: Song, queue?: Song[], startPositionSeconds?: number) => Promise<void> | void>;
  nextSongRef: MutableRefObject<() => void>;
  prevSongRef: MutableRefObject<() => void>;
  isNativeQueueSyncedRef?: MutableRefObject<boolean>;
  triggerAutoplayAppend?: (seedSong: Song, currentQueue: Song[]) => Promise<Song[]>;
  isShuffled?: boolean;
  repeatMode?: "off" | "all" | "one";
  toggleShuffle?: () => void;
  toggleRepeat?: () => void;
  toggleLike?: (song: Song) => Promise<void> | void;
  likedSongIds?: string[] | Set<string>;
}

export function useAudioSyncListeners({
  setPlaybackQuality,
  isPlayerReady,
  TrackPlayer,
  Event,
  State,
  subscribeTrackPlayerEvent,
  currentSong,
  currentSongRef,
  setCurrentSong,
  queueRef,
  queueIndex,
  queueIndexRef,
  setQueueIndex,
  setIsPlaying,
  isPlayingRef,
  setPlaybackLoading,
  playbackLoadingRef,
  desiredPlayStateRef,
  pendingPlayRequestRef,
  positionSecondsRef,
  setNativePosition,
  setNativeDuration,
  setSeekOverride,
  prefetchAdjacentTrackStreams,
  sleepTimerRef,
  clearSleepTimer,
  showPlaybackNotice,
  likedSongs,
  likedSongsRef,
  playSong,
  nextSong,
  prevSong,
  playSongRef,
  nextSongRef,
  prevSongRef,
  isNativeQueueSyncedRef,
  triggerAutoplayAppend,
  isShuffled,
  repeatMode,
  toggleShuffle,
  toggleRepeat,
  toggleLike,
  likedSongIds,
}: UseAudioSyncListenersOptions) {
  const youtubeRetryAt = useRef(new Map<string, number>());
  const publishedLockScreenDurationRef = useRef<{
    songId: string;
    duration: number;
  } | null>(null);

  // TrackPlayer native event handlers
  useEffect(() => {
    if (!isPlayerReady || !TrackPlayer) return;

    const pauseIntent = () => {
      desiredPlayStateRef.current = false;
      setIsPlaying(false);
      isPlayingRef.current = false;
      updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false });
    };
    const playIntent = () => {
      desiredPlayStateRef.current = true;
      setIsPlaying(true);
      isPlayingRef.current = true;
      updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
    };
    const unsubs = [
      subscribeTrackPlayerEvent(Event.RemotePlay, () => {
        playIntent();
        if (playbackLoadingRef.current) return;
        void TrackPlayer.getActiveTrack().then((track: any) => {
          if (desiredPlayStateRef.current !== true || playbackLoadingRef.current) return;
          if (track?.id === currentSongRef.current?.id) return TrackPlayer.play();
          const song = currentSongRef.current;
          if (song) return playSongRef.current(song, queueRef.current, positionSecondsRef.current);
        }).catch((error: unknown) => logger.warn("[Audio] Remote play failed", error));
      }),
      subscribeTrackPlayerEvent(Event.RemotePause, () => {
        pauseIntent();
        void TrackPlayer.pause().catch(() => {});
      }),
      subscribeTrackPlayerEvent(Event.RemoteStop, () => {
        pauseIntent();
        void TrackPlayer.stop().catch(() => {});
      }),
      subscribeTrackPlayerEvent(Event.RemoteNext, () => void nextSongRef.current()),
      subscribeTrackPlayerEvent(Event.RemotePrevious, () => void prevSongRef.current()),
      subscribeTrackPlayerEvent(Event.PlaybackInterruption, (event: { resumed: boolean }) => {
        if (event.resumed) playIntent();
        else pauseIntent();
      }),
      subscribeTrackPlayerEvent(Event.PlaybackState, (event: any) => {
        const nextState = event && typeof event === "object" && "state" in event ? event.state : event;

        switch (nextState) {
          case State.Playing:
            if (desiredPlayStateRef.current === false) {
              void TrackPlayer?.pause?.().catch(() => {});
              break;
            }
            playbackLoadingRef.current = false;
            setPlaybackLoading(false);
            pendingPlayRequestRef.current = null;
            desiredPlayStateRef.current = true;
            setIsPlaying(true);
            isPlayingRef.current = true;
            updatePlaybackEngineSnapshot({ isPlaying: true, isLoading: false, isBuffering: false });
            break;

          case State.Paused:
          case State.Stopped:
            // Keep the intended play state through a native source change.
            if (!playbackLoadingRef.current && desiredPlayStateRef.current !== true && !pendingPlayRequestRef.current) {
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
      subscribeTrackPlayerEvent(Event.PlaybackPlayWhenReadyChanged, (event: any) => {
        if (typeof event?.playWhenReady !== "boolean") return;
        // A native queue replacement may emit a stale resume after the user
        // has paused. The explicit user intent must always win that race.
        if (desiredPlayStateRef.current === false) {
          if (event.playWhenReady) {
            void TrackPlayer?.pause?.().catch(() => {});
          }
          return;
        }
        // Queue replacement can reset native intent before our play command.
        if (playbackLoadingRef.current || pendingPlayRequestRef.current) return;
        desiredPlayStateRef.current = event.playWhenReady;

        if (event.playWhenReady) {
          setIsPlaying(true);
          isPlayingRef.current = true;
          updatePlaybackEngineSnapshot({ desiredPlayState: true, isPlaying: true });
          return;
        }

        pendingPlayRequestRef.current = null;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ desiredPlayState: false, isPlaying: false, isLoading: false, isBuffering: false });
      }),
      subscribeTrackPlayerEvent(Event.PlaybackError, (error: any) => {
        const failedSong = currentSongRef.current;
        if (error?.trackId && failedSong?.id !== error.trackId) return;
        if (failedSong && isYouTubeSong(failedSong) && error?.shouldResume &&
          desiredPlayStateRef.current !== false && Date.now() - (youtubeRetryAt.current.get(failedSong.id) || 0) > 60000) {
          if (youtubeRetryAt.current.size >= 60) youtubeRetryAt.current.delete(youtubeRetryAt.current.keys().next().value!);
          youtubeRetryAt.current.set(failedSong.id, Date.now());
          rejectYouTubeStream(failedSong);
          const resumePosition = positionSecondsRef.current;
          void playSongRef.current(failedSong, queueRef.current, resumePosition);
          return;
        }
        logger.error("[Player] PlaybackError event", error);
        pendingPlayRequestRef.current = null;
        desiredPlayStateRef.current = false;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });

        const errorMsg = error?.message || error?.code || "Playback failed";
        showPlaybackNotice(`Playback error: ${errorMsg}`);
      }),
      subscribeTrackPlayerEvent(Event.PlaybackProgressUpdated, (event: any) => {
        // Only filter out if this event is explicitly for a stale pending play request
        if (
          pendingPlayRequestRef.current &&
          event?.track?.id &&
          String(event.track.id) !== String(pendingPlayRequestRef.current.songId)
        ) {
          return;
        }
        if (
          isNativeQueueSyncedRef?.current &&
          typeof event?.track === "number" &&
          event.track !== queueIndexRef.current
        ) {
          return;
        }

        const pos = typeof event?.position === "number" ? event.position : 0;
        if (pos > 0) {
          if (playbackLoadingRef.current) {
            playbackLoadingRef.current = false;
            setPlaybackLoading(false);
            updatePlaybackEngineSnapshot({ isLoading: false });
          }
          if (pendingPlayRequestRef.current) {
            pendingPlayRequestRef.current = null;
          }
        }

        setNativePosition(pos);
        positionSecondsRef.current = pos;
        const song = currentSongRef.current;
        const nativeDuration = typeof event?.duration === "number" && event.duration > 0
          ? event.duration
          : 0;
        const catalogDuration = toDurationSeconds(song?.duration);
        const duration = nativeDuration || catalogDuration;

        if (nativeDuration > 0) {
          const dur = nativeDuration;
          setNativeDuration((prev) => (Math.abs(prev - dur) > 0.5 ? dur : prev));
          if (song && (!song.duration || song.duration <= 0)) {
            song.duration = dur;
          }
        }

        // SwiftAudioEx uses its AVPlayer duration for Now Playing. Several
        // music streams report that as zero, despite the catalogue already
        // knowing the track length. Set the best available duration once per
        // track (and again only if native later reports a different value).
        const previouslyPublished = publishedLockScreenDurationRef.current;
        const shouldPublishDuration = Boolean(
          song &&
          duration > 0 &&
          (previouslyPublished?.songId !== song.id ||
            Math.abs((previouslyPublished?.duration ?? 0) - duration) > 0.5)
        );

        if (
          shouldPublishDuration &&
          song &&
          Platform.OS === "ios" &&
          typeof TrackPlayer?.updateMetadataForTrack === "function"
        ) {
          publishedLockScreenDurationRef.current = { songId: song.id, duration };
          const track = songToTrack(song);
          const trackIndex = typeof event?.track === "number" ? event.track : queueIndexRef.current;
          TrackPlayer.updateMetadataForTrack(trackIndex, {
            title: track.title,
            artist: track.artist,
            album: track.album,
            artwork: track.artwork,
            genre: track.genre,
            duration,
            isLiveStream: false,
          }).catch(() => {});
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackActiveTrackChanged, (event: any) => {
        const currentQ = queueRef.current;
        const currentSong = currentSongRef.current;

        // 1. Identify track by ID if available from native event
        const activeTrackId =
          typeof event?.track?.id === "string"
            ? event?.track?.id
            : typeof event?.track === "string"
            ? event?.track
            : null;

        const pending = pendingPlayRequestRef.current;
        // Any in-flight pending request means we are mid-transition; ignore ALL native
        // track-change events until the transition completes.
        if (pending) return;

        const activeSong = currentQ.find((song) => song.id === activeTrackId);
        const youtubeStream = activeSong && isYouTubeSong(activeSong) ? peekYouTubeStream(activeSong) : undefined;
        if (youtubeStream) {
          const bitrate = Math.round(youtubeStream.bitrate / 1000);
          setPlaybackQuality?.((previous) => ({ ...previous, actualBitrate: bitrate,
            qualityLabel: `${bitrate}kbps${youtubeStream.codec ? ` · ${youtubeStream.codec}` : ""}`, isFallback: false }));
        }

        // If native event confirms the song we already selected, do NOT overwrite or jump
        if (activeTrackId && currentSong && String(activeTrackId) === String(currentSong.id)) {
          return;
        }

        const nextIndex =
          typeof event?.index === "number"
            ? event.index
            : typeof event?.nextTrack === "number"
            ? event.nextTrack
            : -1;

        let targetSong: Song | undefined;
        let resolvedIndex = -1;

        // Match by ID first across our queue
        if (activeTrackId) {
          const foundIndex = currentQ.findIndex((s) => String(s.id) === String(activeTrackId));
          if (foundIndex >= 0) {
            targetSong = currentQ[foundIndex];
            resolvedIndex = foundIndex;
          }
        }

        // Only fall back to index if the native queue is confirmed 1:1 synchronized
        if (!targetSong && isNativeQueueSyncedRef?.current && nextIndex >= 0 && nextIndex < currentQ.length) {
          targetSong = currentQ[nextIndex];
          resolvedIndex = nextIndex;
        }

        // If native queue is unsynced and no track ID matched, DO NOT blind-revert to queue[0]!
        if (!targetSong) return;

        if (String(targetSong.id) !== String(currentSongRef.current?.id)) {
          currentSongRef.current = targetSong;
          setCurrentSong(targetSong);
          if (resolvedIndex >= 0) {
            setQueueIndex(resolvedIndex);
            queueIndexRef.current = resolvedIndex;
          }
          setSeekOverride(null);
          setNativePosition(0);
          positionSecondsRef.current = 0;
          const initialDuration = toDurationSeconds(event?.track?.duration || targetSong.duration);
          setNativeDuration(initialDuration > 0 ? initialDuration : 0, "catalog");
          updatePlaybackEngineSnapshot({
            currentSong: targetSong,
            ...(resolvedIndex >= 0 ? { queueIndex: resolvedIndex } : {}),
          });

          if (resolvedIndex >= 0) {
            prefetchAdjacentTrackStreams(currentQ, resolvedIndex);
            if (triggerAutoplayAppend && resolvedIndex >= currentQ.length - 2) {
              void triggerAutoplayAppend(targetSong, currentQ);
            }
          }
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackQueueEnded, async () => {
        if (playbackLoadingRef.current || pendingPlayRequestRef.current) return;
        const endedSong = currentSongRef.current;
        const isStillEnded = () => currentSongRef.current === endedSong &&
          !playbackLoadingRef.current && !pendingPlayRequestRef.current;
        if (sleepTimerRef.current?.mode === "end-of-stack") {
          clearSleepTimer();
          setIsPlaying(false);
          isPlayingRef.current = false;
          setPlaybackLoading(false);
          updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });
          return;
        }

        if (isNativeQueueSyncedRef?.current === false) {
          const next = queueRef.current[queueIndexRef.current + 1] ||
            (repeatMode === "all" ? queueRef.current[0] : undefined);
          if (next) {
            void playSongRef.current(next, queueRef.current);
            return;
          }
        }

        try {
          const settings = await getSettings();
          if (!isStillEnded()) return;
          if (settings?.smartAutoplayEnabled && triggerAutoplayAppend) {
            const seed = currentSongRef.current || queueRef.current[queueRef.current.length - 1];
            if (seed) {
              const recs = await triggerAutoplayAppend(seed, queueRef.current);
              if (!isStillEnded() || desiredPlayStateRef.current === false) return;
              if (recs.length > 0) {
                void playSongRef.current(recs[0], queueRef.current);
                return;
              }
            }
          }
        } catch (err) {
          logger.warn("[Player] Autoplay queue-ended continuation error:", err);
        }

        if (!isStillEnded()) return;
        desiredPlayStateRef.current = false;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub?.());
    };
    // playSong, nextSong, prevSong are accessed via refs (playSongRef/nextSongRef/prevSongRef)
    // to prevent handler reinstall races when function identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerReady, triggerAutoplayAppend, repeatMode]);

  // Save current playback state (event-driven)
  useEffect(() => {
    if (!currentSong) return;

    const persist = () => {
      if (!currentSongRef.current) return;
      playerPersistenceService.savePlayerState({
        currentSong: currentSongRef.current,
        queue: queueRef.current,
        queueIndex: queueIndexRef.current,
        positionSeconds: positionSecondsRef.current,
        updatedAt: Date.now(),
      }).catch(() => {});
    };

    persist();

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") persist();
    });

    return () => {
      sub.remove();
      persist();
    };
  }, [currentSong, queueIndex, queueIndexRef, queueRef, positionSecondsRef, currentSongRef]);

  // Synchronize playback progress and active track when returning to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextState: string) => {
      if (nextState === "active" && TrackPlayer && isPlayerReady) {
        try {
          const [activeTrack, prog] = await Promise.all([
            TrackPlayer.getActiveTrack().catch(() => null),
            TrackPlayer.getProgress().catch(() => null),
          ]);
          if (activeTrack?.id && activeTrack.id !== currentSongRef.current?.id) {
            const foundIdx = queueRef.current.findIndex((s: Song) => s.id === activeTrack.id);
            if (foundIdx >= 0) {
              const target = queueRef.current[foundIdx];
              currentSongRef.current = target;
              setCurrentSong(target);
              setQueueIndex(foundIdx);
              queueIndexRef.current = foundIdx;
            }
          }
          if (prog) {
            if (typeof prog.position === "number") {
              setNativePosition(prog.position);
            }
            if (typeof prog.duration === "number" && prog.duration > 0) {
              setNativeDuration(prog.duration);
            }
          }
        } catch {
          // ignore non-fatal sync errors
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [isPlayerReady, TrackPlayer, currentSongRef, queueIndexRef, queueRef, setCurrentSong, setNativeDuration, setNativePosition, setQueueIndex]);

  // Sync state and listen for playback requests from Apple CarPlay
  useEffect(() => {
    if (Platform.OS !== "ios" || !carPlayService.isAvailable()) return;

    void carPlayService.syncFavorites(likedSongs);

    playerPersistenceService.getUserPlaylists()
      .then((playlists) => {
        if (playlists && playlists.length > 0) {
          void carPlayService.syncPlaylists(playlists);
        }
      })
      .catch(() => {});

    playerPersistenceService.getRecentlyPlayed()
      .then((recent) => {
        const recentSongs: Song[] = (recent || []).flatMap((item) => {
          const s = item.data as Song;
          return s && s.id ? [s] : [];
        });
        if (recentSongs.length > 0) {
          void carPlayService.syncRecent(recentSongs);
        }
      })
      .catch(() => {});

    if (currentSong) {
      const hasLiked =
        likedSongIds instanceof Set
          ? likedSongIds.has(currentSong.id)
          : Array.isArray(likedSongIds)
            ? likedSongIds.includes(currentSong.id)
            : false;
      const isFav = Boolean(
        currentSong.id &&
          (hasLiked || likedSongsRef.current.some((s) => s.id === currentSong.id))
      );
      void carPlayService.syncNowPlaying({
        songId: currentSong.id,
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album || "",
        coverUrl: currentSong.coverUrl || "",
        duration: toDurationSeconds(currentSong.duration),
        elapsedTime: positionSecondsRef.current || 0,
        isPlaying: isPlayingRef.current,
        isFavorite: isFav,
        isShuffle: Boolean(isShuffled),
        repeatMode: repeatMode || "off",
        queueCount: queueRef.current.length,
      });
    }

    const unsubPlay = carPlayService.onPlaySong((event) => {
      if (event.song && (event.song as Song).id) {
        void playSong(event.song as Song);
      } else if (event.songId) {
        const found =
          queueRef.current.find((s) => s.id === event.songId) ||
          likedSongsRef.current.find((s) => s.id === event.songId);
        if (found) {
          void playSong(found);
        }
      }
    });

    const unsubFav = carPlayService.onToggleFavorite(() => {
      const active = currentSongRef.current;
      if (active && toggleLike) {
        void toggleLike(active);
      }
    });

    const unsubShuffle = carPlayService.onToggleShuffle(() => {
      if (toggleShuffle) {
        toggleShuffle();
      }
    });

    const unsubRepeat = carPlayService.onToggleRepeat(() => {
      if (toggleRepeat) {
        toggleRepeat();
      }
    });

    return () => {
      unsubPlay();
      unsubFav();
      unsubShuffle();
      unsubRepeat();
    };
  }, [
    likedSongs,
    playSong,
    likedSongsRef,
    queueRef,
    currentSong,
    isShuffled,
    repeatMode,
    likedSongIds,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    positionSecondsRef,
    isPlayingRef,
    currentSongRef,
  ]);
}
