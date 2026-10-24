const test = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const officialMusicVideo = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/services/youtube/officialMusicVideo.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: officialMusicVideo, exports: officialMusicVideo.exports });
const tick = () => new Promise(resolve => setImmediate(resolve));

test("real music parser retains empty-tab messages alongside a usable queue without type warnings", async () => {
  const { Parser, YTNodes } = await import("youtubei.js");
  const errors = [];
  Parser.setParserErrorHandler(error => errors.push(error));
  const queue = new YTNodes.Tab({ selected: true, content: { musicQueueRenderer: {
    content: { playlistPanelRenderer: { playlistId: "RDAMVMQKnJzg-fqBw", contents: [] } },
  } } });
  const empty = new YTNodes.Tab({ title: "Lyrics", content: {
    messageRenderer: { text: { simpleText: "Lyrics aren't available" } },
  } });
  const restricted = new YTNodes.Tab({ content: {
    messageRenderer: { text: { simpleText: "Sign in to confirm you're not a bot" } },
  } });
  assert.ok(queue.content.is(YTNodes.MusicQueue));
  assert.equal(queue.content.content.playlist_id, "RDAMVMQKnJzg-fqBw");
  assert.ok(empty.content.is(YTNodes.Message));
  assert.equal(empty.content.text.toString(), "Lyrics aren't available");
  assert.match(restricted.content.text.toString(), /Sign in/);
  assert.equal(errors.length, 0);
  // The patch accepts a real supported shape; it doesn't disable validation.
  const unsupported = new YTNodes.Tab({ content: { buttonRenderer: { text: { simpleText: "Unexpected" } } } });
  assert.equal(unsupported.content, null);
  assert.ok(errors.some(error => error.error_type === "typecheck"));
});
function fixture({ now = () => 1000000, platform = "android", info, fetchStatus = () => 200, contentType = "audio/mp4", music = {}, nodes = {}, actions = {}, parser = {}, lazyPlayer = false, ciphered = false, apiText = "{}", responseClass = Response, streamFetchOverride, timerScale = 1, mintProof = async () => null } = {}) {
  const clients = [], requests = [], diagnostics = [], formatSelections = [];
  const playerLoads = [], sessionOptions = [], cancelledBodies = [];
  const format = { has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000, approx_duration_ms: 188125,
    url: ciphered ? undefined : "https://rr1.googlevideo.com/videoplayback?expire=2000&n=original%2Bvalue",
    signature_cipher: ciphered ? "cipher" : undefined,
    decipher: async () => "https://rr1.googlevideo.com/videoplayback?expire=2000" };
  const getInfo = info || (async (_, { client }) => {
    clients.push(client); return { cpn: "playback-nonce", playability_status: { status: "OK" },
      streaming_data: { adaptive_formats: [format] } };
  });
  const yt = { music, actions, session: { player: lazyPlayer ? undefined : {}, context: { client: { visitorData: "visitor" } } },
    getBasicInfo: async (videoId, options) => {
      const response = await getInfo(videoId, options);
      const formats = [...(response.streaming_data?.adaptive_formats || []), ...(response.streaming_data?.formats || [])];
      formats.forEach((format, index) => { format.itag ??= index + 1; });
      return { basic_info: { id: videoId }, ...response, chooseFormat: response.chooseFormat || (options => {
        formatSelections.push(options); return formats.find(format => format.itag === options.itag);
      }) };
    } };
  const constants = { STREAM_HEADERS: { Referer: "https://www.youtube.com/" }, CLIENTS: Object.fromEntries(
    ["VISIONOS", "ANDROID_VR", "TV"].map(client => [client, { USER_AGENT: client }])) };
  const fetchStream = async (url, options) => {
    requests.push({ url, options }); const status = fetchStatus(options, url);
    return { ok: status >= 200 && status < 300, status, statusText: "", url,
      headers: new Headers({ "content-type": contentType }), text: async () => apiText,
      arrayBuffer: async () => new TextEncoder().encode(apiText).buffer,
      body: { cancel: async () => { cancelledBodies.push(status); } } };
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/services/youtube/SharedYouTubeTransport.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, __DEV__: true, console: { info: (label, data) => diagnostics.push({ label, ...data }) }, setTimeout: (callback, ms) => setTimeout(callback, ms * timerScale), clearTimeout, URL, AbortController, Response: responseClass,
    Date: { now }, globalThis: { crypto: { randomUUID: () => "nonce" },
      fetch: async (url, options) => {
        requests.push({ url, options }); const status = fetchStatus(options);
        return { ok: status >= 200 && status < 300, status };
      } }, require: name => {
      if (name === "./runtime") return {};
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name === "./YouTubePoToken") return { youtubePoTokens: { mint: mintProof } };
      if (name === "expo/fetch") return { fetch: streamFetchOverride ? (url, options) => streamFetchOverride(url, options, fetchStream) : fetchStream };
      if (name === "./YouTubeArtists") return require("./helpers/youtube-artists-fixture.cjs");
      if (name === "./YouTubeArtwork") return require("./helpers/youtube-artwork-fixture.cjs");
      if (name === "./YouTubeVideoFormats") return require("./helpers/youtube-video-fixture.cjs");
      if (name === "./officialMusicVideo") return officialMusicVideo.exports;
      if (name === "jintr") return { Jinter: class {} };
      if (name === "youtubei.js/react-native") return {
        Constants: constants, Platform: { shim: {} }, YTNodes: nodes, Parser: { addRuntimeParser() {}, ...parser },
        Helpers: { YTNode: class { constructor() {} } },
        Player: { create: async () => { playerLoads.push(true); return {}; } },
        Innertube: { create: async options => { sessionOptions.push(options); return yt; } },
      };
      throw new Error(name);
    } });
  return { api: module.exports.sharedYouTubeTransport, clients, requests, playerLoads, sessionOptions, cancelledBodies, diagnostics, formatSelections };
}

