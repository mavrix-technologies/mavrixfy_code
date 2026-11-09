const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(filename, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name in dependencies) return dependencies[name];
    throw new Error(name);
  } });
  return module.exports;
}
const durations = load('src/utils/timeFormatters.ts', {
  '@/lib/arrayUtils': load('src/lib/arrayUtils.ts', {}),
});

function fixture() {
  let generation = 0;
  let saved;
  const storage = { loadPlayerState: async () => saved };
  const account = { getAccountScope: () => ({ accountId: 'owner', generation }), isCurrentAccount: scope => scope.generation === generation };
  const api = load('src/services/player/playerPersistenceService.ts', {
    '@/lib/storage': storage, '@/lib/accountScope': account, '@/utils/timeFormatters': durations,
  });
  return { ...api, storage, setSaved: value => { saved = value; }, changeAccount: () => generation++ };
}
const song = id => ({ id, title: id, artist: 'Artist', duration: 180 });

test('restore removes invalid persisted entries and preserves the selected duplicate occurrence', () => {
  const { normalizePersistedPlayerState: normalize } = fixture();
  const a = song('a'), b = song('b');
  const queue = [a, null, b, a, {}, 2];
  const state = normalize({ currentSong: a, queue, queueIndex: 3, positionSeconds: 12 });
  assert.deepEqual(Array.from(state.queue, item => item.id), ['a', 'b', 'a']);
  assert.equal(state.queueIndex, 2);
  assert.equal(state.positionSeconds, 12);
  assert.equal(queue.length, 6, 'normalization must not mutate stored input');
});

test('restore repairs a mismatched or invalid index without choosing a different current song', () => {
  const { normalizePersistedPlayerState: normalize } = fixture();
  const a = song('a'), b = song('b');
  for (const queueIndex of [-1, 0.5, NaN, Infinity, 20, 0]) {
    const state = normalize({ currentSong: b, queue: [a, b], queueIndex });
    assert.equal(state.queueIndex, 1);
    assert.equal(state.queue[state.queueIndex].id, 'b');
  }
  const missing = normalize({ currentSong: b, queue: [a], queueIndex: 0 });
  assert.deepEqual(Array.from(missing.queue, item => item.id), ['a', 'b']);
  assert.equal(missing.queueIndex, 1);
});

test('restore resets invalid, nonfinite or already-completed media positions', () => {
  const { normalizePersistedPlayerState: normalize } = fixture();
  const a = song('a');
  for (const positionSeconds of [-1, NaN, Infinity, '12', null, 180, 500]) {
    assert.equal(normalize({ currentSong: a, queue: [a], queueIndex: 0, positionSeconds }).positionSeconds, 0);
  }
  assert.equal(normalize({ currentSong: a, positionSeconds: 179.5 }).positionSeconds, 179.5);
  assert.equal(normalize({ currentSong: { ...a, duration: 0 }, positionSeconds: 200 }).positionSeconds, 200,
    'unknown duration must not invent an arbitrary seek ceiling');
});

test('a malformed saved queue can recover its valid selected song without autoplay intent', () => {
  const { normalizePersistedPlayerState: normalize } = fixture();
  const a = song('a');
  const state = normalize({ currentSong: a, queue: {}, queueIndex: 3, playing: true, updatedAt: Infinity });
  assert.deepEqual(Array.from(state.queue, item => item.id), ['a']);
  assert.equal(state.queueIndex, 0);
  assert.equal(Object.hasOwn(state, 'playing'), false);
  assert.equal(Object.hasOwn(state, 'updatedAt'), false);
  for (const input of [null, [], {}, { currentSong: {} }, { currentSong: { id: 12 } }, { currentSong: { id: ' ' } }]) assert.equal(normalize(input), null);
});

test('restored sparse metadata is safe for string consumers while provider identity and legacy durations survive', () => {
  const { normalizePersistedPlayerState: normalize } = fixture();
  const malformed = { id: 'youtube_video', title: null, artist: { name: 'bad' }, album: [], audioUrl: {}, coverUrl: 3,
    genre: false, duration: '3:30', source: 'youtube', youtubeVideoId: 'video' };
  const state = normalize({ currentSong: malformed, queue: [malformed, { id: 'sparse' }], queueIndex: 0, positionSeconds: 120 });
  assert.equal(state.currentSong.title.trim(), 'Unknown');
  assert.equal(state.currentSong.artist.trim(), 'Mavrixfy');
  assert.equal(state.currentSong.album, '');
  assert.equal(state.currentSong.audioUrl, '');
  assert.equal(state.currentSong.coverUrl, '');
  assert.equal(state.currentSong.genre, '');
  assert.equal(state.currentSong.duration, 210);
  assert.equal(state.positionSeconds, 120);
  assert.equal(state.currentSong.youtubeVideoId, 'video');
  assert.equal(state.currentSong.source, 'youtube');
  assert.equal(state.queue[1].duration, 0);
  assert.equal(state.queue[1].title, 'Unknown');
  assert.equal(typeof malformed.artist, 'object', 'normalization must not mutate original metadata');
  const corruptIdentity = normalize({ currentSong: { ...malformed, source: { provider: 'youtube' },
    videoId: { id: 'bad' }, youtubeVideoId: ['bad'] } }).currentSong;
  for (const field of ['source', 'videoId', 'youtubeVideoId']) assert.equal(Object.hasOwn(corruptIdentity, field), false,
    `Malformed ${field} must not override the valid persisted song ID`);
});

test('an asynchronous persisted read cannot restore the outgoing account even with a shared song ID', async () => {
  const f = fixture();
  let finish;
  f.storage.loadPlayerState = () => new Promise(resolve => { finish = resolve; });
  const pending = f.playerPersistenceService.loadPlayerState();
  f.changeAccount();
  finish({ currentSong: song('same-id'), queue: [song('same-id')], queueIndex: 0, positionSeconds: 90 });
  assert.equal(await pending, null);
  f.storage.loadPlayerState = async () => ({ currentSong: song('same-id'), queue: [song('same-id')], queueIndex: 0, positionSeconds: 10 });
  assert.equal((await f.playerPersistenceService.loadPlayerState()).positionSeconds, 10);
});
