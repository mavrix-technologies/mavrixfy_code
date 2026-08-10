import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { logger } from "@/lib/logger";

export type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");
export type GoogleNativeAd = import("react-native-google-mobile-ads").NativeAd;

let cachedModule: GoogleMobileAdsModule | null | undefined;
let warnedMissingModule = false;
let adsInitialized = false;

export function getGoogleMobileAdsModule(): GoogleMobileAdsModule | null {
  if (
    Platform.OS === "web" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === "expo"
  ) {
    return null;
  }

  if (cachedModule !== undefined) {
    return cachedModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require("react-native-google-mobile-ads") as GoogleMobileAdsModule;
  } catch {
    cachedModule = null;

    if (__DEV__ && !warnedMissingModule) {
      warnedMissingModule = true;
      logger.warn(
        "Google Mobile Ads native module is unavailable in this build. Ads will be hidden until a dev or release build includes react-native-google-mobile-ads."
      );
    }
  }

  return cachedModule;
}

/**
 * Initialize AdMob once. Call this before loading any ad.
 * In dev builds, EMULATOR is automatically a test device.
 * For physical device testing, get your test ID from logcat:
 *   adb logcat | grep "Use RequestConfiguration"
 * then add it to TEST_DEVICE_IDS below.
 */
const TEST_DEVICE_IDS: string[] = [
  // Add your physical device test ID here, e.g.:
  // "33BE2250B43518CCDA7DE426D04EE231",
];

export async function initializeMobileAds(): Promise<void> {
  if (adsInitialized) return;
  const mod = getGoogleMobileAdsModule();
  if (!mod) return;
  try {
    const { default: mobileAds, MaxAdContentRating } = mod;
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      testDeviceIdentifiers: TEST_DEVICE_IDS,
    });
    await mobileAds().initialize();
    adsInitialized = true;
  } catch (e) {
    logger.warn("[Ads] Failed to initialize AdMob:", e);
  }
}
