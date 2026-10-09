const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ youtubeResolver = async () => { throw new Error("Unexpected YouTube resolution"); }, platform = "android", expoGo = false, notificationControl = async () => {}, streamingQuality = "medium", headroomDb = () => 0 } = {}) {
  const controls = new Map();
  const system = new Map();
  const notifications = [];
  const focusRequests = [];
  const snapshots = [];
  let rendererNotifications = 0;
  const contextCalls = [];
  const timers = new Map(); let timerId = 0;
  let mounted = false;
  let reportedDuration = 0;
  const qualityPreference = { current: streamingQuality };
  const graph = { filters: [], gains: [], sources: [], destination: { kind: "destination" } };
  const param = () => ({
    value: 0,
    cancelAndHoldAtTime() {},
    setTargetAtTime(value) { this.value = value; },
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    Q: param(),
    connections: new Set(),
    connect(target) { this.connections.add(target); },
    disconnect() { this.connections.clear(); },
  });
  const react = {
    memo: (component) => component,
    createElement: (type, props, ...children) =>
      typeof type === "function" && type.name === "StandardAudioSource"
        ? type(props)
        : { type, props: { ...props, children } },
    useRef: initial => ({ current: initial }),
    useSyncExternalStore: (subscribe, get) => {
      subscribe(() => rendererNotifications++);
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
    useAudioTagContext: () => ({ duration: reportedDuration }),
    AudioContext: class {
      currentTime = 0;
      sampleRate = 48000;
      destination = graph.destination;
      createGain = () => { const next = node(); next.gain.value = 1; graph.gains.push(next); return next; };
      createBiquadFilter = () => { const next = node(); graph.filters.push(next); return next; };
      createMediaElementSource = (mediaElement) => {
        const next = { ...node(), mediaElement }; graph.sources.push(next); return next;
      };
      resume() {
        contextCalls.push("resume");
        return Promise.resolve();
      }
      suspend() {
        contextCalls.push("suspend");
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
      enableControl: notificationControl,
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
  vm.runInNewContext(code + "\nmodule.exports.reportDurationForTest = AudioDurationReporter;", {
    module,
    exports: module.exports,
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    require(name) {
      if (name.endsWith("YouTubeMusic")) return { resolveYouTubeStream: youtubeResolver };
      if (name.endsWith("PlayerPlaybackResolver")) return { getRequestedQualityPreference: async () => ({ effective: qualityPreference.current }) };
      if (name.endsWith("audioTimeline")) return require("./audio-timeline-fixture.cjs");
      if (name === "react") return react;
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name === "expo") return { isRunningInExpoGo: () => expoGo };
      if (name === "./nativeAudioApi") return { nativeAudioApi: expoGo ? {} : audio };
      if (name === "react-native-audio-api") {
        if (expoGo) throw new Error("Expo Go must not evaluate the custom native audio module");
        return audio;
      }
      if (name.endsWith("equalizerDsp"))
        return {
          calculateEqHeadroomDb: headroomDb,
          EQ_FREQUENCIES_HZ: [25,40,63,100,160,250,400,630,1000,1600,2500,4000,6300,10000,16000], EQ_Q: Math.SQRT2,
        };
      if (name.endsWith("audioEqualizer"))
        return { syncEqualizerWithNative() {} };
      if (name.endsWith("logger")) return { logger: { warn() {}, error() {} } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const engine = module.exports;
  if (!expoGo) engine.StandardAudioRenderer();
  return {
    ...engine,
    graph,
    qualityPreference,
    contextCalls,
    controls,
    system,
    notifications,
    focusRequests,
    snapshots,
    rendererNotifications: () => rendererNotifications,
    reportDuration: duration => {
      reportedDuration = duration;
      mounted = false;
      engine.reportDurationForTest({ sourceVersion: snapshots[0]().sourceVersion });
    },
    fireTimers: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
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
