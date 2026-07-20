const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Watch the local package folder which is outside of Mavrixfy_App root
const packagePath = path.resolve(__dirname, "../react-native-clean-youtube-iframe");
config.watchFolders = [...(config.watchFolders || []), packagePath];

// Keep Metro aligned with the current Expo config. New architecture is already
// disabled in the native project settings where it actually matters.
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(__dirname, "node_modules"),
    path.resolve(packagePath, "node_modules"),
  ],
  blockList: [
    /node_modules\/react-native-track-player\/lib\/web\/.*/,
    /node_modules\/react-native-track-player\/.*\.web\.js$/,
  ],
  assetExts: [...config.resolver.assetExts, 'db', 'mp3', 'ttf', 'obj', 'png', 'jpg'],
  sourceExts: [...config.resolver.sourceExts, 'jsx', 'js', 'ts', 'tsx', 'json'],
  platforms: ['ios', 'android'],
};

// Keep startup-friendly inline requires, but use Expo's default minifier.
// Aggressive Terser options can hide production diagnostics and change runtime
// names without proving a measurable performance gain.
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    compress: {
      drop_console: true, // Remove console.log in production
      reduce_funcs: true,
    },
    mangle: {
      keep_fnames: false,
    },
    output: {
      comments: false,
    },
  },
  getTransformOptions: async () => ({
    transform: {
      inlineRequires: true,
    },
  }),
};

module.exports = config;
