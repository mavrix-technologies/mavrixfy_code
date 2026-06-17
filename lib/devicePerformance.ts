import { Platform } from "react-native";
import * as Device from "expo-device";

const ANDROID_LOW_RAM_FEATURE = "android.hardware.ram.low";

export type DevicePerformanceProfile = {
  isLowEndDevice: boolean;
  source: "android-low-ram-feature" | "unsupported-platform" | "unavailable";
};

export async function getDevicePerformanceProfile(): Promise<DevicePerformanceProfile> {
  if (Platform.OS !== "android") {
    return { isLowEndDevice: false, source: "unsupported-platform" };
  }

  try {
    return {
      isLowEndDevice: await Device.hasPlatformFeatureAsync(ANDROID_LOW_RAM_FEATURE),
      source: "android-low-ram-feature",
    };
  } catch {
    return { isLowEndDevice: false, source: "unavailable" };
  }
}
