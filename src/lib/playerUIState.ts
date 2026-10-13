/** Route focus reports player visibility; native navigation owns transitions. */

import { useSyncExternalStore } from "react";
import { router } from "expo-router";

export type PlayerUIState = "hidden" | "mini" | "expanded";

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
