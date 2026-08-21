import { Platform } from "react-native";
import TrackPlayer, {
  Capability,
  AppKilledPlaybackBehavior,
  AndroidAudioContentType,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
} from "react-native-track-player";

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
  if (!TrackPlayer?.setupPlayer) {
    return;
  }

  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      autoUpdateMetadata: true,
      androidAudioContentType: AndroidAudioContentType?.Music ?? 2,
      minBuffer: 15,
      maxBuffer: 30,
      playBuffer: 2.5,
      backBuffer: 5,
      ...(Platform.OS === "ios"
        ? {
            iosCategory: IOSCategory?.Playback ?? "playback",
            iosCategoryMode: IOSCategoryMode?.Default ?? "default",
            iosCategoryOptions: [
              IOSCategoryOptions?.AllowAirPlay ?? 1,
              IOSCategoryOptions?.AllowBluetooth ?? 2,
              IOSCategoryOptions?.AllowBluetoothA2DP ?? 8,
            ],
          }
        : {}),
    });
  } catch (error) {
    if (!isAlreadyInitialized(error)) throw error;
  }

  if (TrackPlayer.updateOptions) {
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification ??
          "stop-playback-and-remove-notification",
        alwaysPauseOnInterruption: false,
        stopForegroundGracePeriod: 5,
      },
      // Capabilities exposed to MediaSession (Android Auto, lock screen, Android 13+ player state)
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      // Exactly 3 notification buttons: [0: Previous, 1: Play/Pause Toggle, 2: Next]
      notificationCapabilities: [
        Capability.SkipToPrevious,
        Capability.Play,
        Capability.SkipToNext,
      ],
      // Compact notification view
      compactCapabilities: [
        Capability.SkipToPrevious,
        Capability.Play,
        Capability.SkipToNext,
      ],
      progressUpdateEventInterval: 0.5,
    });
  }
}
