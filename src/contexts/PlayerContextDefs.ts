import { createContext, use } from "react";
import { usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import type {
  PlayerContextValue,
  PlayerLiteContextValue,
  PlayerProgressContextValue,
  PlayerRowContextValue,
  PlayerBrowseContextValue,
  PlayerQueueContextValue,
  PlayerActionsContextValue,
  PlayerLikedContextValue,
} from "@/types/playbackTypes";

export const PlayerContext = createContext<PlayerContextValue | null>(null);
export const PlayerLiteContext = createContext<PlayerLiteContextValue | null>(null);
export const PlayerProgressContext = createContext<PlayerProgressContextValue | null>(null);
export const PlayerRowContext = createContext<PlayerRowContextValue | null>(null);
export const PlayerBrowseContext = createContext<PlayerBrowseContextValue | null>(null);
export const PlayerQueueContext = createContext<PlayerQueueContextValue | null>(null);
export const PlayerLikedContext = createContext<PlayerLikedContextValue | null>(null);
export const PlayerActionsContext = createContext<PlayerActionsContextValue | null>(null);
export const PlayerRowActionsContext = createContext<{
  playSong: (song: any, queue?: any[]) => Promise<void> | void;
  toggleLike: (song: any) => Promise<void>;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: any) => void;
  playNext: (song: any) => void;
} | null>(null);

export function usePlayerProgress() {
  return usePlaybackProgressStore();
}

export function useOptionalPlayerProgress() {
  return usePlaybackProgressStore();
}

export function usePlayerActions() {
  const ctx = use(PlayerActionsContext);
  if (!ctx) throw new Error("usePlayerActions must be used within PlayerProvider");
  return ctx;
}

export function useOptionalPlayerActions() {
  return use(PlayerActionsContext);
}

export { useLikedSongs } from "@/features/liked-songs";

export function usePlayerRow() {
  const ctx = use(PlayerRowContext);
  if (!ctx) throw new Error("usePlayerRow must be used within PlayerProvider");
  return ctx;
}

/** Stable row action callbacks that do NOT re-render on active song or play-state changes */
export function usePlayerRowActions() {
  const rowActions = use(PlayerRowActionsContext);
  if (rowActions) return rowActions;
  const actions = use(PlayerActionsContext);
  const row = use(PlayerRowContext);
  return actions || row || {
    playSong: () => {},
    toggleLike: async () => {},
    isLiked: () => false,
    addToQueue: () => {},
    playNext: () => {},
  };
}

export function usePlayerBrowse() {
  const ctx = use(PlayerBrowseContext);
  if (!ctx) throw new Error("usePlayerBrowse must be used within PlayerProvider");
  return ctx;
}

