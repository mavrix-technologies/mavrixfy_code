import { useAuth } from "@/contexts/AuthContext";
import {
DEFAULT_FESTIVAL_THEME,
getCachedFestivalTheme,
subscribeRemoteFestivalTheme,
type FestivalThemeConfig,
} from "@/services/festivalThemeService";
import { useEffect,useState } from "react";

export function useFestivalTheme() {
  const [theme, setTheme] = useState<FestivalThemeConfig>(DEFAULT_FESTIVAL_THEME);
  const { user } = useAuth();
  const isDevOrAdmin = Boolean(
    (typeof __DEV__ !== "undefined" && Boolean(__DEV__)) || user?.isAdmin
  );

  useEffect(() => {
    let isMounted = true;

    // 1. Read cached theme immediately
    void getCachedFestivalTheme(isDevOrAdmin).then((cached) => {
      if (isMounted) setTheme(cached);
    });

    // 2. Real-time live subscription to Firestore appConfig/festivalTheme
    const unsubscribe = subscribeRemoteFestivalTheme(
      (updated) => {
        if (isMounted) setTheme(updated);
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

