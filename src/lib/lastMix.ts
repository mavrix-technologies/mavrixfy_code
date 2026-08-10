/**
 * Module-level singleton that remembers the last artist mix params.
 * Supports React subscriptions so the mini player re-renders when a mix is set.
 */
import { useSyncExternalStore } from "react";

export interface LastMixParams {
  ids: string;
  names: string;
  images: string;
  songIds: string;
  [key: string]: string;
}

let _lastMix: LastMixParams | null = null;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

export function setLastMix(params: LastMixParams): void {
  _lastMix = params;
  _notify();
}

function getLastMix(): LastMixParams | null {
  return _lastMix;
}

export function clearLastMix(): void {
  _lastMix = null;
  _notify();
}

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function getSnapshot() {
  return _lastMix;
}

/** React hook — re-renders the component whenever the mix changes */
export function useLastMix(): LastMixParams | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
