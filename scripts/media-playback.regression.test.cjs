const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture, tracks, tick } = require("./helpers/audio-player-fixture.cjs");

test("progress and play-state updates leave the native source renderer untouched", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const props = f.StandardAudioRenderer().props;
  props.onPlaying();
  const before = f.rendererNotifications();
  for (let i = 1; i <= 100; i++) props.onPositionChange(i / 4);
  await p.pause();
  assert.equal(f.rendererNotifications(), before);
  assert.equal((await p.getProgress()).position, 25);
  await p.skip(1);
  assert.ok(f.rendererNotifications() > before);
  assert.equal((await p.getActiveTrack()).id, "b");
});

test("media controls do not mutate the shared Android notification concurrently", async () => {
  let active = 0, peak = 0, calls = 0;
  const f = fixture({ notificationControl: async () => {
    active++; peak = Math.max(peak, active); calls++;
    await tick();
    active--;
  } });
  await f.StandardAudioPlayer.setQueue(tracks);
  for (let i = 0; i < 20 && (calls < 8 || active); i++) await tick();
  assert.equal(calls, 8);
  assert.equal(peak, 1);
  await f.StandardAudioPlayer.play();
  await tick();
  assert.equal(calls, 8);
});

test("remote handlers own commands and record intent before playback", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setupPlayer();
  await p.setQueue(tracks);
  await p.pause();
  let calls = 0;
  p.addEventListener(f.Event.RemotePlay, () => {
    calls++;
    void p.play();
  });
  f.controls.get("playbackNotificationPlay")({});
  await tick();
  assert.equal(calls, 1);
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Playing);
});
test("outgoing source callbacks cannot alter the next track", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const old = f.StandardAudioRenderer().props;
  await p.skip(1);
  old.onPositionChange(100);
  old.onEnded();
  old.onError({ message: "old failure" });
  old.onPlaying();
  assert.equal((await p.getActiveTrack()).id, "b");
  assert.equal((await p.getProgress()).position, 0);
  assert.equal((await p.getPlaybackState()).state, f.State.Loading);
});
test("pause during a delayed play wins", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const pending = p.play();
  await p.pause();
  await pending;
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});

test("play waits for preload instead of starting a second source load", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  let starts = 0;
  const handle = {
    play() {
      starts++;
    },
    pause() {},
    seekToTime() {},
  };
  props.ref(handle);
  await p.play();
  await p.play();
  assert.equal(starts, 0);
  props.onLoad();
  await tick();
  assert.equal(starts, 1);
});

test("a late playing callback stops its own old source and leaves the new song alone", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const old = f.StandardAudioRenderer().props;
  let oldPauses = 0;
  let newPauses = 0;
  old.ref({
    play() {},
    pause() {
      oldPauses++;
    },
    seekToTime() {},
  });
  await p.skip(1);
  const current = f.StandardAudioRenderer().props;
  current.ref({
    play() {},
    pause() {
      newPauses++;
    },
    seekToTime() {},
  });
  old.onPlaying();
  assert.equal(oldPauses, 2);
  assert.equal(newPauses, 0);
  assert.equal((await p.getActiveTrack()).id, "b");
});
test("progress updates reuse metadata instead of reloading artwork", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  await tick();
  const props = f.StandardAudioRenderer().props;
  props.onPositionChange(1);
  await tick();
  props.onPositionChange(2);
  await tick();
  const full = f.notifications.filter((info) => Object.hasOwn(info, "artwork"));
  assert.equal(full.length, 1);
  assert.equal(f.notifications.at(-1).elapsedTime, 2);
});

test("progress and pause keep the audio renderer snapshot stable", async () => {
  const f = fixture();
  await f.StandardAudioPlayer.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  const before = f.snapshots[0]();
  props.onPositionChange(12);
  await f.StandardAudioPlayer.pause();
  assert.equal(f.snapshots[0](), before);
  assert.equal((await f.StandardAudioPlayer.getProgress()).position, 12);
  await f.StandardAudioPlayer.skip(1);
  assert.notEqual(f.snapshots[0](), before);
});
test("queue edits preserve the active source and progress", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const props = f.StandardAudioRenderer().props;
  props.onPositionChange(25);
  await p.setQueue([tracks[1], tracks[0]], 1, 20, true);
  props.onPositionChange(26);
  assert.equal((await p.getActiveTrack()).id, "a");
  assert.equal((await p.getProgress()).position, 26);
});
test("seek rejects non-finite values and clamps to track duration", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.seekTo(999);
  assert.equal((await p.getProgress()).position, 180);
  await p.seekTo(NaN);
  assert.equal((await p.getProgress()).position, 180);
  await p.seekTo(-1);
  assert.equal((await p.getProgress()).position, 0);
});

