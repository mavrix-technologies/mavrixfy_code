import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface CustomCategoryItem {
  id: string;
  label: string;
  icon?: string;
}

export interface FestivalItemData {
  subTitle?: string;
  mainTitle?: string;
  badgeText?: string;
  backgroundImageUrl?: string | null;
  themeAccentColor?: string;
  targetQuery?: string;
  titleText?: string;
  titleColor?: string;
  menuTextColor?: string;
  menuActiveTextColor?: string;
  menuActiveIndicatorColor?: string;
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
  isDevPreview?: boolean;

  // Header Title Controls
  titleText?: string;
  titleColor?: string;
  stickyTitleColor?: string;

  // Header Menu / Category Rail Controls (Merged & Simplified)
  menuColor?: string;
  activeColor?: string;
  menuTextColor?: string;
  menuActiveTextColor?: string;
  menuIconColor?: string;
  menuActiveIconColor?: string;
  menuActiveIndicatorColor?: string;
  headerIconColor?: string;

  stickyMenuTextColor?: string;
  stickyMenuActiveTextColor?: string;
  stickyMenuActiveIndicatorColor?: string;
  stickyHeaderIconColor?: string;

  // Menu labels / items customization
  menuLabels?: Record<string, string>;
  customCategories?: CustomCategoryItem[];
}

const STORAGE_KEY = "mavrixfy_remote_festival_theme_v10";

export const DEFAULT_FESTIVAL_THEME: FestivalThemeConfig = {
  enabled: false,
  activeFestival: "",
  subTitle: "",
  mainTitle: "",
  badgeText: "",
  backgroundImageUrl: null,
  themeAccentColor: "#014D52",
  targetQuery: "",
  isDevPreview: false,
  titleText: "MAVRIXFY",
  titleColor: "#FFFFFF",
  menuColor: "#FFFFFF",
  activeColor: "#FFFFFF",
  menuTextColor: "#FFFFFF",
  menuActiveTextColor: "#FFFFFF",
  menuActiveIndicatorColor: "#FFFFFF",
};

let gCachedTheme: FestivalThemeConfig = DEFAULT_FESTIVAL_THEME;

