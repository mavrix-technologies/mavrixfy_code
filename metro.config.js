const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Keep Metro aligned with the current Expo config. New architecture is already
// disabled in the native project settings where it actually matters.
config.resolver = {
  ...config.resolver,
  blockList: [
    /server\/.*/,
    /server_dist\/.*/,
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
  getTransformOptions: async () => ({
    transform: {
      inlineRequires: true,
    },
  }),
};

module.exports = config;
