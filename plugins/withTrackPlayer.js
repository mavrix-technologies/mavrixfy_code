const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");

function ensureUsesPermission(manifest, permissionName) {
  const permissions = manifest["uses-permission"] ?? [];
  const hasPermission = permissions.some(
    (permission) => permission?.$?.["android:name"] === permissionName
  );

  if (!hasPermission) {
    permissions.push({
      $: {
        "android:name": permissionName,
      },
    });
  }

  manifest["uses-permission"] = permissions;
}

function ensureIntentFilterAction(service, actionName) {
  service["intent-filter"] = service["intent-filter"] ?? [];
  const hasAction = service["intent-filter"].some((intentFilter) =>
    Array.isArray(intentFilter.action)
      ? intentFilter.action.some((action) => action?.$?.["android:name"] === actionName)
      : false
  );

  if (!hasAction) {
    service["intent-filter"].push({
      action: [
        {
          $: {
            "android:name": actionName,
          },
        },
      ],
    });
  }
}

function withTrackPlayer(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    ensureUsesPermission(manifest, "android.permission.FOREGROUND_SERVICE");
    ensureUsesPermission(manifest, "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK");

    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      "com.google.android.gms.car.application",
      "@xml/automotive_app_desc",
      "resource"
    );

    mainApplication.service = mainApplication.service ?? [];
    let musicService = mainApplication.service.find(
      (service) =>
        service?.$?.["android:name"] === "com.doublesymmetry.trackplayer.service.MusicService"
    );

    if (!musicService) {
      musicService = {
        $: {
          "android:name": "com.doublesymmetry.trackplayer.service.MusicService",
          "android:enabled": "true",
          "android:exported": "true",
          "android:foregroundServiceType": "mediaPlayback",
        },
      };
      mainApplication.service.push(musicService);
    } else {
      musicService.$ = musicService.$ ?? {};
      musicService.$["android:enabled"] = musicService.$["android:enabled"] ?? "true";
      musicService.$["android:exported"] = "true";
      musicService.$["android:foregroundServiceType"] = "mediaPlayback";
    }

    ensureIntentFilterAction(musicService, "android.intent.action.MEDIA_BUTTON");
    ensureIntentFilterAction(musicService, "android.media.browse.MediaBrowserService");

    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      const xmlFile = path.join(xmlDir, "automotive_app_desc.xml");

      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(
        xmlFile,
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          "<automotiveApp>",
          '  <uses name="media"/>',
          "</automotiveApp>",
          "",
        ].join("\n"),
        "utf8"
      );

      return cfg;
    },
  ]);

  return config;
}

module.exports = withTrackPlayer;
