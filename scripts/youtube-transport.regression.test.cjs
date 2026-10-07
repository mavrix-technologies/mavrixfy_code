const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ info, fetchStatus = () => 200, music = {}, nodes = {}, lazyPlayer = false } = {}) {
  const clients = [], requests = [];
  const playerLoads = [], sessionOptions = [];
  const format = { has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000,
    decipher: async () => "https://rr1.googlevideo.com/videoplayback?expire=2000" };
  const yt = { music, session: { player: lazyPlayer ? undefined : {} }, getBasicInfo: info || (async (_, { client }) => {
    clients.push(client); return { cpn: "playback-nonce", playability_status: { status: "OK" },
      streaming_data: { adaptive_formats: [format] } };
  }) };
  const constants = { STREAM_HEADERS: { Referer: "https://www.youtube.com/" }, CLIENTS: Object.fromEntries(
    ["VISIONOS", "ANDROID_VR", "IOS"].map(client => [client, { USER_AGENT: client }])) };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/services/youtube/SharedYouTubeTransport.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout, clearTimeout, URL, AbortController,
    Date: { now: () => 1000000 }, globalThis: { crypto: { randomUUID: () => "nonce" },
      fetch: async (url, options) => {
        requests.push({ url, options }); const status = fetchStatus(options);
        return { ok: status >= 200 && status < 300, status };
      } }, require: name => {
      if (name === "./runtime") return {};
      if (name === "./YouTubeArtwork") return require("./helpers/youtube-artwork-fixture.cjs");
      if (name === "jintr") return { Jinter: class {} };
      if (name === "youtubei.js/react-native") return {
        Constants: constants, Platform: { shim: {} }, YTNodes: nodes,
        Player: { create: async () => { playerLoads.push(true); return {}; } },
        Innertube: { create: async options => { sessionOptions.push(options); return yt; } },
      };
      throw new Error(name);
    } });
  return { api: module.exports.sharedYouTubeTransport, clients, requests, playerLoads, sessionOptions };
}
test("catalog skips player parsing; concurrent playback prepares a single player", async () => {
  const f = fixture({ lazyPlayer: true, music: { getHomeFeed: async () => ({ sections: [] }) } });
  await f.api.home("home");
  assert.equal(f.playerLoads.length, 0);
  assert.equal(f.sessionOptions[0].retrieve_player, false);
  await Promise.all([f.api.resolveStream("abcdefghijk", "medium", "one"), f.api.resolveStream("lmnopqrstuv", "medium", "two")]);
  assert.equal(f.playerLoads.length, 1);
});
test("home parser requires playable song endpoints and excludes albums/artists", async () => {
  const nodes = { MusicCarouselShelf: class {}, MusicResponsiveListItem: class {}, MusicTwoRowItem: class {} };
  const item = (item_type, id, videoId) => ({ item_type, id, endpoint: { payload: { videoId } },
    title: "Title", subtitle: "Subtitle", thumbnail: [], is: type => type === nodes.MusicTwoRowItem });
  const shelf = { is: type => type === nodes.MusicCarouselShelf, contents: [
    item("song", "abcdefghijk", "abcdefghijk"), item("album", "abcdefghijk", "abcdefghijk"),
    item("artist", "UCartist"), item("song", "abcdefghijk"), item("playlist", "VLPLmix"),
  ] };
  const f = fixture({ nodes, music: { getHomeFeed: async () => ({ sections: [shelf] }) } });
  const home = await f.api.home("home");
  assert.equal(home.songs.length, 1);
  assert.equal(home.songs[0].videoId, "abcdefghijk");
  assert.equal(home.playlists.length, 1);
  assert.equal(home.playlists[0].id, "PLmix");
});
test("shared extractor validates unrestricted audio without downloading a song", async () => {
  const f = fixture();
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(stream.clientProfile, "VISIONOS");
  assert.equal(f.requests[0].options.method, "HEAD");
  assert.equal(f.requests[0].options.headers.Range, undefined);
  assert.equal(new URL(f.requests[0].url).searchParams.get("cpn"), "playback-nonce");
  assert.equal(stream.headers["User-Agent"], "VISIONOS");
});
test("403 client is discarded and the exact video's next YouTube client is validated", async () => {
  const f = fixture({ fetchStatus: options => options.headers["User-Agent"] === "VISIONOS" ? 403 : 200 });
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(stream.videoId, "abcdefghijk");
  assert.equal(stream.clientProfile, "ANDROID_VR");
  assert.equal(f.clients.join(","), "VISIONOS,ANDROID_VR");
});
test("decoder-rejected YouTube profile is skipped during bounded recovery", async () => {
  const f = fixture(); f.api.rejectStream("abcdefghijk:VISIONOS");
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(stream.clientProfile, "ANDROID_VR");
  assert.equal(f.clients.join(","), "ANDROID_VR");
});
test("cancelled extraction cannot validate or return a late player response", async () => {
  let complete;
  const f = fixture({ info: () => new Promise(resolve => { complete = resolve; }) });
  const pending = f.api.resolveStream("abcdefghijk", "medium", "stream");
  await tick(); f.api.cancel("stream");
  complete({ playability_status: { status: "OK" } });
  await assert.rejects(pending, /cancelled/);
  assert.equal(f.requests.length, 0);
});
test("upstream login restriction remains an explicit YouTube failure", async () => {
  const f = fixture({ info: async () => ({ playability_status: { status: "LOGIN_REQUIRED",
    reason: "Sign in to confirm you are not a bot" } }) });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "stream"), /Sign in/);
  assert.equal(f.requests.length, 0);
});
