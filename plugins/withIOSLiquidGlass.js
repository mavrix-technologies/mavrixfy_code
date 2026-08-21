const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

function copyFileIfChanged(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return;
  const contents = fs.readFileSync(srcPath, "utf8");
  if (fs.existsSync(destPath)) {
    const current = fs.readFileSync(destPath, "utf8");
    if (current === contents) return;
  }
  fs.writeFileSync(destPath, contents, "utf8");
}

const withIOSLiquidGlass = (config) => {
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;

      if (!iosRoot || !projectName) {
        return config;
      }

      const targetDir = path.join(iosRoot, projectName);
      fs.mkdirSync(targetDir, { recursive: true });

      const sourceDir = path.join(config.modRequest.projectRoot, "ios", "MavrixfyLiquidGlass");
      if (fs.existsSync(sourceDir)) {
        copyFileIfChanged(
          path.join(sourceDir, "MavrixfyTopNavigation.swift"),
          path.join(targetDir, "MavrixfyTopNavigation.swift")
        );
        copyFileIfChanged(
          path.join(sourceDir, "MavrixfyTopNavigationBridge.swift"),
          path.join(targetDir, "MavrixfyTopNavigationBridge.swift")
        );
        copyFileIfChanged(
          path.join(sourceDir, "MavrixfyTopNavigationViewManager.m"),
          path.join(targetDir, "MavrixfyTopNavigationViewManager.m")
        );
      }

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;

    if (!projectName) {
      return config;
    }

    const target = project.getFirstTarget().uuid;
    const group =
      project.findPBXGroupKey({ name: projectName }) ||
      project.findPBXGroupKey({ path: projectName });

    project.addSourceFile(`${projectName}/MavrixfyTopNavigation.swift`, { target }, group);
    project.addSourceFile(`${projectName}/MavrixfyTopNavigationBridge.swift`, { target }, group);
    project.addSourceFile(`${projectName}/MavrixfyTopNavigationViewManager.m`, { target }, group);
    project.addFramework("SwiftUI.framework", { target });

    return config;
  });

  return config;
};

module.exports = withIOSLiquidGlass;
