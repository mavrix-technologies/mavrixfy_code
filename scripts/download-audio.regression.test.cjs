const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports, URL, Date,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unmocked dependency ${name}`);
      return dependencies[name];
    }, ...globals,
  });
  return module.exports;
}

const music = load('src/lib/musicData.ts', {
  '@/lib/arrayUtils': { sortedCopy: (items, compare) => [...items].sort(compare), mapFilter: (items, map, filter) => items.map(map).filter(filter) },
  '@/utils/timeFormatters': {},
});
const quality = load('src/lib/downloads/audioQuality.ts');

test('quality fallback reports the actual provider label and ranks numeric bitrates', () => {
  const candidates = [{ quality: '160kbps', url: 'https://audio.example/160.m4a' },
    { quality: ' 256kbps ', url: 'https://audio.example/256.m4a' }];
  assert.equal(music.getBestAudioUrl(candidates), candidates[1].url);
  const selected = music.resolveAudioStreamWithQuality([candidates[1]], 'high');
  assert.equal(selected.bitrate, 256);
  assert.equal(selected.qualityLabel, '256kbps');
  assert.equal(selected.isFallback, true);
});

test('a raw audio URL carries no invented 320kbps or 160kbps quality', () => {
  for (const source of ['https://audio.example/original.m4a', [{ url: 'https://audio.example/original.m4a' }]]) {
    const selected = music.resolveAudioStreamWithQuality(source, 'high');
    assert.equal(selected.bitrate, 0);
    assert.equal(selected.qualityLabel, 'Original audio');
    assert.equal(selected.url, 'https://audio.example/original.m4a');
  }
});

test('download quality preserves unrelated and signed stream URLs exactly', () => {
  for (const url of ['https://rr.googlevideo.com/audio_320.mp4?sig=token_320&expire=2000000000',
    'https://cdn.example/audio-320.m4a?sig=secret', 'https://notsaavncdn.com/audio_320.mp4',
    'https://saavncdn.com.example/audio_320.mp4', 'file:///audio_320.mp4']) {
    assert.equal(quality.getAudioUrlByQuality(url, 'low'), url);
  }
  assert.equal(quality.getAudioUrlByQuality('https://aac.saavncdn.com/original.mp4?sig=secret_320&other=a%2Bb', 'low'),
    'https://aac.saavncdn.com/original.mp4?sig=secret_320&other=a%2Bb');
});

test('download quality still supports provider bitrate paths without changing query bytes', () => {
  for (const [url, expected] of [
    ['https://aac.saavncdn.com/320/audio.mp4', 'https://aac.saavncdn.com/48/audio.mp4'],
    ['https://aac.saavncdn.com/audio_320.mp4?token=a%2Bb#track', 'https://aac.saavncdn.com/audio_48.mp4?token=a%2Bb#track'],
    ['https://aac.saavncdn.com/audio-320.mp4', 'https://aac.saavncdn.com/audio-48.mp4'],
  ]) assert.equal(quality.getAudioUrlByQuality(url, 'low'), expected);
});

function offlineFixture(item, { getInfo, validate } = {}) {
  let currentAccount = 'user';
  const reads = [];
  const manager = load('src/lib/downloads/downloadManager.ts', {
    '@/lib/accountScope': { getAccountScope: () => ({ accountId: currentAccount }),
      isCurrentAccount: scope => scope.accountId === currentAccount },
    'expo-file-system/legacy': { getInfoAsync: getInfo || (async () => ({ exists: true, isDirectory: false, size: 2048 })) },
    '@/lib/downloads/downloadQueue': {},
    '@/lib/downloads/downloadStore': { loadDownload: async () => item },
    '@/lib/downloads/entitlement': {},
    '@/lib/downloads/filesystem': { getValidatedTrackFileUri: async (...args) => {
      reads.push(args); return validate ? validate(...args) : 'file:///tracks/song.m4a';
    } },
    '@/lib/downloads/licenseSync': {}, '@/lib/logger': {}, '@/lib/musicData': {},
    '@/types/downloads': { LICENSE_GRACE_PERIOD_DAYS: 7 }, '@/services/youtube/YouTubeMusic': {},
  });
  return { ...manager, reads, switchAccount: () => { currentAccount = 'other'; } };
}

test('revoked, expired, deleted and incomplete download records cannot fall through to an existing file', async () => {
  for (const status of ['revoked', 'expired', 'deleted', 'queued', 'downloading', 'paused', 'failed']) {
    const f = offlineFixture({ status, localPath: 'file:///tracks/song.m4a' });
    assert.equal(await f.getLocalPlaybackUrl('song'), null, status);
    assert.equal(f.reads.length, 0, status);
  }
});

test('completed downloads respect grace expiry and retain orphan-file restoration', async () => {
  const expired = offlineFixture({ status: 'completed', licenseExpiresAt: new Date(Date.now() - 8 * 86400000).toISOString() });
  assert.equal(await expired.getLocalPlaybackUrl('song'), null);
  assert.equal(expired.reads.length, 0);
  const valid = offlineFixture({ status: 'completed', licenseExpiresAt: new Date(Date.now() - 86400000).toISOString(), localPath: 'file:///tracks/song.m4a' });
  assert.equal(await valid.getLocalPlaybackUrl('song'), 'file:///tracks/song.m4a');
  const orphan = offlineFixture(null);
  assert.equal(await orphan.getLocalPlaybackUrl('song'), 'file:///tracks/song.m4a');
});

test('a delayed local-file validation cannot return a previous account download', async () => {
  let finish;
  const f = offlineFixture({ status: 'completed', accountId: 'user', localPath: null }, {
    validate: () => new Promise(resolve => { finish = resolve; }),
  });
  const pending = f.getLocalPlaybackUrl('song');
  await new Promise(resolve => setImmediate(resolve));
  f.switchAccount(); finish('file:///accounts/user/song.m4a');
  assert.equal(await pending, null);
});

function queueFixture({ source, onPause, onCancel, fetchResponse, promote } = {}) {
  const items = new Map(), transfers = [], timers = new Map(), errors = [], deletedFiles = [];
  let sequence = 0;
  const queue = load('src/lib/downloads/downloadQueue.ts', {
    '@/lib/accountScope': { getAccountScope: () => ({ accountId: 'user' }), isCurrentAccount: () => true },
    '@/lib/api-config': { getMusicApiUrl: () => 'https://catalog.example' }, '@/lib/downloads/audioQuality': quality,
    '@/lib/downloads/downloadStore': {
      loadAllDownloads: async () => [...items.values()], loadDownload: async id => items.get(id),
      saveDownload: async item => { items.set(item.songId, item); },
      updateDownloadMemory: item => items.set(item.songId, item),
    },
    '@/lib/downloads/filesystem': {
      ensureDownloadsDirs: async () => {}, getArtworkFileUri: () => 'file:///art.jpg',
      getTempDownloadUri: id => `file:///temp/${id}`, hasSufficientStorage: async () => true,
      promoteTempToTrack: promote || (async id => `file:///tracks/${id}.m4a`),
    },
    '@/lib/logger': { logger: { warn() {}, error: (...args) => errors.push(args) } },
    '@/lib/musicData': music,
    '@/services/youtube/YouTubeMusic': { invalidateYouTubeStream() {},
      resolveYouTubeStream: source || (async () => ({ url: 'https://media.example/song.m4a', expiresAt: Date.now() + 300000 })) },
    'expo-file-system/legacy': { deleteAsync: async uri => { deletedFiles.push(uri); }, createDownloadResumable: () => {
      const transfer = {
        downloadAsync: () => new Promise((resolve, reject) => { transfer.resolve = resolve; transfer.reject = reject; }),
        pauseAsync: async () => { onPause?.(transfer, items); transfer.resolve(undefined); },
        cancelAsync: async () => { onCancel?.(transfer, items); transfer.resolve(undefined); },
      };
      transfers.push(transfer); return transfer;
    } },
    'expo-network': { getNetworkStateAsync: async () => ({ type: 'wifi' }),
      NetworkStateType: { WIFI: 'wifi', ETHERNET: 'ethernet' } },
  }, { AbortController, fetch: fetchResponse,
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id) });
  const item = index => ({ songId: `youtube_abcdefghij${index}`, accountId: 'user', youtubeVideoId: `abcdefghij${index}`,
    title: 'Song', artist: 'Artist', album: '', coverUrl: '', duration: 180, quality: 'medium', status: 'queued', retryCount: 0 });
  return { ...queue, items, transfers, timers, errors, deletedFiles, item };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const preferences = { wifiOnly: false, chargingOnly: false, quality: 'medium', autoDeleteExpired: false };

