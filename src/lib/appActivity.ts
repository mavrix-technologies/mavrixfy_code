import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

const listeners = new Set<() => void>();
let nativeSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let isActive = AppState.currentState === "active";

export function getAppIsActive(): boolean {
  return isActive;
}

export function subscribeAppActivity(listener: () => void): () => void {
  listeners.add(listener);
  if (!nativeSubscription) {
    isActive = AppState.currentState === "active";
    nativeSubscription = AppState.addEventListener("change", (state) => {
      const next = state === "active";
      if (next === isActive) return;
      isActive = next;
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
