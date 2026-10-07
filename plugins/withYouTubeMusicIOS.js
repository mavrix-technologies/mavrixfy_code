/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject, IOSConfig } = require("@expo/config-plugins");

const repository = "https://github.com/alexeichhorn/YouTubeKit.git";
// Reviewed source revision; no floating extraction dependency in production builds.
const revision = "e5b7d0396ce12bf3444f0d209e8436c83373b7af";

function installPackage(project) {
  const objects = project.hash.project.objects;
  const references = objects.XCRemoteSwiftPackageReference ??= {};
  let packageId = Object.keys(references).find(key => references[key]?.repositoryURL === `"${repository}"`);
  if (!packageId) {
    packageId = project.generateUuid();
    references[packageId] = { isa: "XCRemoteSwiftPackageReference", repositoryURL: `"${repository}"`, requirement: { kind: "revision", revision: `"${revision}"` } };
    references[`${packageId}_comment`] = "YouTubeKit";
  }
  const root = project.getFirstProject().firstProject;
  root.packageReferences ??= [];
  if (!root.packageReferences.some(item => item.value === packageId)) root.packageReferences.push({ value: packageId, comment: "YouTubeKit" });
  const products = objects.XCSwiftPackageProductDependency ??= {};
  let productId = Object.keys(products).find(key => products[key]?.productName === "YouTubeKit");
  if (!productId) {
    productId = project.generateUuid();
    products[productId] = { isa: "XCSwiftPackageProductDependency", package: packageId, package_comment: "YouTubeKit", productName: "YouTubeKit" };
    products[`${productId}_comment`] = "YouTubeKit";
  }
  const target = project.getFirstTarget().firstTarget;
  target.packageProductDependencies ??= [];
  if (!target.packageProductDependencies.some(item => item.value === productId)) target.packageProductDependencies.push({ value: productId, comment: "YouTubeKit" });
  const frameworks = target.buildPhases.find(item => objects.PBXFrameworksBuildPhase?.[item.value]);
  if (!frameworks) throw new Error("YouTube Music: iOS app Frameworks build phase is missing.");
  const phase = objects.PBXFrameworksBuildPhase[frameworks.value];
  const buildFiles = objects.PBXBuildFile;
  if (!phase.files.some(item => buildFiles[item.value]?.productRef === productId)) {
    const fileId = project.generateUuid();
    buildFiles[fileId] = { isa: "PBXBuildFile", productRef: productId, productRef_comment: "YouTubeKit" };
    buildFiles[`${fileId}_comment`] = "YouTubeKit in Frameworks";
    phase.files.push({ value: fileId, comment: "YouTubeKit in Frameworks" });
  }
  return project;
}

module.exports = function withYouTubeMusicIOS(config) {
  return withXcodeProject(config, mod => {
    const name = mod.modRequest.projectName ?? IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const destination = path.join(mod.modRequest.platformProjectRoot, name);
    fs.mkdirSync(destination, { recursive: true });
    for (const file of ["MavrixfyYouTube.swift", "MavrixfyYouTubeBridge.m"]) {
      fs.copyFileSync(path.join(__dirname, "youtube-music/ios", file), path.join(destination, file));
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: `${name}/${file}`, groupName: name, project: mod.modResults });
    }
    const license = "LICENSE-YouTubeKit.txt";
    fs.copyFileSync(path.join(__dirname, "youtube-music/ios", license), path.join(destination, license));
    IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath: `${name}/${license}`, groupName: name, project: mod.modResults, isBuildFile: true });
    installPackage(mod.modResults);
    return mod;
  });
};
module.exports.installPackage = installPackage;
