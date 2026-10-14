const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const art = require("./helpers/youtube-artwork-fixture.cjs");

test("closing a screen cancels the remaining sequential artwork palette preloads", async () => {
  const calls = []; let finish;
  const colors = load('src/lib/colorExtractor.ts', {
    './colorMath': load('src/lib/colorMath.ts', {}), '@/services/youtube/YouTubeArtwork': art,
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    'expo-constants': { executionEnvironment: 'bare' }, react: {},
    'react-native': { Platform: { OS: 'android' } },
    'react-native-image-colors': { getColors: uri => {
      calls.push(uri); return new Promise(resolve => { finish = resolve; });
    } },
  }, '', { setTimeout: () => 1, clearTimeout() {} });
  const cancel = colors.preloadDominantColors(['https://art.test/first.jpg', 'https://art.test/second.jpg']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  cancel();
  finish({ platform: 'android', dominant: '#112288', vibrant: '#3366CC' });
  for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1, 'the second image must not start after cleanup');
});

test("artwork query keeps prior colors through rapid selection and failed extraction", async t => {
  const { QueryClient, QueryObserver } = require('@tanstack/react-query');
  const client = new QueryClient();
  let observer, unsubscribe, state, dirty;
  const waiting = new Map();
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
  t.after(() => { unsubscribe?.(); client.clear(); });
  const colors = load('src/lib/colorExtractor.ts', {
    './colorMath': load('src/lib/colorMath.ts', {}), '@/services/youtube/YouTubeArtwork': art,
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    'expo-constants': { executionEnvironment: 'bare' }, 'react-native': { Platform: { OS: 'android' } },
    react: { useState: initial => {
      if (state === undefined) state = typeof initial === 'function' ? initial() : initial;
      return [state, next => { dirty = true; state = next; }];
    } },
    '@tanstack/react-query': { useQuery: options => {
      if (!observer) { observer = new QueryObserver(client, options); unsubscribe = observer.subscribe(() => {}); }
      else observer.setOptions(options);
      return observer.getCurrentResult();
    } },
    'react-native-image-colors': { getColors: uri => {
      if (uri.includes('first')) return Promise.resolve({ platform: 'android', dominant: '#AA1111', vibrant: '#CC2222' });
      if (uri.includes('failed')) return Promise.reject(Error('No image'));
      return new Promise(resolve => waiting.set(uri, resolve));
    } },
  }, '', { AbortController, fetch: async () => ({ ok: false }), setTimeout: () => 1, clearTimeout() {} });
  const render = uri => {
    let palette;
    for (let i = 0; i < 5; i++) { dirty = false; palette = colors.useArtworkPalette(uri); if (!dirty) return palette; }
    throw Error('Artwork render did not settle');
  };
  const first = 'https://art.test/first.jpg', second = 'https://art.test/second.jpg', third = 'https://art.test/third.jpg';
  const red = await colors.extractArtworkColors(first);
  assert.equal(render(first), red);
  assert.equal(render(second), red); await flush();
  assert.equal(render(third), red); await flush();
  waiting.get(second)({ platform: 'android', dominant: '#1111AA', vibrant: '#2222CC' }); await flush();
  assert.equal(render(third), red, 'obsolete extraction cannot replace the active artwork colors');
  waiting.get(third)({ platform: 'android', dominant: '#11AA11', vibrant: '#22CC22' }); await flush();
  const green = render(third);
  assert.notEqual(green, red);
  assert.equal(render('https://art.test/failed.jpg'), green); await flush();
  assert.equal(render('https://art.test/failed.jpg'), green, 'unavailable source retains previous colors');
  assert.equal(render(''), colors.DEFAULT_ARTWORK_PALETTE);
});

test("festival animation uses density-sized animated WebP only for unsigned Cloudinary uploads", () => {
  const { getFestivalArtworkUrl } = load("src/features/home/components/festivalArtwork.ts", {}, "", { URL });
  const source = "https://res.cloudinary.com/demo/image/upload/v123/banner.gif";
  assert.equal(getFestivalArtworkUrl(source, 720),
    "https://res.cloudinary.com/demo/image/upload/c_limit,w_768,f_webp,fl_awebp,q_90/v123/banner.gif");
  for (const url of ["invalid", "https://cdn.test/banner.gif", source + "?signature=secret",
    source.replace("v123/", "s--signature--/v123/"), source.replace(".gif", ".jpg")]) {
    assert.equal(getFestivalArtworkUrl(url, 720), url);
  }
});

