const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const tasks = []; const removed = []; const timers = new Map(); let timerId = 0; let evicted = false;
  const storage = {
    cacheDirectory: "file:///cache/",
    deleteAsync: async uri => { removed.push(uri); }, makeDirectoryAsync: async () => {},
    moveAsync: async ({ from, to }) => { const task = tasks.find(task => task.uri === from); task.uri = to; },
    getInfoAsync: async uri => ({ exists: !evicted, isDirectory: false, size: tasks.find(task => task.uri === uri)?.size || 128 }),
    createDownloadResumable: (url, uri, options, progress) => {
      let resolve; const promise = new Promise(done => { resolve = done; });
      const task = { url, uri, options, progress, size: 128, cancelled: false,
        downloadAsync: () => promise,
        cancelAsync: async () => { task.cancelled = true; resolve(undefined); },
        complete: (status = 200, headers = { "Content-Type": "audio/mp4" }) => resolve({ status, headers, uri }),
      }; tasks.push(task); return task;
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/services/audio/nextTrackPreload.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => { assert.equal(name, "expo-file-system/legacy"); return storage; },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return { ...module.exports, tasks, removed, timers, evict: () => { evicted = true; } };
}

test("next-track audio is consumed only after its complete download and matching headers", async () => {
  const f = fixture(); const url = "https://media.example/next.m4a";
  const pending = f.prepareNextAudio(url, { Authorization: "test" }); await tick();
  assert.equal(await f.takePreparedAudio(url, { Authorization: "test" }), null);
  f.tasks[0].complete(200, { "Content-Length": "128", "Content-Type": "audio/mp4" }); await pending;
  assert.equal(await f.takePreparedAudio(url), null);
  assert.equal(await f.takePreparedAudio(url, { Authorization: "test" }), f.tasks[0].uri);
  assert.equal(await f.takePreparedAudio(url, { Authorization: "test" }), null);
  assert.equal(f.timers.size, 0);
});

test("replacing a queue preload cancels and removes the old partial file", async () => {
  const f = fixture(); const old = f.prepareNextAudio("https://media.example/old"); await tick();
  const next = f.prepareNextAudio("https://media.example/next"); await tick();
  assert.equal(f.tasks[0].cancelled, true);
  f.tasks[1].complete(); await Promise.all([old, next]);
  assert.equal(await f.takePreparedAudio("https://media.example/old"), null);
  assert.equal(await f.takePreparedAudio("https://media.example/next"), f.tasks[1].uri);
  assert.ok(f.removed.includes(f.tasks[0].uri));
});

test("preloads keep their declared media container instead of a generic audio extension", async () => {
  for (const [mime, extension] of [["audio/mp4; codecs=mp4a.40.2", "m4a"], ["audio/mpeg", "mp3"], ["audio/aac", "aac"]]) {
    const f = fixture(), url = "https://media.example/videoplayback";
    const pending = f.prepareNextAudio(url); await tick();
    f.tasks[0].complete(200, { "Content-Type": mime }); await pending;
    assert.ok((await f.takePreparedAudio(url)).endsWith(`.${extension}`));
  }
});

test("unknown container responses and files truncated after prefetch are not consumed", async () => {
  const f = fixture(), url = "https://media.example/videoplayback";
  let pending = f.prepareNextAudio(url); await tick();
  f.tasks[0].complete(200, { "Content-Type": "application/octet-stream" }); await pending;
  assert.equal(await f.takePreparedAudio(url), null);
  pending = f.prepareNextAudio(url); await tick();
  f.tasks[1].complete(); await pending;
  f.tasks[1].size = 64;
  assert.equal(await f.takePreparedAudio(url), null);
});

test("preload is bounded by file size and time; partial HTTP responses are rejected", async () => {
  for (const reason of ["size", "timeout", "partial", "truncated", "page"]) {
    const f = fixture(); const url = `https://media.example/${reason}`;
    const pending = f.prepareNextAudio(url); await tick(); const task = f.tasks[0];
    if (reason === "size") task.progress({ totalBytesWritten: 1, totalBytesExpectedToWrite: 21 * 1024 * 1024 });
    else if (reason === "timeout") [...f.timers.values()][0]();
    else task.complete(reason === "partial" ? 206 : 200,
      reason === "truncated" ? { "Content-Length": "256" } : reason === "page" ? { "Content-Type": "text/html" } : {});
    await pending; assert.equal(await f.takePreparedAudio(url), null); assert.ok(f.removed.includes(task.uri));
  }
});

test("preloading the next file retains the active file until playback releases its lease", async () => {
  const f = fixture(); const first = f.prepareNextAudio("https://media.example/first"); await tick();
  f.tasks[0].complete(); await first; const active = await f.takePreparedAudio("https://media.example/first");
  const next = f.prepareNextAudio("https://media.example/next"); await tick();
  f.tasks[1].complete(); await next;
  assert.ok(!f.removed.includes(active));
  f.releasePreparedAudio(); await tick(); assert.ok(f.removed.includes(active));
  f.clearPreparedAudio(); await tick(); assert.ok(f.removed.includes(f.tasks[1].uri));
});

test("preload skips local files and HLS playlists and deduplicates identical work", async () => {
  const f = fixture(); await f.prepareNextAudio("file:///offline.mp3");
  await f.prepareNextAudio("https://media.example/live.m3u8"); assert.equal(f.tasks.length, 0);
  const pending = f.prepareNextAudio("https://media.example/next"); await tick();
  await f.prepareNextAudio("https://media.example/next"); assert.equal(f.tasks.length, 1);
  f.tasks[0].complete(); await pending;
});

test("OS cache eviction falls back to streaming, and a stale selection cannot consume a preload", async () => {
  const f = fixture(); const url = "https://media.example/next";
  const pending = f.prepareNextAudio(url); await tick(); f.tasks[0].complete(); await pending;
  assert.equal(await f.takePreparedAudio(url, undefined, () => false), null);
  f.evict(); assert.equal(await f.takePreparedAudio(url), null);
  assert.ok(f.removed.includes(f.tasks[0].uri));
});
