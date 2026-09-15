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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    let unsubLoaded = () => {};
    let unsubEarned = () => {};
    let unsubClosed = () => {};
    let unsubError = () => {};

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try { unsubLoaded(); } catch {}
      try { unsubEarned(); } catch {}
      try { unsubClosed(); } catch {}
      try { unsubError(); } catch {}
    };

    const resolveEntitlementResult = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    // Fallback timer in case ad network hangs indefinitely
    timeoutId = setTimeout(async () => {
      logger.warn("[Ads] Rewarded ad request timed out. Unlocking High Quality directly.");
      await unlockHighQuality();
      resolveEntitlementResult(true);
    }, 6000);

    void (async () => {
      try {
        await initializeMobileAds();
        const { RewardedAd, RewardedAdEventType, AdEventType } = adsModule;
        const rewarded = RewardedAd.createForAdRequest(AD_UNITS.REWARDED, {
          requestNonPersonalizedAdsOnly: true,
        });

        unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          try {
            rewarded.show();
          } catch (err) {
            logger.warn("[Ads] Failed to show rewarded ad, unlocking gracefully:", err);
            void (async () => {
              await unlockHighQuality();
              resolveEntitlementResult(true);
            })();
          }
        });

        unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          // Reward flag noted
        });

        unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, async () => {
          await unlockHighQuality();
          resolveEntitlementResult(true);
        });

        unsubError = rewarded.addAdEventListener(AdEventType.ERROR, async (err: unknown) => {
          logger.warn("[Ads] Rewarded ad failed to load, unlocking gracefully:", err);
          await unlockHighQuality();
          resolveEntitlementResult(true);
        });

        rewarded.load();
      } catch (err) {
        logger.warn("[Ads] Error triggering rewarded ad, unlocking gracefully:", err);
        await unlockHighQuality();
        resolveEntitlementResult(true);
      }
    })();
  });
}
