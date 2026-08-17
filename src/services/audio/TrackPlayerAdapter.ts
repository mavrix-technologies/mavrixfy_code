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
      minBuffer: 30,
      maxBuffer: 50,
      playBuffer: 5,
      backBuffer: 10,
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
        // Official RNTP AppKilledPlaybackBehavior:
        // StopPlaybackAndRemoveNotification — stops audio AND removes the
        // media notification when user swipes the app away from recents.
        // (ContinuePlayback was set before, which caused music to keep
        //  playing even after the app was fully killed — wrong behavior.)
        appKilledPlaybackBehavior:
          AppKilled.StopPlaybackAndRemoveNotification ??
          'stop-playback-and-remove-notification',
        alwaysPauseOnInterruption: false,
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
      // Official Android MediaStyle notification: 3 compact slots (Previous, Play/Pause, Next).
      // Play maps to the PLAY_PAUSE toggle button in KotlinAudio.
      notificationCapabilities: [
        Cap.SkipToPrevious,
        Cap.Play,
        Cap.SkipToNext,
      ].filter(Boolean),
      compactCapabilities: [
        Cap.SkipToPrevious,
        Cap.Play,
        Cap.SkipToNext,
      ].filter(Boolean),
      progressUpdateEventInterval: 1,
    });
  }
}
