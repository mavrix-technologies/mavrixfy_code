const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const { fixture: audioFixture, tracks } = require('./helpers/audio-player-fixture.cjs');

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { module, exports: module.exports, require: name => {
    if (!(name in dependencies)) throw Error(`Unmocked dependency ${name}`);
    return dependencies[name];
  }, ...globals });
  return module.exports;
}

test('decorative consumers share one lifecycle listener and release it on unmount', () => {
  let nativeListener; let subscriptions = 0; let removals = 0; let notifications = 0;
  const AppState = { currentState: 'active', addEventListener: (_, listener) => {
    subscriptions++; nativeListener = listener; return { remove: () => removals++ };
  } };
  const activity = load('src/lib/appActivity.ts', { react: {}, 'react-native': { AppState } });
  const unsubscribe = Array.from({ length: 20 }, () => activity.subscribeAppActivity(() => notifications++));
  assert.equal(subscriptions, 1);
  AppState.currentState = 'background'; nativeListener('background');
  assert.equal(activity.getAppIsActive(), false);
  assert.equal(notifications, 20);
  nativeListener('inactive'); assert.equal(notifications, 20);
  AppState.currentState = 'active'; nativeListener('active');
  assert.equal(activity.getAppIsActive(), true);
  unsubscribe.forEach(fn => fn()); assert.equal(removals, 1);
  AppState.currentState = 'background';
  const stop = activity.subscribeAppActivity(() => {});
  assert.equal(activity.getAppIsActive(), false);
  stop(); assert.equal(removals, 2);
});

