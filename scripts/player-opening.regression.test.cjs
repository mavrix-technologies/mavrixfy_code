const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, ...globals, require: name => {
    if (!(name in dependencies)) throw Error(name);
    return dependencies[name];
  } });
  return module.exports;
}
function navigationFixture() {
  const actions = [];
  return { ...load('src/lib/playerUIState.ts', { react: {}, 'expo-router': { router: { navigate: action => actions.push(action) } } }), actions };
}
test('opening uses the existing 55px mini row and 44px artwork without changing visibility before route focus', () => {
  const f = navigationFixture();
  f.expandPlayerFromMiniPlayer({ measureInWindow: cb => cb(0, 700, 390, 55) }, 'track', '#161616', 10);
  const origin = f.readMiniPlayerOrigin(f.actions[0].params.miniOrigin, 'track');
  assert.equal(origin.sheet.height, 55);
  assert.equal(origin.artwork.x, 10);
  assert.equal(origin.artwork.y, 5.5);
  assert.equal(origin.artwork.width, 44);
  assert.equal(f.playerUIStateStore.current, 'hidden');
  f.playerUIStateStore.expandPlayer(); f.playerUIStateStore.beginCollapse();
  assert.equal(f.playerUIStateStore.current, 'collapsing');
  f.playerUIStateStore.collapsePlayer();
  assert.equal(f.playerUIStateStore.current, 'mini');
});
test('deep links, invalid measurements, unrelated tracks and stale bounds fall back safely', () => {
  const f = navigationFixture();
  f.expandPlayer(); f.expandPlayerFromMiniPlayer(null, 'track', '#161616', 10);
  f.expandPlayerFromMiniPlayer({ measureInWindow: cb => cb(0, 0, 0, 0) }, 'track', '#161616', 10);
  assert.deepEqual(f.actions, ['/player', '/player', '/player']);
  for (const input of [undefined, 'bad-json', '{}', 'null']) assert.equal(f.readMiniPlayerOrigin(input, 'track'), null);
  f.expandPlayerFromMiniPlayer({ measureInWindow: cb => cb(0, 700, 390, 55) }, 'track', '#161616', 10);
  const source = JSON.parse(f.actions.at(-1).params.miniOrigin);
  assert.equal(f.readMiniPlayerOrigin(JSON.stringify(source), 'different-track'), null);
  assert.equal(f.readMiniPlayerOrigin(JSON.stringify({ ...source, capturedAt: Date.now() - 120000 }), 'track'), null);
});
const metrics = load('src/features/player/hooks/usePlayerLayoutMetrics.ts', {
  react: { useMemo: fn => fn() }, '@/constants/platform': { IS_WEB: false },
});
function frame({ entered, closing = false, moving = true, destinationArtworkReady = true, reducedMotion = false,
  artwork = { x: 24, y: 100, width: 342, height: 342 } } = {}) {
  const effects = [], callbacks = [], configs = [], frames = new Map(), timers = new Map(); let nextFrame = 0, nextTimer = 0;
  const states = [], refs = [], shared = [], deps = [], cleanups = [];
  let stateIndex = 0, refIndex = 0, sharedIndex = 0, effectIndex = 0;
  let dirty = false;
  const jsx = (type, props) => ({ type, props });
  const component = load('src/features/player/components/PlayerContainerTransition.tsx', {
    react: {
      useState: initial => {
        const slot = stateIndex++;
        if (!(slot in states)) states[slot] = slot === 0 && entered !== undefined ? entered : initial;
        return [states[slot], next => { if (states[slot] !== next) { states[slot] = next; dirty = true; } }];
      },
      useRef: initial => refs[refIndex++] ??= { current: initial },
      useMemo: fn => fn(),
      useEffect: (fn, nextDeps) => {
        const slot = effectIndex++;
        if (deps[slot] && nextDeps.every((value, i) => Object.is(value, deps[slot][i]))) return;
        deps[slot] = nextDeps;
        effects.push(() => { cleanups[slot]?.(); cleanups[slot] = fn(); });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', PixelRatio: { get: () => 2 }, StyleSheet: { absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, create: value => value } },
    'react-native-reanimated': { __esModule: true, default: { View: 'Animated.View' },
      Easing: { bezier: (...points) => points }, useAnimatedStyle: fn => ({ evaluate: fn }),
      useReducedMotion: () => reducedMotion, useSharedValue: initial => shared[sharedIndex++] ??= {
        current: initial, get() { return this.current; }, set(value) { this.current = value; },
      }, cancelAnimation: () => {},
      withDelay: (delay, value) => { configs.at(-1).delay = delay; return value; },
      withTiming: (value, config, callback) => { if (callback) callbacks.push(callback); configs.push(config); return value; } },
    'react-native-worklets': { scheduleOnRN: fn => fn(), scheduleOnUI: fn => fn() },
    '../hooks/usePlayerLayoutMetrics': metrics,
    '@/components/MusicArtwork': { MusicArtwork: 'Artwork' },
    '@/services/youtube/YouTubeArtwork': { artworkCandidates: uri => [uri], artworkPixelSize: size => size },
    '@/features/navigation/AppNavBar': { AppNavBar: 'OriginalAppNavBar' },
  }, { requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer; }, clearTimeout: id => timers.delete(id) });
  let opened = 0, closed = 0;
  let destinationVisibility = 0;
  const artworkVisibility = { get: () => destinationVisibility, set: value => { destinationVisibility = value; } };
  let props = { origin: {
    sheet: { x: 0, y: 700, width: 390, height: 55 }, artwork: { x: 10, y: 5.5, width: 44, height: 44 }, backgroundColor: '#161616',
  }, song: { coverUrl: 'cover' }, viewport: { width: 390, height: 854 }, routeOffset: { x: 0, y: 24 }, artwork,
  closing, moving, artworkVisibility, destinationArtworkReady,
  onOpenComplete: () => opened++, onCloseComplete: () => closed++, children: 'Original player content' };
  const flatten = node => Object.assign({}, ...node.props.style.filter(Boolean).map(style => style.evaluate ? style.evaluate() : style));
  const render = (updates = {}) => {
    props = { ...props, ...updates };
    let tree;
    do {
      dirty = false;
      stateIndex = refIndex = sharedIndex = effectIndex = 0;
      tree = component.PlayerContainerTransition(props);
      effects.splice(0).forEach(fn => fn());
    } while (dirty);
    const sheet = tree.props.children;
    const artNode = sheet.props.children[2];
    const art = artNode && flatten(artNode);
    const transform = art && Object.assign({}, ...art.transform);
    return { sheet: flatten(sheet), ui: flatten(sheet.props.children[0]),
      mini: sheet.props.children[1] && flatten(sheet.props.children[1]),
      contentProps: sheet.props.children[0].props,
      art: art && { ...art, width: art.width * transform.scaleX, height: art.height * transform.scaleY,
        left: transform.translateX, top: transform.translateY, borderRadius: art.borderRadius * transform.scaleX },
      image: artNode && artNode.props.children,
      content: sheet.props.children[0].props.children, miniContent: sheet.props.children[1]?.props?.children };
  };
  return { ...render(), render, destinationVisibility: () => destinationVisibility,
    effects, callbacks, configs, cleanups, frames, timers, opened: () => opened, closed: () => closed,
    flushFrames: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    fireTimer: delay => {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert(entry, `expected a ${delay}ms timer`);
      timers.delete(entry[0]); entry[1].fn();
    },
  };
}
test('the sheet morphs between measured endpoints, preserving original player content and its final layout', () => {
  const mini = frame(), full = frame({ entered: true }), close = frame({ entered: true, closing: true });
  assert.equal(mini.sheet.height, 55);
  assert.equal(mini.sheet.bottom, 123);
  assert.equal(mini.art.width, 44);
  assert.equal(mini.art.left, 10);
  assert.equal(full.sheet.height, 854);
  assert.equal(full.sheet.bottom, 0);
  assert.equal(full.sheet.borderTopLeftRadius, 24);
  assert.equal(full.art.width, 342);
  assert.equal(full.art.top, 100);
  assert.equal(full.art.borderRadius, 32);
  assert.equal(close.sheet.height, mini.sheet.height);
  assert.equal(close.art.width, mini.art.width);
  assert.equal(close.art.left, mini.art.left);
  for (const f of [mini, full, close]) {
    assert.equal(f.content, 'Original player content');
    assert.equal(f.ui.width, 390); assert.equal(f.ui.height, 854);
    assert.equal(f.miniContent.type, 'OriginalAppNavBar');
    assert.equal(f.miniContent.props.transitionPreview, true);
  }
  assert.equal(frame({ entered: true, moving: false }).art.opacity, 0, 'the normal carousel owns artwork after opening');
});
test('restored smooth motion keeps the reference easing, symmetric duration and staggered fades', () => {
  const open = frame({ entered: true }), close = frame({ entered: true, closing: true });
  assert.equal(open.configs.at(-1).duration, 520);
  assert.equal(close.configs.at(-1).duration, 520);
  assert.deepEqual(Array.from(open.configs.at(-1).easing), [0.22, 1, 0.36, 1]);
  assert.deepEqual(open.configs.map(config => config.duration), [320, 200, 280, 520]);
  assert.equal(open.configs[0].delay, 80);
  assert.equal(close.configs[0].delay, 0);
  assert.equal(close.ui.opacity, 0);
  assert.equal(close.mini.opacity, 1);
});
test('the transition image keeps the carousel request size before measurement and throughout both directions', () => {
  const waiting = frame({ artwork: null }), open = frame({ entered: true }), close = frame({ entered: true, closing: true });
  for (const f of [waiting, open, close]) {
    assert.equal(f.image.props.size, metrics.getPlayerArtworkSize(390, 854));
    assert.equal(f.image.props.allowDownscaling, false);
    assert.equal(f.image.props.uri, 'cover');
  }
});
test('an unfinished destination retains the overlay; a decoded destination is revealed before the overlay fades', () => {
  const waiting = frame({ entered: true, moving: false, destinationArtworkReady: false });
  assert.equal(waiting.art.opacity, 1);
  assert.equal(waiting.destinationVisibility(), 0);
  assert.equal(waiting.destinationVisibility(), 0, 'the animation watchdog does not reveal an undecoded image');
  const ready = frame({ entered: true, moving: false, destinationArtworkReady: true });
  assert.equal(ready.destinationVisibility(), 1);
  assert.equal(ready.art.opacity, 0);
  assert.equal(ready.configs.at(-1).duration, 80);
  const close = frame({ entered: true, closing: true });
  assert.equal(close.art.opacity, 1);
  assert.equal(close.destinationVisibility(), 0);
});
test('artwork coordinates use the visible scrolled card, independent of queue index and sheet translation', () => {
  const { getRelativeArtworkRect } = load('src/features/player/hooks/usePlayerArtworkMeasurement.ts', {
    react: {}, 'react-native': {}, 'react-native-reanimated': {}, 'react-native-worklets': {}, './usePlayerLayoutMetrics': metrics,
    '@/constants/platform': { IS_WEB: false },
  });
  for (const offsetY of [0, 600]) {
    for (const queueIndex of [0, 1, 8, 24]) {
      const container = { pageX: 10, pageY: 24 + offsetY, width: 390, height: 844 };
      // Local x is in FlatList content coordinates, before its scroll offset.
      const card = { x: 41 + queueIndex * 324, y: 0, pageX: 51, pageY: 204 + offsetY, width: 308, height: 308 };
      const rect = getRelativeArtworkRect(card, container, 308, 2);
      assert.deepEqual(JSON.parse(JSON.stringify(rect)), { x: 41, y: 180, width: 308, height: 308 });
    }
  }
  const container = { pageX: 0, pageY: 24, width: 390, height: 844 };
  const card = { pageX: 41, pageY: 204, width: 308, height: 308 };
  assert.equal(getRelativeArtworkRect({ ...card, pageX: 365 }, container, 308, 2), null, 'wait for initialScrollIndex');
  assert.equal(getRelativeArtworkRect({ ...card, width: 231, height: 231 }, container, 308, 2), null, 'ignore carousel scaling during alignment');
  assert.equal(getRelativeArtworkRect({ ...card, pageY: NaN }, container, 308, 2), null);
  assert.equal(getRelativeArtworkRect({ ...card, pageY: 374 }, container, 308, 2), null, 'reject mid-translation offset overlapping controls');
  assert.equal(getRelativeArtworkRect({ ...card, pageY: 50 }, container, 308, 2), null, 'reject card offset overlapping header');
});
test('opening waits for artwork layout; interrupted closing cannot remove the native route', () => {
  const waiting = frame({ artwork: null });
  assert.equal(waiting.frames.size, 0);
  assert.equal(waiting.timers.size, 1, 'slow layout gets a bounded fallback without guessed artwork coordinates');
  assert.equal(waiting.art.left, 10);
  assert.equal(waiting.art.top, 5.5);
  const f = frame({ entered: true, closing: true });
  assert.equal(f.closed(), 0);
  f.callbacks[0](false); assert.equal(f.closed(), 0);
  f.callbacks[0](true); assert.equal(f.closed(), 1);
  f.cleanups.forEach(cleanup => cleanup?.());
});

test('a queued successful completion cannot navigate after cleanup', () => {
  for (const closing of [false, true]) {
    const f = frame({ entered: true, closing });
    f.cleanups.forEach(cleanup => cleanup?.());
    f.callbacks[0](true);
    assert.equal(f.opened(), 0);
    assert.equal(f.closed(), 0);
  }
});

test('missing artwork bounds fall back to a usable full player and can still close', () => {
  const f = frame({ artwork: null });
  assert.equal(f.opened(), 0);
  f.fireTimer(400);
  const opened = f.render();
  assert.equal(opened.sheet.height, 854);
  assert.equal(opened.art, false, 'fallback never invents a destination for the shared image');
  assert.equal(f.destinationVisibility(), 1);
  f.callbacks.at(-1)(true);
  assert.equal(f.opened(), 1);
  f.render({ moving: false });
  f.render({ closing: true, moving: true });
  f.callbacks.at(-1)(true);
  assert.equal(f.closed(), 1);
  assert.equal(f.timers.size, 0);
});

test('a late valid layout takes the measured morph and cancels the layout fallback', () => {
  const f = frame({ artwork: null });
  f.render({ artwork: { x: 30, y: 110, width: 330, height: 330 } });
  f.flushFrames();
  const opened = f.render();
  assert.equal(opened.art.left, 30);
  assert.equal(opened.art.top, 110);
  assert.equal(opened.art.width, 330);
  assert.equal([...f.timers.values()].some(timer => timer.delay === 400), false);
  f.callbacks.at(-1)(true);
  assert.equal(f.timers.size, 0);
});

test('callback and layout changes cannot restart an in-flight morph or shift its image', () => {
  const f = frame({ entered: true });
  const initialAnimations = f.configs.length;
  let completed = 0;
  for (let i = 0; i < 20; i++) {
    const next = f.render({ onOpenComplete: () => completed++,
      artwork: { x: 80 + i, y: 140, width: 230, height: 230 } });
    assert.equal(next.art.left, 24);
    assert.equal(next.art.width, 342);
  }
  assert.equal(f.configs.length, initialAnimations);
  f.callbacks[0](true);
  assert.equal(completed, 1, 'the latest callback receives the original completion');
  assert.equal(f.timers.size, 0);
});

test('lost native completions settle opening and closing exactly once', () => {
  for (const closing of [false, true]) {
    const f = frame({ entered: true, closing });
    f.callbacks[0](false);
    assert.equal(f.opened() + f.closed(), 0);
    f.fireTimer(820);
    assert.equal(f.opened(), closing ? 0 : 1);
    assert.equal(f.closed(), closing ? 1 : 0);
    f.callbacks[0](true);
    assert.equal(f.opened() + f.closed(), 1, 'a delayed success cannot complete twice');
    assert.equal(f.timers.size, 0);
  }
});

test('rapid close during mounting or opening cancels stale completions and releases recovery timers', () => {
  for (let i = 0; i < 25; i++) {
    const f = frame({ artwork: i % 2 ? null : { x: 24, y: 100, width: 342, height: 342 } });
    if (i % 2 === 0) { f.flushFrames(); f.render(); }
    const oldCallbacks = [...f.callbacks];
    f.render({ closing: true });
    oldCallbacks.forEach(callback => callback(true));
    assert.equal(f.opened(), 0);
    f.fireTimer(820);
    assert.equal(f.closed(), 1);
    f.cleanups.forEach(cleanup => cleanup?.());
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 0);
  }
});

