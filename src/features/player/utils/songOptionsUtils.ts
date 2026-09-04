import { router } from "expo-router";

export function dismissOptions() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)");
  }
}
