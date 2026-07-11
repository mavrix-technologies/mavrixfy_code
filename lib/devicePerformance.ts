import { Platform } from "react-native";
import * as Device from "expo-device";

const ANDROID_LOW_RAM_FEATURE = "android.hardware.ram.low";
// Devices with ≤3 GB RAM get low-end treatment for the video backdrop.
// 4 GB was too aggressive — caught most mid-range phones that can handle a muted WebView fine.
// 3 GB covers the actual struggling tier (2/3 GB devices common in India/SE Asia markets).
const AMBIENT_VIDEO_MIN_MEMORY_BYTES = 3 * 1024 * 1024 * 1024;

export type DevicePerformanceProfile = {
  isLowEndDevice: boolean;
  source: "android-low-ram-feature" | "memory-budget" | "unsupported-platform" | "unavailable";
};

export async function getDevicePerformanceProfile(): Promise<DevicePerformanceProfile> {
  if (Platform.OS !== "android") {
    return { isLowEndDevice: false, source: "unsupported-platform" };
  }

  try {
    const isAndroidLowRam = await Device.hasPlatformFeatureAsync(ANDROID_LOW_RAM_FEATURE);
    if (isAndroidLowRam) {
      return { isLowEndDevice: true, source: "android-low-ram-feature" };
    }

    if (Device.totalMemory !== null && Device.totalMemory <= AMBIENT_VIDEO_MIN_MEMORY_BYTES) {
      return { isLowEndDevice: true, source: "memory-budget" };
    }

    return {
      isLowEndDevice: false,
      source: "android-low-ram-feature",
    };
  } catch {
    return { isLowEndDevice: false, source: "unavailable" };
  }
}
