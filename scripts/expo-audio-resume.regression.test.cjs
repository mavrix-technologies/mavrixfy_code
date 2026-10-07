const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ loaded = true, mode = async () => {} } = {}) {
  const players = [];
  const module = { exports: {} };
  const expo = {
    setAudioModeAsync: mode,
    createAudioPlayer(source) {
      const listeners = new Set();
      const player = { source, isLoaded: loaded, calls: [],
        addListener(_, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; },
        emit(status) { for (const listener of [...listeners]) listener(status); },
        seekTo: async seconds => { player.calls.push(["seek", seconds]); },
        play: () => player.calls.push(["play"]), pause: () => player.calls.push(["pause"]),
        release: () => player.calls.push(["release"]),
        setActiveForLockScreen: (_, metadata) => { player.metadata = metadata; },
      };
      players.push(player); return player;
    },
  };
  const code = ts.transpileModule(fs.readFileSync("src/services/audio/ExpoAvAdapter.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout, clearTimeout,
    require: name => { if (name === "expo-audio") return expo; throw new Error(name); } });
  return { ...module.exports, players };
}

test("Expo resume retains YouTube headers and seeks before any playback", async () => {
  const f = fixture();
  await f.loadAndPlay("https://media.example/audio", { title: "Majboor", artist: "Artist",
    playbackHeaders: { "User-Agent": "client", Referer: "music" } }, () => true, 43);
  const p = f.players[0];
  assert.equal(p.source.headers.Referer, "music");
  assert.equal(p.metadata.title, "Majboor");
  assert.equal(JSON.stringify(p.calls), JSON.stringify([["seek", 43], ["play"]]));
  f.destroy();
});

test("Pause while Expo resume waits for loading wins over the delayed play", async () => {
  const f = fixture({ loaded: false }); let wantsPlay = true;
  const pending = f.loadAndPlay("https://media.example/audio", null, () => wantsPlay, 60);
  await tick();
  const p = f.players[0];
  assert.equal(p.calls.length, 0);
  wantsPlay = false;
  p.emit({ isLoaded: true }); await pending;
  assert.equal(JSON.stringify(p.calls), JSON.stringify([["seek", 60]]));
  f.destroy();
});

test("late ready status cannot seek or start an outgoing Expo source", async () => {
  const f = fixture({ loaded: false });
  const pending = f.loadAndPlay("https://media.example/old", null, () => true, 60);
  await tick(); const old = f.players[0];
  await f.loadAndPlay("https://media.example/new");
  old.emit({ isLoaded: true }); await pending;
  assert.equal(old.calls.some(([call]) => call === "seek" || call === "play"), false);
  assert.equal(f.players[1].calls[0][0], "play");
  f.destroy();
});

test("pending standby creation cannot survive destroy", async () => {
  let completeMode;
  const f = fixture({ mode: () => new Promise(resolve => { completeMode = resolve; }) });
  const pending = f.prepareStandby("https://media.example/next");
  f.destroy(); completeMode(); await pending;
  assert.equal(f.players.length, 0);
});

test("Expo completion reaches progress listeners even when the last status is paused", async () => {
  const f = fixture(); let received;
  f.onStatusUpdate(status => { received = status; });
  await f.loadAndPlay("https://media.example/audio");
  f.players[0].emit({ playing: false, currentTime: 153, duration: 153, didJustFinish: true, isLoaded: true });
  assert.equal(received.didJustFinish, true);
  assert.equal(received.position, 153);
  f.destroy();
});
