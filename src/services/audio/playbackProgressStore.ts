import { useSyncExternalStore } from "react";
import type { PlayerProgressContextValue } from "@/types/playbackTypes";

export type ProgressSnapshot = PlayerProgressContextValue;

let currentProgress: ProgressSnapshot = {
  progress: 0,
  duration: 0,
  positionMillis: 0,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getPlaybackProgressSnapshot(): ProgressSnapshot {
  return currentProgress;
}

export function subscribePlaybackProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updatePlaybackProgress(patch: Partial<ProgressSnapshot>): void {
  const progress = patch.progress !== undefined ? patch.progress : currentProgress.progress;
  const duration = patch.duration !== undefined ? patch.duration : currentProgress.duration;
  const positionMillis = patch.positionMillis !== undefined ? patch.positionMillis : currentProgress.positionMillis;

  if (
    progress === currentProgress.progress &&
    duration === currentProgress.duration &&
    positionMillis === currentProgress.positionMillis
  ) {
    return;
  }

  currentProgress = {
    progress,
    duration,
    positionMillis,
  };

  emit();
}

export function resetPlaybackProgress(): void {
  if (
    currentProgress.progress === 0 &&
    currentProgress.duration === 0 &&
    currentProgress.positionMillis === 0
  ) {
    return;
  }
  currentProgress = {
    progress: 0,
    duration: 0,
    positionMillis: 0,
  };
  emit();
}

export function usePlaybackProgressStore(): ProgressSnapshot {
  return useSyncExternalStore(
    subscribePlaybackProgress,
    getPlaybackProgressSnapshot,
    getPlaybackProgressSnapshot
  );
}
