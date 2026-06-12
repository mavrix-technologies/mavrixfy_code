const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * withModularHeaders — Expo config plugin to enable modular headers globally in the Podfile.
 * 
 * This resolves issues where Swift pods (like AppCheckCore) depend on non-modular Objective-C
 * pods (like GoogleUtilities and RecaptchaInterop) when integrated as static libraries.
 */
function withModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      if (fs.existsSync(podfilePath)) {
        let content = fs.readFileSync(podfilePath, "utf8");
        if (!content.includes("use_modular_headers!")) {
          // Prepend use_modular_headers! at the very top of the Podfile
          content = "use_modular_headers!\n\n" + content;
          fs.writeFileSync(podfilePath, content, "utf8");
          console.log("✅ Config Plugin: Added 'use_modular_headers!' to Podfile");
        }
      } else {
        console.warn("⚠️ Config Plugin: Podfile not found at " + podfilePath);
      }
      return config;
    },
  ]);
}

module.exports = withModularHeaders;