test("official video lookup reads title endpoints and localized shelves, then searches credits only on a miss", async () => {
  const MusicShelf = class {};
  const calls = [];
  const row = (videoId, musicVideoType, artist) => ({ item_type: "video", title: "Maand", duration: { seconds: 186 },
    authors: [{ name: artist }], flex_columns: [{ title: { runs: [{ endpoint: { payload: {
      videoId, watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType } },
    } } }] } }] });
  const f = fixture({ nodes: { MusicShelf }, music: { search: async (query, options) => {
    calls.push(query); assert.equal(options.type, "video");
    return { contents: [{ title: { toString: () => "Vídeos" }, is: type => type === MusicShelf,
      contents: calls.length === 1 ? [row("fanvid12345", "MUSIC_VIDEO_TYPE_UGC", "Bayaan")]
        : [row("zFk1ke2pcTA", "MUSIC_VIDEO_TYPE_OMV", "Bayaan")] }] };
  } } });
  const selected = await f.api.resolveOfficialMusicVideo({ title: "Maand", artist: "Bayaan, Hasan Raheem & Rovalio",
    durationSeconds: 185, artistChannelIds: [] }, "official-video");
  assert.equal(selected, "zFk1ke2pcTA");
  assert.deepEqual(calls, ["maand official video", "Bayaan, Hasan Raheem & Rovalio maand official music video"]);
});

test("official video lookup stops after a matching first response and does not request audio", async () => {
  const MusicShelf = class {};
  let searches = 0;
  const f = fixture({ nodes: { MusicShelf }, music: { search: async () => {
    searches++;
    return { contents: [{ is: type => type === MusicShelf, contents: [{ item_type: "video", id: "j18MRhEfmPk",
      title: "Ishqa Ve (feat. Yuvraj Tung)", duration: { seconds: 230 }, authors: [{ name: "Zeeshan Ali" }],
      flex_columns: [{ title: { runs: [{ endpoint: { payload: {
        watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: "MUSIC_VIDEO_TYPE_OMV" } },
      } } }] } }] }] }] };
  } } });
  assert.equal(await f.api.resolveOfficialMusicVideo({ title: "Ishqa Ve", artist: "Zeeshan Ali",
    durationSeconds: 208, artistChannelIds: [] }, "official-video"), "j18MRhEfmPk");
  assert.equal(searches, 1); assert.equal(f.clients.length, 0); assert.equal(f.requests.length, 0);
});

test("artist browse follows the actual top-songs endpoint and scopes continuation to its channel", async () => {
  const nodes = Object.fromEntries(["MusicResponsiveListItem", "MusicTwoRowItem", "MusicShelf", "MusicCarouselShelf", "MusicImmersiveHeader", "MusicVisualHeader", "MusicPlaylistShelf", "MusicDescriptionShelf", "ContinuationItem", "AppendContinuationItemsAction"].map(name => [name, class {}]));
  const node = (type, data) => ({ ...data, is: (...types) => types.includes(type) });
  const list = items => Object.assign([...items], { filterType(type) { return list(this.filter(item => item.is(type))); } });
  const channel = "UC" + "a".repeat(22);
  const song = node(nodes.MusicResponsiveListItem, { id: "abcdefghijk", title: "Track", artists: [{ name: "Artist", channel_id: channel }], thumbnails: [] });
  const other = node(nodes.MusicTwoRowItem, { item_type: "artist", id: "UC" + "b".repeat(22), title: "Related", thumbnail: [] });
  const album = node(nodes.MusicTwoRowItem, { item_type: "album", id: "MPRErelease", title: "Release", thumbnail: [] });
  let browseCalls = 0, endpointCalls = 0;
  const parsedPage = token => ({ contents_memo: { getType: type => type === nodes.MusicPlaylistShelf ? [{ contents: list([song]), continuation: token }] : [] } });
  const page = { header: node(nodes.MusicImmersiveHeader, { title: "Artist", thumbnail: null, description: "Biography" }),
    sections: [node(nodes.MusicShelf, { contents: list([song]), endpoint: { call: async (_, options) => {
      endpointCalls++; assert.equal(options.client, "YTMUSIC"); return { data: parsedPage("continuation-token") };
    } } }), node(nodes.MusicCarouselShelf, { contents: list([album, other]) })], page: {} };
  const f = fixture({ nodes, parser: { parseResponse: data => data }, music: { getArtist: async id => { browseCalls++; assert.equal(id, channel); return page; } },
    actions: { execute: async (path, options) => { assert.equal(path, "/browse"); assert.equal(options.continuation, "continuation-token");
      return { data: { on_response_received_actions: list([node(nodes.AppendContinuationItemsAction, { contents: list([song]) })]) } }; } } });
  const detail = await f.api.artist(channel, "artist");
  assert.equal(detail.songs.length, 1); assert.equal(detail.albums[0].id, "MPRErelease");
  assert.equal(detail.artists.length, 1); assert.equal(detail.description, "Biography");
  assert.equal(endpointCalls, 0); // Full catalog is lazy, not requested while drawing the profile.
  const more = await f.api.artistSongs(channel, "", "more");
  assert.equal(endpointCalls, 1); assert.equal(browseCalls, 1); assert.ok(more.cursor);
  await assert.rejects(f.api.artistSongs("UC" + "c".repeat(22), more.cursor, "wrong"), /expired/);
  const next = await f.api.artistSongs(channel, more.cursor, "next");
  assert.equal(next.songs.length, 1); assert.equal(next.cursor, "");
});
test("catalog skips player parsing; concurrent playback prepares a single player", async () => {
  const f = fixture({ lazyPlayer: true, ciphered: true, music: { getHomeFeed: async () => ({ sections: [] }) } });
  await f.api.home("home");
  assert.equal(f.playerLoads.length, 0);
  assert.equal(f.sessionOptions[0].retrieve_player, false);
  await Promise.all([f.api.resolveStream("abcdefghijk", "medium", "one"), f.api.resolveStream("lmnopqrstuv", "medium", "two")]);
  assert.equal(f.playerLoads.length, 1);
});

