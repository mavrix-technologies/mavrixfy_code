const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, setTimeout, clearTimeout, ...globals, require: name => { if (name in imports) return imports[name]; throw new Error(name); } });
  return module.exports;
}
const empty = { songs: [], artists: [], albums: [], playlists: [] };
test('clearing recents follows pending writes and stays within the selected account', async () => {
  let account = 'a';
  const disk = new Map();
  const storage = load('src/lib/storage.ts', {
    '@/services/audio/equalizerConfig': { FLAT_EQUALIZER: {} },
    '@/lib/logger': { logger: { error() { } } },
    '@/lib/smartAutoplayConfig': {},
    '@/utils/idleTask': {}, react: {}, 'react-native': {},
    './accountScope': { accountStorageKey: key => account + key, getAccountScope: () => ({ accountId: account }) },
    '@react-native-async-storage/async-storage': { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => disk.set(key, value) },
  });
  const old = storage.addSearchHistoryItem('Old search');
  const clear = storage.clearSearchHistory();
  account = 'b';
  await storage.addSearchHistoryItem('Other account');
  await Promise.all([old, clear]);
  assert.equal((await storage.getSearchHistory())[0].label, 'Other account');
  account = 'a';
  assert.equal((await storage.getSearchHistory()).length, 0);
});
test('search reducer starts with songs, clears stale rows while typing and keeps the selected tab on clear', () => {
  const f = load('src/features/search/hooks/searchEngineReducer.ts', { '@/lib/searchRepository': { EMPTY_RESULTS: empty } });
  let state = f.createInitialSearchState(''); assert.equal(state.resultFilter, 'songs');
  state = f.searchScreenReducer(state, { type: 'SEARCH_SUCCESS', results: { ...empty, songs: [{ id: 'old' }] }, displayQuery: 'old' });
  state = f.searchScreenReducer(state, { type: 'SET_QUERY', query: 'a' });
  assert.equal(state.results.songs.length, 0); assert.equal(state.suggestionsOpen, true);
  state = f.searchScreenReducer(state, { type: 'SET_RESULT_FILTER', filter: 'albums' });
  assert.equal(state.suggestionsOpen, false); assert.equal(state.searchLoading, true);
  state = f.searchScreenReducer(state, { type: 'CLEAR_SEARCH' });
  assert.equal(state.resultFilter, 'albums'); assert.equal(state.searchLoading, false);
});
test('search merges available catalogs and aborts before dispatching new work', async () => {
  const calls = [], endpoints = []; let suggestionEndpoint;
  const song = { id: 'catalog', title: 'Catalog Song', artist: 'Artist' };
  const f = load('src/lib/searchRepository.ts', {
    '@/services/spotify/SpotifyCatalogService': {
      searchLiveITunesSongs: async () => [{ id: 'sp_track', title: 'Featured Song', artist: 'Artist' }],
      searchSpotifyPlaylists: () => [], generateDynamicSpotifyPlaylists: () => [], SPOTIFY_PRESETS: [], SPOTIFY_PODCASTS: []
    },
    '@/lib/api-config': { fetchAppApi: async path => { endpoints.push(path); return { ok: true, json: async () => ({ data: { results: path.startsWith('/search/songs') ? [song] : [] } }) }; } },
    '@/lib/musicData': { convertJioSaavnSong: s => s }, '@/lib/musicLanguages': load('src/lib/musicLanguages.ts'), '@/utils/timeFormatters': {},
    '@/services/youtube/YouTubeMusic': { searchYouTubeMusic: async (...args) => { calls.push(args); return { ...empty, songs: [{ id: 'youtube_abcdefghijk', title: 'Music Song', artist: 'Artist' }] }; } },
    '@/utils/asyncUtils': { fetchJsonStrict: async (...args) => { suggestionEndpoint = args; return ['ab', ['ab', 'abc']]; } }
  });
  const result = await f.searchRepository(' ab ', 'songs');
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'ab'); assert.equal(calls[0][1], 'songs');
  assert.deepEqual(Array.from(result.songs, s => s.id).sort(), ['catalog', 'sp_track', 'youtube_abcdefghijk']);
  assert.ok(endpoints.some(path => path.startsWith('/spotify/search') && path.includes('country=IN'))); assert.ok(endpoints.some(path => path.startsWith('/search/songs') && path.includes('country=IN')));
  const controller = new AbortController(); controller.abort(); await assert.rejects(f.searchRepository('ab', 'songs', controller.signal), /cancelled/);
  await f.searchRepository('   ', 'songs'); assert.equal(calls.length, 1);
  assert.equal((await f.fetchYouTubeSuggestions('ab')).join(), 'ab,abc'); assert.match(suggestionEndpoint[0], /ds=yt&gl=IN&hl=en/); assert.equal(suggestionEndpoint[2], 4000);
});

