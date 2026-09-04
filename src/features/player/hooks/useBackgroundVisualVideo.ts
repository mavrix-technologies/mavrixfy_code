import { useState, useEffect, useCallback } from "react";
import { AppState } from "react-native";
import { getSettings } from "@/lib/storage";
import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import { playerUIStateStore } from "@/lib/playerUIState";
import { getYouTubeMusicVisualVideoId } from "@/data/providers/YouTubeMusicProvider";
import type { Song } from "@/lib/musicData";

export interface UseBackgroundVisualVideoParams {
  screenSong: Song | null;
  navigation: any;
}

export function useBackgroundVisualVideo({
  screenSong,
  navigation,
}: UseBackgroundVisualVideoParams) {
  const [ambientBackdropEnabled, setAmbientBackdropEnabled] = useState(false);
  const [isNavigationFocused, setIsNavigationFocused] = useState(() => navigation.isFocused());
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === "active");
  const isScreenFocused = isNavigationFocused && isAppActive;
  const [isLowEnd, setIsLowEnd] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getDevicePerformanceProfile().then((profile) => {
      if (mounted) {
        setIsLowEnd(profile.isLowEndDevice);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchSettings = () => {
      getSettings().then((s) => {
        if (mounted) {
          setAmbientBackdropEnabled(s.ambientBackdropEnabled);
        }
      });
    };
    fetchSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const fetchSettings = () => {
      getSettings().then((s) => {
        setAmbientBackdropEnabled(s.ambientBackdropEnabled);
      });
    };
    const handler = () => {
      fetchSettings();
      setIsNavigationFocused(true);
    };
    navigation.addListener("focus", handler);
    const blurHandler = () => {
      setIsNavigationFocused(false);
    };
    navigation.addListener("blur", blurHandler);

    const unsubscribe = playerUIStateStore.subscribe((state) => {
      const isExpanded = state === "expanded";
      setIsNavigationFocused(isExpanded);
      if (isExpanded) {
        fetchSettings();
      }
    });

    return () => {
      navigation.removeListener("focus", handler);
      navigation.removeListener("blur", blurHandler);
      unsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  const [backgroundVideoId, setBackgroundVideoId] = useState<string | null>(null);
  const screenSongIdForVideo = screenSong?.id ?? null;

  useEffect(() => {
    if (!screenSongIdForVideo || !screenSong) {
      setBackgroundVideoId(null);
      return;
    }

    setBackgroundVideoId(null);

    let cancelled = false;
    void getYouTubeMusicVisualVideoId(screenSong)
      .then((visualVideoId) => {
        if (cancelled) return;
        setBackgroundVideoId(visualVideoId || null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [screenSongIdForVideo, screenSong]);

  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const videoActive = Boolean(backgroundVideoId && activeVideoId === backgroundVideoId);
  const handleVideoActive = useCallback(
    (active: boolean) => {
      if (active && backgroundVideoId) {
        setActiveVideoId(backgroundVideoId);
      } else {
        setActiveVideoId(null);
      }
    },
    [backgroundVideoId]
  );

  const shouldRenderBackgroundVideo = Boolean(
    ambientBackdropEnabled && backgroundVideoId && isScreenFocused
  );
  const ambientVideoLayoutActive = Boolean(shouldRenderBackgroundVideo && videoActive);

  return {
    isLowEnd,
    backgroundVideoId,
    videoActive,
    handleVideoActive,
    isScreenFocused,
    shouldRenderBackgroundVideo,
    ambientVideoLayoutActive,
  };
}
