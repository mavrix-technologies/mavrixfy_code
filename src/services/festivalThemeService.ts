import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface FestivalItemData {
  subTitle?: string;
  mainTitle?: string;
  badgeText?: string;
  backgroundImageUrl?: string | null;
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
  isDevPreview?: boolean;
}

const STORAGE_KEY = "mavrixfy_remote_festival_theme_v7";

export const DEFAULT_FESTIVAL_THEME: FestivalThemeConfig = {
  enabled: false,
  activeFestival: "",
  subTitle: "",
  mainTitle: "",
  badgeText: "",
  backgroundImageUrl: null,
  themeAccentColor: "#014D52",
  targetQuery: "",
  enableSparkles: true,
  isDevPreview: false,
};

let gCachedTheme: FestivalThemeConfig = DEFAULT_FESTIVAL_THEME;

export function resolveFestivalThemeConfig(
  mainData: Record<string, any> | undefined,
  subData?: Record<string, any>,
  isDevOrAdmin: boolean = false
): FestivalThemeConfig {
  if (!mainData) {
    return DEFAULT_FESTIVAL_THEME;
  }

  const isPublicEnabled = mainData.enabled === true;
  const isDevTesting = isDevOrAdmin && mainData.devTesting === true;
  const isEnabled = isPublicEnabled || isDevTesting;

  const publicActiveKey =
    typeof mainData.activeFestival === "string" ? mainData.activeFestival.trim() : "";
  const devActiveKey =
    typeof mainData.devTestingFestival === "string"
      ? mainData.devTestingFestival.trim()
      : "";
  const activeKey = isDevTesting && devActiveKey ? devActiveKey : publicActiveKey;

  if (!isEnabled) {
    return {
      ...DEFAULT_FESTIVAL_THEME,
      enabled: false,
      activeFestival: activeKey,
    };
  }

  // When dev testing is active, dev-prefixed fields take priority
  const devBg =
    typeof mainData.devBackgroundImageUrl === "string"
      ? mainData.devBackgroundImageUrl.trim()
      : "";
  const publicBg =
    typeof mainData.backgroundImageUrl === "string"
      ? mainData.backgroundImageUrl.trim()
      : "";
  const subBg =
    typeof subData?.backgroundImageUrl === "string"
      ? subData.backgroundImageUrl.trim()
      : "";
  const backgroundImageUrl = isDevTesting
    ? (devBg || publicBg || subBg || null)
    : (publicBg || subBg || null);

  const devTitle =
    typeof mainData.devMainTitle === "string" ? mainData.devMainTitle.trim() : "";
  const publicTitle =
    typeof mainData.mainTitle === "string" ? mainData.mainTitle.trim() : "";
  const subTitle =
    typeof subData?.mainTitle === "string" ? subData.mainTitle.trim() : "";
  const mainTitle = isDevTesting
    ? (devTitle || publicTitle || subTitle || "")
    : (publicTitle || subTitle || "");

  const devSub =
    typeof mainData.devSubTitle === "string" ? mainData.devSubTitle.trim() : "";
  const publicSub =
    typeof mainData.subTitle === "string" ? mainData.subTitle.trim() : "";
  const subSub =
    typeof subData?.subTitle === "string" ? subData.subTitle.trim() : "";
  const subTitleText = isDevTesting
    ? (devSub || publicSub || subSub || "")
    : (publicSub || subSub || "");

  const devBadge =
    typeof mainData.devBadgeText === "string" ? mainData.devBadgeText.trim() : "";
  const publicBadge =
    typeof mainData.badgeText === "string" ? mainData.badgeText.trim() : "";
  const subBadge =
    typeof subData?.badgeText === "string" ? subData.badgeText.trim() : "";
  const badgeText = isDevTesting
    ? (devBadge || publicBadge || subBadge || "")
    : (publicBadge || subBadge || "");

  const devColor =
    typeof mainData.devThemeAccentColor === "string"
      ? mainData.devThemeAccentColor.trim()
      : "";
  const publicColor =
    typeof mainData.themeAccentColor === "string"
      ? mainData.themeAccentColor.trim()
      : "";
  const subColor =
    typeof subData?.themeAccentColor === "string"
      ? subData.themeAccentColor.trim()
      : "";
  const themeAccentColor = isDevTesting
    ? (devColor || publicColor || subColor || DEFAULT_FESTIVAL_THEME.themeAccentColor)
    : (publicColor || subColor || DEFAULT_FESTIVAL_THEME.themeAccentColor);

  const devTarget =
    typeof mainData.devTargetQuery === "string" ? mainData.devTargetQuery.trim() : "";
  const publicTarget =
    typeof mainData.targetQuery === "string" ? mainData.targetQuery.trim() : "";
  const subTarget =
    typeof subData?.targetQuery === "string" ? subData.targetQuery.trim() : "";
  const targetQuery = isDevTesting
    ? (devTarget || publicTarget || subTarget || mainTitle || "")
    : (publicTarget || subTarget || mainTitle || "");

  let enableSparkles = true;
  if (isDevTesting && typeof mainData.devEnableSparkles === "boolean") {
    enableSparkles = mainData.devEnableSparkles;
  } else if (typeof mainData.enableSparkles === "boolean") {
    enableSparkles = mainData.enableSparkles;
  } else if (typeof subData?.enableSparkles === "boolean") {
    enableSparkles = subData.enableSparkles;
  }

  return {
    enabled: true,
    activeFestival: activeKey,
    subTitle: subTitleText,
    mainTitle,
    badgeText,
    backgroundImageUrl,
    themeAccentColor,
    targetQuery,
    enableSparkles,
    isDevPreview: isDevTesting && !isPublicEnabled,
  };
}

