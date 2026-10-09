import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import { useAppIsActive } from "@/lib/appActivity";
import type { Song } from "@/lib/musicData";
import { playerUIStateStore } from "@/lib/playerUIState";
import { getSettings, subscribeSettings, type AppSettings } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { useEffect,useState } from "react";

export interface UseBackgroundVisualVideoParams {
  screenSong: Song | null;
  navigation: any;
}

/** Identify the audio track; the backdrop resolves its official visual separately. */
export function getBackgroundSongVideoId(song: Song | null): string | null {
  if (!song || (song.source !== "youtube" && !song.id.startsWith("youtube_"))) return null;
  const id = song.youtubeVideoId || song.videoId || song.id.replace(/^youtube_/, "");
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function useBackgroundVisualVideo({
  screenSong,
  navigation,
}: UseBackgroundVisualVideoParams) {
  const [ambientBackdropEnabled, setAmbientBackdropEnabled] = useState(false);
  const [videoBackgroundQuality, setVideoBackgroundQuality] = useState<AppSettings["videoBackgroundQuality"]>("auto");
  const [isNavigationFocused, setIsNavigationFocused] = useState(() => navigation.isFocused());
  const isAppActive = useAppIsActive();
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(
    () => playerUIStateStore.current === "expanded"
  );
  const isScreenFocused = isNavigationFocused && isAppActive && isPlayerExpanded;
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
    let active = true;
    const applySettings = (settings: AppSettings) => {
      if (!active) return;
      setAmbientBackdropEnabled(settings.ambientBackdropEnabled);
      setVideoBackgroundQuality(settings.videoBackgroundQuality === "auto" && settings.dataSaverEnabled ? "low" : settings.videoBackgroundQuality);
    };
    const refresh = () => { void getSettings().then(applySettings); };
    refresh();
    const unsubscribeSettings = subscribeSettings(applySettings);
    const focus = navigation.addListener("focus", () => { setIsNavigationFocused(true); refresh(); });
    const blur = navigation.addListener("blur", () => setIsNavigationFocused(false));
    const unsubscribePlayer = playerUIStateStore.subscribe(state => setIsPlayerExpanded(state === "expanded"));
    return () => { active = false; unsubscribeSettings(); focus(); blur(); unsubscribePlayer(); };
  }, [navigation]);

  const backgroundVideoId = getBackgroundSongVideoId(screenSong);
  useEffect(() => {
    if (!__DEV__) return;
    if (ambientBackdropEnabled && screenSong && !backgroundVideoId) {
      logger.warn("[VideoBackground] Current track has no valid YouTube video ID", {
        songId: screenSong.id,
        source: screenSong.source,
      });
    }
  }, [ambientBackdropEnabled, backgroundVideoId, screenSong]);
  const shouldRenderBackgroundVideo = Boolean(
    ambientBackdropEnabled && backgroundVideoId && isScreenFocused
  );

  return {
    isLowEnd,
    videoBackgroundQuality,
    backgroundVideoId,
    isScreenFocused,
    shouldRenderBackgroundVideo,
    videoBackgroundRequested: shouldRenderBackgroundVideo,
  };
}
