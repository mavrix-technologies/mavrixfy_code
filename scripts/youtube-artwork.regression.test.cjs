const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const art = require("./helpers/youtube-artwork-fixture.cjs");
test("thumbnail selection chooses actual largest dimensions in either order", () => {
  const input = [{ url: "large", width: 1200, height: 1200 }, { url: "tiny", width: 60, height: 60 }];
  assert.equal(art.bestYouTubeThumbnail(input), "large");
  assert.equal(art.bestYouTubeThumbnail([...input].reverse()), "large");
  assert.equal(input[0].url, "large");
});
test("Google artwork sizing preserves crop flags and query strings", () => {
  assert.equal(art.youTubeArtworkUrl("https://lh3.googleusercontent.com/art=w60-h60-l90-rj?token=x", 1200),
    "https://lh3.googleusercontent.com/art=w1200-h1200-l90-rj?token=x");
  assert.equal(art.youTubeArtworkUrl("//yt3.ggpht.com/art=s60-c-k", 512), "https://yt3.ggpht.com/art=s512-c-k");
  const unrelated = "https://lh3.googleusercontent.com/art?token=s60";
  assert.equal(art.youTubeArtworkUrl(unrelated), unrelated);
  assert.equal(art.youTubeArtworkUrl("https://elsewhere.com/art=s60"), "https://elsewhere.com/art=s60");
});
test("video thumbnails preserve server cropping and try higher resolution fallbacks first", () => {
  const url = "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg?sqp=resize-token";
  assert.equal(art.youTubeDisplayArtworkUrl(url, 1200), url);
  assert.equal(art.youTubeDisplayArtworkUrl(url, 192), url);
  const base = "https://i.ytimg.com/vi/abcdefghijk/";
  assert.deepEqual(Array.from(art.artworkCandidates(url, 1200)), [url,
    base + "maxresdefault.jpg", base + "sddefault.jpg", base + "hqdefault.jpg", base + "mqdefault.jpg"]);
  assert.equal(art.youTubeArtworkUrl(url), url);
});

test("song artwork prefers a square cover without changing generic playlist ranking", () => {
  const input = [{ url: "video", width: 1280, height: 720 }, { url: "cover", width: 544, height: 544 },
    { url: "tiny", width: 60, height: 60 }];
  assert.equal(art.bestYouTubeSongThumbnail(input), "cover");
  assert.equal(art.bestYouTubeSongThumbnail([...input].reverse()), "cover");
  assert.equal(art.bestYouTubeThumbnail(input), "video");
  assert.equal(art.bestYouTubeSongThumbnail([input[0]]), "video");
  assert.equal(art.youTubeDisplayArtworkUrl("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", 96),
    "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
});
test("dense screens get enough artwork pixels without full masters in each row", () => {
  assert.equal(art.artworkPixelSize(48, 3), 192);
  assert.equal(art.artworkPixelSize(148, 3), 512);
  assert.equal(art.artworkPixelSize(400, 3), 1200);
  assert.equal(art.artworkPixelSize(1000, 4), 1200);
});
test("playlist image ranking uses consistent dimensions for labeled and URL sizes", () => {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/musicData.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => name.includes("arrayUtils") ? {
    sortedCopy: (items, compare) => [...items].sort(compare),
  } : name.includes("YouTubeArtwork") ? art : {} });
  assert.equal(module.exports.getBestImageUrl([{ quality: "500x500", url: "https://img/master.jpg" },
    { quality: "", url: "https://img/150x150.jpg" }]), "https://img/master.jpg");
});
function artworkFixture() {
  const slots = []; let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { memo: fn => fn,
    useMemo: (fn, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback: fn => fn,
    useLayoutEffect: (fn, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { slots[i] = { deps }; fn(); } },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; } };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/MusicArtwork.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, require: name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (_, props) => props };
    if (name === "react-native") return { View: "View", PixelRatio: { get: () => 3 } };
    if (name === "@expo/vector-icons/Ionicons") return "Icon";
    if (name === "expo-image") return { Image: "Image" };
    return art;
  } });
  return props => { cursor = 0; return module.exports.MusicArtwork(props); };
}

