import { requireOptionalNativeModule } from "expo-modules-core";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import { EQ_FREQUENCIES_HZ } from "./equalizerConfig";
import { logger } from "@/lib/logger";
import { Event, type NativeTrack } from "./playbackContract";
import type { Song } from "@/lib/musicData";
export { Event, RepeatMode, State } from "./playbackContract";

type Snapshot = { queue: NativeTrack[]; index: number; state: string; position: number; duration: number; playWhenReady: boolean; equalizerAvailable: boolean };
type Bridge = {
  setup(): Promise<Snapshot>;
  command(name: string, args: Record<string, unknown>): Promise<Snapshot>;
  snapshot(): Promise<Snapshot>;
  addListener(name: "playbackEvent", listener: (event: { name: string; data: Record<string, unknown> }) => void): { remove(): void };
};
const bridge = !isRunningInExpoGo() && Platform.OS !== "web" ? requireOptionalNativeModule<Bridge>("MavrixfyPlayback") : null;
let setup: Promise<void> | null = null;
let subscription: { remove(): void } | null = null;
const listeners = new Map<string, Set<(event: any) => void>>();
let selection = 0;
const warming = new Set<string>();
let lastEffects = { equalizerAvailable: false };
async function ready(): Promise<Bridge> {
  if (!bridge) throw new Error("Mavrixfy native playback is missing. Rebuild the Expo development client or production app.");
  if (!setup) {
    subscription = bridge.addListener("playbackEvent", ({ name, data }) => {
      if (name === Event.PlaybackActiveTrackChanged && data.externalSelection) selection++;
      if (name === Event.PlaybackError) {
        const failedSelection = selection;
        // A failed signed URL must not be returned again on an explicit Retry.
        void snapshot().then(async state => {
          const track = state.queue[state.index];
          if (!track || data.trackId && data.trackId !== track.id) return;
          if (track.source === "youtube" || track.id?.startsWith("youtube_")) {
            const { rejectYouTubeStream } = await import("@/services/youtube/YouTubeMusic");
            if (failedSelection !== selection) return;
            rejectYouTubeStream({ ...track, id: track.id || "", source: "youtube" } as Song);
          }
        }).catch(() => {});
      }
      listeners.get(name)?.forEach(listener => listener(data));
      if (name === Event.PlaybackActiveTrackChanged || name === Event.PlaybackState && data.state === "playing") void warmQueue().catch(() => {});
    });
    setup = bridge.setup().then(snapshot => {
      lastEffects = { equalizerAvailable: snapshot.equalizerAvailable };
      void import("./audioEqualizer").then(({ syncEqualizerWithNative }) => syncEqualizerWithNative()).catch(error => logger.warn("[Audio] EQ restore failed", error));
    }).catch(error => { subscription?.remove(); subscription = null; setup = null; throw error; });
  }
  await setup;
  return bridge;
}
async function command(name: string, args: Record<string, unknown> = {}) {
  const native = await ready();
  // Expo's Kotlin Object converter rejects JavaScript undefined, including
  // optional fields nested in song metadata. Send a plain JSON payload on
  // both platforms: absent object fields are omitted and explicit null stays null.
  const payload = JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
  const snapshot = await native.command(name, payload);
  lastEffects = { equalizerAvailable: snapshot.equalizerAvailable };
  return snapshot;
}
async function snapshot() { return (await ready()).snapshot(); }
async function warmQueue() {
  const version = selection;
  const state = await snapshot();
  for (let index = state.index + 1; index < Math.min(state.queue.length, state.index + 4); index++) {
    const track = state.queue[index];
    if (track.source !== "youtube" && !track.id?.startsWith("youtube_")) continue;
    if (track.url && Number(track.youtubeAudioExpiresAt) > Date.now() + 120_000) continue;
    const key = `${version}:${index}:${track.id}`;
    if (warming.has(key)) continue;
    warming.add(key);
    void (async () => {
      try {
        const { resolveYouTubeStream } = await import("@/services/youtube/YouTubeMusic");
        const { getRequestedQualityPreference } = await import("./PlayerPlaybackResolver");
        const { playbackStreamMetadata } = await import("./audioTimeline");
        const { effective } = await getRequestedQualityPreference();
        const stream = await resolveYouTubeStream({ ...track, id: track.id || "", source: "youtube" } as Song, effective);
        const current = await snapshot();
        if (version !== selection || current.queue[index]?.id !== track.id || index <= current.index) return;
        await command("update", { index, onlyUpcoming: true, metadata: { ...playbackStreamMetadata(stream), url: stream.url, headers: stream.headers, youtubeAudioExpiresAt: stream.expiresAt } });
      } catch { logger.warn("[Audio] Upcoming stream is not prepared yet"); }
      finally { warming.delete(key); }
    })();
  }
}

