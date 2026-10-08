import { useAppIsActive } from "@/lib/appActivity";
import { playerUIStateStore } from "@/lib/playerUIState";
import { getSettings, subscribeSettings } from "@/lib/storage";
import { useCallback, useEffect, useState } from "react";

export function useAmbientArtwork({ screenSong, navigation }: { screenSong: { coverUrl?: string } | null; navigation: any }) {
  const [enabled, setEnabled] = useState(false);
  const [navigationFocused, setNavigationFocused] = useState(() => navigation.isFocused());
  const [playerExpanded, setPlayerExpanded] = useState(() => playerUIStateStore.current === "expanded");
  const [loadedCoverUrl, setLoadedCoverUrl] = useState("");
  const appActive = useAppIsActive();
  const coverUrl = screenSong?.coverUrl?.trim() || "";

  useEffect(() => {
    let active = true;
    const applySettings = (settings: { ambientBackdropEnabled: boolean }) => {
      if (active) setEnabled(settings.ambientBackdropEnabled);
    };
    void getSettings().then(applySettings);
    const unsubscribeSettings = subscribeSettings(applySettings);
    const focus = navigation.addListener("focus", () => {
      setNavigationFocused(true);
      void getSettings().then(applySettings);
    });
    const blur = navigation.addListener("blur", () => setNavigationFocused(false));
    const unsubscribePlayer = playerUIStateStore.subscribe(state => setPlayerExpanded(state === "expanded"));
    return () => {
      active = false;
      unsubscribeSettings();
      focus();
      blur();
      unsubscribePlayer();
    };
  }, [navigation]);

  const isScreenFocused = navigationFocused && appActive && playerExpanded;
  const shouldRenderAmbientArtwork = Boolean(enabled && coverUrl && isScreenFocused);
  const ambientArtworkReady = Boolean(shouldRenderAmbientArtwork && loadedCoverUrl === coverUrl);
  const onAmbientArtworkLoad = useCallback(() => setLoadedCoverUrl(coverUrl), [coverUrl]);

  return { shouldRenderAmbientArtwork, ambientArtworkReady, onAmbientArtworkLoad };
}
