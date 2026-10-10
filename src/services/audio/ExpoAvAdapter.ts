/**
 * Expo Audio player for the Expo Go runtime. Custom builds use StandardAudioPlayer.
 */
import type { Song } from "@/lib/musicData";
import { logger } from "@/lib/logger";
import type { AudioPlayer } from "expo-audio";
import { createAudioPlayer,setAudioModeAsync } from "expo-audio";
import { isPrematurePlaybackEnd, playbackDuration, playbackPosition } from "./audioTimeline";

// ─── singletons ───────────────────────────────────────────────────────────────

// The one and only active player. Any new loadAndPlay call replaces it.
let activePlayer: AudioPlayer | null = null;
let standbyPlayer: AudioPlayer | null = null;
let standbyUrl: string | null = null;
let standbyHeaders = "";
let standbyGeneration = 0;
type PlayerSubscription = {
  remove?: () => void;
};

type PlayerSubscriptions = {
  status?: PlayerSubscription;
};

const playerSubscriptions = new WeakMap<AudioPlayer, PlayerSubscriptions>();
const cancelReadyWait = new WeakMap<AudioPlayer, () => void>();
const cancelStartWait = new WeakMap<AudioPlayer, () => void>();
const initialSeekPending = new WeakSet<AudioPlayer>();
const finishedPlayers = new WeakSet<AudioPlayer>();
const resolvedDurations = new WeakMap<AudioPlayer, number>();
function playerDuration(p: AudioPlayer): number { return playbackDuration(p.duration, resolvedDurations.get(p)); }

// Monotonically increasing request id.
// Every loadAndPlay increments this. Callbacks from older players are dropped.
let generation = 0;

// audioMode only needs to be set once per app session.
let audioModeSet = false;
let audioModePending: Promise<void> | null = null;

// Expo Go is often used on a phone over Wi-Fi/cellular data. Allow native
// buffering time to settle before treating startup as unavailable.
const NATIVE_LOAD_TIMEOUT_MS = 30_000;
const NATIVE_START_TIMEOUT_MS = 30_000;

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

export function onStatusUpdate(cb: StatusCallback): () => void {
  statusCb = cb;
  return () => { if (statusCb === cb) statusCb = null; };
}
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
  cancelStartWait.get(p)?.();
  cancelStartWait.delete(p);
  try { p.clearLockScreenControls(); } catch {}
  const subscriptions = playerSubscriptions.get(p);
  try { subscriptions?.status?.remove?.(); } catch {}
  playerSubscriptions.delete(p);
  try { p.pause(); } catch {}   // stop audio output immediately
  try { p.remove(); } catch {}  // release native resources
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

