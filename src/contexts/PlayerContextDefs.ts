import { createContext, use } from "react";
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

export function usePlayerProgress() {
  const ctx = use(PlayerProgressContext);
  if (!ctx) throw new Error("usePlayerProgress must be used within PlayerProvider");
  return ctx;
}

export function useOptionalPlayerProgress() {
  return use(PlayerProgressContext);
}

export function usePlayerActions() {
  const ctx = use(PlayerActionsContext);
  if (!ctx) throw new Error("usePlayerActions must be used within PlayerProvider");
  return ctx;
}

export function useOptionalPlayerActions() {
  return use(PlayerActionsContext);
}

export function useLikedSongs() {
  const ctx = use(PlayerLikedContext);
  if (!ctx) throw new Error("useLikedSongs must be used within PlayerProvider");
  return ctx;
}

export function usePlayerRow() {
  const ctx = use(PlayerRowContext);
  if (!ctx) throw new Error("usePlayerRow must be used within PlayerProvider");
  return ctx;
}

export function usePlayerRowActions() {
  return usePlayerRow();
}

export function usePlayerBrowse() {
  const ctx = use(PlayerBrowseContext);
  if (!ctx) throw new Error("usePlayerBrowse must be used within PlayerProvider");
  return ctx;
}
