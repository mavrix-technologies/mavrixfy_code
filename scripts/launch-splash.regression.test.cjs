const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
    return imports[name];
  }, ...globals });
  return module.exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

test("native splash waits for registration and coalesces ready/error handoffs", async () => {
  const retained = deferred(); let hides = 0;
  const options = [];
  const native = load("src/features/launch/nativeSplash.ts", {
    "@/lib/logger": { logger: { warn() {} } },
    "expo-constants": { __esModule: true, default: { executionEnvironment: "bare" } },
    "expo-splash-screen": {
      preventAutoHideAsync: () => retained.promise,
      setOptions: value => options.push(value),
      hideAsync: async () => { hides++; },
    },
  });
  const first = native.hideNativeSplash("ready");
  assert.equal(first, native.hideNativeSplash("error"));
  await flush(); assert.equal(hides, 0);
  retained.resolve(true); await first;
  assert.equal(hides, 1);
  assert.equal(options[0].duration, 0, "JS owns the fade; do not double-animate native exit");
});

test("failed splash retention still attempts hide and hide failure cannot reject startup", async () => {
  let hides = 0; const warnings = [];
  const native = load("src/features/launch/nativeSplash.ts", {
    "@/lib/logger": { logger: { warn: (...args) => warnings.push(args) } },
    "expo-constants": { __esModule: true, default: { executionEnvironment: "storeClient" } },
    "expo-splash-screen": {
      preventAutoHideAsync: async () => { throw Error("No native splash screen registered"); },
      setOptions: () => assert.fail("Expo Go should not change native animation options"),
      hideAsync: async () => { hides++; throw Error("native exit failed"); },
    },
  });
  await native.hideNativeSplash("recovery");
  assert.equal(hides, 1); assert.equal(warnings.length, 1);
});

