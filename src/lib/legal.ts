import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

const PRIVACY_POLICY_URL = "https://mavrixfy.site/privacy";
const TERMS_OF_SERVICE_URL = "https://mavrixfy.site/terms";
const PRIVACY_SUPPORT_EMAIL = "privacy@mavrixfy.site";

async function openExternalUrl(url: string): Promise<void> {
  if (Platform.OS === "web") {
    await Linking.openURL(url);
    return;
  }

  await WebBrowser.openBrowserAsync(url);
}

export async function openPrivacyPolicy(): Promise<void> {
  await openExternalUrl(PRIVACY_POLICY_URL);
}

export async function openTermsOfService(): Promise<void> {
  await openExternalUrl(TERMS_OF_SERVICE_URL);
}

export async function openPrivacySupportEmail(): Promise<void> {
  const subject = encodeURIComponent("Mavrixfy account deletion request");
  await openExternalUrl(`mailto:${PRIVACY_SUPPORT_EMAIL}?subject=${subject}`);
}
