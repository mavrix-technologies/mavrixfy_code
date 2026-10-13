import * as ScreenOrientation from "expo-screen-orientation";
import { IS_WEB } from "@/constants/platform";

let orientationRequest = 0;
let orientationQueue = Promise.resolve();

// Native lock requests must finish in order, including across player remounts.
// A late landscape request must never override a newer portrait restoration.
export function setStandByOrientation(enabled: boolean): Promise<boolean> {
  if (IS_WEB) return Promise.resolve(true);

  const request = ++orientationRequest;
  const lock = enabled ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT : ScreenOrientation.OrientationLock.PORTRAIT_UP;
  let applied = false;

  orientationQueue = orientationQueue.then(async () => {
    if (request !== orientationRequest) return;
    try {
      await ScreenOrientation.lockAsync(lock);
      applied = true;
    } catch {
      // Split-screen can refuse a lock. StandBy still renders with the actual
      // available window rather than falling back to sensor activation.
    }
  }).catch(() => {
    // Orientation may be unavailable or refused by the OS. Layout follows the
    // actual window size, so a failed lock does not break the player.
  });

  return orientationQueue.then(() => applied);
}
