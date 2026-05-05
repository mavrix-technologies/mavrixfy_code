import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
} from "react-native-track-player";
import { Platform } from "react-native";
import { logger } from "@/lib/logger";

let setupPromise: Promise<void> | null = null;
let hasSetupPlayer = false;

const PLAYER_SETUP_TIMEOUT_MS  = 12_000;
const PLAYER_OPTIONS_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`TrackPlayer ${label} timed out`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function configurePlayerOptions(): Promise<void> {
  try {
    await withTimeout(
      TrackPlayer.updateOptions({
        android: {
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
        progressUpdateEventInterval: 0.5,
      }),
      PLAYER_OPTIONS_TIMEOUT_MS,
      "updateOptions"
    );
  } catch (error) {
    logger.warn("[TrackPlayer] updateOptions failed", error);
  }
}

/**
 * Idempotent player setup — safe to call multiple times.
 * Subsequent calls return immediately once setup has completed.
 */
export async function setupPlayer(): Promise<void> {
  if (hasSetupPlayer) return;

  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await withTimeout(
          TrackPlayer.setupPlayer({
            maxCacheSize: 1024 * 50, // 50 MB
            autoUpdateMetadata: true,
            autoHandleInterruptions: true,
            // allowBackgroundSetup is Android-only (patched native module).
            // Do NOT pass it on iOS — it is not a valid option and can cause crashes.
            ...(Platform.OS === "android" ? { allowBackgroundSetup: true } : {}),
          } as Parameters<typeof TrackPlayer.setupPlayer>[0]),
          PLAYER_SETUP_TIMEOUT_MS,
          "setupPlayer"
        );
      } catch (error: any) {
        if (error?.code !== "player_already_initialized") throw error;
      }

      await configurePlayerOptions();
      hasSetupPlayer = true;
    })();
  }

  try {
    await setupPromise;
  } finally {
    if (!hasSetupPlayer) setupPromise = null;
  }
}
