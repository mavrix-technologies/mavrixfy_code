import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type NotificationsModule = typeof import("expo-notifications");
type Notification = import("expo-notifications").Notification;
type NotificationResponse = import("expo-notifications").NotificationResponse;

const EXPO_GO_EXECUTION_ENVIRONMENT = "storeClient";

let notificationsPromise: Promise<NotificationsModule> | null = null;
let notificationHandlerConfigured = false;

export function isExpoGoRuntime() {
  return (
    Constants.executionEnvironment === EXPO_GO_EXECUTION_ENVIRONMENT ||
    Constants.appOwnership === "expo" ||
    Constants.expoGoConfig != null
  );
}

async function getNotifications(): Promise<NotificationsModule | null> {
  if (isExpoGoRuntime()) {
    return null;
  }

  notificationsPromise ??= import("expo-notifications");
  const Notifications = await notificationsPromise;

  if (!notificationHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerConfigured = true;
  }

  return Notifications;
}

/**
 * Registers the device for push notifications and returns the tokens.
 * Saves the token to Firestore for the given user ID.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === "granted";
}

export async function registerForPushNotificationsAsync(userId: string): Promise<{ expoPushToken?: string; nativePushToken?: string } | null> {
  const Notifications = await getNotifications();
  if (!Notifications) {
    console.log("Push notifications require a development build; skipping Expo Go registration.");
    return null;
  }

  // Allow Android emulators but block iOS simulators (since iOS simulator has no FCM/APNs support out of the box)
  if (!Device.isDevice && Platform.OS === "ios") {
    console.log("Must use physical device for Push Notifications on iOS");
    return null;
  }

  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.log("Failed to get push token: permission not granted");
      return null;
    }

    // 2. Get Expo Push Token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || "93293119-93b7-4dbb-acdd-7241771254c4";
    const expoTokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = expoTokenObj.data;

    // 3. Get native push token (FCM on Android, APNs on iOS)
    let nativePushToken = "";
    try {
      const nativeTokenObj = await Notifications.getDevicePushTokenAsync();
      nativePushToken = nativeTokenObj.data;
    } catch (err) {
      console.log("Error fetching native device push token:", err);
    }

    console.log("Expo Push Token:", expoPushToken);
    console.log("Native Push Token:", nativePushToken);

    // 4. Save to Firestore under users/{userId}/pushTokens/{tokenId}
    if (expoPushToken && userId) {
      const tokenId = expoPushToken.replace(/[^a-zA-Z0-9-_]/g, "_");
      const tokenDocRef = doc(db, "users", userId, "pushTokens", tokenId);

      await setDoc(tokenDocRef, {
        expoPushToken,
        nativePushToken: nativePushToken || null,
        nativePushTokenType: Platform.OS === "android" ? "android" : "ios",
        platform: Platform.OS,
        deviceType: "mobile",
        enabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      console.log("Successfully registered push token in Firestore");
    }

    // 5. Configure Android channel (crucial for high priority / sound)
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("mavrixfy-default", {
        name: "Mavrixfy Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1DB954",
      });
    }

    return { expoPushToken, nativePushToken };
  } catch (error) {
    console.error("Error registering push notifications:", error);
    return null;
  }
}

/**
 * Set up listeners for notifications (received in foreground or clicked/tapped)
 */
export function registerNotificationListeners(
  onNotificationReceived?: (notification: Notification) => void,
  onNotificationResponse?: (response: NotificationResponse) => void
) {
  let cleanup: (() => void) | undefined;
  let isActive = true;

  getNotifications().then((Notifications) => {
    if (!Notifications || !isActive) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log("Notification received in foreground:", notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log("Notification clicked:", response);
      if (onNotificationResponse) {
        onNotificationResponse(response);
      }
    });

    cleanup = () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }).catch((error) => {
    console.error("Failed to register notification listeners:", error);
  });

  return () => {
    isActive = false;
    cleanup?.();
  };
}
