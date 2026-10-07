/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const { withAppBuildGradle, withMainApplication, withDangerousMod } = require("@expo/config-plugins");

module.exports = function withYouTubeMusic(config) {
  config = require("./withYouTubeMusicIOS")(config);
  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("// Mavrixfy YouTube Music")) {
      mod.modResults.contents = mod.modResults.contents.replace("dependencies {", `dependencies {
    // Mavrixfy YouTube Music: independent native catalog/extraction, no second player.
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.26.5")
    runtimeOnly("com.github.MetrolistGroup.innertubex:innertubex:0.4.1")
    runtimeOnly("io.ktor:ktor-client-cio:3.5.2")`);
    }
    if (!mod.modResults.contents.includes("// YouTube runtime metadata isolation")) {
      mod.modResults.contents += `
// YouTube runtime metadata isolation: reflection keeps newer library metadata out of Kotlin 2.1 compilation.
configurations.matching { it.name.endsWith("CompileClasspath") }.configureEach {
    resolutionStrategy.force("org.jetbrains.kotlin:kotlin-stdlib:2.1.20",
        "org.jetbrains.kotlin:kotlin-stdlib-jdk7:2.1.20", "org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.1.20",
        "org.jetbrains.kotlinx:kotlinx-serialization-core-jvm:1.8.1", "org.jetbrains.kotlinx:kotlinx-serialization-json-jvm:1.8.1")
}
`;
    }
    if (!mod.modResults.contents.includes("YouTubeSmokeRunner")) {
      mod.modResults.contents = mod.modResults.contents.replace("defaultConfig {", 'defaultConfig {\n        testInstrumentationRunner "com.mavrixfy.app.youtube.YouTubeSmokeRunner"');
    }
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (!mod.modResults.contents.includes("add(MavrixfyYouTubePackage())")) {
      mod.modResults.contents = mod.modResults.contents.replace("PackageList(this).packages.apply {", "PackageList(this).packages.apply {\n          add(MavrixfyYouTubePackage())");
    }
    return mod;
  });
  return withDangerousMod(config, ["android", (mod) => {
    const app = path.join(mod.modRequest.platformProjectRoot, "app");
    const target = path.join(app, "src/main/java/com/mavrixfy/app/youtube");
    fs.mkdirSync(target, { recursive: true });
    for (const file of fs.readdirSync(path.join(__dirname, "youtube-music"))) {
      if (file.endsWith(".kt")) fs.copyFileSync(path.join(__dirname, "youtube-music", file), path.join(target, file));
    }
    const tests = path.join(app, "src/androidTest/java/com/mavrixfy/app/youtube");
    fs.mkdirSync(tests, { recursive: true });
    fs.copyFileSync(path.join(__dirname, "youtube-music/tests/YouTubeSmokeRunner.kt"), path.join(tests, "YouTubeSmokeRunner.kt"));
    const rules = path.join(app, "proguard-rules.pro");
    const marker = "# Mavrixfy YouTube Music";
    const content = fs.readFileSync(rules, "utf8");
    if (!content.includes(marker)) fs.appendFileSync(rules, `\n${marker}\n-keep class com.metrolist.innertubex.** { *; }\n-keep class io.ktor.** { *; }\n-keep class org.schabi.newpipe.extractor.** { *; }\n`);
    return mod;
  }]);
};
