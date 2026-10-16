const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(file, dependencies, globals = {}) {
  const slots = [];
  let cursor = 0, pending = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const react = {
    memo: fn => fn,
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const imports = typeof dependencies === 'function' ? dependencies(react) : dependencies;
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, ...globals, require(name) {
    if (name === 'react') return react;
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  } });
  return {
    exports: module.exports,
    render(fn) {
      cursor = 0;
      const result = fn(module.exports);
      const effects = pending; pending = []; effects.forEach(effect => effect());
      return result;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const category = { id: 'trending', title: 'Trending', results: [{ id: 'playlist' }] };

function feedFixture({ online = true, snapshot = null, official } = {}) {
  const mode = { online, snapshot, requests: [], recent: [], clears: 0, reconnect() {}, focus() {}, invalidate() {} };
  const h = harness('src/features/home/hooks/useHomeFeedData.ts', react => ({
    '@/contexts/NetworkContext': { useNetwork: () => ({ isOnline: mode.online, isChecking: false }), useOnReconnect: fn => { mode.reconnect = fn; } },
    '@/data/providers/ArtistProvider': { getFeaturedArtists: async () => [], clearFeaturedArtistsCache: async () => { mode.clears++; } },
    '@/data/providers/MusicCatalogProvider': { getHomeCatalogCategories: async () => [] },
    '@/data/providers/MusicCatalogFeedService': {
      getOfficialHomeFeed: force => { mode.requests.push(force); return official ? official(force) : Promise.resolve({ categories: [category], songs: [] }); },
      getOfficialHomeSongs: async () => [],
    },
    '@/data/providers/QuickPicksProvider': { clearQuickPicksCache: async () => {}, fetchQuickPicksFeed: async () => null },
    '@/lib/firestore': { getPublicPlaylists: async () => [] },
    '@/lib/homeCache': {
      getCachedHomeFeedSnapshot: async () => mode.snapshot,
      getCachedHomePublicPlaylists: async () => [], setCachedHomePublicPlaylists: async () => {},
      setCachedHomeFeedSnapshot: async () => {}, clearCachedHomePublicPlaylists: async () => {}, HOME_CACHE_INVALIDATED_EVENT: 'invalidate',
    },
    '@/lib/logger': { logger: { warn() {} } },
    '@/lib/storage': { getRecentlyPlayed: async () => mode.recent },
    'expo-router': { useFocusEffect: fn => { mode.focus = fn; react.useEffect(fn, [fn]); } },
    'react-native': { DeviceEventEmitter: { addListener: (_event, fn) => { mode.invalidate = fn; return { remove() {} }; } } },
  }));
  return { mode, render: () => h.render(m => m.useHomeFeedData({ compact: true })), unmount: h.unmount };
}

test('offline Home hydrates cached rows and finishes loading without a catalog request', async () => {
  const f = feedFixture({ online: false, snapshot: { categories: [category], publicPlaylists: [], featuredArtists: [], quickPickSongs: [] } });
  f.render(); await flush();
  const result = f.render();
  assert.equal(result.categories[0].id, 'trending');
  assert.equal(result.loading, false);
  assert.equal(result.hasContent, true);
  assert.equal(f.mode.requests.length, 0);
});

test('offline empty Home settles and cached artists count as content', async () => {
  for (const artists of [[], [{ id: 'artist' }]]) {
    const f = feedFixture({ online: false, snapshot: { categories: [], publicPlaylists: [], featuredArtists: artists, quickPickSongs: [] } });
    f.render(); await flush();
    assert.equal(f.render().loading, false);
    assert.equal(f.render().hasContent, artists.length > 0);
  }
});

test('overlapping explicit refreshes wait for the current load then share one forced load', async () => {
  const first = deferred(), fresh = deferred();
  const f = feedFixture({ official: force => force ? fresh.promise : first.promise });
  f.render(); await flush();
  const p1 = f.render().handleRefresh(), p2 = f.render().handleRefresh();
  await flush(); assert.deepEqual(f.mode.requests, [false]);
  first.resolve({ categories: [category], songs: [] }); await flush();
  assert.deepEqual(f.mode.requests, [false, true]);
  fresh.resolve({ categories: [{ ...category, title: 'Fresh' }], songs: [] });
  await Promise.all([p1, p2]);
  assert.equal(f.render().categories[0].title, 'Fresh');
  assert.equal(f.render().refreshing, false);
});

test('reconnecting while disk hydration is pending starts an online load after hydration', async () => {
  const disk = deferred();
  const f = feedFixture({ online: false, snapshot: disk.promise });
  f.render(); f.mode.online = true; f.render(); f.mode.reconnect();
  disk.resolve(null); await flush();
  assert.deepEqual(f.mode.requests, [false]);
  assert.equal(f.render().categories.length, 1);
});

test('unmount during hydration stops subsequent network work', async () => {
  const disk = deferred();
  const f = feedFixture({ snapshot: disk.promise });
  f.render(); f.unmount(); disk.resolve(null); await flush();
  assert.equal(f.mode.requests.length, 0);
});

test('a failed hydration releases loading and allows a later refresh', async () => {
  const disk = deferred();
  const f = feedFixture({ snapshot: disk.promise });
  f.render(); const refresh = f.render().handleRefresh();
  disk.reject(new Error('Storage unavailable')); await refresh; await flush();
  assert.equal(f.render().loading, false);
  f.mode.snapshot = null; await f.render().handleRefresh();
  assert.deepEqual(f.mode.requests, [true]);
});

test('returning Home updates recent metadata even when item IDs are unchanged', async () => {
  const f = feedFixture({ online: false });
  f.mode.recent = [{ id: 'song', type: 'song', name: 'Old' }];
  f.render(); await flush(); assert.equal(f.render().recentlyPlayed[0].name, 'Old');
  f.mode.recent = [{ id: 'song', type: 'song', name: 'Updated' }];
  f.mode.focus(); await flush(); assert.equal(f.render().recentlyPlayed[0].name, 'Updated');
});

test('a late cached festival theme cannot replace a newer live update', async () => {
  const cached = deferred(); let live;
  const h = harness('src/features/home/hooks/useFestivalTheme.ts', {
    '@/contexts/AuthContext': { useAuth: () => ({ user: null }) },
    '@/services/festivalThemeService': { DEFAULT_FESTIVAL_THEME: { id: 'default' }, getCachedFestivalTheme: () => cached.promise,
      subscribeRemoteFestivalTheme: fn => { live = fn; return () => {}; } },
    'expo-image': { Image: { prefetch: async () => {} } },
  });
  const render = () => h.render(m => m.useFestivalTheme());
  render(); live({ id: 'live' }); cached.resolve({ id: 'stale-cache' }); await flush();
  assert.equal(render().id, 'live');
});

test('festival image errors and dimensions belong to their source URL', () => {
  const jsx = (type, props) => ({ type, props });
  const h = harness('src/features/home/components/FestivalHeaderBanner.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/useVisibleImageAnimation': { useVisibleImageAnimation: () => ({ imageRef: {}, animationActive: false }) },
    'expo-image': { Image: 'Image' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'react-native': { View: 'View', Text: 'Text', ActivityIndicator: 'Loading', PixelRatio: { get: () => 2 },
      useWindowDimensions: () => ({ width: 390, height: 844 }), StyleSheet: { create: s => s } },
    './festivalArtwork': { getFestivalArtworkUrl: source => source },
  });
  const find = (node, type) => node?.type === type ? node : [node?.props?.children].flat().filter(Boolean).map(child => find(child, type)).find(Boolean);
  let url = 'https://example.com/a.gif', ratio;
  const render = () => h.render(m => m.FestivalHeaderBanner({ themeConfig: { enabled: true, backgroundImageUrl: url, aspectRatio: ratio } }));
  let image = find(render(), 'Image'); image.props.onLoad({ source: { width: 400, height: 100 } });
  assert.equal(render().props.style[1].height, 140);
  image.props.onError(); assert.equal(render(), null);
  url = 'https://example.com/b.gif';
  assert.ok(find(render(), 'Image'), 'a failed previous image must not hide a new image');
  assert.equal(render().props.style[1].height, 219, 'a new source starts with its own default ratio');
  assert.ok(find(render(), 'Loading'));
  image.props.onError(); assert.ok(find(render(), 'Image'), 'late callbacks cannot poison a new source');
  ratio = 4; assert.equal(render().props.style[1].height, 140);
  ratio = undefined; assert.equal(render().props.style[1].height, 219, 'removing a pinned ratio restores the current source ratio');
});

test('leaving festival mode resumes a cancelled ambient extraction for the current artwork', async () => {
  const calls = [], pendingB = deferred(); let cover = 'a', festival = false;
  const jsx = (type, props) => ({ type, props });
  const h = harness('src/features/home/components/HomeAmbientBackdrop.tsx', react => ({
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/constants/colors': { __esModule: true, default: { background: '#000' } },
    '@/lib/colorExtractor': { extractArtworkColors: url => { calls.push(url); return url === 'a' ? Promise.resolve({ accent: 'a' }) : pendingB.promise; },
      getArtworkAmbientGradientStops: color => [color, color, color, color], colorWithAlpha: color => color,
      ARTWORK_AMBIENT_GRADIENT_LOCATIONS: [0, 0.2, 0.6, 1], ARTWORK_AMBIENT_TRANSITION_DURATION_MS: 200 },
    '@/services/audio/PlaybackEngine': { usePlaybackNowPlaying: () => ({ currentSong: { coverUrl: cover } }) },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'react-native': { StyleSheet: { create: value => value } },
    'react-native-reanimated': { __esModule: true, default: { View: 'Animated' }, Easing: { bezier() {} },
      useSharedValue: value => react.useRef({ value }).current, useAnimatedStyle: fn => fn(), withTiming: value => value },
  }));
  const render = () => h.render(m => m.HomeAmbientBackdrop({ themeConfig: { enabled: festival } }));
  render(); await flush(); render();
  cover = 'b'; render(); festival = true; render(); festival = false; render();
  assert.deepEqual(calls, ['a', 'b', 'b'], 'the previous artwork cache cannot suppress a cancelled current extraction');
  pendingB.resolve({ accent: 'b' }); await flush();
  assert.ok(JSON.stringify(render()).includes('"b"'), 'the current artwork colors replace the previous cached colors');
});

function showcaseFixture({ raw = null, storageError = false } = {}) {
  const mode = { scope: { accountId: 'a', generation: 1 }, appState: 'active', enabled: true, raw,
    read: null, write: null, writes: [], events: [], timer: null };
  const h = harness('src/features/home/hooks/useAppShowcasePrompt.ts', react => ({
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async () => { if (storageError) throw Error('Storage unavailable'); return mode.read ? mode.read.promise : mode.raw; },
      setItem: async (key, value) => { mode.writes.push({ key, value: JSON.parse(value) }); if (mode.write) await mode.write.promise; },
    } },
    'expo-router': { useRouter: () => ({}), useFocusEffect: fn => react.useEffect(fn, [fn]) },
    'react-native': { Platform: { OS: 'ios' }, AppState: { get currentState() { return mode.appState; } }, Alert: { alert: () => mode.events.push('alert') } },
    '@/lib/accountScope': { getAccountScope: () => ({ ...mode.scope }),
      isCurrentAccount: scope => scope.accountId === mode.scope.accountId && scope.generation === mode.scope.generation,
      accountStorageKey: (key, account) => `${account}:${key}` },
    '@/lib/appShowcaseConfig': { isAppShowcaseEnabled: () => mode.enabled, isAppShowcaseDevEnabled: () => false },
    '@/lib/storage': { getSettings: async () => ({ streamingQuality: 'low' }) },
  }), { __DEV__: false, setTimeout: fn => { mode.timer = fn; return 1; }, clearTimeout() {} });
  h.exports.subscribeAppShowcaseModal(() => mode.events.push('show'));
  h.render(m => m.useAppShowcasePrompt(true));
  return { mode, fire: () => mode.timer(), unmount: h.unmount };
}

