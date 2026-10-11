const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture, tracks, tick } = require("./helpers/audio-player-fixture.cjs");

for (const platform of ["android", "ios"]) {
  test(`${platform}: two complete track timelines advance once and finish without a halfway pause`, async () => {
    const f = fixture({ platform }); const p = f.StandardAudioPlayer;
    await p.setQueue(tracks); await p.play();
    let ended = 0; p.addEventListener(f.Event.PlaybackQueueEnded, () => ended++);
    for (let index = 0; index < tracks.length; index++) {
      const props = f.StandardAudioRenderer().props;
      props.onPlaying();
      for (let position = 0; position <= tracks[index].duration; position++) {
        props.onPositionChange(position);
        assert.equal((await p.getPlaybackState()).state, f.State.Playing);
        assert.equal(await p.getActiveTrackIndex(), index);
      }
      props.onEnded(tracks[index].duration); props.onEnded(tracks[index].duration);
      await tick();
    }
    assert.equal(ended, 1);
    assert.equal((await p.getPlaybackState()).state, f.State.Ended);
  });
}

test("Android transient focus loss resumes only on the matching permitted ended event", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  await p.setupPlayer(); await p.setQueue(tracks); await p.play();
  f.StandardAudioRenderer().props.onPlaying();
  const readiness = [];
  p.addEventListener(f.Event.PlaybackPlayWhenReadyChanged, event => readiness.push(event));
  f.system.get("interruption")({ type: "began", shouldResume: false });
  assert.equal(readiness.at(-1).reason, "interruption");
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
  f.system.get("interruption")({ type: "ended", shouldResume: true });
  await tick(); f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Playing);
  await p.pause();
  assert.equal(readiness.at(-1).reason, "pause");
  f.system.get("interruption")({ type: "ended", shouldResume: true });
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});

test("a mid-track buffering timeout reloads the same track at its last position", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  await p.setQueue(tracks); await p.play();
  const props = f.StandardAudioRenderer().props;
  props.onPlaying(); props.onPositionChange(90); props.onWaiting(); props.onWaiting();
  f.fireTimers(); await tick();
  assert.equal(await p.getActiveTrackIndex(), 0);
  assert.equal((await p.getProgress()).position, 90);
  f.StandardAudioRenderer().props.onPlaying();
  assert.equal((await p.getPlaybackState()).state, f.State.Playing);
});

test("Pause cancels stall recovery and a successful buffer refill never reloads the source", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  await p.setQueue(tracks); await p.play();
  const props = f.StandardAudioRenderer().props;
  props.onPlaying(); props.onWaiting(); props.onPlaying();
  const source = f.snapshots[0](); f.fireTimers();
  assert.equal(f.snapshots[0](), source);
  props.onWaiting(); await p.pause(); f.fireTimers();
  assert.equal(f.snapshots[0](), source);
  assert.equal((await p.getPlaybackState()).state, f.State.Paused);
});

test("repeated interrupted streams stop after three reconnects rather than loop indefinitely", async () => {
  const f = fixture(); const p = f.StandardAudioPlayer;
  await p.setQueue(tracks); await p.play();
  const errors = []; p.addEventListener(f.Event.PlaybackError, error => errors.push(error));
  for (let attempt = 0; attempt < 4; attempt++) {
    const props = f.StandardAudioRenderer().props;
    props.onPlaying(); props.onPositionChange(90); props.onEnded(90); await tick();
  }
  assert.equal(errors.length, 1);
  assert.equal(await p.getActiveTrackIndex(), 0);
  assert.equal((await p.getPlaybackState()).state, f.State.Error);
});

test("a completed next-track preload supplies local audio without altering the original queue URL", async () => {
  const f = fixture({ preloader: { takePreparedAudio: url => url === tracks[1].url ? "file:///cache/next.audio" : null } });
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks); await p.play(); await p.skip(1);
  assert.equal(f.StandardAudioRenderer().props.source.uri, "file:///cache/next.audio");
  assert.equal((await p.getActiveTrack()).url, tracks[1].url);
  const props = f.StandardAudioRenderer().props;
  props.onPlaying(); props.onPositionChange(40);
  await p.updateMetadataForTrack(1, { title: "Updated" });
  assert.equal(f.StandardAudioRenderer().props.source.uri, "file:///cache/next.audio");
});

test("a late failed reconnect cannot stop a newer selected song", async () => {
  let rejectRecovery; let resolutions = 0;
  const f = fixture({ youtubeResolver: async () => {
    if (++resolutions === 1) return { url: "https://media.example/audio", durationSeconds: 180 };
    return new Promise((_, reject) => { rejectRecovery = reject; });
  } }); const p = f.StandardAudioPlayer;
  await p.setQueue([{ id: "youtube_abcdefghijk", source: "youtube" }, tracks[1]]);await p.play();
  const props = f.StandardAudioRenderer().props;
  props.onPlaying();props.onPositionChange(90);props.onEnded(90);await tick();
  await p.skip(1);f.StandardAudioRenderer().props.onPlaying();
  rejectRecovery(new Error("network failed"));await tick();
  assert.equal(await p.getActiveTrackIndex(),1);
  assert.equal((await p.getPlaybackState()).state,f.State.Playing);
});

