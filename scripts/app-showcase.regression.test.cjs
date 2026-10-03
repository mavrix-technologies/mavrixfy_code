const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(settings = { streamingQuality: "medium" }, history = null, isDev = false) {
  let focus, timer, saved, scheduledDelay;
  const alerts = [],
    routes = [];
  const state = { currentState: "active" };
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync("src/features/home/hooks/useAppShowcasePrompt.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    __DEV__: isDev,
    globalThis: {},
    module,
    exports: module.exports,
    setTimeout: (fn, delay) => {
      timer = fn;
      scheduledDelay = delay;
      return 1;
    },
    clearTimeout() {},
    require(name) {
      if (name === "react") return { useCallback: (fn) => fn };
      if (name === "expo-router")
        return {
          useFocusEffect: (fn) => {
            focus = fn;
          },
          useRouter: () => ({ push: (route) => routes.push(route) }),
        };
      if (name === "react-native")
        return {
          Platform: { OS: "android" },
          AppState: state,
          Alert: { alert: (...args) => alerts.push(args) },
        };
      if (name.includes("async-storage"))
        return {
          getItem: async () => history && JSON.stringify(history),
          setItem: async (_, value) => {
            saved = JSON.parse(value);
          },
        };
      if (name.endsWith("accountScope"))
        return {
          getAccountScope: () => ({ accountId: "user" }),
          accountStorageKey: (key) => key,
          isCurrentAccount: () => true,
        };
      if (name.endsWith("storage"))
        return { getSettings: async () => settings };
      if (name.endsWith("logger")) return { logger: { warn() {}, info() {}, debug() {} } };
      throw new Error(name);
    },
  });
  module.exports.useAppShowcasePrompt(true);
  return {
    alerts,
    routes,
    state,
    delay: () => scheduledDelay,
    focus: () => focus(),
    fire: async () => {
      timer?.();
      await tick();
    },
    saved: () => saved,
  };
}

test("app showcase prompt opens route and appears on 160 kbps quality with 3s delay", async () => {
  const f = fixture({ streamingQuality: "medium" }); // 160 kbps
  f.focus();
  assert.equal(f.delay(), 3000); // 3 seconds show time
  await f.fire();
  assert.equal(f.alerts.length, 1);
  assert.equal(f.saved().count, 1);
  f.alerts[0][2][1].onPress();
  assert.deepEqual(f.routes, ["/profile/streaming-downloads"]);
});

test("app showcase prompt never shows if quality is already high (320 kbps)", async () => {
  const f = fixture({ streamingQuality: "high" }); // 320 kbps
  f.focus();
  await f.fire();
  assert.equal(f.alerts.length, 0); // Must NOT show when user is on 320 kbps
});

test("app showcase prompt respects cooldown, limits, and background state in production", async () => {
  for (const history of [
    { count: 2, lastShownAt: 0 },
    { count: 1, lastShownAt: Date.now() },
  ]) {
    const f = fixture({ streamingQuality: "medium" }, history, false);
    f.focus();
    await f.fire();
    assert.equal(f.alerts.length, 0);
  }
  const f = fixture({ streamingQuality: "medium" }, null, false);
  f.focus();
  f.state.currentState = "background";
  await f.fire();
  assert.equal(f.alerts.length, 0);
});

test("dev mode allows testing when quality is 160 kbps", async () => {
  const f = fixture({ streamingQuality: "medium" }, { count: 0, lastShownAt: 0 }, true);
  f.focus();
  await f.fire();
  assert.equal(f.alerts.length, 1);
});

test("showcase prompt appears when quality is 160 kbps even if highQualityUnlocked was true previously", async () => {
  const f = fixture({ streamingQuality: "medium", highQualityUnlocked: true }, { count: 0, lastShownAt: 0 }, true);
  f.focus();
  await f.fire();
  assert.equal(f.alerts.length, 1);
});

