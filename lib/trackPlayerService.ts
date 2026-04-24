import TrackPlayer, { Event, RepeatMode, State } from "react-native-track-player";
import { DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform } from "react-native";

type AutoPlayTrackPayload = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  audioUrl?: string;
  coverUrl?: string;
  duration?: number;
};

type AutoPlayPayload = {
  tracks?: AutoPlayTrackPayload[];
  startIndex?: number;
  queueTitle?: string;
  playWhenReady?: boolean;
  shuffleMode?: number;
  repeatMode?: number;
};

let autoBridgeInitialized = false;
let autoBridgeSubscriptions: { remove: () => void }[] = [];
let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAutoSyncReason = "initial";
let lastProgressSecond = -1;
let lastKnownQueueTitle = "";

const EVENT_TRANSPORT = "AutoTransportCommand";
const AUTO_SYNC_DEBOUNCE_MS = 140;

type AutoTransportPayload = {
  command?: string;
  position?: number;
  queueIndex?: number;
};

function mapPlaybackRepeatMode(mode?: number): RepeatMode {
  // PlaybackStateCompat: NONE=0, ONE=1, ALL=2
  if (mode === 1) return RepeatMode.Track;
  if (mode === 2) return RepeatMode.Queue;
  return RepeatMode.Off;
}

function parseAutoPayload(rawPayload: unknown): AutoPlayPayload | null {
  if (typeof rawPayload !== "string" || rawPayload.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawPayload);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AutoPlayPayload;
  } catch {
    return null;
  }
}

function parseAutoTransportPayload(rawPayload: unknown): AutoTransportPayload | null {
  if (typeof rawPayload !== "string" || rawPayload.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawPayload);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AutoTransportPayload;
  } catch {
    return null;
  }
}

function mapRepeatModeToAuto(mode?: RepeatMode): number {
  if (mode === RepeatMode.Track) return 1;
  if (mode === RepeatMode.Queue) return 2;
  return 0;
}

function normalizeTrackForAuto(track: any) {
  const id = String(track?.id ?? "").trim();
  const audioUrl = String(track?.url ?? track?.audioUrl ?? "").trim();
  if (!id || !audioUrl) return null;

  return {
    id,
    title: String(track?.title ?? "").trim() || "Unknown Title",
    artist: String(track?.artist ?? "").trim() || "Unknown Artist",
    album: String(track?.album ?? "").trim(),
    genre: String(track?.genre ?? "").trim(),
    audioUrl,
    coverUrl: String(track?.artwork ?? track?.coverUrl ?? "").trim(),
    duration:
      typeof track?.duration === "number" && Number.isFinite(track.duration)
        ? Math.max(0, track.duration)
        : 0,
  };
}

async function pushAutoSessionSync(reason: string) {
  if (Platform.OS !== "android") return;

  const autoPlayModule = NativeModules.AutoPlayModule as
    | { syncAutoState?: (payload: string) => void }
    | undefined;

  if (!autoPlayModule?.syncAutoState) {
    return;
  }

  try {
    const [queue, activeTrack, activeTrackIndex, progress, playbackState, repeatMode] = await Promise.all([
      TrackPlayer.getQueue(),
      TrackPlayer.getActiveTrack(),
      typeof TrackPlayer.getActiveTrackIndex === "function"
        ? TrackPlayer.getActiveTrackIndex()
        : Promise.resolve(undefined),
      TrackPlayer.getProgress(),
      TrackPlayer.getPlaybackState(),
      typeof TrackPlayer.getRepeatMode === "function"
        ? TrackPlayer.getRepeatMode()
        : Promise.resolve(RepeatMode.Off),
    ]);

    const normalizedQueue = (Array.isArray(queue) ? queue : [])
      .map(normalizeTrackForAuto)
      .filter((track): track is NonNullable<ReturnType<typeof normalizeTrackForAuto>> => Boolean(track));

    const activeTrackId = String(activeTrack?.id ?? "").trim();
    const fallbackIndex = activeTrackId
      ? normalizedQueue.findIndex((track) => track.id === activeTrackId)
      : -1;
    const resolvedActiveIndex =
      typeof activeTrackIndex === "number" && Number.isFinite(activeTrackIndex)
        ? activeTrackIndex
        : fallbackIndex;
    const safeActiveIndex =
      normalizedQueue.length === 0
        ? -1
        : Math.max(0, Math.min(resolvedActiveIndex >= 0 ? resolvedActiveIndex : 0, normalizedQueue.length - 1));
    const stateValue =
      playbackState && typeof playbackState === "object" && "state" in playbackState
        ? playbackState.state
        : playbackState;

    autoPlayModule.syncAutoState(
      JSON.stringify({
        reason,
        state: String(stateValue ?? State.None),
        position:
          typeof progress?.position === "number" && Number.isFinite(progress.position)
            ? Math.max(0, progress.position)
            : 0,
        buffered:
          typeof progress?.buffered === "number" && Number.isFinite(progress.buffered)
            ? Math.max(0, progress.buffered)
            : 0,
        duration:
          typeof progress?.duration === "number" && Number.isFinite(progress.duration)
            ? Math.max(0, progress.duration)
            : 0,
        activeIndex: safeActiveIndex,
        activeTrackId,
        queueTitle: lastKnownQueueTitle,
        repeatMode: mapRepeatModeToAuto(repeatMode),
        queue: normalizedQueue,
      })
    );
  } catch {
    // Silent fail: Android Auto falls back to the last known native session state.
  }
}