test("lazy YouTube queue entries use current High quality and ignore stale prefetched metadata", async () => {
  const requested = [];
  const f = fixture({ streamingQuality: "high", youtubeResolver: async (song, quality) => {
    requested.push(quality);
    return { url: `https://audio.test/${song.id}-${quality}`, bitrate: quality === "high" ? 256000 : 50000,
      expiresAt: Date.now() + 300000, durationSeconds: 180 };
  } });
  const queue = ["a", "b"].map(id => ({ id: `youtube_${id}`, source: "youtube", youtubeVideoId: id,
    youtubeRequestedQuality: "medium", duration: 180 }));
  await f.StandardAudioPlayer.setQueue(queue);
  assert.equal((await f.StandardAudioPlayer.getActiveTrack()).url, "https://audio.test/youtube_a-high");
  f.qualityPreference.current = "low";
  await f.StandardAudioPlayer.skipToNext();
  assert.equal((await f.StandardAudioPlayer.getActiveTrack()).url, "https://audio.test/youtube_b-low");
  assert.deepEqual(requested, ["high", "low"]);
});

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

test("moving a queue entry keeps the active audio source and playback position intact", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const sourceProps = f.StandardAudioRenderer().props;
  sourceProps.onPositionChange(42);
  const before = f.snapshots[0]();

  await p.move(1, 0);

  assert.equal(JSON.stringify((await p.getQueue()).map(track => track.id)), JSON.stringify(["b", "a"]));
  assert.equal((await p.getActiveTrack()).id, "a");
  assert.equal((await p.getActiveTrackIndex()), 1);
  assert.equal((await p.getProgress()).position, 42);
  assert.equal(f.snapshots[0](), before);
});

test("native queue move rejects invalid indices without changing audio or queue", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  const before = f.snapshots[0]();
  for (const invalid of [-1, 0.5, NaN, Infinity, tracks.length]) {
    await p.move(invalid, 1);
    await p.move(1, invalid);
  }
  assert.equal(JSON.stringify((await p.getQueue()).map(track => track.id)), JSON.stringify(tracks.map(track => track.id)));
  assert.equal(f.snapshots[0](), before);
});

test("Play Next insertion keeps queue order and the current track position", async () => {
  const f = fixture();
  const p = f.StandardAudioPlayer;
  await p.setQueue(tracks);
  await p.play();
  const sourceProps = f.StandardAudioRenderer().props;
  sourceProps.onPositionChange(31);
  const next = { id: "next", url: "https://example.com/next.mp3" };

  await p.add([next], 1);

  assert.equal(JSON.stringify((await p.getQueue()).map(track => track.id)), JSON.stringify(["a", "next", "b"]));
  assert.equal((await p.getActiveTrack()).id, "a");
  assert.equal((await p.getActiveTrackIndex()), 0);
  assert.equal((await p.getProgress()).position, 31);
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
  await assert.rejects(p.seekTo(NaN), /Invalid seek position/);
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
    assert.equal((await p.getPlaybackState()).state, f.State.Loading);
    assert.equal(errors.length, 0);
    const recovered = f.StandardAudioRenderer().props;
    recovered.onPlaying(); recovered.onPositionChange(120);
    assert.equal((await p.getProgress()).position, 120);
    assert.equal((await p.getPlaybackState()).state, f.State.Playing);
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
  const layoutSource = fs.readFileSync(path.resolve("app/_layout.tsx"), "utf8");

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

for (const platform of ["android", "ios"]) {
  test(`${platform}: replacing a hung stream releases the serialized queue and starts the latest track`, async () => {
    let resolveOld;
    const f = fixture({ platform, youtubeResolver: () => new Promise(resolve => { resolveOld = resolve; }) });
    const p = f.StandardAudioPlayer;
    let lane = Promise.resolve();
    const enqueue = operation => (lane = lane.then(operation));
    let oldSettled = false;
    const old = enqueue(async () => {
      await p.setQueue([{ id: "old", source: "youtube", youtubeVideoId: "old" }]);
      oldSettled = true;
    });
    await tick();
    assert.equal(typeof resolveOld, "function");
    p.beginTrackChange();
    let newSettled = false;
    const latest = enqueue(async () => {
      await p.setQueue(tracks, 1);
      await p.play();
      newSettled = true;
    });
    await tick(); await tick();
    assert.equal(oldSettled, true, "obsolete resolution cannot hold the lane");
    assert.equal(newSettled, true, "Next must reach native playback before the old network request settles");
    await old; await latest;
    let starts = 0;
    const source = f.StandardAudioRenderer().props;
    source.ref({ play() { starts++; source.onPlay(); }, pause() {}, seekToTime() {} });
    source.onLoad(); await tick();
    assert.equal(starts, 1);
    assert.equal((await p.getActiveTrack()).id, "b");
    assert.equal((await p.getPlaybackState()).state, f.State.Playing);
    resolveOld({ url: "https://obsolete.example/old", durationSeconds: 180 });
    await tick();
    assert.equal((await p.getActiveTrack()).id, "b", "late resolution cannot restore the old song");
    await p.pause(); await p.play(); await tick();
    assert.equal(starts, 2, "latest source can still pause and resume");
  });
}

test("a native stream-resolution timeout releases the queue operation with a retryable error", async () => {
  const f = fixture({ youtubeResolver: () => new Promise(() => {}) });
  const pending = f.StandardAudioPlayer.setQueue([{ id: "hung", source: "youtube", youtubeVideoId: "hung" }]);
  const rejected = assert.rejects(pending, /Audio loading timed out/);
  await tick(); f.fireTimers(); await rejected;
  await f.StandardAudioPlayer.setQueue(tracks, 1);
  assert.equal((await f.StandardAudioPlayer.getActiveTrack()).id, "b");
});

test("reset cancels a pending local-download validation", async () => {
  const f = fixture({ downloads: { getSongDownload: () => new Promise(() => {}) } });
  let settled = false;
  const pending = f.StandardAudioPlayer.setQueue([{ id: "local", url: "file:///local.m4a" }]).then(() => { settled = true; });
  await tick(); await f.StandardAudioPlayer.reset(); await tick();
  assert.equal(settled, true);
  await pending;
  assert.equal(await f.StandardAudioPlayer.getActiveTrack(), null);
});
