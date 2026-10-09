import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { logger } from "./logger";

export interface AppShowcaseConfig {
  enabled: boolean;
  devEnabled?: boolean;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaRoute?: string;
  subtext: string;
  dismissText: string;
  cardBgColor: string;
  cardTextColor: string;
  ctaBgColor: string;
  ctaTextColor: string;
}

export const DEFAULT_SHOWCASE_CONFIG: AppShowcaseConfig = {
  enabled: false,
  devEnabled: false,
  title: "",
  subtitle: "",
  ctaText: "",
  ctaRoute: "",
  subtext: "",
  dismissText: "DISMISS",
  cardBgColor: "#1DB954",
  cardTextColor: "#FFFFFF",
  ctaBgColor: "#FFFFFF",
  ctaTextColor: "#000000",
};

const STORAGE_KEY_CONFIG = "@mavrixfy_app_showcase_firestore_config_v1";

let currentConfig: AppShowcaseConfig = { ...DEFAULT_SHOWCASE_CONFIG };
let isInitialized = false;

type ConfigListener = (config: AppShowcaseConfig) => void;
const listeners = new Set<ConfigListener>();

// Initial hydration from AsyncStorage
void (async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      currentConfig = { ...DEFAULT_SHOWCASE_CONFIG, ...JSON.parse(raw) };
      notifyListeners();
    }
  } catch {
    // Fall back to default
  }
})();

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener(currentConfig);
    } catch (e) {
      logger.warn("[ShowcaseConfig] Listener error:", e);
    }
  });
}

function normalizeConfig(data: Record<string, unknown>): AppShowcaseConfig {
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : false,
    devEnabled: typeof data.devEnabled === "boolean" ? data.devEnabled : false,
    title: typeof data.title === "string" ? data.title.trim() : "",
    subtitle: typeof data.subtitle === "string" ? data.subtitle.trim() : "",
    ctaText: typeof data.ctaText === "string" ? data.ctaText.trim() : "",
    ctaRoute: typeof data.ctaRoute === "string" ? data.ctaRoute.trim() : "",
    subtext: typeof data.subtext === "string" ? data.subtext.trim() : "",
    dismissText:
      typeof data.dismissText === "string" && data.dismissText.trim()
        ? data.dismissText.trim()
        : DEFAULT_SHOWCASE_CONFIG.dismissText,
    cardBgColor:
      typeof data.cardBgColor === "string" && data.cardBgColor.trim()
        ? data.cardBgColor.trim()
        : DEFAULT_SHOWCASE_CONFIG.cardBgColor,
    cardTextColor:
      typeof data.cardTextColor === "string" && data.cardTextColor.trim()
        ? data.cardTextColor.trim()
        : DEFAULT_SHOWCASE_CONFIG.cardTextColor,
    ctaBgColor:
      typeof data.ctaBgColor === "string" && data.ctaBgColor.trim()
        ? data.ctaBgColor.trim()
        : DEFAULT_SHOWCASE_CONFIG.ctaBgColor,
    ctaTextColor:
      typeof data.ctaTextColor === "string" && data.ctaTextColor.trim()
        ? data.ctaTextColor.trim()
        : DEFAULT_SHOWCASE_CONFIG.ctaTextColor,
  };
}

/**
 * Initializes real-time Firestore synchronization for the showcase prompt config.
 * Subscribes strictly to doc: appConfig/appShowcase
 */
export function initAppShowcaseFirestore(): () => void {
  if (isInitialized || !db) return () => {};
  isInitialized = true;

  const showcaseDocRef = doc(db, "appConfig", "appShowcase");

  const unsubscribe = onSnapshot(
    showcaseDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        currentConfig = normalizeConfig(data);
        void AsyncStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(currentConfig));
        notifyListeners();
      }
    },
    (error) => {
      logger.warn("[ShowcaseConfig] Firestore snapshot listener error:", error);
    },
  );

  return unsubscribe;
}

/**
 * Deploys new configuration directly to Firestore doc: appConfig/appShowcase.
 */
export async function deployAppShowcaseFirestore(
  updates: Partial<AppShowcaseConfig>,
): Promise<boolean> {
  if (!db) return false;
  try {
    const showcaseDocRef = doc(db, "appConfig", "appShowcase");
    const payload = {
      ...currentConfig,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(showcaseDocRef, payload, { merge: true });
    return true;
  } catch (error) {
    logger.warn("[ShowcaseConfig] Failed to deploy config to Firestore:", error);
    return false;
  }
}

export function getAppShowcaseConfig(): AppShowcaseConfig {
  return currentConfig;
}

export function isAppShowcaseEnabled(): boolean {
  return Boolean(currentConfig.enabled && currentConfig.title.trim());
}

export function isAppShowcaseDevEnabled(): boolean {
  return Boolean(currentConfig.devEnabled);
}

export function subscribeAppShowcaseConfig(listener: ConfigListener): () => void {
  listeners.add(listener);
  try {
    listener(currentConfig);
  } catch (e) {
    logger.warn("[ShowcaseConfig] Initial listener error:", e);
  }
  return () => {
    listeners.delete(listener);
  };
}
