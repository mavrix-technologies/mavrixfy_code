/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const {
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require("@expo/config-plugins");

module.exports = function withAndroidAuto(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    app["meta-data"] ||= [];
    app["meta-data"] = app["meta-data"].filter(
      (entry) =>
        entry.$["android:name"] !== "com.google.android.gms.car.application",
    );
    app["meta-data"].push({
      $: {
        "android:name": "com.google.android.gms.car.application",
        "android:resource": "@xml/automotive_app_desc",
      },
    });
    app.service ||= [];
    app.service = app.service.filter(
      (entry) =>
        entry.$["android:name"] !==
        "com.mavrixfy.app.MavrixfyMediaBrowserService",
    );
    app.service.push({
      $: {
        "android:name": "com.mavrixfy.app.MavrixfyMediaBrowserService",
        "android:exported": "true",
        "android:foregroundServiceType": "mediaPlayback",
      },
      "intent-filter": [
        {
          action: [
            {
              $: { "android:name": "android.media.browse.MediaBrowserService" },
            },
          ],
        },
      ],
    });
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (
      !mod.modResults.contents.includes(
        'implementation("androidx.media:media:1.7.0")',
      )
    ) {
      mod.modResults.contents = mod.modResults.contents.replace(
        "dependencies {",
        'dependencies {\n    implementation("androidx.media:media:1.7.0")',
      );
    }
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (
      !mod.modResults.contents.includes("add(MavrixfyMediaLibraryPackage())")
    ) {
      mod.modResults.contents = mod.modResults.contents.replace(
        "PackageList(this).packages.apply {",
        "PackageList(this).packages.apply {\n          add(MavrixfyMediaLibraryPackage())",
      );
    }
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const target = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main",
      );
      const java = path.join(target, "java/com/mavrixfy/app");
      fs.mkdirSync(java, { recursive: true });
      for (const file of [
        "MavrixfyMediaBrowserService.kt",
        "MavrixfyMediaLibraryModule.kt",
        "MavrixfyMediaLibraryPackage.kt",
      ]) {
        fs.copyFileSync(
          path.join(__dirname, "android-auto", file),
          path.join(java, file),
        );
      }
      fs.mkdirSync(path.join(target, "res/xml"), { recursive: true });
      fs.cpSync(
        path.join(__dirname, "android-auto/drawable"),
        path.join(target, "res/drawable"),
        { recursive: true },
      );
      fs.writeFileSync(
        path.join(target, "res/xml/automotive_app_desc.xml"),
        '<automotiveApp><uses name="media" /></automotiveApp>\n',
      );
      return mod;
    },
  ]);
};
