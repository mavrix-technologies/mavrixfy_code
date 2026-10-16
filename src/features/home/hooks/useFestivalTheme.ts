import { useAuth } from "@/contexts/AuthContext";
import {
DEFAULT_FESTIVAL_THEME,
getCachedFestivalTheme,
subscribeRemoteFestivalTheme,
type FestivalThemeConfig,
} from "@/services/festivalThemeService";
import { Image } from "expo-image";
import { useEffect, useState } from "react";

function prefetchBannerImage(url?: string | null) {
  const clean = url?.trim();
  if (clean && clean.startsWith("http")) {
    void Image.prefetch(clean, "disk").catch(() => {});
  }
}

export function useFestivalTheme() {
  const [theme, setTheme] = useState<FestivalThemeConfig>(DEFAULT_FESTIVAL_THEME);
  const { user } = useAuth();
  const isDevOrAdmin = Boolean(
    (typeof __DEV__ !== "undefined" && Boolean(__DEV__)) || user?.isAdmin
  );

  useEffect(() => {
    let isMounted = true;
    let receivedLiveTheme = false;

    // 1. Read cached theme immediately
    void getCachedFestivalTheme(isDevOrAdmin).then((cached) => {
      if (isMounted && !receivedLiveTheme) {
        setTheme(cached);
        prefetchBannerImage(cached.backgroundImageUrl);
      }
    }).catch(() => {});

    // 2. Real-time live subscription to Firestore appConfig/festivalTheme
    const unsubscribe = subscribeRemoteFestivalTheme(
      (updated) => {
        if (isMounted) {
          receivedLiveTheme = true;
          setTheme(updated);
          prefetchBannerImage(updated.backgroundImageUrl);
        }
      },
      { isDevOrAdmin }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isDevOrAdmin]);

  return theme;
}

export default useFestivalTheme;

