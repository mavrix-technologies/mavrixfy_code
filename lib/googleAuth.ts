import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getAuthApiUrl } from "@/lib/api-config";

export async function getGoogleMobileIdToken(actionLabel: string = "Google Sign-In"): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error(`${actionLabel} does not need a mobile token on web.`);
  }

  const returnUrl = Linking.createURL("google-auth");
  const apiUrl = getAuthApiUrl();
  const authUrl = `${apiUrl}api/auth/google-mobile?returnUrl=${encodeURIComponent(returnUrl)}`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);

  if (result.type === "cancel") {
    throw new Error(`${actionLabel} was cancelled.`);
  }

  if (result.type !== "success" || !result.url) {
    throw new Error(`Could not complete ${actionLabel}. Please try again.`);
  }

  const parsedUrl = Linking.parse(result.url);
  const queryParams = parsedUrl.queryParams as Record<string, string | undefined> | undefined;
  const idToken = queryParams?.id_token;

  if (!idToken) {
    throw new Error(`Could not complete ${actionLabel}. No token received.`);
  }

  return idToken;
}
