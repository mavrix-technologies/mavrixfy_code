import { useState, useEffect } from "react";
import {
  getCachedFestivalTheme,
  subscribeRemoteFestivalTheme,
  DEFAULT_FESTIVAL_THEME,
  type FestivalThemeConfig,
} from "@/services/festivalThemeService";

export function useFestivalTheme() {
  const [theme, setTheme] = useState<FestivalThemeConfig>(DEFAULT_FESTIVAL_THEME);

  useEffect(() => {
    let isMounted = true;

    // 1. Read cached theme immediately (defaulting to enabled: false)
    void getCachedFestivalTheme().then((cached) => {
      if (isMounted) setTheme(cached);
    });

    // 2. Real-time live subscription to Firestore appConfig/festivalTheme
    const unsubscribe = subscribeRemoteFestivalTheme((updated) => {
      if (isMounted) setTheme(updated);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return theme;
}

export default useFestivalTheme;
