import { useEffect, useRef, type MutableRefObject } from "react";
import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";

interface UseStartupPlaybackReconcileOptions {
  TrackPlayer: any;
  State: any;
  isPlayerReady: boolean;
  ensurePlayerReady: () => Promise<boolean>;
  currentSongRef: MutableRefObject<Song | null>;
  setCurrentSong: (song: Song | null) => void;
  queueRef: MutableRefObject<Song[]>;
  setQueue: (songs: Song[]) => void;
  originalQueueRef: MutableRefObject<Song[]>;
  setSourceQueue: (songs: Song[]) => void;
  queueIndexRef: MutableRefObject<number>;
  setQueueIndex: (index: number) => void;
  isPlayingRef: MutableRefObject<boolean>;
  setIsPlaying: (playing: boolean) => void;
}

export function useStartupPlaybackReconcile(options: UseStartupPlaybackReconcileOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const { ensurePlayerReady, isPlayerReady } = options;

  useEffect(() => {
    let mounted = true;
    const reconcileStartup = async () => {
      const {
        TrackPlayer,
        State,
        currentSongRef,
        setCurrentSong,
        queueRef,
        setQueue,
        originalQueueRef,
        setSourceQueue,
        queueIndexRef,
        setQueueIndex,
        isPlayingRef,
        setIsPlaying,
      } = optionsRef.current;

      try {
        if (TrackPlayer) {
          const ready = isPlayerReady || (await ensurePlayerReady());
          if (ready) {
            const [activeTrack, nativeQueue, playbackState] = await Promise.all([
              TrackPlayer.getActiveTrack().catch(() => null),
              TrackPlayer.getQueue().catch(() => []),
              TrackPlayer.getPlaybackState().catch(() => null),
            ]);
            const rawState = (playbackState as any)?.state ?? playbackState;
            const isPlayingNow = rawState === State.Playing;

            if (activeTrack?.id && Array.isArray(nativeQueue) && nativeQueue.length > 0) {
              const [rawIndex, persisted] = await Promise.all([
                TrackPlayer.getActiveTrackIndex().catch(() => 0),
                playerPersistenceService.loadPlayerState().catch(() => null),
              ]);
              const activeIndex = typeof rawIndex === "number" ? rawIndex : 0;
              const persistedMap = new Map((persisted?.queue || []).map((s: Song) => [s.id, s]));

              const mappedSongs: Song[] = nativeQueue.map((t: any) => {
                const existing = persistedMap.get(t.id);
                if (existing) {
                  return {
                    ...existing,
                    duration: t.duration || existing.duration,
                    audioUrl: t.url || existing.audioUrl,
                  };
                }
                return {
                  id: t.id,
                  title: t.title || "Unknown",
                  artist: t.artist || "Mavrixfy",
                  album: t.album,
                  duration: t.duration,
                  coverUrl: t.artwork,
                  audioUrl: t.url,
                } as Song;
              });
              const currentActiveSong = mappedSongs[activeIndex] || mappedSongs[0];

              if (mounted) {
                setCurrentSong(currentActiveSong);
                currentSongRef.current = currentActiveSong;
                setQueue(mappedSongs);
                queueRef.current = mappedSongs;
                setSourceQueue(mappedSongs);
                originalQueueRef.current = mappedSongs;
                setQueueIndex(activeIndex);
                queueIndexRef.current = activeIndex;
                setIsPlaying(isPlayingNow);
                isPlayingRef.current = isPlayingNow;

                updatePlaybackEngineSnapshot({
                  currentSong: currentActiveSong,
                  queue: mappedSongs,
                  sourceQueue: mappedSongs,
                  queueIndex: activeIndex,
                  isPlaying: isPlayingNow,
                  desiredPlayState: isPlayingNow,
                });
                return;
              }
            }
          }
        }

        const persisted = await playerPersistenceService.loadPlayerState();
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
      } catch (err) {
        logger.warn("[Player] Startup reconciliation skipped:", err);
      }
    };

    void reconcileStartup();
    return () => {
      mounted = false;
    };
  }, [ensurePlayerReady, isPlayerReady]);
}
