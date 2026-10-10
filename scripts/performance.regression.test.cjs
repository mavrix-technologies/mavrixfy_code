const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const { fixture: audioFixture, tracks } = require('./helpers/audio-player-fixture.cjs');

function load(file, dependencies = {}, globals = {}, extraSource = '') {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8') + extraSource, {
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
    memo: fn => fn, useEffect() {}, useCallback: fn => fn, useMemo: fn => fn(), useRef: value => ({ current: value }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  let foreground = true;
  const ui = { current: 'mini' };
  const dependencies = {
    react,
    '@/lib/appActivity': { useAppIsActive: () => foreground },
    '@/constants/platform': { IS_ANDROID: false },
    '@/lib/playerUIState': { playerUIStateStore: ui, usePlayerUIState: () => ui.current },
    '@/lib/queueRef': { globalQueueSheetRef: { current: null } },
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
    '../hooks/usePlayerSheetState': { usePlayerSheetState: () => ({
      visible: ui.current === 'expanded', interactionReady: false,
    }) },
    '@gorhom/bottom-sheet': { default: 'NativeBottomSheet' },
  };
  for (const name of ['@/components/FullscreenKaraokeModal', '@/services/audio/playbackProgressStore', '@/utils/navigation',
    'expo-linear-gradient', 'react-native-worklets', '../components/PlayerAmbientBackdrop', '../components/PlayerTrackCarousel',
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

test('a 10,000-song queue retains all rows with bounded native virtualization settings and exact scroll offsets', () => {
  const queue = Array.from({ length: 10000 }, (_, index) => ({ id: String(index) }));
  const react = {
    memo: fn => fn, useEffect() {}, useLayoutEffect() {}, useCallback: fn => fn, useMemo: fn => fn(),
    useRef: value => ({ current: value }), useState: value => [value, () => {}],
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const rowHeight = 60;
  const deps = {
    react, 'react-native': { Platform: { OS: 'ios' }, View: 'View', Text: 'Text' },
    '@expo/vector-icons': {}, '@gorhom/bottom-sheet': { BottomSheetView: 'BottomSheetView' },
    'expo-haptics': {}, 'expo-image': {}, 'react-native-draggable-flatlist': { __esModule: true, default: 'DraggableFlatList' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/contexts/PlayerContext': { usePlayerActions: () => ({}) },
    '@/services/audio/PlaybackEngine': {
      usePlaybackQueueState: () => ({ queue, currentSong: null, queueIndex: 0 }),
    },
    './styles/queueBottomSheetStyles': { QUEUE_ROW_HEIGHT: rowHeight, s: {} },
  };
  for (const name of ['@/components/AdMobBanner', '@/constants/colors', '@/lib/haptics', '@/lib/playerUIState',
    '@/services/audio/queueDrag', '@/features/player/components/QueueSleepTimer',
    '@/features/player/components/PlayerControlComponents']) deps[name] = {};
  // Expose the real content component only inside this VM fixture.
  const { QueueContent } = load('src/components/QueueBottomSheet.tsx', deps, {}, '\nexport { QueueContent };');
  const content = QueueContent({ interactionReady: false, onClose() {}, onReady() {} });
  const findList = node => node?.type === 'DraggableFlatList' ? node : node?.children?.map(findList).find(Boolean);
  const list = findList(content);
  assert.ok(list);
  assert.equal(list.props.data.length, queue.length);
  assert.ok(list.props.initialNumToRender <= 12);
  assert.ok(list.props.maxToRenderPerBatch <= 10);
  assert.ok(list.props.windowSize <= 7);
  for (const index of [0, 1, 50, 5000, 9999]) {
    const item = list.props.data[index];
    assert.equal(item.song, queue[index]);
    assert.equal(list.props.keyExtractor(item), item.key);
    const layout = list.props.getItemLayout(list.props.data, index);
    assert.equal(layout.index, index);
    assert.equal(layout.length, rowHeight);
    assert.equal(layout.offset, index * rowHeight);
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