test('showcase keeps remote controls and frequency limits without a dynamic require fallback', async () => {
  const f = showcaseFixture(); f.fire(); await flush();
  assert.deepEqual(f.mode.events, ['show']);
  assert.equal(f.mode.writes[0].value.count, 1);
  for (const raw of [JSON.stringify({ count: 2, lastShownAt: 0 }), JSON.stringify({ count: 1, lastShownAt: Date.now() })]) {
    const blocked = showcaseFixture({ raw }); blocked.fire(); await flush();
    assert.equal(blocked.mode.events.length, 0); assert.equal(blocked.mode.writes.length, 0);
  }
  const disabled = showcaseFixture(); disabled.mode.enabled = false; disabled.fire(); await flush();
  assert.equal(disabled.mode.events.length, 0);
});

test('showcase ignores storage failures and malformed history without an unhandled rejection', async () => {
  for (const config of [{ storageError: true }, { raw: '{broken' }]) {
    const f = showcaseFixture(config); f.fire(); await flush();
    assert.equal(f.mode.events.length, 0);
  }
});

test('showcase cannot present after account changes, backgrounding, or unmount while reading history', async () => {
  for (const change of [f => { f.mode.scope = { accountId: null, generation: 2 }; },
    f => { f.mode.scope = { accountId: 'a', generation: 3 }; },
    f => { f.mode.appState = 'background'; }, f => f.unmount()]) {
    const f = showcaseFixture(); f.mode.read = deferred(); f.fire(); await flush();
    change(f); f.mode.read.resolve(null); await flush();
    assert.equal(f.mode.writes.length, 0); assert.equal(f.mode.events.length, 0);
  }
});

test('showcase rechecks account generation after persisting frequency history', async () => {
  const f = showcaseFixture(); f.mode.write = deferred(); f.fire(); await flush();
  assert.equal(f.mode.writes.length, 1);
  f.mode.scope = { accountId: 'b', generation: 2 }; f.mode.write.resolve(); await flush();
  assert.equal(f.mode.events.length, 0);
});
