import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
} from "react-native-track-player";
import { Platform } from "react-native";

async function setupPlayerOnce(
  options: Parameters<typeof TrackPlayer.setupPlayer>[0]
) {
  const trySetup = async () => {
    try {
      await TrackPlayer.setupPlayer(options);
    } catch (error) {
      return (error as Error & { code?: string }).code;
    }
  };
  // Retry until the app is in the foreground (Android background restriction)
  while ((await trySetup()) === "android_cannot_setup_player_in_background") {
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
}

let playerReady = false;

export async function setupPlayer(): Promise<void> {
  if (playerReady) return;

  // Android 13+ (API 33) requires a runtime grant for POST_NOTIFICATIONS.
  // Without this the media notification is silently suppressed even if the
  // permission is declared in AndroidManifest.xml.
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    try {
      const { PermissionsAndroid } = require("react-native");
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    } catch {
      // non-fatal — proceed even if the request fails
    }
  }

  await setupPlayerOnce({
    autoHandleInterruptions: true,
    autoUpdateMetadata: true,
    maxCacheSize: 1024 * 50,
    minBuffer: 15,
    maxBuffer: 50,
    playBuffer: 2.0,
    backBuffer: 30,
    ...(Platform.OS === "ios"
      ? {
          iosCategory: IOSCategory.Playback,
          iosCategoryMode: IOSCategoryMode.Default,
          iosCategoryOptions: [
            IOSCategoryOptions.AllowAirPlay,
            IOSCategoryOptions.AllowBluetooth,
            IOSCategoryOptions.AllowBluetoothA2DP,
          ],
        }
      : {}),
  } as Parameters<typeof TrackPlayer.setupPlayer>[0]);

  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      alwaysPauseOnInterruption: true,
      stopForegroundGracePeriod: 300,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
    ],
    // notificationCapabilities controls the buttons shown in the Android
    // media notification / lock screen. Without this the notification renders
    // no controls even though capabilities are set.
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
    ],
    progressUpdateEventInterval: 1,
  });

  playerReady = true;
}