test('unmount cancels layout and completion recovery; reduced motion needs no shared image', () => {
  for (const entered of [false, true]) {
    const f = frame({ entered });
    const queuedTimers = [...f.timers.values()];
    f.cleanups.forEach(cleanup => cleanup?.());
    assert.equal(f.timers.size, 0);
    assert.equal(f.frames.size, 0);
    queuedTimers.forEach(timer => timer.fn());
    f.callbacks.forEach(callback => callback(true));
    assert.equal(f.opened() + f.closed(), 0);
  }
  const reduced = frame({ reducedMotion: true, artwork: null });
  assert.equal(reduced.sheet.height, 854);
  assert.equal(reduced.art, false);
  assert.equal(reduced.destinationVisibility(), 1);
  reduced.callbacks[0](true);
  assert.equal(reduced.opened(), 1);
});

function measurementFixture(web) {
  const refs = [], effects = [], frames = new Map(), commits = [], containerCallbacks = [], artCallbacks = [];
  let nextFrame = 0, value = null;
  const hook = load('src/features/player/hooks/usePlayerArtworkMeasurement.ts', {
    react: { useCallback: fn => fn, useRef: initial => ({ current: initial }),
      useState: initial => [initial, update => { value = typeof update === 'function' ? update(value) : update; }],
      useEffect: fn => effects.push(fn) },
    'react-native': { PixelRatio: { get: () => 2 } },
    'react-native-reanimated': { useAnimatedRef: () => { const ref = { current: null }; refs.push(ref); return ref; },
      measure: ref => ref.current.bounds },
    'react-native-worklets': { scheduleOnUI: fn => fn(), scheduleOnRN: (fn, ...args) => commits.push(() => fn(...args)) },
    './usePlayerLayoutMetrics': metrics, '@/constants/platform': { IS_WEB: web },
  }, { requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame: id => frames.delete(id) });
  const result = hook.usePlayerArtworkMeasurement({ width: 390, height: 854 });
  const size = metrics.getPlayerArtworkSize(390, 854);
  refs[0].current = { bounds: { pageX: 0, pageY: 24, width: 390, height: 854 }, measureInWindow: fn => containerCallbacks.push(fn) };
  refs[1].current = { bounds: { pageX: (390 - size) / 2, pageY: 124, width: size, height: size }, measureInWindow: fn => artCallbacks.push(fn) };
  const cleanups = effects.map(fn => fn());
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const respondWeb = (y) => {
    containerCallbacks.shift()(0, 24, 390, 854);
    artCallbacks.shift()((390 - size) / 2, 24 + y, size, size);
  };
  return { ...result, refs, frames, flushFrames, commits, respondWeb, value: () => value,
    cleanup: () => cleanups.forEach(fn => fn?.()) };
}

