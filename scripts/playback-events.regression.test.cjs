const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const handlers = new Map();
  const ref = current => ({ current });
  const state = { isPlaying: true };
  const positions = [];
  let effect = 0;
  const modules = {
    react: { useRef: ref, useEffect: callback => { if (effect++ === 0) callback(); } },
    'react-native': { Platform: { OS: 'android' } },
    '@/lib/logger': { logger: { error() {}, warn() {} } },
    '@/services/audio/PlaybackEngine': { updatePlaybackEngineSnapshot: patch => Object.assign(state, patch) },
    '@/services/player/playerPersistenceService': {},
    '@/services/carPlayService': {},
    '@/services/audio/PlayerPlaybackResolver': {},
    '@/utils/timeFormatters': { toDurationSeconds: value => Number(value) || 0 },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/audio/audioSyncListeners.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  vm.runInNewContext(code, context);
  const song = { id: 'new', duration: 200 };
  const options = {
    isPlayerReady: true, TrackPlayer: {},
    Event: new Proxy({}, { get: (_, key) => key }),
    State: new Proxy({}, { get: (_, key) => key }),
    subscribeTrackPlayerEvent: (event, callback) => { handlers.set(event, callback); return () => {}; },
    currentSongRef: ref(song), queueRef: ref([{ id: 'old' }, song]), queueIndexRef: ref(1),
    isPlayingRef: ref(true), playbackLoadingRef: ref(false), desiredPlayStateRef: ref(true),
    pendingPlayRequestRef: ref(null), positionSecondsRef: ref(0), isNativeQueueSyncedRef: ref(true),
    setIsPlaying: value => { state.isPlaying = value; }, setPlaybackLoading() {},
    setCurrentSong: value => { state.song = value; }, setQueueIndex() {},
    setNativePosition: value => positions.push(value), setNativeDuration() {}, setSeekOverride() {},
    prefetchAdjacentTrackStreams() {}, showPlaybackNotice() {},
  };
  context.exports.useAudioSyncListeners(options);
  return { options, state, positions, emit: (event, payload) => handlers.get(event)(payload) };
}

test('queue replacement events preserve the selected song and play intent', () => {
  const h = harness();
  h.options.playbackLoadingRef.current = true;
  h.options.pendingPlayRequestRef.current = { id: 1, songId: 'new' };
  h.emit('PlaybackState', { state: 'Playing' });
  h.emit('PlaybackPlayWhenReadyChanged', { playWhenReady: false });
  h.emit('PlaybackState', { state: 'Stopped' });
  h.emit('PlaybackActiveTrackChanged', { track: { id: 'old' }, index: 0 });
  h.emit('PlaybackProgressUpdated', { position: 95, duration: 100, track: 0 });
  assert.equal(h.state.isPlaying, true);
  assert.equal(h.options.desiredPlayStateRef.current, true);
  assert.equal(h.options.currentSongRef.current.id, 'new');
  assert.equal(h.positions.length, 0);
});

test('remote pause wins while a new song is loading', () => {
  const h = harness();
  h.options.playbackLoadingRef.current = true;
  h.options.pendingPlayRequestRef.current = { id: 1, songId: 'new' };
  h.emit('RemotePause');
  h.emit('PlaybackState', { state: 'Playing' });
  h.emit('PlaybackPlayWhenReadyChanged', { playWhenReady: true });
  assert.equal(h.state.isPlaying, false);
  assert.equal(h.options.desiredPlayStateRef.current, false);
});

test('a stale native resume after loading cannot override an explicit pause', () => {
  const h = harness();
  h.options.playbackLoadingRef.current = false;
  h.options.desiredPlayStateRef.current = false;
  h.options.isPlayingRef.current = false;
  h.state.isPlaying = false;
  h.emit('PlaybackPlayWhenReadyChanged', { playWhenReady: true });
  assert.equal(h.state.isPlaying, false);
  assert.equal(h.options.desiredPlayStateRef.current, false);
});

test('buffering and native track changes retain pause action; explicit remote play resumes it', () => {
  const h = harness();
  h.emit('PlaybackState', { state: 'Playing' });
  h.emit('PlaybackState', { state: 'Buffering' });
  h.emit('PlaybackState', { state: 'Paused' });
  assert.equal(h.state.isPlaying, true);
  h.emit('PlaybackPlayWhenReadyChanged', { playWhenReady: false });
  assert.equal(h.state.isPlaying, false);
  h.emit('RemotePlay');
  h.emit('PlaybackPlayWhenReadyChanged', { playWhenReady: true });
  assert.equal(h.state.isPlaying, true);
});

