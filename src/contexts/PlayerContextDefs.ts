import { usePlaybackProgressStore } from "@/services/audio/playbackProgressStore";
import type {
PlayerActionsContextValue,
PlayerBrowseContextValue,
} from "@/types/playbackTypes";
import { createContext,use } from "react";

export const PlayerBrowseContext = createContext<PlayerBrowseContextValue | null>(null);
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

export { useLikedSongs } from "@/services/liked-songs";

/** Stable row action callbacks that do NOT re-render on active song or play-state changes */
export function usePlayerRowActions() {
  const rowActions = use(PlayerRowActionsContext);
  if (!rowActions) throw new Error("usePlayerRowActions must be used within PlayerProvider");
  return rowActions;
}

export function usePlayerBrowse() {
  const ctx = use(PlayerBrowseContext);
  if (!ctx) throw new Error("usePlayerBrowse must be used within PlayerProvider");
  return ctx;
}