function fixture(options = {}) {
  let owner, serial = 0, hides = 0, completed = 0, now = 0, flushing = false;
  const timers = new Map(), animations = new Map(), watchers = new Set(), pendingRN = [], starts = [], values = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    memo: fn => fn,
    useState(initial) {
      const current = owner, i = current.cursor++;
      if (!(i in current.slots)) current.slots[i] = typeof initial === "function" ? initial() : initial;
      return [current.slots[i], next => {
        current.slots[i] = typeof next === "function" ? next(current.slots[i]) : next;
      }];
    },
    useRef(initial) { const i = owner.cursor++; return owner.slots[i] || (owner.slots[i] = { current: initial }); },
    useMemo(fn, deps) {
      const i = owner.cursor++;
      if (!owner.slots[i] || !equal(owner.slots[i].deps, deps)) owner.slots[i] = { deps, value: fn() };
      return owner.slots[i].value;
    },
    useEffect(fn, deps) {
      const current = owner, i = current.cursor++;
      if (!current.slots[i] || !equal(current.slots[i].deps, deps)) {
        const previous = current.slots[i]; current.slots[i] = { deps };
        current.effects.push(() => { previous?.cleanup?.(); current.slots[i].cleanup = fn(); });
      }
    },
  };
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  function reactOnUI() {
    if (flushing) return;
    flushing = true;
    let changed;
    do {
      changed = false;
      for (const watcher of watchers) {
        const next = watcher.prepare();
        if (!Object.is(next, watcher.previous)) {
          const previous = watcher.previous; watcher.previous = next; changed = true;
          watcher.respond(next, previous);
        }
      }
    } while (changed);
    flushing = false;
  }
  function cancelAnimation(value) {
    const animation = animations.get(value);
    animations.delete(value); animation?.callback?.(false);
  }
  function shared(initial) {
    const slot = { current: initial, get() { return this.current; }, set(next) {
      cancelAnimation(slot);
      if (next?.timing) {
        const animation = { ...next, value: slot, from: slot.current, at: now };
        animations.set(slot, animation); starts.push(animation);
      } else { slot.current = next; reactOnUI(); }
    } };
    values.push(slot); return slot;
  }
  const jsx = (type, props) => ({ type, props });
  const easing = {
    linear: t => t, cubic: t => t ** 3,
    inOut: fn => t => t < .5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2,
  };
  const motion = load("src/features/launch/launchMotion.ts", {
    "../../../assets/branding/mavrixfy-bars.json": require("../assets/branding/mavrixfy-bars.json"),
    "../../../assets/branding/launch-motion.json": require("../assets/branding/launch-motion.json"),
  });
  const imports = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "../../../assets/branding/mavrixfy-bars.json": require("../assets/branding/mavrixfy-bars.json"),
    "../../../assets/branding/launch-motion.json": require("../assets/branding/launch-motion.json"),
    "./launchMotion": motion,
    "react-native-svg": { __esModule: true, default: "Svg", Defs: "Defs", LinearGradient: "LinearGradient", Rect: "Rect", Stop: "Stop" },
    "./nativeSplash": { hideNativeSplash: () => { hides++; return options.hidden || Promise.resolve(); } },
    "react-native-worklets": { scheduleOnRN: fn => pendingRN.push(fn) },
    "react-native": { View: "View", StyleSheet: { create: value => value, absoluteFillObject: { position: "absolute" } } },
    "react-native-reanimated": {
      __esModule: true, default: { View: "Animated.View" }, Easing: easing, ReduceMotion: { Never: "never" },
      useSharedValue: initial => react.useMemo(() => shared(initial), []),
      useReducedMotion: () => !!options.reduceMotion,
      useAnimatedStyle: fn => ({ snapshot: fn }),
      useAnimatedProps: fn => ({ snapshot: fn }),
      withTiming: (to, config, callback) => ({ timing: true, to, config, callback }),
      cancelAnimation,
      useAnimatedReaction(prepare, respond) {
        const watcher = react.useMemo(() => ({ prepare, respond }), []);
        watcher.prepare = prepare; watcher.respond = respond;
        react.useEffect(() => { watchers.add(watcher); reactOnUI(); return () => watchers.delete(watcher); }, [watcher]);
      },
    },
  };
  const globals = {
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  function mount(Component, initialProps) {
    const current = { slots: [], effects: [], props: initialProps, cursor: 0 };
    return {
      render(nextProps) {
        if (nextProps) current.props = nextProps;
        owner = current; current.cursor = 0;
        const tree = Component(current.props);
        const work = current.effects; current.effects = []; work.forEach(fn => fn());
        return tree;
      },
      unmount: () => current.slots.forEach(slot => slot?.cleanup?.()),
    };
  }
  function advanceUI(ms) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 8);
      const finished = [];
      for (const [slot, animation] of [...animations]) {
        const t = Math.min(1, (now - animation.at) / animation.config.duration);
        slot.current = animation.from + (animation.to - animation.from) * (animation.config.easing || easing.linear)(t);
        if (t === 1) { animations.delete(slot); finished.push(animation); }
      }
      reactOnUI();
      finished.forEach(animation => animation.callback?.(true));
    }
  }
  const { LaunchSplash } = load("src/features/launch/LaunchSplash.tsx", imports, globals);
  const props = { ready: options.ready ?? true, onComplete: () => { completed++; } };
  const instance = mount(LaunchSplash, props);
  function logoLaidOut() {
    const tree = instance.render(); tree.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } });
    tree.props.children.props.onLayout({ nativeEvent: { layout: { width: 224, height: 224 } } }); return instance.render();
  }
  return { imports, globals, mount, props, instance, logoLaidOut, advanceUI, animations, starts, timers, values, pendingRN, motion,
    flushRN: () => { const work = pendingRN.splice(0); work.forEach(fn => fn()); },
    get hides() { return hides; }, get completed() { return completed; } };
}

test("reveal starts before app readiness and ready changes never restart it", async () => {
  const f = fixture({ ready: false });
  f.instance.render(); await flush(); assert.equal(f.hides, 0);
  f.logoLaidOut(); await flush();
  assert.equal(f.hides, 1); assert.equal(f.starts.length, 1);
  const clock = f.values[0];
  f.advanceUI(160); const position = clock.get(); assert(position > 0);
  f.props.ready = true; f.instance.render();
  assert.equal(f.starts.length, 1); assert.equal(clock.get(), position);
  assert.equal(f.hides, 1);
  f.instance.unmount();
});

