import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { Linking } from "react-native";
import { db } from "@/lib/firebase";
import { triggerImpact } from "@/lib/haptics";
import * as Haptics from "expo-haptics";

export type MiniPlayerBannerConfig = {
  enabled: boolean;
  text: string;
  iconName: string;
  linkUrl: string;
  backgroundColor?: string;
  textColor?: string;
  iconColor?: string;
};

export const DEFAULT_MINI_PLAYER_BANNER_CONFIG: MiniPlayerBannerConfig = {
  enabled: false,
  text: "",
  iconName: "paper-plane",
  linkUrl: "",
  backgroundColor: "#162838",
  textColor: "#E2E8F0",
  iconColor: "#38BDF8",
};

const BANNER_CONFIG_REF = doc(db, "appConfig", "miniPlayerBanner");

function normalizeBannerConfig(data: unknown): MiniPlayerBannerConfig {
  if (!data || typeof data !== "object") return DEFAULT_MINI_PLAYER_BANNER_CONFIG;
  const record = data as Record<string, unknown>;

  const enabled = record.enabled === true;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const linkUrl = typeof record.linkUrl === "string" ? record.linkUrl.trim() : "";
  const iconName = typeof record.iconName === "string" ? record.iconName.trim() : "paper-plane";

  return {
    enabled: Boolean(enabled && text && linkUrl),
    text,
    iconName: iconName || "paper-plane",
    linkUrl,
    backgroundColor: typeof record.backgroundColor === "string" && record.backgroundColor ? record.backgroundColor.trim() : undefined,
    textColor: typeof record.textColor === "string" && record.textColor ? record.textColor.trim() : undefined,
    iconColor: typeof record.iconColor === "string" && record.iconColor ? record.iconColor.trim() : undefined,
  };
}

/**
 * Get current banner config once
 */
async function getMiniPlayerBannerConfig(): Promise<MiniPlayerBannerConfig> {
  try {
    const snap = await getDoc(BANNER_CONFIG_REF);
    return snap.exists() ? normalizeBannerConfig(snap.data()) : DEFAULT_MINI_PLAYER_BANNER_CONFIG;
  } catch {
    return DEFAULT_MINI_PLAYER_BANNER_CONFIG;
  }
}

/**
 * Subscribe to real-time banner config updates from Firestore
 */
export function subscribeToMiniPlayerBannerConfig(
  callback: (config: MiniPlayerBannerConfig) => void
): () => void {
  try {
    return onSnapshot(
      BANNER_CONFIG_REF,
      (snap) => {
        if (snap.exists()) {
          callback(normalizeBannerConfig(snap.data()));
        } else {
          callback(DEFAULT_MINI_PLAYER_BANNER_CONFIG);
        }
      },
      () => {
        callback(DEFAULT_MINI_PLAYER_BANNER_CONFIG);
      }
    );
  } catch {
    callback(DEFAULT_MINI_PLAYER_BANNER_CONFIG);
    return () => {};
  }
}

/**
 * Open the banner link in external browser/app with haptics
 */
export async function openMiniPlayerBannerLink(url: string): Promise<void> {
  if (!url) return;
  void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(url);
    }
  } catch {
    // ignore opening failures gracefully
  }
}
