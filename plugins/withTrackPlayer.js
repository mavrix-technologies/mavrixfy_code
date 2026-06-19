/**
 * withTrackPlayer — Expo config plugin for react-native-track-player.
 *
 * Ensures required Android manifest entries are present after prebuild/EAS:
 * - TrackPlayer MusicService
 */
const fs = require("fs");
const path = require("path");
const { deserialize, serialize } = require("node:v8");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

function ensureIntentAction(service, actionName) {
  if (!service["intent-filter"]) {
    service["intent-filter"] = [{ action: [{ $: { "android:name": actionName } }] }];
    return;
  }
  const filters = service["intent-filter"];
  const hasAction = filters.some((filter) =>
    (filter.action || []).some((action) => action.$?.["android:name"] === actionName)
  );
  if (!hasAction) {
    filters.push({ action: [{ $: { "android:name": actionName } }] });
  }
}

function hasIntentAction(filter, actionName) {
  return (filter.action || []).some((action) => action.$?.["android:name"] === actionName);
}

function cloneManifestNode(node) {
  return typeof structuredClone === "function" ? structuredClone(node) : deserialize(serialize(node));
}

function ensureRemovedIntentAction(service, filter) {
  const actionName = (filter.action || [])[0]?.$?.["android:name"];
  if (!actionName) return true;

  if (!service["intent-filter"]) service["intent-filter"] = [];
  const exists = service["intent-filter"].some(
    (existingFilter) =>
      existingFilter.$?.["tools:node"] === "remove" &&
      hasIntentAction(existingFilter, actionName)
  );
  if (!exists) {
    service["intent-filter"].push(cloneManifestNode(filter));
  }
  return true;
}

function ensureService(app, serviceDef) {
  if (!app.service) app.service = [];
  const name = serviceDef.$["android:name"];
  const existing = app.service.find((item) => item.$?.["android:name"] === name);
  if (!existing) {
    app.service.push(serviceDef);
    return;
  }

  existing.$ = { ...(existing.$ || {}), ...(serviceDef.$ || {}) };
  const expectedFilters = serviceDef["intent-filter"] || [];
  expectedFilters.forEach((filter) => {
    if (filter.$?.["tools:node"] === "remove") {
      ensureRemovedIntentAction(existing, filter);
      return;
    }

    (filter.action || []).forEach((action) => {
      const actionName = action.$?.["android:name"];
      if (actionName) {
        ensureIntentAction(existing, actionName);
      }
    });
    (filter.category || []).forEach((category) => {
      if (!existing["intent-filter"]) existing["intent-filter"] = [];
      if (existing["intent-filter"].length === 0) existing["intent-filter"].push({});
      const targetFilter = existing["intent-filter"][0];
      if (!targetFilter.category) targetFilter.category = [];
      const categoryName = category.$?.["android:name"];
      const hasCategory = targetFilter.category.some((item) => item.$?.["android:name"] === categoryName);
      if (!hasCategory && categoryName) {
        targetFilter.category.push({ $: { "android:name": categoryName } });
      }
    });
  });

  const serviceMeta = serviceDef["meta-data"] || [];
  if (serviceMeta.length > 0) {
    if (!existing["meta-data"]) existing["meta-data"] = [];
    serviceMeta.forEach((meta) => {
      const metaName = meta.$?.["android:name"];
      if (!metaName) return;
      const target = existing["meta-data"].find((item) => item.$?.["android:name"] === metaName);
      if (target) {
        target.$ = { ...(target.$ || {}), ...(meta.$ || {}) };
      } else {
        existing["meta-data"].push(meta);
      }
    });
  }
}

function removeService(app, serviceName) {
  if (!app.service) return;
  app.service = app.service.filter((item) => item.$?.["android:name"] !== serviceName);
}

function ensureAppMetaData(app, meta) {
  if (!app["meta-data"]) app["meta-data"] = [];
  const name = meta.$["android:name"];
  const existing = app["meta-data"].find((item) => item.$?.["android:name"] === name);
  if (existing) {
    existing.$ = { ...(existing.$ || {}), ...(meta.$ || {}) };
  } else {
    app["meta-data"].push(meta);
  }
}

function removeAppMetaData(app, name) {
  if (!app["meta-data"]) return;
  app["meta-data"] = app["meta-data"].filter((item) => item.$?.["android:name"] !== name);
}

function ensureToolsNamespace(manifest) {
  manifest.$ = manifest.$ || {};
  if (!manifest.$["xmlns:tools"]) {
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
  }
}

const withTrackPlayer = (config) => {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;

    ensureToolsNamespace(manifest);

    // Required on Android 14+ for media playback foreground service
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const hasFgPerm = manifest["uses-permission"].some(
      (p) => p.$?.["android:name"] === "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
    );
    if (!hasFgPerm) {
      manifest["uses-permission"].push({
        $: { "android:name": "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" },
      });
    }
    ensureService(app, {
      $: {
        "android:name": "com.doublesymmetry.trackplayer.service.MusicService",
        "android:enabled": "true",
        "android:exported": "true",
        "android:foregroundServiceType": "mediaPlayback",
        "tools:replace": "android:exported,android:foregroundServiceType",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.intent.action.MEDIA_BUTTON" } }],
        },
        {
          $: { "tools:node": "remove" },
          action: [{ $: { "android:name": "android.media.browse.MediaBrowserService" } }],
        },
      ],
    });

    // Remove stale Android Auto declarations until a native MediaBrowserService
    // implementation exists. Leaving the service in the manifest crashes
    // playback when Android tries to bind it for media resume.
    removeAppMetaData(app, "com.google.android.gms.car.application");
    removeService(app, ".auto.MavrixfyAutoService");
    removeService(app, "com.mavrixfy.app.auto.MavrixfyAutoService");

    return config;
  });

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(config.modRequest.projectRoot, "android", "app", "src", "main", "res", "xml");
      const automotiveDescPath = path.join(xmlDir, "automotive_app_desc.xml");
      if (fs.existsSync(automotiveDescPath)) {
        fs.unlinkSync(automotiveDescPath);
      }
      return config;
    },
  ]);

  return config;
};

module.exports = withTrackPlayer;
