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
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
    ],
    progressUpdateEventInterval: 1,
  });

  playerReady = true;
}
