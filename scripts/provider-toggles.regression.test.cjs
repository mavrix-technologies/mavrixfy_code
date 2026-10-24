const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, require: name => {
    if (!(name in deps)) throw Error(name); return deps[name];
  } });
  return module.exports;
}

test('removed provider switches cannot survive settings migration or a subsequent save', async () => {
  const keys = ['enableJioSaavn', 'enableSpotify', 'enableYouTubeMusic', 'preferJioSaavnAudio'];
  let stored = JSON.stringify({ ...Object.fromEntries(keys.map(key => [key, false])), streamingQuality: 'high', downloadWifiOnly: true });
  const storage = load('src/lib/storage.ts', {
    '@/services/audio/equalizerConfig': { FLAT_EQUALIZER: {}, normalizeEqualizer: value => value || {} },
    '@/lib/logger': { logger: { error() {} } },
    '@/lib/smartAutoplayConfig': { normalizeSmartAutoplayMode: value => value || 'similar-trending' },
    '@/utils/idleTask': {}, react: {}, 'react-native': {},
    './accountScope': { accountStorageKey: key => key, getAccountScope: () => ({}) },
    '@react-native-async-storage/async-storage': { getItem: async () => stored, setItem: async (_, value) => { stored = value; } },
  });
  const settings = await storage.getSettings();
  keys.forEach(key => assert.equal(key in settings, false));
  assert.equal(settings.streamingQuality, 'high');
  assert.equal(settings.downloadWifiOnly, true);
  await storage.saveSettings({ hapticsEnabled: true });
  keys.forEach(key => assert.equal(key in JSON.parse(stored), false));
});

test('existing playback receives permanent JioSaavn preference and retains the Low-quality bypass', async () => {
  const calls = [];
  const resolver = load('src/services/audio/PlayerPlaybackResolver.ts', {
    '@/services/youtube/YouTubeMusic': { isYouTubeSong: () => true, invalidateYouTubeStream() {},
      resolveYouTubeStream: async (...args) => { calls.push(args); return { url: 'https://media.example/audio', bitrate: 128000, codec: 'aac' }; } },
    '@/lib/accountScope': {}, '@/lib/logger': { logger: { error() {} } },
    '@/lib/downloads/downloadManager': { getLocalPlaybackUrl: async () => null },
    '@/lib/musicData': {}, '@/services/spotify/SpotifyCatalogService': { isAudioPreviewUrl: () => false },
    '@/lib/storage': { getSettings: async () => ({ streamingQuality: 'high', preferJioSaavnAudio: false, enableJioSaavn: false }), isHighQualityEntitled: () => true },
    '@/utils/timeFormatters': { toDurationSeconds: Number }, 'expo-network': {}, 'expo-file-system/legacy': {},
  });
  assert.equal((await resolver.getRequestedQualityPreference()).preferJioSaavn, true);
  const song = { id: 'youtube_abcdefghijk', source: 'youtube', title: 'Song', artist: 'Artist', duration: 180 };
  await resolver.resolvePlaybackUrlWithDetails(song, 'high');
  await resolver.resolvePlaybackUrlWithDetails(song, 'low');
  assert.equal(calls[0][2], true);
  assert.equal(calls[1][2], false);
});

test('profile removes only the provider/preference switches and keeps unrelated playback controls', () => {
  const profile = fs.readFileSync('src/features/settings/screens/ProfileScreen.tsx', 'utf8');
  const playback = fs.readFileSync('src/features/settings/components/ProfilePlaybackSection.tsx', 'utf8');
  assert.doesNotMatch(profile, /handleSourceToggle|MUSIC SOURCES|Toggle (?:JioSaavn|Spotify|YouTube)/);
  assert.doesNotMatch(playback, /Prefer higher-quality audio|preferJioSaavnAudio/);
  assert.match(playback, /Download on Wi-Fi Only/);
  assert.match(playback, /Streaming Quality/);
});
