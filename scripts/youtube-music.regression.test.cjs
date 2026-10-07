const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { fixture: playerFixture, tick } = require("./helpers/audio-player-fixture.cjs");
const track = { videoId: "abcdefghijk", title: "Same title", artist: "Same artist", coverUrl: "", duration: 180 };
function fixture(overrides = {}, platform = "android", installed = true) {
  const calls = [], cancelled = [], rejected = [];
  let now = 1000000;
  const native = {
    search: async () => ({ songs: [track, track], playlists: [{ id: "PLabc", name: "Playlist", coverUrl: "art.jpg", songCount: 2, url: "https://music.youtube.com/playlist?list=PLabc", description: "Author" }] }),
    resolveStream: async (videoId) => { calls.push(videoId); return { videoId, url: `https://media.example/${calls.length}`, expiresAt: now + 300000,
      headers: { Referer: "https://www.youtube.com/" }, bitrate: 128000, mimeType: "audio/mp4", codec: "aac", resolutionId: `resolution-${calls.length}` }; },
    cancel: id => cancelled.push(id), rejectStream: id => rejected.push(id), ...overrides,
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/services/youtube/YouTubeMusic.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout, clearTimeout, Date: { now: () => now },
    require: name => {
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name === "./SharedYouTubeTransport") return { sharedYouTubeTransport: native };
      throw new Error(name);
    } });
  return { ...module.exports, calls, cancelled, rejected, advance: ms => now += ms };
}
test("YouTube search keeps provider-qualified IDs and playlist results without a JioSaavn conversion", async () => {
  const f = fixture();
  const results = await f.searchYouTubeMusic("Same title", "all");
  assert.equal(results.songs.length, 1);
  assert.equal(results.songs[0].id, "youtube_abcdefghijk");
  assert.equal(results.songs[0].source, "youtube");
  assert.equal(results.songs[0].downloadUrl, undefined);
  assert.equal(results.playlists[0].id, "youtube_playlist_PLabc");
  assert.equal(results.albums.length, 0);
});

test("iOS uses the same separate catalog, playlist IDs and stream descriptors", async () => {
  const f = fixture({}, "ios");
  assert.equal(f.youTubeAvailable(), true);
  const results = await f.searchYouTubeMusic("Same title", "all");
  assert.equal(results.songs[0].source, "youtube");
  assert.equal(results.playlists[0].id, "youtube_playlist_PLabc");
  const stream = await f.resolveYouTubeStream(results.songs[0]);
  assert.equal(stream.mimeType, "audio/mp4");
  assert.equal(stream.headers.Referer, "https://www.youtube.com/");
});

test("iOS without a custom extractor supports shared search; web is unsupported", async () => {
  const missing = fixture({}, "ios", false);
  assert.equal(missing.youTubeAvailable(), true);
  assert.equal((await missing.searchYouTubeMusic("song", "all")).songs[0].source, "youtube");
  assert.equal(fixture({}, "web").youTubeAvailable(), false);
});
test("stream requests coalesce and near-expiry audio is resolved again", async () => {
  const f = fixture(); const song = f.normalizeYouTubeTrack(track);
  const [a, b] = await Promise.all([f.resolveYouTubeStream(song), f.resolveYouTubeStream(song)]);
  assert.equal(a.url, b.url); assert.equal(f.calls.length, 1);
  f.advance(181000);
  const fresh = await f.resolveYouTubeStream(song);
  assert.notEqual(fresh.url, a.url); assert.equal(f.calls.length, 2);
});
test("a rejected stream is evicted and cannot become a cross-provider fallback", async () => {
  const f = fixture(); const song = f.normalizeYouTubeTrack(track);
  await f.resolveYouTubeStream(song); f.rejectYouTubeStream(song);
  assert.equal(f.peekYouTubeStream(song), undefined);
  assert.equal(f.rejected.length, 1);
  await f.resolveYouTubeStream(song); assert.equal(f.calls.length, 2);
  assert.equal(f.isYouTubeSong({ id: "saavn-song", source: "jiosaavn" }), false);
});
test("playlist continuation accumulates tracks and rejects incomplete pages", async () => {
  let count = 0;
  const f = fixture({ playlist: async () => ++count === 1 ? { name: "Mix", songs: [track], cursor: "page-2" } : { songs: [{ ...track, videoId: "lmnopqrstuv" }], cursor: "" } });
  const playlist = await f.loadYouTubePlaylist("youtube_playlist_PLabc");
  assert.equal(playlist.songs.length, 2); assert.equal(count, 2);
  const broken = fixture({ playlist: async () => { if (++count === 3) return { songs: [track], cursor: "next" }; throw new Error("page failed"); } });
  await assert.rejects(broken.loadYouTubePlaylist("youtube_playlist_PLabc"), /page failed/);
});
test("aborted searches cancel their transport request", async () => {
  const f = fixture({ search: () => new Promise(() => {}) });
  const controller = new AbortController();
  const search = f.searchYouTubeMusic("song", "songs", controller.signal);
  controller.abort(); await assert.rejects(search, /cancelled/); assert.equal(f.cancelled.length, 1);
});
test("player refreshes each YouTube selection and passes extraction headers to Audio", async () => {
  const selected = [];
  const f = playerFixture({ youtubeResolver: async song => { selected.push(song.id); return { url: "https://media.example/fresh", headers: { Referer: "music" }, expiresAt: Date.now() + 300000 }; } });
  const p = f.StandardAudioPlayer;
  await p.setQueue([{ id: "youtube_abcdefghijk", source: "youtube", youtubeVideoId: track.videoId, url: "https://media.example/expired" }]);
  assert.equal((await p.getActiveTrack()).url, "https://media.example/fresh");
  const audio = f.StandardAudioRenderer();
  assert.equal(audio.props.source.uri, "https://media.example/fresh");
  assert.equal(audio.props.source.headers.Referer, "music");
  assert.equal(selected.length, 1);
});

