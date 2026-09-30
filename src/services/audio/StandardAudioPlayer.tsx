import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Audio, AudioContext, AudioManager, PlaybackNotificationManager, useAudioTagContext, type AudioTagHandle, type BiquadFilterNode, type GainNode, type MediaElementAudioSourceNode, type StereoPannerNode } from "react-native-audio-api";
import { calculateEqHeadroomDb, calculateSpatialHeadroomDb, calculateSpatialPan, EQ_FREQUENCIES_HZ } from "./equalizerDsp";

// Playback and effects share one documented AudioContext. A media source can
// enter this graph only when the Audio component owns the stream.
export const State = {
  None: "none", Loading: "loading", Buffering: "buffering", Playing: "playing",
  Paused: "paused", Stopped: "stopped", Ended: "ended", Error: "error",
} as const;
export const RepeatMode = { Off: "off", Queue: "queue", Track: "track" } as const;
export const Event = {
  RemotePlay: "remote-play", RemotePause: "remote-pause", RemoteStop: "remote-stop",
  RemoteNext: "remote-next", RemotePrevious: "remote-previous", RemoteSeek: "remote-seek",
  RemoteDuck: "remote-duck", PlaybackState: "playback-state",
  PlaybackPlayWhenReadyChanged: "playback-play-when-ready",
  PlaybackError: "playback-error", PlaybackProgressUpdated: "playback-progress",
  PlaybackActiveTrackChanged: "playback-active-track", PlaybackQueueEnded: "playback-queue-ended",
} as const;

type Track = { id?: string; url?: string; title?: string; artist?: string; album?: string; artwork?: string; duration?: number; [key: string]: unknown };
type PlaybackSnapshot = {
  queue: Track[]; index: number; status: string; position: number; duration: number;
  playWhenReady: boolean; sourceVersion: number; repeat: string;
};
let playback: PlaybackSnapshot = { queue: [], index: -1, status: State.None, position: 0, duration: 0, playWhenReady: false, sourceVersion: 0, repeat: RepeatMode.Off };
const storeListeners = new Set<() => void>();
const eventListeners = new Map<string, Set<(payload: any) => void>>();
let audioHandle: AudioTagHandle | null = null;
let context: AudioContext | null = null;
const contextListeners = new Set<() => void>();
let filters: BiquadFilterNode[] = [];
let panner: StereoPannerNode | null = null;
let outputGain: GainNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let initialized = false;
let remoteSubscriptions: { remove(): void }[] = [];
let controlsEnabled = false;
let controlsPromise: Promise<void> | null = null;

let effectSettings = { enabled: false, gains: [0, 0, 0, 0, 0, 0], spatial: false, strength: 350 };
let effectsReady = false;
let appliedGainTargets = EQ_FREQUENCIES_HZ.map(() => 0);
let outputGainTarget = 1;
let spatialStartedAt = Date.now();

function emit(name: string, payload: any = {}) {
  eventListeners.get(name)?.forEach((listener) => listener(payload));
}
function publish(next: Partial<PlaybackSnapshot>) {
  playback = { ...playback, ...next };
  storeListeners.forEach((listener) => listener());
}
function activeTrack() { return playback.queue[playback.index] ?? null; }
function setStatus(status: string) {
  if (playback.status === status) return;
  publish({ status });
  emit(Event.PlaybackState, { state: status });
  updateNotification();
}
function updateNotification() {
  const track = activeTrack();
  if (!track) { void PlaybackNotificationManager.hide().catch(() => {}); return; }
  void PlaybackNotificationManager.show({
    title: track.title, artist: track.artist, album: track.album,
    artwork: track.artwork, duration: playback.duration || track.duration,
    elapsedTime: playback.position,
    state: playback.playWhenReady ? "playing" : "paused",
  }).then(() => {
    if (controlsEnabled || controlsPromise) return;
    controlsPromise = (async () => {
      for (const control of ["play", "pause", "stop", "nextTrack", "previousTrack", "seekTo"] as const) {
        await PlaybackNotificationManager.enableControl(control, true);
      }
      controlsEnabled = true;
    })().catch(() => {}).finally(() => { controlsPromise = null; });
  }).catch(() => {});
}
function select(index: number) {
  if (index < 0 || index >= playback.queue.length) throw new Error("Track index is out of range.");
  audioHandle?.pause();
  audioHandle = null;
  sourceNode?.disconnect();
  sourceNode = null;
  const previous = activeTrack();
  const track = playback.queue[index];
  publish({ index, position: 0, duration: Number(track.duration) || 0, sourceVersion: playback.sourceVersion + 1, status: State.Loading });
  emit(Event.PlaybackActiveTrackChanged, { lastTrack: previous, track, index });
  emit(Event.PlaybackState, { state: State.Loading });
  updateNotification();
}

