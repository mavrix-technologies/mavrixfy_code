const { isRunningInExpoGo } = require("expo");
const { Platform } = require("react-native");

const LINKING_FALLBACK_SCHEME = "mavrixfy";

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
    // expo-linking unavailable in this runtime
  }
}

if (!isRunningInExpoGo() && Platform.OS !== "web") {
  try {
    const trackPlayerModule = require("react-native-track-player");
    const TrackPlayer = trackPlayerModule.default || trackPlayerModule;
    TrackPlayer.registerPlaybackService(
      () => require("./src/services/audio/TrackPlayerAdapter").trackPlayerService
    );
  } catch {
    // native module unavailable in Expo Go and unsupported runtimes
  }
}

require("expo-router/entry");
