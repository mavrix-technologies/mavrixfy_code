const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: function resolveTestDependency(name) { if (name.startsWith("@expo/vector-icons/")) return { __esModule: true, default: resolveTestDependency("@expo/vector-icons")[name.split("/").pop()] };

    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];

}, ...globals });
  return module.exports;
}

const layoutModule = load("src/features/player/components/standByLayout.ts");
const { getStandByLayout } = layoutModule;
const lyricsModule = load("src/features/player/components/standByLyrics.ts");
const noInsets = { top: 0, left: 0, right: 0, bottom: 0 };

test("landscape artwork fits its square and leaves remaining safe-area space for controls", () => {
  for (const [width, height, fontScale, insets] of [
    [568, 320, 1, noInsets], [844, 390, 1, { ...noInsets, left: 44, right: 44, bottom: 21 }],
    [915, 412, 2, { ...noInsets, left: 32, right: 24 }], [1366, 1024, 3, noInsets],
  ]) {
    const layout = getStandByLayout(width, height, fontScale, insets);
    assert.ok(layout.controlsWidth >= layout.artworkColumnWidth);
    assert.equal(layout.artworkSize, Math.min(layout.artworkColumnWidth, layout.contentHeight), "square cover fits without stretching or cropping");
    assert.equal(layout.artworkColumnWidth + layout.controlsWidth + layout.gap, layout.contentWidth);
    assert.equal(layout.contentWidth + layout.paddingLeft + layout.paddingRight, width);
    assert.equal(layout.contentHeight + layout.paddingTop + layout.paddingBottom, height);
    assert.equal(layout.paddingLeft, layout.paddingRight);
    assert.equal(layout.paddingTop - insets.top, layout.paddingBottom - insets.bottom);
    assert.ok(layout.paddingLeft > Math.max(insets.left, insets.right));
    assert.ok(layout.paddingTop > insets.top);
    assert.ok(layout.controlsWidth >= 248, "all playback targets fit without wrapping");
    assert.equal(layout.artworkColumnWidth, layout.artworkSize, "no empty half-column around square artwork");
    assert.equal(layout.paddingTop, insets.top + (height < 360 ? 12 : 16));
    assert.equal(layout.gap, layout.contentWidth < 600 ? 16 : 24);
  }
});

test("measured native viewport replaces stale portrait dimensions after rotation", () => {
  const f = fixture({ dimensions: { width: 360, height: 772, fontScale: 1 } });
  const overlay = f.mount(f.StandByOverlay, props());
  let tree = overlay.render();
  assert.equal(find(tree, element => element.props.testID === "standby-artwork"), undefined);
  const viewport = find(tree, element => element.props.testID === "standby-viewport");
  viewport.props.onLayout({ nativeEvent: { layout: { width: 688, height: 360 } } });
  tree = overlay.render();
  assert.ok(find(tree, element => element.props.testID === "standby-artwork"));
  const layout = getStandByLayout(688, 360, 1, noInsets);
  assert.equal(find(tree, element => element.props.testID === "standby-artwork").props.style[1].width, layout.artworkSize);
  assert.equal(find(tree, element => element.type === "StandByActions").props.compact, true);
  assert.equal(tree.type, "View");
  assert.equal(find(tree, element => element.type === "Modal"), undefined, "one root window owns rotation");
  assert.ok(find(tree, element => element.type === "SafeAreaView"), "native insets reserve system-navigation space before measuring");
  viewport.props.onLayout({ nativeEvent: { layout: { width: 0, height: 0 } } });
  assert.ok(find(overlay.render(), element => element.props.testID === "standby-artwork"), "transient zero-sized frames do not reset layout");
  overlay.unmount();
});

test("narrow windows and portrait rotation give playback controls the actual available width", () => {
  for (const [width, height] of [[390, 844], [240, 180], [200, 140]]) {
    const layout = getStandByLayout(width, height, 2, noInsets);
    assert.equal(layout.showArtwork, false);
    assert.equal(layout.artworkColumnWidth, 0);
    assert.equal(layout.gap, 0);
    assert.ok(layout.contentWidth <= width);
  }
});