test('measurement requests coalesce and reject stale results from the UI runtime', () => {
  const f = measurementFixture(false);
  f.measureArtwork(); f.measureArtwork();
  assert.equal(f.frames.size, 1);
  f.flushFrames();
  assert.equal(f.commits.length, 1);
  f.measureArtwork(); f.flushFrames();
  f.commits.shift()();
  assert.equal(f.value(), null, 'older UI result cannot override a newer request');
  f.commits.shift()();
  assert.equal(f.value().y, 100);
  const previous = f.value();
  f.measureArtwork(); f.flushFrames(); f.commits.shift()();
  assert.equal(f.value(), previous, 'identical pixel-aligned bounds do not cause another render');
  f.measureArtwork(); f.flushFrames(); f.cleanup(); f.commits.shift()();
  assert.equal(f.value(), previous, 'unmounted hook ignores queued results');
});

test('delayed browser measurements cannot overwrite a more recent layout or survive unmount', () => {
  const f = measurementFixture(true);
  f.flushFrames();
  f.measureArtwork(); f.flushFrames();
  f.respondWeb(120);
  assert.equal(f.value(), null);
  f.respondWeb(100);
  assert.equal(f.value().y, 100);
  const previous = f.value();
  f.measureArtwork(); f.flushFrames(); f.cleanup(); f.respondWeb(140);
  assert.equal(f.value(), previous);
  assert.equal(f.frames.size, 0);
});

