const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('source-request Android builds use the new runtime and match the checked-in native update resource', () => {
  const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
  const nativeXml = fs.readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
  const nativeRuntime = nativeXml.match(/<string name="expo_runtime_version">([^<]+)<\/string>/)?.[1];
  assert.equal(config.android.runtimeVersion, '3.5.0-35002-sdk58-native-player4');
  assert.equal(nativeRuntime, config.android.runtimeVersion,
    'Expo updates and the actual Android binary must select the same native contract');
  assert.notEqual(config.android.runtimeVersion, config.ios.runtimeVersion);
  assert.notEqual(config.android.runtimeVersion, config.runtimeVersion);
});
