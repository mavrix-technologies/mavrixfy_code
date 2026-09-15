import { Platform } from "react-native";

// Set to false for real production AdMob ad unit IDs
const IS_TEST_MODE = false;

export const AD_UNITS = {
  // 1. Official Banner Ad
  BANNER: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/2934735716" // iOS official test Banner ID
      : "ca-app-pub-6003470714469240/1788794195", // iOS production Banner ID
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/6300978111" // Android official test Banner ID
      : "ca-app-pub-6003470714469240/1788794195", // Android production Banner ID
    default: "",
  }) || "",

  // 2. Rewarded Video Ad (Used to unlock high quality sound & offline downloads)
  REWARDED: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/1712485313" // iOS official test Rewarded ID
      : "ca-app-pub-6003470714469240/1484577834", // iOS production Rewarded ID
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/5224354917" // Android official test Rewarded ID
      : "ca-app-pub-6003470714469240/1484577834", // Android production Rewarded ID
    default: "",
  }) || "",

  // 3. Native Video Ad / Showcase
  NATIVE_VIDEO: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/2521693316" // iOS official test Native Video ID
      : "ca-app-pub-6003470714469240/2135402846", // iOS production Native Video ID
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/1044960115" // Android official test Native Video ID
      : "ca-app-pub-6003470714469240/2135402846", // Android production Native Video ID
    default: "",
  }) || "",

  // 4. Interstitial Ad
  INTERSTITIAL: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/4411468910" // iOS official test Interstitial ID
      : "ca-app-pub-6003470714469240/2135402846", // iOS production Interstitial ID
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/1033173712" // Android official test Interstitial ID
      : "ca-app-pub-6003470714469240/2135402846", // Android production Interstitial ID
    default: "",
  }) || "",

  // Standard Native alias for backwards compatibility
  NATIVE: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/3986693108"
      : "ca-app-pub-6003470714469240/1788794195",
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/2247696110"
      : "ca-app-pub-6003470714469240/1788794195",
    default: "",
  }) || "",
};


