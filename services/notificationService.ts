/**
 * Enterprise Notification Service — Mavrixfy
 *
 * Responsibilities:
 *  - Permission handling
 *  - Device registration (token + metadata → Firestore)
 *  - Version checking (force update / optional update)
 *  - Notification channel setup (Android)
 *  - Foreground / tap listeners
 */

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform, NativeModules } from "react-native";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppVersionInfo {
  currentVersion: string;
  latestVersion: string;
  minimumVersion: string;
  forceUpdate: boolean;
  optionalUpdate: boolean;
  releaseNotes: string;
  storeUrl: string;
}

export interface DeviceRegistration {
  expoPushToken: string;
  nativePushToken: string;
  platform: string;
  appVersion: string;
  buildNumber: string;
  language: string;
  country: string;
  timezone: string;
  deviceModel: string;
  osVersion: string;
  enabled: boolean;
}

// ─── Notification Handler ─────────────────────────────────────────────────────

let handlerConfigured = false;

export function ensureNotificationHandler() {
  if (handlerConfigured) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  } catch (err) {
    logger.error("[NotifService] Failed to set handler:", err);
  }
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  ensureNotificationHandler();
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (err) {
    logger.error("[NotifService] Permission request failed:", err);
    return false;
  }
}

export async function getNotificationPermissionStatus(): Promise<Notifications.PermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return "undetermined" as Notifications.PermissionStatus;
  }
}

// ─── Android Channels ─────────────────────────────────────────────────────────

async function setupAndroidChannels() {
  if (Platform.OS !== "android") return;
  const channels = [
    { id: "mavrixfy-music",          name: "Music",           importance: Notifications.AndroidImportance.HIGH },
    { id: "mavrixfy-releases",       name: "New Releases",    importance: Notifications.AndroidImportance.HIGH },
    { id: "mavrixfy-recommendations",name: "Recommendations", importance: Notifications.AndroidImportance.DEFAULT },
    { id: "mavrixfy-downloads",      name: "Downloads",       importance: Notifications.AndroidImportance.LOW },
    { id: "mavrixfy-updates",        name: "App Updates",     importance: Notifications.AndroidImportance.MAX },
    { id: "mavrixfy-promotions",     name: "Promotions",      importance: Notifications.AndroidImportance.LOW },
    { id: "mavrixfy-default",        name: "General",         importance: Notifications.AndroidImportance.HIGH },
  ];

  await Promise.all(
    channels.map((ch) =>
      Notifications.setNotificationChannelAsync(ch.id, {
        name: ch.name,
        importance: ch.importance,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#26E19A",
        sound: "default",
      }).catch(() => {})
    )
  );
}

// ─── Device Metadata ──────────────────────────────────────────────────────────

function getDeviceLanguage(): string {
  try {
    const lang =
      (NativeModules.SettingsManager?.settings?.AppleLocale as string | undefined) ||
      (NativeModules.I18nManager?.localeIdentifier as string | undefined) ||
      "en";
    return lang.split(/[-_]/)[0] ?? "en";
  } catch {
    return "en";
  }
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

// ─── Device Registration ──────────────────────────────────────────────────────

/**
 * Full device registration:
 * 1. Request permission
 * 2. Get Expo push token + native FCM token
 * 3. Save to Firestore: users/{uid}/pushTokens/{tokenId}
 * 4. Data includes: version, language, timezone, model, OS
 */
export async function registerForPushNotificationsAsync(
  userId: string
): Promise<DeviceRegistration | null> {
  // iOS simulators don't support push
  if (!Device.isDevice && Platform.OS === "ios") {
    logger.info("[NotifService] Push not supported on iOS simulator");
    return null;
  }

  ensureNotificationHandler();
  await setupAndroidChannels();

  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      logger.info("[NotifService] Push permission not granted");
      return null;
    }

    // Expo push token (routes through Expo → FCM / APNs)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? "93293119-93b7-4dbb-acdd-7241771254c4";
    const expoTokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = expoTokenObj.data;

    // Native FCM / APNs token
    let nativePushToken = "";
    try {
      const nativeTokenObj = await Notifications.getDevicePushTokenAsync();
      nativePushToken = typeof nativeTokenObj.data === "string"
        ? nativeTokenObj.data
        : JSON.stringify(nativeTokenObj.data);
    } catch (err) {
      logger.warn("[NotifService] Could not get native token:", err);
    }

    const appVersion = Constants.expoConfig?.version ?? "0.0.0";
    const buildNumber =
      (Platform.OS === "android"
        ? Constants.expoConfig?.android?.versionCode?.toString()
        : Constants.expoConfig?.ios?.buildNumber) ?? "0";
    const language = getDeviceLanguage();
    const timezone = getTimezone();
    const deviceModel = Device.modelName ?? "Unknown";
    const osVersion = Device.osVersion ?? "Unknown";

    const registration: DeviceRegistration = {
      expoPushToken,
      nativePushToken,
      platform: Platform.OS,
      appVersion,
      buildNumber,
      language,
      country: "IN", // TODO: use locale for real country
      timezone,
      deviceModel,
      osVersion,
      enabled: true,
    };

    // Save to Firestore
    const tokenId = expoPushToken.replace(/[^a-zA-Z0-9-_]/g, "_");
    await setDoc(
      doc(db, "users", userId, "pushTokens", tokenId),
      {
        ...registration,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    return registration;
  } catch (err) {
    logger.error("[NotifService] Registration failed:", err);
    return null;
  }
}

// ─── Version Check ────────────────────────────────────────────────────────────

/**
 * Check app version against Firestore document:
 *   appVersions/mavrixfy
 *   { latestVersion, minimumVersion, forceUpdate, releaseNotes, storeUrl }
 *
 * Returns force/optional update info.
 */
export async function checkAppVersion(): Promise<AppVersionInfo | null> {
  try {
    const snap = await getDoc(doc(db, "appVersions", "mavrixfy"));
    if (!snap.exists()) return null;

    const data = snap.data();
    const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
    const latestVersion = (data.latestVersion as string) ?? currentVersion;
    const minimumVersion = (data.minimumVersion as string) ?? "0.0.0";

    const parseVersion = (v: string) =>
      v.split(".").map(Number).reduce((acc, n, i) => acc + n * 10 ** (6 - i * 2), 0);

    const current = parseVersion(currentVersion);
    const latest = parseVersion(latestVersion);
    const minimum = parseVersion(minimumVersion);

    return {
      currentVersion,
      latestVersion,
      minimumVersion,
      forceUpdate: current < minimum,
      optionalUpdate: current < latest,
      releaseNotes: (data.releaseNotes as string) ?? "",
      storeUrl:
        (data.storeUrl as string) ??
        "https://play.google.com/store/apps/details?id=com.mavrixfy.app",
    };
  } catch (err) {
    const code = String((err as { code?: unknown } | null | undefined)?.code || "");
    if (code === "permission-denied") {
      return null;
    }
    logger.warn("[NotifService] Version check failed:", err);
    return null;
  }
}

// ─── Notification Listeners ───────────────────────────────────────────────────

type NotifHandler = (n: Notifications.Notification) => void;
type ResponseHandler = (r: Notifications.NotificationResponse) => void;

export function registerNotificationListeners(
  onReceived?: NotifHandler,
  onResponse?: ResponseHandler
): () => void {
  ensureNotificationHandler();

  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    onReceived?.(n);
  });

  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    onResponse?.(r);
  });

  return () => {
    sub1.remove();
    sub2.remove();
  };
}
