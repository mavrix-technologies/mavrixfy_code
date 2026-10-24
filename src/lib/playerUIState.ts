/** Native routes own visibility; the player surface owns its expansion motion. */

import { useSyncExternalStore } from "react";
import { router } from "expo-router";
import type { LayoutRectangle, ViewInstance } from "react-native";

export type MiniPlayerOrigin = {
  songId: string;
  sheet: LayoutRectangle;
  artwork: LayoutRectangle;
  backgroundColor: string;
  capturedAt: number;
};

/** Capture only the dock; artwork coordinates are its existing fixed layout. */
export function expandPlayerFromMiniPlayer(
  view: ViewInstance | null,
  songId: string | undefined,
  backgroundColor: string,
  artworkLeft: number,
) {
  if (!view || !songId) { expandPlayer(); return; }
  view.measureInWindow((x, y, width, height) => {
    if (width <= 0 || height <= 0) { expandPlayer(); return; }
    const origin: MiniPlayerOrigin = {
      songId, sheet: { x, y, width, height },
      artwork: { x: artworkLeft, y: (height - 44) / 2, width: 44, height: 44 },
      backgroundColor, capturedAt: Date.now(),
    };
    router.navigate({ pathname: "/player", params: { miniOrigin: JSON.stringify(origin) } });
  });
}

/** Synchronous navigation using pre-measured dock bounds without measureInWindow lag. */
export function expandPlayerFromMiniPlayerBounds(
  sheet: LayoutRectangle,
  songId: string | undefined,
  backgroundColor: string,
  artworkLeft: number,
) {
  if (!songId || sheet.width <= 0 || sheet.height <= 0) { expandPlayer(); return; }
  const origin: MiniPlayerOrigin = {
    songId, sheet,
    artwork: { x: artworkLeft, y: (sheet.height - 44) / 2, width: 44, height: 44 },
    backgroundColor, capturedAt: Date.now(),
  };
  router.navigate({ pathname: "/player", params: { miniOrigin: JSON.stringify(origin) } });
}

export function readMiniPlayerOrigin(raw: string | string[] | undefined, songId?: string): MiniPlayerOrigin | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as MiniPlayerOrigin;
    const validRect = (rect: LayoutRectangle) => rect &&
      [rect.x, rect.y, rect.width, rect.height].every(n => Number.isFinite(n) && Math.abs(n) < 10000) &&
      rect.width > 0 && rect.height > 0;
    if (value.songId !== songId || !Number.isFinite(value.capturedAt) ||
      Math.abs(Date.now() - value.capturedAt) > 60000 || typeof value.backgroundColor !== "string" ||
      !validRect(value.sheet) || !validRect(value.artwork)) return null;
    return value;
  } catch { return null; }
}

export type PlayerUIState = "hidden" | "mini" | "expanded" | "collapsing";

type UIStateListener = (state: PlayerUIState) => void;

const listeners = new Set<UIStateListener>();
let current: PlayerUIState = "hidden";

export const playerUIStateStore = {
  get current(): PlayerUIState {
    return current;
  },

  subscribe(listener: UIStateListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  _emit(state: PlayerUIState) {
    if (current === state) return;
    current = state;
    listeners.forEach((l) => l(state));
  },

  expandPlayer() {
    this._emit("expanded");
  },

  collapsePlayer() {
    this._emit("mini");
  },

  beginCollapse() {
    this._emit("collapsing");
  },

  hidePlayer() {
    this._emit("hidden");
  },

};

const subscribePlayerUI = (listener: () => void) => playerUIStateStore.subscribe(listener);
const getPlayerUIState = () => current;

export function usePlayerUIState(): PlayerUIState {
  return useSyncExternalStore(subscribePlayerUI, getPlayerUIState, getPlayerUIState);
}

/** Native navigation owns opening; visibility is synchronized by route focus. */
export function expandPlayer() {
  router.navigate("/player");
}
