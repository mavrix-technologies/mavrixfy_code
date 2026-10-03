const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
  const controls = new Map();
  const system = new Map();
  const notifications = [];
  const focusRequests = [];
  const snapshots = [];
  let mounted = false;
  const param = () => ({
    value: 0,
    cancelAndHoldAtTime() {},
    setTargetAtTime() {},
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    Q: param(),
    connect() {},
    disconnect() {},
  });
  const react = {
    memo: (component) => component,
    createElement: (type, props, ...children) =>
      typeof type === "function" && type.name === "StandardAudioSource"
        ? type(props)
        : { type, props: { ...props, children } },
    useRef: () => ({ current: null }),
    useSyncExternalStore: (_, get) => {
      snapshots.push(get);
      return get();
    },
    useEffect: (effect) => {
      if (!mounted) {
        mounted = true;
        effect();
      }
    },
  };
  const audio = {
    Audio: "Audio",
    AudioContext: class {
      currentTime = 0;
      sampleRate = 48000;
      destination = {};
      createGain = node;
      createBiquadFilter = node;
      createMediaElementSource = (mediaElement) => ({
        ...node(),
        mediaElement,
      });
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    },
    AudioManager: {
      setAudioSessionOptions() {},
      observeAudioInterruptions: (value) => focusRequests.push(value),
      addSystemEventListener: (name, fn) => system.set(name, fn),
    },
    PlaybackNotificationManager: {
      hide: async () => {},
      show: async (metadata) => notifications.push(metadata),
      enableControl: async () => {},
      addEventListener: (name, fn) => controls.set(name, fn),
    },
  };
  const filename = path.resolve("src/services/audio/StandardAudioPlayer.tsx");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "react") return react;
      if (name === "react-native") return { Platform: { OS: "android" } };
      if (name === "react-native-audio-api") return audio;
      if (name.endsWith("equalizerDsp"))
        return {
          calculateEqHeadroomDb: () => 0,
          EQ_FREQUENCIES_HZ: [60, 230, 910, 3600, 14000, 16000],
        };
      if (name.endsWith("audioEqualizer"))
        return { syncEqualizerWithNative() {} };
      if (name.endsWith("logger")) return { logger: { warn() {} } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const engine = module.exports;
  engine.StandardAudioRenderer();
  return {
    ...engine,
    controls,
    system,
    notifications,
    focusRequests,
    snapshots,
  };
}
const tracks = [
  {
    id: "a",
    url: "https://example.com/a.mp3",
    artwork: "https://example.com/a.jpg",
    duration: 180,
  },
  { id: "b", url: "https://example.com/b.mp3", duration: 200 },
];


module.exports = { fixture, tracks, tick };
