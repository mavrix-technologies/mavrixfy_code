import { Platform } from "react-native";
import Constants from "expo-constants";
import { getExpoExtra } from "@/lib/expoExtra";

type GoogleSigninModule = typeof import("@react-native-google-signin/google-signin");

export async function getGoogleMobileIdToken(actionLabel: string = "Google Sign-In"): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error(`${actionLabel} does not need a mobile token on web.`);
  }

  if (Constants.appOwnership === "expo") {
    throw new Error(
      `${actionLabel} requires a custom development build or production app build. Expo Go does not include the native Google Sign-In module.`
    );
  }

  const expoExtra = getExpoExtra();
  const webClientId =
    (expoExtra.googleWebClientId as string | undefined)?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

  if (!webClientId) {
    throw new Error(
      `${actionLabel} is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your Firebase Google Web Client ID.`
    );
  }

  let nativeStatusCodes: GoogleSigninModule["statusCodes"] | undefined;

  try {
    let googleSigninModule: GoogleSigninModule;

    try {
      googleSigninModule = require("@react-native-google-signin/google-signin") as GoogleSigninModule;
    } catch {
      throw new Error(
        `${actionLabel} requires a custom development build or production app build. Expo Go does not include the native Google Sign-In module.`
      );
    }

    const { GoogleSignin, statusCodes } = googleSigninModule;
    nativeStatusCodes = statusCodes;

    GoogleSignin.configure({
      webClientId,
    });

    if (Platform.OS === "android") {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
    }

    const response = await GoogleSignin.signIn();
    if (response.type === "cancelled") {
      throw new Error(`${actionLabel} was cancelled.`);
    }

    const signInIdToken = response.data.idToken?.trim();
    const tokenResponse = signInIdToken ? null : await GoogleSignin.getTokens();
    const idToken = signInIdToken || tokenResponse?.idToken?.trim();

    if (!idToken) {
      throw new Error(`Could not complete ${actionLabel}. No Google ID token received.`);
    }

    return idToken;
  } catch (error: any) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");

    if (message.includes("RNGoogleSignin") || message.includes("TurboModuleRegistry")) {
      throw new Error(
        `${actionLabel} requires a custom development build or production app build. Expo Go does not include the native Google Sign-In module.`
      );
    }

    if (code === nativeStatusCodes?.SIGN_IN_CANCELLED) {
      throw new Error(`${actionLabel} was cancelled.`);
    }

    if (code === nativeStatusCodes?.IN_PROGRESS) {
      throw new Error(`${actionLabel} is already in progress.`);
    }

    if (code === nativeStatusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error("Google Play Services is unavailable or needs an update.");
    }

    throw error;
  }
}
