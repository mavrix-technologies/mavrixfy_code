module.exports = function (api) {
  api.cache(true);
  
  const plugins = [
    [
      "module-resolver",
      {
        root: ["./"],
        alias: {
          "@src": "./src",
          "@features": "./src/features",
          "@shared": "./src/shared",
          "@domain": "./src/domain",
          "@data": "./src/data",
          "@": "./"
        },
        extensions: [
          ".js",
          ".jsx",
          ".ts",
          ".tsx",
          ".json"
        ]
      }
    ]
  ];

  // Only add react-native-reanimated plugin if available
  try {
    require.resolve("react-native-reanimated/plugin");
    plugins.push("react-native-reanimated/plugin");
  } catch (e) {
    // Plugin not available, skip
  }

  return {
    presets: ["babel-preset-expo"],
    plugins
  };
};
