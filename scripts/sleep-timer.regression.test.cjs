const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, ...globals,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}

const duration = load("src/services/audio/sleepTimerDuration.ts");

function hooks() {
  const states = [], refs = [], effects = [], cleanups = [], callbacks = [];
  let stateIndex, refIndex, effectIndex, callbackIndex;
  return {
    reset() { stateIndex = refIndex = effectIndex = callbackIndex = 0; },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); },
    react: {
      useCallback(fn, deps) {
        const index = callbackIndex++;
        if (!callbacks[index] || deps.some((value, i) => value !== callbacks[index].deps[i])) callbacks[index] = { fn, deps };
        return callbacks[index].fn;
      },
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
      },
      useRef(initial) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
      useEffect(fn, deps) {
        const index = effectIndex++;
        if (!effects[index] || deps.some((value, i) => value !== effects[index][i])) {
          cleanups[index]?.(); cleanups[index] = fn(); effects[index] = deps;
        }
      },
    },
  };
}

function timerFixture() {
  const runtime = hooks(), timeouts = new Map(), toasts = [];
  let nextId = 1, expired = 0;
  const onTimerExpire = () => { expired++; };
  const { useAudioSleepTimer } = load("src/services/audio/audioSleepTimer.ts", {
    react: runtime.react,
    "./sleepTimerDuration": duration,
    "@/utils/globalToast": { showGlobalToast: text => toasts.push(text) },
  }, {
    Date: { now: () => 100000 },
    setTimeout: (callback, delay) => { const id = nextId++; timeouts.set(id, { callback, delay }); return id; },
    clearTimeout: id => timeouts.delete(id),
  });
  const render = () => { runtime.reset(); return useAudioSleepTimer({ onTimerExpire }); };
  return { render, timeouts, toasts, expired: () => expired, unmount: runtime.unmount };
}

function editorFixture(timer = null) {
  const runtime = hooks(), selected = [];
  let returned = 0, cleared = 0;
  const jsx = (type, props) => ({ type, props });
  const Picker = "Picker";
  const Timer = load("src/features/player/components/QueueSleepTimer.tsx", {
    react: runtime.react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@react-native-picker/picker": { Picker },
    "react-native": { View: "View", Text: "Text", ScrollView: "ScrollView", Pressable: "Pressable", Platform: { OS: "ios" }, StyleSheet: { create: x => x, absoluteFillObject: {}, hairlineWidth: 1 } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 34 }) },
    "@/constants/colors": { __esModule: true, default: { primary: "green" } },
    "@/contexts/PlayerContext": { usePlayerActions: () => ({ sleepTimer: timer, setSleepTimer: x => selected.push(x), clearSleepTimer: () => { cleared++; } }) },
    "@/services/audio/sleepTimerDuration": duration,
  });
  function render() {
    runtime.reset();
    const tree = Timer.default({ onBack: () => { returned++; } });
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node); visit(node.props?.children);
    }
    visit(tree);
    return { nodes, pickers: nodes.filter(x => x.type === Picker), buttons: nodes.filter(x => x.type === "Pressable") };
  }
  return { render, selected, returned: () => returned, cleared: () => cleared };
}

test("timer accepts whole-minute durations only within the native duration range", () => {
  for (const value of [1, 5, 37, 125, 1439]) assert.equal(duration.isValidSleepTimerDuration(value), true);
  for (const value of [0, -1, 1.5, NaN, Infinity, 1440]) assert.equal(duration.isValidSleepTimerDuration(value), false);
  assert.equal(duration.formatSleepTimerDuration(37), "37 min");
  assert.equal(duration.formatSleepTimerDuration(60), "1 hr");
  assert.equal(duration.formatSleepTimerDuration(125), "2 hr 5 min");
});

test("custom timer expires once, updates its deadline, and clears active state", () => {
  const f = timerFixture();
  f.render().setSleepTimer(37);
  const active = f.render();
  assert.equal(active.sleepTimer.label, "37 min");
  assert.equal(active.sleepTimer.endsAt, 100000 + 37 * 60000);
  const scheduled = [...f.timeouts.values()][0];
  assert.equal(scheduled.delay, 37 * 60000);
  scheduled.callback();
  assert.equal(f.expired(), 1);
  assert.equal(f.render().sleepTimer, null);
  assert.equal(f.timeouts.size, 0);
});

test("invalid selection preserves the timer, replacement cancels the old deadline, and unmount clears it", () => {
  const f = timerFixture();
  f.render().setSleepTimer(125);
  const first = [...f.timeouts.keys()][0];
  f.render().setSleepTimer(0);
  assert.equal(f.timeouts.has(first), true);
  assert.equal(f.render().sleepTimer.label, "2 hr 5 min");
  f.render().setSleepTimer(22);
  assert.equal(f.timeouts.has(first), false);
  assert.equal(f.timeouts.size, 1);
  f.unmount();
  assert.equal(f.timeouts.size, 0);
  assert.equal(f.expired(), 0);
});

test("end of queue removes a timed deadline and Turn off clears both modes", () => {
  const f = timerFixture();
  f.render().setSleepTimer(30);
  f.render().setSleepTimer("end-of-stack");
  assert.equal(f.timeouts.size, 0);
  assert.equal(f.render().sleepTimer.mode, "end-of-stack");
  assert.equal(f.render().sleepTimer.endsAt, null);
  f.render().clearSleepTimer();
  assert.equal(f.render().sleepTimer, null);
});

test("native picker edits arbitrary hours/minutes without starting a timer until confirmed", () => {
  const f = editorFixture();
  let ui = f.render();
  assert.equal(ui.pickers[0].props.selectedValue, 0);
  assert.equal(ui.pickers[1].props.selectedValue, 30);
  // Both events can arrive before React commits the other picker update.
  ui.pickers[0].props.onValueChange(2);
  ui.pickers[1].props.onValueChange(17);
  assert.equal(f.selected.length, 0);
  ui = f.render();
  assert.equal(ui.pickers[0].props.selectedValue, 2);
  assert.equal(ui.pickers[1].props.selectedValue, 17);
  ui.buttons.find(x => x.props.disabled === false).props.onPress();
  assert.deepEqual(f.selected, [137]);
  assert.equal(f.returned(), 1);
});

test("zero duration disables Start and Back does not alter an existing timer", () => {
  const f = editorFixture();
  f.render().pickers[1].props.onValueChange(0);
  const ui = f.render();
  assert.equal(ui.buttons.find(x => "disabled" in x.props).props.disabled, true);
  ui.buttons.find(x => x.props.accessibilityLabel === "Back to queue").props.onPress();
  assert.deepEqual(f.selected, []);
  assert.equal(f.returned(), 1);
  assert.equal(f.cleared(), 0);
});

test("an active timer initializes from remaining duration and Turn off returns to the queue", () => {
  const f = editorFixture({ mode: "duration", label: "1 hr", endsAt: Date.now() + 12 * 60000 });
  const ui = f.render();
  assert.equal(ui.pickers[0].props.selectedValue, 0);
  assert.equal(ui.pickers[1].props.selectedValue, 12);
  ui.buttons.find(x => x.props.accessibilityLabel === "Turn off sleep timer").props.onPress();
  assert.equal(f.cleared(), 1);
  assert.equal(f.returned(), 1);
});
