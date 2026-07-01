import { useRef, useSyncExternalStore } from "react";
import type { Song } from "@/lib/musicData";

export type PlaybackCommandType =
  | "playSong"
  | "skipNext"
  | "skipPrevious"
  | "togglePlay"
  | "seekTo"
  | "setQueue"
  | "shuffle"
  | "repeat"
  | "nativeSync";

export interface PlaybackEngineSnapshot {
  currentSong: Song | null;
  currentSongId: string | null;
  queue: Song[];
  queueIds: string[];
  sourceQueue: Song[];
  userQueuedSongIds: string[];
  queueIndex: number;
  activeIndex: number;
  isPlaying: boolean;
  desiredPlayState: boolean | null;
  isBuffering: boolean;
  isLoading: boolean;
  isTransitioning: boolean;
  transitionId: number;
  transitionType: PlaybackCommandType | null;
  transitionTargetId: string | null;
  transitionTargetIndex: number | null;
  error: string | null;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  updatedAt: number;
}

export interface PlaybackTransaction {
  id: number;
  type: PlaybackCommandType;
  targetSongId: string | null;
  targetIndex: number | null;
  isCurrent: () => boolean;
}

type SnapshotPatch = Partial<Omit<PlaybackEngineSnapshot, "currentSongId" | "queueIds" | "activeIndex" | "updatedAt">>;
type SnapshotUpdater = SnapshotPatch | ((snapshot: PlaybackEngineSnapshot) => SnapshotPatch);
type Listener = () => void;

const INITIAL_SNAPSHOT: PlaybackEngineSnapshot = {
  currentSong: null,
  currentSongId: null,
  queue: [],
  queueIds: [],
  sourceQueue: [],
  userQueuedSongIds: [],
  queueIndex: 0,
  activeIndex: 0,
  isPlaying: false,
  desiredPlayState: null,
  isBuffering: false,
  isLoading: false,
  isTransitioning: false,
  transitionId: 0,
  transitionType: null,
  transitionTargetId: null,
  transitionTargetIndex: null,
  error: null,
  isShuffled: false,
  repeatMode: "off",
  updatedAt: 0,
};

let snapshot = INITIAL_SNAPSHOT;
let transactionSequence = 0;
const listeners = new Set<Listener>();

function shallowEqualObject<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;

  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightKeys = Object.keys(right as Record<string, unknown>);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

function normalizeSnapshot(next: PlaybackEngineSnapshot): PlaybackEngineSnapshot {
  return {
    ...next,
    currentSongId: next.currentSong?.id ?? null,
    queueIds: next.queue.map((song) => song.id),
    activeIndex: next.queueIndex,
  };
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function getPlaybackEngineSnapshot(): PlaybackEngineSnapshot {
  return snapshot;
}

function subscribePlaybackEngine(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updatePlaybackEngineSnapshot(update: SnapshotUpdater): void {
  const patch = typeof update === "function" ? update(snapshot) : update;
  if (!patch || Object.keys(patch).length === 0) return;

  const next = normalizeSnapshot({
    ...snapshot,
    ...patch,
    updatedAt: Date.now(),
  });

  if (shallowEqualObject(snapshot, next)) return;
  snapshot = next;
  emit();
}

export function beginPlaybackTransaction({
  type,
  targetSongId = null,
  targetIndex = null,
  desiredPlayState = true,
}: {
  type: PlaybackCommandType;
  targetSongId?: string | null;
  targetIndex?: number | null;
  desiredPlayState?: boolean | null;
}): PlaybackTransaction {
  const id = ++transactionSequence;

  updatePlaybackEngineSnapshot({
    transitionId: id,
    transitionType: type,
    transitionTargetId: targetSongId,
    transitionTargetIndex: targetIndex,
    desiredPlayState,
    isTransitioning: true,
    error: null,
  });

  return {
    id,
    type,
    targetSongId,
    targetIndex,
    isCurrent: () => isPlaybackTransactionCurrent(id, targetSongId),
  };
}

function isPlaybackTransactionCurrent(id: number, targetSongId?: string | null): boolean {
  const current = getPlaybackEngineSnapshot();
  return (
    current.transitionId === id &&
    (targetSongId == null || current.transitionTargetId == null || current.transitionTargetId === targetSongId)
  );
}

export function completePlaybackTransaction(id: number): void {
  updatePlaybackEngineSnapshot((current) => {
    if (current.transitionId !== id) return {};
    return {
      isTransitioning: false,
      transitionType: null,
      transitionTargetId: null,
      transitionTargetIndex: null,
      error: null,
    };
  });
}

export function failPlaybackTransaction(id: number, error: string): void {
  updatePlaybackEngineSnapshot((current) => {
    if (current.transitionId !== id) return {};
    return {
      isTransitioning: false,
      transitionType: null,
      transitionTargetId: null,
      transitionTargetIndex: null,
      desiredPlayState: null,
      error,
    };
  });
}

function usePlaybackEngineSelector<T>(
  selector: (snapshot: PlaybackEngineSnapshot) => T,
  isEqual: (left: T, right: T) => boolean = Object.is
): T {
  const cacheRef = useRef<{ value: T } | null>(null);

  const getSelectedSnapshot = () => {
    const selected = selector(getPlaybackEngineSnapshot());
    if (cacheRef.current && isEqual(cacheRef.current.value, selected)) {
      return cacheRef.current.value;
    }
    cacheRef.current = { value: selected };
    return selected;
  };

  return useSyncExternalStore(subscribePlaybackEngine, getSelectedSnapshot, getSelectedSnapshot);
}

export function usePlaybackNowPlaying() {
  return usePlaybackEngineSelector(
    (state) => ({
      currentSong: state.currentSong,
      queue: state.queue,
      sourceQueue: state.sourceQueue,
      queueIndex: state.queueIndex,
      isShuffled: state.isShuffled,
      repeatMode: state.repeatMode,
    }),
    shallowEqualObject
  );
}

export function usePlaybackPlayState() {
  return usePlaybackEngineSelector(
    (state) => ({
      isPlaying: state.isPlaying,
      desiredPlayState: state.desiredPlayState,
      isBuffering: state.isBuffering,
      isLoading: state.isLoading,
      isTransitioning: state.isTransitioning,
    }),
    shallowEqualObject
  );
}

export function usePlaybackRowState(songId: string | null | undefined) {
  return usePlaybackEngineSelector(
    (state) => {
      const isActive = Boolean(songId && state.currentSongId === songId);
      return {
        isActive,
        isPlaying: isActive && state.isPlaying,
      };
    },
    shallowEqualObject
  );
}

export function usePlaybackQueueState() {
  return usePlaybackEngineSelector(
    (state) => ({
      currentSong: state.currentSong,
      queue: state.queue,
      userQueuedSongIds: state.userQueuedSongIds,
      queueIndex: state.queueIndex,
      isShuffled: state.isShuffled,
    }),
    shallowEqualObject
  );
}
