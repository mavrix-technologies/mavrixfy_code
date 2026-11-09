const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => {
    if (!(name in dependencies)) throw Error(`Unexpected import: ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}
const policy = load('src/services/youtube/YouTubeRecommendationPolicy.ts');
const song = (id, title = id, artist = 'Artist', duration = 180) => ({ id: `youtube_${id}`, source: 'youtube', title, artist, duration });
const ids = songs => Array.from(songs, item => item.id.replace(/^youtube_/, '')).join(',');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const account = { accountId: 'a', generation: 1 };
  const accountApi = { getAccountScope: () => ({ ...account }), isCurrentAccount: scope => scope.accountId === account.accountId && scope.generation === account.generation };
  let radio = async () => [];
  let home = async () => ({ songs: [], playlists: [], sections: [] });
  let previews = async () => [];
  const calls = [];
  const youtube = {
    isYouTubeSong: item => item.source === 'youtube' || item.id.startsWith('youtube_'),
    relatedYouTubeSongs: (...args) => { calls.push(args[0].id); return radio(...args); },
    loadYouTubeHome: (...args) => home(...args), previewYouTubePlaylist: (...args) => previews(...args),
  };
  const feed = load('src/services/youtube/YouTubeHomeRecommendations.ts', {
    './YouTubeMusic': youtube, '@/lib/accountScope': accountApi, './YouTubeRecommendationPolicy': policy,
  });
  const autoplay = load('src/services/audio/smartAutoplayService.ts', {
    '@/lib/api-config': { getApiUrl: () => 'https://catalog.test' },
    '@/services/youtube/YouTubeMusic': youtube,
    '@/services/youtube/YouTubeRecommendationPolicy': policy,
    '@/lib/accountScope': accountApi,
    '@/lib/searchRepository': { parseApiSong: item => item },
    '@/lib/searchUtils': { deduplicateSongs: items => [...new Map(items.map(item => [item.id, item])).values()] },
    '@/lib/storage': { getSettings: async () => ({ smartAutoplayMode: 'similar-only' }) },
    '@/utils/asyncUtils': { fetchJson: async () => { throw Error('Unexpected catalog request'); } },
  });
  return { ...feed, ...autoplay, calls, account, radio: fn => { radio = fn; }, home: fn => { home = fn; }, previews: fn => { previews = fn; } };
}

test('radio seed selection prefers four recent distinct artists and keeps request budget bounded', () => {
  const seeds = [song('a', 'A', 'One'), song('a'), song('b', 'B', 'One'), song('c', 'C', 'Two'), song('d', 'D', 'Three'), song('e', 'E', 'Four'), song('f', 'F', 'Five')];
  assert.equal(ids(policy.selectYouTubeRadioSeeds(seeds)), 'a,c,d,e');
  assert.equal(ids(policy.selectYouTubeRadioSeeds([seeds[0], seeds[2]])), 'a,b');
  assert.equal(policy.selectYouTubeRadioSeeds(seeds, 100).length, 4);
  assert.equal(policy.selectYouTubeRadioSeeds(seeds, -1).length, 0);
  assert.equal(ids(policy.selectYouTubeRadioSeeds([song('one', 'One'), song('copy', 'One [Official Audio]', 'Artist', 181), song('live', 'One (Live)')])), 'one,live');
});

test('one oversized radio does not starve other seeds and each provider order is preserved', async () => {
  const f = fixture();
  f.radio(async seed => seed.id === 'youtube_seed-a'
    ? Array.from({ length: 30 }, (_, i) => song(`a${i}`, `A${i}`, `Artist ${i}`))
    : [song('b0', 'B0', 'Other 0'), song('b1', 'B1', 'Other 1')]);
  const feed = await f.getYouTubeHomeRecommendations([song('seed-a', 'Seed A', 'A'), song('seed-b', 'Seed B', 'B')], new AbortController().signal);
  assert.equal(ids(feed.songs.slice(0, 6)), 'a0,b0,a1,b1,a2,a3');
  assert.equal(feed.songs.length, 24);
});

test('home and autoplay reject duplicate recording uploads without collapsing live/remix or Unicode songs', async () => {
  const seed = song('seed', 'One', 'Singer');
  const candidates = [seed, song('upload', 'One (Official Audio)', 'Singer', 181),
    song('live', 'One (Live)', 'Singer', 180), song('remix', 'One - Remix', 'Singer', 180),
    song('hindi-one', 'तुम ही हो', 'गायक'), song('hindi-two', 'तेरा नाम', 'गायक'),
    song('other-singer', 'One', 'Different Singer'), song('unknown-length', 'One', 'Singer', 0)];
  const f = fixture(); f.radio(async () => candidates);
  const result = await f.fetchAutoplayRecommendations({ seedSong: seed, currentQueue: [], limit: 20 });
  assert.equal(result.some(item => item.id === 'youtube_seed' || item.id === 'youtube_upload'), false);
  for (const id of ['live', 'remix', 'hindi-one', 'hindi-two', 'other-singer', 'unknown-length'])
    assert.equal(result.some(item => item.id === `youtube_${id}`), true, `${id} was incorrectly collapsed`);
  assert.equal(ids(f.rankYouTubeRecommendations(candidates, [seed], 20)), ids(result));
});

test('duplicate IDs, display-only labels, and alias video identities are filtered against the queue', async () => {
  const f = fixture();
  const queued = song('queued', 'Stay [Official Video]', 'Singer');
  f.radio(async () => [song('queued'), song('copy', 'Stay', 'Singer', 181),
    { ...song('alias'), youtubeVideoId: 'queued' }, song('new', 'Different', 'Other'), song('new', 'Different', 'Other')]);
  assert.equal(ids(await f.fetchAutoplayRecommendations({ seedSong: song('seed'), currentQueue: [queued] })), 'new');
});

test('unknown artists do not all share one artist quota', () => {
  const candidates = [song('a', 'A', ''), song('b', 'B', 'Unknown Artist'), song('c', 'C', ''), song('d', 'D', 'Known')];
  assert.equal(ids(policy.rankYouTubeCandidates(candidates, [], 3)), 'a,b,c');
});

test('autoplay recent-candidate fallback is bounded to the current account', async () => {
  const f = fixture(), seed = song('seed');
  f.radio(async () => [song('a', 'A', 'A'), song('b', 'B', 'B')]);
  assert.equal(ids(await f.fetchAutoplayRecommendations({ seedSong: seed, limit: 1 })), 'a');
  assert.equal(ids(await f.fetchAutoplayRecommendations({ seedSong: seed, limit: 1 })), 'b');
  // Previously suggested tracks are deferred, not permanently blacklisted.
  assert.equal(ids(await f.fetchAutoplayRecommendations({ seedSong: seed, limit: 1 })), 'a');
  f.account.accountId = 'b'; f.account.generation++;
  assert.equal(ids(await f.fetchAutoplayRecommendations({ seedSong: seed, limit: 1 })), 'a');
});

test('stale autoplay response cannot publish or poison the next account recent memory', async () => {
  const f = fixture(); let finish;
  f.radio(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.fetchAutoplayRecommendations({ seedSong: song('seed') });
  f.account.accountId = 'b'; f.account.generation++;
  finish([song('a', 'A', 'A')]);
  await assert.rejects(pending, /cancelled/);
  f.radio(async () => [song('a', 'A', 'A'), song('b', 'B', 'B')]);
  assert.equal(ids(await f.fetchAutoplayRecommendations({ seedSong: song('seed'), limit: 1 })), 'a');
});

test('home account switch suppresses late partial shelves and final results', async () => {
  const f = fixture(); let finish, publish;
  const partials = [];
  f.home((_signal, onPartial) => { publish = onPartial; return new Promise(resolve => { finish = resolve; }); });
  const pending = f.getYouTubeHomeRecommendations([], new AbortController().signal, item => partials.push(item));
  await tick(); f.account.accountId = 'b'; f.account.generation++;
  const shelf = { songs: [song('a')], playlists: [], sections: [{ id: 'shelf', songs: [song('a')], playlists: [] }] };
  publish(shelf); finish(shelf);
  await assert.rejects(pending, /cancelled/);
  assert.equal(partials.length, 0);
});

test('pre-cancelled home/autoplay and zero-limit autoplay do no provider work', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.getYouTubeHomeRecommendations([song('seed')], controller.signal), /cancelled/);
  await assert.rejects(f.fetchAutoplayRecommendations({ seedSong: song('seed'), signal: controller.signal }), /cancelled/);
  assert.equal(ids(await f.fetchAutoplayRecommendations({ seedSong: song('seed'), limit: 0 })), '');
  assert.equal(f.calls.length, 0);
});

test('radio responses containing only excluded seeds do not claim personalized recommendations', async () => {
  const f = fixture(); const seed = song('seed');
  f.radio(async () => [seed]); f.home(async () => ({ songs: [song('home')], playlists: [], sections: [] }));
  const feed = await f.getYouTubeHomeRecommendations([seed], new AbortController().signal);
  assert.equal(feed.personalized, false);
  assert.equal(feed.sections.some(section => section.id === 'youtube-for-you'), false);
});