test("regional home follows server language endpoints, excludes community rows and bounds concurrency", async () => {
  const nodes = { MusicNavigationButton: class {}, MusicCarouselShelf: class {}, MusicResponsiveListItem: class {}, MusicTwoRowItem: class {} };
  const languages = ["Hindi", "Punjabi", "Tamil", "Telugu", "Marathi", "Bengali"];
  let running = 0, maximum = 0;
  const playlist = name => ({ item_type: "playlist", id: "VL" + name, title: name, subtitle: "Editorial", thumbnail: [],
    endpoint: { payload: {} }, is: type => type === nodes.MusicTwoRowItem });
  const shelf = (title, names) => ({ header: { title }, contents: names.map(playlist), is: type => type === nodes.MusicCarouselShelf });
  const buttons = languages.map(language => ({ button_text: language, endpoint: { call: async () => {
    running++; maximum = Math.max(maximum, running); await tick(); running--;
    return { data: { contents_memo: { getType: () => [
      shelf("Featured playlists", ["New Music " + language, language + " Hitlist"]),
      shelf("Community playlists", ["Unofficial " + language]),
    ] } } };
  } } }));
  const f = fixture({ nodes, parser: { parseResponse: data => data }, actions: { execute: async (path, options) => {
    assert.equal(path, "/browse"); assert.equal(options.browseId, "FEmusic_moods_and_genres");
    assert.equal(options.client, "YTMUSIC");
    return { data: { contents_memo: { getType: () => buttons } } };
  } } });
  const home = await f.api.explore("regional");
  assert.equal(maximum, 2);
  assert.equal(home.sections[0].category, "new-releases");
  assert.equal(home.sections[0].playlists.length, 6);
  assert.equal(home.sections.length, 7);
  assert.equal(home.playlists.some(item => item.name.startsWith("Unofficial")), false);
  assert.equal(f.sessionOptions[0].location, "IN");
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
test("direct audio preserves signed URL and validates streaming GET without player parsing", async () => {
  const f = fixture({ lazyPlayer: true });
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(stream.clientProfile, "VISIONOS");
  assert.equal(f.requests[0].options.method, undefined);
  assert.equal(f.requests[0].options.headers.Range, undefined);
  assert.equal(stream.url, "https://rr1.googlevideo.com/videoplayback?expire=2000&n=original%2Bvalue");
  assert.equal(f.playerLoads.length, 0);
  assert.equal(stream.headers["User-Agent"], "VISIONOS");
  assert.equal(stream.durationSeconds, 188.125);
  assert.deepEqual(f.cancelledBodies, [200]);
  assert.equal(f.requests[0].options.credentials, "omit");
});

test("YouTube low, medium and high select real distinct available AAC bitrates", async () => {
  const formats = [256000, 48000, 128000].map(bitrate => ({ has_audio: true, has_video: false,
    mime_type: "audio/mp4", bitrate, url: `https://rr1.googlevideo.com/videoplayback?expire=2000&bitrate=${bitrate}` }));
  const f = fixture({ info: async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: formats } }) });
  for (const [quality, expected] of [["low", 48000], ["medium", 128000], ["high", 256000]]) {
    const stream = await f.api.resolveStream("abcdefghijk", quality, quality);
    assert.equal(stream.bitrate, expected);
    assert.equal(new URL(stream.url).searchParams.get("bitrate"), String(expected));
    assert.equal(stream.codec, "aac");
  }
  const limited = fixture();
  assert.equal((await limited.api.resolveStream("abcdefghijk", "high", "limited")).bitrate, 128000);
});

