const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));
const ref = current => ({ current });
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function load(filename, imports) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports,
    setTimeout: (fn, delay) => delay === 800 ? 0 : setTimeout(fn, delay), clearTimeout,
    require: name => {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}

function fixture({ ready = true, initialization, queueIds = ["a", "b", "c"], nativeIds, activeIndex = 1 } = {}) {
  const songs = queueIds.map(id => ({ id, title: id, artist: "Artist", duration: 180, audioUrl: `https://audio.example/${id}` }));
  let nativeQueue = (nativeIds ?? queueIds).map(id => ({ id, url: `https://audio.example/${id}`, accountId: "guest" }));
  const calls = [], snapshots = [], foreground = [], saved = [], cleanups = [], events = new Map();
  const options = {
    currentSong: null, currentSongRef: ref(songs[activeIndex]), queueRef: ref(songs), originalQueueRef: ref(songs),
    queueIndexRef: ref(activeIndex), userQueuedSongIdsRef: ref([]), isShuffledRef: ref(false), repeatModeRef: ref("off"),
    isPlayingRef: ref(false), positionSecondsRef: ref(37), durationSecondsRef: ref(180),
    playbackLoadingRef: ref(false), desiredPlayStateRef: ref(false), pendingPlayRequestRef: ref(null), playRequestIdRef: ref(0),
    streamUrlCache: ref(new Map()), isNativeQueueSyncedRef: ref(nativeQueue.length === songs.length),
    playSongRef: ref(noop), togglePlayRef: ref(noop), seekToRef: ref(noop), nextSongRef: ref(noop), prevSongRef: ref(noop),
    likedSongsRef: ref([]), likedSongs: [], sleepTimerRef: ref(null),
    setCurrentSong: noop, setQueue: noop, setSourceQueue: noop, setQueueIndex: noop, setUserQueuedSongIds: noop,
    setIsPlaying: noop, setPlaybackLoading: noop, setIsShuffled: noop, setRepeatMode: noop,
    setNativePosition: value => { options.positionSecondsRef.current = value; }, setNativeDuration: noop, setSeekOverride: noop,
    prefetchAdjacentTrackStreams: noop, showPlaybackNotice: message => calls.push(["notice", message]),
    clearSleepTimer: () => { options.sleepTimerRef.current = null; },
    isPlayerReady: ready, ensurePlayerReady: () => initialization?.promise ?? Promise.resolve(true), canUseLightweightAudioFallback: false,
    resolvePlaybackUrlCached: async song => song.audioUrl,
    enqueueNativeQueueMutation: async operation => operation(),
    nativeQueueIdsMatch: (native, queue) => native.length === queue.length && native.every((item, index) => item.id === queue[index].id),
    replaceNativeQueuePreservingState: async (queue, index) => { calls.push(["replace", queue.map(song => song.id), index]); },
    subscribeTrackPlayerEvent: (event, callback) => { events.set(event, callback); return noop; },
    Event: { PlaybackProgressUpdated: "progress", PlaybackActiveTrackChanged: "active", PlaybackQueueEnded: "ended", PlaybackError: "error" },
    State: { Playing: "playing", Paused: "paused", None: "none", Stopped: "stopped", Error: "error", Ended: "ended" },
    RepeatMode: { Off: "off", Queue: "all", Track: "one" },
  };
  options.TrackPlayer = {
    beginTrackChange: noop,
    getActiveTrack: async () => nativeQueue[activeIndex], getQueue: async () => nativeQueue,
    getActiveTrackIndex: async () => activeIndex, getPlaybackState: async () => ({ state: "paused" }),
    getProgress: async () => ({ position: 37, duration: 180 }),
    play: async () => calls.push(["play"]), pause: async () => calls.push(["pause"]),
    setRepeatMode: async mode => calls.push(["repeat", mode]),
    remove: async index => { calls.push(["remove", index]); nativeQueue.splice(index, 1); },
    setQueue: async (queue, index) => { nativeQueue = queue; calls.push(["queue", index]); },
    reset: async () => { calls.push(["reset"]); nativeQueue = []; },
  };
  let accountGeneration = 0;
  const storage = { loadPlayerState: async () => null, savePlayerState: async state => saved.push(state), addRecentlyPlayed: async () => {} };
  const imports = {
    react: { useCallback: fn => fn, useRef: ref, useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } },
    "react-native": { Platform: { OS: "android" }, AppState: { addEventListener: (event, callback) => { foreground.push(callback); return { remove: noop }; } } },
    "@/lib/accountScope": { getAccountScope: () => ({ accountId: null, generation: accountGeneration }), isCurrentAccount: scope => scope.generation === accountGeneration },
    "@/lib/arrayUtils": { shufflePlaybackQueue: (songs, index) => ({ queue: index < 0 ? [...songs].reverse() : [songs[index], ...songs.filter((_, i) => i !== index).reverse()], index: 0 }) },
    "@/lib/logger": { logger: { warn: noop, error: noop } },
    "@/lib/storage": { getSettings: async () => ({ smartAutoplayEnabled: false }) },
    "@/services/audio/ExpoAvAdapter": {},
    "@/services/audio/PlaybackEngine": { updatePlaybackEngineSnapshot: patch => snapshots.push(patch) },
    "@/services/audio/PlayerPlaybackResolver": {
      withResolvedPlaybackUrl: (song, audioUrl) => ({ ...song, audioUrl }), resolveAudioUrl: song => song.audioUrl,
      songToTrack: (song, url) => ({ ...song, url: url || song.audioUrl }),
    },
    "@/services/audio/audioNativeQueueLane": { isSameQueueContent: (a, b) => a.length === b.length && a.every((song, index) => song.id === b[index].id) },
    "@/services/player/playerPersistenceService": { playerPersistenceService: storage },
    "@/services/youtube/YouTubeMusic": { isYouTubeSong: () => false, peekYouTubeStream: noop },
    "@/services/carPlayService": { carPlayService: { isAvailable: () => false } },
    "@/utils/timeFormatters": { toDurationSeconds: Number },
    "./audioTimeline": require("./helpers/audio-timeline-fixture.cjs"),
  };
  const commands = load("src/services/audio/audioPlaybackCommands.ts", imports).useAudioPlaybackCommands(options);
  const operations = load("src/services/audio/audioQueueOperations.ts", imports).useAudioQueueOperations({ ...options, playSong: commands.playSong });
  return { options, commands, operations, calls, songs, snapshots, storage, events, foreground, saved, cleanups,
    startup: () => load("src/services/audio/audioStartupReconcile.ts", imports).useStartupPlaybackReconcile(options),
    listen: () => load("src/services/audio/audioSyncListeners.ts", imports).useAudioSyncListeners(options),
    changeAccount: () => accountGeneration++,
  };
}

