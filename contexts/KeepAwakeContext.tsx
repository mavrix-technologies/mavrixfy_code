/**
 * Keep-awake + fake screen-off context.
 *
 * Persists keepAwake + sleepMs to AsyncStorage so settings survive app restarts.
 * Saves only when a value actually changes — not on every render.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Brightness from "expo-brightness";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SleepTimerMs = null | 60_000 | 300_000 | 600_000;

const STORAGE_KEY_KEEP_AWAKE = "@mavrixfy_keep_awake";
const STORAGE_KEY_SLEEP_MS   = "@mavrixfy_sleep_ms";

interface KeepAwakeContextValue {
  keepAwake: boolean;
  sleepMs: SleepTimerMs;
  remainingMs: number | null;
  isDimmed: boolean;
  setKeepAwake: (on: boolean) => void;
  setSleepTimer: (ms: SleepTimerMs) => void;
  wakeUp: () => void;
  registerActivity: () => void;
}

const KeepAwakeContext = createContext<KeepAwakeContextValue | null>(null);

export function KeepAwakeProvider({ children }: { children: React.ReactNode }) {
  const [keepAwake, setKeepAwakeState] = useState(false);
  const [sleepMs, setSleepMsState] = useState<SleepTimerMs>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [isDimmed, setIsDimmed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const originalBrightnessRef = useRef<number | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef  = useRef(0);
  const durationRef   = useRef(0);
  const keepAwakeRef  = useRef(false);
  const isDimmedRef   = useRef(false);

  // Track previous persisted values so we only write on actual changes
  const savedKeepAwakeRef = useRef<boolean | null>(null);
  const savedSleepMsRef   = useRef<SleepTimerMs | undefined>(undefined);

  keepAwakeRef.current = keepAwake;
  isDimmedRef.current = isDimmed;

  // ── Load from storage on mount ─────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY_KEEP_AWAKE, STORAGE_KEY_SLEEP_MS])
      .then(([[, ka], [, sm]]) => {
        const restoredKeepAwake = ka === "true";
        const restoredSleepMs   = sm !== null ? (Number(sm) as SleepTimerMs) : null;

        savedKeepAwakeRef.current = restoredKeepAwake;
        savedSleepMsRef.current   = restoredSleepMs;

        setKeepAwakeState(restoredKeepAwake);
        setSleepMsState(restoredSleepMs);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  // ── Persist keepAwake — only when value changes after hydration ────────────
  useEffect(() => {
    if (!hydrated) return;
    if (savedKeepAwakeRef.current === keepAwake) return; // no change
    savedKeepAwakeRef.current = keepAwake;
    AsyncStorage.setItem(STORAGE_KEY_KEEP_AWAKE, String(keepAwake)).catch(() => {});
  }, [keepAwake, hydrated]);

  // ── Persist sleepMs — only when value changes after hydration ─────────────
  useEffect(() => {
    if (!hydrated) return;
    if (savedSleepMsRef.current === sleepMs) return; // no change
    savedSleepMsRef.current = sleepMs;
    if (sleepMs === null) {
      AsyncStorage.removeItem(STORAGE_KEY_SLEEP_MS).catch(() => {});
    } else {
      AsyncStorage.setItem(STORAGE_KEY_SLEEP_MS, String(sleepMs)).catch(() => {});
    }
  }, [sleepMs, hydrated]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    if (sleepTimerRef.current) { clearTimeout(sleepTimerRef.current); sleepTimerRef.current = null; }
    if (countdownRef.current)  { clearInterval(countdownRef.current);  countdownRef.current  = null; }
    setRemainingMs(null);
  }, []);

  const restoreBrightness = useCallback(async () => {
    if (originalBrightnessRef.current !== null) {
      try { await Brightness.setBrightnessAsync(originalBrightnessRef.current); } catch {}
      originalBrightnessRef.current = null;
    }
    setIsDimmed(false);
  }, []);

  const dimScreen = useCallback(async () => {
    try {
      if (originalBrightnessRef.current === null) {
        originalBrightnessRef.current = await Brightness.getBrightnessAsync();
      }
      await Brightness.setBrightnessAsync(0);
      setIsDimmed(true);
    } catch {}
  }, []);

  const startSleepCountdown = useCallback((ms: number) => {
    if (ms <= 0) return;
    clearTimers();
    startedAtRef.current = Date.now();
    setRemainingMs(ms);
    sleepTimerRef.current = setTimeout(() => { void dimScreen(); }, ms);
    // Reduced countdown update frequency from 1000ms to 5000ms to save battery
    countdownRef.current  = setInterval(() => {
      const left = Math.max(0, ms - (Date.now() - startedAtRef.current));
      setRemainingMs(left);
    }, 5000); // Update every 5 seconds instead of every second
  }, [clearTimers, dimScreen]);

  // ── Wake up on user interaction ────────────────────────────────────────────

  const wakeUp = useCallback(() => {
    if (!keepAwakeRef.current) return;
    if (originalBrightnessRef.current !== null || isDimmedRef.current) {
      void restoreBrightness();
    }
    const ms = durationRef.current;
    if (ms > 0) startSleepCountdown(ms);
  }, [restoreBrightness, startSleepCountdown]);

  const registerActivity = useCallback(() => {
    if (!keepAwakeRef.current) return;
    if (originalBrightnessRef.current !== null || isDimmedRef.current) {
      void restoreBrightness();
    }
    const ms = durationRef.current;
    if (ms > 0) startSleepCountdown(ms);
  }, [restoreBrightness, startSleepCountdown]);

  // ── Restore brightness when app comes back to foreground ──────────────────

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active" && keepAwakeRef.current) {
        void restoreBrightness();
      }
    });
    return () => sub.remove();
  }, [restoreBrightness]);

  // ── Keep-awake toggle ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!hydrated) return;
    if (keepAwake) {
      void activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
      clearTimers();
      void restoreBrightness();
      // Clear sleep timer selection when keep-awake is turned off
      setSleepMsState(null);
    }
  }, [keepAwake, hydrated, clearTimers, restoreBrightness]);

  // ── Sleep timer ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hydrated) return;
    clearTimers();
    if (sleepMs === null || !keepAwake) return;

    durationRef.current  = sleepMs;
    startSleepCountdown(sleepMs);

    return clearTimers;
  }, [sleepMs, keepAwake, hydrated, clearTimers, startSleepCountdown]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      deactivateKeepAwake();
      clearTimers();
      if (originalBrightnessRef.current !== null) {
        void Brightness.setBrightnessAsync(originalBrightnessRef.current).catch(() => {});
      }
    };
  }, [clearTimers]);

  const setKeepAwake  = useCallback((on: boolean) => setKeepAwakeState(on), []);
  const setSleepTimer = useCallback((ms: SleepTimerMs) => setSleepMsState(ms), []);

  return (
    <KeepAwakeContext.Provider
      value={{ keepAwake, sleepMs, remainingMs, isDimmed, setKeepAwake, setSleepTimer, wakeUp, registerActivity }}
    >
      {children}
    </KeepAwakeContext.Provider>
  );
}

export function useKeepAwake(): KeepAwakeContextValue {
  const ctx = useContext(KeepAwakeContext);
  if (!ctx) throw new Error("useKeepAwake must be used within KeepAwakeProvider");
  return ctx;
}
