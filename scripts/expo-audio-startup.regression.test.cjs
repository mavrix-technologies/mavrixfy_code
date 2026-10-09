const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/expo-player-fixture.cjs");

test("Expo audio keeps a buffering source alive for the native startup window", async () => {
  const player = fixture({ starts: false, fakeTimers: true });
  const loading = player.loadAndPlay("https://audio.invalid/track", { title: "Track" });

  for (let i = 0; i < 8 && player.players.length === 0; i++) await Promise.resolve();
  assert.equal(player.players.length, 1);
  assert.ok(player.timerDelays.includes(30_000), "startup should allow slow native buffering");
  assert.ok(player.players[0].calls.some(([name]) => name === "play"));

  player.players[0].emit({ isLoaded: true, isBuffering: true, playing: false, timeControlStatus: "waiting" });
  player.players[0].emit({ isLoaded: true, isBuffering: false, playing: true, timeControlStatus: "playing" });
  await loading;
  assert.equal(player.players[0].calls.some(([name]) => name === "remove"), false);
});