function scheduleAutoSessionSync(reason: string, immediate = false) {
  if (Platform.OS !== "android") return;

  pendingAutoSyncReason = reason;
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    const nextReason = pendingAutoSyncReason;
    pendingAutoSyncReason = "idle";
    void pushAutoSessionSync(nextReason);
  }, immediate ? 0 : AUTO_SYNC_DEBOUNCE_MS);
}

async function handleNextCommand() {
  try {
    await TrackPlayer.skipToNext();
    await TrackPlayer.play();
  } catch {
    // Silent fail when the queue is already at the end.
  }
}

async function handlePreviousCommand() {
  try {
    const progress = await TrackPlayer.getProgress();
    if ((progress?.position ?? 0) > 3) {
      await TrackPlayer.seekTo(0);
      return;
    }

    await TrackPlayer.skipToPrevious();
    await TrackPlayer.play();
  } catch {
    try {
      await TrackPlayer.seekTo(0);
    } catch {
      // Silent fail
    }
  }
}

async function handleAutoTransportCommand(rawPayload: unknown) {
  const payload = parseAutoTransportPayload(rawPayload);
  if (!payload?.command) return;

  switch (payload.command) {
    case "play":
      await TrackPlayer.play();
      break;
    case "pause":
      await TrackPlayer.pause();
      break;
    case "stop":
      await TrackPlayer.stop();
      break;
    case "next":
      await handleNextCommand();
      break;
    case "previous":
      await handlePreviousCommand();
      break;
    case "seek":
      if (typeof payload.position === "number" && Number.isFinite(payload.position)) {
        await TrackPlayer.seekTo(Math.max(0, payload.position));
      }
      break;
    case "skipToQueueItem":
      if (typeof payload.queueIndex === "number" && Number.isFinite(payload.queueIndex)) {
        await playTrackAtIndex(payload.queueIndex);
      }
      break;
    default:
      return;
  }

  scheduleAutoSessionSync(`transport:${payload.command}`, true);
}

function normalizeAutoTracks(payload: AutoPlayPayload) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  return tracks
    .map((track) => {
      const id = String(track?.id || "").trim();
      const url = String(track?.audioUrl || "").trim();
      if (!id || !url) return null;
      return {
        id,
        audioUrl: url,
        title: String(track?.title || "").trim() || "Unknown Title",
        artist: String(track?.artist || "").trim() || "Unknown Artist",
        album: String(track?.album || "").trim(),
        genre: String(track?.genre || "").trim(),
        coverUrl: String(track?.coverUrl || "").trim(),
        duration:
          typeof track?.duration === "number" && Number.isFinite(track.duration)
            ? Math.max(0, track.duration)
            : 0,
      };
    })
    .filter((track): track is NonNullable<typeof track> => Boolean(track));
}

async function applyAutoPlayPayload(rawPayload: unknown) {
  const payload = parseAutoPayload(rawPayload);
  if (!payload) return;

  const songs = normalizeAutoTracks(payload);
  if (songs.length === 0) return;
  lastKnownQueueTitle = String(payload.queueTitle ?? "").trim();

  const requestedIndex =
    typeof payload.startIndex === "number" && Number.isFinite(payload.startIndex)
      ? payload.startIndex
      : 0;
  const targetIndex = Math.max(0, Math.min(requestedIndex, songs.length - 1));

  // Convert Song format to TrackPlayer track format
  const tracks = songs.map((song) => ({
    id: song.id,
    url: song.audioUrl,
    title: song.title,
    artist: song.artist,
    album: song.album,
    genre: song.genre,
    artwork: song.coverUrl,
    duration: song.duration,
  }));

  if (typeof (TrackPlayer as any).setQueue === "function") {
    await (TrackPlayer as any).setQueue(tracks);
  } else {
    await TrackPlayer.reset();
    await TrackPlayer.add(tracks);
  }

  if (targetIndex > 0) {
    await TrackPlayer.skip(targetIndex);
  }

  await TrackPlayer.setRepeatMode(mapPlaybackRepeatMode(payload.repeatMode));

  if (payload.playWhenReady !== false) {
    await TrackPlayer.play();
  }

  // Notify PlayerContext that the queue was replaced by Android Auto so it can
  // update currentSong / queue state without waiting for PlaybackActiveTrackChanged.
  try {
    DeviceEventEmitter.emit("AutoQueueApplied", {
      tracks: songs,
      startIndex: targetIndex,
      queueTitle: payload.queueTitle ?? "",
    });
  } catch {
    // Silent fail — PlayerContext will sync on next PlaybackActiveTrackChanged
  }

  scheduleAutoSessionSync("auto-queue-applied", true);
}

