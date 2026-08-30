import { PermissionsAndroid, Platform } from "react-native";
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
  console.log("[TrackPlayerAdapter] setupPlayer called, playerReady =", playerReady);
  if (playerReady) return;
  if (setupPromise) return setupPromise;

  setupPromise = setupPlayerInternal();
  try {
    await setupPromise;
    playerReady = true;
    console.log("[TrackPlayerAdapter] setupPlayer completed successfully!");
  } catch (error) {
    console.error("[TrackPlayerAdapter] setupPlayer failed:", error);
    setupPromise = null;
    throw error;
  }
}

async function setupPlayerInternal(): Promise<void> {
  if (!TrackPlayer?.setupPlayer) {
    console.error("[TrackPlayerAdapter] TrackPlayer.setupPlayer method is missing!");
    return;
  }

  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      // non-fatal
    }
  }

  try {
    console.log("[TrackPlayerAdapter] Calling TrackPlayer.setupPlayer...");
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      autoUpdateMetadata: true,
      androidAudioContentType: AndroidAudioContentType?.Music ?? 2,
      minBuffer: 30,
      maxBuffer: 50,
      playBuffer: 5,
      backBuffer: 10,
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
    console.log("[TrackPlayerAdapter] Calling TrackPlayer.updateOptions...");
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification ??
          "stop-playback-and-remove-notification",
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
    console.log("[TrackPlayerAdapter] TrackPlayer.updateOptions configured successfully!");
  }
}