test("medium without a standard AAC tier chooses the best available source instead of the lowest", async () => {
  const formats = [192000, 256000].map(bitrate => ({ has_audio: true, has_video: false,
    mime_type: "audio/mp4", bitrate, url: `https://rr1.googlevideo.com/videoplayback?expire=2000&bitrate=${bitrate}` }));
  const f = fixture({ info: async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: formats } }) });
  assert.equal((await f.api.resolveStream("abcdefghijk", "medium", "medium-without-standard")).bitrate, 256000);
});

test("iOS selects AAC-LC instead of the lower-bitrate HE-AAC timing path", async () => {
  const formats = [[48000, "mp4a.40.5"], [128000, "mp4a.40.2"], [256000, "mp4a.40.2"]].map(([bitrate, codec]) => ({
    has_audio: true, has_video: false, mime_type: `audio/mp4; codecs="${codec}"`, bitrate,
    approx_duration_ms: 214024, url: `https://rr1.googlevideo.com/videoplayback?expire=2000&bitrate=${bitrate}`,
  }));
  const info = async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: formats } });
  for (const [quality, expected] of [["low", 128000], ["medium", 128000], ["high", 256000]]) {
    const f = fixture({ platform: "ios", info });
    const stream = await f.api.resolveStream("abcdefghijk", quality, quality);
    assert.equal(stream.bitrate, expected);
    assert.match(stream.mimeType, /mp4a\.40\.2/);
    assert.equal(stream.durationSeconds, 214.024);
  }
  const android = fixture({ info });
  assert.equal((await android.api.resolveStream("abcdefghijk", "low", "android-low")).bitrate, 48000);
});

test("Android selects high-fidelity Opus (itag 251) while iOS isolates AAC-LC", async () => {
  const formats = [
    { has_audio: true, has_video: false, mime_type: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000,
      approx_duration_ms: 214024, url: "https://rr1.googlevideo.com/videoplayback?expire=2000&bitrate=128000" },
    { has_audio: true, has_video: false, mime_type: 'audio/webm; codecs="opus"', bitrate: 160000,
      approx_duration_ms: 214024, url: "https://rr1.googlevideo.com/videoplayback?expire=2000&bitrate=160000" },
  ];
  const info = async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: formats } });

  const android = fixture({ platform: "android", info, contentType: "audio/webm" });
  const androidStream = await android.api.resolveStream("abcdefghijk", "high", "android-opus");
  assert.equal(androidStream.bitrate, 160000);
  assert.equal(androidStream.codec, "opus");
  assert.match(androidStream.mimeType, /audio\/webm/);

  const ios = fixture({ platform: "ios", info, contentType: "audio/mp4" });
  const iosStream = await ios.api.resolveStream("abcdefghijk", "high", "ios-aac");
  assert.equal(iosStream.bitrate, 128000);
  assert.equal(iosStream.codec, "aac");
  assert.match(iosStream.mimeType, /mp4a\.40\.2/);
});
test("API fetch uses the same anonymous stack and preserves buffered response metadata", async () => {
  const f = fixture();
  await f.api.resolveStream("abcdefghijk", "medium", "stream");
  const response = await f.sessionOptions[0].fetch("https://www.youtube.com/youtubei/v1/player", { credentials: "include" });
  assert.equal(f.requests[1].options.credentials, "omit");
  assert.equal(response.url, "https://www.youtube.com/youtubei/v1/player");
  assert.deepEqual(await response.json(), {});
});

test("catalog buffering preserves UTF-8 with React Native's Latin-1 ArrayBuffer response behavior", async () => {
  class NativeResponse extends Response {
    constructor(body, options) {
      super(body instanceof ArrayBuffer ? Buffer.from(body).toString("latin1") : body, options);
    }
  }
  const metadata = { title: "हिन्दी தமிழ்", subtitle: "EP • Ajay-Atul" };
  const f = fixture({ apiText: JSON.stringify(metadata), responseClass: NativeResponse });
  await f.api.resolveStream("abcdefghijk", "medium", "stream");
  const response = await f.sessionOptions[0].fetch("https://www.youtube.com/youtubei/v1/browse");
  assert.deepEqual(await response.json(), metadata);
});
test("media 403 resolves one fresh URL on the same session and client", async () => {
  let resolutions = 0;
  const f = fixture({ info: async videoId => ({ playability_status: { status: "OK" }, streaming_data: {
    adaptive_formats: [{ has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000,
      url: `https://rr1.googlevideo.com/videoplayback?expire=2000&id=${videoId}&resolution=${++resolutions}` }],
  } }), fetchStatus: (_, url) => url.includes("resolution=1") ? 403 : 200 });
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(stream.videoId, "abcdefghijk");
  assert.equal(stream.clientProfile, "VISIONOS");
  assert.equal(f.sessionOptions.length, 1);
  assert.equal(resolutions, 2);
  assert.match(stream.url, /resolution=2/);
  assert.deepEqual(f.cancelledBodies, [403, 200]);
});

