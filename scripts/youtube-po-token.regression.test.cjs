const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const tick = () => new Promise(resolve => setImmediate(resolve));
const token = "a".repeat(160);
function load(path, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module, exports: module.exports, ...globals });
  return module.exports;
}
function fixture() {
  let now = 1000000, nextTimer = 0;
  const timers = new Map();
  const { YouTubePoTokenManager } = load("src/services/youtube/YouTubePoToken.ts", {
    Date: { now: () => now }, setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const manager = new YouTubePoTokenManager();
  const commands = [];
  let challenges = 0;
  const challenge = async () => { challenges++; return { program: "program", globalName: "VM" }; };
  const attach = (respond = true) => manager.attach(command => {
    commands.push(command);
    if (respond) manager.receive({ id: command.id, ok: true, ...(command.operation === "bootstrap" ? { expiresAt: now + 600000 } : { token }) });
  });
  const advance = ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } };
  return { manager, commands, challenge, attach, advance, timers, challenges: () => challenges };
}

test("cold engine is lazy; simultaneous audio/video share bootstrap and same-video mint", async () => {
  const f = fixture();
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.challenges(), 0);
  const first = f.manager.mint("abcdefghijk", "visitor", f.challenge);
  const second = f.manager.mint("abcdefghijk", "visitor", f.challenge);
  assert.equal(first, second);
  await tick();
  assert.ok(f.manager.snapshot() >= 0);
  f.attach();
  assert.equal(await first, token);
  assert.equal(f.challenges(), 1);
  assert.deepEqual(f.commands.map(item => item.operation), ["bootstrap", "mint"]);
  assert.equal(f.timers.size, 0);
});

test("different videos reuse the live minter but receive separately bound proofs", async () => {
  const f = fixture(); f.attach();
  // First visitor selection resets the engine; attach after its request starts.
  const first = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick(); f.attach(); await first;
  assert.equal(await f.manager.mint("12345678901", "visitor", f.challenge), token);
  assert.equal(await f.manager.mint("abcdefghijk", "visitor", f.challenge), token);
  assert.equal(f.challenges(), 1);
  assert.deepEqual(f.commands.filter(item => item.operation === "mint").map(item => item.videoId), ["abcdefghijk", "12345678901"]);
});

test("real BgUtils Base64 padding is accepted and normalized", async () => {
  const f = fixture();
  const pending = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick();
  f.manager.attach(command => f.manager.receive({ id: command.id, ok: true,
    ...(command.operation === "bootstrap" ? { expiresAt: 1600000 } : { token: token + "==" }) }));
  assert.equal(await pending, token);
  assert.equal(f.manager.failureReason, "none");
});

test("expired proofs bootstrap again instead of reusing stale tokens", async () => {
  const f = fixture(); const first = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick(); f.attach(); await first;
  f.advance(600001);
  assert.equal(await f.manager.mint("abcdefghijk", "visitor", f.challenge), token);
  assert.equal(f.challenges(), 2);
  assert.equal(f.commands.filter(item => item.operation === "bootstrap").length, 2);
});

test("visitor change closes the old engine; late replies cannot populate the new cache", async () => {
  const f = fixture(); const old = f.manager.mint("abcdefghijk", "old", f.challenge); await tick(); f.attach(false);
  const oldCommand = f.commands[0];
  const fresh = f.manager.mint("abcdefghijk", "new", f.challenge); await tick();
  f.manager.receive({ id: oldCommand.id, ok: true, expiresAt: 1600000 });
  f.attach();
  assert.equal(await old, null);
  assert.equal(await fresh, token);
  assert.equal(f.challenges(), 2);
});

test("network change discards proofs and releases in-flight work", async () => {
  const f = fixture(); const pending = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick(); f.attach(false);
  f.manager.networkChanged();
  assert.equal(await pending, null);
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.timers.size, 0);
  const fresh = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick(); f.attach();
  assert.equal(await fresh, token);
});

