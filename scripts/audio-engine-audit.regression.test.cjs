const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture: expoFixture } = require("./helpers/expo-player-fixture.cjs");
const { fixture: nativeFixture, tracks, tick } = require("./helpers/audio-player-fixture.cjs");

test("Expo pause settles an outstanding start without destroying the paused source", async () => {
  const f = expoFixture({ starts: false, fakeTimers: true });
  let desired = true;
  const pending = f.loadAndPlay("https://example.test/audio", null, () => desired);
  // Attach immediately so a rejection remains observable, not unhandled.
  const outcome = pending.then(() => null, error => error);
  await tick();
  desired = false;
  f.pause();
  await tick();
  f.fireTimers();
  assert.equal(await outcome, null);
  assert.equal(f.players[0].calls.some(([call]) => call === "remove"), false);
  f.destroy();
});

test("Expo control failures reach command callers and readiness reflects native loading", async () => {
  const f = expoFixture({ loaded: false, fakeTimers: true });
  const pending = f.loadAndPlay("https://example.test/audio", null, () => false);
  await tick();
  const player = f.players[0];
  assert.equal(f.isLoaded(), false);
  player.isLoaded = true;
  player.emit({ isLoaded: true });
  await pending;
  assert.equal(f.isLoaded(), true);
  player.play = () => { throw new Error("Native Play rejected"); };
  player.pause = () => { throw new Error("Native Pause rejected"); };
  assert.throws(() => f.play(), /Play rejected/);
  assert.throws(() => f.pause(), /Pause rejected/);
  f.destroy();
});

test("a prepared Expo stream cannot reuse credentials from another source request", async () => {
  const f = expoFixture();
  await f.prepareStandby("https://example.test/audio", { playbackHeaders: { Authorization: "old" } });
  await f.loadAndPlay("https://example.test/audio", { playbackHeaders: { Authorization: "new" } });
  assert.equal(f.players.length, 2);
  assert.equal(f.players[0].calls.some(([call]) => call === "remove"), true);
  assert.equal(f.players[1].source.headers.Authorization, "new");
  f.destroy();
});

test("native invalid removals and seeks cannot report success or corrupt the active index", async () => {
  const f = nativeFixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks, 1);
  for (const invalid of [-1, 0.5, NaN, Infinity, tracks.length]) await p.remove(invalid);
  assert.equal(await p.getActiveTrackIndex(), 1);
  assert.equal((await p.getActiveTrack()).id, "b");
  await assert.rejects(p.seekTo(NaN), /Invalid seek/);
});

test("rapid native next commands advance past a still-resolving selection", async () => {
  const pending = new Map();
  const f = nativeFixture({ youtubeResolver: song => new Promise(resolve => pending.set(song.id, resolve)) });
  const p = f.StandardAudioPlayer;
  await p.setQueue([tracks[0], ...["b", "c"].map(id => ({ id, source: "youtube", youtubeVideoId: id }))]);
  const first = p.skipToNext();
  await tick();
  const second = p.skipToNext();
  await tick();
  assert.equal(await p.getActiveTrackIndex(), 2);
  pending.get("c")({ url: "https://example.test/c" });
  await second;
  pending.get("b")({ url: "https://example.test/b" });
  await first;
  assert.equal((await p.getActiveTrack()).id, "c");
  assert.equal((await p.getActiveTrack()).url, "https://example.test/c");
});

test("moving a resolving native queue item preserves the selected source", async () => {
  let resolve;
  const f = nativeFixture({ youtubeResolver: () => new Promise(done => { resolve = done; }) });
  const p = f.StandardAudioPlayer;
  await p.setQueue([tracks[0], { id: "b", source: "youtube", youtubeVideoId: "b" }]);
  const selection = p.skip(1);
  await tick();
  await p.move(1, 0);
  resolve({ url: "https://example.test/b" });
  await selection;
  assert.equal(await p.getActiveTrackIndex(), 0);
  assert.equal((await p.getActiveTrack()).url, "https://example.test/b");
});