test("a non-audio response tries the next compatible format before another client", async () => {
  const formats = [256000, 128000].map(bitrate => ({ has_audio: true, has_video: false,
    mime_type: "audio/mp4", bitrate, url: `https://rr1.googlevideo.com/videoplayback?expire=2000&bitrate=${bitrate}` }));
  const f = fixture({ info: async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: formats } }),
    streamFetchOverride: async (url, options, fetchStream) => {
      const response = await fetchStream(url, options);
      if (url.includes("bitrate=256000")) response.headers.set("content-type", "text/html");
      return response;
    } });
  const stream = await f.api.resolveStream("abcdefghijk", "high", "stream");
  assert.equal(stream.bitrate, 128000);
  assert.equal(stream.videoId, "abcdefghijk");
  assert.equal(stream.clientProfile, "VISIONOS");
  assert.deepEqual(f.cancelledBodies, [200, 200]);
});

test("verification during a media refresh stops immediately without replacing the session", async () => {
  let attempts = 0;
  const f = fixture({ info: async () => ++attempts === 1
    ? { playability_status: { status: "OK" }, streaming_data: { adaptive_formats: [{ has_audio: true,
      has_video: false, mime_type: "audio/mp4", bitrate: 128000, url: "https://rr1.googlevideo.com/videoplayback?expire=2000" }] } }
    : { playability_status: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you are not a bot" } }, fetchStatus: () => 403 });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "stream"), error => error.code === "LOGIN_REQUIRED" && error.stage === "player");
  assert.equal(f.sessionOptions.length, 1);
  assert.equal(f.requests.length, 1);
  assert.equal(attempts, 2);
});

test("persistent access rejection stays bounded and leaves no retry loop", async () => {
  const f = fixture({ fetchStatus: () => 403 });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "stream"), error =>
    error.code === "MEDIA_FORBIDDEN" && error.stage === "media" && error.httpStatus === 403 && error.retryExhausted);
  assert.equal(f.sessionOptions.length, 1);
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.clients, ["VISIONOS", "VISIONOS"]);
});

test("hung media validation aborts and retries once on the same initialized client", async () => {
  let aborted = false, validations = 0;
  const f = fixture({ timerScale: 0.001, streamFetchOverride: (url, options, fetchStream) => {
    if (++validations > 1) return fetchStream(url, options);
    return new Promise((_, reject) => options.signal.addEventListener("abort", () => {
      aborted = true; reject(new Error("Audio request timed out"));
    }, { once: true }));
  } });
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(aborted, true);
  assert.equal(stream.clientProfile, "VISIONOS");
  assert.equal(validations, 2);
  assert.equal(f.sessionOptions.length, 1);
});

test("expired format is skipped before a media request and a fresh format can play", async () => {
  const f = fixture({ info: async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: [
    { has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 256000,
      url: "https://rr1.googlevideo.com/videoplayback?expire=1010" },
    { has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000,
      url: "https://rr1.googlevideo.com/videoplayback?expire=2000" },
  ] } }) });
  assert.equal((await f.api.resolveStream("abcdefghijk", "high", "stream")).bitrate, 128000);
  assert.equal(f.requests.length, 1);
});

test("WEB prepares its player timestamp before requesting player info", async () => {
  let f;
  f = fixture({ lazyPlayer: true, info: async (_, { client }) => {
    if (client !== "WEB") throw new Error("No compatible stream");
    assert.equal(f.playerLoads.length, 1);
    return { playability_status: { status: "OK" }, streaming_data: { adaptive_formats: [{ has_audio: true,
      has_video: false, mime_type: "audio/mp4", bitrate: 128000,
      url: "https://rr1.googlevideo.com/videoplayback?expire=2000" }] } };
  } });
  assert.equal((await f.api.resolveStream("abcdefghijk", "medium", "stream")).clientProfile, "WEB");
});
test("HTML error responses are cancelled and never passed to the audio decoder", async () => {
  const f = fixture({ contentType: "text/html" });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "stream"), /non-AAC/);
  assert.equal(f.cancelledBodies.length, 4);
  assert.equal(f.clients.includes("IOS"), false);
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
test("verification stops retries and pauses audio/video requests until cooldown expires", async () => {
  let now = 1000000, calls = 0, mints = 0;
  const f = fixture({ now: () => now, mintProof: async () => { mints++; return null; }, info: async () => {
    calls++;
    return { playability_status: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you are not a bot" } };
  } });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "first"), /LOGIN_REQUIRED/);
  await assert.rejects(f.api.resolveStream("12345678901", "medium", "next"), /SIGN_IN_REQUIRED/);
  await assert.rejects(f.api.resolveVideoStream("12345678901", "medium", "video"), /SIGN_IN_REQUIRED/);
  assert.equal(calls, 1); assert.equal(mints, 0); assert.equal(f.requests.length, 0);
  now += 60001;
  await assert.rejects(f.api.resolveStream("12345678901", "medium", "later"), /LOGIN_REQUIRED/);
  assert.equal(calls, 2);
});

