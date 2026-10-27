const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

test("prebuild retires the old car browser and leaves playback ownership to the native module", () => {
  let manifestMod;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync("plugins/withAndroidAuto.js", "utf8"), {
    module,
    __dirname: "plugins",
    require(name) {
      if (name === "@expo/config-plugins") return {
        withAndroidManifest(config, callback) { manifestMod = callback; return config; },
        withAppBuildGradle: (config) => config,
        withStringsXml: (config) => config,
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
  assert.equal(app.service.filter(service => service.$["android:name"] === "com.mavrixfy.app.MavrixfyMediaBrowserService").length, 0);
  assert.equal(app["meta-data"].length, 1);
});

test("car controls publish app state and ignore actions for an old track", async () => {
  const listeners = new Map();
  const effects = [];
  const published = [];
  const catalogs = [];
  const readiness = [];
  const plays = [];
  const acknowledgements = [];
  const calls = [];
  const native = {
    updateControls: (...args) => published.push(args),
    updateCatalog: (json) => catalogs.push(JSON.parse(json)),
    setReady: (ready) => readiness.push({ ready, listeners: listeners.size }),
    getSelection: async () => ({ queue: [
      { id: "public-a", title: "Public A", url: "https://media.example/a.mp4" },
      { id: "public-b", title: "Public B", url: "https://media.example/b.mp4", artwork: "https://media.example/b.jpg", source: "jiosaavn" },
    ], index: 1 }),
    completeSelection: async (...args) => acknowledgements.push(args),
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
      if (name === "./NativePlaybackPlayer") return { getNativeCarClient: () => ({ ...native, addListener(name, fn) { listeners.set(name, fn); return { remove() { listeners.delete(name); } }; } }) };
      if (name.endsWith("accountScope"))
        return { getAccountScope: () => ({ accountId: "user", generation: 0 }), isCurrentAccount: () => true };
      if (name.endsWith("logger")) return { logger: { warn() {} } };
      if (name.endsWith("/storage")) return {
        getSettings: async () => ({ streamingQuality: "low", dataSaverEnabled: true }),
        subscribeSettings: () => () => {},
      };
      if (name.endsWith("searchRepository"))
        return { searchRepository: async () => ({ songs: [] }) };
      if (name.endsWith("playerPersistenceService"))
        return {
          playerPersistenceService: { getRecentlyPlayed: async () => [] },
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const song = { id: "current", title: "Song", artist: "Artist", duration: 180, audioUrl: "https://media.example/song.mp4", playbackHeaders: { "X-Test": "value" } };
  module.exports.useAndroidAuto({
    queue: [song],
    currentSong: song,
    likedSongs: [song],
    isShuffled: true,
    repeatMode: "one",
    playSong: async (selected, queue) => plays.push({ selected, queue }),
    toggleShuffle: () => calls.push("shuffle"),
    toggleRepeat: () => calls.push("repeat"),
    toggleLike: async (selected) => calls.push(selected.id),
  });
  const cleanups = effects.map((fn) => fn());
  assert.deepEqual(published[0], ["current", true, "one", true]);
  assert.equal(catalogs[0].accountId, "user");
  assert.equal(catalogs[0].favorites[0].audioUrl, song.audioUrl);
  assert.equal(catalogs[0].favorites[0].duration, 180);
  assert.deepEqual(catalogs[0].favorites[0].headers, { "X-Test": "value" });
  assert.deepEqual(readiness[0], { ready: true, listeners: 3 });
  const dispatch = listeners.get("MavrixfyPlaybackAction");
  dispatch({ action: "like", id: "previous" });
  for (const action of ["shuffle", "repeat", "like"])
    dispatch({ action, id: "current" });
  await Promise.resolve();
  assert.deepEqual(calls, ["shuffle", "repeat", "current"]);
  listeners.get("MavrixfyPlayMediaId")({ id: "public-b", requestId: "native-browse" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(plays[0].selected.id, "public-b");
  assert.equal(plays[0].selected.audioUrl, "https://media.example/b.mp4");
  assert.equal(plays[0].selected.coverUrl, "https://media.example/b.jpg");
  assert.deepEqual(Array.from(plays[0].queue, song => song.id), ["public-a", "public-b"]);
  assert.deepEqual(acknowledgements.at(-1), ["native-browse", "public-b"]);
  cleanups.forEach((cleanup) => cleanup?.());
  assert.equal(listeners.size, 0);
  assert.deepEqual(readiness.at(-1), { ready: false, listeners: 3 });
  assert.deepEqual(published.at(-1), ["", false, "off", false]);
});

test("car cold-start configuration uses the production API when a developer has a private override", async () => {
  const { compileModsAsync } = require("@expo/config-plugins");
  const previous = process.env.EXPO_PUBLIC_APP_API_URL;
  process.env.EXPO_PUBLIC_APP_API_URL = "http://192.168.1.10:3000";
  try {
    const config = require("../plugins/withAndroidAuto")({
      name: "Car test", slug: "car-test", android: { package: "com.mavrixfy.app" },
      extra: { musicApiDomain: "music.example" },
    });
    const generated = await compileModsAsync(config, { projectRoot: process.cwd(), platforms: ["android"], introspect: true });
    const strings = generated._internal.modResults.android.strings.resources.string;
    const api = strings.filter(item => item.$.name === "mavrixfy_car_api_base_url");
    assert.equal(api.length, 1);
    assert.equal(api[0]._, "https://music.example");
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_API_URL;
    else process.env.EXPO_PUBLIC_APP_API_URL = previous;
  }
});
