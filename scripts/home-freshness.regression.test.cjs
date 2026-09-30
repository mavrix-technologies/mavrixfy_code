const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/data/providers/homeFreshness.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(code, { exports: moduleObject.exports, module: moduleObject, Date });
const { isLikelyNewReleaseSong } = moduleObject.exports;

test('new release selection excludes old tracks repackaged in a current-year compilation', () => {
  assert.equal(isLikelyNewReleaseSong({ year: '2026', album: 'World Music Day 2026' }, 2026), false);
  assert.equal(isLikelyNewReleaseSong({ year: '2026', album: 'Trending Love Songs' }, 2026), false);
  assert.equal(isLikelyNewReleaseSong({ year: '2022', album: 'Awarapan 2' }, 2026), false);
  assert.equal(isLikelyNewReleaseSong({ year: '2026', album: 'Awarapan 2' }, 2026), true);
});
