const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function fixture(error) {
  const module = { exports: {} }, warnings = [];
  const dependencies = {
    '@/lib/accountScope': {}, '@/lib/firebase': { __esModule: true, default: {}, auth: { currentUser: { uid: 'user' } } },
    '@/lib/logger': { logger: { warn: (...args) => warnings.push(args) } },
    'firebase/firestore': {},
    'firebase/functions': { getFunctions: () => ({}), httpsCallable: () => async () => { throw error; } },
    './deviceInfo': { getDeviceId: async () => 'device' }, './downloadStore': {},
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/downloads/licenseSync.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, Date, require: name => {
    if (!(name in dependencies)) throw new Error(`Unmocked dependency ${name}`);
    return dependencies[name];
  } });
  return { ...module.exports, warnings };
}

for (const prefix of ['', 'functions/']) {
  for (const code of ['permission-denied', 'resource-exhausted', 'unauthenticated']) {
    test(`offline license ${prefix + code} rejects the original denial without issuing a local license`, async () => {
      const denied = Object.assign(new Error('Server denied download'), { code: prefix + code });
      const f = fixture(denied);
      await assert.rejects(f.issueOfflineLicense('user', 'song', 'high'), error => error === denied);
      assert.equal(f.warnings.length, 0);
    });
  }
}

test('unavailable offline-license server retains the existing local grace policy', async () => {
  const f = fixture(Object.assign(new Error('Function unavailable'), { code: 'functions/not-found' }));
  const license = await f.issueOfflineLicense('user', 'song', 'medium');
  assert.equal(license.status, 'active');
  assert.equal(license.songId, 'song');
  assert.equal(license.quality, 'medium');
  assert.ok(Date.parse(license.expiresAt) > Date.now() + 29 * 86400000);
  assert.equal(f.warnings.length, 1);
});
