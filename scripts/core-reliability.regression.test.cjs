const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, modules, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(name in modules, `Unexpected module: ${name}`);
      return modules[name];
    },
    setTimeout, clearTimeout, AbortController, URL, ...globals,
  };
  vm.runInNewContext(code, context);
  return context.exports;
}

test("concurrent setting updates preserve both changes", async () => {
  const data = new Map();
  const storage = load("src/lib/storage.ts", {
    "@/lib/logger": { logger: { error() {} } },
    "@/lib/smartAutoplayConfig": { normalizeSmartAutoplayMode: (value) => value ?? "similar-trending" },
    "@/utils/idleTask": { runAfterIdle: (fn) => fn() },
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => data.get(key) ?? null,
      setItem: async (key, value) => { data.set(key, value); },
    },
    react: {}, "react-native": {},
    "./accountScope": { accountStorageKey: (key) => key, getAccountScope: () => ({ accountId: "test" }) },
  });
  await Promise.all([
    storage.saveSettings({ hapticsEnabled: true }),
    storage.saveSettings({ ambientBackdropEnabled: true }),
  ]);
  const result = JSON.parse(data.get("@mavrixfy_settings"));
  assert.equal(result.hapticsEnabled, true);
  assert.equal(result.ambientBackdropEnabled, true);
});

test("timed fetch aborts the underlying request", async () => {
  let aborted = false;
  const utils = load("src/utils/asyncUtils.ts", {}, {
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
    }),
  });
  await assert.rejects(utils.fetchWithTimeout("https://example.test", {}, 10), /aborted/);
  assert.equal(aborted, true);
});

test("song normalizer skips provider web pages in favor of audio streams", () => {
  const music = load("src/lib/musicData.ts", {
    "@/lib/arrayUtils": { mapFilter: (items, map, guard) => items.map(map).filter(guard), sortedCopy: (items, compare) => [...items].sort(compare) },
    "@/utils/timeFormatters": { toDurationSeconds: (value) => Number(value) || 0 },
  });
  assert.equal(
    music.getPlayableRemoteAudioUrl("https://www.jiosaavn.com/song/test", "https://cdn.example.test/audio.mp3"),
    "https://cdn.example.test/audio.mp3"
  );
});

test("failed like sync restores the previous UI state", async () => {
  const state = { ids: new Set(), songs: [] };
  const store = {
    getState: () => ({
      ...state,
      addSongOptimistic(song) { state.ids.add(song.id); state.songs.unshift(song); },
      removeSongOptimistic(id) { state.ids.delete(id); state.songs = state.songs.filter((song) => song.id !== id); },
    }),
  };
  const repo = load("src/services/liked-songs/likedSongsRepository.ts", {
    "@/lib/accountScope": { getAccountScope: () => ({ accountId: "test" }) },
    "@/lib/firebase": { db: {} },
    "@/lib/firestore": { addLikedSongToFirestore: async () => false, removeLikedSongFromFirestore: async () => false },
    "@/lib/logger": { logger: { error() {}, warn() {} } },
    "@react-native-async-storage/async-storage": {},
    "firebase/firestore": {},
    "./likedSongsStore": { useLikedSongsStore: store },
  });
  const result = await repo.toggleLikeSong("test", { id: "song-1", title: "Song" });
  assert.equal(result, false);
  assert.equal(state.ids.has("song-1"), false);
});
