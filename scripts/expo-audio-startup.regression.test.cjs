const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/expo-player-fixture.cjs");




test("Expo audio keeps a buffering source alive for the native startup window", async () => {
  const player = fixture({ starts: false, fakeTimers: true });
  const loading = player.loadAndPlay("https://audio.invalid/track", { title: "Track" });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(player.players.length, 1);
  assert.ok(player.timerDelays.includes(30_000), "startup should allow slow native buffering");
  assert.ok(player.players[0].calls.some(([name]) => name === "play"));

  player.players[0].emit({ isLoaded: true, isBuffering: true, playing: false, timeControlStatus: "waiting" });
  player.players[0].emit({ isLoaded: true, isBuffering: false, playing: true, timeControlStatus: "playing" });
  await loading;
  assert.equal(player.players[0].calls.some(([name]) => name === "remove"), false);
});

test("Expo load failures identify the source without signed URLs or credentials and do not retry", async () => {
  for (const prepared of [false, true]) {
    const f = fixture({ loaded: false });
    const url = "https://media.example/audio?token=secret";
    const song = { id: "track", playbackHeaders: { Authorization: "private-value" }, youtubeAudioExpiresAt: 1 };
    if (prepared) await f.prepareNextTrack(url, song);
    const loading = f.loadAndPlay(url, song);
    const rejected = assert.rejects(loading, /Cannot Open/);
    await new Promise(resolve => setImmediate(resolve));
    f.players[0].emit({ isLoaded: false, error: `Cannot Open ${url}` });
    await rejected;
    const diagnostic = f.warnings.flat().find(value => typeof value === "string" && value.includes("Preview load failed"));
    assert.ok(diagnostic.includes(prepared ? "prepared-file" : "remote"));
    assert.ok(diagnostic.includes('"expired":true'));
    assert.ok(!/token=secret|private-value|file:\/\//.test(diagnostic));
    assert.equal(f.players.length, 1);
    assert.ok(f.players[0].calls.some(([name]) => name === "remove"));
    if (prepared) assert.equal(f.releasedPreloads.length, 1);
  }
});

