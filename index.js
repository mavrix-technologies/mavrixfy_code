const { isRunningInExpoGo } = require("expo");

if (!isRunningInExpoGo()) {
  const TrackPlayer = require("react-native-track-player").default;
  TrackPlayer.registerPlaybackService(() => require("./lib/trackPlayerService").trackPlayerService);
}

require("expo-router/entry");
