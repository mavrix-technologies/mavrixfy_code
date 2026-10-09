import type { SleepTimerSelection,SleepTimerState } from "@/types/playbackTypes";
import { showGlobalToast } from "@/utils/globalToast";
import { useCallback,useEffect,useRef,useState } from "react";
import { formatSleepTimerDuration, isValidSleepTimerDuration } from "./sleepTimerDuration";

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

  useEffect(() => clearSleepTimerTimeout, [clearSleepTimerTimeout]);

  const clearSleepTimer = useCallback(() => {
    clearSleepTimerTimeout();
    sleepTimerRef.current = null;
    setSleepTimerState(null);
  }, [clearSleepTimerTimeout]);

  const setSleepTimer = useCallback(
    (selection: SleepTimerSelection) => {
      if (selection !== "end-of-stack" && !isValidSleepTimerDuration(selection)) return;
      clearSleepTimerTimeout();

      if (selection === "end-of-stack") {
        const nextTimer: SleepTimerState = {
          mode: "end-of-stack",
          label: "End of queue",
          endsAt: null,
        };
        sleepTimerRef.current = nextTimer;
        setSleepTimerState(nextTimer);
        showGlobalToast("Sleep timer set for end of queue");
        return;
      }

      const minutes = selection;
      const endsAt = Date.now() + minutes * 60 * 1000;
      const nextTimer: SleepTimerState = {
        mode: "duration",
        label: formatSleepTimerDuration(minutes),
        endsAt,
      };
      sleepTimerRef.current = nextTimer;
      setSleepTimerState(nextTimer);
      showGlobalToast(`Sleep timer set for ${nextTimer.label}`);

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
