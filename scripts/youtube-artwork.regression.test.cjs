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
test("video thumbnails preserve server cropping and use an unpadded fallback", () => {
  const url = "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg?sqp=resize-token";
  assert.equal(art.youTubeDisplayArtworkUrl(url, 1200), url);
  assert.equal(art.youTubeDisplayArtworkUrl(url, 192), url);
  assert.equal(art.youTubeArtworkFallbackUrl(url), "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
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
  } : {} });
  assert.equal(module.exports.getBestImageUrl([{ quality: "500x500", url: "https://img/master.jpg" },
    { quality: "", url: "https://img/150x150.jpg" }]), "https://img/master.jpg");
});
test("artwork fallback is bounded, detects placeholder masters and ignores old callbacks", () => {
  const slots = []; let cursor = 0;
  const react = { memo: fn => fn, useMemo: fn => fn(), useCallback: fn => fn,
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; } };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/MusicArtwork.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, require: name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (_, props) => props };
    if (name === "react-native") return { PixelRatio: { get: () => 3 } };
    if (name === "expo-image") return { Image: "Image" };
    return art;
  } });
  const render = props => { cursor = 0; return module.exports.MusicArtwork(props); };
  const props = { uri: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", size: 400 };
  const primary = render(props);
  primary.onLoad({ source: { width: 120, height: 90 } });
  const fallback = render(props);
  assert.match(fallback.source.uri, /mqdefault/);
  let errors = 0;
  render({ ...props, onError: () => errors++ }).onError({ error: "missing" });
  assert.equal(errors, 1);
  const next = render({ ...props, uri: "https://i.ytimg.com/vi/lmnopqrstuv/hqdefault.jpg" });
  primary.onError({ error: "late" });
  assert.equal(render({ ...props, uri: "https://i.ytimg.com/vi/lmnopqrstuv/hqdefault.jpg" }).source.uri, next.source.uri);
});
