import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
} from "react-native-track-player";
import { logger } from "@/lib/logger";

let setupPromise: Promise<void> | null = null;
let hasSetupPlayer = false;
const PLAYER_SETUP_TIMEOUT_MS = 12000;
const PLAYER_OPTIONS_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TrackPlayer ${label} timeout`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function configurePlayerOptions() {
  try {
    await withTimeout(
      TrackPlayer.updateOptions({
        android: {
          // Keep the notification available after the app leaves recents without
          // forcing playback to continue.
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.PausePlayback,
          alwaysPauseOnInterruption: true,
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.Skip,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.PlayFromId,
          Capability.PlayFromSearch,
        ],
        compactCapabilities: [
          Capability.SkipToPrevious,
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
        ],
        progressUpdateEventInterval: 1,
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.Skip,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.PlayFromId,
          Capability.PlayFromSearch,
        ],
      }),
      PLAYER_OPTIONS_TIMEOUT_MS,
      "updateOptions"
    );
  } catch (error) {
    logger.warn("[TrackPlayer] updateOptions failed", error);
  }
}

/**
 * Setup Track Player - Call this once when app starts
 * This is the main setup function used by PlayerContext
 */
export async function setupPlayer() {
  if (hasSetupPlayer) {
    return;
  }

  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await withTimeout(
          TrackPlayer.setupPlayer({
            maxCacheSize: 1024 * 50, // 50 MB cache
            autoUpdateMetadata: true,
            autoHandleInterruptions: true,
          }),
          PLAYER_SETUP_TIMEOUT_MS,
          "setupPlayer"
        );
      } catch (error: any) {
        if (error?.code !== "player_already_initialized") {
          throw error;
        }
      }

      await configurePlayerOptions();
      hasSetupPlayer = true;
    })();
  }

  try {
    await setupPromise;
  } finally {
    if (!hasSetupPlayer) {
      setupPromise = null;
    }
  }
}