function installGraph(ctx: AudioContext) {
  filters = EQ_FREQUENCIES_HZ.map((frequency) => {
    const node = ctx.createBiquadFilter();
    node.type = "peaking";
    node.frequency.value = Math.min(frequency, ctx.sampleRate * 0.475);
    node.Q.value = 1;
    return node;
  });
  panner = ctx.createStereoPanner();
  outputGain = ctx.createGain();
  appliedGainTargets = EQ_FREQUENCIES_HZ.map(() => 0);
  outputGainTarget = 1;
  spatialStartedAt = Date.now();
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(panner);
  panner.connect(outputGain);
  outputGain.connect(ctx.destination);
  effectsReady = true;
  applyEffectSettings();
  updatePan();
  void import("./audioEqualizer").then(({ syncEqualizerWithNative }) => syncEqualizerWithNative());
}
function applyEffectSettings() {
  if (!context || !outputGain) return;
  const now = context.currentTime;
  const targetGains = effectSettings.enabled ? effectSettings.gains : EQ_FREQUENCIES_HZ.map(() => 0);
  const eqHeadroomDb = effectSettings.enabled ? calculateEqHeadroomDb(targetGains, context.sampleRate) : 0;
  const panHeadroomDb = effectSettings.spatial ? calculateSpatialHeadroomDb(effectSettings.strength) : 0;
  const targetOutput = Math.pow(10, -(eqHeadroomDb + panHeadroomDb) / 20);
  const attenuating = targetOutput < outputGainTarget;

  if (Math.abs(targetOutput - outputGainTarget) > 0.0001) {
    outputGain.gain.cancelAndHoldAtTime(now);
    outputGain.gain.setTargetAtTime(targetOutput, now + (attenuating ? 0 : 0.5), attenuating ? 0.01 : 0.1);
    outputGainTarget = targetOutput;
  }
  filters.forEach((node, index) => {
    const target = targetGains[index];
    if (Math.abs(target - appliedGainTargets[index]) < 0.0001) return;
    node.gain.cancelAndHoldAtTime(now);
    node.gain.setTargetAtTime(target, now + (attenuating ? 0.05 : 0), 0.04);
    appliedGainTargets[index] = target;
  });
}
function updatePan() {
  if (!context || !panner) return;
  const now = context.currentTime;
  // A subtle stereo movement only; this is not a 3D or Dolby Atmos renderer.
  const target = effectSettings.spatial ? calculateSpatialPan(Date.now() - spatialStartedAt, effectSettings.strength) : 0;
  panner.pan.cancelAndHoldAtTime(now);
  panner.pan.setTargetAtTime(target, now, 0.3);
}

export function getStandardAudioEffects() {
  return {
    sessionId: effectsReady ? 1 : 0,
    equalizerAvailable: effectsReady, equalizerControl: effectsReady,
    equalizerEnabled: effectSettings.enabled, equalizerActive: effectsReady && effectSettings.enabled,
    minLevel: -1000, maxLevel: 1000,
    bands: EQ_FREQUENCIES_HZ.map((frequency, id) => ({ id, frequency, level: effectSettings.gains[id] * 100 })),
    presets: [], surroundAvailable: effectsReady, surroundSupported: effectsReady,
    surroundControl: effectsReady, surroundEnabled: effectSettings.spatial,
    surroundActive: effectsReady && effectSettings.spatial,
    strengthSupported: true, strength: effectSettings.strength,
  };
}

export function updateStandardAudioEffect(command: string, value: number, band = 0) {
  if (!effectsReady) throw new Error("Audio engine is still starting.");
  switch (command) {
    case "equalizer": effectSettings.enabled = value !== 0; break;
    case "band":
      if (band < 0 || band >= EQ_FREQUENCIES_HZ.length) throw new Error("Invalid EQ band.");
      if (!Number.isFinite(value)) throw new Error("Invalid EQ gain.");
      effectSettings.gains[band] = Math.max(-10, Math.min(10, value / 100));
      break;
    case "reset": effectSettings.gains = EQ_FREQUENCIES_HZ.map(() => 0); break;
    case "surround":
      if (value !== 0 && !effectSettings.spatial) spatialStartedAt = Date.now();
      effectSettings.spatial = value !== 0;
      break;
    case "strength":
      if (!Number.isFinite(value)) throw new Error("Invalid panning strength.");
      effectSettings.strength = Math.max(0, Math.min(1000, value));
      break;
    default: throw new Error("Unknown audio effect.");
  }
  applyEffectSettings();
  if (command === "surround" || command === "strength") updatePan();
  return getStandardAudioEffects();
}

