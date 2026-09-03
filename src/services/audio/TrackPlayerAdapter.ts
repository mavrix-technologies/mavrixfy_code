import { PermissionsAndroid, Platform } from "react-native";
import TrackPlayer, {
  Capability,
  AppKilledPlaybackBehavior,
  AndroidAudioContentType,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
} from "react-native-track-player";
import { logger } from "@/lib/logger";

export async function trackPlayerService() {
  try {
    const Event = require("react-native-track-player").Event;
    if (!TrackPlayer?.addEventListener || !Event) return;

    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      TrackPlayer.play().catch(() => {});
    });
    TrackPlayer.addEventListener(Event.RemotePause, () => {
      TrackPlayer.pause().catch(() => {});
    });
    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      TrackPlayer.stop().catch(() => {});
    });
    TrackPlayer.addEventListener(Event.RemoteNext, () => {
      TrackPlayer.skipToNext().catch(() => {});
    });
    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
      TrackPlayer.skipToPrevious().catch(() => {});
    });
    TrackPlayer.addEventListener(Event.RemoteSeek, (event: { position: number }) => {
      if (typeof event?.position === "number") {
        TrackPlayer.seekTo(event.position).catch(() => {});
      }
    });
    TrackPlayer.addEventListener(
      Event.RemoteDuck,
      async (event: { paused?: boolean; permanent?: boolean; ducking?: boolean }) => {
        if (event?.permanent) {
          TrackPlayer.stop().catch(() => {});
        } else if (event?.paused) {
          TrackPlayer.pause().catch(() => {});
        }
      }
    );

    TrackPlayer.addEventListener(Event.PlaybackError, (error: any) => {
      logger.error("[TrackPlayer] Playback error:", error);
      if (error?.code) logger.error("[TrackPlayer] Error code:", error.code);
      if (error?.message) logger.error("[TrackPlayer] Error message:", error.message);
    });
  } catch (error) {
    logger.error("[TrackPlayer] Service registration failed:", error);
  }
}

let playerReady = false;
let setupPromise: Promise<void> | null = null;

function isAlreadyInitialized(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === "player_already_initialized";
}

export async function setupPlayer(): Promise<void> {
  logger.info("[TrackPlayerAdapter] setupPlayer called, playerReady =", playerReady);
  if (playerReady) return;
  if (setupPromise) return setupPromise;

  setupPromise = setupPlayerInternal();
  try {
    await setupPromise;
    playerReady = true;
    logger.info("[TrackPlayerAdapter] setupPlayer completed successfully!");
  } catch (error) {
    logger.error("[TrackPlayerAdapter] setupPlayer failed:", error);
    setupPromise = null;
    throw error;
  }
}

async function setupPlayerInternal(): Promise<void> {
  if (!TrackPlayer?.setupPlayer) {
    logger.error("[TrackPlayerAdapter] TrackPlayer.setupPlayer method is missing!");
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
    logger.info("[TrackPlayerAdapter] Calling TrackPlayer.setupPlayer...");
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
    logger.info("[TrackPlayerAdapter] Calling TrackPlayer.updateOptions...");
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
    logger.info("[TrackPlayerAdapter] TrackPlayer.updateOptions configured successfully!");
  }
}
