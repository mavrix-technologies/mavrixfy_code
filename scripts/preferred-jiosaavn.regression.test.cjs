const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture({ results = [], searchStatus = 200, mediaStatus = 206, contentType = 'audio/mp4', fails = false } = {}) {
  const calls = [], cancelled = [];
  const module = { exports: {} };
  const source = fs.readFileSync('src/services/audio/preferredJioSaavnStream.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, URL, Date, AbortController, setTimeout, clearTimeout,
      fetch: async (url, options) => { calls.push(['search', url, options]); if (fails) throw Error('offline'); return { ok: searchStatus === 200, json: async () => ({ data: { results } }) }; },
      require: name => {
        if (name === '@/lib/api-config') return { buildAppApiUrl: path => `https://catalog.example/api${path}` };
        if (name === '@/utils/timeFormatters') return { toDurationSeconds: Number };
        if (name === '@/lib/musicData') return { resolveAudioStreamWithQuality: (sources, quality) => {
          assert.equal(quality, 'high'); return sources?.[0] || null;
        } };
        if (name === 'expo/fetch') return { fetch: async (url, options) => {
          calls.push(['media', url, options]); return { status: mediaStatus, headers: { get: () => contentType }, body: { cancel: async () => cancelled.push(true) } };
        } };
        throw Error(name);
      } });
  return { ...module.exports, calls, cancelled };
}
const song = { id: 'youtube_abcdefghijk', title: '52 Bars (Official Audio)', artist: 'Karan Aujla, Ikky', duration: 214 };
const match = { id: 'catalog-id', name: '52 Bars', artists: { primary: [{ name: 'Karan Aujla' }, { name: 'Ikky' }] }, duration: 214,
  downloadUrl: [{ url: 'https://aac.saavncdn.com/track.mp4', bitrate: 320 }] };

test('alternate versions cannot replace the requested studio recording, even with matching duration and artist', () => {
  const { matchesJioSaavnRecording: matches } = fixture();
  const original = { title: '52 Bars', artist: 'Karan Aujla', duration: 214 };
  for (const version of ['Remix', 'Live', 'Acoustic', 'Cover', 'Karaoke', 'Instrumental', 'Mashup', 'Lo-Fi', 'Slowed', 'Sped Up', 'Remastered', 'Radio Edit', 'Extended']) {
    assert.equal(matches(original, { ...original, title: `52 Bars (${version})` }), false, version);
  }
  const requested = { ...original, title: '52 Bars (Remix)' };
  assert.equal(matches(requested, { ...requested }), true);
  assert.equal(matches(requested, original), false);
});