test("a stale native Stop completion cannot overwrite a newer Play state", async () => {
  const f = nativeFixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const stopped = p.stop();
  await p.play();
  f.StandardAudioRenderer().props.onPlaying();
  await stopped;
  assert.equal((await p.getPlaybackState()).state, f.State.Playing);
});

test("native focus denial cancels playback before the source can start", async () => {
  const f = nativeFixture();
  const p = f.StandardAudioPlayer;
  await p.setupPlayer();
  await p.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  let starts = 0;
  props.ref({ play() { starts++; }, pause() {}, seekToTime() {} });
  props.onLoad();
  const observe = f.audioManager.observeAudioInterruptions;
  f.audioManager.observeAudioInterruptions = enabled => {
    observe(enabled);
    if (enabled) f.system.get("interruption")({ type: "began", shouldResume: false });
  };
  await p.play();
  await tick();
  assert.equal(starts, 0);
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});

test("native Stop and queue exhaustion hide media controls while Pause retains them", async () => {
  const f = nativeFixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  await tick();
  const before = f.hiddenNotifications();
  await p.pause();
  await tick();
  assert.equal(f.hiddenNotifications(), before);
  await p.stop();
  await tick();
  assert.ok(f.hiddenNotifications() > before);
  await p.play();
  await tick();
  const beforeEnd = f.hiddenNotifications();
  await p.finishQueue();
  await tick();
  assert.ok(f.hiddenNotifications() > beforeEnd);
});

test("native Play after queue exhaustion reloads the retired source from its beginning", async () => {
  const f = nativeFixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue([tracks[0]]);
  await p.play();
  const finishedSource = f.StandardAudioRenderer().props;
  finishedSource.onEnded(180);
  await tick();
  assert.equal((await p.getPlaybackState()).state, f.State.Ended);
  const previousSource = f.snapshots[0]();
  await p.play();
  assert.notEqual(f.snapshots[0]().sourceVersion, previousSource.sourceVersion);
  assert.equal((await p.getProgress()).position, 0);
  const nextSource = f.StandardAudioRenderer().props;
  let starts = 0;
  nextSource.ref({ play() { starts++; }, pause() {}, seekToTime() {} });
  nextSource.onLoad();
  await tick();
  assert.equal(starts, 1);
});

test("Pause during native replay resolution wins over the delayed Play command", async () => {
  let resolveReplay;
  let requests = 0;
  const f = nativeFixture({ youtubeResolver: async () => ++requests === 1
    ? { url: "https://example.test/first" }
    : new Promise(resolve => { resolveReplay = resolve; }) });
  const p = f.StandardAudioPlayer;
  await p.setQueue([{ id: "youtube", source: "youtube" }]);
  await p.play();
  await p.finishQueue();
  const replay = p.play();
  await tick();
  await p.pause();
  resolveReplay({ url: "https://example.test/replay" });
  await replay;
  const source = f.StandardAudioRenderer().props;
  let starts = 0;
  source.ref({ play() { starts++; }, pause() {}, seekToTime() {} });
  source.onLoad();
  await tick();
  assert.equal(starts, 0);
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});

test("automatic native advance revalidates a managed download instead of opening a revoked queue URL", async () => {
  let valid = true;
  const f = nativeFixture({ downloads: {
    getSongDownload: async () => ({ status: valid ? "completed" : "revoked" }),
    getLocalPlaybackUrl: async () => valid ? "file:///managed.m4a" : null,
  } });
  const p = f.StandardAudioPlayer;
  await p.setQueue([tracks[0], { id: "offline", url: "file:///managed.m4a", duration: 180 }]);
  await p.play();
  valid = false;
  f.StandardAudioRenderer().props.onEnded(180);
  await tick();
  assert.equal((await p.getActiveTrack()).id, "offline");
  assert.equal((await p.getPlaybackState()).state, f.State.Error);
  assert.equal(f.StandardAudioRenderer(), null, "the revoked source must never be published to Audio");
});
