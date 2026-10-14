const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const react = { memo: fn => fn, useState: value => [typeof value === 'function' ? value() : value, () => {}],
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { create: value => value, absoluteFillObject: {} }, Platform: { OS: 'ios', Version: '18' } };
function load(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { React: react, module, exports: module.exports, require: function resolveTestDependency(name) { if (name.startsWith("@expo/vector-icons/")) return { __esModule: true, default: resolveTestDependency("@expo/vector-icons")[name.split("/").pop()] };

    if (!(name in deps)) throw Error(`Missing dependency ${name}`); return deps[name];

} });
  return module.exports;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}

test('playback status distinguishes buffering, reconnecting and verification failures', () => {
  const { playbackStatusLabel: label } = load('src/services/audio/playbackStatusLabel.ts', {});
  assert.equal(label({}), null);
  assert.equal(label({ isLoading: true }), 'Loading…');
  assert.equal(label({ isBuffering: true }), 'Buffering…');
  assert.equal(label({ isBuffering: true, isReconnecting: true }), 'Reconnecting…');
  assert.match(label({ error: 'LOGIN_REQUIRED', isReconnecting: true }), /Verification required/);
  assert.match(label({ error: 'Network failure' }), /tap Play to retry/);
});

test('quality UI reports source bitrate, never the requested tier as measured bitrate', () => {
  let status = null;
  const quality = { requested: 'high', actualBitrate: 128, qualityLabel: '128kbps', codec: 'aac' };
  const { PlaybackInfo } = load('src/features/player/components/PlaybackInfo.tsx', {
    react, 'react-native': native, '@/contexts/PlayerContextDefs': { usePlayerActions: () => ({ playbackQuality: quality }) },
    '@/services/audio/PlaybackEngine': { usePlaybackEngineSelector: () => status },
    '@/services/audio/playbackStatusLabel': load('src/services/audio/playbackStatusLabel.ts', {}),
  });
  const text = () => nodes(PlaybackInfo({})).filter(node => node.type === 'Text').map(node => node.props.children[0]);
  assert.deepEqual(text(), ['High requested · AAC · 128 kbps']);
  status = 'Loading…'; assert.deepEqual(text(), ['Loading…']);
  assert.match(PlaybackInfo({}).props.accessibilityLabel, /High requested · bitrate unavailable/);
  status = null; quality.actualBitrate = 0; quality.codec = undefined;
  assert.deepEqual(text(), ['High requested · bitrate unavailable']);
  quality.qualityLabel = 'Offline'; quality.actualBitrate = 192;
  assert.deepEqual(text(), ['Offline · 192 kbps']);
  quality.codec = 'opus'; status = 'Buffering…';
  assert.match(PlaybackInfo({}).props.accessibilityLabel, /Offline · OPUS · 192 kbps/);
});

test('iOS Expo output picker remains available without the custom playback module', () => {
  for (const expoGo of [true, false]) {
    let nativeLookups = 0, touched = 0;
    const { AudioOutputPicker } = load('src/features/player/components/AudioOutputPicker.tsx', {
      react, 'react-native': native, expo: { isRunningInExpoGo: () => expoGo },
      'expo-video': { VideoAirPlayButton: 'ExpoAirPlay' },
      'expo-modules-core': { requireOptionalNativeModule: () => { nativeLookups++; return null; } },
      '@expo/vector-icons': {}, '@/utils/globalToast': {},
    });
    const tree = AudioOutputPicker({ label: true, onTouchActivity: () => touched++ });
    const button = nodes(tree).find(node => node.type === 'ExpoAirPlay');
    assert.ok(button); assert.equal(button.props.prioritizeVideoDevices, false);
    button.props.onBeginPresentingRoutes(); assert.equal(touched, 1);
    assert.equal(nativeLookups, 0);
  }
});

test('Android uses the system output switcher on API 34 and Bluetooth settings on older versions', async () => {
  for (const version of [34, 30]) {
    const calls = [];
    const { AudioOutputPicker } = load('src/features/player/components/AudioOutputPicker.tsx', {
      react, 'expo-video': { VideoAirPlayButton: 'ExpoAirPlay' }, 'react-native': { ...native, Platform: { OS: 'android', Version: version },
        Linking: { sendIntent: async action => calls.push(action) } },
      expo: { isRunningInExpoGo: () => false },
      'expo-modules-core': { requireOptionalNativeModule: () => ({ showAudioOutputPicker: async () => { calls.push('system'); return true; } }) },
      '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' }, '@/utils/globalToast': { showGlobalToast: () => {} },
    });
    const button = nodes(AudioOutputPicker({})).find(node => node.type === 'Pressable');
    assert.match(button.props.accessibilityLabel, version === 34 ? /audio output/ : /Bluetooth/);
    button.props.onPress(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [version === 34 ? 'system' : 'android.settings.BLUETOOTH_SETTINGS']);
  }
});

test('embedded StandBy timer uses the shared timer and returns after setting or cancelling it', () => {
  const calls = [];
  const Picker = 'Picker';
  const { default: Timer } = load('src/features/player/components/QueueSleepTimer.tsx', {
    react, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@react-native-picker/picker': { Picker }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/constants/colors': { primary: '#0f0' }, '@/contexts/PlayerContext': { usePlayerActions: () => ({
      sleepTimer: { label: '30 min', endsAt: null, mode: 'end-of-stack' },
      setSleepTimer: value => calls.push(value), clearSleepTimer: () => calls.push('clear'),
    }) },
    '@/services/audio/sleepTimerDuration': { MAX_SLEEP_TIMER_MINUTES: 1439, isValidSleepTimerDuration: () => true,
      formatSleepTimerDuration: value => `${value} min` },
  });
  const tree = Timer({ embedded: true, onBack: () => calls.push('back') });
  assert.equal(nodes(tree).some(node => node.props.accessibilityLabel === 'Back to queue'), false);
  nodes(tree).find(node => node.type === 'Pressable' && nodes(node).some(child => child.props.children?.[0] === 'End of queue')).props.onPress();
  nodes(tree).find(node => node.props.accessibilityLabel === 'Turn off sleep timer').props.onPress();
  assert.deepEqual(calls, ['end-of-stack', 'back', 'clear', 'back']);
});
