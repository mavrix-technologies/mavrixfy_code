/**
 * expo-audio based player — Expo Go fallback.
 * Uses expo-audio (SDK 54+), the modern replacement for expo-av.
 */
import type { Song } from "@/lib/musicData";
import type { AudioPlayer } from "expo-audio";
import { createAudioPlayer,setAudioModeAsync } from "expo-audio";

// ─── singletons ───────────────────────────────────────────────────────────────

// The one and only active player. Any new loadAndPlay call replaces it.
let activePlayer: AudioPlayer | null = null;
let standbyPlayer: AudioPlayer | null = null;
let standbyUrl: string | null = null;
let standbyGeneration = 0;
let seekBlockUntil = 0;
let seekResetTimer: ReturnType<typeof setTimeout> | null = null;
type PlayerSubscription = {
  remove?: () => void;
};

type PlayerSubscriptions = {
  status?: PlayerSubscription;
};

const playerSubscriptions = new WeakMap<AudioPlayer, PlayerSubscriptions>();
const cancelReadyWait = new WeakMap<AudioPlayer, () => void>();
const initialSeekPending = new WeakSet<AudioPlayer>();

// Monotonically increasing request id.
// Every loadAndPlay increments this. Callbacks from older players are dropped.
let generation = 0;

// audioMode only needs to be set once per app session.
let audioModeSet = false;
let audioModePending: Promise<void> | null = null;

// ─── callbacks ────────────────────────────────────────────────────────────────

type StatusCallback = (s: {
  isPlaying: boolean;
  position: number;
  duration: number;
  didJustFinish: boolean;
  error?: string | null;
  isLoaded?: boolean;
  isBuffering?: boolean;
}) => void;

let statusCb: StatusCallback | null = null;

export function onStatusUpdate(cb: StatusCallback) { statusCb = cb; }
function clearListeners(): void {
  statusCb = null;
}

// ─── internal helpers ─────────────────────────────────────────────────────────

/**
 * Immediately silence + destroy a player instance.
 * Safe to call with null.
 */
function killPlayer(p: AudioPlayer | null): void {
  if (!p) return;
  cancelReadyWait.get(p)?.();
  cancelReadyWait.delete(p);
  try { (p as any).clearLockScreenControls?.(); } catch {}
  try { (p as any).setActiveForLockScreen?.(false); } catch {}
  const subscriptions = playerSubscriptions.get(p);
  try { subscriptions?.status?.remove?.(); } catch {}
  playerSubscriptions.delete(p);
  try { p.pause(); } catch {}   // stop audio output immediately
  try { p.release(); } catch {}  // release native resources
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
  if (audioModePending) return audioModePending;
  audioModePending = (async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    audioModeSet = true;
  })().finally(() => { audioModePending = null; });
  return audioModePending;
}

