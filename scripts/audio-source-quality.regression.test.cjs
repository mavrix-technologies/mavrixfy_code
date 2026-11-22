const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function fixture({ local = null, download = null, entitled = true, network = "wifi", youtubeError = null, youtubeUrl, catalogUrl } = {}) {
  const resolutions = [], catalog = [];
  const module = { exports: {} };
  const original = "https://rr.googlevideo.com/videoplayback?expire=2000000000&sig=unchanged%2Bsignature";
  const deps = {
    "@/services/youtube/YouTubeMusic": {
      isYouTubeSong: song => song.source === "youtube",
      resolveYouTubeStream: async (song, quality) => { resolutions.push(quality); if (youtubeError) throw youtubeError; return { url: youtubeUrl ?? original, bitrate: 130595, codec: "aac" }; },
      invalidateYouTubeStream() {}, peekYouTubeStream() {}, youTubeSongWithStream: song => song,
    },
    "@/services/spotify/SpotifyCatalogService": { isAudioPreviewUrl: () => false, resolveFullSongAudio: async () => null },
    "@/lib/accountScope": { getAccountScope: () => ({}) },
    "@/lib/downloads/downloadManager": { getLocalPlaybackUrl: async () => local, getSongDownload: async () => download },
    "@/lib/logger": { logger: { error() {} } },
    "@/lib/musicData": { convertJioSaavnSong: song => song, resolveAudioStreamWithQuality: (_, quality) => {
      catalog.push(quality); return { url: catalogUrl ?? "https://aac.saavncdn.com/original.mp4", bitrate: 320, qualityLabel: "320kbps", isFallback: false };
    } },
    "@/lib/storage": { getSettings: async () => ({ streamingQuality: "high" }), isHighQualityEntitled: () => entitled },
    "@/utils/timeFormatters": { toDurationSeconds: value => Number(value) || 0 },
    "expo-network": { getNetworkStateAsync: async () => ({ type: network }), NetworkStateType: { WIFI: "wifi", CELLULAR: "cellular", ETHERNET: "ethernet" } },
    "expo-file-system/legacy": { getInfoAsync: async () => ({ exists: true, isDirectory: false, size: 10000 }) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/services/audio/PlayerPlaybackResolver.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, URL, require: name => {
    if (!(name in deps)) throw new Error(`Unmocked dependency ${name}`); return deps[name];
  } });
  return { ...module.exports, resolutions, catalog, original };
}
const song = { id: "youtube_abcdefghijk", source: "youtube", title: "Track", duration: 180 };

test("playback rejects malformed URLs, unsupported schemes and provider pages disguised as audio", () => {
  const f = fixture();
  for (const value of ["not-a-url", "//cdn.example/track.mp3", "javascript:alert(1)", "data:audio/mpeg;base64,AAAA",
    "ftp://cdn.example/track.mp3", "https://user:password@cdn.example/track.mp3", "https://cdn.example/a b.mp3",
    "https://cdn.example/a\nb.mp3", "https://www.youtube.com/watch.mp3?v=abcdefghijk",
    "https://open.spotify.com/track/song.mp3", "https://www.jiosaavn.com/song/test.mp3", "https://cdn.example/error.html"]) {
    assert.equal(f.readAudioCandidate(value), "", value);
  }
  for (const value of ["https://cdn.example/track?sig=unchanged%2Bvalue", "http://localhost:8080/audio",
    "file:///music/track.m4a", "file:///music/My Track.m4a", "content://media/external/audio/media/123", "/music/track.m4a", "/music/My Track.m4a",
    "https://youtube.com.audio.example/track"]) assert.equal(f.readAudioCandidate(value), value);
});

test("provider resolution cannot return an unplayable page as a stream", async () => {
  const youtube = fixture({ youtubeUrl: "https://youtube.com/watch?v=abcdefghijk" });
  await assert.rejects(youtube.resolvePlaybackUrlWithDetails(song), /invalid audio source/i);
  assert.equal(youtube.catalog.length, 0);
  const catalog = fixture({ catalogUrl: "javascript:alert(1)" });
  const result = await catalog.resolvePlaybackUrlWithDetails({ id: "catalog", source: "jiosaavn", downloadUrl: [{ quality: "320kbps" }] });
  assert.equal(result.url, null);
});