test('home restores the artists row once while keeping Quick Picks first', () => {
  const { buildHomeSections } = load('src/features/home/hooks/buildHomeSections.ts');
  const result = buildHomeSections('All', true, [], [{ id: 'artists', type: 'artists' }, { id: 'break', type: 'category' }]);
  assert.equal(result[0].type, 'youtube-quick-picks'); assert.equal(result.filter(row => row.type === 'artists').length, 1);
  assert.equal(result.filter(row => row.type === 'category').length, 1);
});

// Small hook harness exercises timers and request races without a device or network.
function engineFixture() {
  let slots = [], cursor = 0, pending = [], dirty = false, value, now = 0, serial = 0; const timers = new Map(), requests = [], suggestions = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }]; },
    useReducer(reducer, arg, init) { const i = cursor++; if (!(i in slots)) slots[i] = init(arg); return [slots[i], action => { slots[i] = reducer(slots[i], action); dirty = true; }]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; pending.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } }
  };
  // Destructured hook functions must retain access to the harness.
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  const reducer = load('src/features/search/hooks/searchEngineReducer.ts', { '@/lib/searchRepository': { EMPTY_RESULTS: empty } });
  const noop = () => { }; const scroll = { handleHeaderScroll: noop, resetHeaderElevation: noop }; const push = noop, play = noop;
  const imports = {
    react, 'expo-router': { useRouter: () => ({ push }), useFocusEffect: noop }, 'react-native': { Platform: { OS: 'android' }, Keyboard: { dismiss: noop } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) }, '@/components/AppTopHeader': { useAppTopHeaderScrollElevation: () => scroll },
    '@/contexts/NetworkContext': { useNetwork: () => ({ isOnline: true }), useOnReconnect: noop }, '@/contexts/PlayerContext': { usePlayerRowActions: () => ({ playSong: play }) },
    '@/lib/musicData': {}, '@/lib/searchUtils': { normalizeText: s => s.toLowerCase() }, '@/services/youtube/YouTubeMusic': { clearYouTubeSearchCache: noop },
    '@/lib/storage': { addSearchHistoryItem: async () => [] }, '../types': { getRouteSearchQuery: () => '', normalizeRecentSearchLabel: s => s.trim(), normalizeSearchSuggestionList: s => s, STITCH_BROWSE_CATEGORIES: [], toRecentSearchItems: s => s },
    './searchEngineReducer': reducer, '@/lib/searchRepository': { searchRepository: (q, filter, signal, onPartial) => new Promise(resolve => requests.push({ q, filter, signal, onPartial, resolve })), fetchYouTubeSuggestions: (q, signal) => new Promise(resolve => suggestions.push({ q, signal, resolve })) }
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/features/search/hooks/useSearchEngine.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, AbortController, require: n => { if (n in imports) return imports[n]; throw new Error(n); },
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id)
  });
  function render() { let count = 0; do { dirty = false; cursor = 0; value = module.exports.useSearchEngine({}); const work = pending; pending = []; work.forEach(fn => fn()); if (++count > 20) throw new Error('render loop'); } while (dirty); return value; }
  return { render, requests, suggestions, advance(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } return render(); }, async settle() { await new Promise(resolve => setImmediate(resolve)); return render(); } };
}
test('search debounces, rejects stale responses and restarts after rapid tab reversal', async () => {
  const f = engineFixture(); f.render().handleChangeText('cha'); f.render(); f.advance(119); assert.equal(f.suggestions.length, 0);
  f.advance(1); assert.equal(f.suggestions.length, 1); assert.equal(f.requests.length, 0);
  f.advance(99); assert.equal(f.requests.length, 0); f.advance(1); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].filter, 'songs');
  f.render().handleChangeText('chaleya'); f.render(); assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].resolve({ ...empty, songs: [{ id: 'stale' }] }); assert.equal((await f.settle()).songResults.length, 0);
  f.advance(400); assert.equal(f.requests.length, 2);
  f.render().handleResultFilterSelect('albums'); f.render();
  f.render().handleResultFilterSelect('songs'); f.render(); f.advance(0);
  assert.equal(f.requests.length, 3); assert.equal(f.requests[2].filter, 'songs');
  f.requests[2].resolve({ ...empty, songs: [{ id: 'fresh' }] }); assert.equal((await f.settle()).songResults[0].id, 'fresh');
  f.render().handleClear(); f.render(); f.advance(500); assert.equal(f.render().songResults.length, 0);
});