function load(filename, dependencies, extra = "", globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code + extra, { module, exports: module.exports, __DEV__: false,
    ...globals, require: function resolveTestDependency(name) { if (name.startsWith("@expo/vector-icons/")) return { __esModule: true, default: resolveTestDependency("@expo/vector-icons")[name.split("/").pop()] };

      if (name === "@tanstack/react-query") return dependencies[name] || {};
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];

} });
  return module.exports;
}

test("unchanged playback updates do not wake rows or rebuild queue IDs", () => {
  const engine = load("src/services/audio/PlaybackEngine.ts", { react: {} },
    "\nmodule.exports.read = getPlaybackEngineSnapshot; module.exports.listen = subscribePlaybackEngine;");
  let events = 0;
  const unsubscribe = engine.listen(() => events++);
  const queue = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
  engine.updatePlaybackEngineSnapshot({ queue, currentSong: queue[0] });
  const first = engine.read();
  for (let i = 0; i < 100; i++) engine.updatePlaybackEngineSnapshot({ isPlaying: false, queue });
  assert.equal(events, 1);
  assert.equal(engine.read(), first);
  engine.updatePlaybackEngineSnapshot(state => ({ isPlaying: !state.isPlaying }));
  assert.equal(events, 2);
  assert.equal(engine.read().queueIds, first.queueIds);
  engine.updatePlaybackEngineSnapshot({ queue: [queue[1]], queueIndex: 1, currentSong: queue[1] });
  assert.deepEqual(Array.from(engine.read().queueIds), ["1"]);
  assert.equal(engine.read().currentSongId, "1");
  assert.equal(engine.read().activeIndex, 1);
  unsubscribe();
  engine.resetPlaybackEngine();
  assert.equal(events, 3);
});

function adsFixture({ fail = false, expoGo = false } = {}) {
  let configs = 0, starts = 0;
  const ads = { setRequestConfiguration: async () => { configs++; }, initialize: async () => {
    starts++; if (fail && starts === 1) throw new Error("offline");
  } };
  const api = load("src/lib/googleMobileAds.ts", {
    "@/lib/logger": { logger: { warn() {} } },
    "expo-constants": { default: { executionEnvironment: expoGo ? "store" : "bare" },
      ExecutionEnvironment: { StoreClient: "store" }, __esModule: true },
    "react-native": { Platform: { OS: "android" } },
    "react-native-google-mobile-ads": { default: () => ads, MaxAdContentRating: { PG: "PG" } },
  });
  return { ...api, counts: () => ({ configs, starts }) };
}

test("concurrent startup/ad callers initialize the SDK once", async () => {
  const f = adsFixture();
  await Promise.all(Array.from({ length: 20 }, () => f.initializeMobileAds()));
  await f.initializeMobileAds();
  assert.deepEqual(f.counts(), { configs: 1, starts: 1 });
});

test("ad initialization retries after failure and stays unavailable in Expo Go", async () => {
  const f = adsFixture({ fail: true });
  await f.initializeMobileAds();
  await f.initializeMobileAds();
  assert.equal(f.counts().starts, 2);
  const expo = adsFixture({ expoGo: true });
  await expo.initializeMobileAds();
  assert.equal(expo.counts().starts, 0);
});

test("artwork warmup waits for idle, uses display-sized disk sources, and can be cancelled", () => {
  let task;
  const images = [], palettes = [];
  let stoppedPalettes = 0;
  const { scheduleArtworkPreload } = load("src/lib/artworkPreload.ts", {
    "@/services/youtube/YouTubeArtwork": art,
    "@/utils/idleTask": { runAfterIdle: callback => { task = callback; return () => { task = undefined; }; } },
    "expo-image": { Image: { prefetch: (urls, policy) => { images.push({ urls, policy }); return Promise.resolve(true); } } },
    "react-native": { PixelRatio: { get: () => 3 } },
    "./colorExtractor": { preloadDominantColors: urls => { palettes.push(urls); return () => { stoppedPalettes++; }; } },
  });
  const master = "https://lh3.googleusercontent.com/art=w1200-h1200-l90-rj";
  const cancel = scheduleArtworkPreload([master], 44);
  assert.equal(images.length, 0);
  cancel();
  assert.equal(task, undefined);
  const cancelStarted = scheduleArtworkPreload([master, master], 44);
  task();
  assert.equal(images[0].policy, "disk");
  assert.deepEqual(Array.from(images[0].urls), [art.youTubeDisplayArtworkUrl(master, art.artworkPixelSize(44, 3))]);
  assert.equal(palettes[0][0], master);
  cancelStarted();
  assert.equal(stoppedPalettes, 1, "cleanup cancels queued palette work after idle has started");
});

