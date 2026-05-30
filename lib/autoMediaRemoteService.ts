import { DeviceEventEmitter, Platform } from "react-native";
import TrackPlayer, { Event, RepeatMode } from "react-native-track-player";
import { setupPlayer } from "@/lib/trackPlayer";
import type { Song } from "@/lib/musicData";
import { mapFilter } from "@/lib/arrayUtils";

type AutoRemoteEvent = {
  command?: string;
  positionMs?: number;
  queueIndex?: number;
  song?: Partial<Song>;
  queue?: Partial<Song>[];
};

let isRegistered = false;
let commandChain: Promise<void> = Promise.resolve();

function toDurationSeconds(raw: unknown): number {
  const value = Number(raw || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 10000 ? value / 1000 : value;
}

function toPlayableSong(value?: Partial<Song>): Song | null {
  if (!value?.id || !value?.title || !value?.audioUrl) return null;
  return {
    id: String(value.id),
    title: String(value.title),
    artist: String(value.artist || "Mavrixfy"),
    album: String(value.album || ""),
    duration: toDurationSeconds(value.duration),
    coverUrl: String(value.coverUrl || ""),
    genre: String(value.genre || "Mavrixfy"),
    audioUrl: String(value.audioUrl),
    source: value.source === "local" ? "local" : "jiosaavn",
  };
}

function songToTrack(song: Song) {
  return {
    id: song.id,
    url: song.audioUrl,
    title: song.title,
    artist: song.artist,
    album: song.album || "",
    genre: song.genre || "",
    artwork: song.coverUrl,
    duration: toDurationSeconds(song.duration),
  };
}

function trackToSong(track: any): Song | null {
  const id = String(track?.id || "").trim();
  const audioUrl = String(track?.url || "").trim();
  const title = String(track?.title || "").trim();
  if (!id || !audioUrl || !title) return null;

  return {
    id,
    title,
    artist: String(track?.artist || "Mavrixfy"),
    album: String(track?.album || ""),
    duration: toDurationSeconds(track?.duration),
    coverUrl: String(track?.artwork || ""),
    genre: String(track?.genre || "Mavrixfy"),
    audioUrl,
    source: "jiosaavn",
  };
}

function emitAutoQueueApplied(tracks: Song[], startIndex: number): void {
  DeviceEventEmitter.emit("AutoQueueApplied", {
    tracks,
    startIndex: Math.max(0, Math.min(startIndex, tracks.length - 1)),
    queueTitle: "Mavrixfy",
  });
}

function playableQueueFromEvent(event: AutoRemoteEvent): Song[] {
  const selectedSong = toPlayableSong(event.song);
  const queue = Array.isArray(event.queue)
    ? mapFilter(event.queue, toPlayableSong, (song): song is Song => Boolean(song))
    : [];

  if (!selectedSong) return queue;
  return queue.some((song) => song.id === selectedSong.id)
    ? queue
    : [selectedSong, ...queue];
}

async function emitCurrentNativeQueue(): Promise<void> {
  const [queue, activeIndex] = await Promise.all([
    TrackPlayer.getQueue(),
    TrackPlayer.getActiveTrackIndex(),
  ]);
  const songs = Array.isArray(queue)
    ? mapFilter(queue, trackToSong, (song): song is Song => Boolean(song))
    : [];
  if (songs.length === 0) return;
  emitAutoQueueApplied(
    songs,
    typeof activeIndex === "number" && Number.isFinite(activeIndex) ? activeIndex : 0
  );
}

function runAutoCommand(command: () => Promise<void> | void): void {
  commandChain = commandChain
    .catch(() => {})
    .then(async () => {
      try {
        await setupPlayer();
        await command();
      } catch {
        // Android Auto commands can arrive during cold start; keep later commands alive.
      }
    });
}

async function playAutoSong(event: AutoRemoteEvent): Promise<void> {
  const selectedSong = toPlayableSong(event.song);
  if (!selectedSong) return;

  const playableQueue = playableQueueFromEvent(event);
  const selectedIndex = Math.max(
    0,
    playableQueue.findIndex((song) => song.id === selectedSong.id)
  );
  const tracks = playableQueue.map(songToTrack);

  if (typeof TrackPlayer.setQueue === "function") {
    await TrackPlayer.setQueue(tracks);
  } else {
    await TrackPlayer.reset();
    await TrackPlayer.add(tracks);
  }
  await TrackPlayer.skip(selectedIndex);
  await TrackPlayer.play();
  emitAutoQueueApplied(playableQueue, selectedIndex);
}

async function hasPlayableNativeQueue(): Promise<boolean> {
  try {
    const [queue, activeTrack] = await Promise.all([
      TrackPlayer.getQueue(),
      TrackPlayer.getActiveTrack(),
    ]);
    return Array.isArray(queue) && queue.length > 0 && Boolean(activeTrack?.id);
  } catch {
    return false;
  }
}

async function playOrHydrate(event: AutoRemoteEvent): Promise<void> {
  const eventQueue = playableQueueFromEvent(event);
  if (eventQueue.length > 0) {
    try {
      const [nativeQueue, nativeIndex] = await Promise.all([
        TrackPlayer.getQueue(),
        TrackPlayer.getActiveTrackIndex(),
      ]);
      const targetIndex = Number.isFinite(Number(event.queueIndex))
        ? Number(event.queueIndex)
        : eventQueue.findIndex((song) => song.id === event.song?.id);
      const safeTargetIndex = targetIndex >= 0 ? targetIndex : 0;
      const idsMatch =
        Array.isArray(nativeQueue) &&
        nativeQueue.length === eventQueue.length &&
        eventQueue.every((song, index) => String(nativeQueue[index]?.id ?? "") === String(song.id)) &&
        (typeof nativeIndex !== "number" || nativeIndex === safeTargetIndex);

      if (!idsMatch) {
        await playAutoSong(event);
        return;
      }
    } catch {
      await playAutoSong(event);
      return;
    }
  }

  if (await hasPlayableNativeQueue()) {
    await TrackPlayer.play();
    return;
  }
  await playAutoSong(event);
}

async function skipToEventQueueIndex(event: AutoRemoteEvent): Promise<boolean> {
  const targetIndex = Number(event.queueIndex);
  if (!Number.isFinite(targetIndex) || targetIndex < 0) return false;

  const queue = await TrackPlayer.getQueue();
  if (!Array.isArray(queue) || targetIndex >= queue.length) return false;

  const eventSongId = String(event.song?.id ?? "").trim();
  if (eventSongId && String(queue[targetIndex]?.id ?? "") !== eventSongId) {
    return false;
  }

  await TrackPlayer.skip(targetIndex);
  await TrackPlayer.play();
  await emitCurrentNativeQueue();
  return true;
}

async function skipNext(event?: AutoRemoteEvent): Promise<void> {
  if (event && (await skipToEventQueueIndex(event))) return;

  const [queue, activeIndex] = await Promise.all([
    TrackPlayer.getQueue(),
    TrackPlayer.getActiveTrackIndex(),
  ]);
  if ((!Array.isArray(queue) || queue.length === 0) && event?.song) {
    await playAutoSong(event);
    return;
  }

  const nextIndex = (activeIndex ?? 0) + 1;
  if (nextIndex < queue.length) {
    await TrackPlayer.skip(nextIndex);
    await TrackPlayer.play();
    await emitCurrentNativeQueue();
    return;
  }

  if ((await TrackPlayer.getRepeatMode()) === RepeatMode.Queue && queue.length > 0) {
    await TrackPlayer.skip(0);
    await TrackPlayer.play();
    await emitCurrentNativeQueue();
    return;
  }

  if (event?.song) await playAutoSong(event);
}

async function skipToQueueItem(index: number): Promise<void> {
  const queue = await TrackPlayer.getQueue();
  if (!Number.isFinite(index) || index < 0 || index >= queue.length) return;
  await TrackPlayer.skip(index);
  await TrackPlayer.play();
  await emitCurrentNativeQueue();
}

async function skipPrevious(event?: AutoRemoteEvent): Promise<void> {
  if (event && (await skipToEventQueueIndex(event))) return;

  const progress = await TrackPlayer.getProgress();
  if ((progress?.position ?? 0) > 3) {
    await TrackPlayer.seekTo(0);
    return;
  }

  const [queue, activeIndex] = await Promise.all([
    TrackPlayer.getQueue(),
    TrackPlayer.getActiveTrackIndex(),
  ]);
  if ((!Array.isArray(queue) || queue.length === 0) && event?.song) {
    await playAutoSong(event);
    return;
  }

  const previousIndex = (activeIndex ?? 0) - 1;
  if (previousIndex >= 0) {
    await TrackPlayer.skip(previousIndex);
    await TrackPlayer.play();
    await emitCurrentNativeQueue();
    return;
  }

  if ((await TrackPlayer.getRepeatMode()) === RepeatMode.Queue && queue.length > 0) {
    await TrackPlayer.skip(queue.length - 1);
    await TrackPlayer.play();
    await emitCurrentNativeQueue();
  } else {
    await TrackPlayer.seekTo(0);
  }
}

export function registerAutoMediaRemoteService(): void {
  if (isRegistered || Platform.OS !== "android") return;
  isRegistered = true;
  console.log("[AutoMediaRemoteService] Registering auto media remote service listener");

  DeviceEventEmitter.addListener("MavrixfyAutoRemoteCommand", (event: AutoRemoteEvent) => {
    const command = event?.command;
    console.log("[AutoMediaRemoteService] Received remote command event:", command, event);
    if (command === "playFromMediaId") {
      runAutoCommand(() => playAutoSong(event));
      return;
    }
    if (command === "play") {
      runAutoCommand(() => playOrHydrate(event));
      return;
    }
    if (command === "pause") {
      runAutoCommand(() => TrackPlayer.pause());
      return;
    }
    if (command === "next") {
      runAutoCommand(() => skipNext(event));
      return;
    }
    if (command === "previous") {
      runAutoCommand(() => skipPrevious(event));
      return;
    }
    if (command === "skipToQueueItem") {
      const index = Number(event?.queueIndex);
      runAutoCommand(() => skipToQueueItem(index));
      return;
    }
    if (command === "seek") {
      const positionSeconds = Math.max(0, Number(event?.positionMs ?? 0)) / 1000;
      runAutoCommand(() => TrackPlayer.seekTo(positionSeconds));
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    runAutoCommand(emitCurrentNativeQueue);
  });
  if (Event.PlaybackTrackChanged) {
    TrackPlayer.addEventListener(Event.PlaybackTrackChanged, () => {
      runAutoCommand(emitCurrentNativeQueue);
    });
  }
}
