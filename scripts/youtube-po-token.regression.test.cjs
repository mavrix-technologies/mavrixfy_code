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


  const attach = (respond = true) => manager.attach(command => {
    commands.push(command);
    if (respond) manager.receive({ id: command.id, ok: true, ...(command.operation === "bootstrap" ? { expiresAt: now + 600000 } : { token }) });
  });
  const advance = ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } };
  return { manager, commands, attach, advance, timers, challenges: () => commands.filter(command => command.operation === "bootstrap").length };
}

test("cold engine is lazy; simultaneous audio/video share bootstrap and same-video mint", async () => {
  const f = fixture();
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.challenges(), 0);
  const first = f.manager.mint("abcdefghijk", "visitor");
  const second = f.manager.mint("abcdefghijk", "visitor");
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
  const first = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach(); await first;
  assert.equal(await f.manager.mint("12345678901", "visitor"), token);
  assert.equal(await f.manager.mint("abcdefghijk", "visitor"), token);
  assert.equal(f.challenges(), 1);
  assert.deepEqual(f.commands.filter(item => item.operation === "mint").map(item => item.videoId), ["abcdefghijk", "12345678901"]);
});

test("real BgUtils Base64 padding is accepted and normalized", async () => {
  const f = fixture();
  const pending = f.manager.mint("abcdefghijk", "visitor"); await tick();
  f.manager.attach(command => f.manager.receive({ id: command.id, ok: true,
    ...(command.operation === "bootstrap" ? { expiresAt: 1600000 } : { token: token + "==" }) }));
  assert.equal(await pending, token);
  assert.equal(f.manager.failureReason, "none");
});

test("expired proofs bootstrap again instead of reusing stale tokens", async () => {
  const f = fixture(); const first = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach(); await first;
  f.advance(600001);
  const renewed = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach();
  assert.equal(await renewed, token);
  assert.equal(f.challenges(), 2);
  assert.equal(f.commands.filter(item => item.operation === "bootstrap").length, 2);
});

test("visitor change closes the old engine; late replies cannot populate the new cache", async () => {
  const f = fixture(); const old = f.manager.mint("abcdefghijk", "old"); await tick(); f.attach(false);
  const oldCommand = f.commands[0];
  const fresh = f.manager.mint("abcdefghijk", "new"); await tick();
  f.manager.receive({ id: oldCommand.id, ok: true, expiresAt: 1600000 });
  f.attach();
  assert.equal(await old, null);
  assert.equal(await fresh, token);
  assert.equal(f.challenges(), 2);
});

test("network change discards proofs and releases in-flight work", async () => {
  const f = fixture(); const pending = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach(false);
  f.manager.networkChanged();
  assert.equal(await pending, null);
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.timers.size, 0);
  const fresh = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach();
  assert.equal(await fresh, token);
});

test("three failed bootstraps cool down once; network recovery enables a bounded fresh attempt", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    const pending = f.manager.mint("abcdefghijk", "visitor"); await tick();
    f.manager.attach(command => {
      f.commands.push(command);
      f.manager.receive({ id: command.id, ok: false, stage: "integrity" });
    });
    assert.equal(await pending, null);
  }
  assert.equal(f.manager.failureReason, "Attestation integrity failed");
  assert.equal(await f.manager.mint("abcdefghijk", "visitor"), null);
  assert.equal(f.challenges(), 3);
  f.manager.networkChanged();
  const fresh = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach();
  assert.equal(await fresh, token);
});

test("a missing host times out, unmounts, and retains no orphaned timers", async () => {
  const f = fixture(); const pending = f.manager.mint("abcdefghijk", "visitor"); await tick();
  f.advance(8001);
  assert.equal(await pending, null);
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.timers.size, 0);
});

async function warm(f) {
  const pending = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach();
  assert.equal(await pending, token);
}
function renderNewEngines(f, respond = true) {
  let mounted = f.manager.snapshot();
  return f.manager.subscribe(() => {
    const generation = f.manager.snapshot();
    if (generation >= 0 && generation !== mounted) {
      mounted = generation;
      f.attach(respond);
    }
  });
}

