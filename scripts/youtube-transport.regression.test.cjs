const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ info, fetchStatus = () => 200, contentType = "audio/mp4", music = {}, nodes = {}, actions = {}, parser = {}, lazyPlayer = false, ciphered = false, apiText = "{}", responseClass = Response, streamFetchOverride, timerScale = 1 } = {}) {
  const clients = [], requests = [];
  const playerLoads = [], sessionOptions = [], cancelledBodies = [];
  const format = { has_audio: true, has_video: false, mime_type: "audio/mp4", bitrate: 128000, approx_duration_ms: 188125,
    url: ciphered ? undefined : "https://rr1.googlevideo.com/videoplayback?expire=2000&n=original%2Bvalue",
    signature_cipher: ciphered ? "cipher" : undefined,
    decipher: async () => "https://rr1.googlevideo.com/videoplayback?expire=2000" };
  const yt = { music, actions, session: { player: lazyPlayer ? undefined : {} }, getBasicInfo: info || (async (_, { client }) => {
    clients.push(client); return { cpn: "playback-nonce", playability_status: { status: "OK" },
      streaming_data: { adaptive_formats: [format] } };
  }) };
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
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout: (callback, ms) => setTimeout(callback, ms * timerScale), clearTimeout, URL, AbortController, Response: responseClass,
    Date: { now: () => 1000000 }, globalThis: { crypto: { randomUUID: () => "nonce" },
      fetch: async (url, options) => {
        requests.push({ url, options }); const status = fetchStatus(options);
        return { ok: status >= 200 && status < 300, status };
      } }, require: name => {
      if (name === "./runtime") return {};
      if (name === "./YouTubeVideoFormats") return require("./helpers/youtube-video-fixture.cjs");
      if (name === "expo/fetch") return { fetch: streamFetchOverride ? (url, options) => streamFetchOverride(url, options, fetchStream) : fetchStream };
      if (name === "./YouTubeArtists") return require("./helpers/youtube-artists-fixture.cjs");
      if (name === "./YouTubeArtwork") return require("./helpers/youtube-artwork-fixture.cjs");
      if (name === "jintr") return { Jinter: class {} };
      if (name === "youtubei.js/react-native") return {
        Constants: constants, Platform: { shim: {} }, YTNodes: nodes, Parser: parser,
        Player: { create: async () => { playerLoads.push(true); return {}; } },
        Innertube: { create: async options => { sessionOptions.push(options); return yt; } },
      };
      throw new Error(name);
    } });
  return { api: module.exports.sharedYouTubeTransport, clients, requests, playerLoads, sessionOptions, cancelledBodies };
}

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
test("403 client is discarded and the exact video's next YouTube client is validated", async () => {
  const f = fixture({ fetchStatus: options => options.headers["User-Agent"] === "VISIONOS" ? 403 : 200 });
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(stream.videoId, "abcdefghijk");
  assert.equal(stream.clientProfile, "ANDROID_VR");
  assert.equal(f.clients.join(","), "VISIONOS,ANDROID_VR");
  assert.deepEqual(f.cancelledBodies, [403, 200]);
});

test("a rejected AAC format tries the next same-video format before another client", async () => {
  const formats = [256000, 128000].map(bitrate => ({ has_audio: true, has_video: false,
    mime_type: "audio/mp4", bitrate, url: `https://rr1.googlevideo.com/videoplayback?expire=2000&bitrate=${bitrate}` }));
  const f = fixture({ info: async () => ({ playability_status: { status: "OK" }, streaming_data: { adaptive_formats: formats } }),
    fetchStatus: (_, url) => url.includes("bitrate=256000") ? 403 : 200 });
  const stream = await f.api.resolveStream("abcdefghijk", "high", "stream");
  assert.equal(stream.bitrate, 128000);
  assert.equal(stream.videoId, "abcdefghijk");
  assert.equal(stream.clientProfile, "VISIONOS");
  assert.deepEqual(f.cancelledBodies, [403, 200]);
});

test("access-rejected session refreshes once and validates the same video", async () => {
  let attempts = 0;
  const f = fixture({ fetchStatus: () => ++attempts <= 4 ? 403 : 200 });
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(f.sessionOptions.length, 2);
  assert.equal(stream.videoId, "abcdefghijk");
  assert.equal(stream.clientProfile, "VISIONOS");
  assert.equal(attempts, 5);
});

test("persistent access rejection stays bounded and leaves no retry loop", async () => {
  const f = fixture({ fetchStatus: () => 403 });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "stream"), /Audio GET HTTP 403/);
  assert.equal(f.sessionOptions.length, 2);
  assert.equal(f.requests.length, 6);
});

test("hung media validation aborts and lets the next client resolve within the request budget", async () => {
  let aborted = false;
  const f = fixture({ timerScale: 0.001, streamFetchOverride: (url, options, fetchStream) => {
    if (options.headers["User-Agent"] !== "VISIONOS") return fetchStream(url, options);
    return new Promise((_, reject) => options.signal.addEventListener("abort", () => {
      aborted = true; reject(new Error("Audio request timed out"));
    }, { once: true }));
  } });
  const stream = await f.api.resolveStream("abcdefghijk", "medium", "stream");
  assert.equal(aborted, true);
  assert.equal(stream.clientProfile, "ANDROID_VR");
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
test("upstream login restriction remains an explicit YouTube failure", async () => {
  const f = fixture({ info: async () => ({ playability_status: { status: "LOGIN_REQUIRED",
    reason: "Sign in to confirm you are not a bot" } }) });
  await assert.rejects(f.api.resolveStream("abcdefghijk", "medium", "stream"), /Sign in/);
  assert.equal(f.requests.length, 0);
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

test("visual resolution uses H264 within the chosen ceiling without changing audio resolution", async () => {
  const audio = {has_audio:true,has_video:false,mime_type:'audio/mp4',bitrate:128000,url:'https://rr1.googlevideo.com/videoplayback?expire=2000'};
  const videos=[360,480,720,1080].map(height=>({has_audio:false,has_video:true,height,mime_type:'video/mp4; codecs="avc1.64001f"',bitrate:height*1000,url:'https://rr1.googlevideo.com/videoplayback?expire=2000&height='+height}));
  const f=fixture({contentType:'video/mp4',info:async()=>({playability_status:{status:'OK'},streaming_data:{adaptive_formats:[audio,...videos]}})});
  for(const [quality,height] of [['low',360],['medium',480],['auto',720],['high',1080]]) {
    const result=await f.api.resolveVideoStream('abcdefghijk',quality,'visual-'+quality);
    assert.equal(result.height,height);assert.equal(result.codec,'h264');
  }
});
