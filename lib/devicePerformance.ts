import { Platform } from "react-native";
import * as Device from "expo-device";

const ANDROID_LOW_RAM_FEATURE = "android.hardware.ram.low";
const AMBIENT_VIDEO_MIN_MEMORY_BYTES = 4 * 1024 * 1024 * 1024;

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