test('collapsed/background player creates no full player UI; expanding/restoring recreates it', () => {
  const react = {
    memo: fn => fn, useEffect() {}, useCallback: fn => fn,
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  let foreground = true;
  const ui = { current: 'mini' };
  const dependencies = {
    react,
    '@/lib/appActivity': { useAppIsActive: () => foreground },
    '@/constants/platform': { IS_ANDROID: false },
    '@/lib/playerUIState': { playerUIStateStore: ui },
    '@/services/audio/PlaybackEngine': { usePlaybackNowPlaying: () => ({ currentSong: { id: 'song' }, queue: [], queueIndex: 0 }) },
    '@/lib/nativeAnimated': { createAnimatedComponent: () => 'AnimatedScrollView' },
    'react-native': { useWindowDimensions: () => ({ height: 800 }), StyleSheet: { absoluteFillObject: {} } },
    'react-native-reanimated': { View: 'AnimatedView', useSharedValue: value => ({ value }), useAnimatedStyle: fn => fn() },
    'react-native-gesture-handler': { Gesture: { Pan: () => {
      const gesture = {};
      for (const method of ['activeOffsetY', 'failOffsetY', 'failOffsetX', 'onUpdate', 'onEnd']) gesture[method] = () => gesture;
      return gesture;
    } }, GestureDetector: 'GestureDetector' },
    '../styles/playerScreenStyles': { styles: {} },
  };
  for (const name of ['@/components/FullscreenKaraokeModal', '@/services/audio/playbackProgressStore', '@/utils/navigation',
    'expo-linear-gradient', 'react-native-worklets', '../components/PlayerAmbientBackdrop', '../components/PlayerArtworkCarousel',
    '../components/PlayerArtworkViews', '../components/PlayerBottomDetailsSection', '../components/PlayerControlsSection',
    '../components/PlayerDiscoverySections', '../components/PlayerEmptyState', '../components/PlayerStickyHeader',
    '../hooks/useLegacyPlayerViewState']) dependencies[name] = {};
  const { PlayerScreen } = load('src/features/player/screens/PlayerScreen.tsx', dependencies);
  assert.equal(PlayerScreen(), null);
  ui.current = 'expanded';
  const expanded = PlayerScreen();
  const containsDetails = node => Boolean(node && (node.type?.name === 'LegacyPlayerScreenView' || node.children?.some(containsDetails)));
  assert.ok(containsDetails(expanded));
  foreground = false; assert.equal(PlayerScreen(), null);
  foreground = true; assert.ok(containsDetails(PlayerScreen()));
  ui.current = 'mini'; assert.equal(PlayerScreen(), null);
});

test('playing equalizer bars stop their repeat loops when the app backgrounds', () => {
  let foreground = true; let repeats = 0; let cancelled = 0; const cleanup = [];
  const react = {
    memo: fn => fn,
    useEffect: fn => { const stop = fn(); if (stop) cleanup.push(stop); },
    createElement: (type, props, ...children) => typeof type === 'function' ? type(props) : { type, props, children },
  };
  const animation = {
    View: 'AnimatedView', useSharedValue: value => ({ value }), useAnimatedStyle: fn => fn(),
    cancelAnimation: () => cancelled++, withRepeat: () => { repeats++; return 1; },
    withSequence: () => 1, withTiming: value => value,
    Easing: { out: fn => fn, inOut: fn => fn, quad: () => {}, sin: () => {} },
  };
  const { default: Bars } = load('src/components/EqualizerBars.tsx', {
    react, 'react-native': { StyleSheet: { create: styles => styles } },
    'react-native-reanimated': animation, '@/constants/colors': { primary: 'accent' },
    '@/lib/appActivity': { useAppIsActive: () => foreground },
  });
  Bars({ isPlaying: true }); assert.equal(repeats, 3);
  cleanup.splice(0).forEach(fn => fn()); foreground = false;
  Bars({ isPlaying: true }); assert.equal(repeats, 3); assert.ok(cancelled >= 6);
});

test('background progress keeps audio state current without notifying UI subscribers', () => {
  let foreground = true; let cleanup = () => {}; let notifications = 0;
  const store = load('src/services/audio/playbackProgressStore.ts', {
    '@/lib/appActivity': { useAppIsActive: () => foreground },
    react: { useSyncExternalStore: (subscribe, get) => {
      cleanup(); cleanup = subscribe(() => notifications++); return get();
    } },
  });
  store.usePlaybackProgressStore();
  store.updatePlaybackProgress({ positionMillis: 1000 }); assert.equal(notifications, 1);
  foreground = false; store.usePlaybackProgressStore();
  store.updatePlaybackProgress({ positionMillis: 2000 }); assert.equal(notifications, 1);
  assert.equal(store.getPlaybackProgressSnapshot().positionMillis, 2000);
  foreground = true; assert.equal(store.usePlaybackProgressStore().positionMillis, 2000);
  store.updatePlaybackProgress({ positionMillis: 3000 }); assert.equal(notifications, 2); cleanup();
});

test('a 10,000-song queue keeps mounted rows bounded and retains every scroll position', () => {
  const { getQueueWindow } = load('src/features/player/components/PlayerQueueList.tsx', {
    react: { memo: fn => fn }, 'react-native': {}, 'react-native-gesture-handler': {}, '../styles/playerScreenStyles': {},
  });
  for (const rowHeight of [48, 54]) {
    for (const viewport of [200, 400, 600]) {
      const visible = Math.ceil(viewport / rowHeight);
      for (const count of [0, 1, 8, 50, 10000]) {
        for (const offset of [0, 15, 300, count * rowHeight / 2, count * rowHeight + 100]) {
          const range = getQueueWindow(count, rowHeight, viewport, offset);
          assert.ok(range.start >= 0 && range.end <= count && range.start <= range.end);
          assert.ok(range.end - range.start <= visible * 4);
          assert.equal(range.top + (range.end - range.start) * rowHeight + range.bottom, count * rowHeight);
          if (count) {
            const first = Math.min(count - 1, Math.floor(offset / rowHeight));
            assert.ok(range.start <= first && range.end > first);
            assert.ok(range.end >= Math.min(count, first + visible));
          }
        }
      }
    }
  }
});

test('small-screen controls meet 48 dp and fit 320 dp portrait layouts', () => {
  const { PLAYER_SLIDER_TOUCH_HEIGHT } = load('src/lib/sliderUtils.ts');
  assert.ok(PLAYER_SLIDER_TOUCH_HEIGHT >= 48);
  const { usePlayerLayoutMetrics } = load('src/features/player/hooks/usePlayerLayoutMetrics.ts', {
    '@/constants/platform': { IS_WEB: false }, react: { useMemo: fn => fn() },
  });
  for (const [width, height] of [[320, 568], [320, 800], [360, 640], [360, 800], [390, 844], [411, 915]]) {
    const metrics = usePlayerLayoutMetrics(width, height, { top: 24, bottom: 16 });
    assert.ok(metrics.controlButtonSize >= 48);
    assert.ok(metrics.prevNextButtonSize >= 48);
    assert.ok(metrics.songDetailActionSize >= 48);
    const controlsWidth = metrics.controlButtonSize * 2 + metrics.prevNextButtonSize * 2
      + metrics.playButtonSize + metrics.controlsRowGap * 4 + (metrics.isShortScreen ? 32 : 40);
    assert.ok(controlsWidth <= width, `${width}x${height}: controls need ${controlsWidth} dp`);
  }
});

function fakeClock() {
  let now = 0; let id = 0; const jobs = new Map();
  const schedule = (fn, delay, period) => { jobs.set(++id, { fn, time: now + delay, period }); return id; };
  return {
    setTimeout: (fn, delay) => schedule(fn, delay, 0), clearTimeout: key => jobs.delete(key),
    setInterval: (fn, delay) => schedule(fn, delay, delay), clearInterval: key => jobs.delete(key),
    advance: milliseconds => {
      const end = now + milliseconds;
      while (true) {
        const next = [...jobs].sort((a, b) => a[1].time - b[1].time)[0];
        if (!next || next[1].time > end) break;
        const [key, job] = next; now = job.time;
        if (job.period) job.time += job.period; else jobs.delete(key);
        job.fn();
      }
      now = end;
    },
    pending: () => jobs.size,
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('video drift checks use live audio progress at most once per five seconds', async () => {
  const clock = fakeClock();
  const { startVideoProgressSync } = load('src/features/player/hooks/videoProgressSync.ts', {}, clock);
  let calls = 0; let audio = 20000; let video = 20; const seeks = [];
  const stop = startVideoProgressSync({
    getVideoSeconds: async () => { calls++; return video; }, getAudioMillis: () => audio,
    seek: seconds => seeks.push(seconds), onUnavailable: () => assert.fail('responsive player marked unavailable'),
  });
  await tick(); assert.equal(calls, 1); assert.deepEqual(seeks, []);
  audio = 28000; video = 22;
  clock.advance(4999); await tick(); assert.equal(calls, 1);
  clock.advance(1); await tick(); assert.equal(calls, 2); assert.deepEqual(seeks, [28]);
  stop(); clock.advance(60000); await tick(); assert.equal(calls, 2); assert.equal(clock.pending(), 0);
});

test('a stalled WebView stops polling and ignores late responses after timeout/unmount', async () => {
  const clock = fakeClock();
  const { startVideoProgressSync } = load('src/features/player/hooks/videoProgressSync.ts', {}, clock);
  let resolve; let calls = 0; let unavailable = 0; let seeks = 0;
  const stop = startVideoProgressSync({
    getVideoSeconds: () => { calls++; return new Promise(done => { resolve = done; }); },
    getAudioMillis: () => 40000, seek: () => seeks++, onUnavailable: () => unavailable++,
  });
  await tick(); clock.advance(60000); await tick();
  assert.equal(calls, 1); assert.equal(unavailable, 1); assert.equal(clock.pending(), 0);
  resolve(0); await tick(); assert.equal(seeks, 0); stop();
  const cleanClock = fakeClock();
  const sync = load('src/features/player/hooks/videoProgressSync.ts', {}, cleanClock);
  let late; const cancel = sync.startVideoProgressSync({
    getVideoSeconds: () => new Promise(done => { late = done; }), getAudioMillis: () => 50000,
    seek: () => assert.fail('unmounted player sought'), onUnavailable: () => assert.fail('unmounted player failed'),
  });
  await tick(); cancel(); cleanClock.advance(60000); late(0); await tick();
  assert.equal(cleanClock.pending(), 0);
});

test('paused, stopped, ended, and reset playback suspend native audio processing', async () => {
  const f = audioFixture();
  await f.StandardAudioPlayer.setQueue(tracks, 0);
  await f.StandardAudioPlayer.play();
  assert.equal(f.contextCalls.at(-1), 'resume');
  await f.StandardAudioPlayer.pause(); assert.equal(f.contextCalls.at(-1), 'suspend');
  await f.StandardAudioPlayer.play(); assert.equal(f.contextCalls.at(-1), 'resume');
  await f.StandardAudioPlayer.stop(); assert.equal(f.contextCalls.at(-1), 'suspend');
  await f.StandardAudioPlayer.play();
  await f.StandardAudioPlayer.finishQueue(); assert.equal(f.contextCalls.at(-1), 'suspend');
  await f.StandardAudioPlayer.reset(); assert.equal(f.contextCalls.at(-1), 'suspend');
});

test('late native suspension cannot silence a newer Play request', async () => {
  const f = audioFixture(); const player = f.StandardAudioPlayer;
  await player.setQueue(tracks, 0); await player.play();
  const props = f.StandardAudioRenderer().props;
  const context = props.context; let driver = 'running'; let finishSuspend;
  context.suspend = () => new Promise(resolve => { finishSuspend = () => { driver = 'suspended'; resolve(); }; });
  context.resume = async () => { driver = 'running'; };
  const pause = player.pause();
  await player.play(); props.onPlaying();
  finishSuspend(); await pause;
  assert.equal(driver, 'running');
  assert.equal((await player.getPlaybackState()).state, f.State.Playing);
});

test('late native resume after Pause is suspended again', async () => {
  const f = audioFixture(); const player = f.StandardAudioPlayer;
  await player.setQueue(tracks, 0);
  const context = f.StandardAudioRenderer().props.context;
  let driver = 'suspended'; let finishResume;
  context.resume = () => new Promise(resolve => { finishResume = () => { driver = 'running'; resolve(); }; });
  context.suspend = async () => { driver = 'suspended'; };
  const play = player.play(); await player.pause();
  finishResume(); await play;
  assert.equal(driver, 'suspended');
  assert.equal((await player.getPlaybackState()).state, f.State.Paused);
});