test("transient zero-sized layouts cannot hide native splash before the overlay is visible", async () => {
  const f = fixture(); const tree = f.instance.render();
  const zero = { nativeEvent: { layout: { width: 0, height: 0 } } };
  tree.props.onLayout(zero); tree.props.children.props.onLayout(zero); f.instance.render(); await flush();
  assert.equal(f.hides, 0); assert.equal(f.starts.length, 0);
  f.logoLaidOut(); await flush(); assert.equal(f.hides, 1); f.instance.unmount();
});

test("all bars share one UI clock and native launch has no orphan first stroke", () => {
  const { PNG } = require("pngjs");
  const config = JSON.parse(fs.readFileSync("app.json", "utf8")).expo.plugins.find(p => p[0] === "expo-splash-screen")[1];
  const native = PNG.sync.read(fs.readFileSync(config.image));
  for (let i=3; i<native.data.length; i+=4) assert.equal(native.data[i], 0);
  const f = fixture(); const tree = f.instance.render(), logo = tree.props.children;
  assert.equal(logo.props.style.width, config.imageWidth);
  assert.equal(tree.props.style[0].backgroundColor, config.backgroundColor);
  const lines = logo.props.children; assert.equal(lines.length, 10);
  assert(lines.every(line => line.props.clock === lines[0].props.clock));
  for (const line of lines) {
    const bar = f.mount(line.type, line.props);
    const view = bar.render();
    assert.equal(view.props.style[1].snapshot().opacity, 0, "every line starts invisible");
    assert(view.props.renderToHardwareTextureAndroid && view.props.shouldRasterizeIOS);
    bar.unmount();
  }
  f.instance.unmount();
});

test("fast startup fades on the UI thread without an intermediate JS callback or settle timer", async () => {
  const f = fixture(); f.logoLaidOut(); await flush();
  assert.equal(f.starts.length, 1); assert.equal(f.pendingRN.length, 0);
  f.advanceUI(f.motion.LAUNCH_REVEAL_MS - 8);
  assert.equal(f.values[1].get(), 1); assert.equal(f.starts.length, 1);
  f.advanceUI(8); assert.equal(f.starts.length, 2, "fade starts directly when the shared clock finishes");
  const fade = f.starts[1]; assert.equal(fade.to, 0); assert.equal(fade.config.duration, 180);
  f.advanceUI(180);
  assert.equal(f.values[1].get(), 0, "UI completes even while RN callbacks are deliberately not serviced");
  assert.equal(f.completed, 0); assert.equal(f.pendingRN.length, 1);
  const notify = f.pendingRN[0]; f.flushRN(); notify(); assert.equal(f.completed, 1);
  assert.equal(f.timers.size, 1, "only the lost-completion watchdog uses a timer");
  f.instance.unmount();
});

test("slow startup holds the completed logo and fades immediately when the screen becomes ready", async () => {
  const f = fixture({ ready: false }); f.logoLaidOut(); await flush();
  f.advanceUI(2500);
  assert.equal(f.values[0].get(), f.motion.LAUNCH_REVEAL_MS);
  assert.equal(f.values[1].get(), 1); assert.equal(f.completed, 0);
  assert.equal(f.starts.length, 1);
  f.props.ready = true; f.instance.render();
  assert.equal(f.starts.length, 2);
  f.advanceUI(180); f.flushRN(); assert.equal(f.completed, 1);
  assert.equal(f.hides, 1); f.instance.unmount();
});

test("Reduce Motion skips reveal and waits only for screen readiness before its short fade", async () => {
  const f = fixture({ ready: false, reduceMotion: true }); f.logoLaidOut(); await flush();
  assert.equal(f.values[0].get(), f.motion.LAUNCH_REVEAL_MS); assert.equal(f.starts.length, 0);
  f.props.ready = true; f.instance.render();
  assert.equal(f.starts[0].config.duration, 120);
  f.advanceUI(120); f.flushRN(); assert.equal(f.completed, 1); f.instance.unmount();
});

