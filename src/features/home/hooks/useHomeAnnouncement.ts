import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useAppIsActive } from "@/lib/appActivity";
import type { MiniPlayerBannerConfig } from "@/lib/miniPlayerBannerConfig";
import { usePlayerUIState } from "@/lib/playerUIState";
import { subscribeAppShowcaseModal } from "./useAppShowcasePrompt";

const HISTORY_KEY = "@mavrixfy_home_announcement_last_shown_v1";
let shownThisSession = false;

/** Occasional Home promotion: delayed presentation, timed dismissal, and a persisted frequency cap. */
export function useHomeAnnouncement(config: MiniPlayerBannerConfig, scrollY: SharedValue<number>, ready: boolean) {
  const focused = useIsFocused();
  const foreground = useAppIsActive();
  const playerUI = usePlayerUIState();
  const [visible, setVisible] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [showcaseVisible, setShowcaseVisible] = useState(false);
  const [screenReader, setScreenReader] = useState<boolean | null>(null);
  const enabled = config.enabled && config.items.length > 0;
  const eligible = enabled && ready && focused && foreground && atTop && playerUI !== "expanded" && !showcaseVisible;
  const displayMs = (config.displaySeconds ?? 8) * 1000;
  const delayMs = (config.showDelaySeconds ?? 3) * 1000;
  const cooldownMs = (config.cooldownHours ?? 6) * 60 * 60 * 1000;
  const remainingMs = useRef(displayMs);
  // Discard the presentation when the remote switch turns off, including rapid re-enables.
  if (!enabled && visible) setVisible(false);

  useAnimatedReaction(
    () => scrollY.value <= 1,
    (next, previous) => { if (next !== previous) scheduleOnRN(setAtTop, next); },
    [scrollY]
  );

  useEffect(() => subscribeAppShowcaseModal(setShowcaseVisible), []);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", value => {
      receivedEvent = true;
      setScreenReader(value);
    });
    void AccessibilityInfo.isScreenReaderEnabled().then(value => {
      if (active && !receivedEvent) setScreenReader(value);
    }).catch(() => { if (active) setScreenReader(false); });
    return () => { active = false; subscription.remove(); };
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!eligible || visible || shownThisSession) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        let lastShown = 0;
        try { lastShown = Number(await AsyncStorage.getItem(HISTORY_KEY)) || 0; } catch { return; }
        if (cancelled || shownThisSession || Date.now() - lastShown < cooldownMs) return;
        shownThisSession = true;
        remainingMs.current = displayMs;
        setVisible(true);
        void AsyncStorage.setItem(HISTORY_KEY, String(Date.now())).catch(() => {});
      })();
    }, delayMs);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [eligible, visible, cooldownMs, delayMs, displayMs]);

  useEffect(() => {
    // Count only foreground Home viewing time; keep link actions available to screen-reader users.
    if (!visible || !focused || !foreground || showcaseVisible || playerUI === "expanded" || screenReader !== false) return;
    const started = Date.now();
    const timer = setTimeout(dismiss, remainingMs.current);
    return () => {
      clearTimeout(timer);
      remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - started));
    };
  }, [visible, focused, foreground, showcaseVisible, playerUI, screenReader, dismiss]);

  return { visible: visible && enabled, dismiss };
}