test('submit searches immediately and a late autocomplete response cannot reopen suggestions', async () => {
  const f = engineFixture(); f.render().handleChangeText('chaleya'); f.render(); f.advance(120);
  f.render().handleSubmitSearch(); f.render(); assert.equal(f.requests.length, 1);
  f.suggestions[0].resolve(['chaleya song']); await f.settle();
  assert.equal(f.render().suggestionsOpen, false); f.advance(400); assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ ...empty, songs: [{ id: 'played' }] }); assert.equal((await f.settle()).songResults[0].id, 'played');
});

test('search tab pager utilities map filters cleanly, clamp swipe bounds, and build accessible labels', () => {
  const u = load('src/features/search/components/searchTabPagerUtils.ts', {
    '../types': { RESULT_FILTERS: [{ key: 'songs', label: 'Songs' }, { key: 'artists', label: 'Artists' }, { key: 'albums', label: 'Albums' }, { key: 'playlists', label: 'Playlists' }] },
  });
  assert.deepEqual(u.SEARCH_TAB_FILTERS, ['songs', 'artists', 'albums', 'playlists']);
  assert.equal(u.getSearchTabIndex('songs'), 0);
  assert.equal(u.getSearchTabIndex('artists'), 1);
  assert.equal(u.getSearchTabIndex('albums'), 2);
  assert.equal(u.getSearchTabIndex('playlists'), 3);
  assert.equal(u.getSearchTabIndex('all'), 0);
  assert.equal(u.getSearchTabFilter(-2), 'songs');
  assert.equal(u.getSearchTabFilter(1.6), 'albums');
  assert.equal(u.getSearchTabFilter(9), 'playlists');
  assert.equal(u.resolveSettledPageIndex(390, 400), 1);
  assert.equal(u.resolveSettledPageIndex(-50, 400), 0);
  assert.equal(u.resolveSettledPageIndex(2000, 400), 3);
  assert.equal(u.resolveSettledPageIndex(100, 0), 0);
  assert.equal(u.buildSearchRowAccessibilityLabel('artists', 'Arijit Singh', 'Artist'), 'Arijit Singh, Artist');
  assert.equal(u.buildSearchRowAccessibilityLabel('albums', 'Rockstar', 'A.R. Rahman • 2011'), 'Rockstar, Album, A.R. Rahman • 2011');
  assert.equal(u.buildSearchRowAccessibilityLabel('playlists', 'Top Hits', 'Curated'), 'Top Hits, Playlist, Curated');
});

test('a matching catalog entity leads suggestions even if autocomplete returns no queries', async () => {
  const f = engineFixture();
  f.render().handleChangeText('chaleya'); f.render(); f.advance(400);
  f.suggestions[0].resolve([]);
  f.requests[0].resolve({ ...empty, songs: [{ id: 'track', title: 'Chaleya' }] });
  const result = await f.settle();
  assert.equal(result.suggestionsOpen, true);
  assert.equal(result.suggestionRows[0].kind, 'song');
  assert.equal(result.suggestionRows[0].song.id, 'track');
  result.handleChangeText('other'); f.render();
  assert.equal(f.render().suggestionRows.length, 0);
});

