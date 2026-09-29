const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/downloads/downloadQueue.ts"), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createHarness(initialNetwork = "WIFI", responseStatus = 200) {
  const items = new Map();
  const pending = [];
  let active = 0;
  let maxActive = 0;
  let started = 0;
  let promoted = 0;
  let network = initialNetwork;
  let onNetworkChange;

  const modules = {
    "@/lib/accountScope": { getAccountScope: () => ({ accountId: "test", generation: 0 }), isCurrentAccount: () => true },
    "expo-file-system/legacy": {
      createDownloadResumable: () => ({
        downloadAsync: () => {
          active += 1;
          started += 1;
          maxActive = Math.max(maxActive, active);
          return new Promise((resolve) => pending.push(() => {
            active -= 1;
            resolve({ status: responseStatus, headers: {}, uri: "file:///temp" });
          }));
        },
      }),
      deleteAsync: async () => {},
      downloadAsync: async () => {},
    },
    "expo-network": {
      NetworkStateType: { WIFI: "WIFI", ETHERNET: "ETHERNET", CELLULAR: "CELLULAR" },
      getNetworkStateAsync: async () => ({ type: network }),
      addNetworkStateListener: (listener) => {
        onNetworkChange = listener;
        return { remove() {} };
      },
    },
    "@/lib/downloads/downloadStore": {
      saveDownload: async (item) => { items.set(item.songId, item); },
      loadDownload: async (id) => items.get(id),
      updateDownloadMemory: (item) => { items.set(item.songId, item); },
    },
    "@/lib/downloads/filesystem": {
      ensureDownloadsDirs: async () => {},
      getTempDownloadUri: (id) => `file:///temp/${id}`,
      getTrackFileUri: (id) => `file:///tracks/${id}`,
      getArtworkFileUri: (id) => `file:///art/${id}`,
      promoteTempToTrack: async () => { promoted += 1; return true; },
      hasSufficientStorage: async () => true,
    },
    "@/lib/downloads/audioQuality": { getAudioUrlByQuality: (url) => url },
    "@/lib/api-config": { getMusicApiUrl: () => "https://example.test" },
    "@/lib/musicData": { getBestAudioUrlWithQuality: (url) => url },
    "@/lib/logger": { logger: { debug() {}, info() {}, warn() {}, error() {} } },
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(name in modules, `Unexpected module: ${name}`);
      return modules[name];
    },
    fetch: async () => ({ status: 200, headers: { get: () => null } }),
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
  };
  vm.runInNewContext(code, context);
  const queue = context.exports;
  const prefs = { wifiOnly: false, chargingOnly: false, quality: "high", autoDeleteExpired: false };
  const item = (id, retryCount = 0) => ({
    songId: id, audioUrl: "https://res.cloudinary.com/audio.mp3", quality: "high",
    coverUrl: "", status: "queued", retryCount, progress: 0,
  });
  return {
    queue, prefs, item, items, pending,
    get started() { return started; },
    get maxActive() { return maxActive; },
    get promoted() { return promoted; },
    changeNetwork(type) { network = type; onNetworkChange?.({ type }); },
  };
}

async function until(predicate) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for download queue");
}

test("download queue never exceeds two simultaneous transfers", async () => {
  const h = createHarness();
  await Promise.all(Array.from({ length: 8 }, (_, index) =>
    h.queue.enqueueDownload(h.item(`youtube_${index}`), h.prefs)
  ));
  await until(() => h.started === 2);
  for (let i = 0; i < 8; i += 1) {
    await until(() => h.pending.length > 0);
    h.pending.shift()();
    await until(() => h.started >= Math.min(i + 3, 8) || i === 7);
  }
  await until(() => [...h.items.values()].every((item) => item.status === "completed"));
  assert.equal(h.maxActive, 2);
});

test("HTTP errors are never promoted to playable tracks", async () => {
  const h = createHarness("WIFI", 403);
  await h.queue.enqueueDownload(h.item("youtube_denied", 3), h.prefs);
  await until(() => h.pending.length === 1);
  h.pending.shift()();
  await until(() => h.items.get("youtube_denied")?.status === "failed");
  assert.equal(h.promoted, 0);
});

test("Wi-Fi-only downloads wait for Wi-Fi", async () => {
  const h = createHarness("CELLULAR");
  await h.queue.enqueueDownload(h.item("youtube_wifi"), { ...h.prefs, wifiOnly: true });
  assert.equal(h.items.get("youtube_wifi").status, "waiting_for_wifi");
  assert.equal(h.started, 0);
  h.changeNetwork("WIFI");
  await until(() => h.started === 1);
  h.pending.shift()();
  await until(() => h.items.get("youtube_wifi")?.status === "completed");
});
