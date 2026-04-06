import { Platform } from "react-native";
import * as ExpoHaptics from "expo-haptics";
import { getSettings } from "@/lib/storage";

let cachedEnabled: boolean | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 3000;

export function setHapticsPreference(enabled: boolean): void {
  cachedEnabled = enabled;
  cacheTime = Date.now();
}

async function isHapticsEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const now = Date.now();
  if (cachedEnabled !== null && now - cacheTime < CACHE_TTL_MS) {
    return cachedEnabled;
  }

  const settings = await getSettings();
  cachedEnabled = Boolean(settings.hapticsEnabled);
  cacheTime = now;
  return cachedEnabled;
}

export async function triggerImpact(style: ExpoHaptics.ImpactFeedbackStyle): Promise<void> {
  if (!(await isHapticsEnabled())) return;
  await ExpoHaptics.impactAsync(style);
}

export async function triggerNotification(
  type: ExpoHaptics.NotificationFeedbackType
): Promise<void> {
  if (!(await isHapticsEnabled())) return;
  await ExpoHaptics.notificationAsync(type);
}
