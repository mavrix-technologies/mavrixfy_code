const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const song = (id, artist = "Artist", source = "youtube") => ({ id, artist, source, title: id });
function fixture(overrides = {}) {
  const calls = [];
  const api = {
    isYouTubeSong: item => item.source === "youtube" || item.id.startsWith("youtube_"),
    loadYouTubeHome: async () => ({ songs: [], playlists: [{ id: "youtube_playlist_one" }, { id: "youtube_playlist_two" }, { id: "youtube_playlist_three" }] }),
    relatedYouTubeSongs: async seed => { calls.push(seed.id); return [song("youtube_radio", "Radio")]; },
    previewYouTubePlaylist: async id => { calls.push(id); return [song(`youtube_${id}`, id)]; },
    ...overrides,
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/services/youtube/YouTubeHomeRecommendations.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: () => api });
  return { ...module.exports, calls };
}
test("discovery deduplicates, excludes recent seeds/JioSaavn, and spreads artists", () => {
  const f = fixture();
  const candidates = [song("youtube_seed"), song("jio", "Jio", "jiosaavn"),
    song("youtube_1", "A"), song("youtube_2", "A"), song("youtube_3", "A"),
    song("youtube_1", "A"), song("youtube_4", "B")];
  assert.equal(f.rankYouTubeRecommendations(candidates, [song("youtube_seed")], 3).map(item => item.id).join(","),
    "youtube_1,youtube_2,youtube_4");
});
test("guest home samples only two YouTube mixes without using radio or Jio seeds", async () => {
  const f = fixture();
  const feed = await f.getYouTubeHomeRecommendations([song("jio", "Jio", "jiosaavn")], new AbortController().signal);
  assert.equal(f.calls.join(","), "youtube_playlist_one,youtube_playlist_two");
  assert.equal(feed.songs.length, 2);
  assert.equal(feed.personalized, false);
});
test("only two YouTube radio seeds are used and their recommendations take priority", async () => {
  const f = fixture({ loadYouTubeHome: async () => ({ songs: [song("youtube_home", "Home")], playlists: [] }) });
  const feed = await f.getYouTubeHomeRecommendations([song("jio", "Jio", "jiosaavn"), song("youtube_a"), song("youtube_b"), song("youtube_c")], new AbortController().signal);
  assert.equal(f.calls.join(","), "youtube_a,youtube_b");
  assert.equal(feed.songs.map(item => item.id).join(","), "youtube_radio,youtube_home");
  assert.equal(feed.personalized, true);
});
test("radio survives a failed home request; total failure is retryable", async () => {
  const failed = async () => { throw new Error("offline"); };
  const f = fixture({ loadYouTubeHome: failed });
  assert.equal((await f.getYouTubeHomeRecommendations([song("youtube_seed")], new AbortController().signal)).songs.length, 1);
  await assert.rejects(f.getYouTubeHomeRecommendations([], new AbortController().signal), /unavailable/);
});
test("cancelled feed cannot publish results", async () => {
  const controller = new AbortController();
  const f = fixture({ loadYouTubeHome: async () => { controller.abort(); return { songs: [song("youtube_home")], playlists: [] }; } });
  await assert.rejects(f.getYouTubeHomeRecommendations([], controller.signal), /cancelled/);
});

test("home recommendations preserve original shelves rather than collapsing them into one mixed catalog", async () => {
  const shelf = { id: "youtube-shelf-0", title: "Hindi hits", songs: [song("youtube_hit")], playlists: [] };
  const f = fixture({ loadYouTubeHome: async () => ({ songs: shelf.songs, playlists: [], sections: [shelf] }) });
  const feed = await f.getYouTubeHomeRecommendations([], new AbortController().signal);
  assert.equal(feed.sections.length, 1);
  assert.equal(feed.sections[0], shelf);
  assert.equal(feed.sections[0].title, "Hindi hits");
});

test("home publishes its catalog before pending radio and playlist preview work finishes", async () => {
  let finishRadio; const partials = [];
  const shelf = { id: "shelf", title: "Playlists", songs: [], playlists: [{ id: "youtube_playlist_one" }] };
  const f = fixture({ loadYouTubeHome: async () => ({ songs: [], playlists: shelf.playlists, sections: [shelf] }),
    relatedYouTubeSongs: () => new Promise(resolve => { finishRadio = resolve; }) });
  const pending = f.getYouTubeHomeRecommendations([song("youtube_seed")], new AbortController().signal, feed => partials.push(feed));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(partials[0].sections[0].title, "Playlists");
  assert.equal(f.calls.length, 0, "preview work must not hold initial catalog rows");
  finishRadio([song("youtube_radio")]); await pending;
});
