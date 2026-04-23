import TrackPlayer, { Event, RepeatMode } from "react-native-track-player";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

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

function normalizeAutoTracks(payload: AutoPlayPayload) {
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  return tracks
    .map((track) => {
      const id = String(track?.id || "").trim();
      const url = String(track?.audioUrl || "").trim();
      if (!id || !url) return null;
      return {
        id,
        url,
        title: String(track?.title || "").trim() || "Unknown Title",
        artist: String(track?.artist || "").trim() || "Unknown Artist",
        album: String(track?.album || "").trim(),
        genre: String(track?.genre || "").trim(),
        artwork: String(track?.coverUrl || "").trim(),
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

  const tracks = normalizeAutoTracks(payload);
  if (tracks.length === 0) return;

  const requestedIndex =
    typeof payload.startIndex === "number" && Number.isFinite(payload.startIndex)
      ? payload.startIndex
      : 0;
  const targetIndex = Math.max(0, Math.min(requestedIndex, tracks.length - 1));

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

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      await TrackPlayer.skipToNext();
      await TrackPlayer.play();
    } catch {
      // Silent fail when the queue is already at the end.
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
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
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteSkip, async (event) => {
    await playTrackAtIndex(event.index);
  });

  TrackPlayer.addEventListener(Event.RemotePlayId, async (event) => {
    await playTrackById(event.id);
  });

  TrackPlayer.addEventListener(Event.RemotePlaySearch, async (event) => {
    await playTrackFromSearch(event);
  });
};