test("saved High quality respects entitlement without an explicit quality override", async () => {
  const f = fixture({ entitled: false });
  await f.resolvePlaybackUrlWithDetails(song);
  assert.deepEqual(f.resolutions, ["medium"]);
});


test("High uses the original source URL and reports its real AAC bitrate without upsampling claims", async () => {
  const f = fixture();
  const result = await f.resolvePlaybackUrlWithDetails(song, "high");
  assert.deepEqual(f.resolutions, ["high"]);
  assert.equal(result.url, f.original);
  assert.equal(result.qualityState.actualBitrate, 131);
  assert.equal(result.qualityState.codec, "aac");
  assert.equal(result.qualityState.qualityLabel, "131kbps · aac");
  assert.equal(f.catalog.length, 0);
});

test("High entitlement is respected and Auto chooses the highest permitted quality", async () => {
  const locked = fixture({ entitled: false });
  await locked.resolvePlaybackUrlWithDetails(song, "high");
  assert.deepEqual(locked.resolutions, ["medium"]);
  const cellular = fixture({ network: "cellular" });
  await cellular.resolvePlaybackUrlWithDetails(song, "auto");
  assert.deepEqual(cellular.resolutions, ["high"]);
});

test("offline quality uses stored source bitrate rather than claiming every download is 320kbps", async () => {
  const f = fixture({ local: "file:///track.m4a", download: { status: "completed", audioBitrate: 130595, audioCodec: "aac" } });
  const result = await f.resolvePlaybackUrlWithDetails(song, "high");
  assert.equal(result.url, "file:///track.m4a");
  assert.equal(result.qualityState.actualBitrate, 131);
  assert.equal(result.qualityState.qualityLabel, "Offline (131kbps · aac)");
  assert.equal(result.qualityState.codec, "aac");
  assert.equal(f.resolutions.length, 0);
});

test("legacy downloads and direct local files with unknown bitrate show Offline without an invented value", async () => {
  for (const metadata of [null, { status: "completed", audioBitrate: NaN }, { status: "completed", audioBitrate: 0 }]) {
    const f = fixture({ local: "file:///old.m4a", download: metadata });
    const result = await f.resolvePlaybackUrlWithDetails(song);
    assert.equal(result.qualityState.actualBitrate, 0);
    assert.equal(result.qualityState.qualityLabel, "Offline");
  }
  const direct = await fixture().resolvePlaybackUrlWithDetails({ ...song, audioUrl: "file:///direct.m4a" });
  assert.equal(direct.qualityState.actualBitrate, 0);
});

test("original catalog and unknown direct streams keep their own provider, with truthful bitrate reporting", async () => {
  const f = fixture();
  const catalog = await f.resolvePlaybackUrlWithDetails({ id: "saavn", source: "jiosaavn", downloadUrl: [{ quality: "320kbps" }] }, "high");
  assert.equal(catalog.qualityState.actualBitrate, 320);
  assert.deepEqual(f.catalog, ["high"]);
  const direct = await f.resolvePlaybackUrlWithDetails({ id: "legacy", source: "jiosaavn", audioUrl: "https://cdn.test/original.mp3" }, "high");
  assert.equal(direct.url, "https://cdn.test/original.mp3");
  assert.equal(direct.qualityState.actualBitrate, 0);
  assert.equal(direct.qualityState.qualityLabel, "Original audio");
  assert.equal(f.resolutions.length, 0);
});

test("a YouTube source rejection never uses a retained JioSaavn URL or quality ladder", async () => {
  const f = fixture({ youtubeError: new Error("Source rejected") });
  await assert.rejects(f.resolvePlaybackUrlWithDetails({ ...song,
    audioUrl: "https://aac.saavncdn.com/backup.mp4", downloadUrl: [{ quality: "320kbps" }] }, "high"), /Source rejected/);
  assert.equal(f.catalog.length, 0);
});

test("a stale local queue URL cannot bypass managed download revocation or an unavailable file", async () => {
  for (const status of ["revoked", "expired", "deleted", "paused", "completed"]) {
    const f = fixture({ download: { status } });
    const youtube = await f.resolvePlaybackUrlWithDetails({ ...song, audioUrl: "file:///managed.m4a" });
    assert.equal(youtube.url, f.original);
    const catalog = await f.resolvePlaybackUrlWithDetails({ id: "catalog", source: "jiosaavn", audioUrl: "file:///managed.m4a" });
    assert.equal(catalog.url, null);
  }
});
