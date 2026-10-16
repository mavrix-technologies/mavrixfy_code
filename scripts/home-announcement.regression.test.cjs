const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function fixture(options = {}) {
  let slots = [], cursor = 0, effects = [], dirty = false, value;
  let now = 1_000_000_000, serial = 0, showcaseListener;
  const timers = new Map(), storage = options.storage || new Map();
  const mode = { focused: true, active: true, player: "collapsed", ready: true, reader: false };
  const scrollY = { value: 0 };
  const config = { enabled: true, items: [{ text: "Offer", linkUrl: "https://example.com" }], ...options.config };
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => {
        const result = typeof next === "function" ? next(slots[i]) : next;
        if (!Object.is(result, slots[i])) { slots[i] = result; dirty = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  const imports = {
    react,
    "@react-native-async-storage/async-storage": {
      __esModule: true, default: {
        getItem: options.readHistory || (async key => storage.get(key) ?? null),
        setItem: async (key, data) => { storage.set(key, data); },
      },
    },
    "expo-router": { useIsFocused: () => mode.focused },
    "react-native": { AccessibilityInfo: {
      isScreenReaderEnabled: async () => mode.reader,
      addEventListener: () => ({ remove() {} }),
    } },
    "react-native-reanimated": { useAnimatedReaction(prepare, respond) {
      const previous = react.useRef(null), next = prepare();
      if (next !== previous.current) { const old = previous.current; previous.current = next; respond(next, old); }
    } },
    "react-native-worklets": { scheduleOnRN: (fn, ...args) => fn(...args) },
    "@/lib/appActivity": { useAppIsActive: () => mode.active },
    "@/lib/playerUIState": { usePlayerUIState: () => mode.player },
    "./useAppShowcasePrompt": { subscribeAppShowcaseModal(fn) { showcaseListener = fn; return () => { showcaseListener = undefined; }; } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/features/home/hooks/useHomeAnnouncement.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date: { now: () => now },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    require(name) { if (!(name in imports)) throw new Error(name); return imports[name]; },
  });
  function render() {
    let count = 0;
    do {
      dirty = false; cursor = 0;
      value = module.exports.useHomeAnnouncement(config, scrollY, mode.ready);
      const work = effects; effects = []; work.forEach(fn => fn());
      if (++count > 20) throw new Error("Hook render loop");
    } while (dirty);
    return value;
  }
  async function settle() { for (let i = 0; i < 4; i++) await Promise.resolve(); return render(); }
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= target);
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await settle();
    }
    now = target;
    return settle();
  }
  return { mode, config, scrollY, storage, timers, render, settle, advance,
    showcase: visible => showcaseListener(visible),
    unmount: () => slots.forEach(slot => slot?.cleanup?.()),
  };
}

test("promotion appears after a delay, closes after eight seconds, and does not repeat on tab changes", async () => {
  const f = fixture(); await f.settle();
  assert.equal((await f.advance(2999)).visible, false);
  assert.equal((await f.advance(1)).visible, true);
  assert.equal((await f.advance(7999)).visible, true);
  assert.equal((await f.advance(1)).visible, false);
  f.mode.focused = false; f.render(); f.mode.focused = true; f.render();
  assert.equal((await f.advance(60_000)).visible, false);
  assert.equal(f.storage.size, 1);
});

test("persisted cooldown prevents another presentation after restart and allows a later session", async () => {
  const key = "@mavrixfy_home_announcement_last_shown_v1";
  const storage = new Map([[key, String(1_000_000_000 - 60 * 60 * 1000)]]);
  const recent = fixture({ storage }); await recent.settle();
  assert.equal((await recent.advance(3000)).visible, false);
  storage.set(key, String(1_000_000_000 - 7 * 60 * 60 * 1000));
  const later = fixture({ storage }); await later.settle();
  assert.equal((await later.advance(3000)).visible, true);
});

test("delayed presentation waits for Home at the top, foreground activity, and the expanded player to close", async () => {
  const f = fixture(); await f.settle(); await f.advance(1000);
  f.scrollY.value = 100; f.render();
  assert.equal((await f.advance(5000)).visible, false);
  f.scrollY.value = 0; f.mode.player = "expanded"; f.render();
  assert.equal((await f.advance(5000)).visible, false);
  f.mode.player = "collapsed"; f.mode.active = false; f.render();
  assert.equal((await f.advance(5000)).visible, false);
  f.mode.active = true; f.render();
  assert.equal((await f.advance(3000)).visible, true);
});

test("auto-close counts foreground viewing time and pauses behind the showcase and other tabs", async () => {
  const f = fixture(); await f.settle(); await f.advance(3000); await f.advance(2000);
  f.showcase(true); f.render(); assert.equal((await f.advance(20_000)).visible, true);
  f.showcase(false); f.mode.focused = false; f.render();
  assert.equal((await f.advance(20_000)).visible, true);
  f.mode.focused = true; f.render();
  assert.equal((await f.advance(5999)).visible, true);
  assert.equal((await f.advance(1)).visible, false);
});

test("manual close and the remote disable switch cannot replay a presentation in the same session", async () => {
  const f = fixture(); await f.settle(); let current = await f.advance(3000);
  current.dismiss(); assert.equal(f.render().visible, false);
  assert.equal((await f.advance(60_000)).visible, false);
  const remote = fixture(); await remote.settle(); await remote.advance(3000);
  remote.config.enabled = false; assert.equal(remote.render().visible, false);
  remote.config.enabled = true; assert.equal(remote.render().visible, false);
});

test("async storage completing after blur cannot present on an inactive screen", async () => {
  let resolve;
  const f = fixture({ readHistory: () => new Promise(done => { resolve = done; }) });
  await f.settle(); await f.advance(3000);
  f.mode.focused = false; f.render(); resolve(null);
  assert.equal((await f.settle()).visible, false);
  assert.equal(f.storage.size, 0);
});

test("screen-reader users retain the link until they close the message", async () => {
  const f = fixture(); f.mode.reader = true; await f.settle(); await f.advance(3000);
  assert.equal((await f.advance(60_000)).visible, true);
  f.render().dismiss(); assert.equal(f.render().visible, false);
});

test("configured duration is honored and unmount cancels pending presentation", async () => {
  const f = fixture({ config: { displaySeconds: 4, showDelaySeconds: 0 } }); await f.settle();
  assert.equal((await f.advance(0)).visible, true);
  assert.equal((await f.advance(4000)).visible, false);
  const pending = fixture(); await pending.settle(); pending.unmount();
  assert.equal(pending.timers.size, 0);
});