test('pausing during source resolution survives a late source rejection without retrying', async () => {
  let failSource;
  const f = queueFixture({ source: () => new Promise((_, reject) => { failSource = reject; }) });
  const item = f.item(0);
  await f.enqueueDownload(item, preferences); await tick();
  await f.pauseDownload(item.songId);
  failSource(new Error('Network request failed')); await tick();
  assert.equal(f.items.get(item.songId).status, 'paused');
  assert.equal(f.timers.size, 0);
  assert.equal(f.transfers.length, 0);
  assert.equal(f.errors.length, 0);
});

for (const action of ['pause', 'cancel']) test(`${action} records user intent before native cancellation can fail`, async () => {
  const f = queueFixture({ [action === 'pause' ? 'onPause' : 'onCancel']: transfer => {
    transfer.reject(new Error('Network request failed during native cancellation'));
  } });
  const item = f.item(0);
  await f.enqueueDownload(item, preferences); await tick();
  assert.equal(f.transfers.length, 1);
  await f[action === 'pause' ? 'pauseDownload' : 'cancelDownload'](item.songId); await tick();
  assert.equal(f.items.get(item.songId).status, action === 'pause' ? 'paused' : 'deleted');
  assert.equal(f.timers.size, 0);
  assert.equal(f.errors.length, 0);
});