for (const platform of ["android", "ios"]) {
  for (const quality of ["low", "medium", "high"]) {
    test(`${platform}/${quality}: verification rejection stops before another client or token mint`, async () => {
      const calls = []; let mints = 0;
      const f = fixture({ platform, mintProof: async () => { mints++; return "a".repeat(160); },
        info: async (id, options) => {
          calls.push({ id, ...options });
          return { playability_status: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you’re not a bot" } };
        } });
      await assert.rejects(f.api.resolveStream("G8Voqp9rR8E", quality, "selected"), /LOGIN_REQUIRED/);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls.map(c => c.client), ["VISIONOS"]);
      assert.equal(calls[0].id, "G8Voqp9rR8E");
      assert.equal(mints, 0); assert.equal(f.requests.length, 0);
      await assert.rejects(f.api.resolveStream("NNpVL7xauj8", quality, "next"), /SIGN_IN_REQUIRED/);
      assert.equal(calls.length, 1);
    });
  }
}

test("a minted and attached MWEB proof does not override an upstream verification rejection", async () => {
  let mints = 0; const calls = [], proof = "a".repeat(160);
  const f = fixture({ mintProof: async () => { mints++; return proof; }, info: async (_, options) => {
    calls.push(options);
    if (options.client !== "MWEB") throw new Error("HTTP 403");
    assert.equal(options.po_token, undefined);
    return { playability_status: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } };
  } });
  await assert.rejects(f.api.resolveStream("G8Voqp9rR8E", "medium", "proof-attached"), /LOGIN_REQUIRED/);
  assert.equal(mints, 1);
  assert.deepEqual(calls.map(c => c.client), ["VISIONOS", "ANDROID_VR", "TV", "MWEB"]);
  assert.equal(f.requests.length, 0);
  await assert.rejects(f.api.resolveStream("NNpVL7xauj8", "medium", "after-proof"), /SIGN_IN_REQUIRED/);
  assert.equal(mints, 1);
});
test("track-specific sign-in restriction does not block other tracks", async () => {
  let calls = 0;
  const f = fixture({ info: async () => {
    calls++;
    return { playability_status: { status: "LOGIN_REQUIRED", reason: "Private video" } };
  } });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "first"), /Private video/);
  await assert.rejects(f.api.resolveStream("12345678901", "medium", "second"), /Private video/);
  assert.equal(calls, 2);
});

test("attested MWEB attaches its video-bound proof only to GVS and preserves the signed URL", async () => {
  const proof = "a".repeat(160), calls = [];
  const f = fixture({ mintProof: async () => proof, info: async (videoId, options) => {
    calls.push(options);
    if (options.client !== "MWEB") throw new Error("HTTP 403");
    assert.equal(options.po_token, undefined);
    return { playability_status: { status: "OK" }, streaming_data: { adaptive_formats: [{ has_audio: true,
      has_video: false, mime_type: "audio/mp4", bitrate: 128000,
      url: `https://rr1.googlevideo.com/videoplayback?expire=2000&n=original%2Bvalue&video=${videoId}` }] } };
  } });
  const stream = await f.api.resolveStream("abcdefghijk", "high", "attested");
  assert.equal(stream.clientProfile, "MWEB");
  assert.equal(stream.url, `https://rr1.googlevideo.com/videoplayback?expire=2000&n=original%2Bvalue&video=abcdefghijk&pot=${proof}`);
  assert.equal(f.requests[0].url, stream.url);
  assert.equal(calls.filter(item => item.client !== "MWEB").every(item => !item.po_token), true);
  calls.length = 0;
  await f.api.resolveStream("12345678901", "high", "second-attested");
  assert.deepEqual(calls.map(item => item.client), ["MWEB"]);
});

test("a working direct profile avoids attestation and is prioritized on the next song", async () => {
  const calls = []; let mints = 0;
  const f = fixture({ mintProof: async () => { mints++; return null; }, info: async (videoId, { client }) => {
    calls.push(client);
    if (client === "VISIONOS") throw new Error("No compatible format");
    return { playability_status: { status: "OK" }, streaming_data: { adaptive_formats: [{ has_audio: true,
      has_video: false, mime_type: "audio/mp4", bitrate: 128000,
      url: `https://rr1.googlevideo.com/videoplayback?expire=2000&video=${videoId}` }] } };
  } });
  await f.api.resolveStream("abcdefghijk", "high", "first-profile");
  calls.length = 0;
  await f.api.resolveStream("12345678901", "high", "second-profile");
  assert.deepEqual(calls, ["ANDROID_VR"]);
  assert.equal(mints, 0);
});

test("invalid IDs never initialize a YouTube session", async () => {
  const f = fixture();
  await assert.rejects(f.api.resolveStream("invalid", "medium", "bad-id"), error => error.code === "INVALID_VIDEO_ID" && error.stage === "input");
  assert.equal(f.sessionOptions.length, 0);
  assert.equal(f.requests.length, 0);
});

