import AsyncStorage from "@react-native-async-storage/async-storage";
import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule, initializeMobileAds } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";

const DOWNLOAD_PASSES_KEY = "@mavrixfy_unlocked_download_passes";
const DEFAULT_INITIAL_PASSES = 2; // Initial free download slots

export async function getRemainingDownloadPasses(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(DOWNLOAD_PASSES_KEY);
    if (val === null) {
      await AsyncStorage.setItem(DOWNLOAD_PASSES_KEY, String(DEFAULT_INITIAL_PASSES));
      return DEFAULT_INITIAL_PASSES;
    }
    return Math.max(0, parseInt(val, 10) || 0);
  } catch {
    return DEFAULT_INITIAL_PASSES;
  }
}

export async function addDownloadPasses(count: number): Promise<number> {
  try {
    const current = await getRemainingDownloadPasses();
    const next = current + count;
    await AsyncStorage.setItem(DOWNLOAD_PASSES_KEY, String(next));
    return next;
  } catch {
    return count;
  }
}

export async function consumeDownloadPass(): Promise<boolean> {
  try {
    const current = await getRemainingDownloadPasses();
    if (current <= 0) return false;
    await AsyncStorage.setItem(DOWNLOAD_PASSES_KEY, String(current - 1));
    return true;
  } catch {
    return true;
  }
}

/**
 * Checks if user has a download pass or directly runs the Rewarded Ad.
 * Returns true if the download should proceed.
 */
export async function requestDownloadWithRewardedAd(_songTitle: string): Promise<boolean> {
  const remaining = await getRemainingDownloadPasses();
  if (remaining > 0) {
    await consumeDownloadPass();
    return true;
  }

  const adsModule = getGoogleMobileAdsModule();
  if (!adsModule || !AD_UNITS.REWARDED) {
    // If ads are unavailable, allow download seamlessly
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
            logger.warn("[Ads] Failed to show rewarded download ad:", err);
            finish(true); // Graceful fallback
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
            await addDownloadPasses(2); // 3 unlocked - 1 consumed = 2 remaining
            finish(true);
          } else {
            finish(false);
          }
        });

        const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (err: unknown) => {
          logger.warn("[Ads] Rewarded download ad failed to load:", err);
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();
          finish(true); // Allow download if ad network fails
        });

        rewarded.load();
      } catch (err) {
        logger.warn("[Ads] Exception running rewarded download ad:", err);
        finish(true);
      }
    })();
  });
}