test('catalog playback skips a higher-ranked remix and returns unavailable when no recording matches', async () => {
  for (const includeOriginal of [true, false]) {
    const played = [];
    const requested = { ...song, id: 'sp_requested', title: '52 Bars', source: 'spotify' };
    const original = { ...requested, id: 'youtube_original', source: 'youtube' };
    const candidates = [{ ...original, id: 'youtube_wrong', title: '52 Bars (Remix)' }, ...(includeOriginal ? [original] : [])];
    const module = { exports: {} };
    const deps = {
      '@/lib/api-config': { fetchAppApi: async () => ({ ok: false }) },
      '@/services/audio/preferredJioSaavnStream': { matchesJioSaavnRecording: fixture().matchesJioSaavnRecording },
      '@/utils/timeFormatters': { toDurationSeconds: Number },
      '@/lib/musicData': { resolveAudioStreamWithQuality: () => null },
      '@/services/youtube/YouTubeMusic': { searchYouTubeMusic: async () => ({ songs: candidates }),
        resolveYouTubeStream: async candidate => { played.push(candidate.id); return { url: 'https://media.example/original', bitrate: 128000 }; } },
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/spotify/SpotifyCatalogService.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { module, exports: module.exports, require: name => {
      if (!(name in deps)) throw Error(name); return deps[name];
    } });
    const result = await module.exports.resolveFullSongAudio(requested);
    assert.deepEqual(played, includeOriginal ? ['youtube_original'] : []);
    assert.equal(result?.url ?? null, includeOriginal ? 'https://media.example/original' : null);
  }
});
test('recording identity requires title, artist and close duration; versions stay distinct', () => {
  const { matchesJioSaavnRecording: matches } = fixture();
  const candidate = { title: '52 Bars', artist: 'Karan Aujla', duration: 214 };
  assert.equal(matches(song, candidate), true);
  for (const change of [{ title: '52 Bars Remix' }, { title: '52 Bars Live' }, { artist: 'Cover Artist' }, { duration: 180 }, { duration: 0 }])
    assert.equal(matches(song, { ...candidate, ...change }), false);
  assert.equal(matches({ ...song, artist: 'Unknown Artist' }, candidate), false);
  assert.equal(matches({ ...song, title: 'Video Games' }, { ...candidate, title: 'Games' }), false);
});
test('matching high-quality stream is checked before publishing; identity and timeline remain selected', async () => {
  const f = fixture({ results: [match] });
  const stream = await f.preferredJioSaavnStream(song, 'abcdefghijk');
  assert.equal(stream.clientProfile, 'JIOSAAVN');
  assert.equal(stream.videoId, 'abcdefghijk');
  assert.equal(stream.bitrate, 320000);
  assert.equal(stream.durationSeconds, 214);
  assert.equal(stream.codec, ''); // MIME alone cannot establish the codec.
  assert.equal(f.calls[1][2].headers.Range, 'bytes=0-1023');
  assert.equal(f.cancelled.length, 1);
});
test('unavailable, low-quality, mismatched or unsafe sources fall through without a stream', async () => {
  for (const options of [{ fails: true }, { searchStatus: 503 }, { results: [] },
    { results: [{ ...match, duration: 400 }] },
    { results: [{ ...match, downloadUrl: [{ url: 'https://aac.saavncdn.com/track.mp4', bitrate: 128 }] }] },
    { results: [{ ...match, downloadUrl: [{ url: 'https://saavncdn.com.attacker.example/track.mp4', bitrate: 320 }] }] },
    { results: [match], mediaStatus: 403 }, { results: [match], contentType: 'text/html' }]) {
    const f = fixture(options);
    assert.equal(await f.preferredJioSaavnStream(song, 'abcdefghijk'), null);
  }
});

test('negative-miss cache prevents repeat network searches while transient 503 never poison-caches', async () => {
  const miss = fixture({ results: [] });
  assert.equal(await miss.preferredJioSaavnStream(song, 'abcdefghijk'), null);
  assert.equal(miss.calls.length, 1);
  assert.equal(await miss.preferredJioSaavnStream(song, 'abcdefghijk'), null);
  assert.equal(miss.calls.length, 1);

  const errFixture = fixture({ searchStatus: 503 });
  assert.equal(await errFixture.preferredJioSaavnStream(song, 'abcdefghijk'), null);
  assert.equal(await errFixture.preferredJioSaavnStream(song, 'abcdefghijk'), null);
  assert.equal(errFixture.calls.length, 2);
});

test('PlayerPlaybackResolver resolves failed Spotify/iTunes tracks only once without duplicate retry lookup', async () => {
  let fullResolveCalls = 0;
  const module = { exports: {} };
  const deps = {
    '@/services/youtube/YouTubeMusic': { isYouTubeSong: () => false },
    '@/lib/accountScope': { getAccountScope: () => ({ accountId: 'guest' }) },
    '@/lib/downloads/downloadManager': { getLocalPlaybackUrl: async () => null, getSongDownload: async () => null },
    '@/lib/logger': { logger: { error() {}, warn() {} } },
    '@/lib/musicData': { convertJioSaavnSong: s => s, resolveAudioStreamWithQuality: () => null },
    '@/services/spotify/SpotifyCatalogService': {
      isAudioPreviewUrl: () => false,
      resolveFullSongAudio: async () => { fullResolveCalls++; return null; },
    },
    '@/lib/storage': {
      getSettings: async () => ({ streamingQuality: 'high', highQualityUnlocked: true }),
      isHighQualityEntitled: () => true,
    },
    '@/utils/timeFormatters': { toDurationSeconds: Number },
    'expo-file-system/legacy': { getInfoAsync: async () => ({ exists: false }) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/audio/PlayerPlaybackResolver.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, URL, Date, require: name => {
    if (name in deps) return deps[name];
    throw Error(name);
  } });
  const res = await module.exports.resolvePlaybackUrlWithDetails({
    id: 'itunes_12345',
    title: 'Unknown Track',
    artist: 'Artist',
    source: 'spotify',
  });
  assert.equal(res.url, null);
  assert.equal(fullResolveCalls, 1);
});
