const fs = require("node:fs");
const path = require("node:path");
const { withAppBuildGradle, withGradleProperties, withDangerousMod } = require("@expo/config-plugins");

/** Preserve existing release signing and build limits across CNG regeneration. */
module.exports = config => {
  config = withAppBuildGradle(config, mod => {
    const marker = "// Mavrixfy playback build configuration";
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += `
${marker}
android {
    defaultConfig {
        ndk { abiFilters (*(findProperty('reactNativeArchitectures')?.split(',') ?: ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'])) }
    }
    signingConfigs {
        release {
            def uploadStoreFile = findProperty('MAVRIXFY_UPLOAD_STORE_FILE') ?: System.getenv('MAVRIXFY_UPLOAD_STORE_FILE')
            def uploadStorePassword = findProperty('MAVRIXFY_UPLOAD_STORE_PASSWORD') ?: System.getenv('MAVRIXFY_UPLOAD_STORE_PASSWORD')
            def uploadKeyAlias = findProperty('MAVRIXFY_UPLOAD_KEY_ALIAS') ?: System.getenv('MAVRIXFY_UPLOAD_KEY_ALIAS')
            def uploadKeyPassword = findProperty('MAVRIXFY_UPLOAD_KEY_PASSWORD') ?: System.getenv('MAVRIXFY_UPLOAD_KEY_PASSWORD')
            if (uploadStoreFile && uploadStorePassword && uploadKeyAlias && uploadKeyPassword) {
                storeFile file(uploadStoreFile)
                storePassword uploadStorePassword
                keyAlias uploadKeyAlias
                keyPassword uploadKeyPassword
            }
        }
    }
    buildTypes { release { signingConfig signingConfigs.release.storeFile ? signingConfigs.release : signingConfigs.debug } }
}
`;
    return mod;
  });
  config = withGradleProperties(config, mod => {
    const properties = { "org.gradle.jvmargs": "-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+UseG1GC", "android.enableShrinkResourcesInReleaseBuilds": "true" };
    for (const [key, value] of Object.entries(properties)) {
      mod.modResults = mod.modResults.filter(entry => entry.type !== "property" || entry.key !== key);
      mod.modResults.push({ type: "property", key, value });
    }
    return mod;
  });
  return withDangerousMod(config, ["android", mod => {
    const file = path.join(mod.modRequest.platformProjectRoot, ".gitignore");
    const contents = fs.readFileSync(file, "utf8");
    if (!contents.split(/\r?\n/).includes(".kotlin/")) fs.appendFileSync(file, "\n.kotlin/\n");
    return mod;
  }]);
};
