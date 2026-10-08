const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const channel = "youtube_artist_UC" + "a".repeat(22);
function providerFixture(overrides = {}) {
  const storage = new Map(); let now = 1000000; let loads = 0;
  const api = { searchYouTubeMusic: async () => ({ artists: [{ id: channel, name: "Artist", image: [] }] }),
    loadYouTubeArtist: async id => { loads++; return { id, name: "Artist", image: [], topSongs: [], topAlbums: [], similarArtists: [], hasMoreSongs: false }; },
    ...overrides };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/data/providers/ArtistProvider.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date: { now: () => now }, require: name => {
    if (name === "@/services/youtube/YouTubeMusic") return api;
    if (name === "@/services/youtube/YouTubeArtists") return require("./helpers/youtube-artists-fixture.cjs");
    if (name === "@react-native-async-storage/async-storage") return { getItem: async key => storage.get(key),
      setItem: async (key, data) => storage.set(key, data), removeItem: async key => storage.delete(key) };
    throw new Error(name);
  } });
  return { ...module.exports, loads: () => loads, advance: ms => now += ms };
}
test("artist requests coalesce, expire, and resolve saved legacy IDs only by exact name", async () => {
  const f = providerFixture();
  const [one, two] = await Promise.all([f.getArtistDetails(channel), f.getArtistDetails(channel)]);
  assert.equal(one, two); assert.equal(f.loads(), 1);
  assert.equal(await f.getArtistDetails("123", "Artist"), one);
  assert.equal(await f.getArtistDetails("123", "Different artist"), null);
  assert.equal(await f.getArtistDetails("123"), null);
  assert.equal(f.getImmediateCachedArtist(channel), one);
  f.advance(4 * 60 * 60 * 1000 + 1);
  assert.equal(f.getImmediateCachedArtist(channel), null);
  await f.getArtistDetails(channel); assert.equal(f.loads(), 2);
});
test("featured artists use bounded discovery, qualified identities, and a coalesced cache", async () => {
  let active = 0, maximum = 0, queries = 0;
  const f = providerFixture({ searchYouTubeMusic: async () => {
    queries++; active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return { artists: [{ id: channel, name: "Artist", image: [] }] };
  } });
  const [one, two] = await Promise.all([f.getFeaturedArtists(), f.getAllPopularArtists()]);
  assert.equal(one.length, 1); assert.equal(two.length, 1);
  assert.equal(queries, 4); assert.equal(maximum, 2);
  await f.getAllPopularArtists(); assert.equal(queries, 4);
  await f.getAllPopularArtists({ forceRefresh: true }); assert.equal(queries, 8);
});

function followedFixture(search) {
  const key = "@mavrixfy_followed_artists_v1";
  const storage = new Map([[key, JSON.stringify([{ id: "123", name: "Artist", image: "old", followedAt: 42 }])]]);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/lib/followedArtists.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === "./accountScope") return { accountStorageKey: value => value };
    if (name === "@/data/providers/ArtistProvider") return { searchArtists: search };
    if (name === "./musicData") return { getBestImageUrl: images => images[0]?.url || "" };
    if (name === "@/services/youtube/YouTubeArtists") return require("./helpers/youtube-artists-fixture.cjs");
    if (name === "@react-native-async-storage/async-storage") return { getItem: async key => storage.get(key), setItem: async (key, data) => storage.set(key, data) };
    throw new Error(name);
  } });
  return { ...module.exports, saved: () => JSON.parse(storage.get(key)) };
}
test("followed-artist migration preserves follow time and failed lookups preserve saved data", async () => {
  const matched = followedFixture(async () => [{ id: channel, name: "Artist", image: [{ url: "new" }] }]);
  const result = await matched.getFollowedArtists();
  assert.equal(result[0].id, channel); assert.equal(result[0].followedAt, 42); assert.equal(result[0].image, "new");
  const failed = followedFixture(async () => { throw new Error("offline"); });
  assert.equal((await failed.getFollowedArtists())[0].id, "123");
  assert.equal(failed.saved()[0].followedAt, 42);
});
test("an unfollow during artist migration does not restore the removed artist", async () => {
  let deliver;
  const f = followedFixture(() => new Promise(resolve => { deliver = resolve; }));
  const migration = f.getFollowedArtists();
  await new Promise(resolve => setImmediate(resolve));
  await f.toggleFollowArtist({ id: "123", name: "Artist", image: "old", followedAt: 42 });
  deliver([{ id: channel, name: "Artist", image: [] }]);
  assert.equal((await migration).length, 0); assert.equal(f.saved().length, 0);
});
