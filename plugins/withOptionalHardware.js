const { withAndroidManifest } = require("@expo/config-plugins");

// Music playback works without these features. Explicit declarations override
// the hardware requirements Play infers from permissions and orientation.
const OPTIONAL_FEATURES = [
  "android.hardware.bluetooth",
  "android.hardware.microphone",
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
  "android.hardware.location",
  "android.hardware.location.gps",
  "android.hardware.screen.portrait",
  "android.hardware.touchscreen",
  "android.hardware.wifi",
];

module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    const features = manifest["uses-feature"] || [];
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find(feature => feature.$["android:name"] === name);
      if (existing) {
        existing.$["android:required"] = "false";
      } else {
        features.push({ $: { "android:name": name, "android:required": "false" } });
      }
    }
    manifest["uses-feature"] = features;
    return mod;
  });
};
