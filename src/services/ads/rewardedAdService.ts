import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule,initializeMobileAds } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";

export type RewardResult = "earned" | "unavailable" | "cancelled" | "failed";
let showing = false;

export async function runRewardedAd(): Promise<RewardResult> {
  if (showing) return "cancelled";
  const ads = getGoogleMobileAdsModule();
  if (!ads || !AD_UNITS.REWARDED) return "unavailable";
  showing = true;
  try {
    return await new Promise<RewardResult>((resolve) => {
      let finished = false;
      let earned = false;
      const subscriptions: (() => void)[] = [];
      let timer: ReturnType<typeof setTimeout>;
      const finish = (result: RewardResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
        resolve(result);
      };
      timer = setTimeout(() => finish("failed"), 10000);
      void (async () => {
        try {
          await initializeMobileAds();
          if (finished) return;
          const ad = ads.RewardedAd.createForAdRequest(AD_UNITS.REWARDED, { requestNonPersonalizedAdsOnly: true });
          subscriptions.push(ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
            if (finished) return;
            clearTimeout(timer);
            timer = setTimeout(() => finish(earned ? "earned" : "failed"), 180000);
            void Promise.resolve().then(() => ad.show()).catch((error) => {
              logger.warn("[Ads] Rewarded ad could not be shown", error);
              finish("failed");
            });
          }));
          subscriptions.push(ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => { earned = true; }));
          subscriptions.push(ad.addAdEventListener(ads.AdEventType.CLOSED, () => finish(earned ? "earned" : "cancelled")));
          subscriptions.push(ad.addAdEventListener(ads.AdEventType.ERROR, () => finish("failed")));
          ad.load();
        } catch (error) {
          logger.warn("[Ads] Rewarded ad request failed", error);
          finish("failed");
        }
      })();
    });
  } finally {
    showing = false;
  }
}