test("rapid Pause cancels an earlier resume while native initialization is pending", async () => {
  const ready = deferred(); const f = fixture({ ready: false, initialization: ready });
  const pending = f.commands.togglePlay();
  await f.commands.togglePlay();
  ready.resolve(true);
  await pending;
  assert.deepEqual(f.calls, [["pause"]]);
});

test("a second toggle pauses while a resume is waiting for native state", async () => {
  const f = fixture(); const active = deferred();
  f.options.TrackPlayer.getActiveTrack = () => active.promise;
  const resume = f.commands.togglePlay();
  await f.commands.togglePlay();
  active.resolve({ id: "b", url: "https://audio.example/b" }); await resume;
  assert.deepEqual(f.calls, [["pause"]]);
  assert.equal(f.options.isPlayingRef.current, false);
});

test("an earlier resume cannot reload or play after a new selection", async () => {
  const f = fixture(); const active = deferred();
  f.options.TrackPlayer.getActiveTrack = () => active.promise;
  const resume = f.commands.togglePlay();
  f.options.playRequestIdRef.current++;
  f.options.currentSongRef.current = f.songs[2];
  active.resolve(null); await resume;
  assert.equal(f.calls.length, 0);
  assert.equal(f.options.currentSongRef.current.id, "c");
});

test("shuffle Play restores canonical playlist order before asynchronous playback completes", async () => {
  const f = fixture(); const stream = deferred();
  // Delay native queue completion after playSong has synchronously installed its queue.
  f.options.TrackPlayer.setQueue = async () => stream.promise;
  const playing = f.operations.shufflePlay(f.songs);
  await tick();
  assert.deepEqual(Array.from(f.options.queueRef.current, song => song.id), ["c", "b", "a"]);
  assert.deepEqual(Array.from(f.options.originalQueueRef.current, song => song.id), ["a", "b", "c"]);
  stream.resolve(); await playing;
  f.operations.toggleShuffle();
  assert.deepEqual(Array.from(f.options.queueRef.current, song => song.id), ["a", "b", "c"]);
  assert.equal(f.options.queueIndexRef.current, 2);
});

test("repeat changes publish the value used by player UI", () => {
  const f = fixture(); f.operations.toggleRepeat();
  assert.equal(f.snapshots.at(-1).repeatMode, "all");
});

