const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/expo-player-fixture.cjs");
const tick = () => new Promise(resolve => setImmediate(resolve));

test("Expo early EOF reports interruption without finishing or advancing the song", async () => {
  const f = fixture(); let received;
  f.onStatusUpdate(status => { received = status; });
  await f.loadAndPlay("https://media.example/audio", { id: "song", playbackDurationSeconds: 180 });
  f.players[0].emit({ playing: false, currentTime: 90, duration: 180, didJustFinish: true, isLoaded: true });
  assert.equal(received.didJustFinish, false);
  assert.match(received.error, /ended early/);
  assert.equal(received.position, 90);
  assert.equal(f.isEnded(), false);
});


test("Expo releases an unready source when its loading deadline expires", async () => {
  const f = fixture({ loaded: false, fakeTimers: true });
  const pending = f.loadAndPlay("https://media.example/audio");
  const rejected = assert.rejects(pending, /loading timed out/);
  await tick(); f.fireTimers(); await rejected;
  assert.equal(f.players[0].calls.some(([call]) => call === "play"), false);
  assert.equal(f.players[0].calls.some(([call]) => call === "remove"), true);
  f.destroy();
});

test("Expo does not treat a play request as confirmed playback", async () => {
  const f = fixture({ starts: false, fakeTimers: true });
  const pending = f.loadAndPlay("https://media.example/audio");
  const rejected = assert.rejects(pending, /start timed out/);
  await tick(); f.fireTimers(); await rejected;
  assert.equal(f.players[0].calls.some(([call]) => call === "remove"), true);
  f.destroy();
});

test("Expo resume retains YouTube headers and seeks before any playback", async () => {
  const f = fixture();
  await f.loadAndPlay("https://media.example/audio", { title: "Majboor", artist: "Artist",
    playbackHeaders: { "User-Agent": "client", Referer: "music" } }, () => true, 43);
  const p = f.players[0];
  assert.equal(p.source.headers.Referer, "music");
  assert.equal(p.metadata.title, "Majboor");
  assert.equal(JSON.stringify(p.calls), JSON.stringify([["seek", 43], ["play"]]));
  f.destroy();
});

test("Pause while Expo resume waits for loading wins over the delayed play", async () => {
  const f = fixture({ loaded: false }); let wantsPlay = true;
  const pending = f.loadAndPlay("https://media.example/audio", null, () => wantsPlay, 60);
  await tick();
  const p = f.players[0];
  assert.equal(p.calls.length, 0);
  wantsPlay = false;
  p.emit({ isLoaded: true }); await pending;
  assert.equal(JSON.stringify(p.calls), JSON.stringify([["seek", 60]]));
  f.destroy();
});
test("a fresh Expo start waits for readiness before attempting playback", async () => {
  const f = fixture({ loaded: false });
  const pending = f.loadAndPlay("https://media.example/audio"); await tick();
  assert.equal(f.players[0].calls.length, 0);
  f.players[0].emit({ isLoaded: true }); await pending;
  assert.equal(f.players[0].calls[0][0], "play"); f.destroy();
});

test("late ready status cannot seek or start an outgoing Expo source", async () => {
  const f = fixture({ loaded: false });
  const pending = f.loadAndPlay("https://media.example/old", null, () => true, 60);
  await tick(); const old = f.players[0];
  const next = f.loadAndPlay("https://media.example/new");
  await tick(); f.players[1].emit({ isLoaded: true }); await next;
  old.emit({ isLoaded: true }); await pending;
  assert.equal(old.calls.some(([call]) => call === "seek" || call === "play"), false);
  assert.equal(f.players[1].calls[0][0], "play");
  f.destroy();
});

test("pending standby creation cannot survive destroy", async () => {
  let completeMode;
  const f = fixture({ mode: () => new Promise(resolve => { completeMode = resolve; }) });
  const pending = f.prepareStandby("https://media.example/next");
  f.destroy(); completeMode(); await pending;
  assert.equal(f.players.length, 0);
});

test("Expo completion reaches progress listeners even when the last status is paused", async () => {
  const f = fixture(); let received;
  f.onStatusUpdate(status => { received = status; });
  await f.loadAndPlay("https://media.example/audio");
  f.players[0].emit({ playing: false, currentTime: 153, duration: 153, didJustFinish: true, isLoaded: true });
  assert.equal(received.didJustFinish, true);
  assert.equal(received.position, 153);
  f.destroy();
});

test("Expo seek clamps to media duration and immediately forwards native status", async () => {
  const f = fixture(); let received;
  f.onStatusUpdate(status => { received = status; });
  await f.loadAndPlay("https://media.example/audio");
  const p = f.players[0]; p.isLoaded = true; p.duration = 188;
  await f.seekTo(376);
  assert.equal(p.calls.at(-1)[1], 188);
  p.emit({ playing: true, currentTime: 188, duration: 188, isLoaded: true });
  assert.equal(received.position, 188);
  await assert.rejects(f.seekTo(NaN), /Invalid seek/);
  p.seekTo = async () => { throw new Error("Decoder rejected seek"); };
  await assert.rejects(f.seekTo(80), /Decoder rejected/);
  f.destroy();
});

