import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule, initializeMobileAds } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";
import { getSettings, saveSettings, isHighQualityEntitled, setHighQualityEntitlement } from "@/lib/storage";

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
  await Promise.all([
    setHighQualityEntitlement(true, null),
    saveSettings({ streamingQuality: "high", highQualityUnlocked: true, highQualityExpiresAt: null }),
  ]);
}

/**
 * Directly runs the Rewarded Ad to unlock High Quality (Up to 320 kbps).
 * Clean and direct: no confirmation dialogs, no loading spinners, no extra elements.
 * Returns true if High Quality is unlocked.
 */
export async function requestHighQualityUnlockWithRewardedAd(
  _onLoadingChange?: (loading: boolean) => void
): Promise<boolean> {
  const alreadyUnlocked = await isHighQualityUnlocked();
  if (alreadyUnlocked) {
    await saveSettings({ streamingQuality: "high" });
    return true;
  }

  const adsModule = getGoogleMobileAdsModule();
  if (!adsModule || !AD_UNITS.REWARDED) {
    logger.warn("[Ads] Rewarded ads unavailable. Unlocking directly.");
    await unlockHighQuality();
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let rewardEarned = false;

    const finish = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    void (async () => {
      try {
        await initializeMobileAds();
        const { RewardedAd, RewardedAdEventType, AdEventType } = adsModule;
        const rewarded = RewardedAd.createForAdRequest(AD_UNITS.REWARDED, {
          requestNonPersonalizedAdsOnly: true,
        });

        const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
          try {
            rewarded.show();
          } catch (err) {
            logger.warn("[Ads] Failed to show rewarded ad:", err);
            finish(false);
          }
        });

        const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          rewardEarned = true;
        });

        const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, async () => {
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();

          if (rewardEarned) {
            await unlockHighQuality();
            finish(true);
          } else {
            finish(false);
          }
        });

        const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (err: unknown) => {
          logger.warn("[Ads] Rewarded ad failed to load:", err);
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();
          finish(false);
        });

        rewarded.load();
      } catch (err) {
        logger.warn("[Ads] Error triggering rewarded ad:", err);
        finish(false);
      }
    })();
  });
}
