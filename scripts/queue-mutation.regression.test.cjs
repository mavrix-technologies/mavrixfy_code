const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function fixture() {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const calls = [];
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync("src/services/audio/audioNativeQueueLane.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name.endsWith("YouTubeMusic")) return { isYouTubeSong: song => song.source === "youtube" || song.id?.startsWith("youtube_") };
      if (name === "react")
        return {
          useRef: (value) => ({ current: value }),
          useCallback: (fn) => fn,
        };
      if (name.endsWith("PlayerPlaybackResolver"))
        return {
          readAudioCandidate: (url) => url,
          songToTrack: (song, url) => ({ ...song, url }),
        };
      throw new Error(name);
    },
  });
  const desiredPlayStateRef = { current: true };
  const currentSongRef = { current: { id: "a" } };
  const lane = module.exports.useAudioNativeQueueLane({
    TrackPlayer: {
      setQueue: async () => {
        calls.push("queue");
      },
      play: async () => {
        calls.push("play");
      },
      pause: async () => {
        calls.push("pause");
      },
    },
    RepeatMode: null,
    isPlayerReady: true,
    repeatModeRef: { current: "off" },
    streamUrlCache: { current: new Map() },
    resolvePlaybackUrlCached: () => pending,
    desiredPlayStateRef,
    currentSongRef,
  });
  return { lane, resolve, calls, desiredPlayStateRef, currentSongRef };
}

test("pause wins while queue URLs are resolving", async () => {
  const f = fixture();
  const pending = f.lane.replaceNativeQueuePreservingState([{ id: "a" }], 0, {
    wasPlaying: true,
  });
  f.desiredPlayStateRef.current = false;
  f.resolve("https://example.com/a.mp3");
  await pending;
  assert.deepEqual(f.calls, ["queue", "pause"]);
});

test("a resolved queue edit cannot replace a newly selected song", async () => {
  const f = fixture();
  const pending = f.lane.replaceNativeQueuePreservingState([{ id: "a" }], 0);
  f.currentSongRef.current = { id: "b" };
  f.resolve("https://example.com/a.mp3");
  await pending;
  assert.deepEqual(f.calls, []);
});
