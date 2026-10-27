const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withMainApplication, withDangerousMod, withStringsXml } = require("@expo/config-plugins");

/** Media3's local module supplies the only playback/library service. */
module.exports = function withAndroidAuto(config) {
  config = withStringsXml(config, mod => {
    const fallback = String(config.extra?.musicApiDomain || "mavrixfy-song-api.vercel.app");
    const configured = process.env.EXPO_PUBLIC_APP_API_URL || process.env.EXPO_PUBLIC_MUSIC_API_URL || fallback;
    let api;
    try {
      api = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`);
      if (api.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(api.hostname)) throw new Error("Non-production API");
    } catch {
      api = new URL(/^https:\/\//i.test(fallback) ? fallback : `https://${fallback}`);
    }
    const strings = mod.modResults.resources.string || [];
    mod.modResults.resources.string = strings.filter(item => item.$.name !== "mavrixfy_car_api_base_url");
    mod.modResults.resources.string.push({ $: { name: "mavrixfy_car_api_base_url", translatable: "false" }, _: api.href.replace(/\/$/, "") });
    return mod;
  });
  config = withAndroidManifest(config, mod => {
    const app = mod.modResults.manifest.application[0];
    app["meta-data"] = (app["meta-data"] || []).filter(entry => entry.$["android:name"] !== "com.google.android.gms.car.application");
    app["meta-data"].push({ $: { "android:name": "com.google.android.gms.car.application", "android:resource": "@xml/automotive_app_desc" } });
    app.service = (app.service || []).filter(entry => entry.$["android:name"] !== "com.mavrixfy.app.MavrixfyMediaBrowserService");
    // The Expo Go fallback runs in Expo Go's binary, never in this build.
    let service = app.service.find(entry => entry.$["android:name"] === "expo.modules.audio.service.AudioControlsService");
    if (!service) { service = { $: { "android:name": "expo.modules.audio.service.AudioControlsService", "android:exported": "false", "android:foregroundServiceType": "mediaPlayback" } }; app.service.push(service); }
    {
      mod.modResults.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
      service.$["android:enabled"] = "false";
      service.$["tools:replace"] = [...new Set((service.$["tools:replace"] || "").split(",").filter(Boolean).concat("android:enabled"))].join(",");
    }
    return mod;
  });
  config = withMainApplication(config, mod => {
    mod.modResults.contents = mod.modResults.contents.replace(/\s*add\(MavrixfyMediaLibraryPackage\(\)\)/g, "");
    return mod;
  });
  return withDangerousMod(config, ["android", mod => {
    const root = path.resolve(mod.modRequest.platformProjectRoot);
    for (const name of ["MavrixfyMediaBrowserService.kt", "MavrixfyMediaLibraryModule.kt", "MavrixfyMediaLibraryPackage.kt"]) {
      const file = path.resolve(root, "app/src/main/java/com/mavrixfy/app", name);
      if (!file.startsWith(root + path.sep)) throw new Error("Invalid generated source path");
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    const directory = path.join(root, "app/src/main/res/xml");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "automotive_app_desc.xml"), '<automotiveApp><uses name="media" /></automotiveApp>\n');
    return mod;
  }]);
};
