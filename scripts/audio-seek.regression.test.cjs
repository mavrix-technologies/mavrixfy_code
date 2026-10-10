const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function fixture({ native = false, fails = false, pendingProgress } = {}) {
  const targets = [], overrides = [], positions = [], notices = [];
  const song = { id: "youtube_abcdefghijk", duration: 376 };
  const options = { currentSongRef: { current: song }, durationSecondsRef: { current: 376 }, State: {},
    playRequestIdRef: { current: 0 },
    isPlayerReady: native, canUseLightweightAudioFallback: !native,
    setSeekOverride: value => overrides.push(value), setNativePosition: value => positions.push(value),
    showPlaybackNotice: value => notices.push(value) };
  const engine = { getProgress: () => pendingProgress || { duration: 200.373, position: 30 },
    seekTo: async seconds => { targets.push(seconds); if (fails) throw new Error("Seek rejected"); } };
  options.TrackPlayer = native ? { ...engine, getProgress: async () => engine.getProgress() } : null;
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/services/audio/audioPlaybackCommands.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === "react") return { useCallback: fn => fn, useEffect() {} };
    if (name.includes("ExpoAvAdapter")) return engine;
    if (name.includes("timeFormatters")) return { toDurationSeconds: Number };
    if (name === "./audioTimeline") return require("./helpers/audio-timeline-fixture.cjs");
    return {};
  } });
  return { ...module.exports.useAudioPlaybackCommands(options), options, targets, overrides, positions, notices };
}

test("Expo slider uses current media duration instead of a 6:16 catalog ceiling", async () => {
  const f = fixture(); await f.seekTo(0.5);
  assert.equal(f.targets[0], 100.1865);
  assert.equal(f.options.durationSecondsRef.current, 200.373);
  assert.equal(f.overrides.at(-1).seconds, 100.1865);
});

test("native slider clamps against engine duration and restores position on failure", async () => {
  const f = fixture({ native: true, fails: true }); await f.seekTo(2);
  assert.equal(f.targets[0], 200.373);
  assert.equal(f.overrides.at(-1), null);
  assert.equal(f.positions.at(-1), 30);
  assert.equal(f.notices.length, 1);
});

test("late native progress cannot seek a newly selected song", async () => {
  let resolve;
  const f = fixture({ native: true, pendingProgress: new Promise(done => { resolve = done; }) });
  const pending = f.seekTo(0.5);
  f.options.currentSongRef.current = { id: "youtube_lmnopqrstuv", duration: 100 };
  resolve({ duration: 200, position: 30 }); await pending;
  assert.equal(f.targets.length, 0);
});

test("late seek progress cannot seek a newer playback request for the same song", async () => {
  let resolve;
  const f = fixture({ native: true, pendingProgress: new Promise(done => { resolve = done; }) });
  const pending = f.seekTo(0.5);
  f.options.playRequestIdRef.current++;
  resolve({ duration: 200, position: 30 }); await pending;
  assert.equal(f.targets.length, 0);
});