export async function getCachedFestivalTheme(
  isDevOrAdmin?: boolean
): Promise<FestivalThemeConfig> {
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

export interface SubscribeFestivalOptions {
  isDevOrAdmin?: boolean;
}

/**
 * Real-time Firestore subscription to `appConfig/festivalTheme`
 * Seamlessly resolves public live festivals and developer test preview mode.
 */
export function subscribeRemoteFestivalTheme(
  onUpdate: (theme: FestivalThemeConfig) => void,
  options?: SubscribeFestivalOptions
): () => void {
  try {
    if (!db) return () => {};
    const isDevOrAdmin =
      options?.isDevOrAdmin ??
      (typeof __DEV__ !== "undefined" && Boolean(__DEV__));

    const mainDocRef = doc(db, "appConfig", "festivalTheme");
    let activeSubUnsubscribe: (() => void) | null = null;
    let currentActiveKey: string | null = null;
    let lastMainData: Record<string, any> | null = null;
    let lastSubData: Record<string, any> = {};

    const mainUnsubscribe = onSnapshot(
      mainDocRef,
      (mainSnap) => {
        if (!mainSnap.exists()) {
          if (activeSubUnsubscribe) {
            activeSubUnsubscribe();
            activeSubUnsubscribe = null;
          }
          currentActiveKey = null;
          lastMainData = null;
          lastSubData = {};
          gCachedTheme = DEFAULT_FESTIVAL_THEME;
          onUpdate(DEFAULT_FESTIVAL_THEME);
          return;
        }

        const mainData = mainSnap.data() as Record<string, any>;
        lastMainData = mainData;

        const isPublicEnabled = mainData.enabled === true;
        const isDevTesting = isDevOrAdmin && mainData.devTesting === true;
        const isEnabled = isPublicEnabled || isDevTesting;

        const publicActiveKey =
          typeof mainData.activeFestival === "string"
            ? mainData.activeFestival.trim()
            : "";
        const devActiveKey =
          typeof mainData.devTestingFestival === "string"
            ? mainData.devTestingFestival.trim()
            : "";
        const activeKey =
          isDevTesting && devActiveKey ? devActiveKey : publicActiveKey;

        if (!isEnabled) {
          if (activeSubUnsubscribe) {
            activeSubUnsubscribe();
            activeSubUnsubscribe = null;
          }
          currentActiveKey = null;
          lastSubData = {};
          const disabledConfig = resolveFestivalThemeConfig(
            mainData,
            undefined,
            isDevOrAdmin
          );
          gCachedTheme = disabledConfig;
          void AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(disabledConfig)
          ).catch(() => {});
          onUpdate(disabledConfig);
          return;
        }

        // If no active festival key (e.g. general custom banner on main doc), resolve directly
        if (!activeKey) {
          if (activeSubUnsubscribe) {
            activeSubUnsubscribe();
            activeSubUnsubscribe = null;
          }
          currentActiveKey = null;
          lastSubData = {};
          const resolved = resolveFestivalThemeConfig(
            mainData,
            undefined,
            isDevOrAdmin
          );
          gCachedTheme = resolved;
          void AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(resolved)
          ).catch(() => {});
          onUpdate(resolved);
          return;
        }

        // If activeKey changed or no active sub doc subscription, subscribe to subcollection doc
        if (activeKey !== currentActiveKey) {
          if (activeSubUnsubscribe) {
            activeSubUnsubscribe();
            activeSubUnsubscribe = null;
          }
          currentActiveKey = activeKey;

          const subDocRef = doc(
            db,
            "appConfig",
            "festivalTheme",
            "festivals",
            activeKey
          );
          activeSubUnsubscribe = onSnapshot(
            subDocRef,
            (subSnap) => {
              lastSubData = (subSnap.exists() ? subSnap.data() : {}) as Record<
                string,
                any
              >;
              const merged = resolveFestivalThemeConfig(
                lastMainData || mainData,
                lastSubData,
                isDevOrAdmin
              );
              gCachedTheme = merged;
              void AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(merged)
              ).catch(() => {});
              onUpdate(merged);
            },
            () => {
              const fallback = resolveFestivalThemeConfig(
                lastMainData || mainData,
                undefined,
                isDevOrAdmin
              );
              gCachedTheme = fallback;
              onUpdate(fallback);
            }
          );
        } else {
          // activeKey is unchanged, re-evaluate with updated mainData & cached subData
          const resolved = resolveFestivalThemeConfig(
            mainData,
            lastSubData,
            isDevOrAdmin
          );
          gCachedTheme = resolved;
          void AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(resolved)
          ).catch(() => {});
          onUpdate(resolved);
        }
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

