import { getDevicePerformanceProfile } from "@/lib/devicePerformance";
import { useAppIsActive } from "@/lib/appActivity";
import type { Song } from "@/lib/musicData";
import { playerUIStateStore } from "@/lib/playerUIState";
import { getSettings, subscribeSettings, type AppSettings } from "@/lib/storage";
import { useCallback,useEffect,useState } from "react";

export interface UseBackgroundVisualVideoParams {
  screenSong: Song | null;
  navigation: any;
}

/** Use the exact audio track's video; never search for a different recording. */
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
  const visualKey = `${backgroundVideoId}:${videoBackgroundQuality}`;
  const [activeVisualKey, setActiveVisualKey] = useState<string | null>(null);
  const videoActive = Boolean(backgroundVideoId && activeVisualKey === visualKey);
  const handleVideoActive = useCallback((active: boolean) => {
    setActiveVisualKey(previous => active ? visualKey : previous === visualKey ? null : previous);
  }, [visualKey]);
  const handleVideoError = useCallback((_error: string) => {
    setActiveVisualKey(previous => previous === visualKey ? null : previous);
  }, [visualKey]);

  const shouldRenderBackgroundVideo = Boolean(
    ambientBackdropEnabled && backgroundVideoId && isScreenFocused
  );
  const ambientVideoLayoutActive = Boolean(shouldRenderBackgroundVideo && videoActive);

  return {
    isLowEnd,
    videoBackgroundQuality,
    backgroundVideoId,
    videoActive,
    handleVideoActive,
    handleVideoError,
    isScreenFocused,
    shouldRenderBackgroundVideo,
    ambientVideoLayoutActive,
  };
}
