const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

test("prebuild keeps one car browser and the custom playback notification owner", () => {
  let manifestMod;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync("plugins/withAndroidAuto.js", "utf8"), {
    module,
    __dirname: "plugins",
    require(name) {
      if (name === "@expo/config-plugins") return {
        withAndroidManifest(config, callback) { manifestMod = callback; return config; },
        withAppBuildGradle: (config) => config,
        withMainApplication: (config) => config,
        withDangerousMod: (config) => config,
      };
      return require(name);
    },
  });
  module.exports({});
  const expoService = { $: {
    "android:name": "expo.modules.audio.service.AudioControlsService",
    "android:exported": "false",
    "android:foregroundServiceType": "mediaPlayback",
    "tools:replace": "android:foregroundServiceType",
  } };
  const mod = { modResults: { manifest: { $: {}, application: [{ service: [expoService] }] } } };
  manifestMod(mod);
  manifestMod(mod);
  const app = mod.modResults.manifest.application[0];
  assert.equal(expoService.$["android:enabled"], "false");
  assert.equal(expoService.$["android:foregroundServiceType"], "mediaPlayback");
  assert.equal(expoService.$["tools:replace"], "android:foregroundServiceType,android:enabled");
  assert.equal(app.service.filter(service => service.$["android:name"] === "com.mavrixfy.app.MavrixfyMediaBrowserService").length, 1);
  assert.equal(app["meta-data"].length, 1);
});

test("car controls publish app state and ignore actions for an old track", async () => {
  const listeners = new Map();
  const effects = [];
  const published = [];
  const calls = [];
  const native = {
    updateControls: (...args) => published.push(args),
    updateCatalog() {},
    reportError() {},
  };
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync("src/services/audio/useAndroidAuto.ts", "utf8"),
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
    AbortController,
    require(name) {
      if (name === "react")
        return {
          useRef: (value) => ({ current: value }),
          useEffect: (fn) => effects.push(fn),
        };
      if (name === "react-native")
        return {
          Platform: { OS: "android" },
          NativeModules: { MavrixfyMediaLibrary: native },
          NativeEventEmitter: class {
            addListener(name, fn) {
              listeners.set(name, fn);
              return {
                remove() {
                  listeners.delete(name);
                },
              };
            }
          },
        };
      if (name.endsWith("accountScope"))
        return { getAccountScope: () => "user", isCurrentAccount: () => true };
      if (name.endsWith("logger")) return { logger: { warn() {} } };
      if (name.endsWith("searchRepository"))
        return { searchRepository: async () => ({ songs: [] }) };
      if (name.endsWith("playerPersistenceService"))
        return {
          playerPersistenceService: { getRecentlyPlayed: async () => [] },
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const song = { id: "current", title: "Song" };
  module.exports.useAndroidAuto({
    queue: [song],
    currentSong: song,
    likedSongs: [song],
    isShuffled: true,
    repeatMode: "one",
    playSong() {},
    toggleShuffle: () => calls.push("shuffle"),
    toggleRepeat: () => calls.push("repeat"),
    toggleLike: async (selected) => calls.push(selected.id),
  });
  const cleanups = effects.map((fn) => fn());
  assert.deepEqual(published[0], ["current", true, "one", true]);
  const dispatch = listeners.get("MavrixfyPlaybackAction");
  dispatch({ action: "like", id: "previous" });
  for (const action of ["shuffle", "repeat", "like"])
    dispatch({ action, id: "current" });
  await Promise.resolve();
  assert.deepEqual(calls, ["shuffle", "repeat", "current"]);
  cleanups.forEach((cleanup) => cleanup?.());
  assert.equal(listeners.size, 0);
  assert.deepEqual(published.at(-1), ["", false, "off", false]);
});
