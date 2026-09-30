const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/audio/equalizerDsp.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const dsp = { exports: {} };
vm.runInNewContext(code, { exports: dsp.exports, module: dsp });
const { calculateEqHeadroomDb, calculateSpatialHeadroomDb, calculateSpatialPan } = dsp.exports;

test('flat EQ preserves the original level', () => {
  assert.equal(calculateEqHeadroomDb([0, 0, 0, 0, 0, 0], 44100), 0);
});

test('headroom covers a boosted band and overlapping boosted bands', () => {
  const single = calculateEqHeadroomDb([0, 0, 6, 0, 0, 0], 44100);
  const adjacent = calculateEqHeadroomDb([0, 6, 6, 0, 0, 0], 44100);
  assert.ok(single >= 6 && single < 7, `single band headroom: ${single}`);
  assert.ok(adjacent > single, `adjacent headroom: ${adjacent}`);
});

test('spatial movement stays subtle and keeps summing headroom', () => {
  const peakAt = 3000 * Math.PI;
  assert.equal(calculateSpatialPan(0, 350), 0);
  assert.ok(Math.abs(calculateSpatialPan(peakAt, 350) - 0.042) < 0.000001);
  assert.ok(Math.abs(calculateSpatialPan(peakAt, 1000)) <= 0.12);
  assert.ok(calculateSpatialHeadroomDb(1000) > 1);
  assert.ok(calculateSpatialHeadroomDb(1000) < 2);
});
