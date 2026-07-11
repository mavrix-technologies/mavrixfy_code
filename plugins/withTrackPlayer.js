/**
 * withTrackPlayer — Expo config plugin for react-native-track-player.
 *
 * Ensures required Android manifest entries are present after prebuild/EAS:
 * - FOREGROUND_SERVICE_MEDIA_PLAYBACK permission
 * - RNTP MusicService as the sole media session owner
 * - expo-audio AudioControlsService disabled (prevents competing media session)
 */
const { withAndroidManifest } = require("expo/config-plugins");

function ensureToolsNamespace(manifest) {
  manifest.$ = manifest.$ || {};
  if (!manifest.$["xmlns:tools"]) {
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
  }
}

function ensureService(app, serviceDef) {
  if (!app.service) app.service = [];
  const name = serviceDef.$["android:name"];
  const existing = app.service.find((s) => s.$?.["android:name"] === name);
  if (!existing) {
    app.service.push(serviceDef);
    return;
  }
  existing.$ = { ...(existing.$ || {}), ...(serviceDef.$ || {}) };
}

const withTrackPlayer = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;

    ensureToolsNamespace(manifest);

    // Required on Android 14+ for media playback foreground service
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const hasPerm = manifest["uses-permission"].some(
      (p) => p.$?.["android:name"] === "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
    );
    if (!hasPerm) {
      manifest["uses-permission"].push({
        $: { "android:name": "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" },
      });
    }

    // RNTP's MusicService — sole media session owner
    ensureService(app, {
      $: {
        "android:name": "com.doublesymmetry.trackplayer.service.MusicService",
        "android:enabled": "true",
        "android:exported": "true",
        "android:foregroundServiceType": "mediaPlayback",
        "tools:replace": "android:exported,android:foregroundServiceType",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "android.intent.action.MEDIA_BUTTON" } }] },
        {
          $: { "tools:node": "remove" },
          action: [{ $: { "android:name": "android.media.browse.MediaBrowserService" } }],
        },
      ],
    });

    // Disable expo-audio's AudioControlsService so it can't compete for the media session
    ensureService(app, {
      $: {
        "android:name": "expo.modules.audio.service.AudioControlsService",
        "android:enabled": "false",
        "tools:replace": "android:enabled",
      },
    });

    return config;
  });

module.exports = withTrackPlayer;
