const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function notificationFixture(platform, expoGo) {
  let imports = 0, handlers = 0;
  const module = { exports: {} };
  const deps = {
    '@/constants/platform': { IS_ANDROID: platform === 'android', IS_IOS: platform === 'ios' },
    '@/lib/firebase': { db: {} }, '@/lib/logger': { logger: { error() {}, warn() {} } },
    expo: { isRunningInExpoGo: () => expoGo }, 'expo-constants': { __esModule: true, default: {} },
    'expo-device': {}, 'firebase/firestore': {},
    'react-native': { Platform: { OS: platform }, NativeModules: {} },
    '../../app.json': require('../app.json'),
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/notificationService.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, require: name => {
    if (name === 'expo-notifications') {
      imports++;
      return { setNotificationHandler() { handlers++; }, getPermissionsAsync: async () => ({ status: 'granted' }) };
    }
    if (!(name in deps)) throw Error(name); return deps[name];
  } });
  return { ...module.exports, counts: () => ({ imports, handlers }) };
}

for (const platform of ['ios', 'android']) {
  test(`${platform} Expo Go never imports the unsupported notifications module`, async () => {
    const f = notificationFixture(platform, true);
    f.ensureNotificationHandler();
    assert.equal(await f.requestNotificationPermission(), false);
    assert.deepEqual(f.counts(), { imports: 0, handlers: 0 });
  });
  test(`${platform} custom builds still initialize notifications once`, async () => {
    const f = notificationFixture(platform, false);
    assert.equal(await f.requestNotificationPermission(), true);
    assert.equal(await f.requestNotificationPermission(), true);
    assert.deepEqual(f.counts(), { imports: 1, handlers: 1 });
  });
}

test('Home worklets use closure tracking instead of ignored native dependency arrays', () => {
  for (const file of [
    'src/features/home/hooks/useHomeAnnouncement.ts',
    'src/features/home/components/HomeAnnouncementBanner.tsx',
    'src/lib/useVisibleImageAnimation.ts',
  ]) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let reactions = 0;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'useAnimatedReaction') {
        reactions++;
        assert.equal(node.arguments.length, 2, `${file} must not pass dependencies on native`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source); assert.equal(reactions, 1);
  }
});