test("native YouTube timeline rejects inflated decoder duration for progress and seek", async () => {
  const f = fixture({ platform: "ios", youtubeResolver: async () => ({
    url: "https://media.example/audio", headers: {}, expiresAt: Date.now() + 300000, durationSeconds: 200.373,
  }) });
  const p = f.StandardAudioPlayer;
  await p.setQueue([{ id: "youtube_abcdefghijk", source: "youtube", youtubeVideoId: "abcdefghijk", duration: 201 }]);
  f.reportDuration(376);
  assert.equal((await p.getProgress()).duration, 200.373);
  await p.seekTo(376);
  assert.equal((await p.getProgress()).position, 200.373);
});

test("JioSaavn native duration still follows its decoder", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  await p.setQueue(tracks); f.reportDuration(179);
  assert.equal((await p.getProgress()).duration, 179);
});

for (const platform of ['ios','android']) {
 test(`native ${platform} media notification and player share the resolved stream timeline`,async()=>{
  const f=fixture({platform,youtubeResolver:async()=>({
   url:'https://media.example/audio',durationSeconds:200.373,
  })});const p=f.StandardAudioPlayer;
  await p.setQueue([{id:'youtube_abcdefghijk',source:'youtube',youtubeVideoId:'abcdefghijk',duration:376}]);
  for(let i=0;i<5;i++)await tick();
  f.reportDuration(400.746);for(let i=0;i<5;i++)await tick();
  const published=f.notifications.filter(n=>typeof n.duration==='number');
  assert.ok(published.length>0);
  assert.equal(published.at(-1).duration,(await p.getProgress()).duration);
  assert.equal(published.at(-1).duration,200.373);
 });
}

test("native JioSaavn and YouTube use the same resolved timeline and seek rules", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  await p.setQueue([{ ...tracks[0], source: "jiosaavn", duration: 201, playbackDurationSeconds: 200.373 }]);
  f.reportDuration(376);
  assert.equal((await p.getProgress()).duration, 200.373);
  await p.seekTo(376);
  assert.equal((await p.getProgress()).position, 200.373);
});
test("interruption resumes only if the user has not paused", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setupPlayer();
  await p.setQueue(tracks);
  await p.play();
  f.system.get("interruption")({ type: "began", shouldResume: false });
  await p.pause();
  f.system.get("interruption")({ type: "ended", shouldResume: true });
  await tick();
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});
test("disconnecting headphones cancels automatic interruption resume", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setupPlayer();
  await p.setQueue(tracks);
  await p.play();
  f.system.get("interruption")({ type: "began", shouldResume: false });
  f.system.get("routeChange")({ reason: "OldDeviceUnavailable" });
  f.system.get("interruption")({ type: "ended", shouldResume: true });
  await tick();
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});
test("ending the queue preserves progress and emits one completion", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue([tracks[0]]);
  await p.play();
  let ended = 0;
  p.addEventListener(f.Event.PlaybackQueueEnded, () => ended++);
  const props = f.StandardAudioRenderer().props;
  props.onPositionChange(180);
  props.onEnded();
  await tick();
  assert.equal(ended, 1);
  assert.equal((await p.getProgress()).position, 180);
  assert.equal((await p.getPlaybackState()).state, f.State.Ended);
});
test("native end position confirms real completion even with stale halfway progress", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  await p.setQueue([tracks[0]]); await p.play();
  const progress = [];
  p.addEventListener(f.Event.PlaybackProgressUpdated, event => progress.push(event));
  const props = f.StandardAudioRenderer().props;
  props.onPositionChange(90); props.onEnded(180); await tick();
  assert.equal(progress.at(-1).position, 180);
  assert.equal(progress.at(-1).duration, 180);
  assert.equal((await p.getProgress()).position, 180);
});

