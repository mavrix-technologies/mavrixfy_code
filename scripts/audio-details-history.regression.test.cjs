const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(path) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URL, Date });
  return module.exports;
}
const diagnostic = load('src/services/audio/audioDiagnostics.ts');
const history = load('src/features/history/listeningHistory.ts');

test('audio details identify media origin without trusting catalog labels or leaking signed URLs', () => {
  assert.equal(diagnostic.audioSourceLabel('https://rr1.googlevideo.com/audio?token=secret'), 'YouTube');
  assert.equal(diagnostic.audioSourceLabel('https://aac.saavncdn.com/song.mp4'), 'JioSaavn');
  assert.equal(diagnostic.audioSourceLabel('https://googlevideo.com.evil.example/song'), 'Other / unverified');
  assert.equal(diagnostic.audioSourceLabel('https://evilgooglevideo.com/song'), 'Other / unverified');
  assert.equal(diagnostic.audioSourceLabel('https://unknown.example/?name=saavncdn.com'), 'Other / unverified');
  assert.equal(diagnostic.audioSourceLabel('file:///private/song.m4a'), 'Local file');
  assert.equal(diagnostic.audioSourceLabel(), 'Unknown');
});
test('legacy downloads and unknown bitrate do not claim a quality tier', () => {
  for (const value of [undefined, -1, 0, NaN, Infinity]) assert.equal(diagnostic.audioBitrateLabel(value), 'Unknown');
  assert.equal(diagnostic.audioBitrateLabel(130595), '131 kbps');
  assert.equal(diagnostic.downloadAudioLabel({ audioBitrate: 130595, audioCodec: 'aac' }), '131 kbps · AAC');
  assert.equal(diagnostic.downloadAudioLabel({ quality: 'high' }), 'Quality unknown');
});
test('history searches song and artist terms, and local calendar dates; filters are inclusive', () => {
  const now = new Date(2026, 10, 27, 12).getTime();
  const item = (id, title, artist, at, type = 'song') => ({ id, name: title, imageUrl: '', type,
    lastPlayed: at, data: { id, title, artist, album: 'Album' } });
  const entries = [item('old', 'Old Song', 'Artist', new Date(2026, 10, 20, 23).getTime()),
    item('recent', 'Night Song', 'Sample Artist', new Date(2026, 10, 21).getTime()),
    item('today', 'New Song', 'Other Artist', now), item('playlist', 'Night Song', 'Sample Artist', now, 'playlist'),
    item('future', 'Future Song', 'Artist', now + 1), item('invalid', 'Bad Song', 'Artist', NaN)];
  assert.equal(history.filterListeningHistory(entries, '', 7, now).map(x => x.id).join(), 'today,recent');
  assert.equal(history.filterListeningHistory(entries, 'artist NIGHT', 0, now)[0].id, 'recent');
  assert.equal(history.filterListeningHistory(entries, '2026-11-27', 0, now)[0].id, 'today');
  assert.equal(history.filterListeningHistory(entries, 'missing', 0, now).length, 0);
  assert.equal(history.filterListeningHistory(entries, '', 0, now).length, 3);
  assert.equal(entries[0].id, 'old', 'filtering must not mutate stored order');
});
