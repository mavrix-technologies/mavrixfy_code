const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const { fixture: audioFixture, tick } = require('./helpers/audio-player-fixture.cjs');

async function fixture({ singleNativeTrack = false, fallback = false, duplicateNativeTrack = false } = {}) {
  const audio = audioFixture();
  const songs = ['a', 'b', 'c'].map(id => ({
    id, title: id.toUpperCase(), artist: id, duration: 180,
    audioUrl: `https://test/${id}-old.mp3`, coverUrl: `https://test/${id}.jpg`,
  }));
  if (duplicateNativeTrack) songs[0].id = songs[1].id;
  const native = songs.map(s => ({ ...s, url: s.audioUrl, artwork: s.coverUrl }));
  const player = audio.StandardAudioPlayer;
  await player.setQueue(singleNativeTrack ? [native[1]] : native, singleNativeTrack ? 0 : 1, 30);
  await player.play();
  const activeEvents = [];
  player.addEventListener(audio.Event.PlaybackActiveTrackChanged, event => activeEvents.push(event.track.id));
  const ref = current => ({ current });
  const state = {
    streamUrlCache: ref(new Map()), streamResolveCache: ref(new Map()),
    currentSongRef: ref(songs[1]), queueRef: ref(songs), originalQueueRef: ref(songs),
    queueIndexRef: ref(1), positionSecondsRef: ref(30), isPlayingRef: ref(true),
    desiredPlayStateRef: ref(true), playRequestIdRef: ref(1), pendingPlayRequestRef: ref(null),
    isNativeQueueSyncedRef: ref(!singleNativeTrack), repeatModeRef: ref('off'),
  };
  const pending = [];
  const queues = [];
  const fallbackLoads = [];
  const qualities = [];
  const dependencies = {
    react: { useCallback: fn => fn, useRef: ref },
    '@/lib/logger': { logger: { error() {} } },
    '@/services/audio/PlaybackEngine': { updatePlaybackEngineSnapshot() {} },
    '@/services/audio/ExpoAvAdapter': {
      loadAndPlay: async (url, song, shouldPlay) => fallbackLoads.push({ url, song, shouldPlay: shouldPlay ? shouldPlay() : true }),
      seekTo: async () => {}, pause() {},
    },
    '@/services/audio/PlayerPlaybackResolver': {
      invalidateQualityPreferenceCache() {},
      resolvePlaybackUrlWithDetails: (song, quality) => new Promise(resolve => pending.push({ song, quality, resolve })),
      songToTrack: (song, url) => ({ ...song, url, artwork: song.coverUrl }),
      withResolvedPlaybackUrl: (song, audioUrl) => ({ ...song, audioUrl }),
    },
    '@/services/player/playerPersistenceService': { playerPersistenceService: { saveStreamingQuality: async () => {} } },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/audio/audioQualityControl.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unmocked dependency ${name}`);
      return dependencies[name];
    },
  });
  let lane = Promise.resolve();
  const options = {
    ...state, TrackPlayer: fallback ? null : {
      ...player,
      setQueue: async (...args) => { queues.push(args); return player.setQueue(...args); },
    },
    isPlayerReady: true, ensurePlayerReady: async () => true,
    RepeatMode: audio.RepeatMode,
    enqueueNativeQueueMutation: op => { const result = lane.then(op); lane = result.catch(() => {}); return result; },
    canUseLightweightAudioFallback: fallback,
    setCurrentSong() {}, setQueue() {}, setSourceQueue() {}, showPlaybackNotice() {},
    setPlaybackQuality: quality => qualities.push(quality),
  };
  const { changeStreamingQuality } = module.exports.useAudioQualityControl(options);
  const resolve = (index, quality) => pending[index].resolve({
    url: `https://test/b-${quality}.mp3`, qualityState: { requested: quality, actualBitrate: quality === 'high' ? 320 : 96 },
  });
  return { state, player, audio, songs, pending, queues, qualities, fallbackLoads, activeEvents, changeStreamingQuality, resolve };
}

