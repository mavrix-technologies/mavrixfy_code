import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule, initializeMobileAds } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";

const MIN_INTERVAL_BETWEEN_INTERSTITIALS_MS = 6 * 60 * 1000; // 6 minutes minimum cooldown
const MIN_NAVIGATIONS_BEFORE_AD = 4; // At least 4 screen transitions before showing an ad

let lastAdShowTimestamp = 0;
let navigationCount = 0;
let interstitialInstance: any = null;
let isAdLoaded = false;
let isAdLoading = false;

/**
 * Preloads the interstitial ad in background so it's ready when a transition occurs.
 */
export async function preloadInterstitialAd(): Promise<void> {
  const adsModule = getGoogleMobileAdsModule();
  const unitId = AD_UNITS.INTERSTITIAL;

  if (!adsModule || !unitId || isAdLoaded || isAdLoading) {
    return;
  }

  try {
    isAdLoading = true;
    await initializeMobileAds();

    const { InterstitialAd, AdEventType } = adsModule;
    const interstitial = InterstitialAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      isAdLoaded = true;
      isAdLoading = false;
      interstitialInstance = interstitial;
    });

    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      isAdLoaded = false;
      interstitialInstance = null;
      lastAdShowTimestamp = Date.now();
      unsubLoaded();
      unsubClosed();
      unsubError();
      // Preload next ad after cooldown
      setTimeout(() => {
        void preloadInterstitialAd();
      }, 5000);
    });

    const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
      logger.warn("[Ads] Interstitial ad failed to load:", error);
      isAdLoaded = false;
      isAdLoading = false;
      interstitialInstance = null;
      unsubLoaded();
      unsubClosed();
      unsubError();
    });

    interstitial.load();
  } catch (err) {
    logger.warn("[Ads] Error initializing interstitial ad:", err);
    isAdLoaded = false;
    isAdLoading = false;
  }
}

const MIN_SKIPS_BEFORE_AD = 5; // 5 consecutive skips (Spotify / JioSaavn model)
let consecutiveSkipCount = 0;

/**
 * Records a track skip action and shows an interstitial if 5+ skips have occurred.
 * Safe & natural transition: only triggers on explicit user skip, never during continuous song playback.
 */
export function recordSkipAndCheckInterstitial(): void {
  consecutiveSkipCount += 1;
  const now = Date.now();

  if (consecutiveSkipCount < MIN_SKIPS_BEFORE_AD) {
    return;
  }

  if (now - lastAdShowTimestamp < MIN_INTERVAL_BETWEEN_INTERSTITIALS_MS) {
    return;
  }

  if (isAdLoaded && interstitialInstance) {
    try {
      consecutiveSkipCount = 0;
      lastAdShowTimestamp = now;
      interstitialInstance.show();
    } catch (err) {
      logger.warn("[Ads] Failed to show skip interstitial ad:", err);
    }
  } else {
    void preloadInterstitialAd();
  }
}

/**
 * Records a navigation event and shows an interstitial if cooldown & frequency thresholds are met.
 * Strictly avoids interrupting active tasks or continuous playback.
 */
export function recordNavigationAndCheckInterstitial(): void {
  navigationCount += 1;
  const now = Date.now();

  if (navigationCount < MIN_NAVIGATIONS_BEFORE_AD) {
    return;
  }

  if (now - lastAdShowTimestamp < MIN_INTERVAL_BETWEEN_INTERSTITIALS_MS) {
    return;
  }

  if (isAdLoaded && interstitialInstance) {
    try {
      navigationCount = 0;
      lastAdShowTimestamp = now;
      interstitialInstance.show();
    } catch (err) {
      logger.warn("[Ads] Failed to show interstitial ad:", err);
    }
  } else {
    // If not loaded, trigger a preload for upcoming transitions
    void preloadInterstitialAd();
  }
}