test("unmount cancels pending handoff and active motion, and ignores a queued RN completion", async () => {
  const hidden = deferred(), pending = fixture({ hidden: hidden.promise });
  pending.logoLaidOut(); pending.instance.unmount(); hidden.resolve(); await flush();
  assert.equal(pending.animations.size, 0);
  assert.equal(pending.completed, 0);
  const running = fixture(); running.logoLaidOut(); await flush();
  running.advanceUI(100); running.instance.unmount();
  assert.equal(running.animations.size, 0); assert.equal(running.completed, 0);
  const ending = fixture(); ending.logoLaidOut(); await flush();
  ending.advanceUI(ending.motion.LAUNCH_REVEAL_MS + 180);
  ending.instance.unmount(); ending.flushRN(); assert.equal(ending.completed, 0);
});

test("native hide acknowledgement cannot stall the reveal or hold an invisible touch blocker", async () => {
  const hidden = deferred();
  const f = fixture({ hidden: hidden.promise });
  const tree = f.logoLaidOut();
  assert.equal(f.starts.length, 1);
  assert.equal(tree.props.animatedProps.snapshot().pointerEvents, 'auto');
  f.advanceUI(f.motion.LAUNCH_REVEAL_MS + 180);
  assert.equal(tree.props.animatedProps.snapshot().pointerEvents, 'none');
  assert.equal(f.completed, 0, 'RN completion can remain busy while native touches are released');
  f.flushRN();
  assert.equal(f.completed, 1);
  hidden.resolve(); await flush();
  assert.equal(f.starts.length, 2, 'late native acknowledgement cannot replay the reveal');
  f.instance.unmount();
});

test("a cancelled fade or lost RN completion recovers once, only after the destination is ready", async () => {
  const f = fixture({ ready: false }); f.logoLaidOut();
  assert.equal(f.timers.size, 0, 'loading/authentication must not be bypassed by a splash timeout');
  f.advanceUI(f.motion.LAUNCH_REVEAL_MS);
  f.props.ready = true; f.instance.render();
  const timer = [...f.timers.values()][0];
  assert.ok(timer.ms > f.motion.LAUNCH_REVEAL_MS + 180);
  f.animations.clear();
  timer.fn(); timer.fn(); f.flushRN();
  assert.equal(f.completed, 1);
  f.instance.unmount();
  assert.equal(f.timers.size, 0);
});

test("bar geometry is continuous, bounded and reaches the same final logo at different frame rates", () => {
  const f = fixture(), end = f.motion.LAUNCH_REVEAL_MS;
  for (const step of [1000/120, 1000/60, 1000/30]) for (let index=0; index<10; index++) {
    let previousOpacity = 0, previousY = Infinity;
    for (let t=0; t<=end; t+=step) {
      const frame = f.motion.getLaunchBarFrame(t, index);
      assert(frame.opacity >= previousOpacity && frame.opacity >= 0 && frame.opacity <= 1);
      assert(frame.translateY <= previousY && frame.translateY >= 0);
      assert(frame.scaleY >= .12 && frame.scaleY <= 1.02);
      previousOpacity = frame.opacity; previousY = frame.translateY;
    }
    const final = f.motion.getLaunchBarFrame(end, index);
    assert.equal(final.opacity, 1); assert.equal(final.translateY, 0); assert.equal(final.scaleY, 1);
  }
});

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const result = find(child, predicate); if (result) return result;
  }
}

