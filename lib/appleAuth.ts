import { Platform } from "react-native";
import * as Crypto from "expo-crypto";

type AppleAuthenticationModule = typeof import("expo-apple-authentication");
type AppleFullName = import("expo-apple-authentication").AppleAuthenticationFullName;

export type AppleMobileCredential = {
  idToken: string;
  rawNonce: string;
  email?: string | null;
  fullName?: string | null;
  user?: string | null;
  authorizationCode?: string | null;
};

const NONCE_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";

function getAppleAuthenticationModule(actionLabel: string): AppleAuthenticationModule {
  try {
    return require("expo-apple-authentication") as AppleAuthenticationModule;
  } catch {
    throw new Error(
      `${actionLabel} requires a custom development build or production app build with Apple Sign-In enabled.`
    );
  }
}

function createNonce(length = 32): string {
  const randomBytes = Crypto.getRandomBytes(length);
  return Array.from(randomBytes, (byte) => NONCE_CHARSET[byte % NONCE_CHARSET.length]).join("");
}

function formatFullName(fullName: AppleFullName | null | undefined): string | null {
  if (!fullName) return null;

  const primaryName = [
    fullName.namePrefix,
    fullName.givenName,
    fullName.middleName,
    fullName.familyName,
    fullName.nameSuffix,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return primaryName || String(fullName.nickname || "").trim() || null;
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") {
    return false;
  }

  try {
    const AppleAuthentication = getAppleAuthenticationModule("Apple Sign-In");
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAppleMobileCredential(
  actionLabel: string = "Apple Sign-In"
): Promise<AppleMobileCredential> {
  if (Platform.OS !== "ios") {
    throw new Error(`${actionLabel} is only available on Apple devices.`);
  }

  const AppleAuthentication = getAppleAuthenticationModule(actionLabel);
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error(`${actionLabel} is not available on this device.`);
  }

  const rawNonce = createNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error(`Could not complete ${actionLabel}. No Apple identity token received.`);
    }

    return {
      idToken: credential.identityToken,
      rawNonce,
      email: credential.email,
      fullName: formatFullName(credential.fullName),
      user: credential.user,
      authorizationCode: credential.authorizationCode,
    };
  } catch (error: any) {
    if (String(error?.code || "") === "ERR_REQUEST_CANCELED") {
      throw new Error(`${actionLabel} was cancelled.`);
    }

    throw error;
  }
}
