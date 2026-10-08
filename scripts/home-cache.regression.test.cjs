const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const storage = new Map();
const moduleUnderTest = { exports: {} };
const code = ts.transpileModule(fs.readFileSync("src/features/home/hooks/homeFeedCache.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, { module: moduleUnderTest, exports: moduleUnderTest.exports, require: () => ({
  getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value),
}) });
const { decodeHomeFeedCache, writeHomeFeedCache, readHomeFeedCache } = moduleUnderTest.exports;
const item = { id: "youtube_album_MPREalbum", name: "Album", coverUrl: "art" };
const data = { songs: [{ id: "youtube_abcdefghijk", title: "Song", artist: "Artist", coverUrl: "art" }], playlists: [item],
  sections: [{ id: "latest", title: "Latest", songs: [], playlists: [item] }] };
test("home cache preserves bounded catalog rows and rejects expired, future or malformed snapshots", () => {
  const raw = (at, data) => JSON.stringify({ version: 1, at, data });
  assert.equal(decodeHomeFeedCache(raw(1000, data), 2000).data.sections[0].title, "Latest");
  assert.equal(decodeHomeFeedCache(raw(1000, data), 90000000), undefined);
  assert.equal(decodeHomeFeedCache(raw(3000, data), 2000), undefined);
  assert.equal(decodeHomeFeedCache(raw(1000, { ...data, sections: [null] }), 2000), undefined);
  assert.equal(decodeHomeFeedCache("{broken", 2000), undefined);
  assert.equal(decodeHomeFeedCache("x".repeat(180001), 2000), undefined);
});
test("home cache keys do not share one account's recommendations with another", async () => {
  await writeHomeFeedCache("account-a", data, Date.now());
  assert.equal((await readHomeFeedCache("account-a")).data.songs[0].title, "Song");
  assert.equal(await readHomeFeedCache("account-b"), undefined);
});