test("removal from an unsynchronized native queue cannot remove its sole playing item", async () => {
  const f = fixture({ nativeIds: ["b"] });
  f.operations.removeFromQueue(0); await tick();
  assert.equal(f.calls.some(([name]) => name === "remove"), false);
  assert.deepEqual(f.calls, [["replace", ["b", "c"], 0]]);
});

test("startup cannot replace a Play selection while persistence is loading", async () => {
  const f = fixture(); const persisted = deferred();
  f.options.currentSongRef.current = null; f.options.TrackPlayer = null;
  f.storage.loadPlayerState = () => persisted.promise; f.startup();
  f.options.playRequestIdRef.current++;
  f.options.currentSongRef.current = f.songs[2];
  persisted.resolve({ currentSong: f.songs[0], queue: f.songs, queueIndex: 0 }); await tick();
  assert.equal(f.options.currentSongRef.current.id, "c");
  assert.equal(f.snapshots.length, 0);
});

test("startup cannot restore a previous account after an account change", async () => {
  const f = fixture(); const persisted = deferred();
  f.options.currentSongRef.current = null; f.options.TrackPlayer = null;
  f.storage.loadPlayerState = () => persisted.promise; f.startup(); f.changeAccount();
  persisted.resolve({ currentSong: f.songs[0], queue: f.songs, queueIndex: 0 }); await tick();
  assert.equal(f.options.currentSongRef.current, null);
});

test("persisted startup aligns the queue index with the stored current song", async () => {
  const f = fixture(); f.options.currentSongRef.current = null; f.options.TrackPlayer = null;
  f.storage.loadPlayerState = async () => ({ currentSong: f.songs[2], queue: f.songs, queueIndex: 0 });
  f.startup(); await tick();
  assert.equal(f.options.queueIndexRef.current, 2);
  assert.equal(f.options.desiredPlayStateRef.current, false);
});

test("native duplicate-track advancement updates the playing occurrence", () => {
  const f = fixture({ queueIds: ["a", "a", "b"], activeIndex: 0 }); f.listen();
  f.events.get("active")({ track: { id: "a" }, index: 1 });
  assert.equal(f.options.queueIndexRef.current, 1);
  assert.equal(f.snapshots.at(-1).queueIndex, 1);
});

test("native progress keeps the effective seek position written by the progress hook", () => {
  const f = fixture(); f.options.setNativePosition = () => { f.options.positionSecondsRef.current = 90; }; f.listen();
  f.events.get("progress")({ position: 30, duration: 180 });
  assert.equal(f.options.positionSecondsRef.current, 90);
});

test("foreground reads cannot overwrite a selection made while the reads are pending", async () => {
  const f = fixture(); const active = deferred();
  f.options.TrackPlayer.getActiveTrack = () => active.promise; f.listen();
  const sync = f.foreground[0]("active");
  f.options.currentSongRef.current = f.songs[2];
  f.options.pendingPlayRequestRef.current = { id: 1, songId: "c" };
  active.resolve({ id: "a" }); await sync;
  assert.equal(f.options.currentSongRef.current.id, "c");
  assert.equal(f.snapshots.length, 0);
});

test("end-of-queue sleep timer clears resume intent", async () => {
  const f = fixture(); f.options.desiredPlayStateRef.current = true;
  f.options.sleepTimerRef.current = { mode: "end-of-stack" }; f.listen();
  await f.events.get("ended")();
  assert.equal(f.options.desiredPlayStateRef.current, false);
  assert.equal(f.options.sleepTimerRef.current, null);
});

test("a selected duplicate song plays its requested queue occurrence", async () => {
  const f = fixture({ queueIds: ["a", "a", "b"], activeIndex: 2 });
  await f.commands.playSong(f.songs[1], f.songs);
  assert.equal(f.options.queueIndexRef.current, 1);
  assert.equal(f.calls.find(([name]) => name === "queue")[1], 1);
});

test("shuffle preserves the active duplicate occurrence after resolved metadata changes its object", () => {
  const f = fixture({ queueIds: ["a", "a", "b"], activeIndex: 1 });
  f.options.currentSongRef.current = { ...f.songs[1], audioUrl: "https://refreshed.example/a" };
  f.operations.toggleShuffle(); f.operations.toggleShuffle();
  assert.equal(f.options.queueIndexRef.current, 1);
});

test("old-session persistence and cleanup cannot write a queue into a different account", () => {
  const f = fixture(); f.options.currentSong = f.songs[1]; f.listen();
  assert.equal(f.saved.length, 1);
  f.changeAccount();
  f.foreground[0]("background"); f.cleanups.forEach(cleanup => cleanup());
  assert.equal(f.saved.length, 1);
});

