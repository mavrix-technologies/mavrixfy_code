import { Platform } from "react-native";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import {
  Audio,
  AudioContext,
  AudioManager,
  PlaybackNotificationManager,
  useAudioTagContext,
  type AudioTagHandle,
  type BiquadFilterNode,
  type GainNode,
  type MediaElementAudioSourceNode,
} from "react-native-audio-api";
import { logger } from "@/lib/logger";
import { calculateEqHeadroomDb, EQ_FREQUENCIES_HZ } from "./equalizerDsp";

// Playback and effects share one documented AudioContext. A media source can
// enter this graph only when the Audio component owns the stream.
export const State = {
  None: "none",
  Loading: "loading",
  Buffering: "buffering",
  Playing: "playing",
  Paused: "paused",
  Stopped: "stopped",
  Ended: "ended",
  Error: "error",
} as const;
export const RepeatMode = {
  Off: "off",
  Queue: "queue",
  Track: "track",
} as const;
export const Event = {
  RemotePlay: "remote-play",
  RemotePause: "remote-pause",
  RemoteStop: "remote-stop",
  RemoteNext: "remote-next",
  RemotePrevious: "remote-previous",
  RemoteSeek: "remote-seek",
  PlaybackInterruption: "playback-interruption",
  PlaybackState: "playback-state",
  PlaybackPlayWhenReadyChanged: "playback-play-when-ready",
  PlaybackError: "playback-error",
  PlaybackProgressUpdated: "playback-progress",
  PlaybackActiveTrackChanged: "playback-active-track",
  PlaybackQueueEnded: "playback-queue-ended",
} as const;

type Track = {
  id?: string;
  url?: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  [key: string]: unknown;
};
type PlaybackSnapshot = {
  queue: Track[];
  index: number;
  status: string;
  position: number;
  duration: number;
  playWhenReady: boolean;
  sourceVersion: number;
  repeat: string;
};
let playback: PlaybackSnapshot = {
  queue: [],
  index: -1,
  status: State.None,
  position: 0,
  duration: 0,
  playWhenReady: false,
  sourceVersion: 0,
  repeat: RepeatMode.Off,
};
let sourceSnapshot = { sourceVersion: 0, url: "" };
const storeListeners = new Set<() => void>();
const eventListeners = new Map<string, Set<(payload: any) => void>>();
let audioHandle: AudioTagHandle | null = null;
let isSourceLoaded = false;
let context: AudioContext | null = null;
const contextListeners = new Set<() => void>();
let filters: BiquadFilterNode[] = [];
let outputGain: GainNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let initialized = false;
let controlsEnabled = false;
let notificationPending = false;
let notificationRunning = false;
let notificationMetadata = "";
let notifiedSecond = -1;
let playIntentVersion = 0;
let interruptionResumeVersion: number | null = null;

let effectSettings = { enabled: false, gains: [0, 0, 0, 0, 0, 0] };
let effectsReady = false;
let ducked = false;
let appliedGainTargets = EQ_FREQUENCIES_HZ.map(() => 0);
let outputGainTarget = 1;

