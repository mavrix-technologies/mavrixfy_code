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
  }).outputText, { module, exports: module.exports, require: function resolveTestDependency(name) { if (name.startsWith("@expo/vector-icons/")) return { __esModule: true, default: resolveTestDependency("@expo/vector-icons")[name.split("/").pop()] };

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
  assert.equal(activity.getAppIsBackgrounded(), true);
  nativeListener('inactive'); assert.equal(notifications, 40);
  assert.equal(activity.getAppIsBackgrounded(), false, 'inactive system overlays are not a backgrounded app');
  assert.equal(activity.getAppIsActive(), false);
  AppState.currentState = 'active'; nativeListener('active');
  assert.equal(activity.getAppIsActive(), true);
  unsubscribe.forEach(fn => fn()); assert.equal(removals, 1);
  AppState.currentState = 'background';
  const stop = activity.subscribeAppActivity(() => {});
  assert.equal(activity.getAppIsActive(), false);
  stop(); assert.equal(removals, 2);
});

test('shared player sheet closes once and retains its presentation through background and StandBy', () => {
  let foreground = true, focused = true, standbyEnabled = false, viewport = null;
  const closedSheets = [], played = [], focusEffects = [], closed = [], backHandlers = [];
  const refs = [];
  let refIndex = 0, stateIndex = 0, playerViewport = null, dirty = false;
  const ui = { current: 'mini', expandPlayer: () => { ui.current = 'expanded'; }, collapsePlayer: () => { ui.current = 'mini'; } };
  const react = {
    memo: fn => fn, useEffect: fn => fn(), useCallback: fn => fn, useMemo: fn => fn(), useRef: value => refs[refIndex++] ??= { current: value }, useState: initial => {
      const slot = stateIndex++;
      if (slot === 0) {
        if (viewport === null) viewport = typeof initial === 'function' ? initial() : initial;
        return [viewport, next => { viewport = typeof next === "function" ? next(viewport) : next; }];
      }
      if (playerViewport === null) playerViewport = initial;
      return [playerViewport, next => { playerViewport = typeof next === "function" ? next(playerViewport) : next; dirty = true; }];
    },
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const dependencies = {
    react,
    '@/lib/appActivity': { useAppIsActive: () => foreground, useAppIsBackgrounded: () => !foreground },
    '@/constants/platform': { IS_IOS: true },
    '@/lib/playerUIState': { playerUIStateStore: ui },
    'expo-router': { useIsFocused: () => focused, useFocusEffect: fn => focusEffects.push(fn), useNavigation: () => ({ canGoBack: () => true, goBack: () => closed.push('route-back') }) },
    '@/lib/queueRef': { globalQueueSheetRef: { current: { collapse: () => closedSheets.push('queue') } } },
    '@/lib/addSongsSheetRef': { globalAddSongsSheetRef: { current: { collapse: () => closedSheets.push('add-songs') } } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-keep-awake': { useKeepAwake() {} },
    '@/services/audio/PlaybackEngine': {
      usePlaybackNowPlaying: () => ({ currentSong: { id: 'song' }, queue: [], queueIndex: 0 }),
      usePlaybackPlayState: () => ({ isPlaying: false }),
    },
    '@/contexts/PlayerContextDefs': { usePlayerActions: () => ({
      isLiked: () => false, playSong: (song, queue) => played.push({ song, queue }),
    }) },
    '@/lib/colorExtractor': { useArtworkPalette: () => ({ accent: '#fff', background: '#000' }), getArtworkAmbientGradientStops: () => ['rgba(25,80,130,0.42)', '#000'] },
    'react-native': { View: 'View', useWindowDimensions: () => ({ width: 390, height: 844 }), BackHandler: { addEventListener: (_name, handler) => { backHandlers.push(handler); return { remove() {} }; } } },
    '@gorhom/bottom-sheet': { __esModule: true, default: 'BottomSheet' },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureHandlerRootView' },
    'react-native-reanimated': {},
    '../styles/playerScreenStyles': { styles: { container: { flex: 1 } } },
    '../components/StandByOverlay': { StandByOverlay: 'StandByOverlay' },
    '../hooks/useStandByMode': { useStandByMode: () => ({
      isStandByActive: standbyEnabled && focused && foreground,
      enterStandBy: () => { standbyEnabled = true; },
      exitStandBy: () => { standbyEnabled = false; },
    }) },
  };
  for (const name of ['@/components/FullscreenKaraokeModal', '@/services/audio/playbackProgressStore',
    'react-native-worklets', '../components/PlayerAmbientBackdrop', '../components/PlayerTrackCarousel',
    '../components/PlayerBottomDetailsSection', '../components/PlayerControlsSection',
    '../components/PlayerEmptyState', '../components/PlayerStickyHeader', '../hooks/useLegacyPlayerViewState']) dependencies[name] = {};
  const { PlayerScreen } = load('src/features/player/screens/PlayerScreen.tsx', dependencies);
  const render = () => { let tree; do { dirty = false; refIndex = 0; stateIndex = 0; tree = PlayerScreen(); } while (dirty); return tree; };
  const content = node => node?.type?.name === 'LegacyPlayerScreenView' ? node : node?.children?.map(content).find(Boolean);
  const find = (node, type) => node?.type === type ? node : node?.children?.map(child => find(child, type)).find(Boolean);
  const initial = render();
  assert.equal(content(initial).props.viewport.height, 844, 'player content exists on the first render, before sheet animation starts');
  assert.equal(find(initial, 'View').props.onLayout, undefined, 'scroll content must never be measured as the screen viewport');
  assert.equal(find(initial, 'View').props.style.height, 844, 'sheet content is bounded by the route, not its scrollable children');
  find(initial, 'GestureHandlerRootView').props.onLayout({ nativeEvent: { layout: { width: 390, height: 740 } } });
  const first = render();
  assert.equal(content(first).props.viewport.width, 390);
  assert.equal(content(first).props.viewport.height, 740, 'layout uses the outer route height, independent of sheet animation and scroll content');
  assert.equal(find(first, 'View').props.style.height, 740);
  const saved = viewport;
  find(first, 'GestureHandlerRootView').props.onLayout({ nativeEvent: { layout: { width: 390, height: 740 } } });
  assert.equal(viewport, saved, 'unchanged layout does not trigger a state update');
  find(first, 'GestureHandlerRootView').props.onLayout({ nativeEvent: { layout: { width: 0, height: 0 } } });
  assert.equal(viewport, saved, 'temporary empty layouts cannot collapse player content');
  find(first, 'GestureHandlerRootView').props.onLayout({ nativeEvent: { layout: { width: 844, height: 390 } } });
  const rotated = render();
  assert.equal(content(rotated).props.viewport.height, 390, 'rotation uses the new visible viewport');
  assert.equal(find(rotated, 'View').props.style.width, 844);
  find(rotated, 'GestureHandlerRootView').props.onLayout({ nativeEvent: { layout: { width: 390, height: 740 } } });
  const leave = focusEffects.at(-1)();
  assert.equal(ui.current, 'expanded');
  const sheet = find(first, 'BottomSheet');
  assert.equal(content(first).props.interactionReady, true, 'controls stay usable during opening');
  assert.equal(sheet.props.snapPoints[0], '100%');
  assert.equal(sheet.props.backgroundStyle.backgroundColor, '#000000', 'translucent artwork colours must sit over an opaque sheet base');
  assert.equal(sheet.props.handleComponent, null, 'no grabber or separate safe-area handle height');
  sheet.props.ref.current = { forceClose: () => closed.push('sheet-close') };
  content(first).props.onClose();
  assert.deepEqual(closed, ['sheet-close'], 'header requests close without popping the route early');
  sheet.props.onClose(); sheet.props.onClose();
  assert.deepEqual(closed, ['sheet-close', 'route-back'], 'duplicate completion does not pop another route');
  const back = backHandlers.at(-1);
  assert.equal(back(), true);
  assert.equal(closed.at(-1), 'sheet-close', 'Android Back uses the same sheet animation');
  content(first).props.onEnterStandBy();
  const standby = render();
  assert.ok(content(standby), "player stays mounted beneath StandBy");
  assert.equal(content(standby).props.interactionReady, false);
  assert.ok(find(standby, 'BottomSheet'), 'StandBy keeps the sheet mounted');
  assert.equal(find(standby, 'BottomSheet').props.enableContentPanningGesture, undefined, 'gesture host type stays stable underneath StandBy');
  assert.deepEqual(closedSheets, ['queue', 'add-songs']);
  find(standby, 'GestureHandlerRootView').props.onLayout({ nativeEvent: { layout: { width: 844, height: 390 } } });
  const landscapeStandby = render();
  assert.equal(content(landscapeStandby).props.viewport.width, 390, 'hidden player does not resize its carousel during StandBy');
  assert.equal(find(landscapeStandby, 'StandByOverlay').props.rootViewport.width, 844);
  assert.equal(find(landscapeStandby, 'StatusBar').props.hidden, false, 'StandBy must not hide the system status bar');
  find(landscapeStandby, 'GestureHandlerRootView').props.onLayout({ nativeEvent: { layout: { width: 390, height: 740 } } });
  const overlay = find(standby, 'StandByOverlay');
  const song = { id: 'next' }; overlay.props.onPlayQueueSong(song);
  assert.equal(played[0].song, song);
  overlay.props.onExitStandBy();
  assert.ok(content(render()), 'StandBy Back restores the same route');
  assert.equal(find(render(), 'BottomSheet').props.enableContentPanningGesture, undefined);
  assert.equal(ui.current, 'expanded');
  foreground = false;
  assert.equal(content(render()), undefined);
  assert.ok(find(render(), 'BottomSheet'), 'backgrounding does not remount the sheet');
  foreground = true; assert.ok(content(render()));
  leave(); assert.equal(ui.current, 'mini');
});

test('opening keeps content geometry stable and header mode resists scroll jitter', () => {
  let stateUpdates = 0;
  const react = {
    memo: fn => fn, useCallback: fn => fn, useMemo: fn => fn(), useRef: value => ({ current: value }),
    useState: initial => [initial, () => stateUpdates++],
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const dependencies = {
    react, 'react-native': { View: 'View' },
    '@gorhom/bottom-sheet': { BottomSheetScrollView: 'Scroll' },
    'react-native-reanimated': { useSharedValue: value => ({ value, set(next) { this.value = next; } }) },
    '../styles/playerScreenStyles': { styles: {} },
    '../hooks/useLegacyPlayerViewState': { useLegacyPlayerViewState: () => {
      return { screenSong: { id: 'song' }, playbackState: { isPlaying: true }, artworkPalette: { accent: '#fff' },
        screenWidth: 390, screenHeight: 844, interactionReady: true };
    } },
    '../components/PlayerBottomDetailsSection': { PlayerBottomDetailsSection: 'Details' },
    '../components/PlayerControlsSection': { PlayerControlsSection: 'Controls' },
    '@/services/audio/playbackProgressStore': { getPlaybackProgressSnapshot: () => ({ positionMillis: 0 }) },
  };
  for (const name of ['@/components/FullscreenKaraokeModal', '@/lib/appActivity', '@/lib/playerUIState',
    'expo-router', '@/services/audio/PlaybackEngine', '@/contexts/PlayerContextDefs', '@/lib/colorExtractor',
    '@/lib/queueRef', '@/lib/addSongsSheetRef', 'react-native-safe-area-context', 'react-native-gesture-handler',
    'expo-status-bar', 'expo-keep-awake', '../components/PlayerAmbientBackdrop', '../components/PlayerTrackCarousel',
    '../components/PlayerEmptyState', '../components/PlayerStickyHeader', '../hooks/useStandByMode',
    '../components/StandByOverlay']) dependencies[name] = {};
  const { LegacyPlayerScreenView } = load('src/features/player/screens/PlayerScreen.tsx', dependencies, {}, '\nexport { LegacyPlayerScreenView };');
  const find = (node, type) => node?.type === type ? node : node?.children?.map(child => find(child, type)).find(Boolean);
  const opening = LegacyPlayerScreenView({ interactionReady: true, viewport: { width: 390, height: 844 } });
  assert.ok(find(opening, 'Controls'));
  assert.ok(find(opening, 'Details'), 'lyrics and discovery container exist from the initial render');
  const opened = LegacyPlayerScreenView({ interactionReady: true, viewport: { width: 390, height: 844 } });
  assert.ok(find(opened, 'Details'));
  const scroll = find(opening, 'Scroll').props.onScroll;
  for (const y of [0, 49, 51, 49, 51, 70, 79]) scroll({ nativeEvent: { contentOffset: { y } } });
  assert.equal(stateUpdates, 0, 'small scroll jitter does not flip the header');
  for (const y of [80, 90, 79, 70, 51, 49, 41]) scroll({ nativeEvent: { contentOffset: { y } } });
  assert.equal(stateUpdates, 1, 'sticky header stays active until scrolling back past the exit threshold');
  for (const y of [40, 39, 0]) scroll({ nativeEvent: { contentOffset: { y } } });
  assert.equal(stateUpdates, 2, 'scroll frames do not repeatedly schedule player rerenders');
});

test('slider starts at the current position and playback updates never override a live drag', () => {
  const shared = [], effects = [], cleanups = [], uiTasks = [], animations = [], handlers = {};
  let repeats = 0, cancellations = 0;
  let sharedIndex = 0;
  const react = {
    memo: fn => fn, useCallback: fn => fn, useMemo: fn => fn(), useRef: value => ({ current: value }),
    useEffect: fn => effects.push(fn),
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const pan = {};
  for (const name of ['enabled', 'minDistance', 'onTouchesDown', 'onBegin', 'onUpdate', 'onEnd', 'onTouchesUp', 'onFinalize']) {
    pan[name] = value => { handlers[name] = value; return pan; };
  }
  const { PlayerSlider } = load('src/components/PlayerSlider.tsx', {
    react,
    'react-native': { View: 'View', StyleSheet: { create: value => value } },
    'react-native-gesture-handler': { GestureDetector: 'GestureDetector', Gesture: { Pan: () => pan } },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'AnimatedView' }, Easing: { linear: 'linear' },
      useSharedValue: value => shared[sharedIndex++] ??= { value }, useAnimatedStyle: fn => fn(),
      withTiming: (value, config) => { animations.push({ value, config }); return value; },
      withRepeat: value => { repeats++; return value; }, cancelAnimation() { cancellations++; },
    },
    'react-native-worklets': { scheduleOnUI: (fn, ...args) => uiTasks.push(() => fn(...args)), scheduleOnRN() {} },
    '@/lib/sliderUtils': load('src/lib/sliderUtils.ts'),
  });
  const render = (value, extra = {}) => { sharedIndex = 0; return PlayerSlider({ value, minimumValue: 0, maximumValue: 1, ...extra }); };
  const flush = () => { effects.splice(0).forEach(fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); }); uiTasks.splice(0).forEach(fn => fn()); };
  render(0.63);
  assert.equal(shared[1].value, 0.63, 'opening must not flash an empty bar');
  flush();
  render(0.631234); flush();
  assert.equal(shared[1].value, 0.631234, 'native progress retains full precision');
  assert.equal(animations.at(-1).config.duration, 500);
  assert.equal(animations.at(-1).config.easing, 'linear');
  shared[0].value = 100;
  handlers.onTouchesDown({ allTouches: [{ x: 80 }] });
  animations.length = 0;
  render(0.64); flush();
  assert.equal(animations.some(animation => animation.value === 0.64), false, 'UI-thread drag ownership works even before JS receives sliding-start');
  assert.equal(shared[1].value, 0.8);
  handlers.onUpdate({ x: 85 });
  assert.equal(shared[1].value, 0.85, 'scrubbing follows the finger immediately');
  render(0.64, { bufferedValue: 0.91, isBuffering: true }); flush();
  assert.equal(shared[2].value, 0.91, 'loaded audio has its own layer without changing played position');
  assert.equal(shared[1].value, 0.85);
  assert.equal(repeats, 1);
  cleanups.forEach(fn => fn());
  assert.ok(cancellations > 0, 'loading animations release their loop on unmount');
  render(0.64, { bufferedValue: 0.91, isBuffering: false }); flush();
  assert.equal(shared[3].value, 1, 'normal playback restores a steady bar');
  assert.equal(repeats, 1, 'ready playback never starts a loading loop');
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

test('player header opens StandBy from the button immediately left of song options', () => {
  const react = { memo: fn => fn, useMemo: fn => fn(), createElement: (type, props, ...children) => ({ type, props, children }) };
  const { PlayerStickyHeader } = load('src/features/player/components/PlayerStickyHeader.tsx', {
    react,
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, Extrapolation: { CLAMP: 0 }, interpolate: () => 1, useAnimatedStyle: fn => fn() },
    'react-native': { View: 'View', Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: styles => styles, absoluteFillObject: {}, hairlineWidth: 1 } },
    '@/lib/colorExtractor': { getSolidHeaderColor: () => '#000' },
    '@/services/audio/playbackProgressStore': { usePlaybackProgressStore: () => ({ positionMillis: 0, duration: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/stringUtils': { unescapeHtml: value => value },
    'react-native-gesture-handler': { Pressable: 'Pressable' },
  });
  for (const isScrolled of [false, true]) {
    let opened = 0;
    const tree = PlayerStickyHeader({ topInset: 0, topBarHeight: 54, scrollY: { value: 0 }, isScrolled, isPlaying: false, onEnterStandBy: () => opened++ });
    const nodes = [];
    const visit = node => { if (node && typeof node === 'object') { nodes.push(node); node.children?.forEach(visit); } };
    visit(tree);
    const entry = nodes.find(node => node.props?.accessibilityLabel === 'Open StandBy');
    const options = nodes.find(node => node.props?.accessibilityLabel === 'Open song options');
    assert.ok(nodes.indexOf(entry) < nodes.indexOf(options));
    entry.props.onPress();
    assert.equal(opened, 1);
  }
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
