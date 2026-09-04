import { useEffect, type MutableRefObject } from "react";
import { AppState, Platform } from "react-native";
import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import { carPlayService } from "@/services/carPlayService";
import { toDurationSeconds } from "@/utils/timeFormatters";
import type { SleepTimerState } from "@/types/playbackTypes";

interface UseAudioSyncListenersOptions {
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
  positionSecondsRef: MutableRefObject<number>;
  setNativePosition: (pos: number) => void;
  setNativeDuration: React.Dispatch<React.SetStateAction<number>>;
  setSeekOverride: (override: any) => void;
  prefetchAdjacentTrackStreams: (queue: Song[], index: number) => void;
  sleepTimerRef: MutableRefObject<SleepTimerState | null>;
  clearSleepTimer: () => void;
  showPlaybackNotice: (msg: string) => void;
  likedSongs: Song[];
  likedSongsRef: MutableRefObject<Song[]>;
  playSong: (song: Song) => Promise<void> | void;
}

export function useAudioSyncListeners({
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
}: UseAudioSyncListenersOptions) {
  // TrackPlayer native event handlers
  useEffect(() => {
    if (!isPlayerReady || !TrackPlayer) return;

    const unsubs = [
      subscribeTrackPlayerEvent(Event.PlaybackState, (event: any) => {
        const nextState = event && typeof event === "object" && "state" in event ? event.state : event;

        switch (nextState) {
          case State.Playing:
            desiredPlayStateRef.current = null;
            setIsPlaying(true);
            isPlayingRef.current = true;
            setPlaybackLoading(false);
            updatePlaybackEngineSnapshot({ isPlaying: true, isLoading: false, isBuffering: false });
            break;

          case State.Paused:
          case State.Stopped:
            if (!playbackLoadingRef.current && desiredPlayStateRef.current !== true) {
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
        logger.error("[Player] PlaybackError event", error);
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });

        const errorMsg = error?.message || error?.code || "Playback failed";
        showPlaybackNotice(`Playback error: ${errorMsg}`);
      }),
      subscribeTrackPlayerEvent(Event.PlaybackProgressUpdated, (event: any) => {
        if (typeof event?.position === "number") {
          setNativePosition(event.position);
        }
        if (typeof event?.duration === "number" && event.duration > 0) {
          const dur = event.duration;
          setNativeDuration((prev) => (Math.abs(prev - dur) > 0.5 ? dur : prev));
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackActiveTrackChanged, (event: any) => {
        const nextIndex =
          typeof event?.index === "number"
            ? event.index
            : typeof event?.nextTrack === "number"
            ? event.nextTrack
            : -1;
        if (nextIndex < 0) return;
        const currentQ = queueRef.current;
        const targetSong = currentQ[nextIndex];
        if (targetSong && targetSong.id !== currentSongRef.current?.id) {
          currentSongRef.current = targetSong;
          setCurrentSong(targetSong);
          setQueueIndex(nextIndex);
          queueIndexRef.current = nextIndex;
          setSeekOverride(null);
          setNativePosition(0);
          const initialDuration = toDurationSeconds(event?.track?.duration || targetSong.duration);
          setNativeDuration(initialDuration > 0 ? initialDuration : 0);
          updatePlaybackEngineSnapshot({
            currentSong: targetSong,
            queueIndex: nextIndex,
          });

          prefetchAdjacentTrackStreams(currentQ, nextIndex);
        }
      }),
      subscribeTrackPlayerEvent(Event.PlaybackQueueEnded, () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setPlaybackLoading(false);
        updatePlaybackEngineSnapshot({ isPlaying: false, isLoading: false, isBuffering: false });
        if (sleepTimerRef.current?.mode === "end-of-stack") {
          clearSleepTimer();
        }
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerReady]);

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

    if (likedSongs.length > 0) {
      void carPlayService.syncFavorites(likedSongs);
    }

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

    return () => {
      unsubPlay();
    };
  }, [likedSongs, playSong, likedSongsRef, queueRef]);
}