test('progress from an outgoing native queue index is ignored', () => {
  const h = harness();
  h.emit('PlaybackProgressUpdated', { position: 99, duration: 100, track: 0 });
  h.emit('PlaybackProgressUpdated', { position: 2, duration: 200, track: 1 });
  assert.deepEqual(h.positions, [2]);
});

function commandHarness() {
  const ref = current => ({ current });
  const requests = new Map();
  const loading = [];
  const nativeCalls = [];
  const noop = () => {};
  const native = {
    setQueue: async tracks => { nativeCalls.push(['queue', tracks[0].id]); },
    skip: async () => {},
    play: async () => { nativeCalls.push(['play']); },
    pause: async () => { nativeCalls.push(['pause']); },
  };
  const modules = {
    react: { useCallback: fn => fn, useEffect: noop },
    '@/lib/logger': { logger: { error: noop, warn: noop } },
    '@/services/audio/PlaybackEngine': { updatePlaybackEngineSnapshot: noop },
    '@/services/player/playerPersistenceService': {},
    '@/services/audio/ExpoAvAdapter': {},
    '@/services/audio/PlayerPlaybackResolver': {
      songToTrack: (song, url) => ({ ...song, url }),
      withResolvedPlaybackUrl: (song, audioUrl) => ({ ...song, audioUrl }),
      resolveAudioUrl: song => song.audioUrl,
    },
    '@/services/audio/audioNativeQueueLane': { isSameQueueContent: (a, b) => a === b },
    '@/utils/timeFormatters': { toDurationSeconds: value => Number(value) || 0 },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/audio/audioPlaybackCommands.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, setTimeout: noop, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  vm.runInNewContext(code, context);
  const o = {
    currentSongRef: ref(null), queueRef: ref([]), originalQueueRef: ref([]), queueIndexRef: ref(0),
    userQueuedSongIdsRef: ref([]), isShuffledRef: ref(false), repeatModeRef: ref('off'),
    isPlayingRef: ref(false), playbackLoadingRef: ref(false), desiredPlayStateRef: ref(null),
    playRequestIdRef: ref(0), pendingPlayRequestRef: ref(null), positionSecondsRef: ref(0),
    durationSecondsRef: ref(0), isNativeQueueSyncedRef: ref(false), streamUrlCache: ref(new Map()),
    togglePlayInFlightRef: ref(false),
    setCurrentSong: noop, setQueue: noop, setSourceQueue: noop, setQueueIndex: noop,
    setUserQueuedSongIds: noop, setIsPlaying: noop, setSeekOverride: noop, setNativePosition: noop,
    setPlaybackLoading: value => loading.push(value),
    resolvePlaybackUrlCached: song => new Promise(resolve => requests.set(song.id, resolve)),
    enqueueNativeQueueMutation: fn => fn(), prefetchAdjacentTrackStreams: noop,
    TrackPlayer: native, isPlayerReady: true, State: {}, showPlaybackNotice: noop,
  };
  return { o, loading, requests, nativeCalls, ...context.exports.useAudioPlaybackCommands(o) };
}

test('an obsolete load cannot clear loading or replace the newer song', async () => {
  const h = commandHarness();
  const first = h.playSong({ id: 'first' });
  const second = h.playSong({ id: 'second' });
  h.requests.get('first')('https://example.test/first.mp3');
  await first;
  assert.equal(h.o.playbackLoadingRef.current, true);
  assert.equal(h.o.pendingPlayRequestRef.current.songId, 'second');
  assert.deepEqual(h.nativeCalls, []);
  h.requests.get('second')('https://example.test/second.mp3');
  await second;
  assert.equal(h.o.playbackLoadingRef.current, false);
  assert.equal(h.o.currentSongRef.current.id, 'second');
  assert.deepEqual(h.nativeCalls, [['queue', 'second'], ['play']]);
});

test('pause while resolving a stream loads the requested song without restarting playback', async () => {
  const h = commandHarness();
  const loading = h.playSong({ id: 'song' });
  await h.togglePlay();
  h.requests.get('song')('https://example.test/song.mp3');
  await loading;
  assert.equal(h.o.desiredPlayStateRef.current, false);
  assert.equal(h.nativeCalls.some(call => call[0] === 'play'), false);
  assert.equal(h.o.currentSongRef.current.id, 'song');
});