test("library-thrown verification metadata is terminal and diagnostics exclude credentials", async () => {
  let calls = 0;
  const f = fixture({ info: async () => {
    calls++;
    throw Object.assign(new Error("Player rejected https://example.test/?token=signed-secret\nCookie: cookie-secret"), {
      info: { error_type: "LOGIN_REQUIRED", reason: "Sign in to confirm you are not a bot; token=proof-secret" },
    });
  } });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "thrown-login"), error => {
    assert.equal(error.code, "LOGIN_REQUIRED");
    assert.doesNotMatch(error.message, /signed-secret|cookie-secret|proof-secret/);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(f.requests.length, 0);
  assert.equal(f.diagnostics.length, 0);
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /secret|example\.test|Cookie|token=/);
});

test("rate limiting stops without trying another client or recreating the session", async () => {
  let calls = 0;
  const f = fixture({ info: async () => { calls++; throw new Error("HTTP 429"); } });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "rate-limit"), error => error.code === "RATE_LIMITED" && error.httpStatus === 429);
  assert.equal(calls, 1);
  assert.equal(f.sessionOptions.length, 1);
});

test("missing and incompatible sources produce separate format errors without media requests", async () => {
  for (const [format, code] of [
    [{ has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000 }, "NO_DIRECT_AUDIO_URL"],
    [{ has_audio: true, has_video: false, mime_type: "audio/ogg", bitrate: 128000, url: "https://rr1.googlevideo.com/videoplayback?expire=2000" }, "UNSUPPORTED_FORMAT"],
  ]) {
    const f = fixture({ info: async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: [format] } }) });
    await assert.rejects(f.api.resolveStream("abcdefghijk", "high", "no-source"), error => error.code === code && error.stage === "format");
    assert.equal(f.requests.length, 0);
  }
});

test("missing and wrong video details never reach format selection or the decoder", async () => {
  for (const basic_info of [undefined, { id: "12345678901" }]) {
    const f = fixture({ info: async () => ({ basic_info, playability_status: { status: "OK" } }) });
    await assert.rejects(f.api.resolveStream("abcdefghijk", "high", "wrong-video"), error => error.code === "UNAVAILABLE" && error.stage === "player");
    assert.equal(f.formatSelections.length, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("empty decipher output is rejected before media fetch", async () => {
  const f = fixture({ info: async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: [{
    has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000,
    signature_cipher: "cipher", decipher: async () => "",
  }] } }) });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "high", "empty-cipher"), error => error.code === "NO_DIRECT_AUDIO_URL" && error.stage === "decipher");
  assert.equal(f.requests.length, 0);
});

test("successful extraction uses chooseFormat without emitting console diagnostics", async () => {
  const f = fixture();
  await f.api.resolveStream("abcdefghijk", "medium", "first-song");
  await f.api.resolveStream("12345678901", "medium", "second-song");
  assert.equal(f.sessionOptions.length, 1);
  assert.equal(f.formatSelections.length, 2);
  assert.equal(f.formatSelections[0].type, "audio");
  assert.equal(f.diagnostics.length, 0);
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /googlevideo|expire=|original%2Bvalue/);
});

test("a persistent timeout has one retry and cancellation interrupts recovery delay", async () => {
  let calls = 0;
  const f = fixture({ timerScale: 0.001, info: async () => { calls++; throw new Error("Request timed out"); } });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "timeout"), error => error.code === "NETWORK_TIMEOUT" && error.retryExhausted);
  assert.equal(calls, 2);
  let cancelledCalls = 0;
  const cancelled = fixture({ info: async () => { cancelledCalls++; throw new Error("Request timed out"); } });
  const pending = cancelled.api.resolveStream("abcdefghijk", "medium", "cancel-delay");
  await tick();
  cancelled.api.cancel("cancel-delay");
  await assert.rejects(pending, /cancelled/);
  assert.equal(cancelledCalls, 1);
});

test("home keeps upstream shelf titles and preserves linked playlist publisher identity", async () => {
  const nodes = { MusicCarouselShelf: class {}, MusicResponsiveListItem: class {}, MusicTwoRowItem: class {} };
  const playlist = { item_type: "playlist", id: "VLPLone", endpoint: { payload: {} }, title: "Official hits", thumbnail: [],
    subtitle: { toString: () => "YouTube Music", runs: [
      { text: "YouTube Music", endpoint: { payload: { browseId: "UC-9-kyTW8ZkZNDHQJ6FgpwQ" } } },
    ] }, is: type => type === nodes.MusicTwoRowItem };
  const shelf = { header: { title: "Your daily soundtrack" }, is: type => type === nodes.MusicCarouselShelf, contents: [playlist] };
  const f = fixture({ nodes, music: { getHomeFeed: async () => ({ sections: [shelf] }) } });
  const home = await f.api.home("home-shelves");
  assert.equal(home.sections[0].title, "Your daily soundtrack");
  assert.equal(home.sections[0].playlists[0].ownerChannelId, "UC-9-kyTW8ZkZNDHQJ6FgpwQ");
  assert.equal(home.sections[0].playlists[0].ownerName, "YouTube Music");
  assert.equal(f.playerLoads.length, 0);
});