export function resolveFestivalThemeConfig(
  publicSource?: Record<string, any>,
  devSource?: Record<string, any>,
  isDevOrAdmin: boolean = false
): FestivalThemeConfig {
  if (!publicSource && !devSource) {
    return DEFAULT_FESTIVAL_THEME;
  }

  // Extract separate documents (public, dev) or handle legacy nested map
  let pub: Record<string, any> = {};
  let dev: Record<string, any> = {};

  if (publicSource && typeof publicSource === "object") {
    if (typeof publicSource.public === "object" && publicSource.public !== null) {
      pub = publicSource.public;
    } else {
      pub = publicSource;
    }
  }

  if (devSource && typeof devSource === "object") {
    if (typeof devSource.dev === "object" && devSource.dev !== null) {
      dev = devSource.dev;
    } else {
      dev = devSource;
    }
  } else if (publicSource && typeof publicSource.dev === "object" && publicSource.dev !== null) {
    dev = publicSource.dev;
  }

  // Purely check 'dev.enabled' and 'pub.enabled' - NO outside enabled check!
  const isDevEnabled = dev.enabled === true;
  const isPublicEnabled = pub.enabled === true;

  // Active Dev applies if dev is enabled:
  // - When isDevOrAdmin is true
  // - Or when public is disabled (allows testing dev without turning on public)
  const isDevActive = isDevEnabled && (isDevOrAdmin || !isPublicEnabled);
  const isPublicActive = isPublicEnabled;

  if (!isDevActive && !isPublicActive) {
    return {
      ...DEFAULT_FESTIVAL_THEME,
      enabled: false,
    };
  }

  // If dev is active, use dev controls; otherwise use public controls
  const activeSource = isDevActive ? dev : pub;
  const fallbackSource = isDevActive ? pub : {};

  const getString = (key: string, defaultVal = ""): string => {
    if (typeof activeSource[key] === "string" && activeSource[key].trim()) {
      return activeSource[key].trim();
    }
    if (typeof fallbackSource[key] === "string" && fallbackSource[key].trim()) {
      return fallbackSource[key].trim();
    }
    return defaultVal;
  };

  const getOptString = (key: string): string | undefined => {
    const val = getString(key, "");
    return val ? val : undefined;
  };

  const activeKey = getString("activeFestival");
  const backgroundImageUrl = getOptString("backgroundImageUrl") || null;
  const mainTitle = getString("mainTitle");
  const subTitleText = getString("subTitle");
  const badgeText = getString("badgeText");
  const themeAccentColor = getString("themeAccentColor", "#ffb900");
  const targetQuery = getString("targetQuery", mainTitle);

  // Single Unified Color: activeColor applies to title, menu tabs, icons, and indicator!
  // (menuColor and titleColor are merged into activeColor for a simple, unified theme)
  const unifiedColor =
    getOptString("activeColor") ||
    getOptString("menuColor") ||
    getOptString("titleColor") ||
    "#FFFFFF";

  // Title Controls
  const titleText = getString("titleText", "MAVRIXFY");
  const titleColor = unifiedColor;
  const stickyTitleColor = getOptString("stickyTitleColor") || unifiedColor;

  const menuTextColor = unifiedColor;
  const menuActiveTextColor = unifiedColor;
  const menuIconColor = unifiedColor;
  const menuActiveIconColor = unifiedColor;
  const menuActiveIndicatorColor = unifiedColor;
  const headerIconColor = unifiedColor;

  const stickyMenuTextColor = "rgba(255, 255, 255, 0.72)";
  const stickyMenuActiveTextColor = "#FFFFFF";
  const stickyMenuActiveIndicatorColor = "#FFFFFF";
  const stickyHeaderIconColor = unifiedColor;

  // Menu labels override map
  const menuLabels: Record<string, string> | undefined =
    activeSource.menuLabels || fallbackSource.menuLabels;

  // Custom categories array
  const rawCategories =
    activeSource.customCategories || fallbackSource.customCategories;

  const customCategories: CustomCategoryItem[] | undefined = Array.isArray(rawCategories)
    ? rawCategories.filter((c: any) => c && typeof c.id === "string")
    : undefined;

  return {
    enabled: true,
    activeFestival: activeKey,
    subTitle: subTitleText,
    mainTitle,
    badgeText,
    backgroundImageUrl,
    themeAccentColor,
    targetQuery,
    isDevPreview: isDevActive && !isPublicActive,

    titleText,
    titleColor,
    stickyTitleColor,

    menuColor: unifiedColor,
    activeColor: unifiedColor,

    menuTextColor,
    menuActiveTextColor,
    menuIconColor,
    menuActiveIconColor,
    menuActiveIndicatorColor,
    headerIconColor,

    stickyMenuTextColor,
    stickyMenuActiveTextColor,
    stickyMenuActiveIndicatorColor,
    stickyHeaderIconColor,

    menuLabels,
    customCategories,
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
 * Real-time Firestore subscription to separate `public` and `dev` documents
 * under `appConfig/festivalTheme/configs/`.
 * NO outside 'enabled' dependency: only dev.enabled and public.enabled matter.
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

    let pubData: Record<string, any> | undefined;
    let devData: Record<string, any> | undefined;

    const reevaluate = () => {
      const resolved = resolveFestivalThemeConfig(
        pubData,
        devData,
        isDevOrAdmin
      );
      gCachedTheme = resolved;
      void AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(resolved)
      ).catch(() => {});
      onUpdate(resolved);
    };

    // 1. Separate 'public' document: appConfig/festivalTheme/configs/public
    const pubDocRef = doc(db, "appConfig", "festivalTheme", "configs", "public");
    const unsubPublic = onSnapshot(
      pubDocRef,
      (snap) => {
        pubData = snap.exists() ? (snap.data() as Record<string, any>) : undefined;
        reevaluate();
      },
      () => {
        pubData = undefined;
        reevaluate();
      }
    );

    // 2. Separate 'dev' document: appConfig/festivalTheme/configs/dev
    const devDocRef = doc(db, "appConfig", "festivalTheme", "configs", "dev");
    const unsubDev = onSnapshot(
      devDocRef,
      (snap) => {
        devData = snap.exists() ? (snap.data() as Record<string, any>) : undefined;
        reevaluate();
      },
      () => {
        devData = undefined;
        reevaluate();
      }
    );

    return () => {
      unsubPublic();
      unsubDev();
    };
  } catch {
    return () => {};
  }
}

