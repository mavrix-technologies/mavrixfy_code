const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { fixture: playerFixture } = require('./helpers/audio-player-fixture.cjs');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const songs = [
  { id:'a', title:'A', artist:'Artist A', coverUrl:'a.jpg', audioUrl:'https://example.com/a.mp3', duration:180 },
  { id:'b', title:'B', artist:'Artist B', coverUrl:'b.jpg', audioUrl:'https://example.com/b.mp3', duration:200 },
];
const track = song => ({ ...song, url:song.audioUrl, artwork:song.coverUrl });

async function fixture({ nativeSingleTrack = false } = {}) {
  const f = playerFixture();
  const player = f.StandardAudioPlayer;
  player.getPlaybackSnapshot = async () => ({ queue: await player.getQueue(), index: await player.getActiveTrackIndex(), ...await player.getProgress() });
  player.updateCurrentTrack = async (index, metadata) => {
    const state = await player.getPlaybackSnapshot();
    if (state.index === index && state.queue[index]?.id === metadata.id) {
      state.queue[index] = metadata;
      await player.setQueue(state.queue, index, state.position);
    }
    return player.getPlaybackSnapshot();
  };
  await player.setQueue(nativeSingleTrack ? [track(songs[1])] : songs.map(track), nativeSingleTrack ? 0 : 1, 35);
  await player.play();
  const options = {
    currentSongRef:{ current:songs[1] }, queueRef:{ current:[...songs] }, queueIndexRef:{ current:1 },
    originalQueueRef:{ current:[...songs] }, positionSecondsRef:{ current:35 },
    isPlayingRef:{ current:true }, desiredPlayStateRef:{ current:true }, playRequestIdRef:{ current:1 },
    isNativeQueueSyncedRef:{ current:!nativeSingleTrack }, streamUrlCache:{ current:new Map() },
    streamResolveCache:{ current:new Map() }, repeatModeRef:{ current:'off' },
    TrackPlayer:player, RepeatMode:f.RepeatMode, isPlayerReady:true, ensurePlayerReady:async () => true,
    enqueueNativeQueueMutation:fn => fn(), canUseLightweightAudioFallback:false,
    setCurrentSong() {}, setQueue() {}, setSourceQueue() {}, setPlaybackQuality() {}, showPlaybackNotice() {},
  };
  const requests = [];
  const snapshots = [];
  const events = [];
  const noop = () => {};
  const module = { exports:{} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/audio/audioQualityControl.ts','utf8'), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports:module.exports,
    require(name) {
      if (name.endsWith('accountScope')) return { getAccountScope: () => ({}), isCurrentAccount: () => true };
      if (name.endsWith("YouTubeMusic")) return { isYouTubeSong: song => song.source === "youtube" || song.id?.startsWith("youtube_") };
      if (name.endsWith("ExpoAvAdapter")) return { prepareNextTrack: async () => {} };
      if (name === 'react') return { useCallback:fn => fn, useRef:value => ({ current:value }) };
      if (name.endsWith('logger')) return { logger:{ error:noop } };
      if (name.endsWith('ExpoAvAdapter')) return {};
      if (name.endsWith('PlaybackEngine')) return { updatePlaybackEngineSnapshot:patch => snapshots.push(patch) };
      if (name.endsWith('playerPersistenceService')) return { playerPersistenceService:{ saveStreamingQuality:async () => {} } };
      if (name.endsWith('PlayerPlaybackResolver')) return {
        invalidateQualityPreferenceCache:noop,
        songToTrack:(song,url) => ({ ...track(song), url }),
        withResolvedPlaybackUrl:(song,audioUrl) => ({ ...song,audioUrl }),
        resolvePlaybackUrlWithDetails:(song,quality) => {
          const request = deferred(); requests.push({ ...request, song, quality }); return request.promise;
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  // Observe the real engine's track events, including the transient index-zero
  // event emitted by the old quality reload implementation.
  player.addEventListener(f.Event.PlaybackActiveTrackChanged, event => events.push(event.track.id));
  const actions = module.exports.useAudioQualityControl(options);
  const resolve = (index,url = 'https://example.com/b-high.mp3') => requests[index].resolve({
    url, qualityState:{ requested:requests[index].quality, actualBitrate:320, qualityLabel:'320kbps', unlocked:true, isFallback:false },
  });
  return { f,player,options,requests,snapshots,events,actions,resolve };
}
const tick = () => new Promise(done => setImmediate(done));

test('quality reload never selects queue[0] and publishes matching song/artwork', async () => {
  const t = await fixture();
  const pending = t.actions.changeStreamingQuality('high');
  await tick(); t.resolve(0); await pending;
  assert.deepEqual(t.events,['b']);
  assert.equal((await t.player.getActiveTrack()).id,'b');
  assert.equal((await t.player.getActiveTrack()).artwork,'b.jpg');
  assert.equal((await t.player.getProgress()).position,35);
  assert.equal(t.snapshots.at(-1).currentSong.id,'b');
  assert.equal(t.snapshots.at(-1).currentSong.coverUrl,'b.jpg');
});

test('a late quality response cannot overwrite a newer song selection', async () => {
  const t = await fixture();
  const pending = t.actions.changeStreamingQuality('high'); await tick();
  t.options.currentSongRef.current = songs[0];
  t.options.queueIndexRef.current = 0;
  t.options.playRequestIdRef.current++;
  await t.player.skip(0); t.events.length = 0;
  t.resolve(0); await pending;
  assert.equal(t.options.currentSongRef.current.id,'a');
  assert.equal((await t.player.getActiveTrack()).id,'a');
  assert.equal(t.events.length,0);
});

test('the last quality request wins even if an older response finishes last', async () => {
  const t = await fixture();
  const older = t.actions.changeStreamingQuality('high'); await tick();
  const newer = t.actions.changeStreamingQuality('low'); await tick();
  t.resolve(1,'https://example.com/b-low.mp3'); await newer;
  t.resolve(0,'https://example.com/b-high.mp3'); await older;
  assert.equal((await t.player.getActiveTrack()).url,'https://example.com/b-low.mp3');
  assert.equal(t.options.currentSongRef.current.audioUrl,'https://example.com/b-low.mp3');
});

test('Pause and current position win while quality resolution is pending', async () => {
  const t = await fixture();
  const pending = t.actions.changeStreamingQuality('high'); await tick();
  t.options.desiredPlayStateRef.current = false;
  t.options.isPlayingRef.current = false;
  t.options.positionSecondsRef.current = 42;
  await t.player.seekTo(42); await t.player.pause();
  t.resolve(0); await pending;
  assert.equal((await t.player.getPlaybackState()).state,t.f.State.Paused);
  assert.equal((await t.player.getProgress()).position,42);
});

test('quality reload addresses the native active track when native queue contains only B', async () => {
  const t = await fixture({ nativeSingleTrack:true });
  const pending = t.actions.changeStreamingQuality('high'); await tick(); t.resolve(0); await pending;
  assert.equal((await t.player.getActiveTrack()).id,'b');
  assert.equal((await t.player.getActiveTrack()).url,'https://example.com/b-high.mp3');
  assert.equal(t.options.queueIndexRef.current,1);
});

test('quality resolution retains metadata refreshed for the same active track', async () => {
  const t = await fixture();
  const pending = t.actions.changeStreamingQuality('high'); await tick();
  t.options.currentSongRef.current = { ...songs[1], coverUrl:'new-b.jpg', title:'Updated B' };
  t.resolve(0); await pending;
  assert.equal((await t.player.getActiveTrack()).artwork,'new-b.jpg');
  assert.equal(t.snapshots.at(-1).currentSong.title,'Updated B');
});

function coreCacheFixture() {
  const requests = [];
  let now = 2_000_000_000_000;
  const noop = () => {};
  const module = { exports:{} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/audio/usePlayerCoreState.ts','utf8'), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 },
  }).outputText, {
    module,exports:module.exports,
    Date: class extends Date { static now() { return now; } },
    require(name) {
      if (name.endsWith("YouTubeMusic")) return { isYouTubeSong: song => song.source === "youtube" || song.id?.startsWith("youtube_") };
      if (name.endsWith("ExpoAvAdapter")) return { prepareNextTrack: async () => {} };
      if (name === 'react') return {
        useCallback:fn => fn, useEffect:noop, useRef:value => ({ current:value }), useState:value => [value,noop],
      };
      if (name.endsWith('logger')) return { logger:{ error:noop, warn:noop } };
      if (name.endsWith('accountScope')) return {};
      if (name.endsWith('storage')) return {};
      if (name.endsWith('globalToast')) return { showGlobalToast:noop };
      if (name.endsWith('audioNativeQueueLane')) return { useAudioNativeQueueLane:() => ({}) };
      if (name.endsWith('audioStartupReconcile')) return { useStartupPlaybackReconcile:noop };
      if (name.endsWith('PlaybackEngine')) return { updatePlaybackEngineSnapshot:noop };
      if (name.endsWith('smartAutoplayService')) return {};
      if (name.endsWith('StandardAudioPlayer')) return {};
      if (name.endsWith('PlayerPlaybackResolver')) return {
        resolvePlaybackUrlWithDetails:() => { const d=deferred(); requests.push(d); return d.promise; },
      };
      throw new Error(name);
    },
  });
  const core = module.exports.usePlayerCoreState({ TrackPlayer:null, State:{}, RepeatMode:{} });
  return { core, requests, advance: ms => { now += ms; }, get now() { return now; } };
}

test('invalidated stream resolution cannot refill cache or remove a newer pending resolution', async () => {
  const { core, requests } = coreCacheFixture();
  const old = core.resolvePlaybackUrlCached(songs[1]);
  core.streamResolveCache.current.clear();
  const latest = core.resolvePlaybackUrlCached(songs[1]);
  const latestPending = core.streamResolveCache.current.get('b');
  requests[0].resolve({ url:'old-url', qualityState:{} }); await old;
  assert.equal(core.streamUrlCache.current.has('b'),false);
  assert.equal(core.streamResolveCache.current.get('b'),latestPending);
  requests[1].resolve({ url:'latest-url', qualityState:{} }); await latest;
  assert.equal(core.streamUrlCache.current.get('b'),'latest-url');
});

test('Spotify-matched signed media is resolved again before its URL expires', async () => {
  const f = coreCacheFixture(), song = { id: 'sp_track', source: 'spotify' };
  const url = `https://rr.googlevideo.com/videoplayback?expire=${Math.floor(f.now / 1000) + 180}&sig=original%2Bvalue`;
  const first = f.core.resolvePlaybackUrlCached(song);
  f.requests[0].resolve({ url, qualityState: {} }); assert.equal(await first, url);
  assert.equal(await f.core.resolvePlaybackUrlCached(song), url);
  assert.equal(f.requests.length, 1, 'reuse a valid stream without another provider lookup');
  f.advance(60_001);
  const fresh = f.core.resolvePlaybackUrlCached(song);
  assert.equal(f.requests.length, 2, 'refresh at the expiry safety margin');
  const updated = `https://rr.googlevideo.com/videoplayback?expire=${Math.floor(f.now / 1000) + 3600}&sig=fresh%2Bvalue`;
  f.requests[1].resolve({ url: updated, qualityState: {} });
  assert.equal(await fresh, updated);
  assert.equal(f.core.streamUrlCache.current.get(song.id), updated);
});

test('catalog URLs without an expiry are periodically resolved again and near-expiry results are not cached', async () => {
  const f = coreCacheFixture(), song = { id: 'catalog', source: 'jiosaavn' };
  const first = f.core.resolvePlaybackUrlCached(song);
  f.requests[0].resolve({ url: 'https://cdn.example/original.mp4', qualityState: {} }); await first;
  f.advance(5 * 60_000 + 1);
  const second = f.core.resolvePlaybackUrlCached(song);
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve({ url: `https://cdn.example/audio?expire=${Math.floor(f.now / 1000) + 60}`, qualityState: {} });
  await second;
  assert.equal(f.core.streamUrlCache.current.has(song.id), false);
});