test("home expands real playlist shelves by one continuation without loading any audio streams", async () => {
  const nodes = { MusicCarouselShelf: class {}, MusicResponsiveListItem: class {}, MusicTwoRowItem: class {} };
  const shelf = id => ({ header: { title: id }, is: type => type === nodes.MusicCarouselShelf,
    contents: [{ item_type: "playlist", id, title: id, subtitle: "Playlist", thumbnail: [], endpoint: { payload: {} }, is: type => type === nodes.MusicTwoRowItem }] });
  let calls = 0;
  const f = fixture({ nodes, music: { getHomeFeed: async () => ({ sections: [shelf("PLone")], has_continuation: true,
    getContinuation: async () => { calls++; return { sections: [shelf("PLtwo")], has_continuation: true }; } }) } });
  const home = await f.api.home("expanded");
  assert.equal(calls, 1);
  assert.equal(home.playlists.map(item => item.id).join(","), "PLone,PLtwo");
  assert.equal(home.sections.length, 2);
  assert.equal(f.playerLoads.length, 0);
});

test("home continuation failure preserves the usable first page", async () => {
  const nodes = { MusicCarouselShelf: class {}, MusicResponsiveListItem: class {}, MusicTwoRowItem: class {} };
  const shelf = { header: { title: "First page" }, is: type => type === nodes.MusicCarouselShelf,
    contents: [{ item_type: "playlist", id: "PLusable", title: "Available playlist", subtitle: "Playlist", thumbnail: [],
      endpoint: { payload: {} }, is: type => type === nodes.MusicTwoRowItem }] };
  const f = fixture({ nodes, music: { getHomeFeed: async () => ({ sections: [shelf], has_continuation: true,
    getContinuation: async () => { throw new Error("Temporary failure"); } }) } });
  const home = await f.api.home("partial");
  assert.equal(home.sections.length, 1);
  assert.equal(home.playlists[0].id, "PLusable");
  assert.equal(f.playerLoads.length, 0);
});

test("regional catalog retains album identity without loading the audio player", async () => {
  const nodes = { MusicCarouselShelf: class {}, MusicResponsiveListItem: class {}, MusicTwoRowItem: class {} };
  const album = { item_type: "album", id: "MPREalbum", title: "New film soundtrack", subtitle: "Artist · 2026", thumbnail: [],
    endpoint: { payload: {} }, is: type => type === nodes.MusicTwoRowItem };
  const shelf = { header: { title: "New albums & singles" }, contents: [album], is: type => type === nodes.MusicCarouselShelf };
  const button = { button_text: "Hindi", endpoint: { call: async () => ({ data: { contents_memo: { getType: () => [shelf] } } }) } };
  const f = fixture({ nodes, parser: { parseResponse: data => data },
    actions: { execute: async () => ({ data: { contents_memo: { getType: () => [button] } } }) }, music: {
    getAlbum: async id => { assert.equal(id, "MPREalbum"); return { contents: [
      { id: "abcdefghijk", title: "Album song", thumbnails: [], duration: { seconds: 150 } },
    ] }; } } });
  const explore = await f.api.explore("explore");
  assert.equal(explore.sections[0].title, "Hindi Hits");
  assert.equal(explore.playlists[0].kind, "album");
  const opened = await f.api.playlist("MPREalbum", "", "album");
  assert.equal(opened.songs[0].videoId, "abcdefghijk");
  assert.equal(opened.cursor, "");
  assert.equal(f.playerLoads.length, 0);
});

test("first-page home rows are delivered while continuation is still pending", async () => {
  let complete; let partial;
  const f = fixture({ music: { getHomeFeed: async () => ({ sections: [], has_continuation: true,
    getContinuation: () => new Promise(resolve => { complete = resolve; }) }) } });
  const pending = f.api.home("progressive", page => { partial = page; });
  await tick();
  assert.ok(partial);
  complete({ sections: [] }); await pending;
});

test("search requests only its selected category, preserving album server order and IDs", async () => {
  const nodes = { MusicShelf: class {}, MusicResponsiveListItem: class {} };
  const calls = [];
  const items = [{ item_type: "album", id: "MPREsecond", title: "Second", thumbnails: [] }, { item_type: "album", id: "MPREfirst", title: "First", thumbnails: [] }, { item_type: "song", id: "abcdefghijk", title: "Wrong type" }];
  const page = { contents: [{ is: type => type === nodes.MusicShelf, contents: { as: () => items } }] };
  const f = fixture({ nodes, music: { search: async (q, options) => { calls.push(options.type); return page; } } });
  const result = await f.api.search("release", "albums", "albums");
  assert.equal(calls.join(), "album");
  assert.equal(result.albums.map(item => item.id).join(), "MPREsecond,MPREfirst");
  assert.equal(result.albums[0].kind, "album");
  assert.equal(result.songs.length, 0);
});

test("search surfaces a selected-category failure while preserving other successful categories", async () => {
  const f = fixture({ music: { search: async (_, { type }) => {
    if (type === "song") throw new Error("song request failed");
    return { contents: [] };
  } } });
  await assert.rejects(f.api.search("track", "songs", "failed-search"), /song request failed/);
  const result = await f.api.search("track", "all", "partial-search");
  assert.equal(result.songs.length, 0); assert.equal(result.albums.length, 0);
});

