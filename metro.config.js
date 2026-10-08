const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultBlockList = config.resolver.blockList;

// Keep Metro aligned with the current Expo config. New architecture is already
// disabled in the native project settings where it actually matters.
config.resolver = {
  ...config.resolver,
  // Native compilers produce thousands of files while Metro is running.
  // Keep these outputs out of the JS file map without excluding package build/ JS.
  blockList: [
    ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
    /[/\\](?:\.gradle|\.cxx)[/\\]/,
    /[/\\]android[/\\](?:app[/\\])?build[/\\]/,
    /[/\\]ios[/\\](?:Pods|build)[/\\]/,
  ],
  unstable_enablePackageExports: true,
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
