import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface FestivalItemData {
  subTitle: string;
  mainTitle: string;
  badgeText: string;
  backgroundImageUrl: string | null;
  themeAccentColor?: string;
  targetQuery?: string;
  enableSparkles?: boolean;
}

export interface FestivalThemeConfig {
  enabled: boolean;
  activeFestival?: string;
  subTitle: string;
  mainTitle: string;
  badgeText: string;
  backgroundImageUrl: string | null;
  themeAccentColor?: string;
  targetQuery?: string;
  enableSparkles?: boolean;
}

const STORAGE_KEY = "mavrixfy_remote_festival_theme_v6";

export const DEFAULT_FESTIVAL_THEME: FestivalThemeConfig = {
  enabled: false,
  activeFestival: "raksha_bandhan",
  subTitle: "",
  mainTitle: "",
  badgeText: "",
  backgroundImageUrl: null,
  themeAccentColor: "#014D52",
  targetQuery: "",
  enableSparkles: true,
};

let gCachedTheme: FestivalThemeConfig = DEFAULT_FESTIVAL_THEME;

export async function getCachedFestivalTheme(): Promise<FestivalThemeConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FestivalThemeConfig>;
      gCachedTheme = {
        ...DEFAULT_FESTIVAL_THEME,
        ...parsed,
        enabled: parsed.enabled === true,
      };
    } else {
      gCachedTheme = DEFAULT_FESTIVAL_THEME;
    }
  } catch {
    gCachedTheme = DEFAULT_FESTIVAL_THEME;
  }
  return gCachedTheme;
}

/**
 * Real-time Firestore subscription to `appConfig/festivalTheme`
 * Subscribes to parent doc and `appConfig/festivalTheme/festivals/{activeFestival}` subcollection doc.
 */
export function subscribeRemoteFestivalTheme(
  onUpdate: (theme: FestivalThemeConfig) => void
): () => void {
  try {
    if (!db) return () => {};
    const mainDocRef = doc(db, "appConfig", "festivalTheme");
    let activeSubUnsubscribe: (() => void) | null = null;

    const mainUnsubscribe = onSnapshot(
      mainDocRef,
      (mainSnap) => {
        if (!mainSnap.exists()) {
          gCachedTheme = DEFAULT_FESTIVAL_THEME;
          onUpdate(DEFAULT_FESTIVAL_THEME);
          return;
        }

        const mainData = mainSnap.data() as Record<string, any>;
        const isEnabled = mainData.enabled === true;
        const activeKey = mainData.activeFestival || "raksha_bandhan";

        if (!isEnabled) {
          const disabledConfig: FestivalThemeConfig = {
            ...DEFAULT_FESTIVAL_THEME,
            enabled: false,
            activeFestival: activeKey,
          };
          gCachedTheme = disabledConfig;
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(disabledConfig)).catch(() => {});
          onUpdate(disabledConfig);
          return;
        }

        // Subscribe to individual festival subcollection document for bespoke styling
        const subDocRef = doc(db, "appConfig", "festivalTheme", "festivals", activeKey);

        if (activeSubUnsubscribe) {
          activeSubUnsubscribe();
          activeSubUnsubscribe = null;
        }

        activeSubUnsubscribe = onSnapshot(
          subDocRef,
          (subSnap) => {
            const subData = (subSnap.exists() ? subSnap.data() : {}) as Record<string, any>;

            const merged: FestivalThemeConfig = {
              enabled: true,
              activeFestival: activeKey,
              subTitle:
                mainData.subTitle || subData.subTitle || "",
              mainTitle:
                mainData.mainTitle || subData.mainTitle || "",
              badgeText:
                mainData.badgeText || subData.badgeText || "",
              backgroundImageUrl:
                mainData.backgroundImageUrl !== undefined
                  ? mainData.backgroundImageUrl
                  : subData.backgroundImageUrl || null,
              themeAccentColor:
                mainData.themeAccentColor ||
                subData.themeAccentColor ||
                DEFAULT_FESTIVAL_THEME.themeAccentColor,
              targetQuery:
                mainData.targetQuery || subData.targetQuery || mainData.mainTitle || subData.mainTitle || "",
              enableSparkles:
                mainData.enableSparkles ?? subData.enableSparkles ?? true,
            };

            gCachedTheme = merged;
            void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
            onUpdate(merged);
          },
          () => {
            const fallback: FestivalThemeConfig = {
              enabled: true,
              activeFestival: activeKey,
              subTitle: mainData.subTitle || "",
              mainTitle: mainData.mainTitle || "",
              badgeText: mainData.badgeText || "",
              backgroundImageUrl: mainData.backgroundImageUrl || null,
              themeAccentColor: mainData.themeAccentColor || DEFAULT_FESTIVAL_THEME.themeAccentColor,
              targetQuery: mainData.targetQuery || mainData.mainTitle || "",
              enableSparkles: mainData.enableSparkles ?? true,
            };
            gCachedTheme = fallback;
            onUpdate(fallback);
          }
        );
      },
      () => {
        onUpdate(gCachedTheme);
      }
    );

    return () => {
      mainUnsubscribe();
      if (activeSubUnsubscribe) {
        activeSubUnsubscribe();
      }
    };
  } catch {
    return () => {};
  }
}
