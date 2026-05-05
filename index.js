const { isRunningInExpoGo } = require("expo");
const { Platform } = require("react-native");

if (Platform.OS === "android" && !isRunningInExpoGo()) {
  const TrackPlayer = require("react-native-track-player").default;
  TrackPlayer.registerPlaybackService(() => require("./lib/trackPlayerService").trackPlayerService);
}

require("expo-router/entry");
