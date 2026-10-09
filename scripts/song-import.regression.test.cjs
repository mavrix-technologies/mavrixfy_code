const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function load(file, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { module, exports: module.exports, URL, console,
    require: name => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
  return module.exports;
}
const format = load('src/services/liked-songs/likedSongFormat.ts');
const time = load('src/utils/timeFormatters.ts', { '@/lib/arrayUtils': load('src/lib/arrayUtils.ts') });
const parser = load('src/lib/file-parser.ts', { '@/utils/timeFormatters': time });
const song = (overrides = {}) => ({ id: 'youtube_abcdefghijk', source: 'youtube', youtubeVideoId: 'abcdefghijk',
  title: 'Chaleya', artist: 'Arijit Singh, Shilpa Rao', duration: 200, album: '', genre: '',
  coverUrl: 'https://example.test/cover.jpg', audioUrl: '', ...overrides });
const row = (overrides = {}) => ({ title: 'Chaleya', artist: 'Arijit Singh', duration: 200, status: 'ready', ...overrides });
function matcher(search = async () => ({ songs: [] })) {
  return load('src/lib/song-matcher.ts', { '@/services/liked-songs/likedSongFormat': format,
    '@/services/youtube/YouTubeMusic': { searchYouTubeMusic: search } });
}

test('Spotify CSV handles BOM, quoted commas, multiline fields and explicit millisecond units', () => {
  const result = parser.parseFile('\uFEFFTrack URI,Track Name,Artist Name(s),Album Name,Duration (ms)\r\nspotify:track:abc,"Chaleya","Arijit Singh, Shilpa Rao","Jawan\nSoundtrack",200000\r\nspotify:track:def,Short,Artist,Album,5000', 'playlist.csv');
  assert.equal(result.errors.length, 0);
  assert.equal(result.songs.length, 2);
  assert.equal(result.songs[0].artist, 'Arijit Singh, Shilpa Rao');
  assert.equal(result.songs[0].album, 'Jawan\nSoundtrack');
  assert.equal(result.songs[0].duration, 200);
  assert.equal(result.songs[1].duration, 5);
});
test('generic seconds, formatted durations, semicolon and tab exports use the same parser', () => {
  for (const separator of [',', ';', '\t']) {
    const result = parser.parseFile(['Title', 'Artist', 'Duration'].join(separator) + '\n' + ['Chaleya', 'Arijit Singh', '3:20'].join(separator), 'songs.csv');
    assert.equal(result.songs[0].duration, 200);
  }
  assert.equal(parser.parseFile('Chaleya,Arijit Singh,200', 'songs.csv').songs[0].duration, 200);
  assert.equal(parser.parseFile('Title,Artist,Duration (seconds)\nChaleya,Arijit Singh,200', 'songs.csv').songs[0].duration, 200);
});
test('TXT preserves version suffixes and title-only rows; broken CSV is reported rather than misparsed', () => {
  assert.equal(parser.parseFile('Artist - Song - Unplugged', 'songs.txt').songs[0].title, 'Song - Unplugged');
  assert.equal(parser.parseFile('Chaleya by Arijit Singh', 'songs.txt').songs[0].artist, 'Arijit Singh');
  assert.equal(parser.parseFile('Chaleya', 'songs.txt').songs[0].artist, '');
  assert.equal(parser.parseFile('Title,Artist\n"Unclosed,Artist', 'songs.csv').songs.length, 0);
  assert.match(parser.parseFile('Title,Artist\n"Unclosed,Artist', 'songs.csv').errors[0], /not closed/);
});
test('matching rejects unrelated first hits, other artists, variants, wrong durations and other providers', () => {
  const api = matcher();
  for (const bad of [song({ title: 'Other Song' }), song({ artist: 'Arijit Someone' }),
    song({ title: 'Chaleya (Remix)' }), song({ title: 'Chaleya - Live' }), song({ duration: 376 }),
    song({ id: 'saavn_old', source: 'jiosaavn', youtubeVideoId: undefined })]) {
    assert.equal(api.selectImportedSong(row(), [bad]), null);
    assert.equal(api.selectImportedSong(row(), [bad, song()]).id, song().id);
  }
});
test('title qualifiers and collaborator credits match while saved metadata retains the actual recording and permanent link', () => {
  const selected = matcher().selectImportedSong(row({ album: 'Jawan' }), [song({ title: 'Chaleya (From "Jawan")',
    audioUrl: 'https://rr1.googlevideo.com/videoplayback?expire=1', artistRefs: [{ id: 'youtube_artist_channel', name: 'Arijit Singh' }] })]);
  assert.equal(selected.title, 'Chaleya (From "Jawan")');
  assert.equal(selected.album, 'Jawan');
  assert.equal(selected.audioUrl, '');
  assert.equal(selected.youtubeUrl, 'https://music.youtube.com/watch?v=abcdefghijk');
  assert.equal(selected.artistRefs[0].name, 'Arijit Singh');
  assert.equal(matcher().selectImportedSong(row({ title: 'Chaleya (Remix)' }), [song()]), null);
});
test('duration selects the closest eligible recording and title-only ambiguity is not silently accepted', () => {
  const api = matcher();
  const other = song({ id: 'youtube_lmnopqrstuv', youtubeVideoId: 'lmnopqrstuv', duration: 207 });
  assert.equal(api.selectImportedSong(row(), [other, song()]).id, song().id);
  assert.equal(api.selectImportedSong(row({ artist: '', duration: 0 }), [song(), song({ artist: 'Other Singer' })]), null);
});
test('matching uses at most two song-only queries, never resolves media, and propagates network errors', async () => {
  const queries = [], api = matcher(async (query, filter, signal) => {
    queries.push(query); assert.equal(filter, 'songs'); assert.ok(signal);
    return { songs: queries.length === 1 ? [song({ title: 'Wrong' })] : [song()] };
  });
  assert.equal((await api.matchImportedSong(row(), new AbortController().signal)).id, song().id);
  assert.deepEqual(queries, ['Chaleya arijit singh', 'Chaleya']);
  await assert.rejects(matcher(async () => { throw Error('Network unavailable'); }).matchImportedSong(row(), new AbortController().signal), /Network/);
});
test('batch matching limits concurrency to two, keeps file order and exposes misses separately from search failures', async () => {
  let active = 0, max = 0;
  const api = matcher(async query => {
    active++; max = Math.max(max, active); await tick();
    if (query.startsWith('First')) await tick();
    active--;
    if (query.startsWith('Unavailable')) throw Error('Network');
    return { songs: query.startsWith('Missing') ? [] : [song({ title: query.split(' ')[0] })] };
  });
  const progress = [], rows = ['First', 'Second', 'Missing', 'Unavailable'].map(title => row({ title }));
  const result = await api.matchImportedSongs(rows, new AbortController().signal, (...args) => progress.push(args));
  assert.equal(max, 2); assert.deepEqual(Array.from(result, item => item.title), ['First', 'Second', 'Missing', 'Unavailable']);
  assert.equal(result[0].matchedSong.title, 'First'); assert.equal(result[2].message, 'No accurate match');
  assert.equal(result[3].message, 'Search unavailable'); assert.deepEqual(progress.at(-1), [4, 2]);
});
test('cancelling import stops additional searches and discards late results', async () => {
  const controller = new AbortController(); let calls = 0, progress = 0;
  const api = matcher(async () => { calls++; controller.abort(); return { songs: [song()] }; });
  await assert.rejects(api.matchImportedSongs([row(), row(), row()], controller.signal, () => progress++), /cancel/i);
  assert.equal(calls, 1); assert.equal(progress, 0);
});
test('duplicate file rows collapse before searching while distinct versions remain separate', () => {
  const rows = matcher().dedupeImportRows([row(), row({ title: 'CHALEYA' }), row({ title: 'Chaleya - Live' })]);
  assert.equal(rows.length, 2);
});
test('Firestore playlist persists durable YouTube identity, strips signed audio and restores playable metadata', async () => {
  let stored;
  const api = load('src/lib/firestore.ts', {
    '@/lib/arrayUtils': {}, '@/services/liked-songs/likedSongFormat': format, './firebase': { db: {} },
    '@/lib/playlistMemoryCache': { setCachedPlaylist() {} },
    'firebase/firestore': { doc: (_, id) => id, serverTimestamp: () => 1,
      runTransaction: async (_, run) => run({ get: async () => ({ exists: () => true, data: () => ({ songs: [] }) }),
        update: (_, data) => { stored = data.songs; } }) },
  });
  assert.equal(await api.addSongToFirestorePlaylist('playlist', song({ audioUrl: 'https://rr1.googlevideo.com/signed' })), true);
  assert.equal(stored[0].audioUrl, ''); assert.equal(stored[0].source, 'youtube');
  assert.equal(stored[0].youtubeUrl, 'https://music.youtube.com/watch?v=abcdefghijk');
  const restored = api.firestorePlaylistToLocalSongs({ songs: stored })[0];
  assert.equal(restored.id, song().id); assert.equal(restored.youtubeVideoId, 'abcdefghijk');
  assert.equal(restored.duration, 200); assert.equal(restored.audioUrl, '');
  const old = api.firestorePlaylistToLocalSongs({ songs: [{ id: 'saavn_old', title: 'Old', audioUrl: 'https://saavn.test/old' }] })[0];
  assert.equal(old.id, 'saavn_old'); assert.equal(old.audioUrl, 'https://saavn.test/old');
});