function repositoryFixture() {
  const timers = new Map(); let serial = 0, slowResolve, signal, ytCalls = 0;
  const partials = [];
  const repo = load('src/lib/searchRepository.ts', {
    '@/services/spotify/SpotifyCatalogService': {
      searchLiveITunesSongs: async () => [{ id: 'fast', title: 'Fast song', artist: 'Artist' }],
      searchSpotifyPlaylists: () => [], generateDynamicSpotifyPlaylists: () => [], SPOTIFY_PRESETS: [], SPOTIFY_PODCASTS: [],
    },
    '@/lib/api-config': { fetchAppApi: async () => ({ ok: false }) },
    '@/lib/musicData': { convertJioSaavnSong: s => s }, '@/lib/musicLanguages': load('src/lib/musicLanguages.ts'), '@/utils/timeFormatters': {}, '@/utils/asyncUtils': {},
    '@/services/youtube/YouTubeMusic': { searchYouTubeMusic: (_q, _filter, s) => { signal = s; ytCalls++; return new Promise(resolve => { slowResolve = resolve; }); } },
  }, { setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  return { repo, partials, timers, get signal() { return signal; }, get calls() { return ytCalls; }, resolve: r => slowResolve(r) };
}

test('fast catalog rows publish before a slow provider; completed searches are cached', async () => {
  const f = repositoryFixture(); let done = false;
  const pending = f.repo.searchRepository('test', 'songs', undefined, r => f.partials.push(r)).then(r => { done = true; return r; });
  await new Promise(setImmediate);
  assert.equal(done, false); assert.equal(f.partials.at(-1).songs[0].id, 'fast');
  const firstSnapshot = f.partials.at(-1);
  f.resolve({ ...empty, songs: [{ id: 'slow', title: 'Slow song', artist: 'Artist' }] });
  const result = await pending; assert.equal(result.songs.length, 2); assert.equal(firstSnapshot.songs.length, 1);
  const cached = await f.repo.searchRepository(' TEST ', 'songs'); assert.equal(cached, result); assert.equal(f.calls, 1);
  f.repo.clearSearchRepositoryCache();
  const controller = new AbortController(); const next = f.repo.searchRepository('test', 'songs', controller.signal);
  controller.abort(); await assert.rejects(next, /cancelled/); assert.equal(f.calls, 2); assert.equal(f.timers.size, 0);
});

test('search budget releases loading even when a provider ignores cancellation', async () => {
  const f = repositoryFixture(); const pending = f.repo.searchRepository('bounded', 'songs', undefined, r => f.partials.push(r));
  await new Promise(setImmediate);
  assert.equal(f.partials.at(-1).songs.length, 1);
  [...f.timers.values()].find(t => t.ms === 6000).fn();
  const result = await pending; assert.equal(result.songs.length, 1); assert.equal(f.signal.aborted, true);
  const count = f.partials.length;
  f.resolve({ ...empty, songs: [{ id: 'late', title: 'Late song', artist: 'Artist' }] }); await new Promise(setImmediate);
  assert.equal(f.partials.length, count); assert.equal(result.songs.length, 1); assert.equal(f.timers.size, 0);
});

test('partial rows appear while loading and stale partial callbacks cannot replace a new query', async () => {
  const f = engineFixture(); f.render().handleChangeText('first'); f.render(); f.advance(220);
  f.requests[0].onPartial({ ...empty, songs: [{ id: 'fast' }] }); let state = f.render();
  assert.equal(state.songResults[0].id, 'fast'); assert.equal(state.searchLoading, true);
  state.handleChangeText('second'); f.render();
  f.requests[0].onPartial({ ...empty, songs: [{ id: 'stale' }] }); assert.equal(f.render().songResults.length, 0);
});

test('cancelled API calls never retry or leak attempt timers', async () => {
  let calls = 0; const timers = new Set();
  const api = load('src/lib/api-config.ts', {
    'expo-constants': { expoConfig: {} }, 'react-native': { Platform: { OS: 'ios' } }, '@/lib/logger': { logger: { warn() { } } },
    './apiUrlPolicy': { normalizeApiUrl: s => s },
  }, {
    __DEV__: true, process: { env: { EXPO_PUBLIC_APP_API_URL: 'https://primary.example' } }, URL,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: id => timers.delete(id),
    fetch: (_url, init) => { calls++; return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))); },
  });
  const controller = new AbortController(); const request = api.fetchAppApi('/search', { signal: controller.signal });
  controller.abort(); await assert.rejects(request); assert.equal(calls, 1); assert.equal(timers.size, 0);
});