export function setStandardAudioBands(gains: readonly number[]) {
  if (!effectsReady) throw new Error("Audio engine is still starting.");
  if (gains.length !== EQ_FREQUENCIES_HZ.length) throw new Error("Invalid EQ bands.");
  effectSettings.gains = gains.map((gain) => Number.isFinite(gain) ? Math.max(-10, Math.min(10, gain)) : 0);
  applyEffectSettings();
  return getStandardAudioEffects();
}

export const StandardAudioPlayer = {
  async setupPlayer() {
    if (initialized) return;
    AudioManager.setAudioSessionOptions({ iosCategory: "playback" });
    AudioManager.observeAudioInterruptions(true);
    const bind = (name: Parameters<typeof PlaybackNotificationManager.addEventListener>[0], event: string, action: (payload: any) => void) => {
      remoteSubscriptions.push(PlaybackNotificationManager.addEventListener(name, (payload: any) => { action(payload); emit(event, payload); }));
    };
    bind("playbackNotificationPlay", Event.RemotePlay, () => { void StandardAudioPlayer.play(); });
    bind("playbackNotificationPause", Event.RemotePause, () => { void StandardAudioPlayer.pause(); });
    bind("playbackNotificationStop", Event.RemoteStop, () => { void StandardAudioPlayer.stop(); });
    bind("playbackNotificationNextTrack", Event.RemoteNext, () => { void StandardAudioPlayer.skipToNext(); });
    bind("playbackNotificationPreviousTrack", Event.RemotePrevious, () => { void StandardAudioPlayer.skipToPrevious(); });
    bind("playbackNotificationSeekTo", Event.RemoteSeek, (payload) => { void StandardAudioPlayer.seekTo(payload.value); });
    initialized = true;
  },
  async updateOptions() {},
  addEventListener(name: string, listener: (payload: any) => void) {
    let group = eventListeners.get(name);
    if (!group) { group = new Set(); eventListeners.set(name, group); }
    group.add(listener);
    return { remove: () => group?.delete(listener) };
  },
  async setQueue(tracks: Track[]) {
    const wasPlaying = playback.playWhenReady;
    publish({ queue: [...tracks], index: -1, playWhenReady: wasPlaying });
    if (tracks.length) select(0);
    else { audioHandle?.pause(); setStatus(State.None); }
  },
  async add(tracks: Track | Track[]) {
    const additions = Array.isArray(tracks) ? tracks : [tracks];
    const previousLength = playback.queue.length;
    publish({ queue: [...playback.queue, ...additions] });
    if (previousLength === 0 && additions.length) select(0);
  },
  async load(track: Track) { await this.setQueue([track]); },
  async remove(index: number) {
    const next = playback.queue.filter((_, i) => i !== index);
    const selected = playback.index;
    publish({ queue: next });
    if (!next.length) { await this.reset(); return; }
    if (index === selected) select(Math.min(index, next.length - 1));
    else if (index < selected) publish({ index: selected - 1 });
  },
  async reset() {
    audioHandle?.pause();
    sourceNode?.disconnect(); sourceNode = null;
    publish({ queue: [], index: -1, position: 0, duration: 0, playWhenReady: false, sourceVersion: playback.sourceVersion + 1 });
    setStatus(State.None);
    updateNotification();
  },
  async play() {
    if (!activeTrack()) return;
    publish({ playWhenReady: true });
    emit(Event.PlaybackPlayWhenReadyChanged, { playWhenReady: true });
    if (playback.status !== State.Loading) {
      await context?.resume();
      audioHandle?.play();
    }
    updateNotification();
  },
  async pause() {
    publish({ playWhenReady: false });
    emit(Event.PlaybackPlayWhenReadyChanged, { playWhenReady: false });
    audioHandle?.pause();
    setStatus(State.Paused);
  },
  async stop() { await this.pause(); await this.seekTo(0); setStatus(State.Stopped); },
  async skip(index: number) { select(index); },
  async skipToNext() {
    if (playback.index + 1 < playback.queue.length) select(playback.index + 1);
    else if (playback.repeat === RepeatMode.Queue && playback.queue.length) select(0);
    else { await this.stop(); emit(Event.PlaybackQueueEnded); }
  },
  async skipToPrevious() { select(Math.max(0, playback.index - 1)); },
  async seekTo(seconds: number) {
    const position = Math.max(0, seconds);
    audioHandle?.seekToTime(position);
    publish({ position });
    emit(Event.PlaybackProgressUpdated, { position, duration: playback.duration, track: playback.index });
    updateNotification();
  },
  async setRepeatMode(mode: string) { publish({ repeat: mode }); },
  async getQueue() { return playback.queue; },
  async getActiveTrack() { return activeTrack(); },
  async getActiveTrackIndex() { return playback.index; },
  async getPlaybackState() { return { state: playback.status }; },
  async getProgress() { return { position: playback.position, duration: playback.duration, buffered: 0 }; },
  async updateMetadataForTrack(index: number, metadata: Partial<Track>) {
    if (!playback.queue[index]) return;
    const queue = [...playback.queue]; queue[index] = { ...queue[index], ...metadata };
    publish({ queue }); if (index === playback.index) updateNotification();
  },
};