test('quality reload never selects the first queue song or changes artwork', async () => {
  const f = await fixture();
  const pending = f.changeStreamingQuality('high');
  await tick(); f.resolve(0, 'high'); await pending;
  assert.deepEqual(f.activeEvents, ['b']);
  assert.equal((await f.player.getActiveTrack()).artwork, 'https://test/b.jpg');
  assert.equal(await f.player.getActiveTrackIndex(), 1);
  assert.equal((await f.player.getProgress()).position, 30);
  assert.equal(f.queues[0][1], 1);
  assert.equal(f.queues[0][2], 30);
});

test('late quality result cannot replace a newly selected song', async () => {
  const f = await fixture();
  const pending = f.changeStreamingQuality('high');
  await tick();
  f.state.playRequestIdRef.current++;
  f.state.currentSongRef.current = f.songs[2];
  f.state.queueIndexRef.current = 2;
  await f.player.skip(2);
  f.resolve(0, 'high'); await pending;
  assert.equal(f.state.currentSongRef.current.id, 'c');
  assert.equal((await f.player.getActiveTrack()).id, 'c');
  assert.equal(f.queues.length, 0);
  assert.equal(f.qualities.length, 0);
});

test('latest quality wins when older resolution arrives last', async () => {
  const f = await fixture();
  const high = f.changeStreamingQuality('high'); await tick();
  const low = f.changeStreamingQuality('low'); await tick();
  f.resolve(1, 'low'); await low;
  f.resolve(0, 'high'); await high;
  assert.equal(f.state.currentSongRef.current.audioUrl, 'https://test/b-low.mp3');
  assert.equal((await f.player.getActiveTrack()).url, 'https://test/b-low.mp3');
  assert.equal(f.qualities.length, 1);
});

test('pause while quality resolves wins over the old playing snapshot', async () => {
  const f = await fixture();
  const pending = f.changeStreamingQuality('high'); await tick();
  f.state.desiredPlayStateRef.current = false;
  await f.player.pause();
  f.resolve(0, 'high'); await pending;
  assert.equal((await f.player.getPlaybackState()).state, f.audio.State.Paused);
  await tick();
  assert.equal(f.audio.notifications.at(-1).state, 'paused');
});

test('quality uses live progress rather than rewinding to the tap position', async () => {
  const f = await fixture();
  const pending = f.changeStreamingQuality('high'); await tick();
  f.state.positionSecondsRef.current = 80;
  await f.player.seekTo(80);
  f.resolve(0, 'high'); await pending;
  assert.equal((await f.player.getProgress()).position, 80);
});

test('single native track reloads its actual native index, not JS queue index', async () => {
  const f = await fixture({ singleNativeTrack: true });
  const pending = f.changeStreamingQuality('high'); await tick();
  f.resolve(0, 'high'); await pending;
  assert.equal((await f.player.getActiveTrack()).url, 'https://test/b-high.mp3');
  assert.equal(await f.player.getActiveTrackIndex(), 0);
  assert.equal(f.state.queueIndexRef.current, 1);
  assert.equal(f.state.queueRef.current[1].audioUrl, 'https://test/b-high.mp3');
});

test('same song selected again has a new playback request identity', async () => {
  const f = await fixture();
  const pending = f.changeStreamingQuality('high'); await tick();
  f.state.playRequestIdRef.current += 2; // B -> C -> B
  f.resolve(0, 'high'); await pending;
  assert.equal(f.queues.length, 0);
  assert.equal(f.state.currentSongRef.current.audioUrl, 'https://test/b-old.mp3');
});

test('fallback receives pause intent before loading the quality stream', async () => {
  const f = await fixture({ fallback: true });
  const pending = f.changeStreamingQuality('high'); await tick();
  f.state.desiredPlayStateRef.current = false;
  f.resolve(0, 'high'); await pending;
  assert.equal(f.fallbackLoads[0].shouldPlay, false);
  assert.equal(f.fallbackLoads[0].song.coverUrl, 'https://test/b.jpg');
});

test('quality reload preserves the active occurrence of a duplicated song ID', async () => {
  const f = await fixture({ duplicateNativeTrack: true });
  const pending = f.changeStreamingQuality('high'); await tick();
  f.resolve(0, 'high'); await pending;
  assert.equal(await f.player.getActiveTrackIndex(), 1);
  assert.equal(f.queues[0][1], 1);
  assert.equal((await f.player.getQueue())[0].url, 'https://test/a-old.mp3');
  assert.equal((await f.player.getQueue())[1].url, 'https://test/b-high.mp3');
});