function fixture(options = {}) {
  let current;
  let foreground = true;
  let batteryLevel = options.batteryLevel ?? 0.78;
  let batteryState = options.batteryState ?? 1;
  let snapshot = { positionMillis: 90_250, duration: 180_500, progress: 0.5 };
  let motionListener;
  let resolveMotion;
  let progressSubscriptions = 0;
  let time = 125_500;
  let nextTimer = 0;
  const backListeners = [];
  const timers = new Map();
  const animations = [];
  const motionPromise = new Promise(resolve => { resolveMotion = resolve; });
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    __esModule: true,
    memo: fn => fn,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } }),
    useState(initial) {
      const owner = current;
      const index = owner.index++;
      if (!owner.slots[index]) owner.slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const slot = owner.slots[index];
      return [slot.value, value => {
        const next = typeof value === "function" ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; owner.dirty = true; }
      }];
    },
    useEffect(fn, deps) {
      const owner = current;
      const index = owner.index++;
      const previous = owner.slots[index];
      if (!sameDeps(previous?.deps, deps)) {
        owner.pending.push(() => {
          previous?.cleanup?.();
          owner.slots[index] = { deps, cleanup: fn() };
        });
      }
    },
    useCallback(fn, deps) {
      const index = current.index++;
      if (!sameDeps(current.slots[index]?.deps, deps)) current.slots[index] = { fn, deps };
      return current.slots[index].fn;
    },
    useMemo(fn, deps) {
      const index = current.index++;
      if (!sameDeps(current.slots[index]?.deps, deps)) current.slots[index] = { value: fn(), deps };
      return current.slots[index].value;
    },
    useRef(initial) {
      const index = current.index++;
      if (!current.slots[index]) current.slots[index] = { current: initial };
      return current.slots[index];
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const owner = current;
      react.useEffect(() => subscribe(() => { owner.dirty = true; }), [subscribe]);
      return getSnapshot();
    },
  };
  react.useEffectEvent = fn => {
    const latest = react.useRef(fn);
    latest.current = fn;
    return react.useCallback((...args) => latest.current(...args), []);
  };
  react.default = react;
  react.useLayoutEffect = react.useEffect;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation() {}
  }
  const animated = {
    Value,
    View: "AnimatedView",
    timing(value, config) {
      const animation = { value, config, stopped: false,
        start(callback) { animation.callback = callback; animations.push(animation); },
        stop() { animation.stopped = true; animation.callback?.({ finished: false }); },
        finish() { value.setValue(config.toValue); animation.callback?.({ finished: true }); },
      };
      return animation;
    },
  };
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const native = {
    View: "View", Modal: "Modal", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", FlatList: "FlatList", ActivityIndicator: "ActivityIndicator",
    Platform: { OS: "android" }, Easing: { out: value => value, inOut: value => value, quad: "quad", cubic: "cubic" },
    StyleSheet: { create: value => value, hairlineWidth: 0.5, absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
    useWindowDimensions: () => ({ width: 844, height: 390, fontScale: 1, ...options.dimensions }),
    AccessibilityInfo: {
      addEventListener: (_event, listener) => { motionListener = listener; return { remove: () => { motionListener = undefined; } }; },
      isReduceMotionEnabled: () => motionPromise,
    },
    BackHandler: { addEventListener: (_event, handler) => { backListeners.push(handler); return { remove: () => { const index = backListeners.indexOf(handler); if (index >= 0) backListeners.splice(index, 1); } }; } },
  };
  const { StandByOverlay } = load("src/features/player/components/StandByOverlay.tsx", {
    react, "react-native": native, "expo-image": { Image: "Image" },
    "@/components/MusicArtwork": { MusicArtwork: "MusicArtwork" },
    "react-native-gesture-handler": { GestureHandlerRootView: "GestureHandlerRootView" },
    "expo-battery": { BatteryState: { CHARGING: 2 }, useBatteryLevel: () => batteryLevel, useBatteryState: () => batteryState },
    "@expo/vector-icons": { MaterialIcons: "MaterialIcons", Ionicons: "Ionicons", MaterialCommunityIcons: "MaterialCommunityIcons" },
    "react-native-safe-area-context": { SafeAreaProvider: "SafeAreaProvider", SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => options.insets ?? noInsets },
    "@/lib/nativeAnimated": animated, "@/lib/appActivity": { useAppIsActive: () => foreground },
    "@/components/PingPongScroll": { PingPongScroll: "PingPongScroll" },
    "@/components/PlayerSlider": { PlayerSlider: "PlayerSlider" },
    "@/lib/musicData": { formatDuration: seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` },
    "@/services/audio/playbackProgressStore": {
      getPlaybackProgressSnapshot: () => snapshot,
      subscribePlaybackProgress: () => { progressSubscriptions++; return () => { progressSubscriptions--; }; },
    },
    "@/utils/stringUtils": { unescapeHtml: value => value }, "./standByLayout": layoutModule,
    "./StandByAmbientBackdrop": { StandByAmbientBackdrop: "StandByAmbientBackdrop" },
    "./StandByActions": { StandByActions: "StandByActions" },
    "./StandBySidePanel": { StandBySidePanel: "StandBySidePanel" },
    "./PlaybackInfo": { PlaybackInfo: "PlaybackInfo" },
  }, {
    Date: FakeDate,
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });

  function mount(component, initialProps) {
    const owner = { index: 0, dirty: false, slots: [], pending: [], props: initialProps };
    return {
      render(props = owner.props) {
        owner.props = props;
        let tree;
        let iterations = 0;
        do {
          if (++iterations > 20) throw new Error("Render did not settle");
          owner.index = 0; owner.dirty = false; current = owner;
          tree = component(props);
          for (const effect of owner.pending.splice(0)) effect();
        } while (owner.dirty);
        return tree;
      },
      unmount() { for (const slot of owner.slots) slot?.cleanup?.(); },
    };
  }
  return {
    react, native,
    StandByOverlay, mount, animations, timers,
    setForeground: value => { foreground = value; },
    setBattery: (level, state = 1) => { batteryLevel = level; batteryState = state; },
    setSnapshot: value => { snapshot = value; },
    setTime: value => { time = value; },
    setReduceMotion: value => motionListener(value),
    async resolveReduceMotion(value) { resolveMotion(value); await Promise.resolve(); },
    subscriptionCount: () => progressSubscriptions,
    hardwareBack: () => backListeners.at(-1)?.(),
    backListenerCount: () => backListeners.length,
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (predicate(tree)) return tree;
  for (const child of tree.props?.children ?? []) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

const props = overrides => ({
  visible: true, song: { title: "Track", artist: "Artist", duration: 180.5 },
  isPlaying: true, isShuffled: false, repeatMode: "off", standByStyle: "classic", controlsDimmed: false, liked: false,
  queue: [], queueIndex: 0,
  onTogglePlay() {}, onSkipNext() {}, onSkipPrev() {}, onToggleShuffle() {}, onToggleRepeat() {},
  onSeek() {}, onSelectStyle() {}, onToggleLike() {}, onPlayQueueSong() {}, onExitStandBy() {}, onTouchActivity() {}, ...overrides,
});

test("rapid standby exit and re-entry renders immediately without visibility animations", async () => {
  const f = fixture();
  const overlay = f.mount(f.StandByOverlay, props({ visible: false }));
  assert.equal(overlay.render(), null);
  await f.resolveReduceMotion(false);
  overlay.render();
  assert.ok(overlay.render(props()));
  assert.equal(overlay.render(props({ visible: false })), null);
  const entered = overlay.render(props());
  assert.equal(find(entered, element => element.props.testID === "standby-overlay").props.style[1].opacity, undefined);
  assert.ok(find(entered, element => element.props.accessibilityLabel === "Next track"));
  assert.equal(f.animations.length, 0);
  overlay.unmount();
  assert.equal(f.animations.length, 0);
});

test("StandBy title uses pingpong marquee and respects Reduce Motion changes", async () => {
  const f = fixture();
  const overlay = f.mount(f.StandByOverlay, props());
  overlay.render();
  await f.resolveReduceMotion(false);
  const activeTree = overlay.render();
  const pingPong = find(activeTree, element => element.type === "PingPongScroll");
  assert.ok(pingPong, "title renders using PingPongScroll");
  assert.equal(pingPong.props.paused, false);
  f.setReduceMotion(true);
  const staticTree = overlay.render();
  const pausedPingPong = find(staticTree, element => element.type === "PingPongScroll");
  assert.ok(pausedPingPong);
  assert.equal(pausedPingPong.props.paused, true, "pauses marquee when Reduce Motion is enabled");
  assert.equal(overlay.render(props({ visible: false })), null);
});

test("controls remain visible and respond while the same StandBy resizes between portrait and landscape", async () => {
  const dimensions = { width: 390, height: 844, fontScale: 1 };
  const f = fixture({ dimensions });
  const calls = [];
  const overlay = f.mount(f.StandByOverlay, props({ onTogglePlay: () => calls.push('play'), onSkipNext: () => calls.push('next') }));
  overlay.render(); await f.resolveReduceMotion(false);
  for (const style of ['classic', 'night', 'ambient']) {
    for (let rotation = 0; rotation < 20; rotation++) {
      Object.assign(dimensions, rotation % 2 ? { width: 390, height: 844 } : { width: 844, height: 390 });
      const tree = overlay.render(props({ standByStyle: style, onTogglePlay: () => calls.push('play'), onSkipNext: () => calls.push('next') }));
      assert.equal(find(tree, node => node.props.testID === 'standby-content').props.style.opacity, undefined);
      find(tree, node => node.props.accessibilityLabel === 'Pause').props.onPress();
      find(tree, node => node.props.accessibilityLabel === 'Next track').props.onPress();
    }
  }
  assert.equal(calls.length, 120);
  assert.equal(f.animations.length, 0);
  overlay.unmount();
});

test("accessibility actions wake controls, expose toggle state, and invoke the explicit exit", () => {
  const f = fixture();
  const calls = [];
  const overlay = f.mount(f.StandByOverlay, props({ isShuffled: true, repeatMode: "one", onExitStandBy: () => calls.push("exit"), onTouchActivity: () => calls.push("wake") }));
  const tree = overlay.render();
  find(tree, element => element.props.accessibilityLabel === "Exit StandBy").props.onPress();
  assert.deepEqual(calls, ["wake", "exit"]);
  assert.equal(find(tree, element => element.props.accessibilityLabel === "Shuffle").props.accessibilityState.selected, true);
  assert.equal(find(tree, element => element.props.accessibilityLabel === "Repeat: one").props.accessibilityState.selected, true);
  assert.ok(find(tree, element => element.type === "ScrollView"));
});

test("tiny landscape windows keep controls in one accessible horizontally scrollable row", () => {
  const f = fixture({ dimensions: { width: 240, height: 180, fontScale: 2 } });
  const overlay = f.mount(f.StandByOverlay, props());
  const tree = overlay.render();
  const controls = find(tree, element => element.props.testID === "standby-playback-controls");
  assert.ok(controls, "playback targets retain the same vertical center");
  assert.equal(controls.props.children.length, 5);
  const horizontal = find(tree, element => element.type === "ScrollView" && element.props.horizontal);
  assert.equal(horizontal.props.contentContainerStyle.width, layoutModule.STANDBY_MIN_CONTROLS_WIDTH);
});

function progressFixture(f, overrides) {
  const overlay = f.mount(f.StandByOverlay, props(overrides));
  const child = find(overlay.render(), element => element.type?.name === "StandByProgress");
  assert.equal(f.subscriptionCount(), 0, "the overlay does not subscribe to playback ticks");
  return { component: f.mount(child.type, child.props), props: child.props };
}

test("the original single night button cycles Classic, Night and Ambient without a style-chip row", () => {
  const f = fixture();
  const calls = [];
  const overlayProps = props({ onTouchActivity: () => calls.push("wake"), onSelectStyle: value => calls.push(value) });
  const overlay = f.mount(f.StandByOverlay, overlayProps);
  for (const [name, value, next] of [["Classic", "classic", "Night"], ["Night", "night", "Ambient"], ["Ambient", "ambient", "Classic"]]) {
    const tree = overlay.render({ ...overlayProps, standByStyle: value });
    const button = find(tree, element => element.props.accessibilityLabel === `StandBy style: ${name}`);
    assert.equal(button.props.accessibilityValue.text, name);
    assert.equal(button.props.accessibilityHint, `Switch to ${next}`);
    assert.equal(find(tree, element => element.props.accessibilityLabel === "StandBy Classic style"), undefined);
    button.props.onPress();
  }
  assert.deepEqual(calls, ["wake", "night", "wake", "ambient", "wake", "classic"]);
});

test("only visible Ambient mounts the backdrop; all styles retain identical controls geometry", async () => {
  const f = fixture();
  const overlay = f.mount(f.StandByOverlay, props());
  let panelStyle;
  for (const style of ["classic", "night", "ambient"]) {
    const tree = overlay.render(props({ standByStyle: style, controlsDimmed: true, liked: true, backgroundColor: "#123456" }));
    assert.equal(Boolean(find(tree, element => element.type === "StandByAmbientBackdrop")), style === "ambient");
    const actions = find(tree, element => element.type === "StandByActions");
    assert.ok(actions);
    assert.equal(find(tree, element => element.props.accessibilityLabel === "Remove from liked songs").props.accessibilityState.selected, true);
    const panel = find(tree, element => element.props.testID === "standby-content");
    if (panelStyle) assert.deepEqual(panel.props.style, panelStyle);
    panelStyle = panel.props.style;
    assert.equal(find(tree, element => element.type === "StandBySidePanel"), undefined, "controls are the default view");
    const dimLayer = find(tree, element => element.props.testID === "standby-viewport");
    assert.equal(dimLayer.props.style[1].opacity.value, style === "ambient" ? 1 : 0.72);
  }
  await f.resolveReduceMotion(false);
  overlay.render();
  const exiting = overlay.render(props({ standByStyle: "ambient", visible: false }));
  assert.equal(exiting, null, "inactive overlay leaves the shared player surface");
  overlay.unmount();
});

test("Ambient content is open over the full-screen background with no bordered panel", () => {
  const f = fixture();
  const overlay = f.mount(f.StandByOverlay, props({ standByStyle: "ambient" }));
  const content = find(overlay.render(), element => element.type === "ScrollView");
  assert.equal(content.props.style.backgroundColor, undefined);
  assert.equal(content.props.style.borderWidth, undefined);
  assert.equal(content.props.style.borderRadius, undefined);
  overlay.unmount();
});

test("clock shows midnight, noon and afternoon in twelve-hour time with AM/PM", () => {
  for (const [hour, minute, expected] of [[0, 0, "12:00 AM"], [12, 0, "12:00 PM"], [13, 5, "1:05 PM"], [23, 59, "11:59 PM"]]) {
    const f = fixture();
    f.setTime(new Date(2026, 9, 10, hour, minute).getTime());
    const overlay = f.mount(f.StandByOverlay, props());
    const child = find(overlay.render(), element => element.type?.name === "StandByClock");
    const clock = f.mount(child.type, child.props);
    const time = find(clock.render(), element => element.type === "Text" && element.props.adjustsFontSizeToFit);
    assert.equal(time.props.children[0], expected);
    clock.unmount(); overlay.unmount();
  }
});

test("only Queue and Lyrics remain in the action row and both open inline", () => {
  const f = fixture(); const calls = [];
  const { StandByActions } = load("src/features/player/components/StandByActions.tsx", {
    react: f.react, "react-native": f.native,
    "@expo/vector-icons": { MaterialIcons: "MaterialIcons", Ionicons: "Ionicons" },
    "./standByLayout": layoutModule,
  }, { React: f.react });
  const actionsProps = { primaryColor: "#fff", secondaryColor: "#ddd", onSelectPanel: value => calls.push(value), onTouchActivity: () => calls.push("wake") };
  const actions = f.mount(StandByActions, actionsProps);
  const tree = actions.render();
  assert.equal(tree.props.style.flexWrap, undefined, "the default single row needs no wrapping override");
  assert.equal(tree.props.style.alignItems, "flex-start");
  assert.equal(tree.props.style.justifyContent, "space-between");
  const overlay = f.mount(f.StandByOverlay, props());
  const playback = overlay.render();
  const shuffle = find(playback, element => element.props.accessibilityLabel === "Shuffle");
  const repeat = find(playback, element => element.props.accessibilityLabel === "Repeat: off");
  const buttons = tree.props.children.filter(child => child?.type === "Pressable");
  assert.equal(buttons[0].props.children[0].props.style[0].width, shuffle.props.style[0].width, "Queue shares Shuffle's left-edge center");
  assert.equal(buttons[2].props.children[0].props.style[0].width, repeat.props.style[0].width, "Lyrics shares Repeat's right-edge center");
  overlay.unmount();
  assert.equal(find(tree, element => element.type === "Modal"), undefined);
  assert.equal(buttons.length, 3);
  assert.equal(find(tree, element => element.props.accessibilityLabel === "Show song options"), undefined);
  for (const label of ["Show playback queue", "Show lyrics"]) find(tree, element => element.props.accessibilityLabel === label).props.onPress();
  assert.deepEqual(calls, ["wake", "queue", "wake", "lyrics"]);
  actions.unmount();
});

test("StandBy Ambient uses artwork and colors without mounting any media player", () => {
  const f = fixture();
  const { StandByAmbientBackdrop } = load("src/features/player/components/StandByAmbientBackdrop.tsx", {
    react: f.react, "react-native": f.native, "expo-image": { Image: "Image" },
    "@/components/MusicArtwork": { MusicArtwork: "MusicArtwork" },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
  }, { React: f.react });
  const backdropProps = { song: { id: "song", coverUrl: "https://example.test/cover.jpg" }, accentColor: "#3f8faa", backgroundColor: "#223344", reduceMotion: false };
  const backdrop = f.mount(StandByAmbientBackdrop, backdropProps);
  let tree = backdrop.render();
  assert.ok(find(tree, element => element.type === "Image"));
  assert.ok(find(tree, element => element.type === "LinearGradient"));
  assert.equal(find(tree, element => element.type === "BackgroundYoutubeVideo"), undefined);
  tree = backdrop.render({ ...backdropProps, reduceMotion: true });
  assert.equal(find(tree, element => element.type === "BackgroundYoutubeVideo"), undefined);
  assert.ok(find(tree, element => element.type === "Image"));
  tree = backdrop.render(backdropProps);
  assert.equal(find(tree, element => element.type === "BackgroundYoutubeVideo"), undefined);
  tree = backdrop.render({ ...backdropProps, song: { id: "missing-cover" } });
  assert.ok(find(tree, element => element.type === "LinearGradient"));
  backdrop.unmount();
});

test("Queue and Lyrics replace controls in the same half and Back restores controls without moving artwork", () => {
  for (const dimensions of [{ width: 844, height: 390, fontScale: 1 }, { width: 568, height: 320, fontScale: 2 }, { width: 320, height: 240, fontScale: 2 }]) {
    const f = fixture({ dimensions });
    const overlay = f.mount(f.StandByOverlay, props());
    const tree = overlay.render();
    const root = find(tree, element => element.props.testID === "standby-viewport");
    assert.equal(root.props.style[0].alignItems, "stretch", "artwork and controls share top/bottom edges");
    assert.equal(find(tree, element => element.type === "ScrollView" && element.props.horizontal), undefined, "normal layouts have no horizontal wrappers");
    const artwork = find(tree, element => element.props.testID === "standby-artwork");
    if (artwork) {
      assert.equal(artwork.props.style[0].borderWidth, undefined);
      assert.equal(artwork.props.style[0].padding, undefined);
      assert.equal(artwork.props.style[0].marginRight, undefined);
    }
    const initialStyle = find(tree, element => element.props.testID === "standby-content").props.style;
    for (const view of ["queue", "lyrics"]) {
      const controls = overlay.render();
      find(controls, element => element.type === "StandByActions").props.onSelectPanel(view);
      const switched = overlay.render();
      assert.deepEqual(find(switched, element => element.props.testID === "standby-content").props.style, initialStyle);
      assert.equal(find(switched, element => element.type === "StandBySidePanel").props.panel, view);
      assert.equal(find(switched, element => element.type?.name === "StandByProgress"), undefined);
      assert.equal(find(switched, element => element.props.accessibilityLabel === "Pause"), undefined);
      find(switched, element => element.props.accessibilityLabel === "Back to player controls").props.onPress();
      assert.ok(find(overlay.render(), element => element.type === "StandByActions"));
    }
    const layout = getStandByLayout(dimensions.width, dimensions.height, dimensions.fontScale, noInsets);
    assert.equal(layout.controlsWidth + layout.artworkColumnWidth + layout.gap, layout.contentWidth);
    overlay.unmount();
  }
});

test("hardware Back and accessibility escape return to controls before exiting, with no retained listeners", () => {
  const f = fixture();
  const overlay = f.mount(f.StandByOverlay, props());
  overlay.render();
  assert.equal(f.backListenerCount(), 1);
  for (const view of ["queue", "lyrics"]) {
    find(overlay.render(), element => element.type === "StandByActions").props.onSelectPanel(view);
    overlay.render();
    assert.equal(f.backListenerCount(), 1);
    assert.equal(overlay.render().type, "View");
    assert.equal(f.hardwareBack(), true);
    assert.ok(find(overlay.render(), element => element.type === "StandByActions"));
    assert.equal(f.backListenerCount(), 1);
  }
  find(overlay.render(), element => element.type === "StandByActions").props.onSelectPanel("lyrics");
  find(overlay.render(), element => element.props.testID === "standby-overlay").props.onAccessibilityEscape();
  assert.ok(find(overlay.render(), element => element.type === "StandByActions"));
  find(overlay.render(), element => element.type === "StandByActions").props.onSelectPanel("queue");
  overlay.render();
  assert.equal(overlay.render(props({ visible: false })), null);
  assert.equal(f.backListenerCount(), 0);
  assert.ok(find(overlay.render(props()), element => element.type === "StandByActions"));
  overlay.unmount();
  assert.equal(f.backListenerCount(), 0);
});

test("right-half controls stay visible through Queue, Back and Reduce Motion changes", async () => {
  const f = fixture();
  const overlay = f.mount(f.StandByOverlay, props());
  overlay.render(); await f.resolveReduceMotion(false);
  const initial = overlay.render();
  find(initial, element => element.type === "StandByActions").props.onSelectPanel("queue");
  const queue = overlay.render();
  assert.equal(find(queue, element => element.props.testID === "standby-content").props.style.opacity, undefined);
  find(queue, element => element.props.accessibilityLabel === "Back to player controls").props.onPress();
  overlay.render();
  f.setReduceMotion(true);
  const still = overlay.render();
  assert.equal(find(still, element => element.props.testID === "standby-content").props.style.opacity, undefined);
  assert.ok(find(still, element => element.props.accessibilityLabel === "Pause"));
  assert.equal(f.animations.length, 0);
  overlay.unmount();
});

test("Save sits beside the title, wakes controls and reflects shared like state in every style", () => {
  for (const style of ["classic", "night", "ambient"]) {
    const f = fixture(); const calls = [];
    const values = props({ standByStyle: style, onToggleLike: () => calls.push("like"), onTouchActivity: () => calls.push("wake"), song: { id: "song", title: "A long song title that must leave room for Save", artist: "Artist" } });
    const overlay = f.mount(f.StandByOverlay, values);
    const tree = overlay.render();
    const info = find(tree, element => element.props.testID === "standby-track-info");
    const save = find(info, element => element.props.accessibilityLabel === "Save to liked songs");
    assert.ok(save, "Save is in the title row");
    assert.equal(save.props.accessibilityState.selected, false);
    save.props.onPress();
    assert.deepEqual(calls, ["wake", "like"]);
    const updated = overlay.render({ ...values, liked: true });
    assert.equal(find(updated, element => element.props.accessibilityLabel === "Remove from liked songs").props.accessibilityState.selected, true);
    assert.equal(find(updated, element => element.props.accessibilityLabel === "Show song options"), undefined);
    assert.equal(find(updated, element => element.type === "StandByActions").props.onToggleLike, undefined);
    overlay.unmount();
  }
});

function inlinePanelFixture(options = {}) {
  const f = fixture(options);
  let resolveLyrics; let rejectLyrics; let subscriptions = 0; let requests = 0;
  let snapshot = { positionMillis: 90_250, duration: 180_500 };
  const pending = new Promise((resolve, reject) => { resolveLyrics = resolve; rejectLyrics = reject; });
  const { StandBySidePanel } = load("src/features/player/components/StandBySidePanel.tsx", {
    react: f.react, "react-native": f.native, "expo-image": { Image: "Image" },
    "@/components/MusicArtwork": { MusicArtwork: "MusicArtwork" },
    "@expo/vector-icons": { MaterialIcons: "MaterialIcons", Ionicons: "Ionicons" },
    "@/utils/stringUtils": { unescapeHtml: value => value },
    "@/services/lyricsService": { getSongLyrics: () => { requests++; return pending; } },
    "@/services/audio/playbackProgressStore": {
      getPlaybackProgressSnapshot: () => snapshot,
      subscribePlaybackProgress: () => { subscriptions++; return () => { subscriptions--; }; },
    },
    "./standByLyrics": lyricsModule,
    "./QueueSleepTimer": { default: "QueueSleepTimer" },
  }, { React: f.react });
  function mount(overrides = {}) {
    const wrapper = f.mount(StandBySidePanel, { panel: "queue", song: { id: "song", title: "Current song", artist: "Artist", duration: 180.5 }, queue: [], queueIndex: 0, primaryColor: "#fff", secondaryColor: "#aaa", reduceMotion: false, onPlayQueueSong() {}, onSeek() {}, onTouchActivity() {}, ...overrides });
    const child = wrapper.render();
    return f.mount(child.type, child.props);
  }
  return { mount, resolveLyrics, rejectLyrics, subscriptions: () => subscriptions, requests: () => requests, setSnapshot: value => { snapshot = value; } };
}

test("inline queue keeps every upcoming track with bounded virtualization, exact metrics and engine actions", () => {
  const f = inlinePanelFixture({ dimensions: { fontScale: 2 } });
  const queue = Array.from({ length: 10_000 }, (_, index) => ({ id: `song-${index}`, title: `Song ${index}`, artist: "Artist" }));
  const calls = [];
  const panel = f.mount({ queue, queueIndex: 2, onTouchActivity: () => calls.push("wake"), onPlayQueueSong: song => calls.push(song.id) });
  const tree = panel.render();
  const list = find(tree, element => element.type === "FlatList");
  assert.equal(list.props.data.length, 9997);
  assert.equal(list.props.data[0], queue[3]);
  assert.equal(list.props.data.at(-1), queue.at(-1));
  assert.equal(list.props.windowSize, 5);
  assert.equal(list.props.removeClippedSubviews, false, 'native list clipping must not hide sibling artwork');
  assert.equal(list.props.initialNumToRender, 6);
  const metrics = list.props.getItemLayout(null, 27);
  assert.equal(metrics.length, 128);
  assert.equal(metrics.offset, 27 * 128);
  const row = list.props.renderItem({ item: queue[3], index: 0 });
  row.props.onPress();
  assert.deepEqual(calls, ["wake", "song-3"]);
  assert.equal(f.requests(), 0, "queue does not fetch lyrics");
  assert.equal(f.subscriptions(), 0, "queue does not subscribe to playback ticks");
  assert.equal(find(tree, element => element.type === "Modal"), undefined);
  panel.unmount();
});

test("synced inline lyrics highlight, seek with the latest duration, pause following on drag and release progress on unmount", async () => {
  const f = inlinePanelFixture(); const seeks = []; const scrolls = [];
  const panel = f.mount({ panel: "lyrics", onSeek: value => seeks.push(value), reduceMotion: true });
  assert.ok(find(panel.render(), element => element.type === "ActivityIndicator"));
  assert.equal(f.subscriptions(), 0);
  const lines = [{ time: 0, text: "First line" }, { time: 10, text: "Second line" }, { time: 90.25, text: "Current line" }];
  f.resolveLyrics({ synced: true, lines, provider: "lrclib" });
  await Promise.resolve();
  let tree = panel.render();
  assert.equal(f.subscriptions(), 1);
  const list = find(tree, element => element.type === "FlatList");
  list.props.ref.current = { scrollToIndex: value => scrolls.push(value) };
  assert.equal(list.props.extraData, 2);
  assert.equal(list.props.removeClippedSubviews, false, 'lyrics retains sibling artwork while updating its active row');
  const row = list.props.renderItem({ item: lines[2], index: 2 });
  assert.equal(row.props.accessibilityState.selected, true);
  row.props.onPress();
  f.setSnapshot({ positionMillis: 90_250, duration: 361_000 });
  row.props.onPress();
  assert.deepEqual(seeks, [0.5, 0.25]);
  const text = find(row, element => element.type === "Text");
  assert.equal(text.props.style[0].fontSize, 22);
  assert.equal(text.props.style[0].lineHeight, 30);
  assert.equal(text.props.allowFontScaling, true);
  assert.equal(text.props.numberOfLines, undefined, "long lyrics wrap without a hard cutoff");
  assert.equal(list.props.getItemLayout, undefined, "wrapped lyrics use natural height instead of fixed blank space");
  assert.equal(row.props.style[1].minHeight, 44);
  assert.equal(row.props.style[0].paddingVertical, 7, "single and wrapped lines have identical vertical padding");
  assert.equal(row.props.style[1].height, undefined);
  const offsets = [];
  list.props.ref.current.scrollToOffset = value => offsets.push(value);
  list.props.onScrollToIndexFailed({ index: 2, averageItemLength: 50 });
  assert.deepEqual(offsets.map(value => value.offset), [100]);
  list.props.onScrollBeginDrag();
  f.setSnapshot({ positionMillis: 10_000, duration: 361_000 }); panel.render();
  assert.equal(scrolls.length, 0, "following does not interrupt dragging");
  list.props.onScrollEndDrag(); list.props.onMomentumScrollBegin();
  f.setSnapshot({ positionMillis: 0, duration: 361_000 }); panel.render();
  assert.equal(scrolls.length, 0, "following does not interrupt momentum");
  list.props.onMomentumScrollEnd();
  f.setSnapshot({ positionMillis: 90_250, duration: 361_000 }); tree = panel.render();
  assert.equal(find(tree, element => element.props.accessibilityLabel === "Follow current lyrics"), undefined);
  assert.equal(find(tree, element => element.type === "Text" && element.props.children === "Lyrics"), undefined);
  assert.ok(scrolls.length > 0);
  assert.ok(scrolls.every(value => value.index === 2 && value.animated === false && value.viewPosition === 0.5));
  const activeList = find(tree, element => element.type === "FlatList");
  activeList.props.onLayout({ nativeEvent: { layout: { height: 240 } } });
  const resizedList = find(panel.render(), element => element.type === "FlatList");
  assert.equal(resizedList.props.contentContainerStyle.paddingVertical, 98, "first and last lines can reach the center of the measured viewport");
  const beforeContentUpdates = scrolls.length;
  resizedList.props.onContentSizeChange(); resizedList.props.onContentSizeChange();
  assert.equal(scrolls.length, beforeContentUpdates, "layout updates cannot restart the same active-line scroll");
  assert.equal(resizedList.props.contentInsetAdjustmentBehavior, "never");
  assert.equal(find(tree, element => element.type === "Modal"), undefined);
  panel.unmount();
  assert.equal(f.subscriptions(), 0);
});

test("plain lyrics remain readable without seeking or progress subscriptions, and missing lyrics have an inline empty state", async () => {
  for (const lines of [[{ time: 0, text: "Plain lyrics" }], []]) {
    const f = inlinePanelFixture();
    const panel = f.mount({ panel: "lyrics" });
    panel.render();
    f.resolveLyrics({ synced: false, lines, provider: "lrclib" }); await Promise.resolve();
    const list = find(panel.render(), element => element.type === "FlatList");
    assert.equal(f.subscriptions(), 0);
    if (lines.length) assert.equal(list.props.renderItem({ item: lines[0], index: 0 }).props.disabled, true);
    else assert.ok(list.props.ListEmptyComponent);
    panel.unmount();
  }
});

test("binary lyric lookup handles introductions, duplicate timestamps and invalid progress", () => {
  const lines = [{ time: 5 }, { time: 10 }, { time: 10 }, { time: 30 }];
  assert.equal(lyricsModule.getStandByLyricIndex(lines, 0), -1);
  assert.equal(lyricsModule.getStandByLyricIndex(lines, 10), 2);
  assert.equal(lyricsModule.getStandByLyricIndex(lines, 999), 3);
  assert.equal(lyricsModule.getStandByLyricIndex(lines, NaN), -1);
  assert.equal(lyricsModule.getStandByLyricIndex([], 5), -1);
});

test("progress subscribes only while standby is visible and foregrounded", () => {
  const f = fixture();
  const progress = progressFixture(f);
  progress.component.render();
  assert.equal(f.subscriptionCount(), 1);
  progress.component.render({ ...progress.props, active: false });
  assert.equal(f.subscriptionCount(), 0);
  progress.component.render(progress.props);
  assert.equal(f.subscriptionCount(), 1);
  f.setForeground(false);
  const inactive = progress.component.render();
  assert.equal(f.subscriptionCount(), 0);
  assert.equal(find(inactive, element => element.type === "PlayerSlider").props.disabled, true);
  progress.component.unmount();
});

test("seek ratios retain fractional engine durations and clamp invalid/out-of-range targets", () => {
  const f = fixture();
  const seeks = [];
  const progress = progressFixture(f, { onSeek: value => seeks.push(value) });
  const slider = find(progress.component.render(), element => element.type === "PlayerSlider").props;
  assert.equal(slider.maximumValue, 180.5);
  assert.equal(slider.value, 90.25);
  slider.onSlidingComplete(90.25);
  slider.onSlidingComplete(999);
  slider.onSlidingComplete(-2);
  slider.onSlidingComplete(NaN);
  assert.deepEqual(seeks, [0.5, 1, 0]);
});

test("unknown duration disables seeking rather than inventing a track length", () => {
  const f = fixture();
  f.setSnapshot({ positionMillis: 25_000, duration: 0, progress: 0 });
  const seeks = [];
  const progress = progressFixture(f, { song: { duration: 0 }, onSeek: value => seeks.push(value) });
  const slider = find(progress.component.render(), element => element.type === "PlayerSlider").props;
  assert.equal(slider.disabled, true);
  assert.equal(slider.value, 0);
  assert.equal(slider.accessibilityValue.text, "Duration unavailable");
  slider.onSlidingComplete(30);
  assert.deepEqual(seeks, []);
});

test("clock aligns to minute boundaries and clears its timer while hidden or backgrounded", () => {
  const f = fixture();
  const overlay = f.mount(f.StandByOverlay, props());
  const child = find(overlay.render(), element => element.type?.name === "StandByClock");
  const clock = f.mount(child.type, child.props);
  clock.render();
  assert.equal(f.timers.size, 1);
  const [timerId, timer] = [...f.timers][0];
  assert.equal(timer.delay, 54_500);
  f.timers.delete(timerId);
  f.setTime(180_020);
  timer.fn();
  clock.render();
  assert.equal([...f.timers.values()][0].delay, 59_980);
  clock.render({ ...child.props, active: false });
  assert.equal(f.timers.size, 0);
  clock.render(child.props);
  f.setForeground(false);
  clock.render();
  assert.equal(f.timers.size, 0);
  f.setForeground(true);
  clock.render();
  assert.equal(f.timers.size, 1);
  clock.unmount();
  assert.equal(f.timers.size, 0);
});


test("normal landscape keeps seek, playback and actions outside the metadata scroll area", () => {
  for (const dimensions of [{ width: 640, height: 390, fontScale: 1 }, { width: 844, height: 390, fontScale: 1 }, { width: 915, height: 412, fontScale: 1 }]) {
    const f = fixture({ dimensions, insets: { ...noInsets, left: 44, bottom: 21 } });
    const overlay = f.mount(f.StandByOverlay, props());
    const tree = overlay.render();
    const metadata = find(tree, element => element.props.testID === "standby-metadata-scroll");
    assert.ok(metadata);
    assert.equal(find(metadata, element => element.props.testID === "standby-transport"), undefined, "transport cannot scroll out with the title");
    const transport = find(tree, element => element.props.testID === "standby-transport");
    assert.equal(transport.props.style[0].flexShrink, 0);
    assert.ok(find(transport, element => element.type?.name === "StandByProgress"));
    assert.ok(find(transport, element => element.props.accessibilityLabel === "Pause"));
    assert.ok(find(transport, element => element.type === "StandByActions"));
    overlay.unmount();
  }
});

test("very short and enlarged-text windows keep every control reachable in the full-pane scroll", () => {
  for (const dimensions of [{ width: 568, height: 240, fontScale: 1 }, { width: 568, height: 320, fontScale: 1 }, { width: 844, height: 390, fontScale: 2 }]) {
    const f = fixture({ dimensions });
    const overlay = f.mount(f.StandByOverlay, props());
    const tree = overlay.render();
    assert.equal(find(tree, element => element.props.testID === "standby-metadata-scroll"), undefined);
    const scroll = find(tree, element => element.type === "ScrollView" && !element.props.horizontal);
    assert.ok(find(scroll, element => element.props.testID === "standby-track-info"));
    assert.ok(find(scroll, element => element.props.testID === "standby-transport"));
    assert.ok(find(scroll, element => element.props.accessibilityLabel === "Pause"));
    overlay.unmount();
  }
});

test("battery appears beside the date, reflects charging, and hides unknown values", () => {
  const f = fixture(); const overlay = f.mount(f.StandByOverlay, props());
  const clockElement = find(overlay.render(), element => element.type?.name === "StandByClock");
  const clock = f.mount(clockElement.type, clockElement.props);
  const clockTree = clock.render();
  const batteryElement = find(clockTree, element => element.type?.name === "StandByBattery");
  assert.ok(batteryElement);
  const battery = f.mount(batteryElement.type, batteryElement.props);
  assert.equal(battery.render().props.accessibilityLabel, "Battery 78%");
  f.setBattery(0.8, 2);
  assert.equal(battery.render().props.accessibilityLabel, "Battery 80%, charging");
  assert.equal(find(battery.render(), element => element.props.name === "battery-charging-outline").props.size, 14);
  for (const value of [-1, NaN, 1.1]) { f.setBattery(value); assert.equal(battery.render(), null); }
  f.setForeground(false);
  assert.equal(find(clock.render(), element => element.type?.name === "StandByBattery"), undefined);
  battery.unmount(); clock.unmount(); overlay.unmount();
});

test("title and progress share an inset that leaves room for the slider thumb, and header buttons are round", () => {
  const f = fixture(); const overlay = f.mount(f.StandByOverlay, props());
  const tree = overlay.render();
  const info = find(tree, element => element.props.testID === "standby-track-info");
  const progressElement = find(tree, element => element.type?.name === "StandByProgress");
  const progress = f.mount(progressElement.type, progressElement.props);
  assert.equal(progress.render().props.style.paddingHorizontal, info.props.style.paddingHorizontal);
  assert.ok(info.props.style.paddingHorizontal >= 6, "thumb including its pressed scale fits at either endpoint");
  const title = find(info, element => element.type === "PingPongScroll");
  assert.ok(title, "title uses PingPongScroll");
  assert.equal(title.props.style[0].lineHeight, 32);
  const timeRow = find(progress.render(), element => element.type === "View" && element.props.style?.marginTop < 0);
  assert.ok(timeRow, "timeRow is pulled close to progress bar with negative margin");
  for (const label of ["Exit StandBy", "StandBy style: Classic"]) {
    const button = find(tree, element => element.props.accessibilityLabel === label);
    assert.equal(button.props.style.borderRadius, button.props.style.width / 2);
    assert.ok(button.props.style.backgroundColor);
  }
  progress.unmount(); overlay.unmount();
});


test('re-entry uses current route dimensions before its first safe-area layout event', () => {
  const f=fixture(); const overlay=f.mount(f.StandByOverlay,props({rootViewport:{width:844,height:390}}));
  let tree=overlay.render();
  find(tree,node=>node.props.testID==='standby-viewport').props.onLayout({nativeEvent:{layout:{width:760,height:360}}});
  overlay.render(props({visible:false,rootViewport:{width:390,height:844}}));
  tree=overlay.render(props({rootViewport:{width:390,height:844}}));
  assert.equal(find(tree,node=>node.props.testID==='standby-artwork'),undefined,'old landscape measurement cannot crop portrait re-entry');
  overlay.unmount();
});


test('artwork and every control share one cancellable native dim/wake fade', async () => {
  const f=fixture(); const overlay=f.mount(f.StandByOverlay,props());
  overlay.render(); await f.resolveReduceMotion(false); overlay.render();
  let tree=overlay.render(props({controlsDimmed:true}));
  const root=find(tree,node=>node.props.testID==='standby-viewport');
  const dim=f.animations.at(-1);
  assert.equal(dim.value,root.props.style[1].opacity);
  assert.equal(dim.config.toValue,0.72); assert.equal(dim.config.duration,450);
  assert.equal(dim.config.useNativeDriver,true); assert.equal(dim.config.isInteraction,false);
  assert.ok(find(root,node=>node.props.testID==='standby-artwork'));
  assert.ok(find(root,node=>node.props.testID==='standby-playback-controls'));
  tree=overlay.render(props({controlsDimmed:false}));
  const wake=f.animations.at(-1);
  assert.equal(dim.stopped,true,'touch interrupts dimming immediately');
  assert.equal(wake.value,dim.value); assert.equal(wake.config.toValue,1);
  assert.equal(wake.config.duration,dim.config.duration);
  overlay.unmount(); assert.equal(wake.stopped,true);
});


test("landscape content balances top and bottom safe-area space without a fixed offset", () => {
  const f=fixture({dimensions:{width:844,height:390,fontScale:1},insets:{...noInsets,bottom:21}});
  const overlay=f.mount(f.StandByOverlay,props());const tree=overlay.render();
  const root=find(tree,node=>node.props.testID==='standby-viewport');
  assert.equal(root.props.style[1].paddingTop,37);
  assert.equal(root.props.style[1].paddingBottom,37);
  const safeArea=find(tree,node=>node.props.testID==='standby-overlay');
  assert.deepEqual(Array.from(safeArea.props.edges),['left','right']);
  overlay.unmount();
});


test("clock sizing stays consistent when safe-area spacing changes", () => {
  const insets={...noInsets,bottom:0};const f=fixture({insets});const overlay=f.mount(f.StandByOverlay,props());
  let tree=overlay.render();let clock=find(tree,node=>node.type?.name==='StandByClock');
  assert.equal(clock.props.compact,false);
  insets.bottom=34;tree=overlay.render();clock=find(tree,node=>node.type?.name==='StandByClock');
  assert.equal(clock.props.compact,false,'safe-area padding does not switch the time font size');
  const clockView=f.mount(clock.type,clock.props);
  const date=find(clockView.render(),node=>node.type==='Text'&&node.props.style?.[0]?.fontSize===11);
  assert.equal(date.props.adjustsFontSizeToFit,undefined);
  assert.equal(date.props.style[0].lineHeight,14);
  clockView.unmount();overlay.unmount();
});