test("display artwork covers device pixels without oversized list thumbnails", () => {
  assert.equal(art.artworkPixelSize(148, 2), 320);
  assert.equal(art.artworkPixelSize(48, 2), 96);
  for (const density of [1, 1.5, 2, 2.625, 3, 4]) {
    for (const layout of [44, 48, 100, 148, 300, 400]) {
      const needed = Math.min(1200, layout * density);
      assert.ok(art.artworkPixelSize(layout, density) >= needed);
    }
  }
  assert.equal(art.artworkPixelSize(NaN, 2), 96);
  assert.equal(art.artworkPixelSize(148, Infinity), 192);
  const master = "https://lh3.googleusercontent.com/art=w1200-h1200-l90-rj?token=x";
  assert.equal(art.youTubeDisplayArtworkUrl(master, art.artworkPixelSize(148, 2)),
    "https://lh3.googleusercontent.com/art=w320-h320-l90-rj?token=x");
  assert.equal(art.youTubeDisplayArtworkUrl(master, art.artworkPixelSize(400, 3)), master);
  assert.equal(art.youTubeDisplayArtworkUrl("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", 320),
    "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg");
});

test("palette analysis preserves the displayed artwork source and signed crop parameters", () => {
  const master = "https://lh3.googleusercontent.com/art=w1200-h1200-l90-rj?token=x";
  assert.equal(art.artworkAnalysisUrl(master), "https://lh3.googleusercontent.com/art=w512-h512-l90-rj?token=x");
  assert.equal(art.youTubeDisplayArtworkUrl(master, 1200), master);
  assert.equal(art.artworkAnalysisUrl("https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg"),
    "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
  assert.equal(art.artworkAnalysisUrl("https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg?sqp=crop"),
    "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg?sqp=crop");
  assert.equal(art.artworkAnalysisUrl("https://c.saavncdn.com/123/song-500x500.jpg?token=a"),
    "https://c.saavncdn.com/123/song-500x500.jpg?token=a");
  const unknown = "https://elsewhere.com/song-500x500.jpg?token=s1200";
  assert.equal(art.artworkAnalysisUrl(unknown), unknown);
});

test("native palette extraction uses accurate sampling and coalesces requests under a versioned cache key", async () => {
  const calls = [];
  const math = load("src/lib/colorMath.ts", {});
  const colors = load("src/lib/colorExtractor.ts", {
    "./colorMath": math,
    "@/services/youtube/YouTubeArtwork": art,
    "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {} },
    "expo-constants": { executionEnvironment: "bare" },
    react: {},
    "react-native": { Platform: { OS: "android" } },
    "react-native-image-colors": { getColors: async (uri, options) => {
      calls.push({ uri, options });
      return { platform: "android", dominant: "#112288", vibrant: "#3366CC" };
    } },
  }, "", { setTimeout: () => 1, clearTimeout() {} });
  const master = "https://lh3.googleusercontent.com/palette=w1200-h1200-l90-rj";
  const palettes = await Promise.all(Array.from({ length: 10 }, () => colors.extractArtworkColors(master)));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].uri, art.artworkAnalysisUrl(master));
  assert.equal(calls[0].options.key, `artwork-palette-v5:android:native:${master}`);
  assert.equal(calls[0].options.quality, "high");
  assert.equal(calls[0].options.pixelSpacing, 2);
  assert.equal(colors.getImmediateArtworkPalette(master), palettes[0]);
  await colors.extractArtworkColors(master);
  assert.equal(calls.length, 1);
});