test("Expo status and seek share resolved YouTube duration despite an inflated decoder estimate", async () => {
  const f = fixture(); let received;
  f.onStatusUpdate(status => { received = status; });
  await f.loadAndPlay("https://media.example/audio", { source: "youtube", playbackDurationSeconds: 200.373 });
  const p = f.players[0]; p.duration = 376; p.currentTime = 50;
  p.emit({ playing: true, currentTime: 50, duration: 376, isLoaded: true });
  assert.equal(received.duration, 200.373);
  assert.equal(f.getProgress().duration, 200.373);
  await f.seekTo(376);
  assert.equal(p.calls.at(-1)[1], 200.373);
  f.destroy();
});

test("Expo accepts the same stream metadata and seek bounds for a catalog provider", async () => {
  const f = fixture(); let received;
  f.onStatusUpdate(status => { received = status; });
  await f.loadAndPlay("https://media.example/catalog", { source: "jiosaavn", playbackDurationSeconds: 120 });
  const p = f.players[0]; p.duration = 130;
  p.emit({ playing: true, currentTime: 30, duration: 130, isLoaded: true });
  assert.equal(received.duration, 120);
  await f.seekTo(130);
  assert.equal(p.calls.at(-1)[1], 120);
  f.destroy();
});

test("Expo removes old native player before a replacement can play and ignores its late end", async () => {
  const f = fixture(); const events = [];
  f.onStatusUpdate(status => events.push(status));
  await f.loadAndPlay("https://media.example/old"); const old = f.players[0];
  f.stop();
  assert.equal(JSON.stringify(old.calls.slice(-2)), JSON.stringify([["pause"], ["remove"]]));
  const count = events.length;
  old.emit({ playing: false, didJustFinish: true, currentTime: 180 });
  assert.equal(events.length, count);
  await f.loadAndPlay("https://media.example/new");
  assert.equal(f.players[1].calls[0][0], "play");
  f.destroy();
});

test("Expo approximate duration cannot mark a still-playing tail as ended", async () => {
  const f = fixture();
  await f.loadAndPlay("https://media.example/tail", { playbackDurationSeconds: 180 });
  const p = f.players[0]; p.currentTime = 180; p.duration = 181;
  p.emit({ playing: true, currentTime: 180, duration: 181 });
  assert.equal(f.isEnded(), false);
  p.emit({ playing: false, currentTime: 181, duration: 181, didJustFinish: true });
  assert.equal(f.isEnded(), true);
  await f.seekTo(0);
  assert.equal(f.isEnded(), false);
  f.destroy();
});

test('Expo native ended state advances once even without didJustFinish', async()=>{
 const f=fixture();const events=[];f.onStatusUpdate(status=>events.push(status));
 await f.loadAndPlay('https://media.example/end',{playbackDurationSeconds:180});
 const p=f.players[0];p.emit({playing:false,currentTime:180,duration:180,playbackState:'ended'});
 p.emit({playing:false,currentTime:180,duration:180,didJustFinish:true});
 assert.equal(events.filter(event=>event.didJustFinish).length,1);assert.equal(f.isEnded(),true);f.destroy();
});
test('Expo indefinite EOF timestamp uses last observed position and does not falsely interrupt',async()=>{
 const f=fixture();let received;f.onStatusUpdate(status=>received=status);
 await f.loadAndPlay('https://media.example/end',{playbackDurationSeconds:180});
 const p=f.players[0];p.emit({playing:true,currentTime:179.6,duration:180});
 p.emit({playing:false,currentTime:0,duration:0,didJustFinish:true});
 assert.equal(received.didJustFinish,true);assert.equal(received.position,179.6);f.destroy();
});
test('Expo decoder duration estimates cannot veto actual native completion without a resolved timeline',async()=>{
 const f=fixture();let received;f.onStatusUpdate(status=>received=status);
 await f.loadAndPlay('https://media.example/end');
 f.players[0].emit({playing:false,currentTime:180,duration:376,didJustFinish:true});
 assert.equal(received.didJustFinish,true);f.destroy();
});

test('Expo next promotion keeps the prepared player and starts it without creating a third decoder',async()=>{
 const f=fixture();await f.loadAndPlay('https://media.example/first');const first=f.players[0];
 await f.prepareStandby('https://media.example/next');const prepared=f.players[1];
 f.beginTrackChange();assert.equal(first.calls.some(([name])=>name==='remove'),true);
 assert.equal(prepared.calls.length,0);
 await f.loadAndPlay('https://media.example/next');
 assert.equal(f.players.length,2);assert.equal(prepared.calls[0][0],'play');f.destroy();
});

test('Expo media metadata uses resolved stream seconds instead of catalog or decoder duration',async()=>{
 const f=fixture();await f.loadAndPlay('https://media.example/audio',{
  title:'Song',duration:376,playbackDurationSeconds:200.373,
 });
 const p=f.players[0];p.duration=400.746;
 assert.equal(p.metadata.durationSeconds,200.373);
 assert.equal(f.getProgress().duration,p.metadata.durationSeconds);
 await f.loadAndPlay('https://media.example/other',{duration:376});
 assert.equal(f.players[1].metadata.durationSeconds,undefined);
 f.destroy();
});
