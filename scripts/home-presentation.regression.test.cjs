const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const moduleFixture = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/home/hooks/homePresentation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleFixture, exports: moduleFixture.exports });
const { rotateDiscovery, varyHomeRows } = moduleFixture.exports;
test('discovery windows change on refresh without mutating source arrays or item identity', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(rotateDiscovery(items, 0), items);
  assert.equal(rotateDiscovery(items, 1)[0], items[1]);
  assert.equal(rotateDiscovery(items, 4)[0], items[1]);
  assert.equal(items[0].id, 'a');
  assert.equal(rotateDiscovery([], 1).length, 0);
});
test('all discovery row types vary while ranked releases, charts and recent history retain their order', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  const rows = [
    { id: 'mix', type: 'category', category: { id: 'spotify-mixes', results: items } },
    { id: 'mood', type: 'category', category: { id: 'spotify-moods', results: items } },
    { id: 'chart', type: 'category', category: { id: 'top-charts', results: items } },
    { id: 'radio', type: 'youtube-section', section: { songs: items, playlists: items } },
    { id: 'trends', type: 'youtube-section', section: { category: 'trending', songs: items, playlists: items } },
    { id: 'new', type: 'youtube-section', section: { category: 'new-releases', songs: items, playlists: items } },
    { id: 'recently-played', type: 'recently-played' },
  ];
  const output = varyHomeRows(rows, 1);
  assert.equal(output[0].category.results[0], items[1]);
  assert.equal(output[1].category.results[0], items[1]);
  assert.equal(output[3].section.songs[0], items[1]);
  assert.equal(output[3].section.playlists[0], items[1]);
  for (const i of [2, 4, 5, 6]) assert.equal(output[i], rows[i]);
  assert.equal(rows[0].category.results[0], items[0]);
});
