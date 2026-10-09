/**
 * playerUIState.ts
 *
 * A lightweight singleton store that manages whether the player overlay
 * is hidden, showing as a mini bar, or expanded to full-screen.
 *
 * Design: ref-based event emitter so that expand/collapse never causes
 * unnecessary re-renders in sibling components.
 */

import { useSyncExternalStore } from "react";

export type PlayerUIState = "hidden" | "mini" | "expanded";

type UIStateListener = (state: PlayerUIState) => void;

const listeners = new Set<UIStateListener>();
let _currentState: PlayerUIState = "hidden";
let _revision = 0;

export const playerUIStateStore = {
  get current(): PlayerUIState {
    return _currentState;
  },

  get revision(): number {
    return _revision;
  },

  subscribe(listener: UIStateListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  _emit(state: PlayerUIState) {
    if (_currentState === state) return;
    _currentState = state;
    _revision += 1;
    listeners.forEach((l) => l(state));
  },

  expandPlayer() {
    this._emit("expanded");
  },

  collapsePlayer() {
    this._emit("mini");
  },

  hidePlayer() {
    this._emit("hidden");
  },

  showMini() {
    this._emit("mini");
  },
};

const subscribePlayerUI = (listener: () => void) => playerUIStateStore.subscribe(listener);
const getPlayerUIState = () => playerUIStateStore.current;

export function usePlayerUIState(): PlayerUIState {
  return useSyncExternalStore(subscribePlayerUI, getPlayerUIState, getPlayerUIState);
}

/** Imperative expand — call from MiniPlayer tap, openPlayer(), etc. */
export function expandPlayer() {
  playerUIStateStore.expandPlayer();
}

/** Imperative collapse — call from swipe-down gesture or chevron-down button */
export function collapsePlayer() {
  playerUIStateStore.collapsePlayer();
}

/** Completely hide the player overlay (no song playing) */
export function hidePlayer() {
  playerUIStateStore.hidePlayer();
}