test("a failed warm minter recreates the engine once and shares same-video recovery", async () => {
  const f = fixture(); await warm(f);
  renderNewEngines(f);
  f.manager.attach(command => {
    f.commands.push(command);
    f.manager.receive({ id: command.id, ok: false, stage: "mint" });
  });
  const first = f.manager.mint("12345678901", "visitor");
  assert.equal(first, f.manager.mint("12345678901", "visitor"));
  assert.equal(await first, token);
  assert.equal(f.challenges(), 2);
  assert.equal(f.commands.filter(command => command.videoId === "12345678901").length, 2);
  assert.equal(f.timers.size, 0);
  assert.equal(f.manager.failureReason, "none");
});

test("renderer death coalesces recovery across different videos and ignores stale callbacks", async () => {
  const f = fixture(); await warm(f);
  const oldGeneration = f.manager.snapshot();
  f.attach(false);
  renderNewEngines(f);
  const first = f.manager.mint("12345678901", "visitor");
  const second = f.manager.mint("lmnopqrstuv", "visitor");
  f.manager.engineFailed(oldGeneration);
  assert.equal(await first, token);
  assert.equal(await second, token);
  assert.equal(f.challenges(), 2);
  const recoveredGeneration = f.manager.snapshot();
  f.manager.engineFailed(oldGeneration);
  let staleSends = 0;
  f.manager.attach(() => staleSends++, oldGeneration);
  assert.equal(f.manager.snapshot(), recoveredGeneration);
  assert.equal(staleSends, 0);
  assert.equal(f.timers.size, 0);
});

test("warm mint timeout and replacement share one eight-second budget", async () => {
  const f = fixture(); await warm(f);
  f.attach(false);
  renderNewEngines(f, false);
  const pending = f.manager.mint("12345678901", "visitor");
  f.advance(3001); await tick();
  assert.equal(f.challenges(), 2);
  f.advance(5000);
  assert.equal(await pending, null);
  assert.equal(f.challenges(), 2);
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.timers.size, 0);
});

test("network reset cancels a recovering engine instead of reviving the old context", async () => {
  const f = fixture(); await warm(f);
  f.attach(false);
  renderNewEngines(f, false);
  const pending = f.manager.mint("12345678901", "visitor");
  f.manager.engineFailed(); await tick();
  assert.equal(f.challenges(), 2);
  f.manager.networkChanged();
  assert.equal(await pending, null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.manager.snapshot(), -1);
});

test("an engine attached during notification receives each command exactly once", async () => {
  const f = fixture(); renderNewEngines(f);
  assert.equal(await f.manager.mint("abcdefghijk", "visitor"), token);
  assert.deepEqual(f.commands.map(command => command.operation), ["bootstrap", "mint"]);
});

test("a replacement minter failure stops without a third engine or orphaned requests", async () => {
  const f = fixture(); await warm(f);
  let mounted = f.manager.snapshot();
  const failMint = command => {
    f.commands.push(command);
    f.manager.receive({ id: command.id, ok: command.operation === "bootstrap",
      expiresAt: 1600000, stage: "mint" });
  };
  f.manager.subscribe(() => {
    const generation = f.manager.snapshot();
    if (generation >= 0 && generation !== mounted) { mounted = generation; f.manager.attach(failMint, generation); }
  });
  f.manager.attach(failMint);
  assert.equal(await f.manager.mint("12345678901", "visitor"), null);
  assert.equal(f.challenges(), 2);
  assert.equal(f.manager.snapshot(), -1);
  assert.equal(f.timers.size, 0);
});

test("repeated cold renderer crashes cool down without silently retrying new engines", async () => {
  const f = fixture();
  for (let attempt = 0; attempt < 3; attempt++) {
    const pending = f.manager.mint("abcdefghijk", "visitor"); await tick(); f.attach(false);
    f.manager.engineFailed();
    assert.equal(await pending, null);
  }
  assert.equal(f.manager.failureReason, "YouTube attestation renderer unavailable");
  assert.equal(await f.manager.mint("abcdefghijk", "visitor"), null);
  assert.equal(f.challenges(), 3);
  assert.equal(f.timers.size, 0);
});

