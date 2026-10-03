import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/lib/firebase";
import { triggerImpact } from "@/lib/haptics";
import { ImpactFeedbackStyle } from "expo-haptics";
import { doc, onSnapshot } from "firebase/firestore";
import { Linking } from "react-native";

export type MiniPlayerBannerItem = {
  enabled?: boolean;
  text: string;
  iconName: string;
  linkUrl: string;
  backgroundColor?: string;
  textColor?: string;
  iconColor?: string;
};

export type MiniPlayerBannerConfig = {
  enabled: boolean;
  intervalSeconds: number;
  items: MiniPlayerBannerItem[];
};

export const DEFAULT_MINI_PLAYER_BANNER_CONFIG: MiniPlayerBannerConfig = {
  enabled: false,
  intervalSeconds: 4.5,
  items: [],
};

const STORAGE_KEY_BANNER = "@mavrixfy_mini_banner_config_v1";
const BANNER_CONFIG_REF = doc(db, "appConfig", "miniPlayerBanner");

let cachedConfig: MiniPlayerBannerConfig = DEFAULT_MINI_PLAYER_BANNER_CONFIG;

// Hydrate from storage immediately on module load
void (async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_BANNER);
    if (raw) {
      cachedConfig = normalizeBannerConfig(JSON.parse(raw));
    }
  } catch {}
})();

export function getCachedMiniPlayerBannerConfig(): MiniPlayerBannerConfig {
  return cachedConfig;
}

function normalizeBannerItem(raw: unknown): MiniPlayerBannerItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  // Individual item-level enable/disable toggle (defaults to true if omitted)
  if (item.enabled === false) return null;

  const text = typeof item.text === "string" ? item.text.trim() : "";
  const linkUrl = typeof item.linkUrl === "string" ? item.linkUrl.trim() : "";
  if (!text || !linkUrl) return null;

  const iconName =
    typeof item.iconName === "string" && item.iconName.trim()
      ? item.iconName.trim()
      : "paper-plane";

  return {
    enabled: item.enabled !== false,
    text,
    linkUrl,
    iconName,
    backgroundColor:
      typeof item.backgroundColor === "string" && item.backgroundColor.trim()
        ? item.backgroundColor.trim()
        : undefined,
    textColor:
      typeof item.textColor === "string" && item.textColor.trim()
        ? item.textColor.trim()
        : undefined,
    iconColor:
      typeof item.iconColor === "string" && item.iconColor.trim()
        ? item.iconColor.trim()
        : undefined,
  };
}

function normalizeBannerConfig(data: unknown): MiniPlayerBannerConfig {
  if (!data || typeof data !== "object") return DEFAULT_MINI_PLAYER_BANNER_CONFIG;
  const record = data as Record<string, unknown>;

  const enabled = record.enabled === true;
  const rawInterval = Number(record.intervalSeconds);
  const intervalSeconds =
    !isNaN(rawInterval) && rawInterval >= 2 && rawInterval <= 60 ? rawInterval : 4.5;

  const items: MiniPlayerBannerItem[] = [];

  // Support array under "banners" or "items" or "slides"
  const rawList = Array.isArray(record.banners)
    ? record.banners
    : Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.slides)
    ? record.slides
    : null;

  if (rawList && rawList.length > 0) {
    for (const raw of rawList) {
      const normalized = normalizeBannerItem(raw);
      if (normalized) items.push(normalized);
    }
  } else {
    // Single object format backward compatibility
    const single = normalizeBannerItem(record);
    if (single) items.push(single);
  }

  return {
    enabled: enabled && items.length > 0,
    intervalSeconds,
    items,
  };
}

/**
 * Subscribe to real-time banner config updates from Firestore with instant local cache
 */
export function subscribeToMiniPlayerBannerConfig(
  callback: (config: MiniPlayerBannerConfig) => void
): () => void {
  // Fire immediately with in-memory cached state to eliminate any layout shift
  callback(cachedConfig);

  try {
    return onSnapshot(
      BANNER_CONFIG_REF,
      (snap) => {
        const next = snap.exists() ? normalizeBannerConfig(snap.data()) : DEFAULT_MINI_PLAYER_BANNER_CONFIG;
        cachedConfig = next;
        void AsyncStorage.setItem(STORAGE_KEY_BANNER, JSON.stringify(next));
        callback(next);
      },
      () => {
        callback(cachedConfig);
      }
    );
  } catch {
    callback(cachedConfig);
    return () => {};
  }
}

/**
 * Open the banner link in external browser/app with haptics
 */
export async function openMiniPlayerBannerLink(url: string): Promise<void> {
  if (!url) return;
  void triggerImpact(ImpactFeedbackStyle.Light);
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
