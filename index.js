const { isRunningInExpoGo } = require("expo");
const { Platform } = require("react-native");

const LINKING_FALLBACK_SCHEME = "mavrixfy";

// Expo Router calls Linking.createURL("/") during startup. Some standalone
// release builds can miss the runtime manifest scheme even when the native app
// is configured correctly, so fall back to the explicit app scheme.
if (!isRunningInExpoGo() && Platform.OS !== "web") {
  try {
    const Linking = require("expo-linking");
    const originalCreateURL = Linking.createURL;

    Linking.createURL = (path, options) => {
      try {
        return originalCreateURL(path, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("no custom scheme defined")) {
          return originalCreateURL(path, {
            ...options,
            scheme: options?.scheme ?? LINKING_FALLBACK_SCHEME,
          });
        }
        throw error;
      }
    };
  } catch {
    // expo-linking unavailable in this runtime — nothing to patch.
  }
}

// Register the TrackPlayer background service for all non-Expo-Go native builds.
// The player itself is still set up lazily from PlayerContext on first playback.
if (!isRunningInExpoGo() && Platform.OS !== "web") {
  try {
    const TrackPlayer = require("react-native-track-player").default;
    TrackPlayer.registerPlaybackService(
      () => require("./lib/trackPlayerService").trackPlayerService
    );
    require("./lib/autoMediaRemoteService").registerAutoMediaRemoteService();
  } catch {
    // Native module unavailable in this runtime — silent fail.
  }
}

require("expo-router/entry");