test("HTTP bridge permits actual interpreter and integrity paths, rejecting arbitrary targets", () => {
  const { attestationHttpAllowed: allowed } = load("src/services/youtube/YouTubePoTokenHttp.ts", { URL });
  assert.equal(allowed("https://www.google.com/js/th/program_123.js", "GET"), true);
  assert.equal(allowed("https://www.youtube.com/", "GET"), true);
  assert.equal(allowed("https://www.youtube.com/", "POST"), false);
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
  const context = vm.createContext({ Date, URL, TextEncoder, TextDecoder, atob, btoa, navigator: { userAgent: "native-webview-UA" },
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
    bound: id => bindings.push(id),
  });
  context.window = context;
  context.ReactNativeWebView = { postMessage: json => {
    const message = JSON.parse(json);
    if (message.type !== "http") { replies.push(message); return; }
    requests.push(message);
    const body = message.url === "https://www.youtube.com/" ? pageFixture() :
      message.method === "GET" ? interpreter : JSON.stringify([btoa("integrity"), 3600, 300, ""]);
    context.receiveAttestationHttp({ id: message.id, status: 200, body });
  } };
  context.document = { createElement: () => ({ remove() {} }), head: {
    appendChild: element => vm.runInContext(element.textContent, context),
  } };
  vm.runInContext(script, context);
  const interpreter = `if (window.yt.config_.EVENT_ID !== 'page-event') throw new Error('Wrong page context');
  window.fakeVM = { a: function(program, ready) {
    ready(function(callback, args) {
      args[2].push(async function() { return async function(binding) {
        bound(new TextDecoder().decode(binding)); return new Uint8Array(121).fill(9);
      }; }); callback('snapshot');
    }, function() {}); return [function() {}];
  } };`;
  await context.runAttestationCommand({ id: 1, operation: "bootstrap" });
  assert.equal(replies.find(item => item.id === 1)?.ok, true);
  assert.ok(replies.find(item => item.id === 1).expiresAt > Date.now());
  assert.deepEqual(requests.map(request => request.url), ["https://www.youtube.com/",
    "https://www.google.com/js/th/program_123.js", "https://www.youtube.com/api/jnn/v1/GenerateIT"]);
  assert.ok(requests.every(request => request.headers["user-agent"] === "native-webview-UA"));
  await context.runAttestationCommand({ id: 2, operation: "mint", videoId: "abcdefghijk" });
  await context.runAttestationCommand({ id: 3, operation: "mint", videoId: "12345678901" });
  assert.deepEqual(bindings, ["abcdefghijk", "12345678901"]);
  const reply = replies.find(item => item.id === 2);
  assert.equal(reply.ok, true);
  assert.match(reply.token, /^[\w-]+={0,2}$/);
  assert.equal(requests.length, 3);
});

function pageFixture({ event = "page-event", program = "opaque }) }; ,] ' \\" } = {}) {
  const response = JSON.stringify({ bgChallenge: { program, globalName: "fakeVM",
    interpreterUrl: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: "//www.google.com/js/th/program_123.js" } } });
  // Match YouTube's single-quoted, hex-escaped embedded JSON and trailing comma.
  const encoded = response.replace(/./gs, char => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return `<script>ytcfg.set(${JSON.stringify({ EVENT_ID: event, OTHER: "keep" })});</script>` +
    `<script>window.ytAtN({R:'${encoded}',other:true,});</script>`;
}

test("page-bound challenge keeps the matching EVENT_ID and opaque strings intact", async () => {
  const { extractPageAttestation } = await import("./helpers/youtube-page-attestation.mjs");
  const program = "opaque }) }; ,] ' \\";
  const pair = extractPageAttestation(pageFixture({ program }));
  assert.equal(pair.config.EVENT_ID, "page-event");
  assert.equal(pair.config.OTHER, "keep");
  assert.equal(pair.challenge.program, program);
});

test("missing or mixed page context fails instead of falling back to att/get", async () => {
  const { extractPageAttestation } = await import("./helpers/youtube-page-attestation.mjs");
  for (const html of [pageFixture({ event: "" }), '<script>ytcfg.set({"EVENT_ID":"event"});</script>',
    pageFixture().replace("other:true", "other:(globalThis.executed=true)")]) {
    assert.throws(() => extractPageAttestation(html));
  }
  assert.equal(globalThis.executed, undefined);
});
