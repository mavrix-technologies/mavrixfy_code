import { Alert } from "react-native";
import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule, initializeMobileAds } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";
import { getSettings, saveSettings, isHighQualityEntitled, setHighQualityEntitlement } from "@/lib/storage";

export const DEFAULT_HIGH_QUALITY_DURATION_HOURS = 2;

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
 * Grants High Quality entitlement for a given number of hours (default 2 hours).
 */
export async function unlockHighQuality(durationHours: number = DEFAULT_HIGH_QUALITY_DURATION_HOURS): Promise<void> {
  const expiresAt = Date.now() + Math.max(0.5, durationHours) * 60 * 60 * 1000;
  await setHighQualityEntitlement(true, expiresAt);
  await saveSettings({ streamingQuality: "high" });
}

/**
 * Presents an opt-in Rewarded Ad to unlock High Quality (Up to 320 kbps).
 * Returns true if High Quality is now unlocked and ready for playback.
 */
export async function requestHighQualityUnlockWithRewardedAd(): Promise<boolean> {
  const alreadyUnlocked = await isHighQualityUnlocked();
  if (alreadyUnlocked) {
    await saveSettings({ streamingQuality: "high" });
    return true;
  }

  const adsModule = getGoogleMobileAdsModule();
  if (!adsModule || !AD_UNITS.REWARDED) {
    // If ads are not available in current environment, unlock gracefully
    await unlockHighQuality(DEFAULT_HIGH_QUALITY_DURATION_HOURS);
    return true;
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      "Unlock High Quality Audio",
      `Watch a short video ad to unlock High Quality streaming (up to 320 kbps) for ${DEFAULT_HIGH_QUALITY_DURATION_HOURS} hours.`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Watch Ad",
          onPress: async () => {
            let isCleanedUp = false;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            let rewardEarned = false;

            try {
              await initializeMobileAds();
              const { RewardedAd, RewardedAdEventType, AdEventType } = adsModule;
              const rewarded = RewardedAd.createForAdRequest(AD_UNITS.REWARDED, {
                requestNonPersonalizedAdsOnly: true,
              });

              const cleanup = () => {
                if (isCleanedUp) return;
                isCleanedUp = true;
                if (timeoutId) {
                  clearTimeout(timeoutId);
                  timeoutId = null;
                }
                try { unsubLoaded(); } catch {}
                try { unsubEarned(); } catch {}
                try { unsubClosed(); } catch {}
                try { unsubError(); } catch {}
              };

              const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
                try {
                  rewarded.show();
                } catch (err) {
                  logger.warn("[Ads] Failed to show rewarded high quality ad:", err);
                  cleanup();
                  void unlockHighQuality(DEFAULT_HIGH_QUALITY_DURATION_HOURS).then(() => resolve(true));
                }
              });

              const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
                rewardEarned = true;
              });

              const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, async () => {
                cleanup();
                if (rewardEarned) {
                  await unlockHighQuality(DEFAULT_HIGH_QUALITY_DURATION_HOURS);
                  Alert.alert(
                    "High Quality Unlocked!",
                    `You now have High Quality (up to 320 kbps) streaming enabled for ${DEFAULT_HIGH_QUALITY_DURATION_HOURS} hours.`
                  );
                  resolve(true);
                } else {
                  resolve(false);
                }
              });

              const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (err: unknown) => {
                logger.warn("[Ads] Error loading high quality rewarded ad:", err);
                cleanup();
                // Graceful fallback if ad network fails
                void unlockHighQuality(DEFAULT_HIGH_QUALITY_DURATION_HOURS).then(() => resolve(true));
              });

              // 12-second load timeout guard
              timeoutId = setTimeout(() => {
                if (!isCleanedUp) {
                  cleanup();
                  void unlockHighQuality(DEFAULT_HIGH_QUALITY_DURATION_HOURS).then(() => resolve(true));
                }
              }, 12000);

              rewarded.load();
            } catch (err) {
              logger.warn("[Ads] Exception loading rewarded high quality ad:", err);
              await unlockHighQuality(DEFAULT_HIGH_QUALITY_DURATION_HOURS);
              resolve(true);
            }
          },
        },
      ]
    );
  });
}