test("artwork fallback is bounded, detects placeholder masters and ignores old callbacks", () => {
  const render = artworkFixture();
  const props = { uri: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", size: 400 };
  const primary = render(props);
  primary.onLoad({ source: { width: 120, height: 90 } });
  const fallback = render(props);
  assert.match(fallback.source.uri, /sddefault/);
  fallback.onLoad({ source: { width: 120, height: 90 } });
  const high = render(props);
  assert.match(high.source.uri, /hqdefault/);
  high.onError({ error: "missing" });
  assert.match(render(props).source.uri, /mqdefault/);
  let errors = 0;
  render({ ...props, onError: () => errors++ }).onError({ error: "missing" });
  assert.equal(errors, 1);
  const next = render({ ...props, uri: "https://i.ytimg.com/vi/lmnopqrstuv/hqdefault.jpg" });
  primary.onError({ error: "late" });
  assert.equal(render({ ...props, uri: "https://i.ytimg.com/vi/lmnopqrstuv/hqdefault.jpg" }).source.uri, next.source.uri);
});

test("Saavn upgrades are host-specific and preserve signed, local, and other-provider artwork", () => {
  assert.equal(art.saavnArtworkUrl("http://c.saavncdn.com/123/song-50x50.jpg"), "https://c.saavncdn.com/123/song-500x500.jpg");
  assert.equal(art.saavnArtworkUrl("https://c.saavncdn.com/123/song-500x500.jpg", 128), "https://c.saavncdn.com/123/song-150x150.jpg");
  for (const url of ["https://other.example/song-150x150.jpg", "file:///covers/song-50x50.jpg", "https://saavncdn.com.evil.example/song-50x50.jpg",
    "https://c.saavncdn.com/123/song-150x150.jpg?signature=keep-50x50", "content://media/song-50x50.jpg"]) {
    assert.equal(art.saavnArtworkUrl(url), url);
  }
  assert.deepEqual(Array.from(art.artworkCandidates("https://c.saavncdn.com/123/song-50x50.jpg", 960)), [
    "https://c.saavncdn.com/123/song-500x500.jpg", "https://c.saavncdn.com/123/song-150x150.jpg", "https://c.saavncdn.com/123/song-50x50.jpg",
  ]);
});

test("Google sizing preserves aspect ratio, bounds memory, and retains the provider original as fallback", () => {
  assert.equal(art.youTubeArtworkUrl("https://lh3.googleusercontent.com/wide=w600-h300-c-rj?signature=keep", 512),
    "https://lh3.googleusercontent.com/wide=w1024-h512-c-rj?signature=keep");
  assert.equal(art.youTubeArtworkUrl("https://lh3.googleusercontent.com/wide=w600-h300-c-rj", 1200),
    "https://lh3.googleusercontent.com/wide=w2048-h1024-c-rj");
  const original = "https://lh3.googleusercontent.com/cover=w60-h60-c-rj";
  const sources = Array.from(art.artworkCandidates(original, 960));
  assert.equal(sources[0], "https://lh3.googleusercontent.com/cover=w960-h960-c-rj");
  assert.equal(sources.at(-1), original);
  assert.equal(sources.length, new Set(sources).size);
  assert.deepEqual(Array.from(art.artworkCandidates("https://other.example/cover.jpg?token=keep", 960)), ["https://other.example/cover.jpg?token=keep"]);
});

test("exhausted artwork renders an explicit placeholder, reports once, and retries when returning to a song", () => {
  const render = artworkFixture();
  let errors = 0;
  const a = { uri: "https://other.example/a.jpg", onError: () => errors++ };
  const first = render(a);
  first.onError({ error: "unavailable" }); first.onError({ error: "duplicate native callback" });
  assert.equal(errors, 1);
  assert.equal(render(a).accessibilityLabel, "Artwork unavailable");
  const b = render({ uri: "https://other.example/b.jpg" });
  assert.equal(b.source.uri, "https://other.example/b.jpg");
  assert.equal(render(a).source.uri, a.uri, "old failure state cannot suppress a new visit to the same song");
});

test("artwork from a previous track cannot call the current load handler", () => {
  const render = artworkFixture(); let loads = 0;
  const old = render({ uri: "https://other.example/a.jpg", onLoad: () => loads++ });
  const next = render({ uri: "https://other.example/b.jpg", onLoad: () => loads++ });
  old.onLoad({ source: { width: 500, height: 500 } });
  assert.equal(loads, 0);
  next.onLoad({ source: { width: 500, height: 500 } });
  assert.equal(loads, 1);
  assert.notEqual(old.recyclingKey, next.recyclingKey);
});

test("late callbacks from the first visit cannot fail artwork after A to B to A playback", () => {
  const render = artworkFixture(); let errors = 0;
  const props = { uri: "https://other.example/a.jpg", onError: () => errors++ };
  const old = render(props);
  render({ uri: "https://other.example/b.jpg" });
  const revisited = render(props);
  old.onError({ error: "late first-visit failure" });
  assert.equal(errors, 0);
  assert.equal(render(props).source.uri, revisited.source.uri);
});

test("provider image objects retain dimensions and empty highest-quality URLs do not hide valid covers", () => {
  const module = { exports: {} };
  const arrays = { mapFilter: (list, map, filter = Boolean) => list.map(map).filter(filter) };
  const strings = { toTrimmedString: value => typeof value === "string" ? value.trim() : "" };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/data/providers/MusicCatalogNormalizers.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => name.includes("arrayUtils") ? arrays : name.includes("stringUtils") ? strings : {} });
  const { normalizeImageList } = module.exports;
  assert.equal(normalizeImageList({ url: "https://other.example/original.jpg", width: 1000, height: 1000 })[0].quality, "1000x1000");
  assert.equal(normalizeImageList([{ url: "small", width: 50, height: 50 }, { link: "large", width: 500, height: 500 }])[1].quality, "500x500");
  const music = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/musicData.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: music, exports: music.exports, require: name => name.includes("YouTubeArtwork") ? art : {} });
  assert.equal(music.exports.getBestImageUrl([{ quality: "1200x1200", url: "" }, { quality: "500x500", url: "https://other.example/song-150x150.jpg" }]),
    "https://other.example/song-150x150.jpg");
});
