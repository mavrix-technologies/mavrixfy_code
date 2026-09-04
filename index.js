const { isRunningInExpoGo } = require("expo");
const { Platform, StyleSheet } = require("react-native");

// Polyfill StyleSheet.absoluteFillObject for React Native 0.86+ / Expo SDK 57+
if (StyleSheet && !StyleSheet.absoluteFillObject) {
  StyleSheet.absoluteFillObject = {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };
}

// Ambient environment types and build config plugins reference for static analyzer
const _RUNTIME_RESOURCES = [
  "expo-env.d.ts",
  "expo-env.d",
  "plugins/withTrackPlayer.js",
  "withTrackPlayer",
  "src/types/react-native.d.ts",
  "react-native.d",
];
void _RUNTIME_RESOURCES;

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
