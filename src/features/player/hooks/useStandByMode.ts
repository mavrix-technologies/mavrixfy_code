import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { triggerImpact } from "@/lib/haptics";
import { useAppIsActive } from "@/lib/appActivity";
import * as Haptics from "expo-haptics";
import { IS_WEB } from "@/constants/platform";
import { setStandByOrientation } from "./standByOrientation";
import { useWindowDimensions } from "react-native";

// Retain the historical key so existing true/false preferences migrate in place.
const STORAGE_KEY_STANDBY_STYLE = "@mavrixfy_standby_night_mode";
const INACTIVITY_DIM_TIMEOUT_MS = 5000;
let styleWriteQueue = Promise.resolve();

export type StandByStyle = "classic" | "night" | "ambient";

export interface UseStandByModeOptions {
  isPlayerExpanded: boolean;
  viewport?: { width: number; height: number };
}

export function useStandByMode({ isPlayerExpanded, viewport }: UseStandByModeOptions) {
  const foreground = useAppIsActive();
  const [enabled, setEnabled] = useState(false);
  const [exiting, setExiting] = useState(false);
  const dimensions = useWindowDimensions();
  const { width, height } = viewport ?? dimensions;
  // Only the explicit player button enters StandBy. Window changes affect
  // layout, never activation, so rotation cannot hide/recreate the controls.
  if (!isPlayerExpanded && enabled) setEnabled(false);
  const isStandByActive = enabled && isPlayerExpanded && foreground;
  const enterStandBy = useCallback(() => {
    if (isPlayerExpanded) { setExiting(false); setEnabled(true); }
  }, [isPlayerExpanded]);
  const exitStandBy = useCallback(() => setExiting(true), []);

  const [standByStyle, setStandByStyle] = useState<StandByStyle>("classic");
  const dimmingEnabled = isStandByActive && standByStyle !== "ambient";
  const [controlState, setControlState] = useState({ active: dimmingEnabled, dimmed: false });

  // Reset before painting a new mode so re-entry never shows stale dimming.
  if (controlState.active !== dimmingEnabled) {
    setControlState({ active: dimmingEnabled, dimmed: false });
  }

  const styleRef = useRef<StandByStyle>("classic");
  const preferenceRevisionRef = useRef(0);
  const dimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimRevisionRef = useRef(0);
  const dimmingActiveRef = useRef(false);

  // Load saved style, including the previous boolean night-mode preference.
  useEffect(() => {
    let mounted = true;
    const revision = preferenceRevisionRef.current;
    // Wait for a previous player's pending save before restoring its preference.
    void styleWriteQueue.then(() => AsyncStorage.getItem(STORAGE_KEY_STANDBY_STYLE))
      .then((value) => {
        if (!mounted || revision !== preferenceRevisionRef.current) return;
        const savedStyle = value === "ambient" ? "ambient" : value === "night" || value === "true" ? "night" : "classic";
        styleRef.current = savedStyle;
        setStandByStyle(savedStyle);
      }).catch(() => {
        // Preference persistence is best effort; controls still work offline.
      });
    return () => { mounted = false; };
  }, []);

  // Restore portrait when the player closes, backgrounds, or unmounts.
  useEffect(() => {
    if (IS_WEB) return;
    let current = true;
    void setStandByOrientation(isStandByActive && !exiting).then((applied) => {
      if (current && exiting && !applied) setEnabled(false);
    });
    return () => { current = false; };
  }, [isStandByActive, exiting]);
  // Reveal the portrait player only after its native window has resized.
  if (exiting && (IS_WEB || height >= width || !isStandByActive)) {
    setEnabled(false);
    setExiting(false);
  }
  useEffect(() => () => { if (!IS_WEB) void setStandByOrientation(false); }, []);

  const clearDimTimer = useCallback(() => {
    dimRevisionRef.current += 1;
    if (dimTimerRef.current !== null) clearTimeout(dimTimerRef.current);
    dimTimerRef.current = null;
  }, []);

  const scheduleDimTimer = useCallback(() => {
    clearDimTimer();
    if (!dimmingActiveRef.current) return;
    const revision = dimRevisionRef.current;
    dimTimerRef.current = setTimeout(() => {
      if (!dimmingActiveRef.current || revision !== dimRevisionRef.current) return;
      dimTimerRef.current = null;
      setControlState((previous) => ({ ...previous, dimmed: true }));
    }, INACTIVITY_DIM_TIMEOUT_MS);
  }, [clearDimTimer]);

  const handleTouch = useCallback(() => {
    if (!dimmingActiveRef.current) return;
    setControlState((previous) => previous.dimmed ? { ...previous, dimmed: false } : previous);
    scheduleDimTimer();
  }, [scheduleDimTimer]);

  useEffect(() => {
    dimmingActiveRef.current = dimmingEnabled;
    if (dimmingEnabled) {
      scheduleDimTimer();
    } else {
      clearDimTimer();
    }

    return () => {
      dimmingActiveRef.current = false;
      clearDimTimer();
    };
  }, [dimmingEnabled, scheduleDimTimer, clearDimTimer]);

  const selectStyle = useCallback((next: StandByStyle) => {
    if (next === styleRef.current) return;
    if (!IS_WEB) {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    styleRef.current = next;
    preferenceRevisionRef.current += 1;
    setStandByStyle(next);
    // Keep persistence out of React's state updater and serialize rapid toggles.
    styleWriteQueue = styleWriteQueue
      .then(() => AsyncStorage.setItem(STORAGE_KEY_STANDBY_STYLE, next))
      .catch(() => {});
  }, []);

  return {
    isStandByActive,
    enterStandBy,
    exitStandBy,
    standByStyle,
    controlsDimmed: dimmingEnabled && controlState.dimmed,
    handleTouch,
    selectStyle,
  };
}
