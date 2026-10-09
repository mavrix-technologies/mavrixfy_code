const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadLyricsService(fetchImpl = async () => { throw new Error("Unexpected fetch"); }) {
  const module = { exports: {} };
  const storage = { getItem: async () => null, setItem: async () => {} };
  const dependencies = {
    "@react-native-async-storage/async-storage": storage,
    "@/utils/stringUtils": {
      unescapeHtml: value => String(value || "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"").replace(/&apos;|&#039;/g, "'"),
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync("src/services/lyricsService.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText + "\nmodule.exports.__parseTtml = parseTtml;";
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    fetch: fetchImpl,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
  });
  return module.exports;
}

test("TTML prefers a complete romanized layer and keeps its timings", () => {
  const service = loadLyricsService();
  const lines = service.__parseTtml(`<tt><body><div>
    <p begin="1s" end="2s"><span begin="1s" end="1.5s">नमस्ते</span><span ttm:role="x-roman" begin="1.5s" end="2s">Namaste</span></p>
    <p begin="3s" end="4s"><span begin="3s" end="3.5s">दुनिया</span><span ttm:role="x-roman" begin="3.5s" end="4s">Duniya</span></p>
  </div></body></tt>`);

  assert.deepEqual(Array.from(lines, line => line.text), ["Namaste", "Duniya"]);
  assert.equal(lines[0].words[0].start, 1.5);
});

test("TTML keeps original lyrics when romanized text is absent", () => {
  const service = loadLyricsService();
  const lines = service.__parseTtml(`<tt><body><div>
    <p begin="1s" end="2s"><span begin="1s" end="2s">नमस्ते दुनिया</span></p>
  </div></body></tt>`);
  assert.equal(lines[0].text, "नमस्ते दुनिया");
});

test("preview and fullscreen share one exact-match lookup across different song IDs", async () => {
  let requests = 0;
  const service = loadLyricsService(async () => {
    requests++;
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => [{
        trackName: "Song A", artistName: "Artist One", albumName: "Album", duration: 210,
        syncedLyrics: "[00:01.00]First line\n[00:03.00]Second line", plainLyrics: null,
      }],
    };
  });
  const base = { title: "Song A", artist: "Artist One", album: "Album", duration: 210 };
  const [preview, fullscreen] = await Promise.all([
    service.getSongLyrics({ ...base, id: "youtube_a" }),
    service.getSongLyrics({ ...base, id: "youtube_b" }),
  ]);

  assert.equal(requests, 1);
  assert.equal(preview, fullscreen);
  assert.equal(preview.synced, true);
  assert.deepEqual(Array.from(preview.lines, line => line.time), [1, 3]);
});

test("wrong-artist search results are rejected and a no-match result is briefly cached", async () => {
  let requests = 0;
  const service = loadLyricsService(async url => {
    requests++;
    if (String(url).includes("lrclib.net")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => [{ trackName: "Song A", artistName: "Different Artist", duration: 210, syncedLyrics: "[00:01]Wrong" }],
      };
    }
    return { ok: true, json: async () => ({ results: [] }) };
  });
  const song = { title: "Song A", artist: "Artist One", duration: 210 };

  const first = await service.getSongLyrics(song);
  const second = await service.getSongLyrics(song);
  assert.equal(first.provider, "none");
  assert.equal(second.provider, "none");
  assert.equal(requests, 2);
});