function attachListener(p: AudioPlayer, gen: number, shouldPlay: () => boolean): void {
  let lastPosition = 0;
  let lastDuration = 0;
  let hasPlayed = false;
  const status = p.addListener("playbackStatusUpdate", (status) => {
    if (gen !== generation || activePlayer !== p || finishedPlayers.has(p)) return;
    const duration = playbackDuration(status.duration ?? 0, resolvedDurations.get(p)) || lastDuration;
    if (duration > 0) lastDuration = duration;
    const reportedPosition = Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime) : 0;
    const terminalPosition = Math.max(reportedPosition, Number.isFinite(p.currentTime) ? p.currentTime : 0, lastPosition);
    if (status.playing) hasPlayed = true;
    // Some Expo iOS EOF updates contain only stopped playback, after AVQueuePlayer
    // has removed the item. Reconcile that event against the real stream tail.
    // Stopped-tail recovery excludes buffering and explicit user Pause.
    const stoppedAtTail = hasPlayed && shouldPlay() && !initialSeekPending.has(p) &&
      status.playing === false && status.isBuffering === false && !status.error &&
      status.playbackState !== "buffering" && duration > 0 && terminalPosition > 0 &&
      Math.abs(duration - terminalPosition) <= 0.75;
    const resolvedDuration = resolvedDurations.get(p) || 0;
    // The connected iPhone reports a 2x AVPlayer duration for these streams.
    // Use the resolver's actual audio timeline only when that decoder is inflated;
    // a catalog duration or an ordinary still-playing tail never ends a song.
    const decoderOverrun = status.playing === true && shouldPlay() && !initialSeekPending.has(p) &&
      status.isBuffering === false && !status.error && resolvedDuration > 0 &&
      (status.duration ?? 0) > resolvedDuration * 1.5 && reportedPosition >= resolvedDuration + 0.25;
    const ended = Boolean(status.didJustFinish || status.playbackState === "ended" || stoppedAtTail || decoderOverrun);
    const lostTerminalPosition = hasPlayed && status.playing === false && reportedPosition === 0 && !initialSeekPending.has(p);
    const position = ended || lostTerminalPosition ? terminalPosition : reportedPosition;
    lastPosition = position;
    if (ended) {
      if (finishedPlayers.has(p)) return;
      if (position > 0 && isPrematurePlaybackEnd(position, resolvedDuration)) {
        p.pause();
        statusCb?.({ isPlaying: false, position, duration, didJustFinish: false,
          error: "Audio stream ended early. Tap Play to retry." });
        return;
      }
      finishedPlayers.add(p);
      if (decoderOverrun) p.pause();
    }
    if (!statusCb) return;
    if (initialSeekPending.has(p) && !status.error) return;
    statusCb({
      isPlaying: status.playing,
      position,
      duration,
      didJustFinish: Boolean(ended),
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
 * The standby player stays silent; loadAndPlay removes the outgoing owner
 * before promoting it. Readiness is still checked before playback.
 */
export async function prepareStandby(url: string, song?: Partial<Song> | null): Promise<void> {
  const headers = JSON.stringify(song?.playbackHeaders || {});
  if (!url || (standbyUrl === url && standbyHeaders === headers)) return;
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
    standbyHeaders = headers;
  } catch {
    // Non-fatal standby prefetch failure
  }
}

export async function loadAndPlay(url: string, song?: Partial<Song> | null, shouldPlay: () => boolean = () => true, initialPosition = 0): Promise<void> {
  if (!url) {
    throw new Error("No audio URL provided");
  }

  // Retire audible output before promoting the prepared next source.
  beginTrackChange();
  standbyGeneration += 1;
  const myGen = generation;

  let p: AudioPlayer;

  // 2. Check if standby pre-buffered player is ready for this URL
  if (standbyPlayer && standbyUrl === url && standbyHeaders === JSON.stringify(song?.playbackHeaders || {})) {
    p = standbyPlayer;
    standbyPlayer = null;
    standbyUrl = null;

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

    try {
      if (myGen !== generation) return;
      await ensureAudioMode();
      if (myGen !== generation) return;
      p = createAudioPlayer({ uri: url, headers: song?.playbackHeaders }, { updateInterval: 500 });
      if (myGen !== generation) {
        killPlayer(p);
        return;
      }
    } catch (err) {
      if (myGen === generation) {
        throw err;
      }
      return;
    }
  }

  // 3. Register as the active player, wire events, start playback.
  activePlayer = p;
  const resolvedDuration = playbackDuration(0, song?.playbackDurationSeconds);
  if (resolvedDuration > 0) resolvedDurations.set(p, resolvedDuration);
  if (Number.isFinite(initialPosition) && initialPosition > 0) initialSeekPending.add(p);
  attachListener(p, myGen, shouldPlay);

  try {
    const metadata = {
      title: song?.title || "Unknown",
      artist: song?.artist || "Mavrixfy",
      albumTitle: song?.album || undefined,
      artworkUrl: song?.coverUrl || undefined,
      // Consumed by our native expo-audio patch; stock Expo Go ignores it.
      durationSeconds: resolvedDuration > 0 ? resolvedDuration : undefined,
    };
    p.setActiveForLockScreen(true, metadata, {
      showSeekBackward: false,
      showSeekForward: false,
      isLiveStream: false,
    });
  } catch (error) {
    logger.warn("[Audio] Expo lock-screen controls unavailable", error);
  }

  // A recovered stream must be ready and seeked before output begins. Never
  // briefly play the opening of a track that should resume halfway through.
  if (!p.isLoaded || (Number.isFinite(initialPosition) && initialPosition > 0)) {
    let subscription: PlayerSubscription | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!p.isLoaded) {
        await new Promise<void>((resolve, reject) => {
          cancelReadyWait.set(p, resolve);
          subscription = p.addListener("playbackStatusUpdate", status => {
            if (myGen !== generation) resolve();
            else if (status.error) reject(new Error(status.error));
            else if (status.isLoaded) resolve();
          });
          timer = setTimeout(() => reject(new Error("Audio loading timed out.")), NATIVE_LOAD_TIMEOUT_MS);
        });
      }
      if (myGen !== generation || activePlayer !== p) return;
      if (Number.isFinite(initialPosition) && initialPosition > 0) {
        const duration = playerDuration(p);
        await p.seekTo(playbackPosition(initialPosition, duration));
      }
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
  if (myGen === generation && activePlayer === p && shouldPlay()) {
    let subscription: PlayerSubscription | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        cancelStartWait.set(p, resolve);
        subscription = p.addListener("playbackStatusUpdate", status => {
          if (myGen !== generation || !shouldPlay()) resolve();
          else if (status.error) reject(new Error(status.error));
          else if (status.playing) resolve();
        });
        timer = setTimeout(() => reject(new Error("Audio start timed out.")), NATIVE_START_TIMEOUT_MS);
        p.play();
        if (p.playing) resolve();
      });
    } catch (error) {
      if (myGen !== generation) return;
      activePlayer = null;
      killPlayer(p);
      throw error;
    } finally {
      clearTimeout(timer);
      subscription?.remove?.();
      cancelStartWait.delete(p);
    }
  }
}

export function play(): void {
  if (activePlayer) finishedPlayers.delete(activePlayer);
  activePlayer?.play();
}

export function pause(): void {
  if (!activePlayer) return;
  activePlayer.pause();
  cancelStartWait.get(activePlayer)?.();
}

/** Retire outgoing output while preserving the silent prepared next player. */
export function beginTrackChange(): void {
  generation += 1;
  const previous = activePlayer;
  activePlayer = null;
  killPlayer(previous);
}

export function stop(): void {
  beginTrackChange();
  standbyGeneration += 1;
  killPlayer(standbyPlayer);
  standbyPlayer = null;
  standbyUrl = null;
}

export function destroy(): void {
  clearListeners();
  stop();
}

export async function seekTo(seconds: number): Promise<void> {
  if (!activePlayer?.isLoaded) throw new Error("Audio is not ready to seek");
  if (!Number.isFinite(seconds)) throw new Error("Invalid seek position");
  const duration = playerDuration(activePlayer);
  const target = playbackPosition(seconds, duration);
  const player = activePlayer;
  await player.seekTo(target);
  finishedPlayers.delete(player);
}

export function getProgress(): { position: number; duration: number } {
  return { position: activePlayer?.currentTime ?? 0, duration: activePlayer ? playerDuration(activePlayer) : 0 };
}

export function isLoaded(): boolean { return Boolean(activePlayer?.isLoaded); }
export function isEnded(): boolean {
  return !!activePlayer && finishedPlayers.has(activePlayer);
}
