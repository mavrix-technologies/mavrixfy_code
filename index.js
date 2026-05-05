const { isRunningInExpoGo } = require("expo");

// Register the TrackPlayer background service for both iOS and Android.
// Must happen before expo-router/entry loads the React tree.
if (!isRunningInExpoGo()) {
  try {
    const TrackPlayer = require("react-native-track-player").default;
    TrackPlayer.registerPlaybackService(
      () => require("./lib/trackPlayerService").trackPlayerService
    );
  } catch {
    // Native module unavailable in this runtime — silent fail.
  }
}

require("expo-router/entry");
