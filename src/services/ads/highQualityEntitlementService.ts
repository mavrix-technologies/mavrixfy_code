import { Alert } from "react-native";
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
 * Presents an opt-in Rewarded Ad to unlock High Quality (Up to 320 kbps).
 * Returns true if High Quality is now unlocked and ready for playback.
 */
export async function requestHighQualityUnlockWithRewardedAd(
  onLoadingChange?: (loading: boolean) => void
): Promise<boolean> {
  const alreadyUnlocked = await isHighQualityUnlocked();
  if (alreadyUnlocked) {
    await saveSettings({ streamingQuality: "high" });
    return true;
  }

  const adsModule = getGoogleMobileAdsModule();
  if (!adsModule || !AD_UNITS.REWARDED) {
    // If ads are not available in current environment, unlock gracefully
    await unlockHighQuality();
    return true;
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      "Unlock High Quality Audio",
      "Watch a short video ad to permanently unlock High Quality streaming (up to 320 kbps).",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            onLoadingChange?.(false);
            resolve(false);
          },
        },
        {
          text: "Watch Ad",
          onPress: async () => {
            if (__DEV__) {
              onLoadingChange?.(false);
              await unlockHighQuality();
              Alert.alert(
                "High Quality Unlocked",
                "High Quality (up to 320 kbps) streaming enabled permanently."
              );
              resolve(true);
              return;
            }

            onLoadingChange?.(true);
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
                onLoadingChange?.(false);
                try { unsubLoaded(); } catch {}
                try { unsubEarned(); } catch {}
                try { unsubClosed(); } catch {}
                try { unsubError(); } catch {}
              };

              const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
                try {
                  onLoadingChange?.(false);
                  rewarded.show();
                } catch (err) {
                  logger.warn("[Ads] Failed to show rewarded high quality ad:", err);
                  cleanup();
                  void unlockHighQuality().then(() => resolve(true));
                }
              });

              const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
                rewardEarned = true;
              });

              const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, async () => {
                cleanup();
                if (rewardEarned) {
                  await unlockHighQuality();
                  Alert.alert(
                    "High Quality Unlocked!",
                    "You now have High Quality (up to 320 kbps) streaming enabled permanently."
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
                void unlockHighQuality().then(() => resolve(true));
              });

              // 5-second load timeout guard for responsive fallback
              timeoutId = setTimeout(() => {
                if (!isCleanedUp) {
                  logger.info("[Ads] Rewarded ad load timed out after 5s; unlocking High Quality gracefully.");
                  cleanup();
                  void unlockHighQuality().then(() => resolve(true));
                }
              }, 5000);

              rewarded.load();
            } catch (err) {
              logger.warn("[Ads] Exception loading rewarded high quality ad:", err);
              onLoadingChange?.(false);
              await unlockHighQuality();
              resolve(true);
            }
          },
        },
      ]
    );
  });
}