function setupAutoPlayBridge() {
  if (autoBridgeInitialized || Platform.OS !== "android") return;

  const autoPlayModule = NativeModules.AutoPlayModule;
  if (!autoPlayModule) {
    return;
  }

  try {
    const emitter = new NativeEventEmitter(autoPlayModule);

    autoBridgeSubscriptions.push(
      emitter.addListener("AutoPlayTracks", (payload) => {
        void applyAutoPlayPayload(payload).catch(() => {
          // Keep silent; Auto service already handles its own fallback.
        });
      })
    );

    autoBridgeSubscriptions.push(
      emitter.addListener("AutoModeChange", (payload) => {
        const parsed = parseAutoPayload(payload);
        const nextRepeat = mapPlaybackRepeatMode(parsed?.repeatMode);
        void TrackPlayer.setRepeatMode(nextRepeat).catch(() => {
          // Ignore repeat mode sync failures.
        });
        scheduleAutoSessionSync("auto-mode-change", true);
      })
    );

    autoBridgeSubscriptions.push(
      emitter.addListener(EVENT_TRANSPORT, (payload) => {
        void handleAutoTransportCommand(payload).catch(() => {
          // Silent fail: transport controls are best-effort.
        });
      })
    );

    autoBridgeInitialized = true;
  } catch {
    autoBridgeSubscriptions.forEach((subscription) => subscription.remove());
    autoBridgeSubscriptions = [];
    autoBridgeInitialized = false;
  }
}

async function playTrackAtIndex(index: number) {
  const queue = await TrackPlayer.getQueue();
  if (index < 0 || index >= queue.length) {
    return;
  }

  await TrackPlayer.skip(index);
  await TrackPlayer.play();
}

async function playTrackById(trackId: string) {
  const queue = await TrackPlayer.getQueue();
  const targetIndex = queue.findIndex((track) => String(track.id) === String(trackId));

  if (targetIndex < 0) {
    return;
  }

  await playTrackAtIndex(targetIndex);
}

async function playTrackFromSearch(event: any) {
  const queue = await TrackPlayer.getQueue();
  if (queue.length === 0) {
    return;
  }

  const terms = [
    event?.title,
    event?.artist,
    event?.album,
    event?.genre,
    event?.query,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (terms.length === 0) {
    await playTrackAtIndex(0);
    return;
  }

  const targetIndex = queue.findIndex((track) => {
    const haystack = [
      track.title,
      track.artist,
      track.album,
      track.genre,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return terms.every((term) => haystack.includes(term));
  });

  if (targetIndex >= 0) {
    await playTrackAtIndex(targetIndex);
    return;
  }

  const partialMatchIndex = queue.findIndex((track) => {
    const haystack = [
      track.title,
      track.artist,
      track.album,
      track.genre,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return terms.some((term) => haystack.includes(term));
  });

  await playTrackAtIndex(partialMatchIndex >= 0 ? partialMatchIndex : 0);
}

export const trackPlayerService = async () => {
  setupAutoPlayBridge();
  scheduleAutoSessionSync("service-start", true);

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play();
    scheduleAutoSessionSync("remote-play", true);
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
    scheduleAutoSessionSync("remote-pause", true);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.stop();
    scheduleAutoSessionSync("remote-stop", true);
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    await handleNextCommand();
    scheduleAutoSessionSync("remote-next", true);
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    await handlePreviousCommand();
    scheduleAutoSessionSync("remote-previous", true);
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
    scheduleAutoSessionSync("remote-seek", true);
  });

  TrackPlayer.addEventListener(Event.RemoteSkip, async (event) => {
    await playTrackAtIndex(event.index);
    scheduleAutoSessionSync("remote-skip", true);
  });

  TrackPlayer.addEventListener(Event.RemotePlayId, async (event) => {
    await playTrackById(event.id);
    scheduleAutoSessionSync("remote-play-id", true);
  });

  TrackPlayer.addEventListener(Event.RemotePlaySearch, async (event) => {
    await playTrackFromSearch(event);
    scheduleAutoSessionSync("remote-play-search", true);
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    lastProgressSecond = -1;
    scheduleAutoSessionSync("playback-active-track-changed", true);
  });

  TrackPlayer.addEventListener(Event.PlaybackState, () => {
    scheduleAutoSessionSync("playback-state", true);
  });

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
    const progressSecond = Math.floor(event.position ?? 0);
    if (progressSecond !== lastProgressSecond) {
      lastProgressSecond = progressSecond;
      scheduleAutoSessionSync("playback-progress-updated");
    }
  });
};