/** One API; native owns its queue, focus, decoder, clock and automatic transitions. */
export const NativePlaybackPlayer = {
  async setupPlayer() { await ready(); },
  addEventListener(name: string, listener: (event: any) => void) {
    const group = listeners.get(name) ?? new Set(); group.add(listener); listeners.set(name, group);
    return { remove: () => { group.delete(listener); } };
  },
  beginTrackChange() { selection++; void command("begin").catch(error => logger.warn("[Audio] Track-change pause failed", error)); },
  async setQueue(tracks: NativeTrack[], initialIndex = 0, initialPosition = 0, preserveCurrentTrack = false) {
    selection++;
    await command("setQueue", { tracks, index: initialIndex, position: initialPosition, preserveCurrentTrack });
    void warmQueue().catch(() => {});
  },
  async load(track: NativeTrack, initialPosition = 0) { await this.setQueue([track], 0, initialPosition); },
  async add(tracks: NativeTrack | NativeTrack[], insertAt?: number) {
    await command("add", { tracks: Array.isArray(tracks) ? tracks : [tracks], index: insertAt ?? (await snapshot()).queue.length });
  },
  async remove(index: number) { await command("remove", { index }); },
  async move(fromIndex: number, toIndex: number) { await command("move", { index: fromIndex, to: toIndex }); },
  async reset() { selection++; await command("reset"); },
  async play() { await command("play"); },
  async pause() { await command("pause"); },
  async stop() { await command("stop"); },
  async seekTo(position: number) { if (!Number.isFinite(position)) throw new Error("Invalid seek position"); await command("seek", { position }); },
  async skip(index: number, initialPosition = 0) {
    const state = await snapshot();
    if (!Number.isInteger(index) || index < 0 || index >= state.queue.length || !Number.isFinite(initialPosition)) throw new Error("Invalid queue selection");
    selection++; await command("skip", { index, position: Math.max(0, initialPosition) });
  },
  async skipToNext() { const state = await snapshot(); if (state.index + 1 < state.queue.length) await this.skip(state.index + 1); },
  async skipToPrevious() { const state = await snapshot(); await this.skip(state.position > 3 ? state.index : Math.max(0, state.index - 1)); },
  async finishQueue() { await command("pause"); listeners.get(Event.PlaybackQueueEnded)?.forEach(listener => listener({})); },
  async setRepeatMode(mode: string) { await command("repeat", { mode }); },
  setVolume(volume: number) { if (Number.isFinite(volume)) void command("volume", { volume: Math.max(0, Math.min(1, volume)) }).catch(error => logger.warn("[Audio] Volume failed", error)); },
  async getQueue() { return (await snapshot()).queue; },
  async getActiveTrack() { const state = await snapshot(); return state.queue[state.index]; },
  async getActiveTrackIndex() { return (await snapshot()).index; },
  async getPlaybackState() { return { state: (await snapshot()).state }; },
  async getProgress() { const state = await snapshot(); return { position: state.position, duration: state.duration, buffered: 0 }; },
  async updateMetadataForTrack(index: number, metadata: Partial<NativeTrack>) { await command("update", { index, metadata }); },
  async prepareTrack(track: NativeTrack) {
    const version = selection; const state = await snapshot();
    const index = state.queue.findIndex((candidate, i) => i > state.index && candidate.id === track.id);
    if (index < 0 || version !== selection) return;
    // Install the resolved URL. Native queue preloading owns its media data.
    await command("update", { index, onlyUpcoming: true, metadata: track });
  },
};
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type NativePlaybackPlayer = typeof NativePlaybackPlayer;
export function getNativeCarClient() {
  if (!bridge || Platform.OS !== "android") return null;
  const events: Record<string, string> = { MavrixfyPlayMediaId: "car-play-media", MavrixfyPlaySearch: "car-search", MavrixfyPlaybackAction: "car-action" };
  return {
    addListener(name: string, listener: (event: any) => void) { return NativePlaybackPlayer.addEventListener(events[name] || name, listener); },
    updateCatalog(json: string, _activeId: string) { void command("catalog", { json }).catch(error => logger.warn("[Car] Catalog failed", error)); },
    updateControls(id: string, shuffled: boolean, repeat: string, liked: boolean) { void command("controls", { id, shuffled, repeat, liked }).catch(error => logger.warn("[Car] Controls failed", error)); },
    reportError(message: string) { logger.warn("[Car]", message); },
    async completeSelection(requestId: string, mediaId?: string, error?: string) {
      await command("carResolution", { requestId, mediaId, error });
    },
  };
}
export function getNativeAudioEffects() { return lastEffects; }
export function setNativeEqualizer(gains: readonly number[], enabled: boolean) {
  if (gains.length !== EQ_FREQUENCIES_HZ.length) throw new Error("Invalid EQ bands.");
  void command("equalizer", { gains: gains.map(value => Number.isFinite(value) ? Math.max(-8, Math.min(8, value)) : 0), enabled })
    .catch(error => logger.warn("[Audio] Native EQ failed", error));
}
