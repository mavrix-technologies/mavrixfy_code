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
        if (System.getProperty('os.name').toLowerCase().contains('windows')) {
            // SDK CMake 3.22 bundles Ninja 1.10, which cannot read long object paths.
            externalNativeBuild { cmake { arguments '-DCMAKE_OBJECT_PATH_MAX=240' } }
        }
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
    buildTypes { release { signingConfig signingConfigs.release } }
}

// Never create a production artifact with missing or debug signing credentials.
def verifyReleaseSigning = tasks.register('verifyReleaseSigning') {
    doLast {
        def signing = android.signingConfigs.release
        if (!signing.storeFile || !signing.storeFile.exists() || !signing.storePassword || !signing.keyAlias || !signing.keyPassword) {
            throw new GradleException('Production signing is not configured. Set MAVRIXFY_UPLOAD_STORE_FILE, MAVRIXFY_UPLOAD_STORE_PASSWORD, MAVRIXFY_UPLOAD_KEY_ALIAS and MAVRIXFY_UPLOAD_KEY_PASSWORD before building a release.')
        }
        if (signing.storeFile.canonicalFile == android.signingConfigs.debug.storeFile.canonicalFile) {
            throw new GradleException('Production releases cannot use the debug keystore.')
        }
    }
}
tasks.configureEach {
    if (name in ['assembleRelease', 'bundleRelease', 'packageRelease', 'signReleaseBundle']) {
        dependsOn verifyReleaseSigning
    }
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
