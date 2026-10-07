const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ info, fetchStatus = () => 200 } = {}) {
  const clients = [], requests = [];
  const format = { has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000,
    decipher: async () => "https://rr1.googlevideo.com/videoplayback?expire=2000" };
  const yt = { session: { player: {} }, getBasicInfo: info || (async (_, { client }) => {
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
      if (name === "jintr") return { Jinter: class {} };
      if (name === "youtubei.js/react-native") return {
        Constants: constants, Platform: { shim: {} }, YTNodes: {}, Innertube: { create: async () => yt },
      };
      throw new Error(name);
    } });
  return { api: module.exports.sharedYouTubeTransport, clients, requests };
}
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
