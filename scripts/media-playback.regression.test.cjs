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

test("remote handlers own commands and record intent before playback", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setupPlayer();
  await p.setQueue(tracks);
  await p.pause();
  let calls = 0;
  p.addEventListener(f.Event.RemotePlay, () => {
    calls++;
    void p.play();
  });
  f.controls.get("playbackNotificationPlay")({});
  await tick();
  assert.equal(calls, 1);
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Playing);
});
test("outgoing source callbacks cannot alter the next track", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const old = f.StandardAudioRenderer().props;
  await p.skip(1);
  old.onPositionChange(100);
  old.onEnded();
  old.onError({ message: "old failure" });
  old.onPlaying();
  assert.equal((await p.getActiveTrack()).id, "b");
  assert.equal((await p.getProgress()).position, 0);
  assert.equal((await p.getPlaybackState()).state, f.State.Loading);
});
test("pause during a delayed play wins", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const pending = p.play();
  await p.pause();
  await pending;
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});

test("play waits for preload instead of starting a second source load", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  let starts = 0;
  const handle = {
    play() {
      starts++;
    },
    pause() {},
    seekToTime() {},
  };
  props.ref(handle);
  await p.play();
  await p.play();
  assert.equal(starts, 0);
  props.onLoad();
  await tick();
  assert.equal(starts, 1);
});

test("a late playing callback stops its own old source and leaves the new song alone", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const old = f.StandardAudioRenderer().props;
  let oldPauses = 0;
  let newPauses = 0;
  old.ref({
    play() {},
    pause() {
      oldPauses++;
    },
    seekToTime() {},
  });
  await p.skip(1);
  const current = f.StandardAudioRenderer().props;
  current.ref({
    play() {},
    pause() {
      newPauses++;
    },
    seekToTime() {},
  });
  old.onPlaying();
  assert.equal(oldPauses, 2);
  assert.equal(newPauses, 0);
  assert.equal((await p.getActiveTrack()).id, "b");
});
test("progress updates reuse metadata instead of reloading artwork", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  await tick();
  const props = f.StandardAudioRenderer().props;
  props.onPositionChange(1);
  await tick();
  props.onPositionChange(2);
  await tick();
  const full = f.notifications.filter((info) => Object.hasOwn(info, "artwork"));
  assert.equal(full.length, 1);
  assert.equal(f.notifications.at(-1).elapsedTime, 2);
});

test("progress and pause keep the audio renderer snapshot stable", async () => {
  const f = fixture();
  await f.StandardAudioPlayer.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  const before = f.snapshots[0]();
  props.onPositionChange(12);
  await f.StandardAudioPlayer.pause();
  assert.equal(f.snapshots[0](), before);
  assert.equal((await f.StandardAudioPlayer.getProgress()).position, 12);
  await f.StandardAudioPlayer.skip(1);
  assert.notEqual(f.snapshots[0](), before);
});
test("queue edits preserve the active source and progress", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const props = f.StandardAudioRenderer().props;
  props.onPositionChange(25);
  await p.setQueue([tracks[1], tracks[0]], 1, 20, true);
  props.onPositionChange(26);
  assert.equal((await p.getActiveTrack()).id, "a");
  assert.equal((await p.getProgress()).position, 26);
});
test("seek rejects non-finite values and clamps to track duration", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.seekTo(999);
  assert.equal((await p.getProgress()).position, 180);
  await p.seekTo(NaN);
  assert.equal((await p.getProgress()).position, 180);
  await p.seekTo(-1);
  assert.equal((await p.getProgress()).position, 0);
});
test("interruption resumes only if the user has not paused", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setupPlayer();
  await p.setQueue(tracks);
  await p.play();
  f.system.get("interruption")({ type: "began", shouldResume: false });
  await p.pause();
  f.system.get("interruption")({ type: "ended", shouldResume: true });
  await tick();
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});
test("disconnecting headphones cancels automatic interruption resume", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setupPlayer();
  await p.setQueue(tracks);
  await p.play();
  f.system.get("interruption")({ type: "began", shouldResume: false });
  f.system.get("routeChange")({ reason: "OldDeviceUnavailable" });
  f.system.get("interruption")({ type: "ended", shouldResume: true });
  await tick();
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});
test("ending the queue preserves progress and emits one completion", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue([tracks[0]]);
  await p.play();
  let ended = 0;
  p.addEventListener(f.Event.PlaybackQueueEnded, () => ended++);
  const props = f.StandardAudioRenderer().props;
  props.onPositionChange(180);
  props.onEnded();
  await tick();
  assert.equal(ended, 1);
  assert.equal((await p.getProgress()).position, 180);
  assert.equal((await p.getPlaybackState()).state, f.State.Ended);
});

test("setup does not take audio focus before a song is played", async () => {
  const f = fixture();
  await f.StandardAudioPlayer.setupPlayer();
  assert.equal(f.focusRequests.length, 0);
  await f.StandardAudioPlayer.setQueue(tracks);
  await f.StandardAudioPlayer.play();
  assert.equal(f.focusRequests.at(-1), true);
  await f.StandardAudioPlayer.pause();
  assert.equal(f.focusRequests.at(-1), false);
});

test("a current source error stops playback intent and exposes error state", async () => {
  const f = fixture();
  await f.StandardAudioPlayer.setQueue(tracks);
  await f.StandardAudioPlayer.play();
  const props = f.StandardAudioRenderer().props;
  props.onError(new Error("stream failed"));
  assert.equal(
    (await f.StandardAudioPlayer.getPlaybackState()).state,
    f.State.Error,
  );
  assert.equal(f.focusRequests.at(-1), false);
  props.onPlaying();
  assert.equal(
    (await f.StandardAudioPlayer.getPlaybackState()).state,
    f.State.Error,
  );
});

test("paused song properly resumes when play is called even after handle re-render", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  let starts = 0;
  let pauses = 0;
  const initialHandle = {
    play() { starts++; },
    pause() { pauses++; },
    seekToTime() {},
  };
  props.ref(initialHandle);
  await p.play();
  props.onLoad();
  await tick();
  assert.equal(starts, 1);

  // User pauses song
  await p.pause();
  assert.equal(pauses, 1);
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);

  // React re-renders <Audio> creating a new handle object reference
  const reRenderedHandle = {
    play() { starts++; },
    pause() { pauses++; },
    seekToTime() {},
  };
  props.ref(reRenderedHandle);

  // User resumes playback
  await p.play();
  await tick();
  assert.equal(starts, 2, "playback should resume with re-rendered handle");
});

test("subsequent onLoad calls safely reuse sourceNode without error", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  let starts = 0;
  props.ref({
    play() { starts++; },
    pause() {},
    seekToTime() {},
  });
  await p.play();
  props.onLoad();
  await tick();
  assert.equal(starts, 1);

  // Second onLoad trigger (e.g. from buffer/seek)
  props.onLoad();
  await tick();
  assert.notEqual((await p.getPlaybackState()).state, f.State.Error);
});