function attachListener(p: AudioPlayer, gen: number): void {
  const status = p.addListener("playbackStatusUpdate", (status) => {
    if (gen !== generation || !statusCb) return;
    if (initialSeekPending.has(p) && !status.error) return;
    if (Date.now() < seekBlockUntil && !status.didJustFinish) return;
    statusCb({
      isPlaying: status.playing,
      position: status.currentTime ?? 0,
      duration: status.duration ?? 0,
      didJustFinish: status.didJustFinish ?? false,
      error: status.error,
      isLoaded: status.isLoaded,
      isBuffering: status.isBuffering,
    });
  });

  playerSubscriptions.set(p, { status: status ?? {} });
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Pre-warms the next track's audio stream in the background ahead of time.
 * When loadAndPlay is called for this exact URL, playback starts with 0ms buffering gap.
 */
export async function prepareStandby(url: string, song?: Partial<Song> | null): Promise<void> {
  if (!url || standbyUrl === url) return;
  const request = ++standbyGeneration;
  if (standbyPlayer) {
    killPlayer(standbyPlayer);
    standbyPlayer = null;
    standbyUrl = null;
  }
  try {
    await ensureAudioMode();
    if (request !== standbyGeneration) return;
    const p = createAudioPlayer({ uri: url, headers: song?.playbackHeaders }, { updateInterval: 500 });
    standbyPlayer = p;
    standbyUrl = url;
  } catch {
    // Non-fatal standby prefetch failure
  }
}

export async function loadAndPlay(url: string, song?: Partial<Song> | null, shouldPlay: () => boolean = () => true, initialPosition = 0): Promise<void> {
  if (!url) {
    throw new Error("No audio URL provided");
  }

  // 1. Bump generation and capture the snapshot for this call.
  generation += 1;
  standbyGeneration += 1;
  const myGen = generation;

  let p: AudioPlayer;

  // 2. Check if standby pre-buffered player is ready for this URL
  if (standbyPlayer && standbyUrl === url) {
    p = standbyPlayer;
    standbyPlayer = null;
    standbyUrl = null;

    const prev = activePlayer;
    activePlayer = null;
    clearSeekResetTimer();
    killPlayer(prev);

    if (myGen !== generation) {
      killPlayer(p);
      return;
    }
  } else {
    // Kill standby if it was prepared for a different song
    if (standbyPlayer) {
      killPlayer(standbyPlayer);
      standbyPlayer = null;
      standbyUrl = null;
    }

    const prev = activePlayer;
    activePlayer = null;
    clearSeekResetTimer();
    killPlayer(prev);

    try {
      if (myGen !== generation) return;
      await ensureAudioMode();
      if (myGen !== generation) return;
      p = createAudioPlayer({ uri: url, headers: song?.playbackHeaders }, { updateInterval: 500 });
      if (myGen !== generation) {
        killPlayer(p);
        return;
      }
    } catch (err: any) {
      if (myGen === generation) {
        throw err;
      }
      return;
    }
  }

  // 3. Register as the active player, wire events, start playback.
  seekBlockUntil = 0;
  activePlayer = p;
  if (Number.isFinite(initialPosition) && initialPosition > 0) initialSeekPending.add(p);
  attachListener(p, myGen);

  if (typeof (p as any).setActiveForLockScreen === "function") {
    try {
      (p as any).setActiveForLockScreen(
        true,
        {
          title: song?.title || "Unknown",
          artist: song?.artist || "Mavrixfy",
          albumTitle: song?.album || undefined,
          artworkUrl: song?.coverUrl || undefined,
        },
        {
          showSeekBackward: false,
          showSeekForward: false,
          isLiveStream: false,
        }
      );
    } catch {
      // non-fatal
    }
  }

  // A recovered stream must be ready and seeked before output begins. Never
  // briefly play the opening of a track that should resume halfway through.
  if (Number.isFinite(initialPosition) && initialPosition > 0) {
    let subscription: PlayerSubscription | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!p.isLoaded) {
        await new Promise<void>((resolve, reject) => {
          cancelReadyWait.set(p, resolve);
          subscription = p.addListener("playbackStatusUpdate", status => {
            if (myGen !== generation) resolve();
            else if (status.error) reject(new Error("Audio could not load for resume"));
            else if (status.isLoaded) resolve();
          });
          timer = setTimeout(() => reject(new Error("Audio resume timed out")), 12000);
        });
      }
      if (myGen !== generation || activePlayer !== p) return;
      await p.seekTo(initialPosition);
    } catch (error) {
      if (myGen !== generation) return;
      activePlayer = null;
      killPlayer(p);
      throw error;
    } finally {
      clearTimeout(timer);
      subscription?.remove?.();
      cancelReadyWait.delete(p);
      initialSeekPending.delete(p);
    }
  }
  if (myGen === generation && activePlayer === p && shouldPlay()) p.play();
}

export function play(): void {
  try { activePlayer?.play(); } catch {}
}

export function pause(): void {
  try { activePlayer?.pause(); } catch {}
}

function stop(): void {
  generation += 1;
  standbyGeneration += 1;
  const p = activePlayer;
  activePlayer = null;
  clearSeekResetTimer();
  killPlayer(p);
  if (standbyPlayer) {
    killPlayer(standbyPlayer);
    standbyPlayer = null;
    standbyUrl = null;
  }
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
export function isEnded(): boolean {
  return !!activePlayer && activePlayer.duration > 0 && activePlayer.currentTime >= activePlayer.duration - 0.1;
}
