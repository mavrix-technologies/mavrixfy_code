import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

export type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");
export type GoogleNativeAd = import("react-native-google-mobile-ads").NativeAd;

let cachedModule: GoogleMobileAdsModule | null | undefined;
let warnedMissingModule = false;

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
      console.warn(
        "Google Mobile Ads native module is unavailable in this build. Ads will be hidden until a dev or release build includes react-native-google-mobile-ads."
      );
    }
  }

  return cachedModule;
}
