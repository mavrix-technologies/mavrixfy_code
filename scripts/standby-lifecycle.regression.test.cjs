const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports,
    require: name => {
      if (!(name in dependencies)) throw Error(`Unmocked dependency ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return module.exports;
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

function orientationFixture({ ios = false, web = false, lockAsync = async () => {} } = {}) {
  const calls = [];
  const OrientationLock = { LANDSCAPE: 5, LANDSCAPE_LEFT: 6, LANDSCAPE_RIGHT: 7, PORTRAIT_UP: 3 };
  const orientation = load('src/features/player/hooks/standByOrientation.ts', {
    'expo-screen-orientation': { OrientationLock, lockAsync: lock => {
      calls.push(lock);
      return lockAsync(lock);
    } },
    '@/constants/platform': { IS_IOS: ios, IS_WEB: web },
  });
  return { ...orientation, calls, OrientationLock };
}

function hookFixture({ web = false, storage = {}, impact = async () => {} } = {}) {
  const slots = []; const pendingEffects = []; const timers = new Map();
  const allTimers = new Map(); const orientation = [];
  let index = 0; let dirty = false; let unmounted = false; let lateUpdates = 0;
  let foreground = true, backgrounded = false; let dimensions = { width: 844, height: 390 };
  let props = { isPlayerExpanded: true }; let nextTimer = 1;
  const changed = (previous, next) => !previous || next.some((value, i) => !Object.is(value, previous[i]));
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => {
        if (unmounted) lateUpdates++;
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = index++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i];
        const next = { deps, cleanup: null };
        slots[i] = next;
        pendingEffects.push(() => { previous?.cleanup?.(); next.cleanup = fn(); });
      }
    },
  };
  const { useStandByMode } = load('src/features/player/hooks/useStandByMode.ts', {
    react,
    'react-native': { useWindowDimensions: () => dimensions },
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: { getItem: async () => null, setItem: async () => {}, ...storage },
    },
    '@/lib/haptics': { triggerImpact: impact },
    '@/lib/appActivity': { useAppIsActive: () => foreground, useAppIsBackgrounded: () => backgrounded },
    'expo-haptics': { ImpactFeedbackStyle: { Light: 'light' } },
    '@/constants/platform': { IS_WEB: web },
    './standByOrientation': { setStandByOrientation: enabled => {
      orientation.push(enabled); return Promise.resolve(true);
    } },
  }, {
    setTimeout: (fn, duration) => {
      const id = nextTimer++; const timer = { fn, duration };
      timers.set(id, timer); allTimers.set(id, timer); return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  function render(next = {}) {
    if (unmounted) throw Error('Cannot render an unmounted fixture');
    props = { ...props, ...next };
    let result; let passes = 0;
    do {
      if (++passes > 20) throw Error('Hook render did not settle');
      dirty = false; index = 0; result = useStandByMode(props);
      pendingEffects.splice(0).forEach(run => run());
    } while (dirty);
    return result;
  }
  return {
    render, orientation, timers, allTimers,
    setForeground: value => { foreground = value; backgrounded = !value; },
    setAppState: value => { foreground = value === 'active'; backgrounded = value === 'background'; },
    setDimensions: (width, height) => { dimensions = { width, height }; },
    fireTimer: id => { const timer = timers.get(id); timers.delete(id); timer.fn(); },
    unmount() { unmounted = true; slots.forEach(slot => slot?.cleanup?.()); },
    remount() { slots.length = 0; unmounted = false; return render(); },
    get lateUpdates() { return lateUpdates; },
  };
}

test('StandBy entry, style, rotation, exit and unmount leave the shared audio source playing', async () => {
  const { fixture, tracks } = require('./helpers/audio-player-fixture.cjs');
  const audio = fixture(); const player = audio.StandardAudioPlayer;
  await player.setQueue(tracks); await player.play();
  const source = audio.StandardAudioRenderer();
  const sourceVersion = audio.snapshots[0]().sourceVersion;
  source.props.onPlaying(); source.props.onPositionChange(45);
  const ui = hookFixture(); let state = ui.render();
  state.enterStandBy(); state = ui.render();
  state.selectStyle('ambient'); state = ui.render();
  ui.setDimensions(390, 844); state = ui.render();
  ui.setForeground(false); ui.render();
  ui.setForeground(true); state = ui.render();
  state.exitStandBy(); ui.render(); ui.unmount();
  assert.equal((await player.getPlaybackState()).state, audio.State.Playing);
  assert.equal((await player.getProgress()).position, 45);
  assert.equal(audio.snapshots[0]().sourceVersion, sourceVersion);
  assert.equal(audio.StandardAudioRenderer().props.source, source.props.source);
  await player.skipToNext();
  const next = audio.StandardAudioRenderer(); next.props.onPlaying();
  assert.equal(await player.getActiveTrackIndex(), 1);
  assert.equal((await player.getPlaybackState()).state, audio.State.Playing);
});

test('late landscape completion is followed by portrait restoration before cleanup settles', async () => {
  const opening = deferred();
  const f = orientationFixture({ lockAsync: lock => lock === 5 ? opening.promise : Promise.resolve() });
  const open = f.setStandByOrientation(true);
  await settle();
  const close = f.setStandByOrientation(false);
  assert.deepEqual(f.calls, [f.OrientationLock.LANDSCAPE]);
  opening.resolve();
  await Promise.all([open, close]);
  assert.deepEqual(f.calls, [f.OrientationLock.LANDSCAPE, f.OrientationLock.PORTRAIT_UP]);
});

test('rapid close and reopen skips obsolete queued portrait requests', async () => {
  const opening = deferred(); let attempts = 0;
  const f = orientationFixture({ lockAsync: () => ++attempts === 1 ? opening.promise : Promise.resolve() });
  const open = f.setStandByOrientation(true);
  await settle();
  const close = f.setStandByOrientation(false);
  const reopen = f.setStandByOrientation(true);
  opening.resolve();
  await Promise.all([open, close, reopen]);
  assert.deepEqual(f.calls, [f.OrientationLock.LANDSCAPE, f.OrientationLock.LANDSCAPE]);
});

test('iPhone and Android request landscape explicitly and failures do not block portrait restoration', async () => {
  const ios = orientationFixture({ ios: true });
  await ios.setStandByOrientation(true);
  assert.deepEqual(ios.calls, [ios.OrientationLock.LANDSCAPE]);
  const android = orientationFixture({ lockAsync: async lock => {
    if (lock !== 3) throw Error('Unavailable orientation policy');
  } });
  await android.setStandByOrientation(true);
  await android.setStandByOrientation(false);
  assert.deepEqual(android.calls, [5, 3]);
});

test('obsolete failed opening never unlocks the newer portrait request', async () => {
  const opening = deferred();
  const f = orientationFixture({ lockAsync: lock => lock === 5 ? opening.promise : Promise.resolve() });
  const open = f.setStandByOrientation(true);
  await settle();
  const close = f.setStandByOrientation(false);
  opening.reject(Error('Opening failed'));
  await Promise.all([open, close]);
  assert.deepEqual(f.calls, [5, 3]);
});

test('only explicit activation opens standby and closing/backgrounding releases rotation and dim timers', async () => {
  const f = hookFixture();
  let state = f.render();
  assert.equal(state.isStandByActive, false);
  assert.deepEqual(f.orientation, [false]);
  assert.equal(f.timers.size, 0);
  state.enterStandBy(); state = f.render();
  assert.equal(state.isStandByActive, true);
  assert.deepEqual(f.orientation, [false, true]);
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].duration, 5000);

  f.setDimensions(390, 844); state = f.render();
  assert.equal(state.isStandByActive, true, 'resize/rotation never deactivates explicit StandBy');
  assert.equal(f.timers.size, 1);
  f.setDimensions(844, 390); state = f.render();
  f.fireTimer([...f.timers.keys()][0]); state = f.render();
  assert.equal(state.controlsDimmed, true);

  f.setForeground(false); state = f.render();
  assert.equal(state.isStandByActive, false);
  assert.equal(state.controlsDimmed, false);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.orientation, [false, true, false]);
  state.handleTouch(); assert.equal(f.timers.size, 0);

  f.setForeground(true); state = f.render();
  assert.equal(state.isStandByActive, true);
  assert.equal(state.controlsDimmed, false);
  assert.deepEqual(f.orientation, [false, true, false, true]);
  state = f.render({ isPlayerExpanded: false });
  state.handleTouch();
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.orientation, [false, true, false, true, false]);
  state = f.render({ isPlayerExpanded: true });
  assert.equal(state.isStandByActive, false, 'reopening the player does not restore a closed StandBy session');
  await settle();
  f.unmount();
});

test('iOS Control Center and route-picker inactive states preserve StandBy orientation and panel visibility', async () => {
  const f = hookFixture(); let state = f.render();
  state.enterStandBy(); state = f.render();
  f.fireTimer([...f.timers.keys()][0]); state = f.render();
  assert.equal(state.controlsDimmed, true);
  const orientationCount = f.orientation.length;
  for (let attempt = 0; attempt < 20; attempt++) {
    f.setAppState('inactive'); state = f.render();
    assert.equal(state.isStandByActive, true);
    assert.equal(f.timers.size, 0);
    assert.equal(state.controlsDimmed, true, 'system overlays do not flash the dimmed artwork awake');
    f.setAppState('active'); state = f.render();
    assert.equal(state.isStandByActive, true); assert.equal(f.timers.size, 1);
  }
  assert.equal(f.orientation.length, orientationCount, 'no portrait/landscape requests on temporary inactivity');
  f.setAppState('inactive'); f.render();
  f.setAppState('background'); state = f.render();
  assert.equal(state.isStandByActive, false);
  assert.equal(f.orientation.at(-1), false, 'actual Home/background still restores portrait');
  f.unmount();
});

test('stale inactivity callbacks cannot dim renewed controls or update an unmounted player', async () => {
  const f = hookFixture();
  let state = f.render();
  state.enterStandBy(); state = f.render();
  const staleTimer = [...f.allTimers.values()][0].fn;
  state.handleTouch(); staleTimer(); state = f.render();
  assert.equal(state.controlsDimmed, false);
  const latestTimer = [...f.timers.values()][0].fn;
  await settle();
  f.unmount(); latestTimer();
  assert.equal(f.timers.size, 0);
  assert.equal(f.lateUpdates, 0);
  assert.deepEqual(f.orientation, [false, true, false]);
});

test('late saved preferences cannot overwrite a newer user toggle', async () => {
  const restored = deferred(); const writes = [];
  const f = hookFixture({ storage: {
    getItem: () => restored.promise,
    setItem: async (_, value) => writes.push(value),
  } });
  let state = f.render();
  await settle();
  state.selectStyle('night'); state = f.render();
  assert.equal(state.standByStyle, 'night');
  restored.resolve('false');
  await settle(); state = f.render();
  assert.equal(state.standByStyle, 'night');
  assert.deepEqual(writes, ['night']);
  f.unmount();
});

test('rapid style changes persist in order and a remounted player waits for the final save', async () => {
  const firstSave = deferred(); const writes = []; let saved = 'false'; let reads = 0;
  const storage = {
    getItem: async () => { reads++; return saved; },
    setItem: async (_, value) => {
      writes.push(value);
      if (writes.length === 1) await firstSave.promise;
      saved = value;
    },
  };
  const f = hookFixture({ storage });
  const state = f.render();
  await settle();
  state.selectStyle('night'); state.selectStyle('classic'); state.selectStyle('night');
  assert.equal(f.render().standByStyle, 'night');
  await settle(); assert.deepEqual(writes, ['night']);
  f.unmount();
  assert.equal(f.remount().standByStyle, 'classic');
  await settle(); assert.equal(reads, 1);
  firstSave.resolve(); await settle();
  assert.deepEqual(writes, ['night', 'classic', 'night']);
  assert.equal(saved, 'night'); assert.equal(reads, 2);
  assert.equal(f.render().standByStyle, 'night');
  f.unmount();
});

test('preference and haptic failures stay handled and restoration does not update after unmount', async () => {
  const restored = deferred();
  const f = hookFixture({
    storage: { getItem: () => restored.promise, setItem: async () => { throw Error('Storage unavailable'); } },
    impact: async () => { throw Error('Haptics unavailable'); },
  });
  const state = f.render(); await settle();
  state.selectStyle('night'); assert.equal(f.render().standByStyle, 'night');
  f.unmount(); restored.resolve('true'); await settle();
  assert.equal(f.lateUpdates, 0);

  const missingStorage = hookFixture({ storage: { getItem: async () => { throw Error('Storage unavailable'); } } });
  missingStorage.render(); await settle();
  assert.equal(missingStorage.render().standByStyle, 'classic'); missingStorage.unmount();
});

test('web layouts work without issuing native orientation requests', async () => {
  const f = orientationFixture({ web: true });
  await f.setStandByOrientation(true); await f.setStandByOrientation(false);
  assert.deepEqual(f.calls, []);
  const hook = hookFixture({ web: true });
  const initial = hook.render();
  assert.equal(initial.isStandByActive, false);
  initial.enterStandBy();
  assert.equal(hook.render().isStandByActive, true);
  assert.deepEqual(hook.orientation, []);
  await settle(); hook.unmount();
});

test('Ambient cancels dimming, ignores stale callbacks and never rearms an inactivity timer', async () => {
  const f = hookFixture();
  let state = f.render();
  state.enterStandBy(); state = f.render();
  const staleTimer = [...f.timers.values()][0].fn;
  f.fireTimer([...f.timers.keys()][0]);
  assert.equal(f.render().controlsDimmed, true);
  state.selectStyle('ambient'); state = f.render();
  assert.equal(state.standByStyle, 'ambient');
  assert.equal(state.controlsDimmed, false);
  assert.equal(f.timers.size, 0);
  staleTimer(); state.handleTouch();
  assert.equal(f.render().controlsDimmed, false);
  assert.equal(f.timers.size, 0);
  f.setForeground(false); f.render();
  f.setForeground(true); state = f.render();
  assert.equal(state.standByStyle, 'ambient');
  assert.equal(f.timers.size, 0);
  state.selectStyle('night'); state = f.render();
  assert.equal(state.controlsDimmed, false);
  assert.equal(f.timers.size, 1);
  await settle(); f.unmount();
});

test('saved styles migrate historical booleans and restore Ambient without dimming', async () => {
  for (const [saved, expected] of [['true', 'night'], ['false', 'classic'], ['night', 'night'], ['ambient', 'ambient'], ['invalid', 'classic']]) {
    const f = hookFixture({ storage: { getItem: async () => saved } });
    f.render().enterStandBy(); await settle();
    const state = f.render();
    assert.equal(state.standByStyle, expected);
    assert.equal(f.timers.size, expected === 'ambient' ? 0 : 1);
    f.unmount();
  }
});

test('rapid style selection persists once per change and late restoration cannot replace Ambient', async () => {
  const restored = deferred(); const writes = [];
  const f = hookFixture({ storage: { getItem: () => restored.promise, setItem: async (_, value) => writes.push(value) } });
  const state = f.render(); await settle();
  state.selectStyle('night'); state.selectStyle('classic'); state.selectStyle('ambient'); state.selectStyle('ambient');
  assert.equal(f.render().standByStyle, 'ambient');
  restored.resolve('true'); await settle();
  assert.deepEqual(writes, ['night', 'classic', 'ambient']);
  assert.equal(f.render().standByStyle, 'ambient');
  f.unmount();
});


test('exit restores portrait before revealing the player and re-entry cancels pending exit', async () => {
  const f = hookFixture();
  let state = f.render(); state.enterStandBy(); state = f.render();
  state.exitStandBy(); state = f.render();
  await settle(); state = f.render();
  assert.equal(state.isStandByActive, true, 'landscape overlay covers the player during restoration');
  assert.equal(f.orientation.at(-1), false);
  state.enterStandBy(); state = f.render();
  f.setDimensions(390, 844); state = f.render();
  assert.equal(state.isStandByActive, true, 're-entry cancels the previous exit');
  state.exitStandBy(); state = f.render();
  assert.equal(state.isStandByActive, false, 'portrait layout allows immediate exit');
  f.unmount();
});


test('portrait window events cannot reveal the player before its route layout is portrait', async () => {
  const f = hookFixture(); let state = f.render({viewport:{width:844,height:390}});
  state.enterStandBy(); state=f.render(); state.exitStandBy(); state=f.render();
  f.setDimensions(390,844); state=f.render();
  assert.equal(state.isStandByActive,true,'window event alone does not finish exit');
  state=f.render({viewport:{width:390,height:844}});
  assert.equal(state.isStandByActive,false,'native route measurement completes exit');
  f.unmount();
});