for (const platform of ["android", "ios"]) {
  test(`${platform}: early EOF preserves the song and position instead of advancing the queue`, async () => {
    const f = fixture({ platform }); const p = f.StandardAudioPlayer;
    const errors = []; p.addEventListener(f.Event.PlaybackError, event => errors.push(event));
    await p.setQueue(tracks); await p.play();
    const props = f.StandardAudioRenderer().props;
    props.onPositionChange(88); props.onEnded(90); props.onEnded(90); props.onLoad(); await tick();
    assert.equal(await p.getActiveTrackIndex(), 0);
    assert.equal((await p.getProgress()).position, 90);
    assert.equal((await p.getPlaybackState()).state, f.State.Error);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].shouldResume, true);
    assert.match(errors[0].message, /ended early/);
  });
}
test("native source that never starts emits a bounded recoverable error", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  const errors = []; p.addEventListener(f.Event.PlaybackError, event => errors.push(event));
  await p.setQueue([tracks[0]]); await p.play(); f.fireTimers();
  assert.equal(errors.length, 1); assert.equal(errors[0].trackId, "a");
  assert.equal((await p.getPlaybackState()).state, f.State.Error);
});
test("playing or pausing cancels the native start timeout", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  const errors = []; p.addEventListener(f.Event.PlaybackError, event => errors.push(event));
  await p.setQueue([tracks[0]]); await p.play();
  f.StandardAudioRenderer().props.onPlaying(); f.fireTimers();
  assert.equal(errors.length, 0);
  await p.pause(); await p.play(); await p.pause(); f.fireTimers();
  assert.equal(errors.length, 0);
});

test("setup does not take audio focus before a song is played", async () => {
  const f = fixture();
  await f.StandardAudioPlayer.setupPlayer();
  assert.equal(f.focusRequests.length, 0);
  await f.StandardAudioPlayer.setQueue(tracks);
  await f.StandardAudioPlayer.play();
  assert.equal(f.focusRequests.at(-1), true);
  await f.StandardAudioPlayer.pause();
  assert.equal(f.focusRequests.at(-1), false);
});

test("a current source error stops playback intent and exposes error state", async () => {
  const f = fixture();
  await f.StandardAudioPlayer.setQueue(tracks);
  await f.StandardAudioPlayer.play();
  const props = f.StandardAudioRenderer().props;
  props.onError(new Error("stream failed"));
  assert.equal(
    (await f.StandardAudioPlayer.getPlaybackState()).state,
    f.State.Error,
  );
  assert.equal(f.focusRequests.at(-1), false);
  props.onPlaying();
  assert.equal(
    (await f.StandardAudioPlayer.getPlaybackState()).state,
    f.State.Error,
  );
});

test("paused song properly resumes when play is called even after handle re-render", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  let starts = 0;
  let pauses = 0;
  const initialHandle = {
    play() { starts++; },
    pause() { pauses++; },
    seekToTime() {},
  };
  props.ref(initialHandle);
  await p.play();
  props.onLoad();
  await tick();
  assert.equal(starts, 1);

  // User pauses song
  await p.pause();
  assert.equal(pauses, 1);
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);

  // React re-renders <Audio> creating a new handle object reference
  const reRenderedHandle = {
    play() { starts++; },
    pause() { pauses++; },
    seekToTime() {},
  };
  props.ref(reRenderedHandle);

  // User resumes playback
  await p.play();
  await tick();
  assert.equal(starts, 2, "playback should resume with re-rendered handle");
});

test("subsequent onLoad calls safely reuse sourceNode without error", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const props = f.StandardAudioRenderer().props;
  let starts = 0;
  props.ref({
    play() { starts++; },
    pause() {},
    seekToTime() {},
  });
  await p.play();
  props.onLoad();
  await tick();
  assert.equal(starts, 1);

  // Second onLoad trigger (e.g. from buffer/seek)
  props.onLoad();
  await tick();
  assert.notEqual((await p.getPlaybackState()).state, f.State.Error);
});

