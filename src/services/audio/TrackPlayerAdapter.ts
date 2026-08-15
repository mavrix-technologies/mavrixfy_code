import { PermissionsAndroid, Platform } from "react-native";

let playerReady = false;
let setupPromise: Promise<void> | null = null;

function getTrackPlayerModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-track-player");
  } catch {
    return null;
  }
}

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
  const TrackPlayerModule = getTrackPlayerModule();
  if (!TrackPlayerModule) {
    return;
  }
  const TrackPlayer = TrackPlayerModule.default ?? TrackPlayerModule;
  if (!TrackPlayer?.setupPlayer) {
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
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      autoUpdateMetadata: true,
      androidAudioContentType: TrackPlayerModule.AndroidAudioContentType?.Music ?? 2,
      minBuffer: 15,
      maxBuffer: 50,
      playBuffer: 2,
      backBuffer: 30,
      ...(Platform.OS === "ios"
        ? {
            iosCategory: TrackPlayerModule.IOSCategory?.Playback ?? "playback",
            iosCategoryMode: TrackPlayerModule.IOSCategoryMode?.Default ?? "default",
            iosCategoryOptions: [
              TrackPlayerModule.IOSCategoryOptions?.AllowAirPlay ?? 1,
              TrackPlayerModule.IOSCategoryOptions?.AllowBluetooth ?? 2,
              TrackPlayerModule.IOSCategoryOptions?.AllowBluetoothA2DP ?? 8,
            ],
          }
        : {}),
    });
  } catch (error) {
    if (!isAlreadyInitialized(error)) throw error;
  }

  if (TrackPlayer.updateOptions) {
    const Cap = TrackPlayerModule.Capability ?? {};
    const AppKilled = TrackPlayerModule.AppKilledPlaybackBehavior ?? {};
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilled.ContinuePlayback ?? 0,
        alwaysPauseOnInterruption: true,
        stopForegroundGracePeriod: 5,
      },
      capabilities: [
        Cap.Play,
        Cap.Pause,
        Cap.SkipToNext,
        Cap.SkipToPrevious,
        Cap.SeekTo,
        Cap.Stop,
      ].filter(Boolean),
      notificationCapabilities: [
        Cap.Play,
        Cap.Pause,
        Cap.SkipToNext,
        Cap.SkipToPrevious,
        Cap.SeekTo,
      ].filter(Boolean),
      compactCapabilities: [
        Cap.Play,
        Cap.Pause,
        Cap.SkipToNext,
      ].filter(Boolean),
      progressUpdateEventInterval: 1,
    });
  }
}
