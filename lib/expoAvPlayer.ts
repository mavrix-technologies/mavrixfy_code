/**
 * expo-audio based player — Expo Go fallback.
 * Uses expo-audio (SDK 54+), the modern replacement for expo-av.
 */
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer, AudioSample } from "expo-audio";
import { publishPlaybackAudioSample, resetPlaybackAudioLevels } from "@/lib/playbackAudioLevels";

// ─── singletons ───────────────────────────────────────────────────────────────

// The one and only active player. Any new loadAndPlay call replaces it.
let activePlayer: AudioPlayer | null = null;
let currentUrl: string | null = null;
let seekBlockUntil = 0;
let seekResetTimer: ReturnType<typeof setTimeout> | null = null;
type PlayerSubscription = {
  remove?: () => void;
};

type PlayerSubscriptions = {
  status?: PlayerSubscription;
  sample?: PlayerSubscription;
};

const playerSubscriptions = new WeakMap<AudioPlayer, PlayerSubscriptions>();

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
function clearListeners(): void {
  statusCb = null;
  errorCb = null;
}

// ─── internal helpers ─────────────────────────────────────────────────────────

/**
 * Immediately silence + destroy a player instance.
 * Safe to call with null.
 */
function killPlayer(p: AudioPlayer | null): void {
  if (!p) return;
  const subscriptions = playerSubscriptions.get(p);
  try { subscriptions?.status?.remove?.(); } catch {}
  try { subscriptions?.sample?.remove?.(); } catch {}
  playerSubscriptions.delete(p);
  try { p.setAudioSamplingEnabled(false); } catch {}
  try { p.pause(); } catch {}   // stop audio output immediately
  try { p.remove(); } catch {}  // release native resources
  resetPlaybackAudioLevels();
}

function clearSeekResetTimer(): void {
  if (seekResetTimer) {
    clearTimeout(seekResetTimer);
    seekResetTimer = null;
  }
  seekBlockUntil = 0;
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
  const status = p.addListener("playbackStatusUpdate", (status) => {
    if (gen !== generation || !statusCb) return;
    if (Date.now() < seekBlockUntil && !status.didJustFinish) return;
    statusCb({
      isPlaying: status.playing,
      position: status.currentTime ?? 0,
      duration: status.duration ?? 0,
      didJustFinish: status.didJustFinish ?? false,
    });
  });

  let sample: PlayerSubscription | undefined;
  if (p.isAudioSamplingSupported) {
    try {
      p.setAudioSamplingEnabled(true);
      sample = p.addListener("audioSampleUpdate", (audioSample: AudioSample) => {
        if (gen !== generation) return;
        publishPlaybackAudioSample(audioSample);
      });
    } catch {
      resetPlaybackAudioLevels();
    }
  }

  playerSubscriptions.set(p, { status: status ?? {}, sample });
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
  clearSeekResetTimer();
  killPlayer(prev);

  try {
    if (myGen !== generation) return;

    // 3. Set audio mode once (cached after first call).
    await ensureAudioMode();

    // 4. If another loadAndPlay fired while we awaited, it already owns playback.
    if (myGen === generation) {
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
    }
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

function stop(): void {
  generation += 1;
  const p = activePlayer;
  activePlayer = null;
  currentUrl = null;
  clearSeekResetTimer();
  killPlayer(p);
  resetPlaybackAudioLevels();
}

export function destroy(): void {
  clearListeners();
  stop();
}

export async function seekTo(seconds: number): Promise<void> {
  if (!activePlayer) return;
  try {
    if (seekResetTimer) {
      clearTimeout(seekResetTimer);
    }
    seekBlockUntil = Date.now() + 700;
    await activePlayer.seekTo(seconds);
    seekResetTimer = setTimeout(() => {
      seekBlockUntil = 0;
      seekResetTimer = null;
    }, 700);
  } catch {}
}

export function isLoaded(): boolean { return activePlayer !== null; }
function getCurrentUrl(): string | null { return currentUrl; }
