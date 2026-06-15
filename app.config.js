const appJson = require("./app.json");

const googleMobileAdsConfig = appJson["react-native-google-mobile-ads"] || {};

module.exports = ({ config }) => {
  const expoConfig = { ...config, ...appJson.expo };
  const plugins = [...(expoConfig.plugins || [])];

  if (!plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === "react-native-google-mobile-ads")) {
    plugins.push([
      "react-native-google-mobile-ads",
      {
        androidAppId: googleMobileAdsConfig.android_app_id,
        iosAppId: googleMobileAdsConfig.ios_app_id,
        optimizeInitialization: true,
        optimizeAdLoading: true,
      },
    ]);
  }

  return {
    ...expoConfig,
    plugins,
  };
};
