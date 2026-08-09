/**
 * withTrackPlayer — Expo config plugin for react-native-track-player.
 *
 * - FOREGROUND_SERVICE_MEDIA_PLAYBACK permission (Android 14+ requirement)
 * - MusicService: exported, foregroundServiceType=mediaPlayback, MEDIA_BUTTON filter
 * - Disables expo-audio AudioControlsService (prevents MediaSession conflict)
 * - Hardware features marked required=false (car/tablet compatibility)
 *
 * Android Auto (RNTP v4): MusicService extends HeadlessJsTaskService, not
 * MediaBrowserServiceCompat. The MediaBrowserService intent-filter is intentionally
 * absent — advertising it without implementing onGetRoot/onLoadChildren hangs the
 * car UI. Media controls appear in the Auto notification area via the active
 * MediaSession. Full browse-tree support requires RNTP v5.
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
  if (serviceDef["intent-filter"]) {
    if (!existing["intent-filter"]) {
      existing["intent-filter"] = serviceDef["intent-filter"];
    } else {
      for (const incoming of serviceDef["intent-filter"]) {
        const incomingActions = new Set(
          (incoming.action || []).flatMap((a) => (a.$?.["android:name"] ? [a.$["android:name"]] : []))
        );
        const alreadyPresent = existing["intent-filter"].some((ef) =>
          (ef.action || []).some((a) => incomingActions.has(a.$?.["android:name"]))
        );
        if (!alreadyPresent) {
          existing["intent-filter"].push(incoming);
        }
      }
    }
  }
}

function ensureUsesPermission(manifest, permissionName) {
  if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
  const already = manifest["uses-permission"].some(
    (p) => p.$?.["android:name"] === permissionName
  );
  if (!already) {
    manifest["uses-permission"].push({ $: { "android:name": permissionName } });
  }
}

function ensureUsesFeature(manifest, featureName) {
  if (!manifest["uses-feature"]) manifest["uses-feature"] = [];
  const already = manifest["uses-feature"].find(
    (f) => f.$?.["android:name"] === featureName
  );
  if (!already) {
    manifest["uses-feature"].push({
      $: { "android:name": featureName, "android:required": "false" },
    });
  }
}

const OPTIONAL_HARDWARE_FEATURES = [
  "android.hardware.bluetooth",
  "android.hardware.microphone",
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
  "android.hardware.location",
  "android.hardware.location.gps",
  "android.hardware.touchscreen",
  "android.hardware.wifi",
];

const withTrackPlayer = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;

    ensureToolsNamespace(manifest);
    ensureUsesPermission(manifest, "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK");
    OPTIONAL_HARDWARE_FEATURES.forEach((f) => ensureUsesFeature(manifest, f));

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
      ],
    });

    // Remove any stale MediaBrowserService filter added by older builds.
    const musicService = app.service.find(
      (s) => s.$?.["android:name"] === "com.doublesymmetry.trackplayer.service.MusicService"
    );
    if (musicService?.["intent-filter"]) {
      musicService["intent-filter"] = musicService["intent-filter"].filter(
        (f) =>
          !f.action?.some(
            (a) => a.$?.["android:name"] === "android.media.browse.MediaBrowserService"
          )
      );
    }

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
