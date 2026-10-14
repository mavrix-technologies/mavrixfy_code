import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

const listeners = new Set<() => void>();
let nativeSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let appState = AppState.currentState;

export function getAppIsActive(): boolean {
  return appState === "active";
}

export function getAppIsBackgrounded(): boolean {
  return appState === "background";
}

export function subscribeAppActivity(listener: () => void): () => void {
  listeners.add(listener);
  if (!nativeSubscription) {
    appState = AppState.currentState;
    nativeSubscription = AppState.addEventListener("change", (state) => {
      if (state === appState) return;
      appState = state;
      listeners.forEach((notify) => notify());
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      nativeSubscription?.remove();
      nativeSubscription = null;
    }
  };
}

// Many decorative components share a single native lifecycle subscription.
export function useAppIsActive(): boolean {
  return useSyncExternalStore(subscribeAppActivity, getAppIsActive, () => false);
}

// iOS system overlays temporarily make an app inactive without backgrounding.
export function useAppIsBackgrounded(): boolean {
  return useSyncExternalStore(subscribeAppActivity, getAppIsBackgrounded, () => false);
}