test("three failed bootstraps cool down once; network recovery enables a bounded fresh attempt", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    const pending = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick();
    f.manager.attach(command => f.manager.receive({ id: command.id, ok: false, stage: "integrity" }));
    assert.equal(await pending, null);
  }
  assert.equal(f.manager.failureReason, "Attestation integrity failed");
  assert.equal(await f.manager.mint("abcdefghijk", "visitor", f.challenge), null);
  assert.equal(f.challenges(), 3);
  f.manager.networkChanged();
  const fresh = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick(); f.attach();
  assert.equal(await fresh, token);
});

test("a missing host times out, unmounts, and retains no orphaned timers", async () => {
  const f = fixture(); const pending = f.manager.mint("abcdefghijk", "visitor", f.challenge); await tick();
  f.advance(10001);
  assert.equal(await pending, null);
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.timers.size, 0);
});

test("HTTP bridge permits actual interpreter and integrity paths, rejecting arbitrary targets", () => {
  const { attestationHttpAllowed: allowed } = load("src/services/youtube/YouTubePoTokenHttp.ts", { URL });
  assert.equal(allowed("https://www.google.com/js/th/program_123.js", "GET"), true);
  assert.equal(allowed("https://www.youtube.com/api/jnn/v1/GenerateIT", "POST"), true);
  for (const url of ["http://www.google.com/js/th/program.js", "https://www.google.com.evil.test/js/th/program.js",
    "https://user:pass@www.google.com/js/th/program.js", "https://www.google.com/search?q=secret", "https://127.0.0.1/private",
    "https://www.youtube.com/api/jnn/v1/GenerateIT?redirect=evil", "https://www.google.com/js/th/program.js?redirect=evil"])
    assert.equal(allowed(url, "GET") || allowed(url, "POST"), false, url);
});

test("committed WebView bundle executes the real BgUtils snapshot/integrity/mint flow", async () => {
  const { youtubePoTokenHtml } = load("src/services/youtube/YouTubePoTokenHtml.ts");
  const script = youtubePoTokenHtml.match(/<script>([\s\S]*)<\/script>/)[1];
  const replies = [], bindings = [], requests = [], timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({ Date, URL, TextEncoder, TextDecoder, atob, btoa,
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
    bound: id => bindings.push(id),
  });
  context.window = context;
  context.ReactNativeWebView = { postMessage: json => {
    const message = JSON.parse(json);
    if (message.type !== "http") { replies.push(message); return; }
    requests.push(message);
    context.receiveAttestationHttp({ id: message.id, status: 200,
      body: JSON.stringify([btoa("integrity"), 3600, 300, ""]) });
  } };
  context.document = { createElement: () => ({ remove() {} }), head: {
    appendChild: element => vm.runInContext(element.textContent, context),
  } };
  vm.runInContext(script, context);
  const interpreter = `window.fakeVM = { a: function(program, ready) {
    ready(function(callback, args) {
      args[2].push(async function() { return async function(binding) {
        bound(new TextDecoder().decode(binding)); return new Uint8Array(121).fill(9);
      }; }); callback('snapshot');
    }, function() {}); return [function() {}];
  } };`;
  await context.runAttestationCommand({ id: 1, operation: "bootstrap", challenge: {
    program: "real-library-fixture", globalName: "fakeVM",
    interpreterJavascript: { privateDoNotAccessOrElseSafeScriptWrappedValue: interpreter },
  } });
  assert.equal(replies.find(item => item.id === 1)?.ok, true);
  assert.ok(replies.find(item => item.id === 1).expiresAt > Date.now());
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://www.youtube.com/api/jnn/v1/GenerateIT");
  await context.runAttestationCommand({ id: 2, operation: "mint", videoId: "abcdefghijk" });
  await context.runAttestationCommand({ id: 3, operation: "mint", videoId: "12345678901" });
  assert.deepEqual(bindings, ["abcdefghijk", "12345678901"]);
  const reply = replies.find(item => item.id === 2);
  assert.equal(reply.ok, true);
  assert.match(reply.token, /^[\w-]+={0,2}$/);
  assert.equal(requests.length, 1);
});
