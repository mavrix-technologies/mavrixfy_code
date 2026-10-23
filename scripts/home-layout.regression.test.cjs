const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(filename, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (!(name in dependencies)) throw new Error(`Unexpected runtime dependency ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}
const { buildHomeSections } = load("src/features/home/hooks/buildHomeSections.ts");
const { youtubePlaylistPublisher } = load("src/services/youtube/YouTubePlaylistIdentity.ts");
const shelves = Array.from({ length: 6 }, (_, i) => ({ id: `youtube-${i}`, title: `Hindi Shelf ${i}`, songs: [], playlists: [] }));
const jio = [{ id: "quick", type: "quick-picks" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `jio-${i}`, type: "category" }))];

test("All home leads with Quick Picks and interleaves only two independent catalog rows", () => {
  const rows = buildHomeSections("All", true, shelves, jio);
  assert.equal(rows.map(row => row.id).join(","), "youtube-quick-picks,releases-status,youtube-0,youtube-1,jio-0,youtube-2,youtube-3,youtube-4,jio-1,youtube-5,youtube-status");
  assert.equal(rows.filter(row => row.type === "category").length, 2);
  assert.equal(rows.filter(row => row.type === "youtube-section").length, 6);
  assert.equal(rows[2].section, shelves[0]);
});
test("YouTube-only home cannot substitute JioSaavn content for an empty YouTube feed", () => {
  assert.equal(buildHomeSections("All", true, [], []).map(row => row.id).join(","), "youtube-quick-picks,releases-status,youtube-status");
  assert.equal(buildHomeSections("Recently Played", true, shelves, jio), jio);
  assert.equal(buildHomeSections("All", false, shelves, jio), jio);
});
test("official playlist publisher requires trusted channel identity, never a title or display name", () => {
  assert.equal(youtubePlaylistPublisher({ ownerName: "YouTube Music" }).verified, false);
  assert.equal(youtubePlaylistPublisher({ ownerName: "YouTube Music", ownerChannelId: "UCspoof" }).verified, false);
  const trusted = youtubePlaylistPublisher({ ownerChannelId: "UC-9-kyTW8ZkZNDHQJ6FgpwQ", ownerName: "Renamed" });
  assert.equal(trusted.verified, true);
  assert.equal(trusted.label, "Verified publisher");
  assert.equal(youtubePlaylistPublisher({}).label, "Playlist");
});

const { homeDisplayText } = load("src/features/home/components/homeDisplayText.ts");
test("home display copy removes provider names while retaining usable neutral labels", () => {
  assert.equal(homeDisplayText("YouTube Music · Discover"), "Discover");
  assert.equal(homeDisplayText("JioSaavn · Trending Now"), "Trending Now");
  assert.equal(homeDisplayText("By YouTube Music", "Playlist"), "Playlist");
  assert.equal(homeDisplayText("Discover on YouTube Music"), "Discover");
  assert.equal(homeDisplayText("Come On"), "Come On");
});

test("new releases combine into one section while existing home content stays intact", () => {
  const album = { id: "youtube_album_MPREmovie", name: "Film album", kind: "album" };
  const song = { id: "youtube_song" };
  const explore = [{ id: "new-albums", title: "Albums", category: "new-releases", songs: [], playlists: [album] },
    { id: "new-songs", title: "Videos", category: "new-releases", songs: [song, song], playlists: [album] },
    { id: "trends", title: "Trending", category: "trending", songs: [{ id: "youtube_trend" }], playlists: [] }];
  const home = buildHomeSections("All", true, shelves, jio, explore);
  assert.equal(home[1].id, "youtube-new-releases");
  assert.equal(home[1].section.title, "New Releases");
  assert.equal(home[1].section.songs.length, 1);
  assert.equal(home[1].section.playlists.length, 1);
  assert.equal(home[0].id, "youtube-quick-picks");
  assert.equal(home.some(row => row.id === "trends"), true);
});

test("regional editorial shelves replace generic global shelves while personal recommendations remain", () => {
  const regional = { id: "youtube-regional-hindi", title: "Hindi Hits", category: "discover", songs: [], playlists: [{ id: "hindi" }] };
  const personal = { ...shelves[0], id: "youtube-for-you" };
  const home = buildHomeSections("All", true, [...shelves, personal], jio, [regional]);
  assert.equal(home.some(row => row.id === regional.id), true);
  assert.equal(home.some(row => row.id === personal.id), true);
  assert.equal(home.some(row => row.id === "youtube-0"), false);
  assert.equal(home[0].id, "youtube-quick-picks");
});

test("menu filters real content types without adding substitute provider rows", () => {
  const song = { id: "youtube_song" }, album = { id: "youtube_album_a", kind: "album" }, playlist = { id: "youtube_playlist_p", kind: "playlist" };
  const explore = [{ id: "youtube-regional-hindi", title: "Hindi Hits", songs: [song], playlists: [album, playlist], category: "discover" },
    { id: "new", title: "New Releases", category: "new-releases", songs: [], playlists: [playlist] }];
  for (const category of ["Songs", "Playlists", "Albums"]) {
    const result = buildHomeSections(category, true, [], jio, explore);
    const rows = result.filter(row => row.type === "youtube-section");
    assert.equal(rows.length, 1);
    assert.equal(result.some(row => row.type === "category"), false);
    assert.equal(rows[0].section.songs.length, category === "Songs" ? 1 : 0);
    assert.equal(rows[0].section.playlists.length, category === "Songs" ? 0 : 1);
    if (category !== "Songs") assert.equal(rows[0].section.playlists[0], category === "Albums" ? album : playlist);
  }
  const releases = buildHomeSections("New Releases", true, [], jio, explore);
  assert.equal(releases.length, 1);
  assert.equal(releases[0].section.playlists[0], playlist);
});

test("catalog section cleanup preserves active All, Recent and New Releases content and loading states", () => {
  const { useHomeSectionData } = load("src/features/home/hooks/useHomeSectionData.ts", { react: { useMemo: fn => fn() }, "@/lib/providerFilter": { isSongProviderAllowed: () => true, isPlaylistProviderAllowed: () => true } });
  const input = { selectedCategory: "All", categories: [{ id: "trending" }, { id: "new-releases" }, { id: "editorial" }],
    quickPickSongs: [{ id: "song" }], recentlyPlayed: [{ id: "recent" }], featuredArtists: [{ id: "artist" }],
    publicPlaylists: [{ id: "community" }], loadingMainContent: false };
  assert.equal(useHomeSectionData(input).map(row => row.id).join(","),
    "quick-picks,recently-played,artists,cat-trending,cat-new-releases,cat-editorial,public-playlists");
  assert.equal(useHomeSectionData(input).filter(row => row.showAd).length, 1);
  assert.equal(useHomeSectionData({ ...input, selectedCategory: "Recently Played" }).map(row => row.id).join(","), "recently-played,artists");
  assert.equal(useHomeSectionData({ ...input, selectedCategory: "New Releases" }).map(row => row.id).join(","), "cat-new-releases,quick-picks,public-playlists");
  for (const selectedCategory of ["All", "Songs", "Playlists", "Albums"]) {
    const rows = useHomeSectionData({ ...input, selectedCategory, categories: [], quickPickSongs: [], featuredArtists: [], publicPlaylists: [], loadingMainContent: true });
    assert.equal(rows.map(row => row.id).join(","), "loading-quick,recently-played,loading-main");
  }
});