test("the iOS player resolves AAC audio and carries its HTTP headers to the renderer", async () => {
  const f = playerFixture({ platform: "ios", youtubeResolver: async () => ({
    url: "https://media.example/ios.m4a", headers: { Referer: "https://www.youtube.com/" }, expiresAt: Date.now() + 300000,
  }) });
  await f.StandardAudioPlayer.setupPlayer();
  await f.StandardAudioPlayer.setQueue([{ id: "youtube_abcdefghijk", source: "youtube", youtubeVideoId: track.videoId }]);
  const audio = f.StandardAudioRenderer();
  assert.equal(audio.props.source.uri, "https://media.example/ios.m4a");
  assert.equal(audio.props.source.headers.Referer, "https://www.youtube.com/");
});
test("a late YouTube resolution cannot replace a newly selected queue", async () => {
  let finish;
  const f = playerFixture({ youtubeResolver: () => new Promise(resolve => finish = resolve) });
  const p = f.StandardAudioPlayer;
  const old = p.setQueue([{ id: "youtube_abcdefghijk", source: "youtube", youtubeVideoId: track.videoId }]);
  await tick();
  await p.setQueue([{ id: "jiosaavn-song", url: "https://media.example/saavn.mp3" }]);
  finish({ url: "https://media.example/late", headers: {}, expiresAt: Date.now() + 300000 }); await old;
  assert.equal((await p.getActiveTrack()).id, "jiosaavn-song");
});

test("failed YouTube queue advances identify the requested song for recovery", async () => {
  const f = playerFixture({ youtubeResolver: async song => {
    if (song.id.endsWith("lmnopqrstuv")) throw new Error("temporary extraction failure");
    return { url: "https://media.example/audio", headers: {}, expiresAt: Date.now() + 300000 };
  } });
  const p = f.StandardAudioPlayer;
  await p.setQueue([
    { id: "youtube_abcdefghijk", source: "youtube", youtubeVideoId: "abcdefghijk" },
    { id: "youtube_lmnopqrstuv", source: "youtube", youtubeVideoId: "lmnopqrstuv" },
  ]);
  await assert.rejects(p.skipToNext(), /temporary extraction failure/);
  assert.equal((await p.getActiveTrack()).id, "youtube_lmnopqrstuv");
});

test("a local YouTube audio file does not require network extraction", async () => {
  const f = playerFixture();
  await f.StandardAudioPlayer.setQueue([{ id: "youtube_abcdefghijk", source: "youtube", url: "file:///music/song.m4a" }]);
  assert.equal((await f.StandardAudioPlayer.getActiveTrack()).url, "file:///music/song.m4a");
});

test("iPhone Expo Go can import player state without installing the custom JSI audio module", () => {
  const f = playerFixture({ platform: "ios", expoGo: true });
  assert.equal(typeof f.StandardAudioPlayer.getPlaybackState, "function");
});

test("changing YouTube quality resolves a new descriptor rather than reusing medium", async () => {
  const f = fixture(); const song = f.normalizeYouTubeTrack(track);
  const medium = await f.resolveYouTubeStream(song, "medium");
  const low = await f.resolveYouTubeStream(song, "low");
  assert.notEqual(medium.url, low.url);
  assert.equal(f.peekYouTubeStream(song).requestedQuality, "low");
});

test("quality invalidation does not blacklist a healthy YouTube client", async () => {
  const f = fixture(); const song = f.normalizeYouTubeTrack(track);
  await f.resolveYouTubeStream(song);
  f.invalidateYouTubeStream(song);
  assert.equal(f.peekYouTubeStream(song), undefined);
  assert.equal(f.rejected.length, 0);
  await f.resolveYouTubeStream(song, "high");
  assert.equal(f.calls.length, 2);
});

test("late older quality cannot overwrite the active YouTube descriptor", async () => {
  const completions = {};
  const f = fixture({ resolveStream: (videoId, quality) => new Promise(resolve => {
    completions[quality] = () => resolve({ videoId, url: `https://media.example/${quality}`,
      expiresAt: 2000000, headers: { profile: quality }, requestedQuality: quality });
  }) });
  const song = f.normalizeYouTubeTrack(track);
  const medium = f.resolveYouTubeStream(song, "medium");
  const high = f.resolveYouTubeStream(song, "high");
  completions.high(); await high;
  completions.medium(); await medium;
  assert.equal(f.peekYouTubeStream(song).requestedQuality, "high");
});

test("rejecting a pending YouTube descriptor prevents it from refilling the cache", async () => {
  let complete;
  const f = fixture({ resolveStream: videoId => new Promise(resolve => { complete = () => resolve({
    videoId, url: "https://media.example/old", expiresAt: 2000000, headers: {},
  }); }) });
  const song = f.normalizeYouTubeTrack(track);
  const pending = f.resolveYouTubeStream(song);
  f.rejectYouTubeStream(song); complete();
  await assert.rejects(pending, /superseded/);
  assert.equal(f.peekYouTubeStream(song), undefined);
});

test("repeated playlist continuation fails instead of looping", async () => {
  const f = fixture({ playlist: async () => ({ songs: [track], cursor: "repeated" }) });
  await assert.rejects(f.loadYouTubePlaylist("youtube_playlist_PLabc"), /repeated page/);
});