test("Expo Go samples real JPEG artwork pixels instead of showing a black placeholder", async () => {
  const jpeg = require("jpeg-js");
  const width = 24, height = 24;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = 210; pixels[i * 4 + 1] = 36; pixels[i * 4 + 2] = 54; pixels[i * 4 + 3] = 255;
  }
  const bytes = jpeg.encode({ data: pixels, width, height }, 90).data;
  const colors = load("src/lib/colorExtractor.ts", {
    "./colorMath": load("src/lib/colorMath.ts", {}),
    "@/services/youtube/YouTubeArtwork": art,
    "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {} },
    "expo-constants": { executionEnvironment: "storeClient", appOwnership: "expo" },
    "react-native": { Platform: { OS: "ios" } },
    "jpeg-js": jpeg,
    react: {},
  }, "", {
    AbortController,
    fetch: async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }),
    setTimeout: () => 1, clearTimeout() {},
  });
  const palette = await colors.extractArtworkColors("https://art.test/cover.jpg");
  assert.match(palette.rawDominant, /^#D[0-9A-F]{5}$/);
  assert.notEqual(palette.background, colors.DEFAULT_ARTWORK_PALETTE.background);
});

test("banner delay prevents a native ad from mounting before initialization and cancels unmounted work", async () => {
  const slots = []; let cursor = 0, effect, timer, delay, inits = 0, moduleReads = 0;
  let finishInit;
  const ready = new Promise(resolve => { finishInit = resolve; });
  const Banner = load("src/components/AdMobBanner.tsx", {
    "@/constants/admob": { AD_UNITS: { BANNER: "test" } },
    "@/lib/googleMobileAds": {
      initializeMobileAds: () => { inits++; return ready; },
      getGoogleMobileAdsModule: () => { moduleReads++; return { BannerAd: "BannerAd", BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: "adaptive" } }; },
    },
    "@/lib/logger": { logger: { warn() {} } },
    react: { memo: fn => fn, useEffect: fn => { effect = fn; },
      useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial;
        return [slots[i], next => { slots[i] = next; }]; } },
    "react-native": { StyleSheet: { create: value => value }, View: "View" },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
  }, "", { setTimeout: (fn, ms) => { timer = fn; delay = ms; return 1; }, clearTimeout: () => { timer = null; } }).default;
  const render = () => { cursor = 0; return Banner({ loadDelayMs: 1200 }); };
  assert.equal(render(), null);
  let cleanup = effect();
  assert.equal(delay, 1200);
  assert.equal(inits, 0);
  cleanup();
  assert.equal(timer, null);
  cleanup = effect();
  timer();
  assert.equal(inits, 1);
  assert.equal(render(), null);
  assert.equal(moduleReads, 0);
  finishInit();
  await ready;
  const ad = render();
  assert.equal(ad.props.children.type, "BannerAd");
  assert.equal(moduleReads, 1);
  cleanup();
});

test("both mini-player bars clamp progress and keep their layout width fixed across playback ticks", () => {
  let progress;
  const react = { memo: fn => fn };
  const components = load("src/features/navigation/miniPlayerComponents.tsx", {
    "@/contexts/PlayerContext": { useOptionalPlayerProgress: () => ({ progress }) },
    "@/lib/arrayUtils": {}, "@/lib/lastMix": {}, "@/lib/miniPlayerBannerConfig": {},
    "@/lib/nativeAnimated": {}, "@expo/vector-icons": {}, "expo-image": {}, "expo-router": {},
    react, "react-native": { View: "View" }, "./layoutStyles": { styles: {} },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
  });
  for (const [value, expected] of [[0, 0], [0.5, 0.5], [1, 1], [2, 1], [-1, 0], [NaN, 0]]) {
    progress = value;
    for (const ios of [false, true]) {
      const tree = components.MiniPlayerProgressBar({ fillColor: "#fff", ios });
      const fill = tree.props.children.props.style[1];
      assert.equal(fill.width, "100%");
      assert.equal(fill.transformOrigin, "left center");
      assert.equal(fill.transform[0].scaleX, expected);
    }
  }
  const ios = components.IOSMiniPlayerProgressBar({ fillColor: "#fff" });
  assert.equal(ios.type, components.MiniPlayerProgressBar);
  assert.equal(ios.props.ios, true);
});

