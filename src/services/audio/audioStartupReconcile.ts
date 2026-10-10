import { getAccountScope, isCurrentAccount } from "@/lib/accountScope";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { updatePlaybackEngineSnapshot } from "@/services/audio/PlaybackEngine";
import { playerPersistenceService } from "@/services/player/playerPersistenceService";
import { useEffect,useRef,type MutableRefObject } from "react";
import type { NativePlaybackPlayer, State as AudioState } from "./StandardAudioPlayer";

interface UseStartupPlaybackReconcileOptions {
  TrackPlayer: NativePlaybackPlayer | null;
  State: typeof AudioState;
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
  playRequestIdRef: MutableRefObject<number>;
  desiredPlayStateRef: MutableRefObject<boolean | null>;
  isNativeQueueSyncedRef: MutableRefObject<boolean>;
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
        playRequestIdRef,
        desiredPlayStateRef,
        isNativeQueueSyncedRef,
      } = optionsRef.current;

      // Restoration only owns an untouched startup session. A Play request or
      // account change during an asynchronous read always takes precedence.
      if (currentSongRef.current || playRequestIdRef.current > 0) return;
      const requestId = playRequestIdRef.current;
      const scope = getAccountScope();
      const canRestore = () => mounted && isCurrentAccount(scope) &&
        playRequestIdRef.current === requestId && !currentSongRef.current;

      try {
        if (TrackPlayer) {
          const ready = isPlayerReady || (await ensurePlayerReady());
          if (!canRestore()) return;
          if (ready) {
            const [activeTrack, nativeQueue, playbackState] = await Promise.all([
              TrackPlayer.getActiveTrack().catch(() => null),
              TrackPlayer.getQueue().catch(() => []),
              TrackPlayer.getPlaybackState().catch(() => null),
            ]);
            if (!canRestore()) return;
            const rawState = (playbackState as any)?.state ?? playbackState;
            const isPlayingNow = rawState === State.Playing;

            const owner = scope.accountId ?? "guest";
            if (activeTrack?.id && activeTrack.accountId !== owner) await TrackPlayer.reset();
            if (!canRestore()) return;
            if (activeTrack?.id && activeTrack.accountId === owner && Array.isArray(nativeQueue) && nativeQueue.length > 0) {
              const [rawIndex, persisted] = await Promise.all([
                TrackPlayer.getActiveTrackIndex().catch(() => 0),
                playerPersistenceService.loadPlayerState().catch(() => null),
              ]);
              if (!canRestore()) return;
              const activeIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < nativeQueue.length ? rawIndex : 0;
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

              if (canRestore()) {
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
                desiredPlayStateRef.current = isPlayingNow;
                isNativeQueueSyncedRef.current = true;

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
        if (!canRestore() || !persisted?.currentSong?.id) return;
        const song = persisted.currentSong;
        const q = Array.isArray(persisted.queue) && persisted.queue.length > 0 ? persisted.queue : [song];
        const requestedIndex = persisted.queueIndex;
        let qIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < q.length &&
          q[requestedIndex]?.id === song.id ? requestedIndex : q.findIndex((item) => item.id === song.id);
        if (qIndex < 0) { q.push(song); qIndex = q.length - 1; }

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
        desiredPlayStateRef.current = false;
        isNativeQueueSyncedRef.current = false;

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
