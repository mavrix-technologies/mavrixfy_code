const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function fixture({ position = 40, requestId = 1, persistedRead = async () => null } = {}) {
  const slots = []; let cursor = 0, effects = [], status, next = 0;
  const updates = [];
  const ref = current => ({ current });
  const song = { id: "youtube_abcdefghijk", source: "youtube", duration: 200 };
  const options = { currentSong: song, currentSongRef: ref(song), queueRef: ref([song]), repeatModeRef: ref("off"),
    isPlayingRef: ref(true), setIsPlaying() {}, playbackLoadingRef: ref(false), desiredPlayStateRef: ref(null),
    pendingPlayRequestRef: ref(null), playRequestIdRef: ref(requestId), canUseLightweightAudioFallback: true, TrackPlayer: null,
    nextSongRef: ref(() => next++), playSongRef: ref(() => {}) };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/services/audio/audioProgressTracking.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => {
    if (name === "./audioTimeline") return require("./helpers/audio-timeline-fixture.cjs");
    if (name === "react") return { useRef: initial => { const i = cursor++; return slots[i] ??= ref(initial); }, useCallback: fn => fn, useEffect: fn => effects.push(fn) };
    if (name.includes("ExpoAvAdapter")) return { onStatusUpdate: fn => { status = fn; }, pause() {} };
    if (name.includes("playbackProgressStore")) return { updatePlaybackProgress: value => updates.push(value), resetPlaybackProgress() {} };
    if (name.includes("PlaybackEngine")) return { updatePlaybackEngineSnapshot() {} };
    if (name.includes("timeFormatters")) return { toDurationSeconds: Number };
    if (name.includes("YouTubeMusic")) return { isYouTubeSong: () => true, rejectYouTubeStream() {} };
    if (name.includes("logger")) return { logger: { warn() {} } };
    if (name.includes("playerPersistenceService")) return { playerPersistenceService: { loadPlayerState: persistedRead } };
    throw new Error(name);
  } });
  const render = () => { cursor = 0; effects = []; const result = module.exports.useAudioProgressTracking(options);
    result.positionSecondsRef.current = position; effects.forEach(fn => fn()); return result; };
  return { render, song, options, updates, emit: value => status(value), next: () => next };
}
test("catalog updates cannot replace the decoder duration or reset position", () => {
  const f = fixture(); const hook = f.render();
  hook.setNativeDuration(100); hook.setNativePosition(50);
  f.song.duration = 240; f.render();
  assert.equal(f.updates.at(-1).duration, 100000);
  assert.equal(hook.durationSecondsRef.current, 100);
});
test("Expo completion clears a seek override, finishes progress and advances only once", () => {
  const f = fixture(); const hook = f.render(); hook.setSeekOverride({ songId: f.song.id, seconds: 40, startedAt: Date.now() });
  const ended = { isPlaying: false, position: 50, duration: 100, didJustFinish: true };
  f.emit(ended); f.emit(ended);
  assert.equal(f.updates.at(-1).progress, 1);
  assert.equal(f.updates.at(-1).positionMillis, 100000);
  assert.equal(f.next(), 1);
});
test("invalid native timestamps cannot corrupt progress", () => {
  const f = fixture(); const hook = f.render(); hook.setNativeDuration(100); hook.setNativePosition(50);
  hook.setNativePosition(NaN); hook.setNativeDuration(Infinity);
  assert.equal(f.updates.at(-1).progress, 0.5);
});

test("seek override ends as soon as the decoder acknowledges the target", () => {
  const f = fixture(); const hook = f.render(); hook.setNativeDuration(188);
  hook.setSeekOverride({ songId: f.song.id, seconds: 90, startedAt: Date.now() });
  hook.setNativePosition(40);
  assert.equal(f.updates.at(-1).positionMillis, 90000);
  hook.setNativePosition(90); hook.setNativePosition(91);
  assert.equal(f.updates.at(-1).positionMillis, 91000);
});

test("YouTube stream timeline survives a decoder duration jump from 3:20 to 6:16", () => {
  const f = fixture(); f.song.duration = 200.373; f.song.playbackDurationSeconds = 200.373;
  const hook = f.render(); hook.setNativeDuration(200.373); hook.setNativePosition(50);
  hook.setNativeDuration(376);
  assert.equal(hook.durationSecondsRef.current, 200.373);
  assert.equal(f.updates.at(-1).duration, 200373);
  f.emit({ isPlaying: false, position: 376, duration: 376, didJustFinish: true });
  assert.equal(f.updates.at(-1).duration, 200373);
  assert.equal(f.updates.at(-1).positionMillis, 200373);
});

test("fresh Play at zero does not read an old saved position for the same song", async () => {
  let reads = 0;
  const f = fixture({ position: 0, persistedRead: async () => { reads++; return { currentSong: { id: "youtube_abcdefghijk" }, positionSeconds: 80 }; } });
  const hook = f.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
  assert.equal(hook.positionSecondsRef.current, 0);
});

test("startup progress restoration cannot overwrite a Play issued during its storage read", async () => {
  let complete;
  const f = fixture({ position: 0, requestId: 0, persistedRead: () => new Promise(resolve => { complete = resolve; }) });
  const hook = f.render();
  await new Promise(resolve => setImmediate(resolve));
  f.options.playRequestIdRef.current++;
  complete({ currentSong: f.song, positionSeconds: 80 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(hook.positionSecondsRef.current, 0);
});