test('music language ranking applies India bias and user-selected languages across all categories and suggestions', async () => {
  const langs = load('src/lib/musicLanguages.ts');
  assert.deepEqual([...langs.normalizeMusicLanguages(['Tamil', 'INVALID', 'english', 'tamil'])], ['tamil', 'english']);
  assert.deepEqual([...langs.normalizeMusicLanguages([])], ['hindi', 'punjabi']);
  assert.match(langs.buildAcceptLanguageHeader(['tamil', 'hindi']), /^en-IN,ta-IN;q=0\.95,hi-IN;q=0\.9/);

  const musicLanguages = langs;
  const repo = load('src/lib/searchRepository.ts', {
    '@/services/spotify/SpotifyCatalogService': {
      searchLiveITunesSongs: async () => [
        { id: 'sp_en', title: 'Love Story', artist: 'Taylor', language: 'english', genre: 'Pop' },
        { id: 'sp_ta', title: 'Love Story Tamil', artist: 'Anirudh India', language: 'tamil', genre: 'Tamil' },
      ],
      searchLiveITunesAlbums: async () => [
        { id: 'alb_en', name: 'Love Hits', artist: 'Global', image: [], songCount: 10, language: 'english' },
        { id: 'alb_ta', name: 'Love Hits India', artist: 'Anirudh', image: [], songCount: 12, language: 'tamil' },
      ],
      searchLiveITunesArtists: async () => [
        { id: 'art_en', name: 'Love Artist', image: [], dominantLanguage: 'english' },
        { id: 'art_ta', name: 'Love Artist Tamil', image: [], subtitle: 'India · Tamil', dominantLanguage: 'tamil' },
      ],
      searchSpotifyPlaylists: () => [
        { id: 'pl_1', name: 'Love Vibes', image: [], songCount: 30, description: 'Global mood', language: 'english' },
        { id: 'pl_2', name: 'Tamil Love Hits', image: [], songCount: 40, description: 'India Tamil', language: 'tamil' },
      ],
      enrichSpotifyPlaylistArtwork: async (items) => items,
      SPOTIFY_PRESETS: [],
      SPOTIFY_PODCASTS: [],
    },
    '@/lib/api-config': { fetchAppApi: async () => ({ ok: false }) },
    '@/lib/musicData': { convertJioSaavnSong: (s) => s },
    '@/lib/musicLanguages': musicLanguages,
    '@/utils/timeFormatters': {},
    '@/utils/asyncUtils': { fetchJsonStrict: async () => null },
    '@/services/youtube/YouTubeMusic': { searchYouTubeMusic: async () => empty },
  });

  const res = await repo.searchRepository('love', 'all', undefined, undefined, { preferredLanguages: ['tamil'] });
  assert.equal(res.songs[0].id, 'sp_ta');
  assert.equal(res.albums[0].id, 'alb_ta');
  assert.equal(res.artists[0].id, 'art_ta');
  assert.equal(res.playlists[0].id, 'pl_2');

  // All filter warms tab-specific caches cleanly
  const cachedSongs = await repo.searchRepository('love', 'songs', undefined, undefined, { preferredLanguages: ['tamil'] });
  assert.equal(cachedSongs.songs[0].id, 'sp_ta');
  assert.equal(cachedSongs.artists.length, 0);

  // buildHomeSections allows selected regional sections while excluding unselected ones
  const { buildHomeSections } = load('src/features/home/hooks/buildHomeSections.ts');
  const tamilSection = { id: 'youtube-regional-tamil', title: 'Tamil Trending', songs: [], playlists: [{ id: 'p1', name: 'Tamil Hits', coverUrl: '', songCount: 10, url: '', description: '', source: 'youtube' }] };
  const bhojpuriSection = { id: 'youtube-regional-bhojpuri', title: 'Bhojpuri Hits', songs: [], playlists: [{ id: 'p2', name: 'Bhojpuri', coverUrl: '', songCount: 10, url: '', description: '', source: 'youtube' }] };
  const rows = buildHomeSections('All', true, [], [], [tamilSection, bhojpuriSection], false, ['hindi', 'tamil']);
  assert.ok(rows.some((r) => r.id === tamilSection.id));
  assert.ok(!rows.some((r) => r.id === bhojpuriSection.id));
});

test('suggestionRows surface songs, artists, albums, and playlists together', async () => {
  const f = engineFixture();
  f.render().handleChangeText('arijit'); f.render(); f.advance(400);
  f.suggestions[0].resolve(['arijit singh songs']);
  f.requests[0].resolve({
    songs: [{ id: 's1', title: 'Arijit Mashup', artist: 'Arijit Singh' }],
    artists: [{ id: 'ar1', name: 'Arijit Singh', image: [] }],
    albums: [{ id: 'al1', name: 'Arijit Live', image: [], songCount: 8 }],
    playlists: [{ id: 'pl1', name: 'This Is Arijit Singh', image: [], songCount: 50 }],
  });
  const result = await f.settle();
  const kinds = new Set(result.suggestionRows.map((row) => row.kind));
  assert.ok(kinds.has('song'));
  assert.ok(kinds.has('artist'));
  assert.ok(kinds.has('album'));
  assert.ok(kinds.has('playlist'));
  assert.ok(kinds.has('query'));
});
