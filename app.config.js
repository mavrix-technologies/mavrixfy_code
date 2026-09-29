const appJson = require("./app.json");

module.exports = ({ config }) => {
  return {
    ...config,
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      googleServicesFile: "./GoogleService-Info.plist",
    },
  };
};
