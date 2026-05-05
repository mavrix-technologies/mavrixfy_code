const { isRunningInExpoGo } = require("expo");
const { Platform } = require("react-native");

// Register the TrackPlayer background service only on Android.
// iOS is currently using expo-audio because the native TrackPlayer path is
// still unstable there when playback is initialized.
if (!isRunningInExpoGo() && Platform.OS === "android") {
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