test('a mounting or off-center card is retried until its real bounds are available', () => {
  const f = measurementFixture(false);
  const target = f.refs[1].current;
  f.refs[1].current = null;
  f.flushFrames();
  assert.equal(f.frames.size, 1, 'retry after the native card attaches');
  f.refs[1].current = target;
  const centeredX = target.bounds.pageX;
  target.bounds.pageX += 2;
  f.flushFrames(); f.commits.shift()();
  assert.equal(f.value(), null, 'a near-center intermediate position is not a final target');
  assert.equal(f.frames.size, 1);
  target.bounds.pageX = centeredX;
  f.flushFrames(); f.commits.shift()();
  assert.equal(f.value().y, 100);
  assert.equal(f.frames.size, 0);
});

test('measurement retry is bounded and stops when superseded or unmounted', () => {
  const f = measurementFixture(false);
  f.refs[1].current = null;
  for (let i = 0; i < 12; i++) f.flushFrames();
  assert.equal(f.frames.size, 0);
  f.measureArtwork(); f.flushFrames();
  assert.equal(f.frames.size, 1);
  f.cleanup();
  assert.equal(f.frames.size, 0);
});

test('artwork measurement attaches outside the animated scale/parallax layer', () => {
  const jsx = (type, props) => ({ type, props });
  const interpolated = { interpolate: () => interpolated };
  const { PlayerTrackCarousel } = load('src/features/player/components/PlayerTrackCarousel.tsx', {
    react: { memo: fn => fn, useCallback: fn => fn, useEffect() {}, useState: fn => [fn()] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View' },
    'react-native-gesture-handler': { FlatList: 'List', Pressable: 'Pressable' },
    'react-native-reanimated': { __esModule: true, default: { View: 'ReanimatedView' }, useAnimatedStyle: fn => fn() },
    '@/lib/nativeAnimated': { Value: function () {}, createAnimatedComponent: value => value, add: () => interpolated, multiply: () => interpolated },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/constants/colors': { __esModule: true, default: {} },
    '../styles/playerScreenStyles': { styles: {} },
    './PlayerArtworkViews': { StableArtworkImage: 'Image' },
  });
  const ref = { current: null }, onLayout = () => {};
  const item = { song: { id: 'track', coverUrl: 'cover' }, artworkKey: 'track' };
  const tree = PlayerTrackCarousel({ artworkQueue: [item], artworkSize: 308, activeQueueIndex: 0,
    scrollX: interpolated, pageSnapInterval: 324, transitionArtworkRef: ref, onArtworkLayout: onLayout });
  const card = tree.props.children.props.renderItem({ item, index: 0 });
  assert.equal(card.type, 'Pressable');
  assert.equal(card.props.ref, ref);
  assert.equal(card.props.onLayout, onLayout);
  assert.equal(card.props.style[1].width, 308);
  assert.equal(card.props.children.props.children.props.artworkRef, undefined,
    'measurement does not inherit the carousel scale or translateX');
});
