/**
 * Device Info — stable deviceId and platform metadata for download device registration.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib/logger";
import { IS_ANDROID, IS_IOS } from "@/constants/platform";

const KEY_DEVICE_ID = "@mavrixfy_device_id";

let cachedDeviceId: string | null = null;

/** Generate a random UUID-like string. */
function generateId(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

/**
 * Returns a stable device ID that persists across app restarts.
 * Generated once and stored in AsyncStorage.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const stored = await AsyncStorage.getItem(KEY_DEVICE_ID);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }

    const newId = generateId();
    await AsyncStorage.setItem(KEY_DEVICE_ID, newId);
    cachedDeviceId = newId;
    return newId;
  } catch (err) {
    logger.error("[DeviceInfo] getDeviceId failed", err);
    // Return a session-only ID as fallback.
    const fallback = generateId();
    cachedDeviceId = fallback;
    return fallback;
  }
}

export interface DeviceInfo {
  platform: "android" | "ios" | "web";
  appVersion: string;
  modelName: string;
}

/** Returns basic device metadata for Firestore device registration. */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  let modelName = "Unknown Device";

  // Try to get the device model name from expo-device if available.
  try {
    const Device = require("expo-device");
    modelName = Device.modelName ?? Device.deviceName ?? "Unknown Device";
  } catch {
    // expo-device not available — use platform string.
    modelName = IS_ANDROID ? "Android Device" : IS_IOS ? "iOS Device" : "Web";
  }

  let appVersion = "1.0.0";
  try {
    const Constants = require("expo-constants");
    appVersion =
      Constants.default?.nativeAppVersion ??
      Constants.default?.expoConfig?.version ??
      Constants.default?.manifest?.version ??
      "1.0.0";
  } catch {
    // ignore
  }

  const platform: "android" | "ios" | "web" =
    IS_ANDROID ? "android" : IS_IOS ? "ios" : "web";

  return { platform, appVersion, modelName };
}
