import { getSettings,isHighQualityEntitled,saveSettings } from "@/lib/storage";
import { runRewardedAd } from "./rewardedAdService";

export const DEFAULT_HIGH_QUALITY_DURATION_HOURS = 0;

/**
 * Checks if the user currently holds an active High Quality entitlement.
 */
export async function isHighQualityUnlocked(): Promise<boolean> {
  try {
    const settings = await getSettings();
    return isHighQualityEntitled(settings);
  } catch {
    return false;
  }
}

/**
 * Grants High Quality entitlement permanently (kept after one-time unlock).
 */
export async function unlockHighQuality(_durationHours?: number): Promise<void> {
  await saveSettings({ streamingQuality: "high", highQualityUnlocked: true, highQualityExpiresAt: null });
}

/**
 * Directly runs the Rewarded Ad to unlock High Quality (Up to 320 kbps).
 * Clean and direct: no confirmation dialogs, no loading spinners, no extra elements.
 * Returns true if High Quality is unlocked.
 */
export async function requestHighQualityUnlockWithRewardedAd(
  _onLoadingChange?: (loading: boolean) => void
): Promise<boolean> {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (isDev) {
    await unlockHighQuality();
    return true;
  }

  if (await isHighQualityUnlocked()) {
    return saveSettings({ streamingQuality: "high" }).then(() => true);
  }

  return runRewardedAd().then((result) => {
    // Unsupported runtimes retain free access; a dismissed or failed ad grants no reward.
    if (result !== "earned" && result !== "unavailable") return false;
    return unlockHighQuality().then(() => true);
  });
}
