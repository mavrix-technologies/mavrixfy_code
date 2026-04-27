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
          // Keep the native player alive when the phone UI is swiped away.
          // Android Auto reconnects to this background session.
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
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
        // Emit native progress often enough for smooth Android Auto/session sync
        // without waiting a full second between updates.
        progressUpdateEventInterval: 0.5,
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
        const playerOptions = {
            maxCacheSize: 1024 * 50, // 50 MB cache
            autoUpdateMetadata: true,
            autoHandleInterruptions: true,
            // RNTP normally rejects Android setup while the app is backgrounded.
            // Our patched native module permits this for Android Auto/headless playback.
            allowBackgroundSetup: true,
          } as any;

        await withTimeout(
          TrackPlayer.setupPlayer(playerOptions),
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
