/**
 * expo-audio based player — Expo Go fallback.
 * Uses expo-audio (SDK 54+), the modern replacement for expo-av.
 */
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";

// ─── singletons ───────────────────────────────────────────────────────────────

// The one and only active player. Any new loadAndPlay call replaces it.
let activePlayer: AudioPlayer | null = null;
let currentUrl: string | null = null;
let seekBlockUntil = 0;

// Monotonically increasing request id.
// Every loadAndPlay increments this. Callbacks from older players are dropped.
let generation = 0;

// audioMode only needs to be set once per app session.
let audioModeSet = false;

// ─── callbacks ────────────────────────────────────────────────────────────────

type StatusCallback = (s: {
  isPlaying: boolean;
  position: number;
  duration: number;
  didJustFinish: boolean;
}) => void;

type ErrorCallback = (err: string) => void;

let statusCb: StatusCallback | null = null;
let errorCb: ErrorCallback | null = null;

export function onStatusUpdate(cb: StatusCallback) { statusCb = cb; }
export function onError(cb: ErrorCallback) { errorCb = cb; }

// ─── internal helpers ─────────────────────────────────────────────────────────

/**
 * Immediately silence + destroy a player instance.
 * Safe to call with null.
 */
function killPlayer(p: AudioPlayer | null): void {
  if (!p) return;
  try { p.pause(); } catch {}   // stop audio output immediately
  try { p.remove(); } catch {}  // release native resources
}

async function ensureAudioMode(): Promise<void> {
  if (audioModeSet) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    audioModeSet = true;
  } catch {
    // Non-fatal
  }
}

function attachListener(p: AudioPlayer, gen: number): void {
  p.addListener("playbackStatusUpdate", (status) => {
    if (gen !== generation || !statusCb) return;
    if (Date.now() < seekBlockUntil && !status.didJustFinish) return;
    statusCb({
      isPlaying: status.playing,
      position: status.currentTime ?? 0,
      duration: status.duration ?? 0,
      didJustFinish: status.didJustFinish ?? false,
    });
  });
}

// ─── public API ───────────────────────────────────────────────────────────────

export async function loadAndPlay(url: string): Promise<void> {
  if (!url) {
    errorCb?.("No audio URL provided");
    return;
  }

  // 1. Bump generation and capture the snapshot for this call.
  generation += 1;
  const myGen = generation;

  // 2. Kill the current player RIGHT NOW — before any await.
  //    This stops audio output immediately and prevents two songs playing.
  const prev = activePlayer;
  activePlayer = null;
  killPlayer(prev);

  try {
    // 3. Set audio mode once (cached after first call).
    await ensureAudioMode();

    // 4. If another loadAndPlay fired while we awaited, bail — it already
    //    killed whatever we would have created.
    if (myGen !== generation) return;

    // 5. Create the new player (synchronous in expo-audio).
    currentUrl = url;
    seekBlockUntil = 0;
    const p = createAudioPlayer(url, { updateInterval: 500 });

    // 6. Guard again — another call may have arrived during createAudioPlayer.
    if (myGen !== generation) {
      killPlayer(p);
      return;
    }

    // 7. Register as the active player, wire events, start playback.
    activePlayer = p;
    attachListener(p, myGen);
    p.play();
  } catch (err: any) {
    if (myGen === generation) {
      errorCb?.(err?.message || String(err) || "Playback failed");
    }
  }
}

export function play(): void {
  try { activePlayer?.play(); } catch {}
}

export function pause(): void {
  try { activePlayer?.pause(); } catch {}
}

export function stop(): void {
  generation += 1;
  const p = activePlayer;
  activePlayer = null;
  currentUrl = null;
  killPlayer(p);
}

export async function seekTo(seconds: number): Promise<void> {
  if (!activePlayer) return;
  try {
    seekBlockUntil = Date.now() + 700;
    await activePlayer.seekTo(seconds);
    setTimeout(() => { seekBlockUntil = 0; }, 700);
  } catch {}
}

export function isLoaded(): boolean { return activePlayer !== null; }
export function getCurrentUrl(): string | null { return currentUrl; }