function AudioDurationReporter({ sourceVersion }: { sourceVersion: number }) {
  const { duration } = useAudioTagContext();
  useEffect(() => {
    if (duration > 0 && playback.sourceVersion === sourceVersion && Math.abs(playback.duration - duration) > 0.5) {
      publish({ duration });
      updateNotification();
    }
  }, [duration, sourceVersion]);
  return null;
}

export function StandardAudioRenderer() {
  const current = useSyncExternalStore((listener) => { storeListeners.add(listener); return () => { storeListeners.delete(listener); }; }, () => playback);
  const audioCtx = useSyncExternalStore((listener) => { contextListeners.add(listener); return () => { contextListeners.delete(listener); }; }, () => context);
  const handleRef = useRef<AudioTagHandle>(null);
  const track = current.queue[current.index];
  useEffect(() => {
    const created = new AudioContext();
    context = created;
    installGraph(created);
    contextListeners.forEach((listener) => listener());
    audioHandle = handleRef.current;
    return () => {
      audioHandle = null;
      sourceNode?.disconnect(); sourceNode = null;
      effectsReady = false;
      context = null;
      filters = [];
      panner = null;
      outputGain = null;
      contextListeners.forEach((listener) => listener());
      void created.close();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (effectSettings.spatial) updatePan();
    }, 250);
    return () => clearInterval(timer);
  }, []);
  if (!audioCtx || !track?.url) return null;
  return <Audio
    key={`${current.sourceVersion}:${track.id ?? track.url}`}
    ref={handleRef}
    source={track.url}
    context={audioCtx}
    onLoad={() => {
      try {
        if (!handleRef.current) throw new Error("Audio source did not load.");
        sourceNode?.disconnect();
        sourceNode = audioCtx.createMediaElementSource(handleRef.current);
        sourceNode.connect(filters[0]);
        audioHandle = handleRef.current;
        if (playback.playWhenReady) {
          const loadedHandle = handleRef.current;
          const sourceVersion = current.sourceVersion;
          void audioCtx.resume().then(() => {
            if (playback.sourceVersion === sourceVersion && playback.playWhenReady) loadedHandle.play();
          });
        }
        else setStatus(State.Paused);
      } catch (error) { setStatus(State.Error); emit(Event.PlaybackError, { message: String(error) }); }
    }}
    onPlay={() => setStatus(State.Playing)}
    onPause={() => { if (!playback.playWhenReady && playback.status !== State.Loading) setStatus(State.Paused); }}
    onWaiting={() => setStatus(State.Buffering)}
    onPlaying={() => setStatus(State.Playing)}
    onPositionChange={(position) => {
      publish({ position });
      emit(Event.PlaybackProgressUpdated, { position, duration: playback.duration, track: playback.index });
      updateNotification();
    }}
    onEnded={() => {
      if (playback.repeat === RepeatMode.Track) { handleRef.current?.seekToTime(0); handleRef.current?.play(); }
      else void StandardAudioPlayer.skipToNext();
    }}
    onError={(error) => { setStatus(State.Error); emit(Event.PlaybackError, { message: error.message }); }}>
    <AudioDurationReporter sourceVersion={current.sourceVersion} />
  </Audio>;
}