test("Metro excludes native compiler outputs while keeping compiled package JavaScript and app sources", () => {
  const config = load("metro.config.js", { "expo/metro-config": { getDefaultConfig: () => ({
    resolver: { blockList: /default-hidden/, assetExts: [], sourceExts: [] }, transformer: {},
  }) } }, "", { __dirname: "/repo" });
  const hidden = path => config.resolver.blockList.some(pattern => pattern.test(path));
  for (const path of ["E:\\repo\\android\\app\\build\\generated\\data.json", "/repo/android/build/generated/data.json",
    "/repo/node_modules/react-native-audio-api/android/build/generated/data.json", "/repo/android/.gradle/cache.json",
    "/repo/node_modules/react-native-worklets/android/.cxx/data.json", "/repo/ios/Pods/pod.json", "/repo/ios/build/info.json",
    "/repo/default-hidden/data.json"]) assert.equal(hidden(path), true, path);
  for (const path of ["/repo/src/features/home/HomeScreen.tsx", "E:\\repo\\node_modules\\expo-image\\build\\Image.js",
    "/repo/node_modules/expo/build/Expo.js", "/repo/app/index.tsx"]) assert.equal(hidden(path), false, path);
});

test("shared image visibility stops native decoding when covered, backgrounded or scrolled away, and resumes on return", async () => {
  let focused = true, foreground = true, player = "mini", inViewport = true;
  let stateIndex = 0, reaction, effects = [], stopped = 0, started = 0;
  const ref = { current: { startAnimating: async () => started++, stopAnimating: async () => stopped++ } };
  const react = { memo: fn => fn, useCallback: fn => fn, useRef: () => ref,
    useEffect: fn => effects.push(fn), useState: initial => {
      if (stateIndex++ === 0) return [inViewport, value => { inViewport = value; }];
      return [typeof initial === "function" ? initial() : initial, () => {}];
    } };
  const { useVisibleImageAnimation } = load("src/lib/useVisibleImageAnimation.ts", {
    react, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "expo-image": { Image: "ExpoImage" }, "expo-linear-gradient": {},
    "./festivalArtwork": { getFestivalArtworkUrl: url => url },
    "expo-router": { useIsFocused: () => focused },
    "@/lib/appActivity": { useAppIsActive: () => foreground },
    "@/lib/playerUIState": { usePlayerUIState: () => player },
    "./appActivity": { useAppIsActive: () => foreground },
    "./playerUIState": { usePlayerUIState: () => player },
    "react-native": { PixelRatio: { get: () => 2 }, StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 360, height: 780 }) },
    "react-native-reanimated": { useAnimatedReaction: (prepare, react) => { reaction = () => react(prepare(), null); } },
    "react-native-worklets": { scheduleOnRN: (fn, value) => fn(value) },
  });
  const scrollY = { value: 0 };
  const render = () => {
    stateIndex = 0; effects = [];
    const result = useVisibleImageAnimation("https://cdn/banner.gif", scrollY, 400);
    const image = { props: { autoplay: result.animationActive } };
    const cleanup = effects[0]();
    return { image, cleanup };
  };
  let result = render(); assert.equal(result.image.props.autoplay, true); assert.equal(started, 1); result.cleanup();
  for (const scenario of ["blur", "background", "player", "scroll"]) {
    focused = scenario !== "blur"; foreground = scenario !== "background"; player = scenario === "player" ? "expanded" : "mini";
    scrollY.value = scenario === "scroll" ? 600 : 0; reaction();
    result = render(); assert.equal(result.image.props.autoplay, false, scenario); result.cleanup();
  }
  assert.equal(started, 1); assert.ok(stopped >= 9);
  focused = foreground = true; player = "mini"; scrollY.value = 0; reaction();
  result = render(); assert.equal(result.image.props.autoplay, true); assert.equal(started, 2); result.cleanup();
});

test("shared player visibility snapshots coalesce identical transitions and unsubscribe", () => {
  let notify = 0, unsubscribe;
  const ui = load("src/lib/playerUIState.ts", { react: { useSyncExternalStore: (subscribe, get) => {
    unsubscribe = subscribe(() => notify++); return get();
  } }, "expo-router": { router: {} } });
  assert.equal(ui.usePlayerUIState(), "hidden");
  ui.playerUIStateStore.expandPlayer(); ui.playerUIStateStore.expandPlayer(); assert.equal(notify, 1);
  ui.playerUIStateStore.collapsePlayer(); assert.equal(notify, 2);
  unsubscribe(); ui.playerUIStateStore.hidePlayer(); assert.equal(notify, 2);
});

