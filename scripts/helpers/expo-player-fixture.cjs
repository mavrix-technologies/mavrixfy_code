const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function fixture({ loaded = true, starts = true, fakeTimers = false, mode = async () => {} } = {}) {
  const players = [];
  const timers = new Map(); let timerId = 0;
  const module = { exports: {} };
  const expo = {
    setAudioModeAsync: mode,
    createAudioPlayer(source) {
      const listeners = new Set();
      const player = { source, isLoaded: loaded, calls: [],
        addListener(_, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; },
        emit(status) { for (const listener of [...listeners]) listener(status); },
        seekTo: async seconds => { player.calls.push(["seek", seconds]); },
        play: () => { player.calls.push(["play"]); if (starts) player.emit({ playing: true, isLoaded: true }); }, pause: () => player.calls.push(["pause"]),
        remove: () => player.calls.push(["remove"]),
        setActiveForLockScreen: (_, metadata) => { player.metadata = metadata; },
      };
      players.push(player); return player;
    },
  };
  const code = ts.transpileModule(fs.readFileSync("src/services/audio/ExpoAvAdapter.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    setTimeout: fakeTimers ? callback => { const id = ++timerId; timers.set(id, callback); return id; } : setTimeout,
    clearTimeout: fakeTimers ? id => timers.delete(id) : clearTimeout,
    require: name => { if (name === "expo-audio") return expo;
      if (name === "./audioTimeline") return require("./audio-timeline-fixture.cjs");
      if (name === "@/lib/logger") return { logger: { debug() {} } };
      throw new Error(name); } });
  return { ...module.exports, players, fireTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); } };
}

module.exports = { fixture };
