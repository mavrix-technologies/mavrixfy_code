/**
 * withSliderBuildFix — Expo config plugin for react-native-slider iOS compatibility.
 *
 * Fixes compilation issues with react-native-slider on iOS by:
 * - Suppressing warnings that cause build failures
 * - Setting compatible build settings for Clang
 */
const { withXcodeProject } = require("@expo/config-plugins");

module.exports = function withSliderBuildFix(config) {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    // Get all targets
    const targets = xcodeProject.pbxTargetByName("Pods");
    
    if (targets) {
      // Find react-native-slider target
      const sliderTargets = xcodeProject.pbxTargetByName("react-native-slider");
      
      if (sliderTargets) {
        // Add build settings to the target
        const target = sliderTargets;
        
        Object.keys(xcodeProject.pbxXCConfigurationList()).forEach((key) => {
          const configList = xcodeProject.pbxXCConfigurationList()[key];
          if (configList.name === "React-native-slider" || configList.name?.includes("react-native-slider")) {
            Object.keys(configList.buildConfigurations).forEach((configKey) => {
              const buildConfig = xcodeProject.pbxXCBuildConfigurationSection()[configList.buildConfigurations[configKey]];
              if (buildConfig) {
                // Suppress warnings
                buildConfig.buildSettings.GCC_WARN_INHIBIT_ALL_WARNINGS = "YES";
                buildConfig.buildSettings.CLANG_WARN_DOCUMENTATION_COMMENTS = "NO";
                buildConfig.buildSettings.CLANG_WARN_STRICT_PROTOTYPES = "NO";
              }
            });
          }
        });
      }
    }

    return config;
  });
};