test("song rows animate real selection changes without scheduling no-op animations while mounting", () => {
  let active = false, previous, shared, effects = [], calls = 0;
  const react = { memo: fn => fn, useCallback: fn => fn, useEffect: fn => effects.push(fn),
    useRef: initial => previous ||= { current: initial } };
  const { default: SongRow } = load("src/components/SongRow.tsx", {
    react, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "react-native": { Platform: { OS: "android" }, StyleSheet: { create: value => value }, Text: "Text" },
    "react-native-reanimated": { createAnimatedComponent: type => type,
      useSharedValue: initial => shared ||= { value: initial }, useAnimatedStyle: fn => fn(),
      interpolateColor: value => value ? "green" : "white", withTiming: value => { calls++; return value; },
      Easing: { inOut: fn => fn, quad() {} } },
    "@/constants/colors": { primary: "green" }, "@/components/DownloadButton": {},
    "@/components/EqualizerBars": {}, "@/components/MusicArtwork": {},
    "@/contexts/PlayerContext": { usePlayerRowActions: () => ({ playSong() {} }) },
    "@/services/audio/PlaybackEngine": { usePlaybackRowState: () => ({ isActive: active, isPlaying: false }) },
    "@/lib/haptics": {}, "@/lib/logger": {}, "@expo/vector-icons": {}, "expo-haptics": {}, "expo-router": {},
  });
  const render = () => {
    effects = []; SongRow({ song: { id: "song", title: "Title", artist: "Artist", coverUrl: "cover" } });
    effects.forEach(fn => fn());
  };
  render(); assert.equal(calls, 0);
  active = true; render(); assert.equal(calls, 1); assert.equal(shared.value, 1);
  render(); assert.equal(calls, 1);
  active = false; render(); assert.equal(calls, 2); assert.equal(shared.value, 0);
});


test("iOS release quality selection bypasses ads; unavailable/failed Android ads allow selection", async () => {
  for (const [platform, result, expected, adsExpected] of [
    ["ios", "cancelled", true, 0], ["android", "failed", true, 1],
    ["android", "unavailable", true, 1], ["android", "earned", true, 1],
    ["android", "cancelled", false, 1],
  ]) {
    const saved = []; let ads = 0;
    const service = load("src/services/ads/highQualityEntitlementService.ts", {
      "react-native": { Platform: { OS: platform } },
      "@/lib/storage": { getSettings: async () => ({}), isHighQualityEntitled: () => false,
        saveSettings: async patch => saved.push(patch) },
      "./rewardedAdService": { runRewardedAd: async () => { ads++; return result; } },
    });
    assert.equal(await service.requestHighQualityUnlockWithRewardedAd(), expected);
    assert.equal(ads, adsExpected);
    assert.equal(saved.length, expected ? 1 : 0);
    if (expected) assert.equal(saved[0].streamingQuality, "high");
  }
});

test("iOS palette keeps UIImageColors roles and isolates native release cache", async () => {
  let config;
  const colors = load("src/lib/colorExtractor.ts", {
    "./colorMath": load("src/lib/colorMath.ts", {}),
    "@/services/youtube/YouTubeArtwork": art,
    "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {} },
    "expo-constants": { executionEnvironment: "bare" }, react: {},
    "react-native": { Platform: { OS: "ios" } },
    "react-native-image-colors": { getColors: async (_, options) => {
      config = options;
      return { platform: "ios", background: "#882211", primary: "#DDBBAA", secondary: "#CC3322", detail: "#22CC33" };
    } },
  }, "", { setTimeout: () => 1, clearTimeout() {} });
  const palette = await colors.extractArtworkColors("https://art.example/cover.jpg");
  assert.equal(palette.rawDominant, "#882211");
  assert.equal(palette.rawVibrant, "#DDBBAA");
  assert.equal(palette.accent, "#DDBBAA", "native foreground is not re-saturated");
  assert.equal(palette.lyricsBg, palette.background);
  assert.match(config.key, /v5:ios:native/);
});