test("downloads and downloaded-songs segments display nav overlay and are not unmounted", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const layoutSource = fs.readFileSync(path.join(__dirname, "../app/_layout.tsx"), "utf8");

  assert.match(layoutSource, /NAV_OVERLAY_SEGMENTS\s*=\s*new Set\(\[[^\]]*"downloads"[^\]]*\]\)/);
  assert.match(layoutSource, /NAV_OVERLAY_SEGMENTS\s*=\s*new Set\(\[[^\]]*"downloaded-songs"[^\]]*\]\)/);
  assert.doesNotMatch(layoutSource, /NAV_UNMOUNT_SEGMENTS\s*=\s*new Set\(\[[^\]]*"downloads"[^\]]*\]\)/);
});


for (const platform of ["ios", "android"]) {
  test(`${platform}: outgoing source stops before resolution and late completion cannot skip the new song`, async () => {
    let resolve;
    const f = fixture({ platform, youtubeResolver: () => new Promise(done => { resolve = done; }) });
    const p = f.StandardAudioPlayer;
    await p.setQueue([...tracks, { id: "youtube_next", source: "youtube", youtubeVideoId: "next" }]);
    const old = f.StandardAudioRenderer().props;
    let starts = 0; let pauses = 0;
    old.ref({ play() { starts++; }, pause() { pauses++; }, seekToTime() {} });
    await p.play(); old.onLoad(); await tick();
    assert.equal(starts, 1);
    const next = p.skip(2);
    assert.equal(pauses, 1, "silence is synchronous, before resolving YouTube");
    assert.equal(f.StandardAudioRenderer(), null, "no outgoing decoder remains mounted during resolution");
    old.onEnded(); old.onLoad(); old.onPlaying(); await tick();
    assert.equal(starts, 1, "outgoing callbacks cannot restart old audio");
    resolve({ url: "https://media.example/next", durationSeconds: 150 }); await next;
    assert.equal((await p.getActiveTrack()).id, "youtube_next");
    assert.equal((await p.getPlaybackState()).state, f.State.Loading);
  });

  test(`${platform}: only real completion advances once; library respawn cannot restart completed audio`, async () => {
    const f = fixture({ platform }); const p = f.StandardAudioPlayer;
    await p.setQueue(tracks); await p.play();
    const old = f.StandardAudioRenderer().props;
    let starts = 0;
    old.ref({ play() { starts++; }, pause() {}, seekToTime() {} });
    old.onLoad(); await tick();
    old.onPositionChange(180); await tick();
    assert.equal(await p.getActiveTrackIndex(), 0, "display duration is not an end trigger");
    old.onEnded(); old.onEnded(); old.onLoad(); await tick();
    assert.equal(await p.getActiveTrackIndex(), 1);
    assert.equal(starts, 1);
    assert.equal(f.StandardAudioRenderer().props.children.filter(child => child && child.type === "Audio").length, 0,
      "next decoder is not nested under the active decoder");
  });
}

for (const platform of ['android','ios']) {
  for (const provider of ['jiosaavn','youtube']) {
    test(`${platform}: ${provider} playlist completion loads and starts the next song`, async()=>{
      const f=fixture({platform,youtubeResolver:async song=>({url:`https://media.example/${song.id}`,durationSeconds:180})});
      const p=f.StandardAudioPlayer;
      const queue=tracks.map(track=>({...track,duration:180,source:provider,youtubeVideoId:provider==='youtube'?track.id:undefined}));
      await p.setQueue(queue);await p.play();let firstStarts=0,nextStarts=0;
      const first=f.StandardAudioRenderer().props;
      first.ref({play(){firstStarts++;},pause(){},seekToTime(){}});first.onLoad();await tick();first.onPlaying();
      first.onEnded(180);await tick();
      assert.equal(await p.getActiveTrackIndex(),1);
      const next=f.StandardAudioRenderer().props;
      next.ref({play(){nextStarts++;},pause(){},seekToTime(){}});next.onLoad();await tick();next.onPlaying();
      assert.equal(firstStarts,1);assert.equal(nextStarts,1);assert.equal((await p.getPlaybackState()).state,f.State.Playing);
    });
  }
}