test('transfer failure retries three times, releases slots and stops after the fourth failure', async () => {
  const f = queueFixture(); const item = f.item(0);
  await f.enqueueDownload(item, preferences); await tick();
  for (let attempt = 0; attempt < 4; attempt++) {
    f.transfers.at(-1).reject(new Error('Network request failed')); await tick();
    assert.equal(f.items.get(item.songId).retryCount, attempt + 1);
    if (attempt < 3) {
      assert.equal(f.items.get(item.songId).status, 'queued');
      const [timerId, timer] = [...f.timers][0];
      assert.equal(timer.delay, [2000, 5000, 10000][attempt]);
      f.timers.delete(timerId); await timer.fn(); await tick();
      assert.equal(f.transfers.length, attempt + 2);
    }
  }
  assert.equal(f.items.get(item.songId).status, 'failed');
  assert.equal(f.timers.size, 0);
});

test('cancelling one transfer frees exactly one slot and keeps queued transfers bounded', async () => {
  const f = queueFixture();
  const songs = Array.from({ length: 4 }, (_, index) => f.item(index));
  for (const item of songs) await f.enqueueDownload(item, preferences);
  await tick(); assert.equal(f.transfers.length, 2);
  await f.cancelDownload(songs[0].songId); await tick();
  assert.equal(f.transfers.length, 3);
  assert.equal(f.items.get(songs[3].songId).status, 'queued');
  f.transfers[1].resolve({ status: 200, headers: { 'Content-Type': 'audio/mp4' } }); await tick();
  assert.equal(f.transfers.length, 4);
  assert.equal(f.items.get(songs[1].songId).status, 'completed');
});

test('catalog refresh timeout remains active while the response body is still downloading', async () => {
  let bodyStarted = false;
  const f = queueFixture({ fetchResponse: async (_url, { signal }) => ({ ok: true, json: () => {
    bodyStarted = true;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted response body')), { once: true }));
  } }) });
  const item = { ...f.item(0), songId: 'catalog-song', youtubeVideoId: undefined, audioUrl: 'https://audio.example/song.m4a' };
  await f.enqueueDownload(item, preferences); await tick();
  assert.equal(bodyStarted, true);
  assert.equal(f.transfers.length, 0);
  const timer = [...f.timers.values()].find(value => value.delay === 8000);
  assert.ok(timer, 'the deadline must not be cleared after headers arrive');
  timer.fn(); await tick();
  assert.equal(f.transfers.length, 1, 'a stalled refresh falls back to the original audio source');
  assert.equal(f.timers.size, 0);
});

for (const action of ['pause', 'cancel']) test(`${action} during file promotion cannot become completed`, async () => {
  let finishPromotion;
  const f = queueFixture({ promote: () => new Promise(resolve => { finishPromotion = resolve; }) });
  const item = f.item(0);
  await f.enqueueDownload(item, preferences); await tick();
  f.transfers[0].resolve({ status: 200, headers: { 'Content-Type': 'audio/mp4' } }); await tick();
  assert.equal(typeof finishPromotion, 'function');
  await f[action === 'pause' ? 'pauseDownload' : 'cancelDownload'](item.songId);
  const finalUri = `file:///tracks/${item.songId}.m4a`;
  finishPromotion(finalUri); await tick();
  assert.equal(f.items.get(item.songId).status, action === 'pause' ? 'paused' : 'deleted');
  assert.ok(f.deletedFiles.includes(finalUri), 'discard the promoted file from an abandoned transfer');
});