function emit(name: string, payload: any = {}) {
  eventListeners.get(name)?.forEach((listener) => listener(payload));
}
function publish(next: Partial<PlaybackSnapshot>) {
  playback = { ...playback, ...next };
  const url = activeTrack()?.url || "";
  if (
    sourceSnapshot.sourceVersion !== playback.sourceVersion ||
    sourceSnapshot.url !== url
  ) {
    sourceSnapshot = { sourceVersion: playback.sourceVersion, url };
  }
  storeListeners.forEach((listener) => listener());
}
function activeTrack() {
  return playback.queue[playback.index] ?? null;
}
function setStatus(status: string) {
  if (playback.status === status) return;
  publish({ status });
  emit(Event.PlaybackState, { state: status });
  updateNotification();
}
function handlePlaybackError(error: unknown) {
  void StandardAudioPlayer.pause();
  setStatus(State.Error);
  emit(Event.PlaybackError, {
    message: error instanceof Error ? error.message : String(error),
  });
}
function updateNotification() {
  notificationPending = true;
  if (notificationRunning) return;
  notificationRunning = true;
  void (async () => {
    while (notificationPending) {
      notificationPending = false;
      const track = activeTrack();
      if (!track) {
        await PlaybackNotificationManager.hide();
        controlsEnabled = false;
        notificationMetadata = "";
        continue;
      }
      const metadata = {
        title: track.title || "",
        artist: track.artist || "",
        album: track.album || "",
        artwork: track.artwork || "",
        duration: playback.duration || Number(track.duration) || 0,
      };
      const key = JSON.stringify(metadata);
      await PlaybackNotificationManager.show({
        ...(key !== notificationMetadata ? metadata : {}),
        elapsedTime: playback.position,
        state: playback.playWhenReady ? "playing" : "paused",
        speed: playback.status === State.Playing ? 1 : 0,
      });
      notificationMetadata = key;
      if (!controlsEnabled) {
        await Promise.all([
          PlaybackNotificationManager.enableControl("skipBackward", false),
          PlaybackNotificationManager.enableControl("skipForward", false),
          PlaybackNotificationManager.enableControl("play", true),
          PlaybackNotificationManager.enableControl("pause", true),
          PlaybackNotificationManager.enableControl("stop", true),
          PlaybackNotificationManager.enableControl("nextTrack", true),
          PlaybackNotificationManager.enableControl("previousTrack", true),
          PlaybackNotificationManager.enableControl("seekTo", true),
        ]);
        controlsEnabled = true;
      }
    }
  })()
    .catch((error) =>
      logger.warn("[Audio] Media controls update failed", error),
    )
    .finally(() => {
      notificationRunning = false;
    });
}
function select(index: number, initialPosition = 0) {
  if (index < 0 || index >= playback.queue.length)
    throw new Error("Track index is out of range.");
  audioHandle?.pause();
  audioHandle = null;
  isSourceLoaded = false;
  sourceNode?.disconnect();
  sourceNode = null;
  const previous = activeTrack();
  const track = playback.queue[index];
  publish({
    index,
    position: Math.max(0, initialPosition),
    duration: Number(track.duration) || 0,
    sourceVersion: playback.sourceVersion + 1,
    status: State.Loading,
  });
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
  outputGain = ctx.createGain();
  appliedGainTargets = EQ_FREQUENCIES_HZ.map(() => 0);
  outputGainTarget = 1;
  for (let i = 0; i < filters.length - 1; i++)
    filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(outputGain);
  outputGain.connect(ctx.destination);
  effectsReady = true;
  applyEffectSettings();
  void import("./audioEqualizer").then(({ syncEqualizerWithNative }) =>
    syncEqualizerWithNative(),
  );
}
function applyEffectSettings() {
  if (!context || !outputGain) return;
  const now = context.currentTime;
  const targetGains = effectSettings.enabled
    ? effectSettings.gains
    : EQ_FREQUENCIES_HZ.map(() => 0);
  const eqHeadroomDb = effectSettings.enabled
    ? calculateEqHeadroomDb(targetGains, context.sampleRate)
    : 0;
  const targetOutput = Math.pow(10, -eqHeadroomDb / 20) * (ducked ? 0.2 : 1);
  const attenuating = targetOutput < outputGainTarget;

  if (Math.abs(targetOutput - outputGainTarget) > 0.0001) {
    outputGain.gain.cancelAndHoldAtTime(now);
    outputGain.gain.setTargetAtTime(
      targetOutput,
      now + (attenuating ? 0 : 0.5),
      attenuating ? 0.01 : 0.1,
    );
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

export function getStandardAudioEffects() {
  return {
    sessionId: effectsReady ? 1 : 0,
    equalizerAvailable: effectsReady,
    equalizerControl: effectsReady,
    equalizerEnabled: effectSettings.enabled,
    minLevel: -1000,
    maxLevel: 1000,
    bands: EQ_FREQUENCIES_HZ.map((frequency, id) => ({
      id,
      frequency,
      level: effectSettings.gains[id] * 100,
    })),
  };
}

export function setStandardEqualizerEnabled(enabled: boolean) {
  if (!effectsReady) throw new Error("Audio engine is still starting.");
  effectSettings.enabled = enabled;
  applyEffectSettings();
}

export function setStandardAudioBands(gains: readonly number[]) {
  if (!effectsReady) throw new Error("Audio engine is still starting.");
  if (gains.length !== EQ_FREQUENCIES_HZ.length)
    throw new Error("Invalid EQ bands.");
  effectSettings.gains = gains.map((gain) =>
    Number.isFinite(gain) ? Math.max(-10, Math.min(10, gain)) : 0,
  );
  applyEffectSettings();
}

export const StandardAudioPlayer = {
  async setupPlayer() {
    if (initialized) return;
    AudioManager.setAudioSessionOptions({ iosCategory: "playback" });
    if (Platform.OS === "ios") AudioManager.observeAudioInterruptions(true);
    const bind = (
      name: Parameters<typeof PlaybackNotificationManager.addEventListener>[0],
      event: string,
      action: (payload: any) => Promise<void>,
    ) => {
      PlaybackNotificationManager.addEventListener(name, (payload: any) => {
        const handled = Boolean(eventListeners.get(event)?.size);
        emit(event, payload);
        if (!handled)
          void action(payload).catch((error) =>
            logger.warn("[Audio] Remote command failed", error),
          );
      });
    };
    // App handlers record intent before any asynchronous playback operation.
    bind("playbackNotificationPlay", Event.RemotePlay, () =>
      StandardAudioPlayer.play(),
    );
    bind("playbackNotificationPause", Event.RemotePause, () =>
      StandardAudioPlayer.pause(),
    );
    bind("playbackNotificationStop", Event.RemoteStop, () =>
      StandardAudioPlayer.stop(),
    );
    bind("playbackNotificationNextTrack", Event.RemoteNext, () =>
      StandardAudioPlayer.skipToNext(),
    );
    bind("playbackNotificationPreviousTrack", Event.RemotePrevious, () =>
      StandardAudioPlayer.skipToPrevious(),
    );
    bind("playbackNotificationSeekTo", Event.RemoteSeek, (payload) =>
      StandardAudioPlayer.seekTo(payload.value),
    );
    AudioManager.addSystemEventListener("interruption", (event) => {
      if (event.type === "began") {
        const wasPlaying = playback.playWhenReady;
        emit(Event.PlaybackInterruption, { resumed: false });
        void StandardAudioPlayer.pause(false);
        interruptionResumeVersion = wasPlaying ? playIntentVersion : null;
      } else {
        ducked = false;
        applyEffectSettings();
        const canResume =
          event.shouldResume && interruptionResumeVersion === playIntentVersion;
        interruptionResumeVersion = null;
        if (canResume) {
          emit(Event.PlaybackInterruption, { resumed: true });
          void StandardAudioPlayer.play().catch((error) =>
            logger.warn("[Audio] Interruption resume failed", error),
          );
        }
      }
    });
    AudioManager.addSystemEventListener("duck", () => {
      ducked = true;
      applyEffectSettings();
    });
    AudioManager.addSystemEventListener("routeChange", (event) => {
      if (
        event.reason !== "OldDeviceUnavailable" &&
        event.reason !== "NoSuitableRouteForCategory"
      )
        return;
      interruptionResumeVersion = null;
      emit(Event.PlaybackInterruption, { resumed: false });
      void StandardAudioPlayer.pause();
    });
    initialized = true;
  },
  addEventListener(name: string, listener: (payload: any) => void) {
    let group = eventListeners.get(name);
    if (!group) {
      group = new Set();
      eventListeners.set(name, group);
    }
    group.add(listener);
    return { remove: () => group?.delete(listener) };
  },
  async setQueue(
    tracks: Track[],
    initialIndex = 0,
    initialPosition = 0,
    preserveCurrentTrack = false,
  ) {
    if (!tracks.length) return this.reset();
    const target = tracks[initialIndex];
    const previous = activeTrack();
    if (
      preserveCurrentTrack &&
      previous &&
      target?.id === previous.id &&
      target?.url === previous.url
    ) {
      publish({ queue: [...tracks], index: initialIndex });
      updateNotification();
      return;
    }
    const wasPlaying = playback.playWhenReady;
    publish({ queue: [...tracks], index: -1, playWhenReady: wasPlaying });
    const targetIdx =
      initialIndex >= 0 && initialIndex < tracks.length ? initialIndex : 0;
    select(targetIdx, initialPosition);
  },
  async add(tracks: Track | Track[]) {
    const additions = Array.isArray(tracks) ? tracks : [tracks];
    const previousLength = playback.queue.length;
    publish({ queue: [...playback.queue, ...additions] });
    if (previousLength === 0 && additions.length) select(0);
  },
  async load(track: Track, initialPosition = 0) {
    await this.setQueue([track], 0, initialPosition);
  },
  async remove(index: number) {
    const next = playback.queue.filter((_, i) => i !== index);
    const selected = playback.index;
    publish({ queue: next });
    if (!next.length) {
      await this.reset();
      return;
    }
    if (index === selected) select(Math.min(index, next.length - 1));
    else if (index < selected) publish({ index: selected - 1 });
  },
  async reset() {
    if (Platform.OS === "android")
      AudioManager.observeAudioInterruptions(false);
    audioHandle?.pause();
    audioHandle = null;
    isSourceLoaded = false;
    playIntentVersion += 1;
    sourceNode?.disconnect();
    sourceNode = null;
    publish({
      queue: [],
      index: -1,
      position: 0,
      duration: 0,
      playWhenReady: false,
      sourceVersion: playback.sourceVersion + 1,
    });
    setStatus(State.None);
    updateNotification();
  },
  async play() {
    if (!activeTrack()) return;
    AudioManager.observeAudioInterruptions(true);
    const intentVersion = ++playIntentVersion;
    publish({ playWhenReady: true });
    emit(Event.PlaybackPlayWhenReadyChanged, { playWhenReady: true });
    try {
      await context?.resume();
    } catch (error) {
      if (intentVersion === playIntentVersion) handlePlaybackError(error);
      throw error;
    }
    if (intentVersion !== playIntentVersion || !playback.playWhenReady) return;
    // onLoad owns the first play; calling play before preload completes starts
    // another load inside Audio and can leave overlapping native sources.
    if (audioHandle && isSourceLoaded) {
      audioHandle.play();
    }
    updateNotification();
  },
  async pause(releaseFocus = true) {
    if (releaseFocus && ducked) {
      ducked = false;
      applyEffectSettings();
    }
    if (releaseFocus && Platform.OS === "android")
      AudioManager.observeAudioInterruptions(false);
    playIntentVersion += 1;
    publish({ playWhenReady: false });
    emit(Event.PlaybackPlayWhenReadyChanged, { playWhenReady: false });
    audioHandle?.pause();
    setStatus(State.Paused);
    updateNotification();
  },
  async stop() {
    await Promise.all([this.pause(), this.seekTo(0)]);
    setStatus(State.Stopped);
  },
  async skip(index: number, initialPosition = 0) {
    select(index, initialPosition);
  },
  async skipToNext() {
    if (playback.index + 1 < playback.queue.length) select(playback.index + 1);
    else if (playback.repeat === RepeatMode.Queue && playback.queue.length)
      select(0);
    else await this.finishQueue();
  },
  async skipToPrevious() {
    if (playback.position > 3 || playback.index <= 0) {
      await this.seekTo(0);
      return;
    }
    select(playback.index - 1);
  },
  async seekTo(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    const position = Math.max(
      0,
      playback.duration > 0 ? Math.min(seconds, playback.duration) : seconds,
    );
    if (audioHandle && isSourceLoaded) {
      audioHandle.seekToTime(position);
    }
    publish({ position });
    emit(Event.PlaybackProgressUpdated, {
      position,
      duration: playback.duration,
      track: playback.index,
    });
    updateNotification();
  },
  async finishQueue() {
    playIntentVersion += 1;
    audioHandle?.pause();
    if (Platform.OS === "android")
      AudioManager.observeAudioInterruptions(false);
    publish({ playWhenReady: false });
    setStatus(State.Ended);
    emit(Event.PlaybackQueueEnded);
  },
  async setRepeatMode(mode: string) {
    publish({ repeat: mode });
  },
  async getQueue() {
    return playback.queue;
  },
  async getActiveTrack() {
    return activeTrack();
  },
  async getActiveTrackIndex() {
    return playback.index;
  },
  async getPlaybackState() {
    return { state: playback.status };
  },
  async getProgress() {
    return {
      position: playback.position,
      duration: playback.duration,
      buffered: 0,
    };
  },
  async updateMetadataForTrack(index: number, metadata: Partial<Track>) {
    if (!playback.queue[index]) return;
    const queue = [...playback.queue];
    queue[index] = { ...queue[index], ...metadata };
    publish({ queue });
    if (index === playback.index) updateNotification();
  },
};

function AudioDurationReporter({ sourceVersion }: { sourceVersion: number }) {
  const { duration } = useAudioTagContext();
  useEffect(() => {
    if (
      duration > 0 &&
      playback.sourceVersion === sourceVersion &&
      Math.abs(playback.duration - duration) > 0.5
    ) {
      publish({ duration });
      updateNotification();
    }
  }, [duration, sourceVersion]);
  return null;
}

export function useStandardAudioRenderer() {
  const current = useSyncExternalStore(
    (listener) => {
      storeListeners.add(listener);
      return () => {
        storeListeners.delete(listener);
      };
    },
    () => sourceSnapshot,
  );
  const audioCtx = useSyncExternalStore(
    (listener) => {
      contextListeners.add(listener);
      return () => {
        contextListeners.delete(listener);
      };
    },
    () => context,
  );
  useEffect(() => {
    const created = new AudioContext();
    context = created;
    installGraph(created);
    contextListeners.forEach((listener) => listener());
    return () => {
      audioHandle?.pause();
      audioHandle = null;
      isSourceLoaded = false;
      sourceNode?.disconnect();
      sourceNode = null;
      effectsReady = false;
      context = null;
      filters = [];
      outputGain = null;
      contextListeners.forEach((listener) => listener());
      void created.close();
    };
  }, []);
  if (!audioCtx || !current.url) return null;
  return (
    <StandardAudioSource
      key={current.sourceVersion}
      current={current}
      audioCtx={audioCtx}
    />
  );
}

const StandardAudioSource = React.memo(function StandardAudioSource({
  current,
  audioCtx,
}: {
  current: typeof sourceSnapshot;
  audioCtx: AudioContext;
}) {
  const handleRef = useRef<AudioTagHandle>(null);
  const isCurrentSource = () =>
    playback.sourceVersion === current.sourceVersion && context === audioCtx;
  const onPlaying = () => {
    if (!isCurrentSource() || !playback.playWhenReady) {
      handleRef.current?.pause();
      return;
    }
    setStatus(State.Playing);
  };
  return (
    <Audio
      ref={(handle) => {
        handleRef.current = handle;
        if (isCurrentSource()) {
          audioHandle = handle;
        }
      }}
      source={current.url}
      context={audioCtx}
      onLoad={() => {
        if (!isCurrentSource()) {
          handleRef.current?.pause();
          return;
        }
        try {
          if (!handleRef.current) throw new Error("Audio source did not load.");
          if (!sourceNode) {
            sourceNode = audioCtx.createMediaElementSource(handleRef.current);
            sourceNode.connect(filters[0]);
          }
          audioHandle = handleRef.current;
          isSourceLoaded = true;
          if (playback.position > 0) {
            handleRef.current.seekToTime(playback.position);
          }
          if (playback.playWhenReady) {
            const loadedHandle = handleRef.current;
            const sourceVersion = current.sourceVersion;
            void audioCtx
              .resume()
              .then(() => {
                if (
                  playback.sourceVersion === sourceVersion &&
                  playback.playWhenReady
                )
                  loadedHandle.play();
              })
              .catch((error) => {
                if (isCurrentSource()) handlePlaybackError(error);
              });
          } else setStatus(State.Paused);
        } catch (error) {
          handlePlaybackError(error);
        }
      }}
      onPlay={onPlaying}
      onPause={() => {
        if (
          isCurrentSource() &&
          !playback.playWhenReady &&
          playback.status !== State.Loading
        )
          setStatus(State.Paused);
      }}
      onWaiting={() => {
        if (isCurrentSource() && playback.playWhenReady)
          setStatus(State.Buffering);
      }}
      onPlaying={onPlaying}
      onPositionChange={(position) => {
        if (!isCurrentSource() || !Number.isFinite(position)) return;
        publish({ position });
        emit(Event.PlaybackProgressUpdated, {
          position,
          duration: playback.duration,
          track: playback.index,
        });
        if (Math.floor(position) !== notifiedSecond) {
          notifiedSecond = Math.floor(position);
          updateNotification();
        }
      }}
      onEnded={() => {
        if (!isCurrentSource() || !playback.playWhenReady) return;
        if (playback.repeat === RepeatMode.Track) {
          handleRef.current?.seekToTime(0);
          handleRef.current?.play();
        } else void StandardAudioPlayer.skipToNext();
      }}
      onError={(error) => {
        if (!isCurrentSource()) return;
        handlePlaybackError(error);
      }}
    >
      <AudioDurationReporter sourceVersion={current.sourceVersion} />
    </Audio>
  );
});

if (typeof module !== "undefined" && module && module.exports) {
  (module.exports as any).StandardAudioRenderer = useStandardAudioRenderer;
}
