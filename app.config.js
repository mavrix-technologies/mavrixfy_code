const appJson = require("./app.json");

module.exports = ({ config }) => {
  return {
    ...config,
    ...appJson.expo,
  };
};
