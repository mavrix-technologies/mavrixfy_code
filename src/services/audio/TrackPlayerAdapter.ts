import TrackPlayer, {
  AndroidAudioContentType,
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
} from "react-native-track-player";
import { PermissionsAndroid, Platform } from "react-native";

let playerReady = false;
let setupPromise: Promise<void> | null = null;

function isAlreadyInitialized(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === "player_already_initialized";
}

export async function setupPlayer(): Promise<void> {
  if (playerReady) return;
  if (setupPromise) return setupPromise;

  setupPromise = setupPlayerInternal();
  try {
    await setupPromise;
    playerReady = true;
  } catch (error) {
    setupPromise = null;
    throw error;
  }
}

async function setupPlayerInternal(): Promise<void> {
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      // non-fatal
    }
  }

  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      autoUpdateMetadata: true,
      androidAudioContentType: AndroidAudioContentType.Music,
      minBuffer: 15,
      maxBuffer: 50,
      playBuffer: 2,
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
    });
  } catch (error) {
    if (!isAlreadyInitialized(error)) throw error;
  }

  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      alwaysPauseOnInterruption: true,
      stopForegroundGracePeriod: 5,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
    ],
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
}