test("the player view uses the authoritative duplicate queue index", () => {
  const songs = [{ id: "a" }, { id: "a" }, { id: "b" }];
  const { usePlayerLiveQueue } = load("src/features/player/hooks/usePlayerLiveQueue.ts", {
    react: { useMemo: fn => fn() },
  });
  assert.equal(usePlayerLiveQueue(songs, songs, songs[1], 1).liveActiveQueueIndex, 1);
});

test("cached local files are revalidated while cached remote streams remain reusable", async () => {
  let resolutions = 0;
  const imports = {
    react: { useRef: ref, useState: value => [value, noop], useCallback: fn => fn, useEffect: noop },
    "@/services/youtube/YouTubeMusic": { isYouTubeSong: () => false },
    "@/lib/logger": { logger: { error: noop, warn: noop } },
    "@/lib/accountScope": {}, "@/lib/storage": {}, "@/utils/globalToast": { showGlobalToast: noop },
    "./audioNativeQueueLane": { useAudioNativeQueueLane: () => ({}) },
    "./audioStartupReconcile": { useStartupPlaybackReconcile: noop },
    "./PlaybackEngine": { updatePlaybackEngineSnapshot: noop },
    "./PlayerPlaybackResolver": { resolvePlaybackUrlWithDetails: async () => { resolutions++; return { url: null, qualityState: {} }; } },
    "./smartAutoplayService": {}, "./ExpoAvAdapter": {},
  };
  const { usePlayerCoreState } = load("src/services/audio/usePlayerCoreState.ts", imports);
  const core = usePlayerCoreState({ TrackPlayer: null, State: {}, RepeatMode: {} });
  core.streamUrlCache.current.set("a", "file:///expired-download.m4a");
  assert.equal(await core.resolvePlaybackUrlCached({ id: "a" }), null);
  assert.equal(resolutions, 1);
  assert.equal(core.streamUrlCache.current.has("a"), false);
  core.streamUrlCache.current.set("b", "https://audio.example/b");
  assert.equal(await core.resolvePlaybackUrlCached({ id: "b" }), "https://audio.example/b");
  assert.equal(resolutions, 1);
});

test("a native error clears loading and publishes error plus paused intent", () => {
  const f = fixture(); f.options.playbackLoadingRef.current = true; f.options.desiredPlayStateRef.current = true;
  f.listen(); f.events.get("error")({ message: "Decoder failed", trackId: "b" });
  assert.equal(f.options.playbackLoadingRef.current, false);
  assert.equal(f.options.desiredPlayStateRef.current, false);
  assert.equal(f.snapshots.at(-1).desiredPlayState, false);
  assert.equal(f.snapshots.at(-1).error, "Decoder failed");
});

test("an unavailable stream publishes a recoverable failure and clears optimistic playback", async () => {
  const f = fixture(); f.songs[0].audioUrl = "";
  await f.commands.playSong(f.songs[0], f.songs);
  assert.equal(f.options.isPlayingRef.current, false);
  assert.equal(f.options.playbackLoadingRef.current, false);
  assert.equal(f.snapshots.findLast(patch => patch.error)?.error, "Playback stream timed out or unavailable.");
  assert.equal(f.snapshots.findLast(patch => "desiredPlayState" in patch).desiredPlayState, false);
});

test("a synchronized native queue cannot reuse an outgoing local URL after resolution changes it", async () => {
  const f = fixture();
  let skipped = false;
  f.options.TrackPlayer.skip = async () => { skipped = true; };
  f.options.TrackPlayer.getQueue = async () => f.songs.map(song => ({ id: song.id, url: `file:///old-${song.id}.m4a` }));
  await f.commands.playSong(f.songs[1], f.songs);
  assert.equal(skipped, false);
  assert.equal(f.calls.some(([name]) => name === "queue"), true);
});

test("a previous end-of-queue pause cannot clear a newer selection's playback state", async () => {
  const f = fixture({ activeIndex: 2 }); const pause = deferred();
  f.options.TrackPlayer.pause = () => pause.promise;
  const ending = f.commands.nextSong(); await tick();
  f.options.playRequestIdRef.current++;
  f.options.currentSongRef.current = f.songs[0]; f.options.isPlayingRef.current = true; f.options.desiredPlayStateRef.current = true;
  pause.resolve(); await ending;
  assert.equal(f.options.isPlayingRef.current, true);
  assert.equal(f.snapshots.length, 0);
});
