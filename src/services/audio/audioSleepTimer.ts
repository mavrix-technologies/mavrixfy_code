import { useState, useRef, useCallback, useEffect } from "react";
import type { SleepTimerSelection, SleepTimerState } from "@/types/playbackTypes";
import { showGlobalToast } from "@/utils/globalToast";

interface UseAudioSleepTimerOptions {
  onTimerExpire: () => void;
}

export function useAudioSleepTimer({ onTimerExpire }: UseAudioSleepTimerOptions) {
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerState | null>(null);
  const sleepTimerRef = useRef<SleepTimerState | null>(null);
  const sleepTimerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sleepTimerRef.current = sleepTimer;
  }, [sleepTimer]);

  const clearSleepTimerTimeout = useCallback(() => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
  }, []);

  const clearSleepTimer = useCallback(() => {
    clearSleepTimerTimeout();
    sleepTimerRef.current = null;
    setSleepTimerState(null);
  }, [clearSleepTimerTimeout]);

  const setSleepTimer = useCallback(
    (selection: SleepTimerSelection) => {
      clearSleepTimerTimeout();

      if (selection === "end-of-stack") {
        const nextTimer: SleepTimerState = {
          mode: "end-of-stack",
          label: "End of stack",
          endsAt: null,
        };
        sleepTimerRef.current = nextTimer;
        setSleepTimerState(nextTimer);
        showGlobalToast("Sleep timer set for end of stack");
        return;
      }

      const minutes = selection;
      const endsAt = Date.now() + minutes * 60 * 1000;
      const nextTimer: SleepTimerState = {
        mode: "duration",
        label: minutes === 60 ? "1 hour" : `${minutes} min`,
        endsAt,
      };
      sleepTimerRef.current = nextTimer;
      setSleepTimerState(nextTimer);
      showGlobalToast(`Sleep timer set for ${minutes} min`);

      sleepTimerTimeoutRef.current = setTimeout(() => {
        onTimerExpire();
        clearSleepTimer();
        showGlobalToast("Sleep timer ended playback");
      }, minutes * 60 * 1000);
    },
    [clearSleepTimer, clearSleepTimerTimeout, onTimerExpire]
  );

  return {
    sleepTimer,
    sleepTimerRef,
    setSleepTimer,
    clearSleepTimer,
  };
}