test("startup belongs to the app root, survives auth remounts, and schedules ads only after exit", () => {
  const f = fixture(); const imports = {};
  const source = ts.createSourceFile("root.tsx", fs.readFileSync("app/_layout.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const noop = () => {};
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const entry = { __esModule: true, default: noop };
    for (const name of statement.importClause?.namedBindings?.elements || []) entry[name.propertyName?.text || name.name.text] = noop;
    imports[statement.moduleSpecifier.text] = entry;
  }
  let authenticated = true, replacements = 0, ads = 0, fontsLoaded = false;
  const idleJobs = [], maintenance = [];
  let segments = ["(tabs)"];
  Object.assign(imports, {
    react: f.imports.react, "react/jsx-runtime": f.imports["react/jsx-runtime"],
    "react-native": { ...f.imports["react-native"], Platform: { OS: "ios" }, View: "View", LogBox: { ignoreLogs: noop } },
    "@/constants/colors": { __esModule: true, default: { background: "#121212" } },
    "react-native-paper": { MD3DarkTheme: { colors: {} }, PaperProvider: "PaperProvider" },
    "expo-font": { useFonts: () => [fontsLoaded] },
    "@/utils/idleTask": { runAfterIdle: fn => { idleJobs.push(fn); return noop; } },
    "@/lib/remoteConfig": { initRemoteConfig: () => maintenance.push("config") },
    "@/lib/analytics": { logAppOpen: () => maintenance.push("analytics") },
    "@/services/audio/audioEqualizer": { syncEqualizerWithNative: () => maintenance.push("equalizer") },
    "expo-router": { Stack: Object.assign(noop, { Screen: "Stack.Screen" }),
      useRouter: () => ({ replace: () => { replacements++; } }), useSegments: () => segments },
    "@/contexts/AuthContext": { AuthProvider: "AuthProvider", useAuth: () => ({ loading: false, isAuthenticated: authenticated, isGuest: false }) },
    "@/features/launch/LaunchSplash": { LaunchSplash: "LaunchSplash" },
    "@/features/launch/nativeSplash": { hideNativeSplash: async () => {} },
    "@/services/ads/appLaunchAdService": { showAppLaunchAd: () => { ads++; } },
  });
  const rootModule = load("app/_layout.tsx", imports, { ...f.globals, __DEV__: false });
  const root = f.mount(rootModule.default);
  let tree = root.render();
  assert.ok(find(tree, node => node.type === "LaunchSplash"), "intro mounts before fonts finish");
  assert.ok(find(tree, node => node.type === "AuthProvider"), "auth starts in parallel with fonts");
  assert.equal(find(tree, node => node.type?.name === "RootLayoutNav"), undefined);
  fontsLoaded = true; tree = root.render();
  let launch = find(tree, node => node.type === "LaunchSplash");
  assert.equal(launch.props.ready, false);
  let nav = find(tree, node => node.type?.name === "RootLayoutNav");
  authenticated = false;
  const guard = f.mount(nav.type, nav.props); guard.render(); guard.unmount();
  assert.equal(replacements, 1, "initial protected route redirects before revealing the app");
  tree = root.render(); assert.equal(find(tree, node => node.type === "LaunchSplash").props.ready, false);
  segments = ["login"];
  nav = find(tree, node => node.type?.name === "RootLayoutNav");
  const before = f.mount(nav.type, nav.props);
  const navTree = before.render();
  tree = root.render(); assert.equal(find(tree, node => node.type === "LaunchSplash").props.ready, false, "navigation must lay out before exit");
  navTree.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } }); before.render();
  assert.equal([...f.timers.values()].some(timer => timer.ms === 1200), false);
  tree = root.render(); launch = find(tree, node => node.type === "LaunchSplash");
  assert.equal(launch.props.ready, true);
  assert.equal(idleJobs.length, 0, "maintenance does not compete with the intro or first Home layout");
  launch.props.onComplete(); before.unmount();
  tree = root.render(); assert.equal(find(tree, node => node.type === "LaunchSplash"), undefined);
  assert.equal(maintenance.length, 0);
  assert.equal(idleJobs.length, 1); idleJobs[0]();
  assert.deepEqual(maintenance, ["config", "analytics", "equalizer"]);
  // AuthProvider replaces its keyed children on sign-in, while RootLayout stays mounted.
  authenticated = true; segments = ["(tabs)"];
  nav = find(tree, node => node.type?.name === "RootLayoutNav");
  const remounted = f.mount(nav.type, nav.props); remounted.render();
  const adTimer = [...f.timers.values()].find(timer => timer.ms === 1200);
  assert.ok(adTimer); adTimer.fn(); assert.equal(ads, 1);
  tree = root.render(); assert.equal(find(tree, node => node.type === "LaunchSplash"), undefined);
  remounted.unmount(); root.unmount();
});
