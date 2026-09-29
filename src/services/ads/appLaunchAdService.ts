import { AD_UNITS } from "@/constants/admob";
import { getGoogleMobileAdsModule,initializeMobileAds } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";

let hasShownLaunchAdThisSession = false;
let isLaunchAdLoadingOrShowing = false;
let lastLaunchAdTime = 0;
const LAUNCH_AD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes minimum cooldown between launch ads

/**
 * Triggers an interstitial/app-open ad when the app launches.
 * Features:
 * - Session-capped: Shows once per app launch session (with 5-minute cooldown).
 * - Non-blocking: 4-second safety timeout so slow networks never freeze the app.
 * - Error-safe: Silently cleans up on errors, timeouts, or missing native modules.
 */
export async function showAppLaunchAd(): Promise<void> {
  const now = Date.now();
  if (hasShownLaunchAdThisSession) return;
  if (now - lastLaunchAdTime < LAUNCH_AD_COOLDOWN_MS) return;
  if (isLaunchAdLoadingOrShowing) return;

  const adsModule = getGoogleMobileAdsModule();
  if (!adsModule) return;

  const adUnitId = AD_UNITS.INTERSTITIAL || AD_UNITS.APP_OPEN;
  if (!adUnitId) return;

  isLaunchAdLoadingOrShowing = true;

  try {
    await initializeMobileAds();
    const { InterstitialAd, AdEventType } = adsModule;

    const interstitial = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsubLoaded = () => {};
    let unsubClosed = () => {};
    let unsubError = () => {};

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try { unsubLoaded(); } catch {}
      try { unsubClosed(); } catch {}
      try { unsubError(); } catch {}
      isLaunchAdLoadingOrShowing = false;
    };

    // 4-second safety timeout: never freeze app on slow networks
    timeoutId = setTimeout(() => {
      logger.info("[Ads] Launch ad request timed out, continuing into app.");
      cleanup();
    }, 4000);

    unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        hasShownLaunchAdThisSession = true;
        lastLaunchAdTime = Date.now();
        interstitial.show();
      } catch (err) {
        logger.warn("[Ads] Failed to present launch ad:", err);
        cleanup();
      }
    });

    unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      cleanup();
    });

    unsubError = interstitial.addAdEventListener(AdEventType.ERROR, (err) => {
      logger.warn("[Ads] Launch ad load error:", err);
      cleanup();
    });

    interstitial.load();
  } catch (err) {
    logger.warn("[Ads] Launch ad exception:", err);
    isLaunchAdLoadingOrShowing = false;
  }
}
