import type { SleepTimerSelection,SleepTimerState } from "@/types/playbackTypes";
import { showGlobalToast } from "@/utils/globalToast";
import { useCallback,useEffect,useRef,useState } from "react";
import { formatSleepTimerDuration, isValidSleepTimerDuration } from "./sleepTimerDuration";

interface UseAudioSleepTimerOptions {
  onTimerExpire: () => void;
  onEndOfQueueChange?: (enabled: boolean) => void;
}

export function useAudioSleepTimer({ onTimerExpire, onEndOfQueueChange }: UseAudioSleepTimerOptions) {
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerState | null>(null);
  const sleepTimerRef = useRef<SleepTimerState | null>(null);
  const sleepTimerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndOfQueueChangeRef = useRef(onEndOfQueueChange);

  useEffect(() => {
    onEndOfQueueChangeRef.current = onEndOfQueueChange;
  }, [onEndOfQueueChange]);

  useEffect(() => {
    sleepTimerRef.current = sleepTimer;
  }, [sleepTimer]);

  const clearSleepTimerTimeout = useCallback(() => {
    if (sleepTimerTimeoutRef.current) {
      clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearSleepTimerTimeout();
    onEndOfQueueChangeRef.current?.(false);
  }, [clearSleepTimerTimeout]);

  const clearSleepTimer = useCallback(() => {
    clearSleepTimerTimeout();
    onEndOfQueueChangeRef.current?.(false);
    sleepTimerRef.current = null;
    setSleepTimerState(null);
  }, [clearSleepTimerTimeout]);

  const setSleepTimer = useCallback(
    (selection: SleepTimerSelection) => {
      if (selection !== "end-of-stack" && !isValidSleepTimerDuration(selection)) return;
      clearSleepTimerTimeout();

      if (selection === "end-of-stack") {
        onEndOfQueueChangeRef.current?.(true);
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
      onEndOfQueueChangeRef.current?.(false);
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
