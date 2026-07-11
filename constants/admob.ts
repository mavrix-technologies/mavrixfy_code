import { Platform } from "react-native";

// Toggle this to true to force test ads, false to use real production ads.
// In __DEV__ mode test ads are always used to ensure the rewarded ad loads reliably.
const IS_TEST_MODE = __DEV__;

export const AD_UNITS = {
  // 1. Standard Native Ad (Used inside standard banner blocks and song lists)
  NATIVE: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/3986693108" // iOS official test Native ID
      : "ca-app-pub-6003470714469240/1788794195", // iOS production Native ID
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/2247696110" // Android official test Native ID
      : "ca-app-pub-6003470714469240/1788794195", // Android production Native ID
    default: "",
  }) || "",

  // 2. Native Video Ad (Used in search page top layout and homepage showcase cards)
  NATIVE_VIDEO: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/2521693316" // iOS official test Native Video ID
      : "ca-app-pub-6003470714469240/2135402846", // iOS production Native Video ID
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/1044960115" // Android official test Native Video ID
      : "ca-app-pub-6003470714469240/2135402846", // Android production Native Video ID
    default: "",
  }) || "",

  // 3. Rewarded Video Ad (Used to unlock high quality sound)
  REWARDED: Platform.select({
    ios: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/1712485313" // iOS official test Rewarded ID
      : "ca-app-pub-6003470714469240/1484577834", // iOS production Rewarded ID
    android: IS_TEST_MODE
      ? "ca-app-pub-3940256099942544/5224354917" // Android official test Rewarded ID
      : "ca-app-pub-6003470714469240/1484577834", // Android production Rewarded ID
    default: "",
  }) || "",
};
