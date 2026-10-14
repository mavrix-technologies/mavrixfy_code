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
